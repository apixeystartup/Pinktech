const EnvelopeEvent = require("../models/envelopeEvent.model");
const { computeEventHash } = require("./hashChain");

/**
 * Append one event to an envelope's hash chain.
 *
 * seq is assigned from the current chain head; on a concurrent write the
 * unique {envelopeId, seq} index rejects the duplicate and we re-read and
 * retry a few times before giving up.
 */
async function appendEvent(envelope, { type, actor = {}, data = {} }) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const head = await EnvelopeEvent.findOne({ envelopeId: envelope._id })
      .sort({ seq: -1 })
      .select("seq hash")
      .lean();
    const seq = (head?.seq || 0) + 1;
    const prevHash = head?.hash || "";
    const at = new Date();
    const hash = computeEventHash({
      prevHash,
      envelopeId: envelope._id,
      seq,
      type,
      actor,
      data,
      at,
    });
    try {
      return await EnvelopeEvent.create({
        envelopeId: envelope._id,
        tenantId: envelope.tenantId,
        seq,
        type,
        actor,
        data,
        at,
        prevHash,
        hash,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      lastError = error; // seq race — re-read the head and retry
    }
  }
  throw lastError || new Error("Could not append envelope event");
}

/** Chain head for an envelope (empty string when no events exist yet). */
async function chainHead(envelopeId) {
  const head = await EnvelopeEvent.findOne({ envelopeId })
    .sort({ seq: -1 })
    .select("seq hash")
    .lean();
  return head || { seq: 0, hash: "" };
}

module.exports = { appendEvent, chainHead };
