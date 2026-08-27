const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    positionId: { type: mongoose.Schema.Types.ObjectId, ref: "Position", required: true, index: true },
    activeFrom: { type: Date, required: true, default: Date.now },
    activeTo: { type: Date, default: null },
    isCurrent: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

assignmentSchema.index({ tenantId: 1, positionId: 1, isCurrent: 1 });

module.exports = mongoose.model("Assignment", assignmentSchema);
