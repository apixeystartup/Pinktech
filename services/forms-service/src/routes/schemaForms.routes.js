const express = require("express");
const mongoose = require("mongoose");
const Module = require("../models/schemaFormModule.model");
const Tenant = require("../models/tenant.model");
const { validateModulePayload } = require("../validation/formSchema");

const router = express.Router();

function toApiModule(moduleDoc) {
  if (!moduleDoc) return moduleDoc;
  const plain = typeof moduleDoc.toObject === "function" ? moduleDoc.toObject() : moduleDoc;
  return {
    ...plain,
    schema: plain.formSchema
  };
}

function normalizeIncomingModulePayload(payload) {
  const normalized = { ...payload };
  if (normalized.schema) {
    normalized.formSchema = normalized.schema;
    delete normalized.schema;
  }
  return normalized;
}

router.post("/", async (req, res, next) => {
  try {
    const errors = validateModulePayload(req.body);
    if (errors.length) {
      return res.status(400).json({ errors });
    }

    const tenantId = req.tenantId || req.body.tenantId;
    if (tenantId && mongoose.Types.ObjectId.isValid(String(tenantId))) {
      const tenant = await Tenant.findById(tenantId).lean();
      if (tenant && tenant.isDemo && tenant.formLimitPerLogin > 0) {
        const count = await Module.countDocuments({ tenantId: tenant._id, moduleType: "FORM" });
        if (count >= tenant.formLimitPerLogin) {
          return res.status(403).json({ error: `Demo tenant form limit reached (${tenant.formLimitPerLogin} forms max per login).` });
        }
      }
    }

    const moduleDoc = await Module.create(normalizeIncomingModulePayload(req.body));
    return res.status(201).json(toApiModule(moduleDoc));
  } catch (error) {
    return next(error);
  }
});

router.get("/modules", async (req, res, next) => {
  try {
    const modules = await Module.find({ moduleType: "FORM" })
      .sort({ createdAt: -1 })
      .lean();
    return res.json(modules.map(toApiModule));
  } catch (error) {
    return next(error);
  }
});

router.get("/modules/:id", async (req, res, next) => {
  try {
    const moduleDoc = await Module.findById(req.params.id).lean();
    if (!moduleDoc) {
      return res.status(404).json({ error: "Module not found." });
    }

    return res.json(toApiModule(moduleDoc));
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const errors = validateModulePayload(req.body);
    if (errors.length) {
      return res.status(400).json({ errors });
    }

    const updated = await Module.findByIdAndUpdate(req.params.id, normalizeIncomingModulePayload(req.body), {
      new: true,
      runValidators: true
    });
    if (!updated) {
      return res.status(404).json({ error: "Module not found." });
    }

    return res.json(toApiModule(updated));
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await Module.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Module not found." });
    }
    return res.json({ message: "Form deleted.", id: req.params.id });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
