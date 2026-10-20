const express = require("express");
const Joi = require("joi");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ApiError = require("@pink/shared").ApiError;
const ExternalUser = require("../models/externalUser.model");
const KycRecord = require("../models/kycRecord.model");
const User = require("../models/user.model");
const Module = require("../models/module.model");
const SchemaFormDispatch = require("../models/schemaFormDispatch.model");
const Submission = require("../models/submission.model");
const { writeAudit } = require("../services/audit.service");
const { placeholderContext, collectPlaceholderIssues, resolvePlaceholders } = require("@pink/shared");
const { extractIdentity } = require("../services/idExtract.service");
const { dispatchPublicPath, createDispatchesForRecipients } = require("../services/schemaFormDispatch.service");

/**
 * Doctor Management API.
 *
 * A "doctor" is the existing ExternalUser record (the same collection the
 * dashboards already count as doctors) extended with a profile. Compliance is
 * NOT hardcoded here: it is derived from the schema-form Modules configured by
 * admins and dispatched to the doctor, so new form configurations show up with
 * no UI change. Assignment happens through POST /:doctorId/compliance (admins
 * only): no email is sent — the form link is handed to a chosen employee, who
 * copies it from GET /my-links and shares it with the doctor themselves.
 */
const router = express.Router();
const AGREEMENT_SNAPSHOT_DIR = path.resolve(__dirname, "../../../../storage/form-agreements");

function hasPermission(req, code) {
  const codes = req.auth?.permissionCodes || [];
  return codes.includes("*") || codes.includes(code);
}

function assertPermission(req, code) {
  if (!hasPermission(req, code)) throw new ApiError(403, `Missing permission: ${code}`);
}

/** Same rule the external-user routes use: `*` / tenant.manage sees the whole tenant. */
function canViewAll(req) {
  const codes = req.auth?.permissionCodes || [];
  return codes.includes("*") || codes.includes("tenant.manage");
}

function canEdit(req, doctor) {
  return canViewAll(req) || String(doctor.createdByUserId) === String(req.auth?.userId);
}

/**
 * Tags in the module agreements / instructions that will not resolve for this
 * doctor: profile fields that are empty, or tags no known field provides.
 * `filledTags` are custom blanks the template author already filled in — those
 * resolve at compose time, so they never warn.
 */
function dispatchWarnings(moduleDoc, instructions, doctor, tenant = null, templateBodyText = "", filledTags = []) {
  const settings = moduleDoc?.formSchema?.settings || {};
  const context = placeholderContext({ doctor: doctor || {}, tenant: tenant || {} });
  const { missing, unknown } = collectPlaceholderIssues(
    [settings.preAgreementText, settings.postAgreementText, settings.description, templateBodyText, instructions],
    context,
  );
  const filled = new Set(filledTags.map((t) => String(t).trim().toLowerCase()));
  const warnings = [
    ...missing.map((m) => `Dr. ${doctor?.name || "this doctor"} has no ${m.label.toLowerCase()} (${m.tag})`),
    ...unknown.filter((u) => !filled.has(u.tag.replace(/[{}]/g, "")))
      .map((u) => `Unsupported placeholder ${u.tag} — it will stay as-is on the link`),
  ];
  return warnings;
}

function escapeTemplateHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-text template body → simple HTML (blank lines break paragraphs). */
function templateBodyToHtml(text) {
  return String(text || "")
    .split(/\r?\n\s*\r?\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeTemplateHtml(para).replace(/\r?\n/g, "<br/>")}</p>`)
    .join("");
}

// Only embedded raster data URLs survive as <img src> — the tenant's saved
// Party 1 signature. Mirrors the forms-service PDF sanitizer.
const SAFE_IMG_SRC_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;

/** {{signature.tenant}} → the saved Party 1 signature image (or a note). */
function tenantSignatureHtml(tenant) {
  const src = String(tenant?.signature || "");
  if (SAFE_IMG_SRC_RE.test(src)) {
    return `<img class="signature" src="${escapeTemplateHtml(src)}" alt="Party 1 signature" />`;
  }
  // Span, not <p>: this lands inside the body's own <p> paragraphs.
  return `<span class="muted">Party 1 signature not set yet.</span>`;
}

/**
 * Compose a template agreement for one dispatch: the body with the doctor's
 * blanks and the author's filled custom fields resolved, plus Party 1's saved
 * signature at {{signature.tenant}}. Frozen onto the dispatch so later
 * template edits never rewrite an issued link.
 *
 * `side` is "opening" or "closing": every Party 2 signer marker
 * ({{signature.doctor}} / opening / closing) is normalised to this side's
 * {{signature.<side>}} so the recipient page and the PDF both split at the
 * author's chosen position.
 */
function composeTemplateAgreementHtml({ template, tenant, doctor, side = "opening" }) {
  const context = placeholderContext({ doctor: doctor || {}, tenant: tenant || {} });
  // Values the author filled via "Detect required fields" — resolved like any
  // other context key so the issued link carries them.
  for (const pair of template?.fieldValues || []) {
    const key = String(pair?.tag || "").trim().toLowerCase();
    if (key) context[key] = String(pair?.value ?? "");
  }
  const resolved = resolvePlaceholders(String(template?.bodyText || ""), context);
  const signerMarkerRe = /{{\s*signature\.(doctor|opening|closing)\s*}}/gi;
  const body = templateBodyToHtml(resolved)
    .replace(/{{\s*signature\.tenant\s*}}/gi, () => tenantSignatureHtml(tenant))
    .replace(signerMarkerRe, (match, tag) =>
      String(tag).toLowerCase() === side ? match : `{{signature.${side}}}`);
  return `<div class="templateAgreement">`
    + (body ? `<div class="templateBody">${body}</div>` : "")
    + `</div>`;
}

/**
 * Super admins and tenant admins only. Employees never create form definitions
 * and never assign them: an admin assigns a form to an employee, who then
 * copies the link and shares it with the doctor over their own channel.
 */
function assertAdmin(req, action = "assign compliance forms") {
  if (!req.auth?.isAdmin) throw new ApiError(403, `Only administrators can ${action}`);
}

function authOid(req) {
  return new mongoose.Types.ObjectId(String(req.auth?.userId));
}

const FormTemplate = require("../models/formTemplate.model");

/** Doctors this user may see besides the ones they created: those whose form link they hold. */
async function handledDoctorIds(tenantId, userId) {
  return SchemaFormDispatch.distinct("externalUserId", { tenantId, handlerUserId: userId });
}

function doctorCodeFor(id) {
  return `DOC-${String(id).slice(-6).toUpperCase()}`;
}

function ageFrom(dateOfBirth) {
  if (!dateOfBirth) return null;
  const d = new Date(dateOfBirth);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function normStr(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function toDoctorDto(doc) {
  const draft = Boolean(doc.draft);
  return {
    _id: doc._id,
    doctorCode: doc.doctorCode || doctorCodeFor(doc._id),
    name: doc.name,
    email: doc.email || null,
    phone: doc.phone || null,
    type: doc.type,
    specialization: doc.specialization || null,
    qualification: doc.qualification || null,
    yearsOfExperience: doc.yearsOfExperience ?? null,
    gender: doc.gender || null,
    dateOfBirth: doc.dateOfBirth || null,
    age: ageFrom(doc.dateOfBirth),
    medicalRegistrationNumber: doc.medicalRegistrationNumber || null,
    pan: doc.pan || null,
    aadhaar: doc.aadhaar || null,
    clinicHospitalName: doc.clinicHospitalName || null,
    address: doc.address || null,
    draft,
    accountStatus: doc.status,
    status: draft ? "DRAFT" : doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/* ------------------------------------------------------------------ *
 * Profile validation
 * ------------------------------------------------------------------ */

const PAN_RE = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/;
const AADHAAR_RE = /^[0-9]{12}$/;
const PHONE_RE = /^[0-9+\-\s()]{7,15}$/;

const profileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160),
  specialization: Joi.string().allow("", null),
  qualification: Joi.string().max(160).allow("", null),
  yearsOfExperience: Joi.number().integer().min(0).max(70).allow(null),
  gender: Joi.string().valid("Male", "Female", "Other").allow(null),
  dateOfBirth: Joi.date().allow(null),
  phone: Joi.string().pattern(PHONE_RE).allow("", null),
  email: Joi.string().email().allow("", null),
  medicalRegistrationNumber: Joi.string().allow("", null),
  pan: Joi.string().pattern(PAN_RE).allow("", null),
  aadhaar: Joi.string().pattern(AADHAAR_RE).allow("", null),
  clinicHospitalName: Joi.string().allow("", null),
  address: Joi.string().allow("", null),
  status: Joi.string().valid("ACTIVE", "INACTIVE"),
  draft: Joi.boolean(),
}).min(1);

/** A doctor marked as created (not a draft) must carry the core profile. */
function assertComplete(merged) {
  const missing = [];
  if (!normStr(merged.name)) missing.push("Full Name");
  if (!normStr(merged.specialization)) missing.push("Specialization");
  if (!merged.gender) missing.push("Gender");
  if (!normStr(merged.phone)) missing.push("Phone Number");
  if (!normStr(merged.email)) missing.push("Email");
  if (missing.length) {
    throw new ApiError(422, `Required to create a doctor: ${missing.join(", ")}.`, missing);
  }
}

function sanitizeProfile(value, previous = {}) {
  const out = {};
  if (value.name !== undefined) out.name = String(value.name).trim();
  if (value.specialization !== undefined) out.specialization = normStr(value.specialization);
  if (value.qualification !== undefined) out.qualification = normStr(value.qualification);
  if (value.yearsOfExperience !== undefined) out.yearsOfExperience = value.yearsOfExperience ?? null;
  if (value.gender !== undefined) out.gender = value.gender || null;
  if (value.dateOfBirth !== undefined) out.dateOfBirth = value.dateOfBirth || null;
  if (value.phone !== undefined) out.phone = normStr(value.phone);
  if (value.email !== undefined) out.email = value.email ? String(value.email).toLowerCase().trim() : null;
  if (value.medicalRegistrationNumber !== undefined) out.medicalRegistrationNumber = normStr(value.medicalRegistrationNumber);
  if (value.pan !== undefined) out.pan = value.pan ? String(value.pan).toUpperCase().trim() : null;
  if (value.aadhaar !== undefined) out.aadhaar = normStr(value.aadhaar);
  if (value.clinicHospitalName !== undefined) out.clinicHospitalName = normStr(value.clinicHospitalName);
  if (value.address !== undefined) out.address = normStr(value.address);
  if (value.status !== undefined) out.status = value.status;
  if (value.draft !== undefined) out.draft = Boolean(value.draft);
  return { ...previous, ...out };
}

/* ------------------------------------------------------------------ *
 * Compliance helpers (derived from dispatched schema-forms)
 * ------------------------------------------------------------------ */

const DISPATCH_STATUS = {
  SENT: { key: "PENDING_SUBMISSION", label: "Pending submission", tone: "pending" },
  IN_APPROVAL: { key: "IN_APPROVAL", label: "Awaiting approval", tone: "pending" },
  APPROVED: { key: "COMPLETED", label: "Completed", tone: "complete" },
  REJECTED: { key: "REJECTED", label: "Rejected", tone: "rejected" },
  CORRECTION_REQUIRED: { key: "CORRECTION_REQUIRED", label: "Correction required", tone: "pending" },
};

const COMPLETED = { key: "COMPLETED", label: "Completed", tone: "complete" };
const NOT_STARTED = { key: "NOT_STARTED", label: "Not started", tone: "pending" };
const NOT_REQUIRED = { key: "NOT_REQUIRED", label: "Not required", tone: "muted" };

function hasAnswer(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  return String(value).trim() !== "";
}

function progressOf(fields, data) {
  const total = fields.length;
  if (!total) {
    const answeredLoose = data && typeof data === "object" ? Object.keys(data).filter((k) => hasAnswer(data[k])).length : 0;
    return { answered: answeredLoose, total: answeredLoose, percent: answeredLoose ? 100 : 0 };
  }
  const answered = fields.filter((f) => hasAnswer(data?.[f.key])).length;
  return { answered, total, percent: Math.round((answered / total) * 100) };
}

function stepState(dispatch, stepIndex, submitted, chainLength) {
  if (!chainLength || stepIndex >= chainLength) return NOT_REQUIRED;
  if (!submitted) return NOT_STARTED;
  if (dispatch.status === "APPROVED") return COMPLETED;
  const idx = dispatch.currentApprovalIndex;
  if (dispatch.status === "CORRECTION_REQUIRED" || dispatch.status === "REJECTED") {
    if (stepIndex === idx) {
      return dispatch.status === "REJECTED"
        ? { key: "REJECTED", label: "Rejected", tone: "rejected" }
        : { key: "CORRECTION_REQUIRED", label: "Correction requested", tone: "rejected" };
    }
    return stepIndex < idx ? COMPLETED : NOT_STARTED;
  }
  if (stepIndex < idx) return COMPLETED;
  if (stepIndex === idx) return { key: "PENDING", label: "Awaiting approval", tone: "pending" };
  return NOT_STARTED;
}

function stepLabel(index, chainLength) {
  if (index === 0) return "Manager Approval";
  if (index === chainLength - 1) return "Head Office Approval";
  return `Approval Step ${index + 1}`;
}

function buildAgreement(dispatch, submission, lastEntry) {
  const agreements = submission?.agreements || {};
  const parts = ["pre", "post"].map((k) => agreements[k]).filter(Boolean);
  const signedParts = parts.filter((p) => p.accepted || Boolean(p.signatureDataUrl));
  const signedAt =
    signedParts.map((p) => p.acceptedAt).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
  const pdfPath = submission?.pdf?.downloadUrl || lastEntry?.pdfRelativeUrl || dispatch.pdfRelativeUrl || "";
  const signed = signedParts.length > 0;

  let documentStatus;
  if (!lastEntry) documentStatus = { key: "NOT_STARTED", label: "Not signed", tone: "pending" };
  else if (pdfPath) documentStatus = { key: "AVAILABLE", label: "Document available", tone: "complete" };
  else documentStatus = { key: "PENDING", label: "Document pending", tone: "pending" };

  return {
    signed,
    signedAt,
    signaturePresent: parts.some((p) => Boolean(p.signatureDataUrl)),
    documentStatus,
    pdfPath,
  };
}

async function loadCompliance(tenantId, doctor, authUserId) {
  const dispatches = await SchemaFormDispatch.find({ tenantId, externalUserId: doctor._id })
    .sort({ createdAt: -1 })
    .lean();

  const moduleIds = [...new Set(dispatches.map((d) => String(d.moduleId)).filter(Boolean))];
  const modules = moduleIds.length
    ? await Module.find({ _id: { $in: moduleIds } }).select("name moduleType formSchema").lean()
    : [];
  const modById = new Map(modules.map((m) => [String(m._id), m]));

  // Templates picked on the forms (names for the cards).
  const templateIds = [
    ...new Set(
      modules
        .flatMap((m) => [
          m?.formSchema?.settings?.templateId,
          m?.formSchema?.settings?.openingTemplateId,
          m?.formSchema?.settings?.closingTemplateId,
        ])
        .filter(Boolean)
        .map(String),
    ),
  ];
  const templates = templateIds.length
    ? await FormTemplate.find({ _id: { $in: templateIds }, tenantId }).select("name").lean()
    : [];
  const templateNameById = new Map(templates.map((t) => [String(t._id), t.name]));

  const submissionIds = [
    ...new Set(
      dispatches
        .flatMap((d) => [d.pinkSubmissionId, ...(d.submissions || []).map((s) => s.submissionId)])
        .filter(Boolean)
        .map(String),
    ),
  ];
  const submissions = submissionIds.length ? await Submission.find({ _id: { $in: submissionIds } }).lean() : [];
  const subById = new Map(submissions.map((s) => [String(s._id), s]));

  const chainIds = [
    ...new Set(
      dispatches.flatMap((d) => [
        ...(d.approvalChainUserIds || []).map(String),
        ...(d.handlerUserId ? [String(d.handlerUserId)] : []),
      ]),
    ),
  ];
  const users = chainIds.length ? await User.find({ _id: { $in: chainIds } }).select("name email empCode").lean() : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const nameOf = (id) => {
    const u = userById.get(String(id));
    return u?.name || u?.empCode || u?.email || null;
  };

  const forms = dispatches.map((dispatch) => {
    const chain = (dispatch.approvalChainUserIds || []).map(String);
    const entries = dispatch.submissions || [];
    const lastEntry = entries.length ? entries[entries.length - 1] : null;
    const submitted = Boolean(lastEntry) || Boolean(dispatch.pinkSubmissionId);
    const submission = dispatch.pinkSubmissionId ? subById.get(String(dispatch.pinkSubmissionId)) || null : null;
    const mod = modById.get(String(dispatch.moduleId)) || null;
    const fields = lastEntry?.formSnapshot?.fields || mod?.formSchema?.fields || [];
    const idx = dispatch.currentApprovalIndex;
    const status = DISPATCH_STATUS[dispatch.status] || {
      key: "PENDING",
      label: dispatch.status || "Pending",
      tone: "pending",
    };

    // The template the doctor fills: the module's own schema when it is
    // still attached to this tenant, otherwise the snapshot stored with the
    // doctor's submission. Fields are flattened to a read-only preview.
    const snapshotSchema = lastEntry?.formSnapshot || null;
    const template = {
      name: mod?.name || snapshotSchema?.name || "Form",
      description:
        mod?.formSchema?.settings?.description || snapshotSchema?.settings?.description || null,
      fields: fields.map((f) => ({
        key: f.key,
        label: f.label || f.key,
        type: f.type || "text",
        required: Boolean(f.required),
      })),
    };

    return {
      dispatchId: dispatch._id,
      moduleId: dispatch.moduleId,
      name: mod?.name || snapshotSchema?.name || "Form",
      moduleType: mod?.moduleType || snapshotSchema?.moduleType || "FORM",
      handlerName: dispatch.handlerUserId ? nameOf(dispatch.handlerUserId) : null,
      templateName:
        templateNameById.get(
          String(
            dispatch.openingTemplateId ||
              dispatch.templateId ||
              mod?.formSchema?.settings?.openingTemplateId ||
              mod?.formSchema?.settings?.templateId ||
              "",
          ),
        ) || null,
      delivery: dispatch.delivery || "EMAIL",
      status,
      assignedAt: dispatch.createdAt,
      dueDate: dispatch.dueDate || null,
      revision: dispatch.revision || 1,
      submissionReceived: Boolean(dispatch.pinkSubmissionId),
      submittedAt: lastEntry?.submittedAt || null,
      progress: progressOf(fields, submission?.data),
      agreement: buildAgreement(dispatch, submission, lastEntry),
      template,
      rejection:
        dispatch.status === "CORRECTION_REQUIRED" || dispatch.status === "REJECTED" ? dispatch.rejection || null : null,
      approvals: {
        chainLength: chain.length,
        steps: chain.map((uid, i) => ({
          index: i,
          // Role in the chain ("Manager Approval", "Approval Step 2", …)
          // is kept apart from the step's current state label.
          role: stepLabel(i, chain.length),
          approverName: nameOf(uid),
          ...stepState(dispatch, i, submitted, chain.length),
        })),
      },
      canApprove:
        dispatch.status === "IN_APPROVAL" &&
        idx >= 0 &&
        idx < chain.length &&
        chain[idx] === String(authUserId || ""),
      publicPath: dispatch.token ? dispatchPublicPath(dispatch.token) : "",
      pdfPath: submission?.pdf?.downloadUrl || dispatch.pdfRelativeUrl || "",
      source: "schema-dispatch",
    };
  });

  const total = forms.length;
  const completed = forms.filter((f) => f.status.key === "COMPLETED").length;
  const inProgress = forms.filter((f) => f.status.key === "IN_APPROVAL").length;
  const actionRequired = forms.filter(
    (f) => f.status.key === "REJECTED" || f.status.key === "CORRECTION_REQUIRED",
  ).length;
  const summary = {
    total,
    completed,
    inProgress,
    actionRequired,
    pending: total - completed - inProgress - actionRequired,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };

  // Worst-status-wins so one row stays meaningful across every assigned form.
  const rank = { REJECTED: 0, CORRECTION_REQUIRED: 0, PENDING: 1, NOT_STARTED: 2, COMPLETED: 3, NOT_REQUIRED: 4 };
  const aggregateStep = (isFinalStep) => {
    const active = forms.filter((f) => f.approvals.chainLength > 0);
    if (!active.length) {
      return {
        ...NOT_REQUIRED,
        approverName: null,
        formName: null,
        note: "No approval chain — forms complete automatically on submission.",
      };
    }
    const states = active.map((f) => ({
      step: f.approvals.steps[isFinalStep ? f.approvals.chainLength - 1 : 0],
      form: f,
    }));
    const worst = states.slice().sort((a, b) => (rank[a.step.key] ?? 2) - (rank[b.step.key] ?? 2))[0];
    const singleStep = active.every((f) => f.approvals.chainLength === 1);
    return {
      ...worst.step,
      approverName: worst.step.approverName,
      formName: worst.form.name,
      formsTracked: active.length,
      note: isFinalStep && singleStep ? "Single approver covers both steps." : null,
    };
  };

  const signedForms = forms
    .filter((f) => f.agreement.signed)
    .sort((a, b) => new Date(b.agreement.signedAt || 0) - new Date(a.agreement.signedAt || 0));
  const agreementRef = signedForms[0] || forms.find((f) => f.submittedAt) || forms[0];
  const agreement = agreementRef
    ? {
        ...agreementRef.agreement,
        formName: agreementRef.name,
        revision: agreementRef.revision,
        formsSigned: signedForms.length,
      }
    : {
        signed: false,
        signedAt: null,
        signaturePresent: false,
        documentStatus: { key: "NOT_STARTED", label: "Not signed", tone: "pending" },
        pdfPath: "",
        formName: null,
        revision: null,
        formsSigned: 0,
      };

  return {
    summary,
    forms,
    // Dynamic questionnaire results: one row per configured form.
    mcqSummary: forms.map((f) => ({
      formId: f.dispatchId,
      name: f.name,
      moduleType: f.moduleType,
      submittedAt: f.submittedAt,
      progress: f.progress,
      status: f.status,
    })),
    agreement,
    approvals: {
      manager: aggregateStep(false),
      headOffice: aggregateStep(true),
    },
  };
}

async function complianceSummaries(tenantId, doctorIds) {
  const map = new Map();
  doctorIds.forEach((id) =>
    map.set(String(id), { total: 0, completed: 0, inProgress: 0, actionRequired: 0, percent: 0 }),
  );
  if (!doctorIds.length) return map;
  const rows = await SchemaFormDispatch.find({ tenantId, externalUserId: { $in: doctorIds } })
    .select("externalUserId status")
    .lean();
  for (const row of rows) {
    const s = map.get(String(row.externalUserId));
    if (!s) continue;
    s.total += 1;
    if (row.status === "APPROVED") s.completed += 1;
    else if (row.status === "IN_APPROVAL") s.inProgress += 1;
    else if (row.status === "REJECTED" || row.status === "CORRECTION_REQUIRED") s.actionRequired += 1;
  }
  for (const s of map.values()) s.percent = s.total ? Math.round((s.completed / s.total) * 100) : 0;
  return map;
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

router.get("/", async (req, res, next) => {
  try {
    assertPermission(req, "doctor.view");

    const filter = { tenantId: req.tenantId };
    const conditions = [];

    // Employees see the doctors they created plus the doctors whose form link
    // was handed to them to share.
    if (!canViewAll(req)) {
      const mine = await handledDoctorIds(req.tenantId, authOid(req));
      conditions.push({ $or: [{ createdByUserId: req.auth.userId }, { _id: { $in: mine } }] });
    }

    const statusFilter = String(req.query.status || "").trim().toUpperCase();
    if (statusFilter) {
      if (statusFilter === "DRAFT") {
        filter.draft = true;
      } else if (statusFilter === "ACTIVE" || statusFilter === "INACTIVE") {
        filter.status = statusFilter;
        filter.draft = { $ne: true };
      } else {
        throw new ApiError(422, "Invalid status filter");
      }
    }

    const q = String(req.query.q || "").trim();
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      conditions.push({
        $or: [
          { name: rx },
          { email: rx },
          { phone: rx },
          { doctorCode: rx },
          { specialization: rx },
          { clinicHospitalName: rx },
          { medicalRegistrationNumber: rx },
        ],
      });
    }
    if (conditions.length) filter.$and = conditions;

    const doctors = await ExternalUser.find(filter).sort({ createdAt: -1 }).lean();
    const summaries = await complianceSummaries(
      req.tenantId,
      doctors.map((d) => d._id),
    );
    const creatorIds = [...new Set(doctors.map((d) => String(d.createdByUserId)).filter(Boolean))];
    const creators = creatorIds.length
      ? await User.find({ _id: { $in: creatorIds } }).select("name email empCode").lean()
      : [];
    const creatorById = new Map(creators.map((c) => [String(c._id), c]));

    res.status(200).json(
      doctors.map((d) => {
        const creator = creatorById.get(String(d.createdByUserId));
        return {
          ...toDoctorDto(d),
          createdByLabel: creator?.empCode || creator?.email || creator?.name || null,
          compliance: summaries.get(String(d._id)),
        };
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    assertPermission(req, "doctor.manage");

    const { error, value } = profileSchema.validate(req.body, { abortEarly: false });
    if (error) throw new ApiError(422, "Validation failed", error.details);
    if (!value.name) throw new ApiError(422, "Validation failed", ["Full Name is required"]);

    const draft = Boolean(value.draft);
    const profile = sanitizeProfile(value);
    if (!draft) assertComplete(profile);

    const doc = new ExternalUser({
      tenantId: req.tenantId,
      createdByUserId: req.auth.userId,
      type: "DOCTOR",
      ...profile,
      name: profile.name,
      status: profile.status || "ACTIVE",
      draft,
    });
    doc.doctorCode = doctorCodeFor(doc._id);
    await doc.save();

    await writeAudit({
      tenantId: req.tenantId,
      userId: req.auth.userId,
      action: "DOCTOR_CREATED",
      metadata: { doctorId: String(doc._id), doctorCode: doc.doctorCode, draft },
    });

    res.status(201).json(toDoctorDto(doc));
  } catch (error) {
    next(error);
  }
});

/**
 * Form links this employee has been handed to share with doctors.
 *
 * This replaces the email step: the employee copies the link here and sends it
 * over whatever channel they prefer. The doctor's submission status comes back
 * on the same row and on the doctor's own detail page.
 */
router.get("/my-links", async (req, res, next) => {
  try {
    const dispatches = await SchemaFormDispatch.find({
      tenantId: req.tenantId,
      handlerUserId: authOid(req),
    })
      .sort({ createdAt: -1 })
      .lean();

    const moduleIds = [...new Set(dispatches.map((d) => String(d.moduleId)))];
    const doctorIds = [...new Set(dispatches.map((d) => String(d.externalUserId)))];
    const [modules, doctors] = await Promise.all([
      moduleIds.length ? Module.find({ _id: { $in: moduleIds } }).select("name moduleType").lean() : [],
      doctorIds.length
        ? ExternalUser.find({ _id: { $in: doctorIds }, tenantId: req.tenantId })
            .select("name doctorCode email phone status draft")
            .lean()
        : [],
    ]);
    const modById = new Map(modules.map((m) => [String(m._id), m]));
    const docById = new Map(doctors.map((d) => [String(d._id), d]));

    res.status(200).json(
      dispatches.map((d) => {
        const doctor = docById.get(String(d.externalUserId));
        const lastEntry = (d.submissions || []).slice(-1)[0] || null;
        const chain = (d.approvalChainUserIds || []).map(String);
        const idx = d.currentApprovalIndex;
        return {
          dispatchId: d._id,
          publicPath: dispatchPublicPath(d.token),
          delivery: d.delivery || "EMAIL",
          instructions: d.instructions || "",
          dueDate: d.dueDate || null,
          assignedAt: d.createdAt,
          submittedAt: lastEntry?.submittedAt || null,
          status: DISPATCH_STATUS[d.status] || {
            key: "PENDING",
            label: d.status || "Pending",
            tone: "pending",
          },
          formId: d.moduleId,
          formName: modById.get(String(d.moduleId))?.name || "Form",
          doctorId: doctor?._id || d.externalUserId,
          doctorName: doctor?.name || "Recipient",
          doctorCode: doctor?.doctorCode || null,
          canApprove:
            d.status === "IN_APPROVAL" &&
            idx >= 0 &&
            idx < chain.length &&
            chain[idx] === String(req.auth?.userId || ""),
        };
      }),
    );
  } catch (error) {
    next(error);
  }
});

/** Employees an admin can hand a form link to. */
router.get("/handler-options", async (req, res, next) => {
  try {
    assertAdmin(req, "choose who shares a form link");
    const users = await User.find({ tenantId: req.tenantId, status: { $nin: ["DISABLED", "LOCKED"] } })
      .select("name email empCode status")
      .sort({ name: 1 })
      .lean();
    res.status(200).json(
      users.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        empCode: u.empCode || null,
        status: u.status,
      })),
    );
  } catch (error) {
    next(error);
  }
});

/**
 * Scan an uploaded PAN / Aadhaar file and return the identity fields found in
 * it (PAN, Aadhaar number, name, date of birth, gender). Images are read with
 * local OCR; PDFs use their embedded text layer. Any signed-in doctors-area
 * user may scan — the result only prefills the Add/Edit form, nothing is saved.
 */
router.post("/id-extract", async (req, res, next) => {
  try {
    const schema = Joi.object({
      fileName: Joi.string().max(255).allow("", null).default(""),
      mimeType: Joi.string().max(127).required(),
      dataBase64: Joi.string().required(),
      docType: Joi.string().valid("pan", "aadhaar").optional().allow("", null),
    });
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false });
    if (error) throw new ApiError(422, "Validation failed", error.details);

    let buffer;
    try {
      buffer = Buffer.from(String(value.dataBase64), "base64");
    } catch {
      throw new ApiError(422, "File data is not valid base64");
    }
    // The gateway caps JSON bodies, so an oversized scan is rejected early
    // with a clear message instead of a bare 413.
    if (buffer.length > 5 * 1024 * 1024) {
      throw new ApiError(422, "File is too large for scanning (max 5 MB)");
    }

    const extracted = await extractIdentity({ buffer, mimeType: value.mimeType });
    res.status(200).json({
      fileName: value.fileName || null,
      docType: value.docType || null,
      ...extracted,
    });
  } catch (err) {
    if (err?.statusCode && !err?.details) {
      next(new ApiError(err.statusCode, err.message));
      return;
    }
    next(err);
  }
});

/**
 * Assign a compliance form to a doctor — administrators may hand the link to any
 * employee; anyone else may only assign with themselves as the sharing employee.
 *
 * No email is sent: the assigner copies the link and sends it to the doctor
 * themselves.
 */
router.post("/:doctorId/compliance", async (req, res, next) => {
  const agreementSnapshotFiles = [];
  let snapshotsPersisted = false;
  try {
    if (!mongoose.isValidObjectId(req.params.doctorId)) throw new ApiError(404, "Doctor not found");

    const doctor = await ExternalUser.findOne({ _id: req.params.doctorId, tenantId: req.tenantId });
    if (!doctor) throw new ApiError(404, "Doctor not found");

    const schema = Joi.object({
      moduleId: Joi.string().allow("", null).default(""),
      handlerUserId: Joi.string().allow("", null).default(""),
      dueDate: Joi.date().allow(null).default(null),
      instructions: Joi.string().allow("", null).default(""),
      // The admin picks an approval chain in the assign dialog (one of the two
      // directions shown for the chosen employee). Otherwise the chain stays
      // automatic: the sharing employee's reporting line upward.
      approvalChainUserIds: Joi.array().items(Joi.string().hex().length(24)).max(50).optional(),
    });
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) throw new ApiError(422, "Validation failed", error.details);
    if (!value.moduleId) throw new ApiError(422, "Choose a form to assign");
    if (!mongoose.isValidObjectId(value.moduleId)) throw new ApiError(422, "Invalid form selected");
    if (!value.handlerUserId || !mongoose.isValidObjectId(value.handlerUserId)) {
      throw new ApiError(422, "Select the employee who will share the link with the doctor");
    }
    // Administrators may hand the link to any employee; everyone else may only
    // assign a form with themselves as the sharing employee.
    if (!req.auth?.isAdmin && String(value.handlerUserId) !== String(req.auth?.userId)) {
      throw new ApiError(403, "Only administrators can assign forms to other employees");
    }
    let approvalChainOids;
    if (value.approvalChainUserIds?.length) {
      const oids = value.approvalChainUserIds.map((s) => new mongoose.Types.ObjectId(s));
      const n = await User.countDocuments({
        tenantId: req.tenantId,
        _id: { $in: oids },
        orgLeftAt: null,
        status: { $nin: ["DISABLED", "LOCKED"] },
      });
      if (n !== oids.length) {
        throw new ApiError(422, "One or more approvers are not active users in this tenant.");
      }
      approvalChainOids = oids;
    }

    const [moduleDoc, handler, tenantDoc] = await Promise.all([
      Module.findOne({ _id: value.moduleId, tenantId: req.tenantId }).select("name moduleType formSchema.settings").lean(),
      User.findOne({ _id: value.handlerUserId, tenantId: req.tenantId })
        .select("name email empCode status")
        .lean(),
      require("../models/tenant.model").findById(req.tenantId).lean(),
    ]);
    if (!moduleDoc) throw new ApiError(404, "Form not found in this tenant");
    if (!handler || ["DISABLED", "LOCKED"].includes(handler.status)) {
      throw new ApiError(422, "The selected employee cannot receive this link");
    }

    const existing = await SchemaFormDispatch.findOne({
      tenantId: req.tenantId,
      externalUserId: doctor._id,
      moduleId: moduleDoc._id,
      status: { $nin: ["APPROVED", "REJECTED"] },
    }).lean();
    if (existing) {
      throw new ApiError(
        409,
        `"${moduleDoc.name}" is already assigned to this doctor. Open it from the compliance list below.`,
      );
    }

    // A form uses one opening agreement, frozen with this doctor's resolved
    // Party 1 and profile values at assignment time.
    const settings = moduleDoc.formSchema?.settings || {};
    const openingTemplateId = settings.openingTemplateId || settings.templateId || settings.closingTemplateId || null;
    async function loadTemplate(id, side) {
      if (!id) return null;
      if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(422, `The form's ${side} template is invalid — pick another template on the form`);
      }
      const doc = await FormTemplate.findOne({ _id: id, tenantId: req.tenantId }).lean();
      // Return null when not found — the caller checks sign-service before
      // deciding the template is truly missing.
      return doc || null;
    }
    const openingDoc = await loadTemplate(openingTemplateId, "opening");
    const templateDoc = openingDoc || null;

    // Uploaded-PDF agreement templates live in sign-service. Snapshot the
    // selected document and its resolved fields onto this doctor's one-use link.
    async function getSignTemplate(id) {
      if (!id) return null;
      if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(422, "The form has an invalid agreement template selection.");
      }
      const _fetch = require("node-fetch");
      const res = await _fetch(`http://127.0.0.1:4009/templates/${id}`, { headers: {
        "x-auth-user-id": String(req.auth.userId),
        "x-auth-tenant-id": String(req.tenantId),
        "x-auth-account-role": String(req.auth.accountRole || (req.auth.isSuperAdmin ? "super_admin" : "tenant_admin")),
        "x-auth-is-super-admin": req.auth.isSuperAdmin ? "true" : "false",
      }});
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new ApiError(502, `Could not load the selected agreement template (${res.status}).`);
      }
      return res.json();
    }
    const openingSignTemplateId = settings.openingSignTemplateId || settings.closingSignTemplateId || null;
    if (openingSignTemplateId && openingTemplateId) {
      throw new ApiError(422, "Choose either one uploaded PDF agreement or a legacy text agreement for this form, not both.");
    }
    const openingSigTemplate = await getSignTemplate(openingSignTemplateId);

    // A selected template that exists in neither service is a real error.
    if (openingTemplateId && !openingDoc && !openingSigTemplate) {
      throw new ApiError(422, `The form's opening template no longer exists — pick another template on the form`);
    }
    if (openingSignTemplateId && !openingSigTemplate) {
      throw new ApiError(422, "The selected opening agreement no longer exists — choose another template on the form.");
    }
    // {{signature.tenant}} = Party 1's own signature, saved in the Forms
    // org-data popup. Block here so the issued link never shows a blank line.
    const needsPartyOneSig = /{{\s*signature\.tenant\s*}}/i.test(String(openingDoc?.bodyText || ""));
    if (needsPartyOneSig && !String(tenantDoc?.signature || "").trim()) {
      throw new ApiError(422,
        "This form's template needs your organization's Party 1 signature — add it first in Forms → Organization data (pencil icon), then assign again.");
    }
    const openingAgreementHtml = openingDoc
      ? composeTemplateAgreementHtml({ template: openingDoc, tenant: tenantDoc, doctor, side: "opening" })
      : "";
    const agreementHtml = openingAgreementHtml;

    async function snapshotSignTemplate(template, side) {
      if (!template) return null;
      if (!template.document) {
        throw new ApiError(422, `The ${side} agreement "${template.name}" has no uploaded PDF.`);
      }
      const context = placeholderContext({ doctor: doctor || {}, tenant: tenantDoc || {} });
      const fields = (template.fields || []).map((field) => {
        const tag = String(field.tag || "").trim().toLowerCase();
        let value = "";
        if (tag === "signature.tenant") value = tenantDoc?.signature || "";
        else if (tag === "stamp") value = tenantDoc?.stamp || "";
        else if (tag === "tenant.custom") value = field.value || "";
        else if (tag !== "signature.doctor" && !tag.startsWith("custom.")) {
          const resolved = context[tag];
          value = resolved == null ? "" : String(resolved);
        }
        return { ...field, value };
      });
      if (!fields.some((field) => {
        const tag = String(field.tag || "").toLowerCase();
        return ["SIGNATURE", "INITIALS"].includes(String(field.type || "").toUpperCase()) && tag !== "signature.tenant";
      })) {
        throw new ApiError(422, `The ${side} agreement needs a Party 2 signature field. Add one in Templates first.`);
      }
      const missingPartyData = fields.filter((field) => {
        const tag = String(field.tag || "").toLowerCase();
        if (tag.startsWith("tenant.") || tag === "signature.tenant" || tag === "stamp" || tag.startsWith("doctor.")) {
          return !String(field.value || "").trim();
        }
        if (field.required === false) return false;
        if (tag === "signature.doctor" || tag.startsWith("custom.")) return false;
        return !String(field.value || "").trim();
      });
      if (missingPartyData.length) {
        throw new ApiError(
          422,
          `${side} agreement needs Party 1 / Party 2 data: ${missingPartyData.map((field) => `${field.label || field.tag} (${field.tag})`).join(", ")}.`,
        );
      }

      const _fetch = require("node-fetch");
      const documentResponse = await _fetch(`http://127.0.0.1:4009/templates/${template._id}/document`, {
        headers: {
          "x-auth-user-id": String(req.auth.userId),
          "x-auth-tenant-id": String(req.tenantId),
          "x-auth-account-role": String(req.auth.accountRole || (req.auth.isSuperAdmin ? "super_admin" : "tenant_admin")),
          "x-auth-is-super-admin": req.auth.isSuperAdmin ? "true" : "false",
        },
      });
      if (!documentResponse.ok) {
        throw new ApiError(502, `Could not snapshot the ${side} agreement PDF (${documentResponse.status}).`);
      }
      const bytes = Buffer.from(await documentResponse.arrayBuffer());
      if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new ApiError(502, `The ${side} agreement service returned an invalid PDF.`);
      }
      await fs.promises.mkdir(AGREEMENT_SNAPSHOT_DIR, { recursive: true });
      const fileName = `${crypto.randomBytes(24).toString("hex")}.pdf`;
      await fs.promises.writeFile(path.join(AGREEMENT_SNAPSHOT_DIR, fileName), bytes, { flag: "wx" });
      agreementSnapshotFiles.push(fileName);
      return {
        templateId: String(template._id),
        name: template.name || `${side} agreement`,
        documentName: template.document.name || `${side}-agreement.pdf`,
        documentFileName: fileName,
        documentSha256: template.document.sha256 || "",
        pages: Number(template.document.pages) || 0,
        fields,
      };
    }
    const openingAgreementSnapshot = await snapshotSignTemplate(openingSigTemplate, "opening");

    const { dispatches } = await createDispatchesForRecipients({
      tenantId: req.tenantId,
      moduleId: moduleDoc._id,
      externals: [doctor],
      dispatchedByUserId: req.auth.userId,
      instructions: value.instructions,
      dueDate: value.dueDate,
      delivery: "MANUAL",
      handlerUserId: handler._id,
      ...(approvalChainOids ? { approvalChainUserIds: approvalChainOids } : {}),
      openingSignatureTemplateId: openingSigTemplate?._id || null,
      openingAgreementSnapshot,
      ...(templateDoc
        ? {
          templateId: openingDoc?._id || null,
          openingTemplateId: openingDoc?._id || null,
          agreementHtml,
          openingAgreementHtml,
        }
        : {}),
      ...(openingSigTemplate
        ? {
          // Track the selected sign-template on the dispatch for consumers.
          openingSignatureTemplateId: openingSigTemplate?._id || null,
        }
        : {}),
    });
    const dispatch = dispatches[0];
    if (!dispatch) throw new ApiError(500, "The form dispatch could not be created.");
    snapshotsPersisted = true;

    await writeAudit({
      tenantId: req.tenantId,
      userId: req.auth.userId,
      action: "DOCTOR_COMPLIANCE_ASSIGNED",
      metadata: {
        doctorId: String(doctor._id),
        moduleId: String(moduleDoc._id),
        handlerUserId: String(handler._id),
        dispatchId: String(dispatch._id),
        ...(approvalChainOids ? { approvalChainUserIds: approvalChainOids.map(String) } : {}),
        ...(templateDoc ? { templateId: String(templateDoc._id) } : {}),
        ...(openingSigTemplate ? { openingSignatureTemplateId: String(openingSigTemplate._id) } : {}),
      },
    });

    res.status(201).json({
      dispatchId: dispatch._id,
      moduleId: moduleDoc._id,
      formName: moduleDoc.name,
      handlerUserId: handler._id,
      handlerName: handler.name,
      delivery: "MANUAL",
      status: "SENT",
      publicPath: dispatchPublicPath(dispatch.token),
      // Tags the doctor cannot fill (empty profile fields) or that no known
      // field provides — surfaced in the UI instead of silently blanking.
      ...(templateDoc
        ? {
            templateId: openingDoc?._id,
            templateName: openingDoc.name || null,
            openingTemplateId: openingDoc?._id || null,
          }
        : {}),
      warnings: dispatchWarnings(
        moduleDoc,
        value.instructions,
        doctor,
        tenantDoc,
        openingDoc?.bodyText || "",
        (openingDoc?.fieldValues || []).map((placeholder) => placeholder.tag),
      ),
    });
  } catch (error) {
    if (!snapshotsPersisted) {
      for (const fileName of agreementSnapshotFiles) {
        try {
          await fs.promises.unlink(path.join(AGREEMENT_SNAPSHOT_DIR, fileName));
        } catch (cleanupError) {
          if (cleanupError.code !== "ENOENT") {
            console.error("schema form agreement snapshot cleanup failed", cleanupError);
          }
        }
      }
    }
    next(error);
  }
});

