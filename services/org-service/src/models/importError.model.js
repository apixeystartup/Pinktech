const mongoose = require("mongoose");

const importErrorSchema = new mongoose.Schema(
  {
    importId: { type: mongoose.Schema.Types.ObjectId, ref: "Import", required: true, index: true },
    rowNumber: { type: Number, required: true },
    reason: { type: String, required: true },
    rawData: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ImportError", importErrorSchema);
