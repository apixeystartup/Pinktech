const mongoose = require("mongoose");

const positionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    title: { type: String, default: "" },
    levelName: { type: String, default: "" },
    parentPositionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, default: "ACTIVE" },
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.model("Position", positionSchema);
