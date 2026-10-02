const logger = require("@pink/shared").logger;
const nodemailer = require("nodemailer");
const env = require("../config/env");

let transporter = null;

function getTransporter() {
  if (!transporter) {
    const port = Number(env.SMTP_PORT);
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html }) {
  const mode = (env.EMAIL_MODE || "mock").toLowerCase();

  if (mode === "mock") {
    logger.info({ to, subject, mode: "mock" }, "[EMAIL MOCK] Email not sent (EMAIL_MODE=mock)");
    console.log("────────────────────────────────────────");
    console.log("[EMAIL MOCK]");
    console.log(`  To:      ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body:\n${html}`);
    console.log("────────────────────────────────────────");
    return;
  }

  if (mode === "emailjs") {
    logger.warn("EmailJS mode is not yet implemented. Falling back to mock.");
    console.log("────────────────────────────────────────");
    console.log("[EMAIL MOCK — emailjs not implemented]");
    console.log(`  To:      ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body:\n${html}`);
    console.log("────────────────────────────────────────");
    return;
  }

  // SMTP mode
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn("SMTP not configured (missing SMTP_HOST, SMTP_USER, or SMTP_PASS). Skipping email.");
    return;
  }

  const sender = env.SMTP_FROM || env.SMTP_USER;

  await getTransporter().sendMail({
    from: sender,
    to,
    subject,
    html,
  });

  logger.info({ to, subject }, "Email sent via SMTP");
}

module.exports = { sendEmail };
