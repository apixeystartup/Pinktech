const mongoose = require("mongoose");

const workflowStepSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    positionId: { type: mongoose.Schema.Types.ObjectId, ref: "Position", required: true },
    onTimeoutEscalateToPositionId: { type: mongoose.Schema.Types.ObjectId, ref: "Position", default: null },
  },
  { _id: false }
);

const workflowSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true },
    steps: { type: [workflowStepSchema], default: [] },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Workflow", workflowSchema);
