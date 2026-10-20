const express = require("express");
const Form = require("../models/form.model");
const PublicFormToken = require("../models/publicFormToken.model");
const FormSubmission = require("../models/formSubmission.model");
const Module = require("../models/schemaFormModule.model");
const Submission = require("../models/pinkFormSubmission.model");
const { validateAgainstSchema } = require("../validation/submissionValidation");
const {
  generateSubmissionPdf,
  renderAgreementPdf,
  combineSubmissionPdf,
} = require("../services/pdfService");
const { resolveAgreementTexts } = require("../services/agreementText");
const { completeDispatchAfterSubmission } = require("../services/schemaFormDispatch.hook");
const { agreementSignerValues } = require("../services/agreementSignerValues");
const SchemaFormDispatch = require("../models/schemaFormDispatch.model");
const ExternalUser = require("../models/externalUser.model");
const Tenant = require("../models/tenant.model");
const { placeholderContext, resolvePlaceholders } = require("@pink/shared");
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
    const settings = moduleDoc.formSchema?.settings || {};
    if (settings.openingSignTemplateId || settings.closingSignTemplateId) {
      throw new ApiError(409, "This form is available only through the one-time link assigned to a doctor.");
    }
    const plain = typeof moduleDoc.toObject === "function" ? moduleDoc.toObject() : moduleDoc;
    return res.json({ ...plain, schema: plain.formSchema });
  } catch (error) {
    return next(error);
  }
});

