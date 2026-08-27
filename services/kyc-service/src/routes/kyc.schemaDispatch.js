const Joi = require("joi");
const mongoose = require("mongoose");
const ApiError = require("@pink/shared").ApiError;
const ExternalUser = require("../models/externalUser.model");
const User = require("../models/user.model");
const SchemaFormDispatch = require("../models/schemaFormDispatch.model");
const Module = require("../models/module.model");
const {
  createDispatchesForRecipients,
  afterApprovalStepNotify,
  afterFullyApprovedNotify,
  afterRejectedNotify,
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
      const managerOid = new mongoose.Types.ObjectId(managerId);
      const baseOids = await buildApprovalChain(req.tenantId, managerId);
      const allOids = [managerOid, ...baseOids];
      const users = await User.find({ _id: { $in: allOids } })
        .select("name email empCode")
        .lean();
      const byId = new Map(users.map((u) => [String(u._id), u]));
      const chain = allOids.map((id) => byId.get(String(id))).filter(Boolean);
      res.status(200).json({
        description: "Chain from selected manager (manager first, then upward).",
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
        return {
          ...row,
          moduleName: modNameById.get(String(row.moduleId)) || "—",
          canApprove,
          publicPath: row.token ? dispatchPublicPath(row.token) : "",
          publicUrl: row.token ? dispatchPublicUrl(row.token) : "",
        };
      });

      res.status(200).json(out);
    } catch (err) {
      next(err);
    }
  });

  router.post("/form-dispatches/:dispatchId/approve", async (req, res, next) => {
    try {
      const schema = Joi.object({
        action: Joi.string().valid("APPROVE", "REJECT").required(),
      });
      const { error, value } = schema.validate(req.body, { abortEarly: false });
      if (error) throw new ApiError(422, "Validation failed", error.details);

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
        dispatch.status = "REJECTED";
        await dispatch.save();
        await pushDispatchEvent(dispatch._id, "REJECTED", `Rejected at approver step ${idx + 1}.`);
        await afterRejectedNotify({ dispatch, moduleName, actorUserId: req.auth.userId });
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
}

module.exports = {
  registerSchemaDispatchRoutes,
  toApiModule,
};