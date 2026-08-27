const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    status: { type: String, default: "INVITED" },
    orgFromWorkbook: { type: Boolean, default: false, index: true },
    orgLeftAt: { type: Date, default: null },
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.model("User", userSchema);
