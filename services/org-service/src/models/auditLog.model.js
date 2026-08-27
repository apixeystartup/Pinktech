const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, required: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditLogSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
