const express = require("express");
const crypto = require("crypto");
const Joi = require("joi");
const Signature = require("../../models/signature.model");
const authMiddleware = require("../../middlewares/auth.middleware");
const tenantMiddleware = require("../../middlewares/tenant.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");
const ApiError = require("../../common/errors/ApiError");

const router = express.Router();

router.post("/", authMiddleware, tenantMiddleware, permissionMiddleware("workflow.submit"), async (req, res, next) => {
  try {
    const schema = Joi.object({
      refId: Joi.string().required(),
      type: Joi.string().valid("START", "END", "APPROVAL").required(),
      fileUrl: Joi.string().uri().required(),
    });
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      throw new ApiError(422, "Validation failed", error.details);
    }
    const lastSignature = await Signature.findOne({ tenantId: req.tenantId, refId: value.refId }).sort({ createdAt: -1 });
    const previousHash = lastSignature?.hash || null;
    const hash = crypto
      .createHash("sha256")
      .update(`${value.refId}:${value.type}:${value.fileUrl}:${Date.now()}:${previousHash || ""}`)
      .digest("hex");
    const signature = await Signature.create({
      tenantId: req.tenantId,
      refId: value.refId,
      signedBy: req.auth.userId,
      type: value.type,
      fileUrl: value.fileUrl,
      hash,
      previousHash,
    });
    res.status(201).json(signature);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
