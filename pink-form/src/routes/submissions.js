const express = require("express");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");
const Module = require("../models/module");
const Submission = require("../models/submission");
const PinkFormAuditLog = require("../models/auditLog");
const { validateAgainstSchema } = require("../validation/submissionValidation");
const { generateSubmissionPdf } = require("../services/pdfService");

const router = express.Router();

function submissionsPublicPath() {
  return process.env.PINK_FORM_SUBMISSIONS_PATH || "/api/submissions";
}

const submissionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false
});

router.post("/", submissionLimiter, async (req, res, next) => {
  try {
    const { moduleId, data, website, agreements } = req.body;

    // Honeypot check: bots usually fill hidden fields.
    if (website) {
      return res.status(400).json({ error: "Spam detected." });
    }

    if (!moduleId || typeof data !== "object") {
      return res.status(400).json({ error: "moduleId and data are required." });
    }
    if (!agreements?.pre?.accepted || !agreements?.post?.accepted) {
      return res.status(400).json({ error: "Both opening and closing agreements must be accepted." });
    }
    if (!agreements?.pre?.signatureDataUrl || !agreements?.post?.signatureDataUrl) {
      return res.status(400).json({ error: "Both agreement signatures are required." });
    }

    const moduleDoc = await Module.findById(moduleId).lean();
    if (!moduleDoc || moduleDoc.moduleType !== "FORM") {
      return res.status(404).json({ error: "Form module not found." });
    }

    const { errors, normalized } = validateAgainstSchema(moduleDoc.formSchema.fields, data);
    if (Object.keys(errors).length) {
      return res.status(422).json({ error: "Validation failed.", fieldErrors: errors });
    }

    const submission = await Submission.create({
      moduleId,
      data: normalized,
      agreements: {
        pre: {
          accepted: Boolean(agreements.pre.accepted),
          text: agreements.pre.text || "",
          signatureDataUrl: agreements.pre.signatureDataUrl,
          acceptedAt: agreements.pre.acceptedAt ? new Date(agreements.pre.acceptedAt) : new Date()
        },
        post: {
          accepted: Boolean(agreements.post.accepted),
          text: agreements.post.text || "",
          signatureDataUrl: agreements.post.signatureDataUrl,
          acceptedAt: agreements.post.acceptedAt ? new Date(agreements.post.acceptedAt) : new Date()
        }
      },
      meta: {
        ip: req.ip,
        userAgent: req.headers["user-agent"] || "",
        source: "public-form"
      }
    });

    const pdfArtifact = await generateSubmissionPdf({
      submissionId: submission._id,
      moduleName: moduleDoc.name,
      submissionData: normalized,
      agreements: {
        pre: {
          accepted: true,
          text: agreements.pre.text || "",
          signatureDataUrl: agreements.pre.signatureDataUrl,
          acceptedAt: agreements.pre.acceptedAt || new Date().toISOString()
        },
        post: {
          accepted: true,
          text: agreements.post.text || "",
          signatureDataUrl: agreements.post.signatureDataUrl,
          acceptedAt: agreements.post.acceptedAt || new Date().toISOString()
        }
      }
    });

    const downloadUrl = `${submissionsPublicPath()}/${submission._id}/pdf`;
    await Submission.findByIdAndUpdate(submission._id, {
      pdf: {
        fileName: pdfArtifact.fileName,
        filePath: pdfArtifact.filePath,
        downloadUrl,
        generatedAt: new Date()
      }
    });

    await PinkFormAuditLog.create({
      eventType: "FORM_SUBMITTED",
      moduleId,
      submissionId: submission._id,
      details: { fields: Object.keys(normalized) }
    });

    const dispatchToken = typeof req.body.dispatchToken === "string" ? req.body.dispatchToken.trim() : "";
    if (dispatchToken) {
      const hookPath = path.join(__dirname, "..", "..", "..", "src", "modules", "schema-forms", "schemaFormDispatch.hook.js");
      if (fs.existsSync(hookPath)) {
        try {
          const { completeDispatchAfterSubmission } = require(hookPath);
          await completeDispatchAfterSubmission({
            dispatchToken,
            submissionId: submission._id,
            moduleId,
            pdfDownloadUrl: downloadUrl,
          });
        } catch (hookErr) {
          console.error("schemaFormDispatch hook failed", hookErr);
        }
      }
    }

    return res.status(201).json({
      id: submission._id,
      pdfDownloadUrl: downloadUrl,
      message: moduleDoc.formSchema?.settings?.successMessage || "Submission successful."
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/module/:moduleId", async (req, res, next) => {
  try {
    const rows = await Submission.find({ moduleId: req.params.moduleId }).sort({ createdAt: -1 }).lean();
    return res.json(
      rows.map((row) => ({
        _id: row._id,
        moduleId: row.moduleId,
        createdAt: row.createdAt,
        data: row.data,
        agreements: {
          preAcceptedAt: row.agreements?.pre?.acceptedAt || null,
          postAcceptedAt: row.agreements?.post?.acceptedAt || null
        },
        pdfDownloadUrl: row.pdf?.downloadUrl || ""
      }))
    );
  } catch (error) {
    return next(error);
  }
});

router.get("/:submissionId/pdf", async (req, res, next) => {
  try {
    const submission = await Submission.findById(req.params.submissionId).lean();
    if (!submission || !submission.pdf?.filePath) {
      return res.status(404).json({ error: "PDF not found for this submission." });
    }
    if (!fs.existsSync(submission.pdf.filePath)) {
      return res.status(404).json({ error: "PDF file missing on server." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${submission.pdf.fileName || `submission-${submission._id}.pdf`}"`
    );
    return res.sendFile(path.resolve(submission.pdf.filePath));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
