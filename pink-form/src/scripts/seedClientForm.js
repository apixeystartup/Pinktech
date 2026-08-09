require("dotenv").config();
const { connectDb } = require("../db");
const Module = require("../models/module");

async function seed() {
  await connectDb();

  const existing = await Module.findOne({ name: "Client Onboarding Form", moduleType: "FORM" });
  if (existing) {
    console.log(`Seed already exists: ${existing._id}`);
    process.exit(0);
  }

  const seeded = await Module.create({
    name: "Client Onboarding Form",
    moduleType: "FORM",
    isPublished: true,
    formSchema: {
      settings: {
        submitLabel: "Send Inquiry",
        successMessage: "Thank you. We will contact you shortly.",
        allowDraft: false
      },
      fields: [
        { key: "fullName", label: "Full Name", type: "text", required: true, validations: { minLength: 2 } },
        { key: "email", label: "Email", type: "email", required: true },
        { key: "phone", label: "Phone Number", type: "phone", required: true },
        {
          key: "service",
          label: "Service Required",
          type: "select",
          required: true,
          options: ["Website Design", "Workflow Automation", "Maintenance"]
        },
        { key: "budget", label: "Estimated Budget (USD)", type: "number", required: false, validations: { min: 0 } },
        { key: "message", label: "Project Details", type: "textarea", required: true, validations: { minLength: 10 } }
      ]
    }
  });

  console.log(`Created seed form: ${seeded._id}`);
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
