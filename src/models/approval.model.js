const mongoose = require("mongoose");

const approvalSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "FormSubmission", required: true, index: true },
    actedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: ["APPROVE", "REJECT", "RETURN", "ESCALATE"], required: true },
    remarks: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Approval", approvalSchema);
