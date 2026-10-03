/**
 * Shared transactional email sender with a fail-over provider chain.
 *
 * Design rules, in priority order:
 *
 *  1. NEVER THROW. Callers include forgot-password, which must return the same
 *     response whether or not the address exists. Throwing on send failure
 *     would 500 for real users and 200 for unknown ones, turning the endpoint
 *     into a user-enumeration oracle. Failures are returned and logged instead.
 *
 *  2. Fail over only on errors that PROVE nothing was sent. An ambiguous
 *     failure (timeout after the message was accepted) must not be retried on
 *     another provider, or the recipient receives a duplicate OTP.
 *
 *  3. Never fail over on configuration errors such as a bad API key. Silently
 *     re-sending to the next provider would burn that provider's daily quota
 *     every day and hide the misconfiguration indefinitely.
 *
 *  4. Bound the whole chain with a deadline so a slow provider cannot stack
 *     five SMTP timeouts in front of a user waiting on an OTP.
 */

const nodemailer = require("nodemailer");
const logger = require("./logger");
const { resolveProvider, resolveChain, DEFAULT_CHAIN } = require("./mailProviders");
const counters = require("./mailCounters");

/** Connection never established, so the message certainly was not accepted. */
const SAFE_FAILOVER_CODES = new Set([
  "EDNS",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EADDRNOTAVAIL",
]);

/** Failure happened after connecting; delivery is unknown, so retrying risks duplicates. */
const AMBIGUOUS_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ESOCKET", "EPIPE"]);

/** Credential/config problems. Retrying elsewhere only hides them. */
const CONFIG_CODES = new Set(["EAUTH", "EENVELOPE", "EPROTO", "ECERT"]);

const QUOTA_PATTERNS = [
  "quota",
  "rate limit",
  "ratelimit",
  "rate_limit",
  "too many",
  "daily limit",
  "sending limit",
  "monthly limit",
  "limit exceeded",
  "exceeded",
  "429",
  "throttl",
  "insufficient credit",
  "not_enough_credits",
  "too_many_emails",
];

function errorText(err) {
  return [err?.code, err?.response, err?.message].filter(Boolean).join(" ").toLowerCase();
}

/**
 * Decide whether a failed attempt may be retried on the next provider.
 * Unknown errors abort: silently spraying providers is worse than surfacing one.
 */
function classify(err) {
  if (!err) return "abort";

  const code = String(err.code || "").toUpperCase();
  const smtp = Number(err.responseCode || 0);
  const text = errorText(err);

  // Credential failures are always misconfiguration. Retrying on another
  // provider would silently consume its quota and hide the problem.
  if (code === "EAUTH" || smtp === 530 || smtp === 535) return "abort";

  // Quota and rate limits are checked BEFORE the generic envelope/config codes
  // because providers wrap quota refusals in EENVELOPE. That is precisely the
  // case the chain exists to retry, so it must win.
  if (QUOTA_PATTERNS.some((p) => text.includes(p))) return "failover";
  if (smtp === 429 || smtp === 421 || smtp === 450 || smtp === 451 || smtp === 452) return "failover";

  // Remaining envelope/TLS problems are configuration, not capacity.
  if (CONFIG_CODES.has(code)) return "abort";

  // Failed after connecting: delivery unknown, so retrying risks duplicates.
  if (AMBIGUOUS_CODES.has(code)) return "abort";

  // Never got a connection, so nothing was sent.
  if (SAFE_FAILOVER_CODES.has(code)) return "failover";

  // 5xx recipient-level rejections are permanent for that address.
  if (smtp >= 550 && smtp <= 559 && smtp !== 552) return "abort";

  return "abort";
}

const transporters = new Map();

// Injection seam: production always uses nodemailer directly, tests swap in a
// stub so no SMTP connection is ever attempted.
let transportFactory = (options) => nodemailer.createTransport(options);

function getTransporter(provider) {
  if (transporters.has(provider.id)) return transporters.get(provider.id);
  const transporter = transportFactory({
    host: provider.host,
    port: provider.port,
    secure: provider.secure,
    auth: { user: provider.user, pass: provider.pass },
    // Bound every phase so one unresponsive provider cannot stall a request.
    connectionTimeout: Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.EMAIL_SOCKET_TIMEOUT_MS || 15000),
    pool: false,
  });
  transporters.set(provider.id, transporter);
  return transporter;
}

