const mongoose = require("mongoose");

const formSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    title: { type: String, required: true },
    schema: { type: mongoose.Schema.Types.Mixed, default: {} },
    workflowId: { type: mongoose.Schema.Types.ObjectId, ref: "Workflow", required: true, index: true },
    status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT", index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Form", formSchema);
