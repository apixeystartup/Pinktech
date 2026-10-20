const Joi = require("joi");
const mongoose = require("mongoose");
const ApiError = require("@pink/shared").ApiError;
const ExternalUser = require("../models/externalUser.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");
const SchemaFormDispatch = require("../models/schemaFormDispatch.model");
const Module = require("../models/module.model");
const {
  createDispatchesForRecipients,
  afterApprovalStepNotify,
  afterFullyApprovedNotify,
  afterRejectedNotify,
  regenerateDispatchLink,
  notifyRecipientRegeneratedLink,
  buildApprovalChain,
  pushDispatchEvent,
  dispatchPublicPath,
  dispatchPublicUrl,
} = require("../services/schemaFormDispatch.service");

function toApiModule(moduleDoc) {
  if (!moduleDoc) return moduleDoc;
  const plain = typeof moduleDoc.toObject === "function" ? moduleDoc.toObject() : moduleDoc;
  return {
    ...plain,
    schema: plain.formSchema,
  };
}

function canManageAllExternal(req) {
  const codes = req.auth?.permissionCodes || [];
  return codes.includes("*") || codes.includes("tenant.manage");
}

function assertCanAttachModuleScope(req) {
  const codes = req.auth?.permissionCodes || [];
  if (
    codes.includes("*") ||
    codes.includes("tenant.manage") ||
    codes.includes("form.view") ||
    codes.includes("kyc.manage") ||
    codes.includes("workflow.submit")
  ) {
    return;
  }
  throw new ApiError(403, "You need form or KYC access to attach a form to this tenant.");
}

function sortedKey(ids) {
  return [...ids].map(String).sort().join(",");
}

function isSameApproverSet(customIds, baseOids) {
  return sortedKey(customIds) === sortedKey(baseOids.map((id) => String(id)));
}

/**
 * @param {import("express").Router} router
 * @param {{ kycStaffStack: unknown[] }} opts
 */
