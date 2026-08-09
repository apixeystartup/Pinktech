const express = require("express");
const Joi = require("joi");
const crypto = require("crypto");
const mongoose = require("mongoose");
const KycRecord = require("../../models/kycRecord.model");
const User = require("../../models/user.model");
const ExternalUser = require("../../models/externalUser.model");
const Notification = require("../../models/notification.model");
const authMiddleware = require("../../middlewares/auth.middleware");
const tenantMiddleware = require("../../middlewares/tenant.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");
const notificationAdapter = require("../notifications/notification.adapter");
const ApiError = require("../../common/errors/ApiError");
const env = require("../../config/env");
const { writeAudit } = require("../../services/audit.service");
const kycLevel1CreatorMiddleware = require("../../middlewares/kycLevel1.middleware");
const { registerSchemaDispatchRoutes } = require("./kyc.schemaDispatch");

const router = express.Router();

/** KYC console: `kyc.create-user` (create external users) or `kyc.manage` (verify / OTP). */
const KYC_STAFF_PERMISSIONS = ["kyc.create-user", "kyc.manage"];

const kycStaffStack = [
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware(KYC_STAFF_PERMISSIONS),
  kycLevel1CreatorMiddleware(),
];

function canManageAllExternal(req) {
  return (req.auth?.permissionCodes || []).includes("tenant.manage");
}

function randomOtp() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

function randomInviteCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

/** Prefer the document that actually holds verifications / OTP sessions (not an empty duplicate row). */
function scoreKycRecord(rec) {
  const m = rec.providerResponseMeta || {};
  let s = 0;
  if (m.aadhaarVerifiedAt) s += 1_000_000;
  if (m.panVerifiedAt) s += 1_000_000;
  if (rec.status === "VERIFIED") s += 500_000;
  const os = m.otpSessions || {};
  s += Object.keys(os).length * 50_000;
  const now = new Date();
  for (const sess of Object.values(os)) {
    if (sess && !sess.verifiedAt && new Date(sess.expiresAt) >= now) s += 5_000;
  }
  s += (new Date(rec.updatedAt || rec.createdAt || 0).getTime() - 1_700_000_000_000) / 1e9;
  return s;
}

function pickBestKycRecord(records) {
  if (!records?.length) return null;
  if (records.length === 1) return records[0];
  return records.reduce((best, cur) => (scoreKycRecord(cur) > scoreKycRecord(best) ? cur : best));
}

function mergeProviderMetas(into, from) {
  const a = into && typeof into === "object" ? { ...into } : {};
  const b = from && typeof from === "object" ? from : {};
  const os = { ...(a.otpSessions || {}) };
  const fromOs = b.otpSessions || {};
  for (const [k, v] of Object.entries(fromOs)) {
    if (v == null) continue;
    const cur = os[k];
    if (!cur) {
      os[k] = v;
      continue;
    }
    if (cur.verifiedAt && !v.verifiedAt) continue;
    if (v.verifiedAt && !cur.verifiedAt) {
      os[k] = v;
      continue;
    }
    if (!cur.verifiedAt && !v.verifiedAt) {
      const curExp = new Date(cur.expiresAt || 0).getTime();
      const vExp = new Date(v.expiresAt || 0).getTime();
      os[k] = vExp >= curExp ? v : cur;
      continue;
    }
    if (cur.verifiedAt && v.verifiedAt) {
      os[k] = new Date(v.verifiedAt) > new Date(cur.verifiedAt) ? v : cur;
    }
  }
  const histA = a.otpSessionsHistory || {};
  const histB = b.otpSessionsHistory || {};
  const otpSessionsHistory = { ...histA };
  for (const key of Object.keys(histB)) {
    const merged = [...(Array.isArray(otpSessionsHistory[key]) ? otpSessionsHistory[key] : []), ...(Array.isArray(histB[key]) ? histB[key] : [])];
    otpSessionsHistory[key] = merged.slice(-10);
  }
  return {
    ...a,
    ...b,
    aadhaarVerifiedAt: a.aadhaarVerifiedAt || b.aadhaarVerifiedAt,
    panVerifiedAt: a.panVerifiedAt || b.panVerifiedAt,
    otpSessions: os,
    otpSessionsHistory,
  };
}

/**
 * Merges duplicate EXTERNAL_USER KYC rows (same refId) into the highest-scoring document and deletes the rest.
 * Fixes dashboard + PAN verify when a newer empty duplicate was created (e.g. race) while verify updated another row.
 */
