const mongoose = require("mongoose");

const { Schema } = mongoose;

/**
 * Append-only, hash-chained audit log for one envelope.
 *
 * Every event stores sha256(prevHash + canonical payload) so any retroactive
 * edit or deletion breaks the chain and is detectable. `immutable` blocks
 * mongoose-level updates; there are no update routes on this collection.
 *
 * `data` MUST NEVER carry raw ceremony tokens or signature blobs — writers
 * redact (e.g. `signatureChars: 4721` instead of the data URL).
 */
const envelopeEventSchema = new Schema(
  {
    envelopeId: { type: Schema.Types.ObjectId, required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    // Per-envelope sequence starting at 1; unique with envelopeId.
    seq: { type: Number, required: true, min: 1 },
    type: {
      type: String,
      enum: [
        "CREATED",
        "RECIPIENT_ADDED",
        "RECIPIENT_REMOVED",
        "FIELDS_SET",
        "SENT",
        "VIEWED",
        "SIGNED",
        "DECLINED",
        "COMPLETED",
        "VOIDED",
        "EXPIRED",
      ],
      required: true,
    },
    actor: {
      kind: { type: String, enum: ["SENDER", "RECIPIENT", "SYSTEM"], required: true },
      userId: { type: Schema.Types.ObjectId, default: null },
      recipientId: { type: Schema.Types.ObjectId, default: null },
      email: { type: String, default: "" },
      ip: { type: String, default: "" },
      ua: { type: String, default: "" },
    },
    data: { type: Schema.Types.Mixed, default: {} },
    at: { type: Date, required: true },
    prevHash: { type: String, default: "" },
    hash: { type: String, required: true },
  },
  { timestamps: false, immutable: true },
);

envelopeEventSchema.index({ envelopeId: 1, seq: 1 }, { unique: true });

module.exports = mongoose.model("EnvelopeEvent", envelopeEventSchema);
