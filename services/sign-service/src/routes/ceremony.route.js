const express = require("express");
const { rateLimit } = require("express-rate-limit");
const ApiError = require("@pink/shared").ApiError;
const Envelope = require("../models/envelope.model");
const { appendEvent } = require("../services/eventLog");
const { assertTransition, currentSigner, rollupStatus, isTerminal } = require("../services/statusMachine");
const { hashToken, decryptToken } = require("../services/ceremonyToken");
const { signSchema, declineSchema, SAFE_DATA_URL_RE } = require("../validators/envelope.validator");

const router = express.Router();

// Public, token-gated endpoints: blunt per-IP throttle against token guessing.
router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many attempts — try again later." },
  }),
);

const CONSENT_TEXT =
  "I agree to conduct this transaction electronically, to receive the signed record electronically, " +
  "and that my electronic signature has the same legal effect as a handwritten signature.";

function validate(schema, body) {
  const { error, value } = schema.validate(body, { abortEarly: false });
  if (error) throw new ApiError(422, "Validation failed", error.details);
  return value;
}

function recipientActor(recipient, req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return {
    kind: "RECIPIENT",
    userId: null,
    recipientId: recipient._id,
    email: recipient.email,
    ip: fwd || req.ip || "",
    ua: String(req.headers["user-agent"] || "").slice(0, 300),
  };
}

/**
 * Resolve a raw ceremony token to { envelope, recipient } with every terminal
 * condition translated into a human 410. Returns null only for malformed or
 * unknown tokens (→ 404).
 */
async function resolveCeremony(rawToken) {
  if (typeof rawToken !== "string" || rawToken.length < 20 || rawToken.length > 200) return null;
  const tokenHash = hashToken(rawToken);
  const envelope = await Envelope.findOne({ "recipients.tokenHash": tokenHash }).select(
    "+recipients.tokenHash +recipients.tokenEnc",
  );
  if (!envelope) return null;
  const recipient = envelope.recipients.find((r) => String(r.tokenHash) === tokenHash);
  if (!recipient) return null;

  if (recipient.role === "CC") throw new ApiError(403, "This link is not a signing link.");
  if (envelope.status === "VOIDED") {
    throw new ApiError(410, "This agreement was withdrawn by the sender.");
  }
  if (envelope.status === "DECLINED") {
    throw new ApiError(410, "This agreement was declined and is no longer open for signing.");
  }
  if (envelope.status === "COMPLETED") {
    throw new ApiError(410, "This agreement is already complete.");
  }
  if (envelope.status === "EXPIRED") {
    throw new ApiError(410, "This signing link has expired.");
  }
  if (recipient.tokenExpiresAt && recipient.tokenExpiresAt.getTime() < Date.now()) {
    throw new ApiError(410, "This signing link has expired.");
  }
  if (recipient.status === "DECLINED") {
    throw new ApiError(410, "You declined this agreement.");
  }
  // Defense in depth: ciphertext must decrypt to the presented token.
  if (decryptToken(recipient.tokenEnc) !== rawToken) {
    throw new ApiError(410, "This signing link is no longer valid.");
  }
  return { envelope, recipient };
}

/** True while this recipient may still act (respects SEQUENTIAL order). */
function canSign(envelope, recipient) {
  if (isTerminal(envelope.status)) return false;
  if (!["SENT", "PARTIALLY_SIGNED"].includes(envelope.status)) return false;
  if (recipient.status === "SIGNED" || recipient.status === "DECLINED") return false;
  if (envelope.signingOrder !== "SEQUENTIAL") return true;
  const cur = currentSigner(envelope);
  return !cur || String(cur._id) === String(recipient._id);
}

// --- Ceremony: load --------------------------------------------------------

router.get("/:token", async (req, res, next) => {
  try {
    const resolved = await resolveCeremony(req.params.token);
    if (!resolved) throw new ApiError(404, "This signing link is not valid.");
    const { envelope, recipient } = resolved;

    // First open transitions PENDING/SENT → VIEWED (once) with an audit event.
    if (recipient.status === "PENDING" || recipient.status === "SENT") {
      recipient.status = "VIEWED";
      recipient.lastViewedAt = new Date();
      await envelope.save();
      await appendEvent(envelope, {
        type: "VIEWED",
        actor: recipientActor(recipient, req),
        data: { order: recipient.order },
      });
    }

    const signable = canSign(envelope, recipient);
    const cur = currentSigner(envelope);
    return res.json({
      envelopeId: envelope._id,
      title: envelope.title,
      status: envelope.status,
      signingOrder: envelope.signingOrder,
      expiresAt: envelope.expiresAt,
      consentText: CONSENT_TEXT,
      documents: envelope.documents.map((d) => ({
        _id: d._id,
        name: d.name,
        sourceUrl: d.sourceUrl,
        pages: d.pages,
      })),
      recipient: {
        _id: recipient._id,
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        order: recipient.order,
        status: recipient.status,
        signedAt: recipient.signedAt,
      },
      fields: envelope.fields
        .filter((f) => String(f.recipientId) === String(recipient._id))
        .map((f) => ({
          _id: f._id,
          documentId: f.documentId,
          type: f.type,
          label: f.label,
          page: f.page,
          x: f.x,
          y: f.y,
          w: f.w,
          h: f.h,
          required: f.required,
          value: f.value,
        })),
      canSign: signable,
      alreadySigned: recipient.status === "SIGNED",
      waitingOn: envelope.signingOrder === "SEQUENTIAL" && cur && !signable ? cur.name : null,
    });
  } catch (error) {
    return next(error);
  }
});

