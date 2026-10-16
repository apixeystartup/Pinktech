const mongoose = require("mongoose");

const { Schema } = mongoose;

/**
 * One actor on an envelope. Ceremony tokens are stored twice:
 *  - tokenHash: sha256 of the raw link token, indexed for O(1) public lookups;
 *  - tokenEnc:  the raw token AES-256-GCM-encrypted so the link can be re-emailed
 *               later without ever persisting the raw token in plaintext.
 * Both are `select: false` — they never appear in API responses.
 */
const recipientSchema = new Schema(
  {
    order: { type: Number, default: 0, min: 0 },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 320 },
    role: { type: String, enum: ["SIGNER", "APPROVER", "CC"], default: "SIGNER" },
    auth: { type: String, enum: ["EMAIL", "OTP"], default: "EMAIL" },
    status: {
      type: String,
      enum: ["PENDING", "SENT", "VIEWED", "SIGNED", "DECLINED"],
      default: "PENDING",
      index: true,
    },
    tokenHash: { type: String, default: null, index: true, select: false },
    tokenEnc: { type: String, default: null, select: false },
    tokenExpiresAt: { type: Date, default: null },
    lastViewedAt: { type: Date, default: null },
    signedAt: { type: Date, default: null },
    declinedAt: { type: Date, default: null },
    declineReason: { type: String, default: "", maxlength: 1000 },
    signature: {
      mode: { type: String, enum: ["DRAW", "UPLOAD", null], default: null },
      // Small raster data URL (upload/draw pad) or normalized stroke points.
      dataUrl: { type: String, default: "", maxlength: 1300000 },
      points: { type: Schema.Types.Mixed, default: [] },
      ip: { type: String, default: "" },
      ua: { type: String, default: "" },
      consentAt: { type: Date, default: null },
    },
  },
  { _id: true },
);

/** The document(s) to be signed. PDF upload lands in the next increment. */
const documentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 300 },
    sourceUrl: { type: String, default: "", maxlength: 2000 },
    sha256: { type: String, default: "", maxlength: 64 },
    pages: { type: Number, default: 0, min: 0 },
  },
  { _id: true },
);

/**
 * A placeholder on a document page, assigned to one recipient. Coordinates are
 * percentages of the page (0–100) so they survive any render size.
 */
const fieldSchema = new Schema(
  {
    recipientId: { type: Schema.Types.ObjectId, required: true },
    documentId: { type: Schema.Types.ObjectId, default: null },
    type: {
      type: String,
      enum: ["SIGNATURE", "INITIALS", "DATE", "TEXT", "CHECKBOX"],
      default: "SIGNATURE",
    },
    label: { type: String, default: "", maxlength: 200 },
    page: { type: Number, default: 0, min: 0 },
    x: { type: Number, default: 0, min: 0, max: 100 },
    y: { type: Number, default: 0, min: 0, max: 100 },
    w: { type: Number, default: 25, min: 0, max: 100 },
    h: { type: Number, default: 6, min: 0, max: 100 },
    required: { type: Boolean, default: true },
    value: { type: String, default: "", maxlength: 4000 },
  },
  { _id: true },
);

const envelopeSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    status: {
      type: String,
      enum: ["DRAFT", "SENT", "PARTIALLY_SIGNED", "COMPLETED", "DECLINED", "VOIDED", "EXPIRED"],
      default: "DRAFT",
      index: true,
    },
    signingOrder: { type: String, enum: ["SEQUENTIAL", "PARALLEL"], default: "SEQUENTIAL" },
    documents: [documentSchema],
    recipients: [recipientSchema],
    fields: [fieldSchema],
    expiresAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, default: "", maxlength: 1000 },
    createdByUserId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

envelopeSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model("Envelope", envelopeSchema);
