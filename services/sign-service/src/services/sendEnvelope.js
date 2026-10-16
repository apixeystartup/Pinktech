const ApiError = require("@pink/shared").ApiError;
const { assertTransition, blockingRecipients } = require("./statusMachine");
const { issueToken, signingUrlFor } = require("./ceremonyToken");
const { appendEvent } = require("./eventLog");

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Send an envelope: DRAFT -> SENT, one fresh ceremony token per signer (CC gets
 * none), SENT audit event. Returns the raw signing links exactly once — they
 * are never persisted in plaintext.
 */
async function sendEnvelope(doc, { actor = {}, expiresAt = null } = {}) {
  assertTransition(doc.status, "SENT");
  const signers = blockingRecipients(doc);
  if (!signers.length) {
    throw new ApiError(422, "Add at least one signer before sending.");
  }
  const expires = expiresAt || doc.expiresAt || new Date(Date.now() + FOURTEEN_DAYS_MS);
  doc.expiresAt = expires;
  doc.sentAt = new Date();

  const signingLinks = [];
  for (const r of doc.recipients) {
    if (r.role === "CC") continue;
    const { token, tokenHash, tokenEnc } = issueToken();
    r.tokenHash = tokenHash;
    r.tokenEnc = tokenEnc;
    r.tokenExpiresAt = expires;
    r.status = "SENT";
    r.signedAt = null;
    r.declinedAt = null;
    signingLinks.push({ recipientId: r._id, name: r.name, email: r.email, url: signingUrlFor(token) });
  }
  doc.status = assertTransition(doc.status, "SENT");
  await doc.save();

  await appendEvent(doc, {
    type: "SENT",
    actor,
    data: { signers: signers.length, expiresAt: expires.toISOString() },
  });

  return { signingLinks, expiresAt: expires };
}

module.exports = { sendEnvelope };
