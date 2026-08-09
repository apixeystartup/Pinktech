const mongoose = require("mongoose");

const publicFormTokenSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true, index: true },
    externalUserId: { type: mongoose.Schema.Types.ObjectId, ref: "ExternalUser", required: true },
    token: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PublicFormToken", publicFormTokenSchema);
