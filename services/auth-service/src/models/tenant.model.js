const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    logo: { type: String, default: "" },
    code: { type: String, required: true, unique: true, uppercase: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    // Agreement header fields — fill the {{tenant.*}} side of uploaded
    // agreements (name is required, the rest default to blank).
    address: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    registrationNumber: { type: String, trim: true, default: "" },
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
