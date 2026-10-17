const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ApiError = require("@pink/shared").ApiError;
const { placeholderContext, notificationAdapter } = require("@pink/shared");
const EnvelopeTemplate = require("../models/envelopeTemplate.model");
const Envelope = require("../models/envelope.model");
const Tenant = require("../models/tenant.model");
const ExternalUser = require("../models/externalUser.model");
const upload = require("../middlewares/upload");
const { normalizeAgreementUpload, countPdfPages } = require("../services/documentConversion");
const { appendEvent } = require("../services/eventLog");
const { sendEnvelope } = require("../services/sendEnvelope");
const { toDto } = require("../services/envelopeDto");
const {
  createTemplateSchema,
  updateTemplateSchema,
  envelopeFromTemplateSchema,
  expectedFieldType,
} = require("../validators/signTemplate.validator");

const router = express.Router();

// Uploaded agreements land in repo-root/storage/sign (gitignored), resolved
// from this file so it holds regardless of the process cwd.
const SIGN_STORAGE_DIR = path.join(__dirname, "../../../../storage", "sign");

function denyUnlessAdmin(req, res, action) {
  if (req.auth?.isAdmin) return null;
  return res.status(403).json({ error: `Only administrators can ${action}.` });
}

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

async function loadTemplate(req, { doc = true } = {}) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, "Template not found");
  const found = await EnvelopeTemplate.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!found) throw new ApiError(404, "Template not found");
  return doc ? found : found.toObject();
}

/** Public shape: no disk paths — clients fetch bytes via /:id/document. */
function toTemplateDto(doc) {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const primary = plain.documents && plain.documents[0];
  return {
    _id: plain._id,
    name: plain.name,
    fields: plain.fields || [],
    fieldCount: (plain.fields || []).length,
    document: primary
      ? { _id: primary._id, name: primary.name, pages: primary.pages, sha256: primary.sha256 }
      : null,
    documentUrl: primary ? `/templates/${plain._id}/document` : "",
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

/** Reject any explicit type that contradicts the tag's interaction type. */
function assertFieldTypes(fields) {
  for (const f of fields) {
    const expected = expectedFieldType(f.tag);
    if (expected && f.type && f.type !== expected) {
      throw new ApiError(422, `A "${f.tag}" field must be of type ${expected}.`);
    }
  }
  return fields.map((f) => ({ ...f, type: f.type || expectedFieldType(f.tag) || "TEXT" }));
}

/**
 * Resolve one template tag against the assignment context:
 *   signature.tenant / stamp -> org-data images; everything else -> shared
 *   placeholder map (tenant.*, doctor.*, date); custom.* stays for the signer.
 */
function resolveFieldValue(tag, context, tenant) {
  const t = String(tag || "").toLowerCase();
  if (t === "signature.tenant") return tenant?.signature || "";
  if (t === "stamp") return tenant?.stamp || "";
  if (t === "tenant.custom") return "";
  if (t.startsWith("custom.")) return "";
  const v = context[t];
  return v === undefined || v === null ? "" : String(v);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// --- Template CRUD -----------------------------------------------------------

router.get("/", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "list signature templates");
    if (denied) return denied;
    const docs = await EnvelopeTemplate.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).lean();
    return res.json(docs.map(toTemplateDto));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "view signature templates");
    if (denied) return denied;
    const doc = await loadTemplate(req);
    return res.json(toTemplateDto(doc));
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "create signature templates");
    if (denied) return denied;
    const value = validate(createTemplateSchema, req.body);
    const fields = assertFieldTypes(value.fields);
    const doc = await EnvelopeTemplate.create({
      tenantId: req.tenantId,
      name: value.name,
      fields,
      createdByUserId: req.auth?.userId || null,
    });
    return res.status(201).json(toTemplateDto(doc));
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "edit signature templates");
    if (denied) return denied;
    const value = validate(updateTemplateSchema, req.body);
    const doc = await loadTemplate(req);
    if (value.name !== undefined) doc.name = value.name;
    if (value.fields !== undefined) doc.fields = assertFieldTypes(value.fields); // full replace
    await doc.save();
    return res.json(toTemplateDto(doc));
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "delete signature templates");
    if (denied) return denied;
    const doc = await loadTemplate(req);
    for (const d of doc.documents) {
      if (d.filePath) fs.promises.unlink(d.filePath).catch(() => {});
    }
    await doc.deleteOne();
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

// --- Agreement PDF upload / serve -------------------------------------------

function uploadPdf(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) return next(new ApiError(422, err.message || "Upload failed"));
    return next();
  });
}

