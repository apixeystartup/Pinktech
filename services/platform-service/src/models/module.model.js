const mongoose = require("mongoose");

const moduleSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    moduleType: { type: String, enum: ["FORM", "MCQ", "DOC"], default: "FORM" },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    isPublished: { type: Boolean, default: false },
    formSchema: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, strict: false }
);

moduleSchema.index({ tenantId: 1, createdByUserId: 1, moduleType: 1 });

module.exports = mongoose.model("Module", moduleSchema);
