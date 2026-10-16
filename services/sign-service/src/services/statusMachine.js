const ApiError = require("@pink/shared").ApiError;

/**
 * Envelope state machine (Zoho-Sign-style request statuses):
 *
 *   DRAFT ──send──▶ SENT ──first signature──▶ PARTIALLY_SIGNED ──last──▶ COMPLETED
 *     │              │                            │
 *     ├──▶ VOIDED ◀──┴────────── decline ─────────┴──▶ DECLINED
 *     └──▶ VOIDED                 expiry ──▶ EXPIRED
 */
const ENVELOPE_TRANSITIONS = {
  DRAFT: ["SENT", "VOIDED"],
  SENT: ["PARTIALLY_SIGNED", "COMPLETED", "DECLINED", "VOIDED", "EXPIRED"],
  PARTIALLY_SIGNED: ["COMPLETED", "DECLINED", "VOIDED", "EXPIRED"],
  COMPLETED: [],
  DECLINED: [],
  VOIDED: [],
  EXPIRED: [],
};

function assertTransition(from, to) {
  const allowed = ENVELOPE_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new ApiError(422, `An envelope cannot move from ${from} to ${to}.`);
  }
  return to;
}

function isTerminal(status) {
  return ["COMPLETED", "DECLINED", "VOIDED", "EXPIRED"].includes(status);
}

/** Recipients whose actions actually block completion (CC never signs). */
function blockingRecipients(envelope) {
  return (envelope.recipients || []).filter((r) => r.role !== "CC");
}

/**
 * Who signs next on a SEQUENTIAL envelope: the lowest-`order` blocking
 * recipient that has not finished. Returns null for PARALLEL or when nobody
 * is waiting.
 */
function currentSigner(envelope) {
  const waiting = blockingRecipients(envelope)
    .filter((r) => r.status !== "SIGNED" && r.status !== "DECLINED")
    .sort((a, b) => a.order - b.order);
  if (!waiting.length) return null;
  if (envelope.signingOrder === "SEQUENTIAL") return waiting[0];
  return null; // parallel: everyone waiting may act, so no single "current"
}

/**
 * Roll recipient states up to the next envelope status.
 * Returns the current status unchanged when nothing has moved.
 */
function rollupStatus(envelope) {
  const blockers = blockingRecipients(envelope);
  if (!blockers.length) return envelope.status;
  if (blockers.some((r) => r.status === "DECLINED")) return "DECLINED";
  if (blockers.every((r) => r.status === "SIGNED")) return "COMPLETED";
  if (blockers.some((r) => r.status === "SIGNED")) return "PARTIALLY_SIGNED";
  return envelope.status;
}

module.exports = {
  ENVELOPE_TRANSITIONS,
  assertTransition,
  isTerminal,
  blockingRecipients,
  currentSigner,
  rollupStatus,
};
