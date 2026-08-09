const express = require("express");
const crypto = require("crypto");
const Joi = require("joi");
const Form = require("../../models/form.model");
const Workflow = require("../../models/workflow.model");
const ExternalUser = require("../../models/externalUser.model");
const PublicFormToken = require("../../models/publicFormToken.model");
const FormSubmission = require("../../models/formSubmission.model");
const ApiError = require("../../common/errors/ApiError");
const authMiddleware = require("../../middlewares/auth.middleware");
const tenantMiddleware = require("../../middlewares/tenant.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");

const router = express.Router();

router.post("/", authMiddleware, tenantMiddleware, permissionMiddleware("form.create"), async (req, res, next) => {
  try {
    const schema = Joi.object({
      title: Joi.string().required(),
      schema: Joi.object().required(),
      workflowId: Joi.string().required(),
    });
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      throw new ApiError(422, "Validation failed", error.details);
    }
    const workflow = await Workflow.findOne({ _id: value.workflowId, tenantId: req.tenantId });
    if (!workflow) {
      throw new ApiError(404, "Workflow not found");
    }
    const form = await Form.create({
      tenantId: req.tenantId,
      title: value.title,
      schema: value.schema,
      workflowId: value.workflowId,
    });
    res.status(201).json(form);
  } catch (error) {
    next(error);
  }
});

router.get("/", authMiddleware, tenantMiddleware, permissionMiddleware("form.view"), async (req, res, next) => {
  try {
    const forms = await Form.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
    res.status(200).json(forms);
  } catch (error) {
    next(error);
  }
});

router.post("/:formId/publish", authMiddleware, tenantMiddleware, permissionMiddleware("form.publish"), async (req, res, next) => {
  try {
    const form = await Form.findOneAndUpdate(
      { _id: req.params.formId, tenantId: req.tenantId },
      { status: "PUBLISHED" },
      { returnDocument: "after" }
    );
    if (!form) {
      throw new ApiError(404, "Form not found");
    }
    res.status(200).json(form);
  } catch (error) {
    next(error);
  }
});

router.post("/:formId/public-token", authMiddleware, tenantMiddleware, permissionMiddleware("form.publish"), async (req, res, next) => {
  try {
    const schema = Joi.object({
      externalType: Joi.string().required(),
      name: Joi.string().required(),
      email: Joi.string().email().allow(null),
      phone: Joi.string().allow(null),
      expiresInMinutes: Joi.number().min(5).max(10080).default(1440),
    });
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      throw new ApiError(422, "Validation failed", error.details);
    }
    const form = await Form.findOne({ _id: req.params.formId, tenantId: req.tenantId, status: "PUBLISHED" });
    if (!form) {
      throw new ApiError(404, "Published form not found");
    }
    const externalUser = await ExternalUser.create({
      tenantId: req.tenantId,
      createdByUserId: req.auth.userId,
      type: value.externalType,
      name: value.name,
      email: value.email || null,
      phone: value.phone || null,
    });
    const token = crypto.randomBytes(24).toString("hex");
    const tokenDoc = await PublicFormToken.create({
      tenantId: req.tenantId,
      formId: form._id,
      externalUserId: externalUser._id,
      token,
      expiresAt: new Date(Date.now() + value.expiresInMinutes * 60 * 1000),
    });
    res.status(201).json({ token: tokenDoc.token, expiresAt: tokenDoc.expiresAt });
  } catch (error) {
    next(error);
  }
});

router.get("/public/:token", async (req, res, next) => {
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

router.post("/public/:token/submit", async (req, res, next) => {
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

module.exports = router;
