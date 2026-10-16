const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    // Agreement header fields — fill the {{tenant.*}} side of uploaded
    // agreements (name is required, the rest default to blank).
    address: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    registrationNumber: { type: String, trim: true, default: "" },
    // Party 1 signature: a base64 data URL saved from the Forms org-data
    // popup (drawn on the pad or an uploaded image). Rendered inline where a
    // template puts {{signature.tenant}}.
    signature: { type: String, default: "" },
    // Party 1 stamp/seal: same data-URL rules as signature; rendered where a
    // sign template places the "stamp" field.
    stamp: { type: String, default: "" },
    adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    plan: { type: String, default: "starter" },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED"],
      default: "ACTIVE",
      index: true,
    },
    isDemo: { type: Boolean, default: false },
    formLimitPerLogin: { type: Number, default: 0 },
    organizationStartDate: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tenant", tenantSchema);
