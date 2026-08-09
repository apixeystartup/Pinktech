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
    /** Official / work email from HR workbook (does not replace login `email` unless import promotes synthetic logins). */
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
    /** Optional geography for org scope inference (Excel columns can populate later). */
    zone: { type: String, default: null, trim: true },
    region: { type: String, default: null, trim: true },
    state: { type: String, default: null, trim: true },
    hq: { type: String, default: null, trim: true },
    /** Optional display title in org explorer (defaults to primary role name). */
    designationOverride: { type: String, default: null, trim: true },
    /** When set, person is treated as "left" (removed list, excluded from active org snapshot). */
    orgLeftAt: { type: Date, default: null, index: true },
    /** Row came from Org Explorer workbook import (may be removed on full re-import). */
    orgFromWorkbook: { type: Boolean, default: false, index: true },
    /** Vacant seat row (no filled employee). */
    orgSeatVacant: { type: Boolean, default: false },
    /** Original Excel row number (for stable vacant-seat matching on re-import). */
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
    /** Shown in post-OTP email; used with login email on Set password screen. */
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
/** Unique EMP ID per tenant only when a non-empty code is set (many users may have no emp code). */
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
