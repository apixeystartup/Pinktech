const mongoose = require("mongoose");

const auditReadStateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    scope: { type: String, required: true },
    lastReadAt: { type: Date, required: true },
  },
  { timestamps: true },
);

auditReadStateSchema.index({ userId: 1, scope: 1 }, { unique: true });

module.exports = mongoose.model("AuditReadState", auditReadStateSchema);
