const mongoose = require("mongoose");

const importSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    fileName: { type: String, required: true },
    totalRows: { type: Number, default: 0 },
    successRows: { type: Number, default: 0 },
    failedRows: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["PENDING", "DONE", "FAILED"], default: "PENDING" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Import", importSchema);