// --- Ceremony: sign --------------------------------------------------------

router.post("/:token", async (req, res, next) => {
  try {
    const resolved = await resolveCeremony(req.params.token);
    if (!resolved) throw new ApiError(404, "This signing link is not valid.");
    const { envelope, recipient } = resolved;

    if (recipient.role === "CC") throw new ApiError(422, "This link cannot sign.");
    if (recipient.status === "SIGNED") throw new ApiError(409, "You have already signed this agreement.");
    if (!canSign(envelope, recipient)) {
      const cur = currentSigner(envelope);
      throw new ApiError(
        409,
        cur && String(cur._id) !== String(recipient._id)
          ? `${cur.name} signs first — your link activates after that.`
          : "This link is not active for signing right now.",
      );
    }

    const value = validate(signSchema, req.body);
    const { signature } = value;
    if (signature.mode === "UPLOAD" && !SAFE_DATA_URL_RE.test(signature.dataUrl || "")) {
      throw new ApiError(422, "Upload a PNG, JPG, GIF or WEBP signature image.");
    }
    if (signature.mode === "DRAW" && !signature.dataUrl && !(signature.points || []).length) {
      throw new ApiError(422, "Draw your signature before continuing.");
    }

    // Bind values to fields assigned to THIS recipient only.
    const ownFields = new Map(
      envelope.fields.filter((f) => String(f.recipientId) === String(recipient._id)).map((f) => [String(f._id), f]),
    );
    const applied = [];
    for (const v of value.values) {
      const field = ownFields.get(v.fieldId);
      if (!field) {
        throw new ApiError(422, "A submitted field is not assigned to you on this agreement.");
      }
      field.value = v.value;
      applied.push(v.fieldId);
    }
    // Required non-signature fields must be filled (signature comes from `signature`).
    for (const field of ownFields.values()) {
      if (!field.required) continue;
      if (!["TEXT", "DATE", "CHECKBOX"].includes(field.type)) continue;
      const filled = applied.includes(String(field._id)) || String(field.value || "").trim() !== "";
      if (!filled) {
        throw new ApiError(422, `The required field "${field.label || field.type}" is not filled.`);
      }
    }

    const now = new Date();
    recipient.status = "SIGNED";
    recipient.signedAt = now;
    recipient.signature = {
      mode: signature.mode,
      dataUrl: signature.dataUrl || "",
      points: signature.points || [],
      ip: recipientActor(recipient, req).ip,
      ua: recipientActor(recipient, req).ua,
      consentAt: now,
    };

    const nextStatus = rollupStatus(envelope);
    if (nextStatus !== envelope.status) {
      envelope.status = assertTransition(envelope.status, nextStatus);
      if (nextStatus === "COMPLETED") envelope.completedAt = now;
    }
    await envelope.save();

    // Audit: sizes only — the signature blob itself never enters the log.
    await appendEvent(envelope, {
      type: "SIGNED",
      actor: recipientActor(recipient, req),
      data: {
        mode: signature.mode,
        signatureChars: (signature.dataUrl || "").length,
        pointsCount: (signature.points || []).length,
        fieldsFilled: applied.length,
        consentAt: now.toISOString(),
      },
    });
    if (envelope.status === "COMPLETED") {
      await appendEvent(envelope, {
        type: "COMPLETED",
        actor: { kind: "SYSTEM", userId: null, email: "", ip: "", ua: "" },
        data: { signers: envelope.recipients.filter((r) => r.role !== "CC").length },
      });
    }

    return res.json({
      envelopeStatus: envelope.status,
      message:
        envelope.status === "COMPLETED"
          ? "Signed — the agreement is complete. A copy will be made available to all parties."
          : "Signed — this agreement is waiting on the remaining parties.",
    });
  } catch (error) {
    return next(error);
  }
});

// --- Ceremony: decline -----------------------------------------------------

router.post("/:token/decline", async (req, res, next) => {
  try {
    const resolved = await resolveCeremony(req.params.token);
    if (!resolved) throw new ApiError(404, "This signing link is not valid.");
    const { envelope, recipient } = resolved;

    if (recipient.role === "CC") throw new ApiError(422, "This link cannot decline.");
    if (recipient.status === "SIGNED") throw new ApiError(409, "You already signed this agreement.");
    if (recipient.status === "DECLINED") throw new ApiError(409, "You already declined this agreement.");

    const value = validate(declineSchema, req.body);
    const now = new Date();
    recipient.status = "DECLINED";
    recipient.declinedAt = now;
    recipient.declineReason = value.reason;

    envelope.status = assertTransition(envelope.status, "DECLINED");
    await envelope.save();

    await appendEvent(envelope, {
      type: "DECLINED",
      actor: recipientActor(recipient, req),
      data: { reason: value.reason },
    });

    return res.json({ envelopeStatus: envelope.status, message: "The agreement was declined." });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
