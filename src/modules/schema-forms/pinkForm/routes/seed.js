const express = require("express");
const Module = require("../models/module");
const authMiddleware = require("../../../../middlewares/auth.middleware");
const tenantMiddleware = require("../../../../middlewares/tenant.middleware");

const router = express.Router();

router.post("/client-form", authMiddleware, tenantMiddleware, async (req, res, next) => {
  try {
    const existing = await Module.findOne({ name: "Client Onboarding Form", moduleType: "FORM", tenantId: req.tenantId });
    if (existing) return res.json({ message: "Seed already exists.", moduleId: existing._id });
    const seeded = await Module.create({
      name: "Client Onboarding Form",
      moduleType: "FORM",
      isPublished: true,
      tenantId: req.tenantId,
      createdByUserId: req.auth.userId,
      formSchema: {
        settings: { submitLabel: "Send Inquiry", successMessage: "Thank you. We will contact you shortly.", allowDraft: false },
        fields: [
          { key: "fullName", label: "Full Name", type: "text", required: true, validations: { minLength: 2 } },
          { key: "email", label: "Email", type: "email", required: true },
          { key: "phone", label: "Phone Number", type: "phone", required: true },
          { key: "service", label: "Service Required", type: "select", required: true, options: ["Website Design", "Workflow Automation", "Maintenance"] },
          { key: "budget", label: "Estimated Budget (USD)", type: "number", required: false, validations: { min: 0 } },
          { key: "message", label: "Project Details", type: "textarea", required: true, validations: { minLength: 10 } },
        ],
      },
    });
    return res.status(201).json({ message: "Seed form created.", moduleId: seeded._id });
  } catch (error) { return next(error); }
});

module.exports = router;