function registerSchemaDispatchRoutes(router, { kycStaffStack }) {
  router.post("/schema-modules/scope", async (req, res, next) => {
    try {
      assertCanAttachModuleScope(req);
      const schema = Joi.object({
        moduleId: Joi.string().required(),
      });
      const { error, value } = schema.validate(req.body, { abortEarly: false });
      if (error) throw new ApiError(422, "Validation failed", error.details);

      const mod = await Module.findById(value.moduleId);
      if (!mod || mod.moduleType !== "FORM") throw new ApiError(404, "Form module not found");

      mod.tenantId = req.tenantId;
      mod.createdByUserId = req.auth.userId;
      await mod.save();
      res.status(200).json({ ok: true, moduleId: mod._id });
    } catch (err) {
      next(err);
    }
  });

  router.get("/schema-modules", async (req, res, next) => {
    try {
      /** Tenant-scoped forms plus unscoped (e.g. saved before scope ran) so superadmin / shared forms appear for every KYC operator. */
      const filter = {
        moduleType: "FORM",
        $or: [{ tenantId: req.tenantId }, { tenantId: null }],
      };
      const modules = await Module.find(filter).sort({ createdAt: -1 }).lean();
      res.status(200).json(modules.map(toApiModule));
    } catch (err) {
      next(err);
    }
  });

  router.get("/approval-chain-preview", async (req, res, next) => {
    try {
      const baseOids = await buildApprovalChain(req.tenantId, req.auth.userId);
      const users = await User.find({ _id: { $in: baseOids } })
        .select("name email empCode")
        .lean();
      const byId = new Map(users.map((u) => [String(u._id), u]));
      const defaultOrder = baseOids.map((id) => byId.get(String(id))).filter(Boolean);
      res.status(200).json({
        description: "Default order is immediate manager first, then up the reporting line (level 1 → n).",
        defaultOrder,
        reversedOrder: [...defaultOrder].reverse(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/approval-chain-preview/:managerId", async (req, res, next) => {
    try {
      const managerId = req.params.managerId;
      if (!mongoose.Types.ObjectId.isValid(managerId)) {
        throw new ApiError(422, "Invalid employee selected");
      }
      const managerOid = new mongoose.Types.ObjectId(managerId);
      const baseOids = await buildApprovalChain(req.tenantId, managerId);
      const allOids = [managerOid, ...baseOids];
      const users = await User.find({ _id: { $in: allOids } })
        .select("name email empCode designationOverride roleIds")
        .lean();
      const byId = new Map(users.map((u) => [String(u._id), u]));
      // Designation shown next to each name: the employee's own override,
      // otherwise the name of their first assigned role.
      const roleIds = [...new Set(users.flatMap((u) => (u.roleIds || []).map(String)))];
      const roles = roleIds.length
        ? await Role.find({ _id: { $in: roleIds } }).select("name").lean()
        : [];
      const roleNameById = new Map(roles.map((r) => [String(r._id), r.name]));
      const withDesignation = (u) =>
        u
          ? {
              ...u,
              designation:
                u.designationOverride || roleNameById.get(String((u.roleIds || [])[0])) || null,
            }
          : u;
      const chain = allOids.map((id) => withDesignation(byId.get(String(id)))).filter(Boolean);
      res.status(200).json({
        description: "Chain from selected employee (employee first, then upward).",
        chain,
        reversedChain: [...chain].reverse(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/form-dispatches", async (req, res, next) => {
    try {
      const schema = Joi.object({
        moduleId: Joi.string().required(),
        externalUserIds: Joi.array().items(Joi.string().hex().length(24)).min(1).required(),
        instructions: Joi.string().allow("").default(""),
        dueDate: Joi.string().allow("").optional(),
        approvalChainOrder: Joi.string().valid("DEFAULT", "REVERSE").default("DEFAULT"),
        approvalChainUserIds: Joi.array().items(Joi.string().hex().length(24)).max(50).optional(),
        appPublicOrigin: Joi.string().uri({ scheme: ["http", "https"] }).optional().allow(""),
      });
      const { error, value } = schema.validate(req.body, { abortEarly: false });
      if (error) throw new ApiError(422, "Validation failed", error.details);
      const dueRaw = value.dueDate ? String(value.dueDate).trim() : "";
      const dueDate = dueRaw ? new Date(dueRaw) : null;
      if (dueRaw && Number.isNaN(dueDate.getTime())) throw new ApiError(422, "Invalid due date");

      const mod = await Module.findById(value.moduleId);
      if (!mod || mod.moduleType !== "FORM") throw new ApiError(404, "Form module not found");
      if (!mod.tenantId) {
        mod.tenantId = req.tenantId;
        if (!mod.createdByUserId) mod.createdByUserId = req.auth.userId;
        await mod.save();
      }
      if (String(mod.tenantId) !== String(req.tenantId)) {
        throw new ApiError(403, "That form belongs to another tenant.");
      }

      const extOids = value.externalUserIds.map((id) => new mongoose.Types.ObjectId(id));
      const externals = await ExternalUser.find({ _id: { $in: extOids }, tenantId: req.tenantId }).lean();
      if (externals.length !== value.externalUserIds.length) {
        throw new ApiError(422, "One or more external users are invalid.");
      }
      for (const ext of externals) {
        if (!canManageAllExternal(req) && String(ext.createdByUserId) !== String(req.auth.userId)) {
          throw new ApiError(403, "You can only send forms to external users you created.");
        }
      }

      const baseChainOids = await buildApprovalChain(req.tenantId, req.auth.userId);
      let chainOids = [...baseChainOids];

      if (value.approvalChainUserIds?.length) {
        const custom = value.approvalChainUserIds;
        if (canManageAllExternal(req)) {
          const oids = custom.map((s) => new mongoose.Types.ObjectId(s));
          const n = await User.countDocuments({
            tenantId: req.tenantId,
            _id: { $in: oids },
            orgLeftAt: null,
            status: { $nin: ["DISABLED", "LOCKED"] },
          });
          if (n !== oids.length) {
            throw new ApiError(422, "One or more approvers are not active users in this tenant.");
          }
          chainOids = oids;
        } else {
          if (!isSameApproverSet(custom, baseChainOids)) {
            throw new ApiError(
              422,
              "Approver list must match your reporting chain (you may reorder steps only). Tenant admins may set a custom chain.",
            );
          }
          chainOids = custom.map((s) => new mongoose.Types.ObjectId(s));
        }
      } else if (value.approvalChainOrder === "REVERSE") {
        chainOids = [...chainOids].reverse();
      }

      const linkOrigin = value.appPublicOrigin ? String(value.appPublicOrigin).trim().replace(/\/$/, "") : "";

      const { dispatches } = await createDispatchesForRecipients({
        tenantId: req.tenantId,
        moduleId: mod._id,
        externals,
        dispatchedByUserId: req.auth.userId,
        instructions: value.instructions,
        dueDate,
        approvalChainUserIds: chainOids,
        linkOrigin: linkOrigin || undefined,
      });

      res.status(201).json(
        dispatches.map((d) => ({
          _id: d._id,
          token: d.token,
          publicPath: dispatchPublicPath(d.token),
          publicUrl: dispatchPublicUrl(d.token, linkOrigin || undefined),
          externalUserId: d.externalUserId,
          status: d.status,
          moduleId: d.moduleId,
        })),
      );
    } catch (err) {
      next(err);
    }
  });

  router.get("/form-dispatches", async (req, res, next) => {
    try {
      const codes = req.auth?.permissionCodes || [];
      const isAdmin = canManageAllExternal(req);
      const canTrackPipeline = isAdmin || codes.includes("workflow.submit");
      const uid = new mongoose.Types.ObjectId(req.auth.userId);
      const filter = { tenantId: req.tenantId };
      if (!canTrackPipeline) {
        filter.$or = [{ dispatchedByUserId: uid }, { approvalChainUserIds: uid }];
      }

      const rows = await SchemaFormDispatch.find(filter)
        .sort({ createdAt: -1 })
        .populate("externalUserId", "name email")
        .populate("dispatchedByUserId", "name email empCode")
        .lean();

      const modIds = [...new Set(rows.map((r) => String(r.moduleId)).filter(Boolean))];
      const mods = await Module.find({ _id: { $in: modIds } })
        .select("name")
        .lean();
      const modNameById = new Map(mods.map((m) => [String(m._id), m.name]));

      const out = rows.map((row) => {
        const chain = (row.approvalChainUserIds || []).map(String);
        const idx = row.currentApprovalIndex;
        const canApprove =
          row.status === "IN_APPROVAL" &&
          idx >= 0 &&
          idx < chain.length &&
          chain[idx] === String(req.auth.userId);
        const isOwner = String(row.dispatchedByUserId?._id || row.dispatchedByUserId) === String(req.auth.userId);
        const canRegenerate =
          (isAdmin || isOwner) && (row.status !== "SENT" || Boolean(row.pinkSubmissionId));
        return {
          ...row,
          moduleName: modNameById.get(String(row.moduleId)) || "—",
          canApprove,
          canRegenerate,
          revision: row.revision || 1,
          linkVersion: row.linkVersion || 1,
          rejection: row.rejection || null,
          publicPath: row.token ? dispatchPublicPath(row.token) : "",
          publicUrl: row.token ? dispatchPublicUrl(row.token) : "",
        };
      });

      res.status(200).json(out);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/form-dispatches/:dispatchId", async (req, res, next) => {
    try {
      if (!req.auth.isAdmin) {
        throw new ApiError(403, "Only a tenant admin or super admin may delete a workflow.");
      }
      if (!mongoose.isValidObjectId(req.params.dispatchId)) {
        throw new ApiError(404, "Workflow not found.");
      }

      const result = await SchemaFormDispatch.deleteOne({
        _id: req.params.dispatchId,
        tenantId: req.tenantId,
      });
      if (!result.deletedCount) throw new ApiError(404, "Workflow not found.");

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.post("/form-dispatches/:dispatchId/approve", async (req, res, next) => {
    try {
      const schema = Joi.object({
        action: Joi.string().valid("APPROVE", "REJECT").required(),
        reason: Joi.string().allow("").max(2000).optional(),
      });
      const { error, value } = schema.validate(req.body, { abortEarly: false });
      if (error) throw new ApiError(422, "Validation failed", error.details);
      const reason = String(value.reason || "").trim();
      if (value.action === "REJECT" && !reason) {
        throw new ApiError(422, "A rejection reason is required.");
      }

      const dispatch = await SchemaFormDispatch.findOne({
        _id: req.params.dispatchId,
        tenantId: req.tenantId,
      });
      if (!dispatch) throw new ApiError(404, "Dispatch not found");

      if (dispatch.status !== "IN_APPROVAL") {
        throw new ApiError(400, "This dispatch is not waiting for approval.");
      }

      const chain = (dispatch.approvalChainUserIds || []).map(String);
      const idx = dispatch.currentApprovalIndex;
      if (idx < 0 || idx >= chain.length || chain[idx] !== String(req.auth.userId)) {
        throw new ApiError(403, "You are not the current approver for this dispatch.");
      }

      const mod = await Module.findById(dispatch.moduleId).select("name").lean();
      const moduleName = mod?.name || "Form";

      if (value.action === "REJECT") {
        const at = new Date();
        const byUserId = new mongoose.Types.ObjectId(req.auth.userId);
        dispatch.status = "CORRECTION_REQUIRED";
        dispatch.rejection = { reason, byUserId, at, stepIndex: idx };
        dispatch.rejectionHistory.push({ revision: dispatch.revision || 1, reason, byUserId, at, stepIndex: idx });
        await dispatch.save();
        await pushDispatchEvent(
          dispatch._id,
          "CORRECTION_REQUIRED",
          `Correction requested at approver step ${idx + 1}. Reason: ${reason}`,
        );
        await afterRejectedNotify({ dispatch, moduleName, actorUserId: req.auth.userId, reason });
        res.status(200).json(dispatch);
        return;
      }

      const nextIdx = idx + 1;
      if (nextIdx >= chain.length) {
        dispatch.status = "APPROVED";
        dispatch.currentApprovalIndex = chain.length;
        await dispatch.save();
        await pushDispatchEvent(dispatch._id, "PIPELINE_COMPLETE", "All approvers signed off.");
        await afterFullyApprovedNotify({ dispatch, moduleName });
      } else {
        dispatch.currentApprovalIndex = nextIdx;
        await dispatch.save();
        await pushDispatchEvent(
          dispatch._id,
          "APPROVAL_ADVANCED",
          `Step ${idx + 1} approved; pending user ${chain[nextIdx]}.`,
        );
        await afterApprovalStepNotify({
          dispatch,
          moduleName,
          stepIndex: nextIdx,
          actorUserId: req.auth.userId,
        });
      }

      res.status(200).json(dispatch);
    } catch (err) {
      next(err);
    }
  });

  router.post("/form-dispatches/:dispatchId/regenerate-link", async (req, res, next) => {
    try {
      const schema = Joi.object({
        appPublicOrigin: Joi.string().uri({ scheme: ["http", "https"] }).optional().allow(""),
      });
      const { error, value } = schema.validate(req.body || {}, { abortEarly: false });
      if (error) throw new ApiError(422, "Validation failed", error.details);

      const dispatch = await SchemaFormDispatch.findOne({
        _id: req.params.dispatchId,
        tenantId: req.tenantId,
      });
      if (!dispatch) throw new ApiError(404, "Dispatch not found");

      const isOwner = String(dispatch.dispatchedByUserId) === String(req.auth.userId);
      if (!isOwner && !canManageAllExternal(req)) {
        throw new ApiError(403, "Only the employee who sent this form or a tenant admin may regenerate the link.");
      }
      // A fresh link only makes sense once the current one can no longer be
      // used. A live (SENT) link still works, so there is nothing to re-issue.
      // Any spent state — submitted, in approval, correction requested, or
      // already approved (e.g. the doctor submitted wrong data) — gets a new
      // token and a new revision; previous submissions stay in history.
      if (dispatch.status === "SENT" && !dispatch.pinkSubmissionId) {
        throw new ApiError(
          400,
          "The current link is still active — the doctor has not submitted yet.",
        );
      }

      const linkOrigin = value.appPublicOrigin ? String(value.appPublicOrigin).trim().replace(/\/$/, "") : "";
      const wasCorrection = dispatch.status === "CORRECTION_REQUIRED" || dispatch.status === "REJECTED";
      const { token, version, url } = await regenerateDispatchLink({
        dispatch,
        actorUserId: req.auth.userId,
        linkOrigin: linkOrigin || undefined,
      });

      const mod = await Module.findById(dispatch.moduleId).select("name").lean();
      await notifyRecipientRegeneratedLink({
        dispatch,
        moduleName: mod?.name || "Form",
        linkOrigin: linkOrigin || undefined,
        wasCorrection,
      });

      res.status(200).json({
        _id: dispatch._id,
        token,
        linkVersion: version,
        publicPath: dispatchPublicPath(token),
        publicUrl: url,
        status: dispatch.status,
        revision: dispatch.revision,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/form-dispatches/:dispatchId/history", async (req, res, next) => {
    try {
      const dispatch = await SchemaFormDispatch.findOne({
        _id: req.params.dispatchId,
        tenantId: req.tenantId,
      }).lean();
      if (!dispatch) throw new ApiError(404, "Dispatch not found");

      const isOwner = String(dispatch.dispatchedByUserId) === String(req.auth.userId);
      const inChain = (dispatch.approvalChainUserIds || []).map(String).includes(String(req.auth.userId));
      if (!isOwner && !inChain && !canManageAllExternal(req)) {
        throw new ApiError(403, "You are not permitted to view this dispatch history.");
      }

      res.status(200).json({
        _id: dispatch._id,
        status: dispatch.status,
        revision: dispatch.revision || 1,
        linkVersion: dispatch.linkVersion || 1,
        rejection: dispatch.rejection || null,
        rejectionHistory: dispatch.rejectionHistory || [],
        submissions: dispatch.submissions || [],
        linkHistory: dispatch.linkHistory || [],
        eventLog: dispatch.eventLog || [],
        approvalChainUserIds: dispatch.approvalChainUserIds || [],
        currentApprovalIndex: dispatch.currentApprovalIndex,
      });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  registerSchemaDispatchRoutes,
  toApiModule,
};