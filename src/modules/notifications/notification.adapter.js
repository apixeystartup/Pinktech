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
  const sendgridConfigured = !!(env.EMAIL_MODE === "sendgrid" && env.SENDGRID_API_KEY);
  const smtpConfigured = !!(env.EMAIL_MODE === "smtp" && env.SMTP_HOST);

  logger.info(
    {
      emailMode: env.EMAIL_MODE,
      sendgridConfigured,
      smtpHost: env.SMTP_HOST || "(not set)",
      smtpPort: env.SMTP_PORT,
      smtpUser: env.SMTP_USER ? env.SMTP_USER.replace(/(.{3}).*(@.*)/, "$1***$2") : "(not set)",
      smtpFrom: env.SMTP_FROM || "(not set)",
      configured: sendgridConfigured || smtpConfigured,
    },
    "Email configuration loaded"
  );

  if (sendgridConfigured) {
    logger.info("SendGrid API configured — emails will be delivered");
    return true;
  }

  if (smtpConfigured) {
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

  logger.warn("No email provider configured — emails will be logged only (mock mode)");
  return false;
}

async function sendEmail({ to, subject, html }) {
  if (env.EMAIL_MODE === "sendgrid" && env.SENDGRID_API_KEY) {
    const sender = env.SMTP_FROM || env.SMTP_USER || "no-reply@pink.local";
    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: sender },
          subject,
          content: [{ type: "text/html", value: html }],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`SendGrid API error ${response.status}: ${errBody}`);
      }

      logger.info({ to, subject }, "SendGrid email sent successfully");
      return { success: true, mode: "sendgrid" };
    } catch (err) {
      logger.error({ to, subject, err: err.message }, "SendGrid email failed");
      throw err;
    }
  }

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
