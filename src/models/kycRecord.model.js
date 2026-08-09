const mongoose = require("mongoose");

const kycRecordSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    refType: { type: String, enum: ["EXTERNAL_USER", "SUBMISSION"], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    aadhaarTokenHash: { type: String, default: null },
    panTokenHash: { type: String, default: null },
    status: { type: String, enum: ["PENDING", "VERIFIED", "FAILED", "MANUAL_REVIEW"], default: "PENDING" },
    providerResponseMeta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// One KYC document per external user (avoids split OTP / verify state across duplicates).
kycRecordSchema.index(
  { tenantId: 1, refType: 1, refId: 1 },
  { unique: true, partialFilterExpression: { refType: "EXTERNAL_USER" } }
);

module.exports = mongoose.model("KycRecord", kycRecordSchema);
