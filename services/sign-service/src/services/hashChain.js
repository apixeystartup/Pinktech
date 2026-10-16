const crypto = require("crypto");

/** Hex sha256 of a value. */
function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

/**
 * Canonical hash for one audit event. Fields are stringified in a fixed order
 * so the same event always produces the same hash regardless of key ordering.
 */
function computeEventHash({ prevHash, envelopeId, seq, type, actor, data, at }) {
  const canonical = JSON.stringify({
    prevHash: prevHash || "",
    envelopeId: String(envelopeId),
    seq,
    type,
    actor: actor || {},
    data: data || {},
    at: new Date(at).toISOString(),
  });
  return sha256(canonical);
}

module.exports = { sha256, computeEventHash };