function resolveFrom(provider) {
  return (
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.EMAIL_PROVIDER_FROM ||
    provider.user
  );
}

function configured(provider) {
  return Boolean(provider && provider.host && provider.user && provider.pass);
}

function mockSend({ to, subject, html }) {
  logger.info({ to, subject, mode: "mock" }, "[EMAIL MOCK] Email not sent (EMAIL_MODE=mock)");
  console.log("----------------------------------------");
  console.log("[EMAIL MOCK]");
  console.log(`  To:      ${to}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Body:\n${html}`);
  console.log("----------------------------------------");
}

/**
 * Send one email, attempting each configured provider in order.
 *
 * @returns {Promise<{ok: boolean, provider: string|null, attempts: Array, error: string|null}>}
 *          Never rejects.
 */
async function sendEmail({ to, subject, html, text } = {}) {
  const mode = (process.env.EMAIL_MODE || "smtp").toLowerCase();

  if (!to) {
    logger.warn({ subject }, "[EMAIL] Skipped: missing recipient");
    return { ok: false, provider: null, attempts: [], error: "missing recipient" };
  }

  if (mode === "mock" || mode !== "smtp") {
    if (mode !== "mock") {
      logger.warn({ mode }, "[EMAIL] Unknown EMAIL_MODE, falling back to mock");
    }
    mockSend({ to, subject, html });
    return { ok: true, provider: "mock", attempts: [], error: null };
  }

  const chainIds = resolveChain();
  const providers = chainIds.map((id) => resolveProvider(id)).filter(Boolean);
  if (!providers.length) {
    logger.warn({ chainIds, fallback: DEFAULT_CHAIN }, "[EMAIL] No resolvable providers in chain");
    return { ok: false, provider: null, attempts: [], error: "no providers configured" };
  }

  const usable = providers.filter((p) => configured(p));
  for (const p of providers) {
    if (!configured(p)) {
      logger.debug({ provider: p.id }, "[EMAIL] Provider skipped: missing host/user/pass");
    }
  }

  let ordered = usable;
  try {
    ordered = await counters.orderByHeadroom(usable);
  } catch (err) {
    logger.debug({ err: err.message }, "[EMAIL] Counter ordering unavailable, using configured order");
  }

  const deadline = Date.now() + Number(process.env.EMAIL_CHAIN_TIMEOUT_MS || 20000);
  const attempts = [];
  let lastError = null;

  for (const provider of ordered) {
    if (Date.now() > deadline) {
      logger.warn({ provider: provider.id }, "[EMAIL] Chain deadline reached, stopping");
      break;
    }

    try {
      const info = await getTransporter(provider).sendMail({
        from: resolveFrom(provider),
        to,
        subject,
        html,
        ...(text ? { text } : {}),
      });

      await counters.recordSend(provider);
      attempts.push({ provider: provider.id, ok: true, messageId: info?.messageId });

      logger.info(
        { to, subject, provider: provider.id, fallback: provider.id !== ordered[0]?.id },
        "[EMAIL] Sent"
      );
      return { ok: true, provider: provider.id, attempts, error: null };
    } catch (err) {
      const decision = classify(err);
      attempts.push({
        provider: provider.id,
        ok: false,
        decision,
        code: err?.code,
        responseCode: err?.responseCode,
      });

      if (decision === "abort") {
        logger.error(
          { to, subject, provider: provider.id, code: err?.code, responseCode: err?.responseCode, msg: err?.message },
          "[EMAIL] Permanent failure, not failing over"
        );
        lastError = `${provider.id}: ${err?.message || "send failed"}`;
        break;
      }

      lastError = `${provider.id}: ${err?.message || "send failed"}`;
      logger.warn(
        { to, subject, provider: provider.id, code: err?.code, responseCode: err?.responseCode },
        "[EMAIL] Provider unavailable, trying next"
      );
    }
  }

  logger.error({ to, subject, attempts, lastError }, "[EMAIL] All providers failed");
  return { ok: false, provider: null, attempts, error: lastError };
}

/** Test seam: clears cached transporters so config changes take effect. */
function resetTransporters() {
  transporters.clear();
}

/** Test seam: overrides transport construction. Pass nothing to restore nodemailer. */
function setTransportFactory(factory) {
  transportFactory = factory || ((options) => nodemailer.createTransport(options));
  transporters.clear();
}

module.exports = { sendEmail, classify, resetTransporters, setTransportFactory };