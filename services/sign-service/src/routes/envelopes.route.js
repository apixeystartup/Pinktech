const express = require("express");
const mongoose = require("mongoose");
const ApiError = require("@pink/shared").ApiError;
const Envelope = require("../models/envelope.model");
const EnvelopeEvent = require("../models/envelopeEvent.model");
const { appendEvent } = require("../services/eventLog");
const { assertTransition, blockingRecipients } = require("../services/statusMachine");
const { sendEnvelope } = require("../services/sendEnvelope");
const { toDto } = require("../services/envelopeDto");
const {
  createEnvelopeSchema,
  addRecipientsSchema,
  setFieldsSchema,
  sendSchema,
  voidSchema,
} = require("../validators/envelope.validator");

const router = express.Router();

function denyUnlessAdmin(req, res, action) {
  if (req.auth?.isAdmin) return null;
  return res.status(403).json({ error: `Only administrators can ${action}.` });
}

/** Sender-side audit actor: ids from the gateway, ip/ua from the request. */
function requestActor(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return {
    kind: "SENDER",
    userId: req.auth?.userId || null,
    email: "",
    ip: fwd || req.ip || "",
    ua: String(req.headers["user-agent"] || "").slice(0, 300),
  };
}

function validate(schema, body) {
  const { error, value } = schema.validate(body, { abortEarly: false });
  if (error) throw new ApiError(422, "Validation failed", error.details);
  return value;
}

async function loadEnvelope(req, { doc = false } = {}) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, "Envelope not found");
  const query = Envelope.findOne({ _id: req.params.id, tenantId: req.tenantId });
  const found = doc ? await query : await query.lean();
  if (!found) throw new ApiError(404, "Envelope not found");
  return found;
}

// --- List / read -----------------------------------------------------------

router.get("/", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "list signing envelopes");
    if (denied) return denied;
    const docs = await Envelope.find({ tenantId: req.tenantId })
      .sort({ createdAt: -1 })
      .lean();
    return res.json(docs.map(toDto));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "view signing envelopes");
    if (denied) return denied;
    const doc = await loadEnvelope(req);
    return res.json(toDto(doc));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/events", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "view the audit trail");
    if (denied) return denied;
    const envelope = await loadEnvelope(req);
    const events = await EnvelopeEvent.find({ envelopeId: envelope._id })
      .sort({ seq: 1 })
      .lean();
    const head = events.length ? events[events.length - 1].hash : "";
    return res.json({ events, headHash: head });
  } catch (error) {
    return next(error);
  }
});

// --- Draft editing ---------------------------------------------------------

router.post("/", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "create signing envelopes");
    if (denied) return denied;
    const value = validate(createEnvelopeSchema, req.body);
    const recipients = value.recipients.map((r, i) => ({ ...r, order: r.order ?? i }));
    // Fields may be created together with the envelope; they must reference
    // recipients created above (index-matched ids are unknown pre-save, so
    // fields come back in a second call — see POST /:id/fields).
    const doc = await Envelope.create({
      tenantId: req.tenantId,
      title: value.title,
      signingOrder: value.signingOrder,
      expiresAt: value.expiresAt,
      documents: value.documents,
      recipients,
      createdByUserId: req.auth?.userId || null,
    });
    await appendEvent(doc, {
      type: "CREATED",
      actor: requestActor(req),
      data: {
        title: doc.title,
        recipients: doc.recipients.length,
        signers: blockingRecipients(doc).length,
        documents: doc.documents.length,
      },
    });
    return res.status(201).json(toDto(doc));
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/recipients", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "edit signing envelopes");
    if (denied) return denied;
    const value = validate(addRecipientsSchema, req.body);
    const doc = await loadEnvelope(req, { doc: true });
    if (doc.status !== "DRAFT") {
      throw new ApiError(422, "Recipients can only be edited while the envelope is a draft.");
    }
    let nextOrder = doc.recipients.reduce((max, r) => Math.max(max, r.order), -1) + 1;
    for (const r of value.recipients) {
      doc.recipients.push({ ...r, order: r.order ?? nextOrder });
      nextOrder += 1;
    }
    await doc.save();
    await appendEvent(doc, {
      type: "RECIPIENT_ADDED",
      actor: requestActor(req),
      data: {
        emails: value.recipients.map((r) => r.email),
        roles: value.recipients.map((r) => r.role),
      },
    });
    return res.json(toDto(doc));
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id/recipients/:rid", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "edit signing envelopes");
    if (denied) return denied;
    const doc = await loadEnvelope(req, { doc: true });
    if (doc.status !== "DRAFT") {
      throw new ApiError(422, "Recipients can only be edited while the envelope is a draft.");
    }
    const recipient = doc.recipients.id(req.params.rid);
    if (!recipient) throw new ApiError(404, "Recipient not found");
    const removedId = recipient._id;
    const removedEmail = recipient.email;
    recipient.deleteOne();
    // Fields assigned to the removed recipient go with it.
    doc.fields = doc.fields.filter((f) => String(f.recipientId) !== String(removedId));
    await doc.save();
    await appendEvent(doc, {
      type: "RECIPIENT_REMOVED",
      actor: requestActor(req),
      data: { email: removedEmail },
    });
    return res.json(toDto(doc));
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/fields", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "place signature fields");
    if (denied) return denied;
    const value = validate(setFieldsSchema, req.body);
    const doc = await loadEnvelope(req, { doc: true });
    if (doc.status !== "DRAFT") {
      throw new ApiError(422, "Fields can only be placed while the envelope is a draft.");
    }
    const recipientIds = new Set(doc.recipients.map((r) => String(r._id)));
    const documentIds = new Set(doc.documents.map((d) => String(d._id)));
    for (const f of value.fields) {
      if (!recipientIds.has(f.recipientId)) {
        throw new ApiError(422, "A field references a recipient that is not on this envelope.");
      }
      if (f.documentId && doc.documents.length && !documentIds.has(f.documentId)) {
        throw new ApiError(422, "A field references a document that is not on this envelope.");
      }
    }
    doc.fields = value.fields; // full replace keeps designer saves idempotent
    await doc.save();
    await appendEvent(doc, {
      type: "FIELDS_SET",
      actor: requestActor(req),
      data: { fields: value.fields.length },
    });
    return res.json(toDto(doc));
  } catch (error) {
    return next(error);
  }
});

// --- Send / void -----------------------------------------------------------

router.post("/:id/send", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "send signing requests");
    if (denied) return denied;
    const value = validate(sendSchema, req.body);
    const doc = await loadEnvelope(req, { doc: true });
    // Issue tokens, flip DRAFT -> SENT and append the SENT event.
    const { signingLinks } = await sendEnvelope(doc, {
      actor: requestActor(req),
      expiresAt: value.expiresAt,
    });

    // Raw links are returned exactly once — never persisted in plaintext and
    // never re-shown (re-emails re-derive them from tokenEnc internally).
    return res.json({ envelope: toDto(doc), signingLinks });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/void", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "withdraw signing requests");
    if (denied) return denied;
    const value = validate(voidSchema, req.body);
    const doc = await loadEnvelope(req, { doc: true });
    doc.status = assertTransition(doc.status, "VOIDED");
    doc.voidedAt = new Date();
    doc.voidReason = value.reason;
    await doc.save();
    await appendEvent(doc, {
      type: "VOIDED",
      actor: requestActor(req),
      data: { reason: value.reason },
    });
    return res.json(toDto(doc));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
