const express = require("express");
const Form = require("../models/form.model");
const PublicFormToken = require("../models/publicFormToken.model");
const FormSubmission = require("../models/formSubmission.model");
const Module = require("../models/schemaFormModule.model");
const Submission = require("../models/pinkFormSubmission.model");
const { validateAgainstSchema } = require("../validation/submissionValidation");
const { generateSubmissionPdf } = require("../services/pdfService");
const { completeDispatchAfterSubmission } = require("../services/schemaFormDispatch.hook");
const ApiError = require("@pink/shared").ApiError;

const router = express.Router();

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

router.get("/schema-forms/modules/:id", async (req, res, next) => {
  try {
    const moduleDoc = await Module.findById(req.params.id).lean();
    if (!moduleDoc || moduleDoc.moduleType !== "FORM") {
      return res.status(404).json({ error: "Form module not found." });
    }
    const plain = typeof moduleDoc.toObject === "function" ? moduleDoc.toObject() : moduleDoc;
    return res.json({ ...plain, schema: plain.formSchema });
  } catch (error) {
    return next(error);
  }
});

router.post("/schema-forms/submissions", async (req, res, next) => {
  try {
    const { moduleId, data, website, agreements, dispatchToken } = req.body;

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
        pre: { accepted: true, text: agreements.pre.text || "", signatureDataUrl: agreements.pre.signatureDataUrl, acceptedAt: agreements.pre.acceptedAt || new Date().toISOString() },
        post: { accepted: true, text: agreements.post.text || "", signatureDataUrl: agreements.post.signatureDataUrl, acceptedAt: agreements.post.acceptedAt || new Date().toISOString() }
      }
    });

    const downloadUrl = `/api/v1/submissions/${submission._id}/pdf`;
    await Submission.findByIdAndUpdate(submission._id, {
      pdf: { fileName: pdfArtifact.fileName, filePath: pdfArtifact.filePath, downloadUrl, generatedAt: new Date() }
    });

    const token = typeof dispatchToken === "string" ? dispatchToken.trim() : "";
    if (token) {
      try {
        await completeDispatchAfterSubmission({ dispatchToken: token, submissionId: submission._id, moduleId, pdfDownloadUrl: downloadUrl });
      } catch (hookErr) {
        console.error("schemaFormDispatch hook failed", hookErr);
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

module.exports = router;
