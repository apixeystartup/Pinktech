const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    eventType: { type: String, required: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "Module" },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "Submission" },
    details: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PinkFormAuditLog", auditLogSchema, "pinkform_audit_logs");
