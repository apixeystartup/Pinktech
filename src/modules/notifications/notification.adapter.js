const logger = require("../../common/logger");
const nodemailer = require("nodemailer");
const env = require("../../config/env");

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT),
      secure: Number(env.SMTP_PORT) === 465,
      auth: env.SMTP_USER
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : undefined,
    });
  }
  return transporter;
}

async function verifySmtpConnection() {
  const smtpConfigured = !!(env.EMAIL_MODE === "smtp" && env.SMTP_HOST);
  logger.info(
    {
      emailMode: env.EMAIL_MODE,
      smtpHost: env.SMTP_HOST || "(not set)",
      smtpPort: env.SMTP_PORT,
      smtpUser: env.SMTP_USER ? env.SMTP_USER.replace(/(.{3}).*(@.*)/, "$1***$2") : "(not set)",
      smtpFrom: env.SMTP_FROM || "(not set)",
      configured: smtpConfigured,
    },
    "SMTP configuration loaded"
  );

  if (!smtpConfigured) {
    logger.warn("SMTP not configured — emails will be logged only (mock mode)");
    return false;
  }

  try {
    await getTransporter().verify();
    logger.info("SMTP connection verified successfully — emails will be delivered");
    return true;
  } catch (err) {
    logger.error(
      { err: err.message, host: env.SMTP_HOST, port: env.SMTP_PORT },
      "SMTP connection verification failed — emails will NOT be delivered"
    );
    return false;
  }
}

async function sendEmail({ to, subject, html }) {
  if (env.EMAIL_MODE === "smtp" && env.SMTP_HOST) {
    const sender = env.SMTP_FROM || env.SMTP_USER || "no-reply@pink.local";
    try {
      await getTransporter().sendMail({
        from: sender,
        to,
        subject,
        html,
      });
      logger.info({ to, subject }, "SMTP email sent successfully");
      return { success: true, mode: "smtp" };
    } catch (err) {
      logger.error({ to, subject, err: err.message }, "SMTP email failed");
      throw err;
    }
  }

  logger.info({ to, subject, htmlLength: html?.length || 0 }, "Mock email (not delivered)");
  return { success: true, mode: "mock" };
}

module.exports = {
  sendEmail,
  verifySmtpConnection,
};
