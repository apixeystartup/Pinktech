const crypto = require("crypto");
const env = require("../config/env");
const { sha256 } = require("./hashChain");

const TOKEN_BYTES = 32;

// 32-byte key derived from the existing JWT secret — no new secret to manage.
function encryptionKey() {
  return crypto.createHash("sha256").update(`${env.JWT_ACCESS_SECRET}:sign-ceremony`).digest();
}

function encryptToken(raw) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

function decryptToken(tokenEnc) {
  try {
    const [iv, tag, data] = String(tokenEnc || "").split(".");
    if (!iv || !tag || !data) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Issue a fresh ceremony token: raw value for the recipient's link (returned
 * once), plus the two DB-safe forms (lookup hash + re-emailable ciphertext).
 */
function issueToken() {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: sha256(token), tokenEnc: encryptToken(token) };
}

/** Lookup key for an incoming raw token. */
function hashToken(raw) {
  return sha256(raw);
}

/**
 * Frontend URL the signer opens (`/sign/:token` — the ceremony SPA route,
 * still to be built). Production prefers APP_PUBLIC_URL.
 */
function signingUrlFor(rawToken) {
  const base =
    env.NODE_ENV === "production"
      ? env.APP_PUBLIC_URL || env.DEV_APP_PUBLIC_URL
      : env.DEV_APP_PUBLIC_URL;
  return `${String(base || "").replace(/\/+$/, "")}/sign/${rawToken}`;
}

module.exports = { issueToken, hashToken, decryptToken, signingUrlFor };
