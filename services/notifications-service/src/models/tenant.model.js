const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["ACTIVE", "SUSPENDED"], default: "ACTIVE", index: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Tenant", tenantSchema);
