const mongoose = require("mongoose");

const schemaFormDispatchSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    externalUserId: { type: mongoose.Schema.Types.ObjectId, ref: "ExternalUser", required: true, index: true },
    dispatchedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    instructions: { type: String, default: "" },
    dueDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ["SENT", "IN_APPROVAL", "APPROVED", "REJECTED"],
      default: "SENT",
      index: true,
    },
    pinkSubmissionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    pdfRelativeUrl: { type: String, default: "" },
    approvalChainUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    /** Index into approvalChainUserIds for the approver who must act; meaningful when status is IN_APPROVAL */
    currentApprovalIndex: { type: Number, default: -1 },
    eventLog: [
      {
        at: { type: Date, default: Date.now },
        kind: { type: String, required: true },
        detail: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true }
);

schemaFormDispatchSchema.index({ tenantId: 1, dispatchedByUserId: 1, createdAt: -1 });

module.exports = mongoose.model("SchemaFormDispatch", schemaFormDispatchSchema);
