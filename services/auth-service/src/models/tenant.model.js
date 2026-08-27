const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    plan: { type: String, default: "starter" },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED"],
      default: "ACTIVE",
      index: true,
    },
    isDemo: { type: Boolean, default: false },
    formLimitPerLogin: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tenant", tenantSchema);
