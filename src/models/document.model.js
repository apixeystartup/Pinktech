const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    pdfUrl: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);
