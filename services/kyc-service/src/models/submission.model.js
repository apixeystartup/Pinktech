const mongoose = require("mongoose");

/**
 * Read-only view of the `submissions` collection written by the forms service
 * (model name and collection must match `pinkFormSubmission.model.js` there).
 * Used by Doctor Management to show agreement signing details and answers.
 */
const submissionSchema = new mongoose.Schema(
  {
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Module",
      required: true,
      index: true,
    },
    agreements: {
      pre: {
        accepted: { type: Boolean, default: false },
        text: { type: String, default: "" },
        signatureDataUrl: { type: String, default: "" },
        acceptedAt: { type: Date },
      },
      post: {
        accepted: { type: Boolean, default: false },
        text: { type: String, default: "" },
        signatureDataUrl: { type: String, default: "" },
        acceptedAt: { type: Date },
      },
    },
    pdf: {
      fileName: { type: String, default: "" },
      filePath: { type: String, default: "" },
      downloadUrl: { type: String, default: "" },
      generatedAt: { type: Date },
    },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    meta: {
      ip: { type: String, default: "" },
      userAgent: { type: String, default: "" },
      source: { type: String, default: "public-form" },
    },
  },
  { timestamps: true, collection: "submissions" }
);

module.exports = mongoose.model("Submission", submissionSchema);
