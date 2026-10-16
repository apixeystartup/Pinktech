const mongoose = require("mongoose");

const { Schema } = mongoose;

/**
 * Read-only mirror of the kyc-service ExternalUser collection — a doctor is an
 * ExternalUser with type "DOCTOR" and is the Party 2 source when an envelope is
 * created from a template ("assign with doctor selection").
 */
const externalUserSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null },
    type: { type: String, default: "DOCTOR" },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    status: { type: String, default: "ACTIVE" },
    doctorCode: { type: String, default: "" },
    specialization: { type: String, default: "" },
    qualification: { type: String, default: "" },
    medicalRegistrationNumber: { type: String, default: "" },
    clinicHospitalName: { type: String, default: "" },
    address: { type: String, default: "" },
  },
  { collection: "externalusers", timestamps: false },
);

module.exports = mongoose.model("SignExternalUserMirror", externalUserSchema, "externalusers");
