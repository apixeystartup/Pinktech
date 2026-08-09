const express = require("express");
const fs = require("fs");
const path = require("path");
const Module = require("../models/module");
const Submission = require("../models/submission");
const PinkFormAuditLog = require("../models/auditLog");
const { validateAgainstSchema } = require("../validation/submissionValidation");
const authMiddleware = require("../../../../middlewares/auth.middleware");
const tenantMiddleware = require("../../../../middlewares/tenant.middleware");

const router = express.Router();

function submissionsPublicPath() {
  return process.env.PINK_FORM_SUBMISSIONS_PATH || "/api/v1/schema-forms/submissions";
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toDisplayValue(v) {
  if (Array.isArray(v)) return v.join(", ");
  if (v && typeof v === "object") return JSON.stringify(v);
  return String(v ?? "");
}

function buildSubmissionReceiptHtml({ moduleName, submissionData, agreements, submissionId, createdAt }) {
  const rows = Object.entries(submissionData || {})
    .map(([k, v]) => `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600">${esc(k)}</td><td style="padding:8px;border:1px solid #ddd">${esc(toDisplayValue(v))}</td></tr>`)
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Submission Receipt — ${esc(moduleName)}</title>
<style>
  @media print { body { margin: 0; } .no-print { display: none; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #222; max-width: 800px; margin: 0 auto; padding: 24px; }
  h1 { color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; }
  h2 { color: #374151; margin-top: 24px; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .agreement { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 12px 0; }
  .sig-img { max-width: 280px; border: 1px solid #d1d5db; border-radius: 6px; padding: 4px; background: #fff; margin-top: 8px; }
  .print-btn { background: #4f46e5; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; margin: 16px 0; }
  .print-btn:hover { background: #4338ca; }
</style></head><body>
<button class="print-btn no-print" onclick="window.print()">Save as PDF / Print</button>
<h1>Submission Receipt</h1>
<div class="meta">
  <div><strong>Form:</strong> ${esc(moduleName)}</div>
  <div><strong>Submission ID:</strong> ${esc(String(submissionId))}</div>
  <div><strong>Submitted at:</strong> ${createdAt ? new Date(createdAt).toLocaleString() : new Date().toLocaleString()}</div>
</div>

<h2>Opening Agreement</h2>
<div class="agreement">
  <p>${esc(agreements?.pre?.text || "No text provided")}</p>
  <div><strong>Accepted:</strong> ${agreements?.pre?.accepted ? "Yes" : "No"}</div>
  <div class="meta">Accepted at: ${agreements?.pre?.acceptedAt || "-"}</div>
  ${agreements?.pre?.signatureDataUrl ? `<img class="sig-img" src="${agreements.pre.signatureDataUrl}" alt="Opening signature"/>` : ""}
</div>

<h2>Submitted Data</h2>
<table>
  <thead><tr><th style="padding:8px;border:1px solid #ddd;background:#f3f4f6;text-align:left">Field</th><th style="padding:8px;border:1px solid #ddd;background:#f3f4f6;text-align:left">Value</th></tr></thead>
  <tbody>${rows}</tbody>
</table>

<h2>Closing Agreement</h2>
<div class="agreement">
  <p>${esc(agreements?.post?.text || "No text provided")}</p>
  <div><strong>Accepted:</strong> ${agreements?.post?.accepted ? "Yes" : "No"}</div>
  <div class="meta">Accepted at: ${agreements?.post?.acceptedAt || "-"}</div>
  ${agreements?.post?.signatureDataUrl ? `<img class="sig-img" src="${agreements.post.signatureDataUrl}" alt="Closing signature"/>` : ""}
</div>

<button class="print-btn no-print" onclick="window.print()">Save as PDF / Print</button>
</body></html>`;
}

async function generateReceiptFile({ submissionId, moduleName, submissionData, agreements, createdAt }) {
  const storageDir = path.join(process.cwd(), "storage", "receipts");
  try { fs.mkdirSync(storageDir, { recursive: true }); } catch { /* Vercel: read-only filesystem */ }

  const html = buildSubmissionReceiptHtml({ moduleName, submissionData, agreements, submissionId, createdAt });
  const fileName = `submission-${submissionId}.html`;
  const filePath = path.join(storageDir, fileName);

  try {
    fs.writeFileSync(filePath, html, "utf-8");
    return { fileName, filePath, html };
  } catch {
    return { fileName: null, filePath: null, html };
  }
}

router.post("/", async (req, res, next) => {
  try {
    const { moduleId, data, website, agreements, dispatchToken } = req.body;
    if (website) return res.status(400).json({ error: "Spam detected." });
    if (!moduleId || typeof data !== "object") return res.status(400).json({ error: "moduleId and data are required." });
    if (!agreements?.pre?.accepted || !agreements?.post?.accepted) return res.status(400).json({ error: "Both agreements must be accepted." });
    if (!agreements?.pre?.signatureDataUrl || !agreements?.post?.signatureDataUrl) return res.status(400).json({ error: "Both signatures are required." });

    const moduleDoc = await Module.findById(moduleId).lean();
    if (!moduleDoc || moduleDoc.moduleType !== "FORM") return res.status(404).json({ error: "Form module not found." });

    const { errors, normalized } = validateAgainstSchema(moduleDoc.formSchema.fields, data);
    if (Object.keys(errors).length) return res.status(422).json({ error: "Validation failed.", fieldErrors: errors });

    const submission = await Submission.create({
      moduleId,
      data: normalized,
      agreements: {
        pre: { accepted: Boolean(agreements.pre.accepted), text: agreements.pre.text || "", signatureDataUrl: agreements.pre.signatureDataUrl, acceptedAt: agreements.pre.acceptedAt ? new Date(agreements.pre.acceptedAt) : new Date() },
        post: { accepted: Boolean(agreements.post.accepted), text: agreements.post.text || "", signatureDataUrl: agreements.post.signatureDataUrl, acceptedAt: agreements.post.acceptedAt ? new Date(agreements.post.acceptedAt) : new Date() },
      },
      meta: { ip: req.ip, userAgent: req.headers["user-agent"] || "", source: "public-form" },
    });

    const receipt = await generateReceiptFile({
      submissionId: submission._id,
      moduleName: moduleDoc.name,
      submissionData: normalized,
      agreements: {
        pre: { accepted: true, text: agreements.pre.text || "", signatureDataUrl: agreements.pre.signatureDataUrl, acceptedAt: agreements.pre.acceptedAt || new Date().toISOString() },
        post: { accepted: true, text: agreements.post.text || "", signatureDataUrl: agreements.post.signatureDataUrl, acceptedAt: agreements.post.acceptedAt || new Date().toISOString() },
      },
      createdAt: submission.createdAt,
    });

    const downloadUrl = `${submissionsPublicPath()}/${submission._id}/pdf`;
    const updateFields = {
      pdf: {
        fileName: receipt.fileName || `submission-${submission._id}.html`,
        filePath: receipt.filePath || "",
        downloadUrl,
        generatedAt: new Date(),
      },
    };
    if (receipt.html) {
      updateFields.receiptHtml = receipt.html;
    }
    await Submission.findByIdAndUpdate(submission._id, updateFields);

    await PinkFormAuditLog.create({
      eventType: "FORM_SUBMITTED",
      moduleId,
      submissionId: submission._id,
      details: { fields: Object.keys(normalized) },
    });

    if (dispatchToken) {
      try {
        const hook = require("../../schemaFormDispatch.hook");
        await hook.completeDispatchAfterSubmission({
          dispatchToken,
          submissionId: submission._id,
          moduleId,
          pdfDownloadUrl: downloadUrl,
        });
      } catch (hookErr) {
        console.error("[submissions] dispatch hook failed:", hookErr.message);
      }
    }

    return res.status(201).json({ id: submission._id, pdfDownloadUrl: downloadUrl, message: moduleDoc.formSchema?.settings?.successMessage || "Submission successful." });
  } catch (error) {
    return next(error);
  }
});

router.get("/module/:moduleId", authMiddleware, tenantMiddleware, async (req, res, next) => {
  try {
    const moduleDoc = await Module.findOne({ _id: req.params.moduleId, tenantId: req.tenantId }).lean();
    if (!moduleDoc) return res.status(404).json({ error: "Module not found." });
    const rows = await Submission.find({ moduleId: req.params.moduleId }).sort({ createdAt: -1 }).lean();
    return res.json(
      rows.map((row) => ({
        _id: row._id,
        moduleId: row.moduleId,
        createdAt: row.createdAt,
        data: row.data,
        agreements: {
          preAcceptedAt: row.agreements?.pre?.acceptedAt || null,
          postAcceptedAt: row.agreements?.post?.acceptedAt || null,
        },
        pdfDownloadUrl: row.pdf?.downloadUrl || "",
      }))
    );
  } catch (error) {
    return next(error);
  }
});

router.get("/:submissionId/pdf", authMiddleware, tenantMiddleware, async (req, res, next) => {
  try {
    const submission = await Submission.findById(req.params.submissionId).lean();
    if (!submission) return res.status(404).json({ error: "Submission not found." });

    const moduleDoc = await Module.findOne({ _id: submission.moduleId, tenantId: req.tenantId }).lean();
    if (!moduleDoc) return res.status(404).json({ error: "Submission not found." });

    if (submission.receiptHtml) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="submission-${submission._id}.html"`);
      return res.send(submission.receiptHtml);
    }

    if (submission.pdf?.filePath && fs.existsSync(submission.pdf.filePath)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="${submission.pdf.fileName || `submission-${submission._id}.html`}"`);
      return res.sendFile(path.resolve(submission.pdf.filePath));
    }

    return res.status(404).json({ error: "Receipt not found for this submission." });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
