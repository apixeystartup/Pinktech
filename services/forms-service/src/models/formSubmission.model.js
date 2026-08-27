const mongoose = require("mongoose");

const formSubmissionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true, index: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    submitterType: { type: String, enum: ["INTERNAL", "EXTERNAL"], required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "REJECTED", "RETURNED"],
      default: "PENDING",
      index: true,
    },
    currentStep: { type: Number, default: 0 },
    currentApproverPositionId: { type: mongoose.Schema.Types.ObjectId, ref: "Position", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FormSubmission", formSubmissionSchema);
