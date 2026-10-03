/**
 * Free-tier transactional email provider registry.
 *
 * Quota behaviour differs per provider and drives failover correctness:
 *   - "reject": provider refuses the send, so the chain advances to the next provider.
 *   - "queue":   provider accepts and holds the message for later (often days).
 *               The chain can never detect this, so counters MUST gate selection,
 *               otherwise an OTP silently disappears into a queue instead of being
 *               delivered by the next provider.
 *
 * Verified free-tier limits (2026). Caps may be overridden per provider via
 * EMAIL_PROVIDER_<NAME>_DAILY_CAP / _HOURLY_CAP.
 */

const PROVIDERS = {
  resend: {
    label: "Resend",
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    defaultUser: "resend",
    dailyCap: 100,
    hourlyCap: null,
    quotaBehavior: "reject",
    signupUrl: "https://resend.com",
    notes: "Password is the Resend API key. Free tier domain verification required.",
  },
  brevo: {
    label: "Brevo",
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    defaultUser: "",
    dailyCap: 300,
    hourlyCap: null,
    quotaBehavior: "reject",
    signupUrl: "https://www.brevo.com",
    notes:
      "Username is your Brevo SMTP login (account email or [ID]@smtp-brevo.com); password must be an SMTP key, NOT an API key. Requires an explicitly created transactional sender.",
  },
  mailjet: {
    label: "Mailjet",
    host: "in-v3.mailjet.com",
    port: 587,
    secure: false,
    defaultUser: "",
    dailyCap: 200,
    hourlyCap: null,
    quotaBehavior: "queue",
    signupUrl: "https://www.mailjet.com",
    notes: "Username/password are the API key pair from Account > API keys. Over-quota sends are queued to the next day, never rejected.",
  },
  smtp2go: {
    label: "SMTP2GO",
    host: "mail.smtp2go.com",
    port: 2525,
    secure: false,
    defaultUser: "",
    dailyCap: 200,
    hourlyCap: null,
    quotaBehavior: "queue",
    signupUrl: "https://www.smtp2go.com",
    notes:
      "Free plan is 1,000/month and allows only 5 verified senders. Without a verified sender domain the account is throttled to 25 emails/hour. Over-quota sends are queued.",
  },
  sendpulse: {
    label: "SendPulse",
    host: "smtp-pulse.com",
    port: 587,
    secure: false,
    defaultUser: "",
    dailyCap: 400,
    hourlyCap: 50,
    quotaBehavior: "queue",
    signupUrl: "https://sendpulse.com",
    notes:
      "Password is the dedicated SMTP password under SMTP settings > General, not the dashboard password. Free tier allows only 3 senders and 2 domains, and throttles to 50/hour.",
  },
};

const PROVIDER_NAMES = Object.keys(PROVIDERS);

/**
 * Default chain order.
 *
 * "reject" providers come first because a refusal is a signal we can act on.
 * "queue" providers come last because an accepted-but-held send is worse than a
 * visible failure: the recipient waits hours with no error anywhere.
 */
const DEFAULT_CHAIN = ["resend", "brevo", "mailjet", "smtp2go", "sendpulse"];

function providerDef(name) {
  return PROVIDERS[String(name || "").trim().toLowerCase()] || null;
}

function envKey(name, suffix) {
  return `EMAIL_PROVIDER_${String(name).trim().toUpperCase()}_${suffix}`;
}

function envInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Resolve a provider's effective runtime config from environment.
 * Falls back to registry defaults so a provider only needs its credentials set.
 */
function resolveProvider(name) {
  const def = providerDef(name);
  if (!def) return null;

  const key = envKey(name, "");
  const prefix = key;

  const port = envInt(process.env[`${prefix}PORT`], def.port);
  const secureRaw = process.env[`${prefix}SECURE`];

  return {
    name: def.label,
    id: String(name).trim().toLowerCase(),
    host: process.env[`${prefix}HOST`] || def.host,
    port,
    secure: secureRaw === undefined ? def.secure || port === 465 : /^(1|true|yes)$/i.test(secureRaw),
    user: process.env[`${prefix}USER`] || def.defaultUser,
    pass: process.env[`${prefix}PASS`] || "",
    dailyCap: envInt(process.env[`${prefix}DAILY_CAP`], def.dailyCap),
    hourlyCap: envInt(process.env[`${prefix}HOURLY_CAP`], def.hourlyCap),
    quotaBehavior: def.quotaBehavior,
  };
}

/** Ordered list of provider ids to attempt. */
function resolveChain() {
  const raw = process.env.EMAIL_PROVIDERS;
  if (!raw) return DEFAULT_CHAIN.slice();
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = { PROVIDERS, PROVIDER_NAMES, DEFAULT_CHAIN, providerDef, resolveProvider, resolveChain, envKey };