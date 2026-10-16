const mongoose = require("mongoose");

const { Schema } = mongoose;

/**
 * Read-only mirror of the platform tenants collection — the Party 1 source for
 * auto-filling sign-template fields (same pattern kyc-service uses). Includes
 * the org-data images (signature/stamp) that placeholder tags resolve to.
 */
const tenantSchema = new Schema(
  {
    name: { type: String, default: "" },
    code: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    registrationNumber: { type: String, default: "" },
    signature: { type: String, default: "" },
    stamp: { type: String, default: "" },
    status: { type: String, default: "ACTIVE" },
  },
  { collection: "tenants", timestamps: false },
);

module.exports = mongoose.model("SignTenantMirror", tenantSchema, "tenants");
