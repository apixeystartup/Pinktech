const express = require("express");
const mongoose = require("mongoose");
const Joi = require("joi");
const ApiError = require("@pink/shared").ApiError;
const { TEMPLATE_PARTY_KEYS } = require("@pink/shared");
const FormTemplate = require("../models/formTemplate.model");

const router = express.Router();

function denyUnlessAdmin(req, res, action) {
  if (req.auth?.isAdmin) return null;
  return res.status(403).json({ error: `Only administrators can ${action}.` });
}

const templatePayloadSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  bodyText: Joi.string().max(200000).allow("").default(""),
  partyFields: Joi.array().items(Joi.string().valid(...TEMPLATE_PARTY_KEYS)).default([]),
  // Author-filled values for custom blanks found by "Detect required fields".
  fieldValues: Joi.array()
    .items(
      Joi.object({
        tag: Joi.string().trim().min(1).max(120).required(),
        value: Joi.string().max(4000).allow("").default(""),
      }),
    )
    .max(200)
    .default([]),
});

function toDto(doc) {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return plain;
}

// Every tenant designs its own templates; the tenant is always Party 1.
router.get("/", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "list form templates");
    if (denied) return denied;
    const docs = await FormTemplate.find({ tenantId: req.tenantId }).sort({ updatedAt: -1 }).lean();
    return res.json(docs.map(toDto));
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "manage form templates");
    if (denied) return denied;
    const { error, value } = templatePayloadSchema.validate(req.body, { abortEarly: false });
    if (error) throw new ApiError(422, "Validation failed", error.details);
    const doc = await FormTemplate.create({
      ...value,
      tenantId: req.tenantId,
      createdByUserId: req.auth?.userId || null,
    });
    return res.status(201).json(toDto(doc));
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "manage form templates");
    if (denied) return denied;
    if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, "Template not found");
    const { error, value } = templatePayloadSchema.validate(req.body, { abortEarly: false });
    if (error) throw new ApiError(422, "Validation failed", error.details);
    const doc = await FormTemplate.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: value },
      { new: true, runValidators: true },
    ).lean();
    if (!doc) throw new ApiError(404, "Template not found");
    return res.json(toDto(doc));
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const denied = denyUnlessAdmin(req, res, "manage form templates");
    if (denied) return denied;
    if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, "Template not found");
    const doc = await FormTemplate.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!doc) throw new ApiError(404, "Template not found");
    return res.json({ message: "Template deleted.", id: String(doc._id) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
