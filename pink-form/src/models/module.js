const mongoose = require("../resolveMongoose");

const fieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: [
        "text",
        "email",
        "phone",
        "number",
        "textarea",
        "select",
        "radio",
        "checkbox",
        "date",
        "file"
      ]
    },
    required: { type: Boolean, default: false },
    placeholder: { type: String, default: "" },
    helpText: { type: String, default: "" },
    options: [{ type: String }],
    validations: {
      minLength: Number,
      maxLength: Number,
      min: Number,
      max: Number,
      pattern: String,
      allowedFileTypes: [{ type: String }],
      maxFileSizeMb: Number
    },
    ui: {
      width: { type: String, enum: ["full", "half"], default: "full" }
    }
  },
  { _id: false }
);

const moduleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    moduleType: { type: String, enum: ["FORM", "MCQ", "DOC"], required: true },
    /** Scoped to tenant when set via KYC / org console (pink main app). */
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    isPublished: { type: Boolean, default: false },
    formSchema: {
      fields: { type: [fieldSchema], default: [] },
      settings: {
        submitLabel: { type: String, default: "Submit" },
        successMessage: {
          type: String,
          default: "Thanks. Your response has been received."
        },
        allowDraft: { type: Boolean, default: false }
      }
    }
  },
  { timestamps: true }
);

moduleSchema.index({ moduleType: 1 });

module.exports = mongoose.model("Module", moduleSchema);
