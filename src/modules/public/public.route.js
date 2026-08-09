const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Joi = require("joi");
const Form = require("../../models/form.model");
const PublicFormToken = require("../../models/publicFormToken.model");
const FormSubmission = require("../../models/formSubmission.model");
const KycRecord = require("../../models/kycRecord.model");
const ExternalUser = require("../../models/externalUser.model");
const User = require("../../models/user.model");
const Notification = require("../../models/notification.model");
const notificationAdapter = require("../notifications/notification.adapter");
const ApiError = require("../../common/errors/ApiError");
const env = require("../../config/env");
const { getUserIdsWithTenantManage } = require("../notifications/notifications.service");
const SchemaFormDispatch = require("../../models/schemaFormDispatch.model");
const Tenant = require("../../models/tenant.model");
const { toApiModule } = require("../kyc/kyc.schemaDispatch");
const PinkFormModule = require("../schema-forms/pinkForm/models/module");

const router = express.Router();

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function normalizeDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

/** India mobile: 10 digits, optional leading 0 or country code 91. */
function normalizeIndianMobile(raw) {
  let s = normalizeDigits(raw);
  if (s.length >= 12 && s.startsWith("91")) s = s.slice(-10);
  if (s.length === 11 && s.startsWith("0")) s = s.slice(1);
  return s;
}

router.get("/form/:token", async (req, res, next) => {
  try {
    const token = await PublicFormToken.findOne({ token: req.params.token, revokedAt: null });
    if (!token || token.expiresAt < new Date()) {
      throw new ApiError(404, "Token is invalid or expired");
    }
    const form = await Form.findById(token.formId);
    res.status(200).json({ form, tokenMeta: { expiresAt: token.expiresAt } });
  } catch (error) {
    next(error);
  }
});

router.post("/form/:token/submit", async (req, res, next) => {
  try {
    const token = await PublicFormToken.findOne({ token: req.params.token, revokedAt: null });
    if (!token || token.expiresAt < new Date()) {
      throw new ApiError(404, "Token is invalid or expired");
    }
    const submission = await FormSubmission.create({
      tenantId: token.tenantId,
      formId: token.formId,
      submittedBy: null,
      submitterType: "EXTERNAL",
      data: req.body || {},
      status: "PENDING",
      currentStep: 0,
    });
    token.usedAt = new Date();
    await token.save();
    res.status(201).json({ submissionId: submission._id, status: submission.status });
  } catch (error) {
    next(error);
  }
});

