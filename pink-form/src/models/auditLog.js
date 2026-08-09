const mongoose = require("../resolveMongoose");

const auditLogSchema = new mongoose.Schema(
  {
    eventType: { type: String, required: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "Module" },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "Submission" },
    details: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

/** Separate model/collection so we do not collide with the main app's `AuditLog` (tenant audit). */
module.exports = mongoose.model("PinkFormAuditLog", auditLogSchema, "pinkform_audit_logs");
