const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    status: { type: String, default: "INVITED" },
    empCode: { type: String, default: null },
    roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }],
    reportingToUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    invitedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    orgFromWorkbook: { type: Boolean, default: false, index: true },
    orgLeftAt: { type: Date, default: null },
  },
  { timestamps: true, strict: false }
);

userSchema.index({ tenantId: 1, invitedByUserId: 1 });
userSchema.index({ tenantId: 1, reportingToUserId: 1 });

module.exports = mongoose.model("User", userSchema);
