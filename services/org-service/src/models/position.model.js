const mongoose = require("mongoose");

const positionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role", required: false, index: true, default: null },
    title: { type: String, required: true, trim: true },
    levelName: { type: String, required: true, trim: true },
    parentPositionId: { type: mongoose.Schema.Types.ObjectId, ref: "Position", default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true }
);

positionSchema.index({ tenantId: 1, parentPositionId: 1 });
positionSchema.index({ tenantId: 1, roleId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Position", positionSchema);
