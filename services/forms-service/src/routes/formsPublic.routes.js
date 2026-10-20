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
let submissionPdfQueue = Promise.resolve();

function enqueueSubmissionPdf(options) {
  submissionPdfQueue = submissionPdfQueue
    .then(() => generateAndSaveSubmissionPdf(options))
    .catch((error) => {
      console.error("schema form PDF job failed unexpectedly", error);
    });
}

async function generateAndSaveSubmissionPdf({
  submission,
  moduleName,
  agreementSnapshot,
  dispatchToken,
  moduleId,
  claimTimestamp,
}) {
  let generatedPdfPath = null;
  try {
    const pdfArtifact = await generateSubmissionPdf({
      submissionId: submission._id,
      moduleName,
      submissionData: submission.data,
      includeAgreements: !agreementSnapshot,
      agreements: {
        pre: {
          accepted: true,
          text: submission.agreements.pre.text,
          signatureDataUrl: submission.agreements.pre.signatureDataUrl,
          acceptedAt: submission.agreements.pre.acceptedAt || new Date().toISOString(),
        },
      },
    });
    generatedPdfPath = pdfArtifact.filePath;

    if (agreementSnapshot) {
      const openingAgreementPdf = await renderAgreementPdf({
        documentFileName: agreementSnapshot.documentFileName,
        fields: agreementSnapshot.fields,
        signatureDataUrl: submission.agreements.pre.signatureDataUrl,
        signerValues: submission.agreements.pre.templateFieldValues,
      });
      await combineSubmissionPdf({
        submissionFilePath: pdfArtifact.filePath,
        openingAgreementPdf,
      });
    }

    const downloadUrl = `/api/v1/submissions/${submission._id}/pdf`;
    await Submission.findByIdAndUpdate(submission._id, {
      $set: {
        "pdf.fileName": pdfArtifact.fileName,
        "pdf.filePath": pdfArtifact.filePath,
        "pdf.downloadUrl": downloadUrl,
        "pdf.status": "completed",
        "pdf.error": "",
        "pdf.generatedAt": new Date(),
      },
    });

    if (dispatchToken) {
      completeDispatchAfterSubmission({
        dispatchToken,
        submissionId: submission._id,
        moduleId,
        pdfDownloadUrl: downloadUrl,
      }).catch((hookError) => {
        console.error("schemaFormDispatch hook failed", hookError);
      });
    }
  } catch (error) {
    console.error("schema form PDF generation failed", error);
    if (generatedPdfPath) {
      try {
        const fs = require("fs");
        await fs.promises.unlink(generatedPdfPath);
      } catch (unlinkError) {
        if (unlinkError.code !== "ENOENT") {
          console.error("schema form failed PDF cleanup failed", unlinkError);
        }
      }
    }
    try {
      await Submission.findByIdAndUpdate(submission._id, {
        $set: {
          "pdf.status": "failed",
          "pdf.error": "Your response was saved, but its PDF could not be prepared. Please contact support.",
        },
      });
    } catch (updateError) {
      console.error("schema form PDF failure status update failed", updateError);
    }
    if (dispatchToken && claimTimestamp) {
      try {
        await SchemaFormDispatch.updateOne(
          { token: dispatchToken, status: "SENT", submissionInProgressAt: claimTimestamp },
          { $set: { submissionInProgressAt: null } },
        );
      } catch (releaseError) {
        console.error("schemaFormDispatch PDF failure claim release failed", releaseError);
      }
    }
  }
}

async function resumePendingSubmissionPdfs() {
  const pendingSubmissions = await Submission.find({
    "pdf.downloadUrl": { $in: ["", null] },
    "pdf.status": { $ne: "failed" },
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  }).lean();
  for (const submission of pendingSubmissions) {
    const [moduleDoc, dispatch] = await Promise.all([
      Module.findById(submission.moduleId).select("name").lean(),
      submission.dispatchToken
        ? SchemaFormDispatch.findOne({ token: submission.dispatchToken }).lean()
        : Promise.resolve(null),
    ]);
    if (!moduleDoc || (submission.dispatchToken && !dispatch)) {
      await Submission.findByIdAndUpdate(submission._id, {
        $set: {
          "pdf.status": "failed",
          "pdf.error": "Your response was saved, but its PDF could not be prepared. Please contact support.",
        },
      });
      console.error("schema form PDF recovery could not load submission context", {
        submissionId: submission._id,
      });
      continue;
    }
    const agreementSnapshot = dispatch?.openingAgreementSnapshot || dispatch?.closingAgreementSnapshot || null;
    enqueueSubmissionPdf({
      submission,
      moduleName: moduleDoc.name,
      agreementSnapshot,
      dispatchToken: submission.dispatchToken,
      moduleId: submission.moduleId,
      claimTimestamp: dispatch?.submissionInProgressAt || null,
    });
  }
  await submissionPdfQueue;
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

router.get("/schema-forms/submissions/:dispatchToken/status", async (req, res, next) => {
  try {
    const identifier = req.params.dispatchToken;
    let submission = await Submission.findOne({ dispatchToken: identifier })
      .select("_id pdf")
      .lean();
    if (!submission && /^[a-f\d]{24}$/i.test(identifier)) {
      submission = await Submission.findById(identifier).select("_id pdf").lean();
    }
    if (!submission) {
      return res.status(404).json({ error: "Submission is not available yet." });
    }
    const pdfStatus = submission.pdf?.downloadUrl ? "completed" : submission.pdf?.status || "processing";
    return res.status(200).json({
      id: submission._id,
      pdfStatus,
      pdfDownloadUrl: pdfStatus === "completed" ? submission.pdf.downloadUrl : "",
      message: pdfStatus === "failed"
        ? submission.pdf?.error || "Your response was saved, but its PDF could not be prepared. Please contact support."
        : "Submission successful.",
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/schema-forms/submissions", async (req, res, next) => {
  let claimedDispatchId = null;
  let claimTimestamp = null;
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
        if (previousSubmission.pdf?.status === "failed") {
          throw new ApiError(
            503,
            previousSubmission.pdf.error || "Your response was saved, but its PDF could not be prepared. Please contact support.",
          );
        }
        return res.status(202).json({
          id: previousSubmission._id,
          pdfStatus: "processing",
          message: "Your response was received. Preparing your PDF.",
        });
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
      },
      pdf: { status: "processing" },
    });
    const token = rawDispatchToken || "";
    if (token) {
      void SchemaFormDispatch.updateOne(
        { token, status: "SENT", submissionInProgressAt: claimTimestamp },
        { $set: { pinkSubmissionId: submission._id } },
      ).catch((updateError) => {
        console.error("schemaFormDispatch submission reference update failed", updateError);
      });
    }
    enqueueSubmissionPdf({
      submission: submission.toObject(),
      moduleName: moduleDoc.name,
      agreementSnapshot,
      dispatchToken: token,
      moduleId,
      claimTimestamp,
    });

    return res.status(202).json({
      id: submission._id,
      pdfStatus: "processing",
      statusUrl: `/api/v1/public/forms/schema-forms/submissions/${encodeURIComponent(token || submission._id)}/status`,
      message: "Your response was received. Preparing your PDF.",
    });
  } catch (error) {
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

router.resumePendingSubmissionPdfs = resumePendingSubmissionPdfs;

module.exports = router;
