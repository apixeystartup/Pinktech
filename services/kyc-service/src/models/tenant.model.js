const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    // Read-only copy of the agreement header fields (source of truth lives
    // in auth-service / platform-service). Used for {{tenant.*}} resolution.
    email: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    registrationNumber: { type: String, trim: true, default: "" },
    // Party 1 signature (data URL) saved from the tenant's Forms org popup.
    // Rendered inline where a template puts {{signature.tenant}}.
    signature: { type: String, default: "" },
    plan: { type: String, default: "starter" },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tenant", tenantSchema);