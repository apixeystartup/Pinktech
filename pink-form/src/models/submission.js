const mongoose = require("../resolveMongoose");

const submissionSchema = new mongoose.Schema(
  {
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Module",
      required: true,
      index: true
    },
    agreements: {
      pre: {
        accepted: { type: Boolean, default: false },
        text: { type: String, default: "" },
        signatureDataUrl: { type: String, default: "" },
        acceptedAt: { type: Date }
      },
      post: {
        accepted: { type: Boolean, default: false },
        text: { type: String, default: "" },
        signatureDataUrl: { type: String, default: "" },
        acceptedAt: { type: Date }
      }
    },
    pdf: {
      fileName: { type: String, default: "" },
      filePath: { type: String, default: "" },
      downloadUrl: { type: String, default: "" },
      generatedAt: { type: Date }
    },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    meta: {
      ip: { type: String, default: "" },
      userAgent: { type: String, default: "" },
      source: { type: String, default: "public-form" }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Submission", submissionSchema);
