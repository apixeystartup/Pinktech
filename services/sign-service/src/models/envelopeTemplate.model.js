const mongoose = require("mongoose");

const { Schema } = mongoose;

/**
 * A stored file on a sign template / envelope. `filePath` is the absolute disk
 * path (repo-root/storage/sign/...) — stripped from API DTOs; clients use the
 * `/templates/:id/document` route instead.
 */
const storedDocumentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 300 },
    filePath: { type: String, default: "", maxlength: 1000 },
    sha256: { type: String, default: "", maxlength: 64 },
    pages: { type: Number, default: 0, min: 0 },
  },
  { _id: true },
);

/**
 * A draggable placeholder on the agreement PDF. `tag` ties the placement to the
 * shared placeholder system so values auto-resolve when an envelope is created
 * from the template with a selected doctor:
 *   tenant.* / doctor.*  <- org data / selected doctor (TEXT, pre-filled)
 *   signature.tenant     <- org-data Party 1 signature (IMAGE, pre-filled)
 *   signature.doctor     <- drawn/uploaded in the signing ceremony (SIGNATURE)
 *   stamp                <- org-data Party 1 stamp (IMAGE, pre-filled)
 *   date                 <- creation date (DATE)
 *   custom.*             <- free-text left for the signer (TEXT)
 * Coordinates are percentages of the rendered page (0–100).
 */
const templateFieldSchema = new Schema(
  {
    tag: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    type: {
      type: String,
      enum: ["SIGNATURE", "INITIALS", "IMAGE", "TEXT", "DATE", "CHECKBOX"],
      default: "TEXT",
    },
    label: { type: String, default: "", maxlength: 200 },
    page: { type: Number, default: 0, min: 0 },
    x: { type: Number, default: 0, min: 0, max: 100 },
    y: { type: Number, default: 0, min: 0, max: 100 },
    w: { type: Number, default: 25, min: 0, max: 100 },
    h: { type: Number, default: 6, min: 0, max: 100 },
    required: { type: Boolean, default: true },
  },
  { _id: true },
);

/**
 * Zoho-Sign-style reusable template: an uploaded agreement PDF plus placed
 * fields. Envelopes are instantiated from it with a doctor (Party 2) at
 * assignment time.
 */
const envelopeTemplateSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    documents: [storedDocumentSchema],
    fields: [templateFieldSchema],
    createdByUserId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

envelopeTemplateSchema.index({ tenantId: 1, name: 1 });

module.exports = mongoose.model("EnvelopeTemplate", envelopeTemplateSchema);