router.get("/:doctorId", async (req, res, next) => {
  try {
    assertPermission(req, "doctor.view");
    if (!mongoose.isValidObjectId(req.params.doctorId)) throw new ApiError(404, "Doctor not found");

    const doctor = await ExternalUser.findOne({ _id: req.params.doctorId, tenantId: req.tenantId }).lean();
    if (!doctor) throw new ApiError(404, "Doctor not found");
    if (!canViewAll(req) && String(doctor.createdByUserId) !== String(req.auth.userId)) {
      const handles = await SchemaFormDispatch.exists({
        tenantId: req.tenantId,
        externalUserId: doctor._id,
        handlerUserId: authOid(req),
      });
      if (!handles) {
        throw new ApiError(403, "You can only view doctors you created or whose form link was assigned to you");
      }
    }

    const creator = await User.findById(doctor.createdByUserId).select("name email empCode").lean();
    const compliance = await loadCompliance(req.tenantId, doctor, req.auth.userId);

    res.status(200).json({
      ...toDoctorDto(doctor),
      createdByLabel: creator?.empCode || creator?.email || creator?.name || null,
      compliance,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:doctorId", async (req, res, next) => {
  try {
    assertPermission(req, "doctor.manage");
    if (!mongoose.isValidObjectId(req.params.doctorId)) throw new ApiError(404, "Doctor not found");

    const doctor = await ExternalUser.findOne({ _id: req.params.doctorId, tenantId: req.tenantId });
    if (!doctor) throw new ApiError(404, "Doctor not found");
    if (!canEdit(req, doctor)) throw new ApiError(403, "You can only edit doctors you created");

    const { error, value } = profileSchema.validate(req.body, { abortEarly: false });
    if (error) throw new ApiError(422, "Validation failed", error.details);

    const wasDraft = Boolean(doctor.draft);
    const willBeDraft = value.draft !== undefined ? Boolean(value.draft) : wasDraft;
    const merged = sanitizeProfile(value, {
      name: doctor.name,
      specialization: doctor.specialization,
      qualification: doctor.qualification,
      yearsOfExperience: doctor.yearsOfExperience,
      gender: doctor.gender,
      dateOfBirth: doctor.dateOfBirth,
      phone: doctor.phone,
      email: doctor.email,
      medicalRegistrationNumber: doctor.medicalRegistrationNumber,
      pan: doctor.pan,
      aadhaar: doctor.aadhaar,
      clinicHospitalName: doctor.clinicHospitalName,
      address: doctor.address,
      status: doctor.status,
      draft: willBeDraft,
    });
    // Completeness is enforced when a draft becomes a created doctor.
    if (!willBeDraft && wasDraft) assertComplete(merged);

    const set = sanitizeProfile(value);
    delete set.draft;
    set.draft = willBeDraft;

    Object.assign(doctor, set);
    await doctor.save();

    await writeAudit({
      tenantId: req.tenantId,
      userId: req.auth.userId,
      action: "DOCTOR_UPDATED",
      metadata: { doctorId: String(doctor._id), fields: Object.keys(set), draft: willBeDraft },
    });

    res.status(200).json(toDoctorDto(doctor));
  } catch (error) {
    next(error);
  }
});

/**
 * Delete a doctor.
 *
 * Removes the profile together with its KYC records and its compliance
 * dispatches (and the responses submitted through them) so no orphaned dispatch
 * rows, public form links or KYC records are left behind. Dashboard doctor
 * counts drop automatically because they read the same collection.
 */
router.delete("/:doctorId", async (req, res, next) => {
  try {
    assertPermission(req, "doctor.manage");
    if (!mongoose.isValidObjectId(req.params.doctorId)) throw new ApiError(404, "Doctor not found");

    const doctor = await ExternalUser.findOne({ _id: req.params.doctorId, tenantId: req.tenantId });
    if (!doctor) throw new ApiError(404, "Doctor not found");
    if (!canEdit(req, doctor)) throw new ApiError(403, "You can only delete doctors you created");

    const dispatches = await SchemaFormDispatch.find({ tenantId: req.tenantId, externalUserId: doctor._id })
      .select("submissions pinkSubmissionId")
      .lean();

    const submissionIds = [
      ...new Set(
        dispatches
          .flatMap((d) => [d.pinkSubmissionId, ...(d.submissions || []).map((s) => s.submissionId)])
          .filter(Boolean)
          .map(String),
      ),
    ];

    const removedDispatches = await SchemaFormDispatch.deleteMany({
      tenantId: req.tenantId,
      externalUserId: doctor._id,
    });
    if (submissionIds.length) {
      await Submission.deleteMany({ _id: { $in: submissionIds } });
    }
    await KycRecord.deleteMany({ tenantId: req.tenantId, refType: "EXTERNAL_USER", refId: doctor._id });
    await ExternalUser.deleteOne({ _id: doctor._id });

    await writeAudit({
      tenantId: req.tenantId,
      userId: req.auth.userId,
      action: "DOCTOR_DELETED",
      metadata: {
        doctorId: String(doctor._id),
        doctorCode: doctor.doctorCode || doctorCodeFor(doctor._id),
        name: doctor.name,
        complianceFormsRemoved: removedDispatches.deletedCount || 0,
      },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