async function consolidateExternalUserKycRecords(tenantId, refId) {
  const filter = { tenantId, refType: "EXTERNAL_USER", refId };
  const all = await KycRecord.find(filter).sort({ createdAt: 1 });
  if (all.length === 0) return null;
  if (all.length === 1) return all[0];
  const ranked = [...all].sort((a, b) => scoreKycRecord(b) - scoreKycRecord(a));
  const keeper = ranked[0];
  let merged = keeper.providerResponseMeta || {};
  for (const doc of ranked.slice(1)) {
    merged = mergeProviderMetas(merged, doc.providerResponseMeta || {});
    if (!keeper.aadhaarTokenHash && doc.aadhaarTokenHash) keeper.aadhaarTokenHash = doc.aadhaarTokenHash;
    if (!keeper.panTokenHash && doc.panTokenHash) keeper.panTokenHash = doc.panTokenHash;
  }
  keeper.providerResponseMeta = merged;
  const m = merged;
  keeper.status = m.aadhaarVerifiedAt && m.panVerifiedAt ? "VERIFIED" : "PENDING";
  keeper.markModified("providerResponseMeta");
  const deleteIds = ranked.slice(1).map((d) => d._id);
  await KycRecord.deleteMany({ _id: { $in: deleteIds } });
  await keeper.save();
  return KycRecord.findById(keeper._id);
}

async function notifyTenantUsers({ tenantId, actorUserId, eventType, subject, message }) {
  const recipients = await User.find({
    tenantId,
    status: "ACTIVE",
    email: { $nin: [null, ""] },
  }).select("_id email");
  if (!recipients.length) return;

  await Promise.all(
    recipients.map(async (user) => {
      await Notification.create({
        tenantId,
        userId: user._id,
        channel: "EMAIL",
        eventType,
        message,
        status: "PENDING",
      });
      await notificationAdapter.sendEmail({
        to: user.email,
        subject,
        html: message,
      });
      await Notification.updateMany(
        { tenantId, userId: user._id, eventType, status: "PENDING" },
        { $set: { status: "SENT" } },
      );
    }),
  );

  await writeAudit({
    tenantId,
    userId: actorUserId || null,
    action: "TENANT_NOTIFICATION_SENT",
    metadata: { eventType, recipients: recipients.length },
  });
}

router.post("/external-users", ...kycStaffStack, async (req, res, next) => {
  try {
    const schema = Joi.object({
      type: Joi.string().required(),
      name: Joi.string().required(),
      email: Joi.string().email().required(),
      phone: Joi.string().allow(null, "").default(null),
    });
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) throw new ApiError(422, "Validation failed", error.details);

    const externalUser = await ExternalUser.create({
      tenantId: req.tenantId,
      createdByUserId: req.auth.userId,
      type: value.type,
      name: value.name,
      email: value.email,
      phone: value.phone || null,
      status: "INACTIVE",
    });

    await writeAudit({
      tenantId: req.tenantId,
      userId: req.auth.userId,
      action: "EXTERNAL_USER_CREATED",
      metadata: { externalUserId: externalUser._id, email: externalUser.email },
    });

    const actor = await User.findById(req.auth.userId).select("empCode name email");
    const actorLabel = actor?.empCode || actor?.email || actor?.name || String(req.auth.userId);

    await notifyTenantUsers({
      tenantId: req.tenantId,
      actorUserId: req.auth.userId,
      eventType: "EXTERNAL_USER_CREATED",
      subject: "External user created",
      message: `User ${externalUser.name} (${externalUser.email}) was created by ${actorLabel}.`,
    });

    res.status(201).json(externalUser);
  } catch (error) {
    next(error);
  }
});