router.post("/schema-forms/submissions", async (req, res, next) => {
  let claimedDispatchId = null;
  let claimTimestamp = null;
  let submissionId = null;
  let generatedPdfPath = null;
  try {
    const { moduleId, data, website, agreements, dispatchToken } = req.body;

    if (website) {
      return res.status(400).json({ error: "Spam detected." });
    }
    if (!moduleId || !data || typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({ error: "moduleId and data are required." });
    }

    const rawDispatchToken = typeof dispatchToken === "string" ? dispatchToken.trim() : "";
    if (rawDispatchToken) {
      const previousSubmission = await Submission.findOne({
        dispatchToken: rawDispatchToken,
        moduleId,
      }).select("_id pdf").lean();
      if (previousSubmission) {
        if (previousSubmission.pdf?.downloadUrl) {
          return res.status(200).json({
            id: previousSubmission._id,
            pdfDownloadUrl: previousSubmission.pdf.downloadUrl,
            message: "Submission successful.",
          });
        }
        throw new ApiError(409, "Your submission is still being processed. Please wait a moment and retry.");
      }
    }

    if (!agreements?.pre?.accepted) {
      return res.status(400).json({ error: "The opening agreement must be accepted." });
    }
    if (!agreements?.pre?.signatureDataUrl) {
      return res.status(400).json({ error: "A signature for the opening agreement is required." });
    }

    const moduleDoc = await Module.findById(moduleId).lean();
    if (!moduleDoc || moduleDoc.moduleType !== "FORM") {
      return res.status(404).json({ error: "Form module not found." });
    }

    const { errors, normalized } = validateAgainstSchema(moduleDoc.formSchema.fields, data);
    if (Object.keys(errors).length) {
      return res.status(422).json({ error: "Validation failed.", fieldErrors: errors });
    }
    const agreementTexts = resolveAgreementTexts(moduleDoc);
    const settings = moduleDoc.formSchema?.settings || {};
    const hasPdfAgreementTemplates = Boolean(settings.openingSignTemplateId || settings.closingSignTemplateId);
    if (hasPdfAgreementTemplates && !rawDispatchToken) {
      throw new ApiError(409, "This form uses a doctor-specific agreement. Open the one-time link assigned to you.");
    }

    let dispatch = null;
    if (rawDispatchToken) {
      const claimTime = new Date();
      dispatch = await SchemaFormDispatch.findOneAndUpdate(
        {
          token: rawDispatchToken,
          moduleId,
          status: "SENT",
          $or: [
            { submissionInProgressAt: null },
            { submissionInProgressAt: { $lt: new Date(claimTime.getTime() - 10 * 60 * 1000) } },
          ],
        },
        { $set: { submissionInProgressAt: claimTime } },
        { new: true },
      ).lean();
      if (!dispatch) {
        throw new ApiError(409, "This form link is invalid, already submitted, or currently being submitted.");
      }
      claimedDispatchId = dispatch._id;
      claimTimestamp = claimTime;
      const agreementSnapshot = dispatch.openingAgreementSnapshot || dispatch.closingAgreementSnapshot;
      if (hasPdfAgreementTemplates && !agreementSnapshot) {
        throw new ApiError(409, "The assigned link is missing its agreement snapshot. Please ask an administrator to reassign the form.");
      }

      const doctor = dispatch?.externalUserId
        ? await ExternalUser.findById(dispatch.externalUserId).lean()
        : null;
      if (doctor) {
        const tenant = dispatch?.tenantId
          ? await Tenant.findById(dispatch.tenantId).lean()
          : null;
        const phContext = placeholderContext({ doctor, tenant: tenant || {} });
        const openingHtml = dispatch?.openingAgreementHtml || dispatch?.agreementHtml || "";
        if (agreementSnapshot) agreementTexts.pre = "";
        else if (openingHtml) agreementTexts.pre = openingHtml;
        else agreementTexts.pre = resolvePlaceholders(agreementTexts.pre, phContext);
      }
    }

    const agreementSnapshot = dispatch?.openingAgreementSnapshot || dispatch?.closingAgreementSnapshot || null;
    const openingTemplateFieldValues = agreementSignerValues(
      agreementSnapshot,
      agreements?.pre?.templateFieldValues,
      agreements?.pre?.signatureDataUrl,
      "opening",
    );

    const submission = await Submission.create({
      moduleId,
      ...(rawDispatchToken ? { dispatchToken: rawDispatchToken } : {}),
      data: normalized,
      agreements: {
        pre: {
          accepted: Boolean(agreements.pre.accepted),
          text: agreementTexts.pre,
          signatureDataUrl: agreements.pre.signatureDataUrl,
          templateFieldValues: openingTemplateFieldValues,
          acceptedAt: agreements.pre.acceptedAt ? new Date(agreements.pre.acceptedAt) : new Date()
        }
      },
      meta: {
        ip: req.ip,
        userAgent: req.headers["user-agent"] || "",
        source: "public-form"
      }
    });
    submissionId = submission._id;

    const pdfArtifact = await generateSubmissionPdf({
      submissionId: submission._id,
      moduleName: moduleDoc.name,
      submissionData: normalized,
      includeAgreements: !agreementSnapshot,
      agreements: {
        pre: { accepted: true, text: agreementTexts.pre, signatureDataUrl: agreements.pre.signatureDataUrl, acceptedAt: agreements.pre.acceptedAt || new Date().toISOString() },
      }
    });
    generatedPdfPath = pdfArtifact.filePath;
    if (agreementSnapshot) {
      const openingAgreementPdf = await renderAgreementPdf({
        documentFileName: agreementSnapshot.documentFileName,
        fields: agreementSnapshot.fields,
        signatureDataUrl: agreements.pre.signatureDataUrl,
        signerValues: openingTemplateFieldValues,
      });
      await combineSubmissionPdf({
        submissionFilePath: pdfArtifact.filePath,
        openingAgreementPdf,
      });
    }

    const downloadUrl = `/api/v1/submissions/${submission._id}/pdf`;
    await Submission.findByIdAndUpdate(submission._id, {
      pdf: { fileName: pdfArtifact.fileName, filePath: pdfArtifact.filePath, downloadUrl, generatedAt: new Date() }
    });

    const token = typeof dispatchToken === "string" ? dispatchToken.trim() : "";
    if (token) {
      // Dispatch bookkeeping + notification emails run in the background. The
      // SMTP legs can outlast the gateway timeout while the submission and
      // PDF are already safely stored, so never hold the 201 for them.
      completeDispatchAfterSubmission({ dispatchToken: token, submissionId: submission._id, moduleId, pdfDownloadUrl: downloadUrl }).catch(
        (hookErr) => {
          console.error("schemaFormDispatch hook failed", hookErr);
        },
      );
    }

    return res.status(201).json({
      id: submission._id,
      pdfDownloadUrl: downloadUrl,
      message: moduleDoc.formSchema?.settings?.successMessage || "Submission successful."
    });
  } catch (error) {
    if (submissionId) {
      try {
        await Submission.deleteOne({ _id: submissionId });
      } catch (deleteError) {
        console.error("schema form failed submission cleanup failed", deleteError);
      }
    }
    if (generatedPdfPath) {
      try {
        const fs = require("fs");
        await fs.promises.unlink(generatedPdfPath);
      } catch (unlinkError) {
        if (unlinkError.code !== "ENOENT") console.error("schema form failed PDF cleanup failed", unlinkError);
      }
    }
    if (claimedDispatchId && claimTimestamp) {
      try {
        await SchemaFormDispatch.updateOne(
          { _id: claimedDispatchId, status: "SENT", submissionInProgressAt: claimTimestamp },
          { $set: { submissionInProgressAt: null } },
        );
      } catch (releaseError) {
        console.error("schemaFormDispatch submission claim release failed", releaseError);
      }
    }
    return next(error);
  }
});

module.exports = router;
