const mongoose = require("mongoose");

const schemaFormDispatchSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    externalUserId: { type: mongoose.Schema.Types.ObjectId, ref: "ExternalUser", required: true, index: true },
    dispatchedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Employee who owns sharing this link with the recipient (doctor compliance
    // flow): they copy the link from their page and send it over whatever
    // channel they prefer.
    handlerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    // Agreement template picked while creating the form, and the composed
    // agreement frozen at assign time (Party 1 + doctor blanks resolved), so
    // later template edits never rewrite an issued link.
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "FormTemplate", default: null },
    openingTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: "FormTemplate", default: null },
    closingTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: "FormTemplate", default: null },
    agreementHtml: { type: String, default: "" },
    openingAgreementHtml: { type: String, default: "" },
    closingAgreementHtml: { type: String, default: "" },
    // EMAIL = the service mails the link. MANUAL = no email is sent at all; the
    // handler shares the link manually.
    delivery: { type: String, enum: ["EMAIL", "MANUAL"], default: "EMAIL" },
    token: { type: String, required: true, unique: true, index: true },
    instructions: { type: String, default: "" },
    dueDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ["SENT", "IN_APPROVAL", "APPROVED", "REJECTED", "CORRECTION_REQUIRED"],
      default: "SENT",
      index: true,
    },
    pinkSubmissionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    pdfRelativeUrl: { type: String, default: "" },
    approvalChainUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    currentApprovalIndex: { type: Number, default: -1 },
    revision: { type: Number, default: 1 },
    linkVersion: { type: Number, default: 1 },
    linkHistory: [
      {
        token: { type: String, required: true },
        version: { type: Number, required: true },
        createdAt: { type: Date, default: Date.now },
        revokedAt: { type: Date, default: null },
        usedAt: { type: Date, default: null },
      },
    ],
    submissions: [
      {
        revision: { type: Number, required: true },
        submissionId: { type: mongoose.Schema.Types.ObjectId, default: null },
        pdfRelativeUrl: { type: String, default: "" },
        submittedAt: { type: Date, default: Date.now },
        // Frozen copy of the form definition at submission time so responses stay
        // readable/meaningful even after the Super Admin edits the form later.
        formSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
      },
    ],
    rejection: {
      reason: { type: String, default: "" },
      byUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
      stepIndex: { type: Number, default: -1 },
    },
    rejectionHistory: [
      {
        revision: { type: Number, required: true },
        reason: { type: String, default: "" },
        byUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        at: { type: Date, default: Date.now },
        stepIndex: { type: Number, default: -1 },
      },
    ],
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