const mongoose = require("mongoose");

const signatureSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    signedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    type: { type: String, enum: ["START", "END", "APPROVAL"], required: true },
    fileUrl: { type: String, required: true },
    hash: { type: String, required: true },
    previousHash: { type: String, default: null },
    signedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Signature", signatureSchema);