router.post("/kyc/verify", async (req, res, next) => {
  try {
    const baseSchema = Joi.object({
      kycId: Joi.string().required(),
      token: Joi.string().trim().min(1).required(),
      otpType: Joi.string().valid("AADHAAR", "PAN").required(),
      invitationCode: Joi.string().required(),
      otp: Joi.string().required(),
      fullName: Joi.string().allow("", null),
      aadhaarNumber: Joi.string().allow("", null),
      mobile: Joi.string().allow("", null),
      email: Joi.string().allow("", null),
      panNumber: Joi.string().allow("", null),
    });
    const { error: baseErr, value } = baseSchema.validate(req.body, { abortEarly: false });
    if (baseErr) throw new ApiError(422, "Validation failed", baseErr.details);

    const record = await KycRecord.findById(value.kycId);
    if (!record || record.refType !== "EXTERNAL_USER") {
      throw new ApiError(404, "KYC record not found");
    }

    const meta = record.providerResponseMeta || {};
    const otpType = value.otpType.toUpperCase();
    const normalizedToken = String(value.token || "").trim();
    const normalizedInvitationCode = String(value.invitationCode || "").trim().toUpperCase().replace(/[\s-]/g, "");
    const normalizedOtp = String(value.otp || "").trim().replace(/\s/g, "");
    const invitationHash = hashValue(normalizedInvitationCode);
    const otpHash = hashValue(normalizedOtp);
    const now = new Date();

    const otpSessions = meta.otpSessions || {};
    const otpSessionsHistory = meta.otpSessionsHistory || {};
    const historySessions = Array.isArray(otpSessionsHistory[otpType]) ? otpSessionsHistory[otpType] : [];
    const currentSession = otpSessions[otpType] || null;
    const typeCandidates = [...historySessions, ...(currentSession ? [currentSession] : [])];

    let pending =
      typeCandidates.find(
        (session) =>
          !session?.verifiedAt
          && new Date(session?.expiresAt) >= now
          && String(session?.verifyToken || "") === normalizedToken
          && session?.invitationCodeHash === invitationHash
          && session?.otpHash === otpHash,
      ) || null;

    // Backward compatibility ONLY for records that never got migrated to otpSessions.
    if (!pending && Object.keys(otpSessions).length === 0) {
      const pendingOtps = meta.pendingOtps || {};
      pending = pendingOtps[otpType] || null;
      if (!pending) {
        const pendingOtpsByToken = meta.pendingOtpsByToken || {};
        const tokenSession = pendingOtpsByToken[normalizedToken] || null;
        if (tokenSession?.otpType === otpType) {
          pending = tokenSession;
        }
      }
    }

    if (!pending && typeCandidates.length) {
      const tokenInvite = typeCandidates.find(
        (session) =>
          !session?.verifiedAt
          && new Date(session?.expiresAt) >= now
          && String(session?.verifyToken || "") === normalizedToken
          && session?.invitationCodeHash === invitationHash,
      );
      if (tokenInvite) throw new ApiError(400, "Invalid OTP");
      const invitationMatch = typeCandidates.find(
        (session) => !session?.verifiedAt && new Date(session?.expiresAt) >= now && session?.invitationCodeHash === invitationHash,
      );
      if (invitationMatch) throw new ApiError(400, "Invalid OTP");
      const otpMatch = typeCandidates.find(
        (session) => !session?.verifiedAt && new Date(session?.expiresAt) >= now && session?.otpHash === otpHash,
      );
      if (otpMatch) throw new ApiError(400, "Invalid invitation code or verification link. Use the latest email.");
    }

    if (!pending) {
      const detail = env.NODE_ENV !== "production" ? ` [debug: otpSessions=${Object.keys(otpSessions).join(",") || "none"}]` : "";
      throw new ApiError(400, `No pending ${otpType} verification. Please initiate again.${detail}`);
    }
    if (pending.verifiedAt) throw new ApiError(409, "OTP already used");
    if (new Date(pending.expiresAt) < now) throw new ApiError(400, "OTP expired. Please initiate again.");
    if (pending.invitationCodeHash !== invitationHash) throw new ApiError(400, "Invalid invitation code");
    if (pending.otpHash !== otpHash) throw new ApiError(400, "Invalid OTP");
    if (
      pending.verifyToken != null
      && String(pending.verifyToken) !== ""
      && String(pending.verifyToken) !== normalizedToken
    ) {
      throw new ApiError(400, "Invalid or expired verification link. Open the link from your email.");
    }

    const collected = { ...(meta.collectedDetails || {}) };
    if (collected[otpType]) {
      throw new ApiError(409, "This document was already verified and submitted.");
    }

    let identityPayload;
    if (otpType === "AADHAAR") {
      const aadhaarDigits = normalizeDigits(value.aadhaarNumber);
      const mobileDigits = normalizeIndianMobile(value.mobile);
      const v = Joi.object({
        fullName: Joi.string().trim().min(2).max(200).required(),
        aadhaarNumber: Joi.string().length(12).pattern(/^\d{12}$/).required(),
        mobile: Joi.string().length(10).pattern(/^[6-9]\d{9}$/).required(),
        email: Joi.string().email().required(),
      }).validate(
        {
          fullName: value.fullName,
          aadhaarNumber: aadhaarDigits,
          mobile: mobileDigits,
          email: value.email ? String(value.email).trim().toLowerCase() : "",
        },
        { abortEarly: false },
      );
      if (v.error) throw new ApiError(422, "Validation failed", v.error.details);
      identityPayload = {
        fullName: v.value.fullName,
        aadhaarNumber: v.value.aadhaarNumber,
        lastFourDigits: v.value.aadhaarNumber.slice(-4),
        mobile: v.value.mobile,
        email: v.value.email,
        submittedAt: new Date().toISOString(),
      };
    } else {
      const pan = String(value.panNumber || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      const v = Joi.object({
        panNumber: Joi.string()
          .length(10)
          .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
          .required(),
      }).validate({ panNumber: pan }, { abortEarly: false });
      if (v.error) throw new ApiError(422, "Validation failed", v.error.details);
      identityPayload = {
        panNumber: v.value.panNumber,
        submittedAt: new Date().toISOString(),
      };
    }

    const verifiedAt = new Date().toISOString();
    otpSessions[otpType] = {
      ...pending,
      verifiedAt,
    };
    if (historySessions.length) {
      otpSessionsHistory[otpType] = historySessions.map((session) =>
        session?.otpHash === pending.otpHash && session?.invitationCodeHash === pending.invitationCodeHash
          ? { ...session, verifiedAt }
          : session,
      );
    }
    if (otpType === "AADHAAR") {
      meta.aadhaarVerifiedAt = verifiedAt;
      record.aadhaarTokenHash = pending.otpHash;
    } else {
      meta.panVerifiedAt = verifiedAt;
      record.panTokenHash = pending.otpHash;
    }

    collected[otpType] = identityPayload;

    const bothVerified = Boolean(meta.aadhaarVerifiedAt) && Boolean(meta.panVerifiedAt);
    record.providerResponseMeta = {
      ...meta,
      otpSessions,
      otpSessionsHistory,
      collectedDetails: collected,
    };
    record.status = bothVerified ? "VERIFIED" : "PENDING";
    record.markModified("providerResponseMeta");
    await record.save();

    if (otpType === "AADHAAR" && identityPayload.fullName) {
      await ExternalUser.updateOne(
        { _id: record.refId, tenantId: record.tenantId },
        {
          $set: {
            name: identityPayload.fullName.trim(),
            email: identityPayload.email,
            phone: identityPayload.mobile,
          },
        },
      );
    }

    if (bothVerified) {
      await ExternalUser.updateOne({ _id: record.refId }, { $set: { status: "ACTIVE" } });
    }

    const extUser = await ExternalUser.findById(record.refId).select("name email createdByUserId");
    const adminSet = await getUserIdsWithTenantManage(record.tenantId);
    const notifyIds = new Set([...adminSet].map(String));
    if (extUser?.createdByUserId) notifyIds.add(String(extUser.createdByUserId));

    const oids = [...notifyIds].filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
    const recipients =
      oids.length > 0
        ? await User.find({
            tenantId: record.tenantId,
            _id: { $in: oids },
            status: "ACTIVE",
            email: { $nin: [null, ""] },
          }).select("_id email name")
        : [];

    const message = bothVerified
      ? `External user ${extUser?.name || record.refId} (${extUser?.email || "no-email"}) completed KYC (Aadhaar + PAN).`
      : `External user ${extUser?.name || record.refId} (${extUser?.email || "no-email"}) verified ${otpType}. Waiting for the other document.`;

    await Promise.all(
      recipients.map(async (u) => {
        try {
          await Notification.create({
            tenantId: record.tenantId,
            userId: u._id,
            channel: "IN_APP",
            message,
            eventType: "KYC_VERIFIED",
            status: "PENDING",
          });
          await notificationAdapter.sendEmail({
            to: u.email,
            subject: "KYC status update",
            html: `<p>${message}</p>`,
          });
          await Notification.updateMany(
            { tenantId: record.tenantId, userId: u._id, eventType: "KYC_VERIFIED", status: "PENDING" },
            { $set: { status: "SENT" } },
          );
        } catch {
          /* ignore per-recipient failures */
        }
      }),
    );

    res.status(200).json({
      kycId: record._id,
      otpType,
      status: record.status,
      aadhaarVerified: Boolean(meta.aadhaarVerifiedAt),
      panVerified: Boolean(meta.panVerifiedAt),
      needsDetailCapture: false,
      ok: true,
      message:
        bothVerified
          ? "KYC complete. You can close this page."
          : `${otpType} verified and details saved. Complete the other document when you receive that link.`,
    });
  } catch (error) {
    next(error);
  }
});

/** After OTP is verified, capture Aadhaar / PAN holder details (same session as email link `token`). */
router.post("/kyc/collect-identity", async (req, res, next) => {
  try {
    const baseSchema = Joi.object({
      kycId: Joi.string().required(),
      verifyToken: Joi.string().required(),
      otpType: Joi.string().valid("AADHAAR", "PAN").required(),
      details: Joi.object().required(),
    });
    const { error: baseErr, value } = baseSchema.validate(req.body, { abortEarly: false });
    if (baseErr) throw new ApiError(422, "Validation failed", baseErr.details);

    const otpType = value.otpType.toUpperCase();
    let details;
    if (otpType === "AADHAAR") {
      const d = Joi.object({
        fullName: Joi.string().trim().min(2).max(200).required(),
        lastFourDigits: Joi.string().length(4).pattern(/^\d{4}$/).required(),
      }).validate(value.details, { abortEarly: false });
      if (d.error) throw new ApiError(422, "Validation failed", d.error.details);
      details = d.value;
    } else {
      const pan = String(value.details.panNumber || "")
        .trim()
        .toUpperCase();
      const d = Joi.object({
        fullName: Joi.string().trim().max(200).allow("").optional(),
        panNumber: Joi.string()
          .length(10)
          .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
          .required(),
      }).validate({ ...value.details, panNumber: pan }, { abortEarly: false });
      if (d.error) throw new ApiError(422, "Validation failed", d.error.details);
      details = {
        panNumber: d.value.panNumber,
        ...(d.value.fullName ? { fullName: d.value.fullName.trim() } : {}),
      };
    }

    const record = await KycRecord.findById(value.kycId);
    if (!record || record.refType !== "EXTERNAL_USER") {
      throw new ApiError(404, "KYC record not found");
    }

    const meta = record.providerResponseMeta || {};
    const otpSessions = meta.otpSessions || {};
    const session = otpSessions[otpType];
    if (!session?.verifiedAt) {
      throw new ApiError(400, `${otpType} OTP must be verified before submitting details`);
    }
    if (String(session.verifyToken || "") !== String(value.verifyToken)) {
      throw new ApiError(403, "Invalid verification link token");
    }

    const collected = { ...(meta.collectedDetails || {}) };
    if (collected[otpType]) {
      throw new ApiError(409, "Details for this document were already submitted");
    }

    collected[otpType] = {
      ...details,
      submittedAt: new Date().toISOString(),
    };

    record.providerResponseMeta = {
      ...meta,
      otpSessions,
      otpSessionsHistory: meta.otpSessionsHistory || {},
      collectedDetails: collected,
    };
    record.markModified("providerResponseMeta");
    await record.save();

    if (details.fullName) {
      await ExternalUser.updateOne({ _id: record.refId, tenantId: record.tenantId }, { $set: { name: details.fullName.trim() } });
    }

    res.status(200).json({ ok: true, collectedFor: otpType });
  } catch (error) {
    next(error);
  }
});

/** Tokenized schema form link (KYC / level-1 dispatches to external users). */
router.get("/schema-dispatch/:token", async (req, res, next) => {
  try {
    const dispatch = await SchemaFormDispatch.findOne({ token: req.params.token }).lean();
    if (!dispatch) throw new ApiError(404, "Link not found or expired.");
    if (dispatch.status !== "SENT") {
      throw new ApiError(409, "This form was already submitted or is no longer available.");
    }
    const moduleDoc = await PinkFormModule.findById(dispatch.moduleId).lean();
    if (!moduleDoc || moduleDoc.moduleType !== "FORM") throw new ApiError(404, "Form not found.");
    const tenant = await Tenant.findById(dispatch.tenantId).select("name").lean();
    res.status(200).json({
      token: dispatch.token,
      moduleId: dispatch.moduleId,
      module: toApiModule(moduleDoc),
      tenantName: tenant?.name || "Organization",
      instructions: dispatch.instructions || "",
      dueDate: dispatch.dueDate || null,
      status: dispatch.status,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
