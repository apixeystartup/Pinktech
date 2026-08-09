const express = require("express");
const Joi = require("joi");
const Document = require("../../models/document.model");
const Signature = require("../../models/signature.model");
const KycRecord = require("../../models/kycRecord.model");
const Approval = require("../../models/approval.model");
const authMiddleware = require("../../middlewares/auth.middleware");
const tenantMiddleware = require("../../middlewares/tenant.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");
const ApiError = require("../../common/errors/ApiError");
const { generatePdfUrl } = require("./pdf.adapter");

const router = express.Router();

router.post("/generate-pdf", authMiddleware, tenantMiddleware, permissionMiddleware("workflow.submit"), async (req, res, next) => {
  try {
    const schema = Joi.object({
      refId: Joi.string().required(),
    });
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      throw new ApiError(422, "Validation failed", error.details);
    }

    const signatures = await Signature.find({ tenantId: req.tenantId, refId: value.refId });
    const kycRecords = await KycRecord.find({ tenantId: req.tenantId, refId: value.refId });
    const approvals = await Approval.find({ tenantId: req.tenantId, submissionId: value.refId });
    const pdfUrl = generatePdfUrl({ tenantId: req.tenantId, refId: value.refId });

    const document = await Document.create({
      tenantId: req.tenantId,
      refId: value.refId,
      pdfUrl,
    });
    res.status(201).json({
      document,
      sourceSummary: {
        signatures: signatures.length,
        kycRecords: kycRecords.length,
        approvals: approvals.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:documentId", authMiddleware, tenantMiddleware, permissionMiddleware("report.view"), async (req, res, next) => {
  try {
    const document = await Document.findOne({ _id: req.params.documentId, tenantId: req.tenantId });
    if (!document) {
      throw new ApiError(404, "Document not found");
    }
    res.status(200).json(document);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