router.get("/external-users", ...kycStaffStack, async (req, res, next) => {
  try {
    const permissionCodes = req.auth?.permissionCodes || [];
    const canViewAll = permissionCodes.includes("tenant.manage");
    const filter = { tenantId: req.tenantId };
    if (!canViewAll) {
      filter.createdByUserId = req.auth.userId;
    }
    const users = await ExternalUser.find(filter).sort({ createdAt: -1 }).lean();
    const userIds = users.map((u) => u._id);
    const creatorIds = [...new Set(users.map((u) => String(u.createdByUserId)).filter(Boolean))];
    let records = await KycRecord.find({ tenantId: req.tenantId, refType: "EXTERNAL_USER", refId: { $in: userIds } }).lean();
    const creators = await User.find({ _id: { $in: creatorIds } }).select("_id empCode name email").lean();

    const groupByRef = (recs) => {
      const m = new Map();
      for (const record of recs) {
        const key = String(record.refId);
        if (!m.has(key)) m.set(key, []);
        m.get(key).push(record);
      }
      return m;
    };

    let recordsByRefId = groupByRef(records);
    const dupRefKeys = [...recordsByRefId.entries()].filter(([, list]) => list.length > 1).map(([k]) => k);
    if (dupRefKeys.length) {
      for (const refKey of dupRefKeys) {
        await consolidateExternalUserKycRecords(req.tenantId, refKey);
      }
      records = await KycRecord.find({ tenantId: req.tenantId, refType: "EXTERNAL_USER", refId: { $in: userIds } }).lean();
      recordsByRefId = groupByRef(records);
    }

    const creatorById = new Map(creators.map((c) => [String(c._id), c]));
    const recordByRefId = new Map();
    for (const [key, list] of recordsByRefId) {
      const best = pickBestKycRecord(list);
      if (best) recordByRefId.set(key, best);
    }

    const rows = users.map((u) => {
      const rec = recordByRefId.get(String(u._id));
      const creator = creatorById.get(String(u.createdByUserId));
      const creatorLabel = creator?.empCode || creator?.email || creator?.name || String(u.createdByUserId || "");
      const meta = rec?.providerResponseMeta || {};
      const aadhaarDone = Boolean(meta.aadhaarVerifiedAt);
      const panDone = Boolean(meta.panVerifiedAt);
      const kycStatus = aadhaarDone && panDone ? "COMPLETED" : "PENDING";
      const collected = meta.collectedDetails || {};
      return {
        ...u,
        createdByLabel: creatorLabel,
        kycId: rec?._id || null,
        aadhaarStatus: aadhaarDone ? "COMPLETED" : "PENDING",
        panStatus: panDone ? "COMPLETED" : "PENDING",
        kycStatus,
        collectedDetails: collected,
      };
    });

    res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
});

router.patch("/external-users/:externalUserId", ...kycStaffStack, async (req, res, next) => {
  try {
    const { externalUserId } = req.params;
    if (!mongoose.isValidObjectId(externalUserId)) {
      throw new ApiError(404, "External user not found");
    }
    const schema = Joi.object({
      name: Joi.string().trim().min(1),
      email: Joi.string().email(),
      phone: Joi.string().allow(null, ""),
    }).min(1);
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) throw new ApiError(422, "Validation failed", error.details);

    const externalUser = await ExternalUser.findOne({ _id: externalUserId, tenantId: req.tenantId });
    if (!externalUser) {
      throw new ApiError(404, "External user not found");
    }
    if (!canManageAllExternal(req) && String(externalUser.createdByUserId) !== String(req.auth.userId)) {
      throw new ApiError(403, "You can only edit external users you created");
    }

    const set = {};
    if (value.name !== undefined) set.name = value.name.trim();
    if (value.email !== undefined) set.email = String(value.email).toLowerCase().trim();
    if (value.phone !== undefined) set.phone = value.phone || null;

    const updated = await ExternalUser.findOneAndUpdate(
      { _id: externalUserId, tenantId: req.tenantId },
      { $set: set },
      { new: true },
    ).lean();

    await writeAudit({
      tenantId: req.tenantId,
      userId: req.auth.userId,
      action: "EXTERNAL_USER_UPDATED",
      metadata: { externalUserId: String(externalUserId), fields: Object.keys(set) },
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete(
  "/external-users/:externalUserId",
  ...kycStaffStack,
  async (req, res, next) => {
    try {
      const { externalUserId } = req.params;
      if (!mongoose.isValidObjectId(externalUserId)) {
        throw new ApiError(404, "External user not found");
      }
      const externalUser = await ExternalUser.findOne({ _id: externalUserId, tenantId: req.tenantId });
      if (!externalUser) {
        throw new ApiError(404, "External user not found");
      }

      if (!canManageAllExternal(req) && String(externalUser.createdByUserId) !== String(req.auth.userId)) {
        throw new ApiError(403, "You can only delete external users you created");
      }

      await KycRecord.deleteMany({ tenantId: req.tenantId, refType: "EXTERNAL_USER", refId: externalUser._id });
      await ExternalUser.deleteOne({ _id: externalUser._id });

      await writeAudit({
        tenantId: req.tenantId,
        userId: req.auth.userId,
        action: "EXTERNAL_USER_DELETED",
        metadata: { externalUserId: String(externalUser._id), email: externalUser.email },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

router.post("/initiate", ...kycStaffStack, async (req, res, next) => {
  try {
    const schema = Joi.object({
      refType: Joi.string().valid("EXTERNAL_USER").required(),
      refId: Joi.string().required(),
      otpType: Joi.string().valid("AADHAAR", "PAN").required(),
      verifyBaseUrl: Joi.string().uri().required(),
    });
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) throw new ApiError(422, "Validation failed", error.details);

    const externalUser = await ExternalUser.findOne({ _id: value.refId, tenantId: req.tenantId });
    if (!externalUser) throw new ApiError(404, "External user not found in this tenant");
    if (!externalUser.email) throw new ApiError(400, "External user email is required for OTP flow");
    if (!canManageAllExternal(req) && String(externalUser.createdByUserId) !== String(req.auth.userId)) {
      throw new ApiError(403, "You can only initiate KYC for external users you created");
    }

    let record = await consolidateExternalUserKycRecords(req.tenantId, value.refId);
    if (!record) {
      try {
        record = await KycRecord.create({
          tenantId: req.tenantId,
          refType: "EXTERNAL_USER",
          refId: value.refId,
          status: "PENDING",
          providerResponseMeta: {},
        });
      } catch (err) {
        if (err.code !== 11000) throw err;
        record = await consolidateExternalUserKycRecords(req.tenantId, value.refId);
        if (!record) throw err;
      }
    }

    const metaCheck = record.providerResponseMeta || {};
    const alreadyKycActive = record.status === "VERIFIED" || (metaCheck.aadhaarVerifiedAt && metaCheck.panVerifiedAt);
    if (alreadyKycActive) {
      throw new ApiError(409, "User already active");
    }

    const otpType = value.otpType.toUpperCase();

    const providerRef = crypto.randomBytes(8).toString("hex");
    const otp = randomOtp();
    const invitationCode = randomInviteCode();
    const verifyToken = crypto.randomBytes(24).toString("hex");
    // Keep OTP usable for realistic email delays.
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const providerMeta = record.providerResponseMeta || {};
    const otpSessions = providerMeta.otpSessions || {};
    const otpSessionsHistory = providerMeta.otpSessionsHistory || {};
    otpSessions[otpType] = {
      providerRef,
      verifyToken,
      otpHash: hashValue(otp),
      invitationCodeHash: hashValue(invitationCode),
      expiresAt: expiresAt.toISOString(),
      verifiedAt: null,
      identityHash: null,
    };
    const existingHistory = Array.isArray(otpSessionsHistory[otpType]) ? otpSessionsHistory[otpType] : [];
    otpSessionsHistory[otpType] = [...existingHistory, otpSessions[otpType]].slice(-5);

    record.providerResponseMeta = {
      ...providerMeta,
      otpSessions,
      otpSessionsHistory,
      aadhaarVerifiedAt: providerMeta.aadhaarVerifiedAt || null,
      panVerifiedAt: providerMeta.panVerifiedAt || null,
    };
    record.status = "PENDING";
    record.markModified("providerResponseMeta");
    await record.save();

    const link = `${value.verifyBaseUrl}?token=${encodeURIComponent(verifyToken)}&type=${otpType}&kycId=${record._id}`;
    await notificationAdapter.sendEmail({
      to: externalUser.email,
      subject: `${otpType} verification OTP`,
      html: `<p>OTP Type: ${otpType}</p><p>OTP: <strong>${otp}</strong></p><p>Invitation code: <strong>${invitationCode}</strong></p><p>Verify here: <a href="${link}">${link}</a></p>`,
    });

    await writeAudit({
      tenantId: req.tenantId,
      userId: req.auth.userId,
      action: "KYC_OTP_INITIATED",
      metadata: { kycId: record._id, externalUserId: value.refId, otpType },
    });

    const actor = await User.findById(req.auth.userId).select("empCode name email");
    const actorLabel = actor?.empCode || actor?.email || actor?.name || String(req.auth.userId);

    await notifyTenantUsers({
      tenantId: req.tenantId,
      actorUserId: req.auth.userId,
      eventType: "KYC_OTP_INITIATED",
      subject: `KYC ${otpType} OTP initiated`,
      message: `KYC ${otpType} OTP was initiated for external user ${externalUser.name} (${externalUser.email}) by ${actorLabel}.`,
    });

    const response = { kycId: record._id, providerRef, otpType, verifyLink: link };
    if (env.NODE_ENV !== "production") {
      response.debugOtp = otp;
      response.debugInvitationCode = invitationCode;
    }
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

registerSchemaDispatchRoutes(router, { kycStaffStack });

router.get("/:kycId/status", ...kycStaffStack, async (req, res, next) => {
  try {
    const record = await KycRecord.findOne({ _id: req.params.kycId, tenantId: req.tenantId });
    if (!record) throw new ApiError(404, "KYC record not found");
    if (record.refType === "EXTERNAL_USER") {
      const ext = await ExternalUser.findOne({ _id: record.refId, tenantId: req.tenantId }).select("createdByUserId");
      if (ext && !canManageAllExternal(req) && String(ext.createdByUserId) !== String(req.auth.userId)) {
        throw new ApiError(403, "You can only view KYC for external users you created");
      }
    }

    const meta = record.providerResponseMeta || {};
    const aadhaarVerified = Boolean(meta.aadhaarVerifiedAt);
    const panVerified = Boolean(meta.panVerifiedAt);
    const status = aadhaarVerified && panVerified ? "COMPLETED" : "PENDING";
    res.status(200).json({
      kycId: record._id,
      status,
      aadhaarVerified,
      panVerified,
      refId: record.refId,
      refType: record.refType,
      collectedDetails: meta.collectedDetails || {},
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