router.post("/:id/document", uploadPdf, async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "upload agreements");
    if (denied) return denied;
    const doc = await loadTemplate(req);
    if (!req.file) throw new ApiError(422, "Attach the agreement file (form field \"file\").");
    const normalized = await normalizeAgreementUpload(req.file);
    const sha256 = crypto.createHash("sha256").update(normalized.buffer).digest("hex");
    fs.mkdirSync(SIGN_STORAGE_DIR, { recursive: true });
    const safeName = path.basename(normalized.originalName || "agreement.pdf").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    const filePath = path.join(SIGN_STORAGE_DIR, "template-" + doc._id + "-" + Date.now() + ".pdf");
    fs.writeFileSync(filePath, normalized.buffer);

    for (const old of doc.documents) {
      if (old.filePath) fs.promises.unlink(old.filePath).catch(() => {});
    }
    const pages = await countPdfPages(normalized.buffer);
    // One generated PDF per template for now — uploading replaces the previous document.
    doc.documents = [{ name: safeName, filePath, sha256, pages }];
    await doc.save();
    return res.json(toTemplateDto(doc));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/document", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "download agreements");
    if (denied) return denied;
    const doc = await loadTemplate(req);
    const stored = doc.documents && doc.documents[0];
    if (!stored?.filePath || !fs.existsSync(stored.filePath)) {
      throw new ApiError(404, "No agreement uploaded for this template yet.");
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${stored.name.replace(/"/g, "")}"`);
    return res.sendFile(path.resolve(stored.filePath));
  } catch (error) {
    return next(error);
  }
});

// --- Assign with doctor selection -> envelope --------------------------------

router.post("/:id/envelopes", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "send signature requests");
    if (denied) return denied;
    const value = validate(envelopeFromTemplateSchema, req.body);
    const template = await loadTemplate(req);

    const missingPartyOneText = (template.fields || []).find(
      (field) => field.tag === "tenant.custom" && !String(field.value || "").trim(),
    );
    if (missingPartyOneText) {
      throw new ApiError(
        422,
        `Enter the Party 1 text value for "${missingPartyOneText.label || missingPartyOneText.tag}" before sending.`,
      );
    }

    const stored = template.documents && template.documents[0];
    if (!stored?.filePath || !fs.existsSync(stored.filePath)) {
      throw new ApiError(422, "Upload the agreement PDF on this template first.");
    }
    const hasSignerField = (template.fields || []).some((f) => f.type === "SIGNATURE" || f.type === "INITIALS");
    if (!hasSignerField) {
      throw new ApiError(422, "Place at least one Party 2 signature field before sending.");
    }

    const [tenant, doctor] = await Promise.all([
      Tenant.findById(req.tenantId).lean(),
      ExternalUser.findOne({ _id: value.doctorId, tenantId: req.tenantId, type: "DOCTOR" }).lean(),
    ]);
    if (!doctor) throw new ApiError(404, "Doctor not found in this organization.");

    // Party 1 = org data, Party 2 = selected doctor — same shared placeholder
    // map the text-template assign flow uses.
    const context = placeholderContext({ doctor: doctor || {}, tenant: tenant || {} });
    if (!context.date) context.date = new Date().toISOString().slice(0, 10);

    const actor = requestActor(req);
    const doc = await Envelope.create({
      tenantId: req.tenantId,
      title: value.title || template.name,
      signingOrder: value.signingOrder,
      expiresAt: value.expiresAt,
      documents: (template.documents || []).map((d) => ({
        name: d.name,
        filePath: d.filePath,
        sha256: d.sha256,
        pages: d.pages,
      })),
      recipients: [
        {
          order: 0,
          name: doctor.name || "Signer",
          email: doctor.email || "",
          role: "SIGNER",
          auth: "EMAIL",
        },
      ],
      createdByUserId: req.auth?.userId || null,
    });

    const signer = doc.recipients.find((r) => r.role !== "CC");
    doc.fields = (template.fields || []).map((f) => ({
      tag: f.tag,
      type: f.type,
      label: f.label,
      documentId: null,
      page: f.page,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      required: f.required,
      recipientId: signer._id,
      value: f.tag === "tenant.custom" ? f.value || "" : resolveFieldValue(f.tag, context, tenant),
    }));
    await doc.save();

    await appendEvent(doc, {
      type: "CREATED",
      actor,
      data: {
        title: doc.title,
        source: "TEMPLATE",
        templateId: template._id,
        fields: doc.fields.length,
        doctor: doctor.name || "",
        doctorEmail: doctor.email || "",
      },
    });

    const { signingLinks } = await sendEnvelope(doc, { actor, expiresAt: value.expiresAt });

    // Zoho-style delivery: email the one-time link to the doctor when possible.
    let emailed = false;
    if (doctor.email) {
      const link = signingLinks[0]?.url || "";
      const orgName = tenant?.name || "Your organization";
      const result = await notificationAdapter.sendEmail({
        to: doctor.email,
        subject: `${orgName}: signature requested — ${doc.title}`,
        html:
          `<p>Hello ${escapeHtml(doctor.name)},</p>` +
          `<p><strong>${escapeHtml(orgName)}</strong> has sent you “<strong>${escapeHtml(doc.title)}</strong>” for your electronic signature.</p>` +
          `<p><a href="${escapeHtml(link)}"><strong>Review and sign</strong></a></p>` +
          `<p>This is a one-time secure link. It expires automatically.</p>`,
      });
      emailed = Boolean(result?.ok);
    }

    return res.status(201).json({ envelope: toDto(doc), signingLinks, emailed });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
