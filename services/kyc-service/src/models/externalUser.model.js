const mongoose = require("mongoose");

const externalUserSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "INACTIVE" },
    // --- Doctor profile (Doctor Management tab). Optional: only set for doctor
    // records. `draft` marks a record created with "Save as Draft".
    doctorCode: { type: String, default: null },
    specialization: { type: String, default: null },
    qualification: { type: String, default: null },
    yearsOfExperience: { type: Number, default: null },
    gender: { type: String, default: null },
    dateOfBirth: { type: Date, default: null },
    medicalRegistrationNumber: { type: String, default: null },
    pan: { type: String, default: null },
    aadhaar: { type: String, default: null },
    clinicHospitalName: { type: String, default: null },
    address: { type: String, default: null },
    draft: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExternalUser", externalUserSchema);