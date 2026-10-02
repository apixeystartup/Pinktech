const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    empCode: { type: String, default: null },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    orgContactEmail: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null },
    passwordHash: { type: String, default: null, select: false },
    status: {
      type: String,
      enum: ["INVITED", "OTP_PENDING", "ACTIVE", "DISABLED", "LOCKED"],
      default: "INVITED",
      index: true,
    },
    roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }],
    currentPositionId: { type: mongoose.Schema.Types.ObjectId, ref: "Position", default: null },
    reportingToUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    zone: { type: String, default: null, trim: true },
    region: { type: String, default: null, trim: true },
    state: { type: String, default: null, trim: true },
    hq: { type: String, default: null, trim: true },
    designationOverride: { type: String, default: null, trim: true },
    orgLeftAt: { type: Date, default: null, index: true },
    orgFromWorkbook: { type: Boolean, default: false, index: true },
    orgSeatVacant: { type: Boolean, default: false },
    orgRowNumber: { type: Number, default: null },
    orgSno: { type: Number, default: null },
    reportingManagerRaw: { type: String, default: null },
    managerResolution: { type: String, default: null },
    doj: { type: String, default: null },
    dob: { type: String, default: null },
    gender: { type: String, default: null },
    inviteToken: { type: String, default: null, index: true, select: false },
    inviteExpiry: { type: Date, default: null, select: false },
    otpCode: { type: String, default: null, select: false },
    otpExpiry: { type: Date, default: null, select: false },
    otpVerified: { type: Boolean, default: false },
    invitationCode: { type: String, default: null, select: false, index: true },
    resetToken: { type: String, default: null, select: false, index: true },
    resetExpiry: { type: Date, default: null, select: false },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index(
  { tenantId: 1, empCode: 1 },
  {
    unique: true,
    partialFilterExpression: { empCode: { $exists: true, $type: "string", $gt: "" } },
  }
);
userSchema.index(
  { tenantId: 1, invitationCode: 1 },
  {
    unique: true,
    partialFilterExpression: { invitationCode: { $exists: true, $type: "string", $gt: "" } },
  }
);

module.exports = mongoose.model("User", userSchema);
