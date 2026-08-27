const logger = require("@pink/shared").logger;
const nodemailer = require("nodemailer");
const env = require("../config/env");

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT),
      secure: false,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html }) {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn("SMTP not configured (missing SMTP_USER or SMTP_PASS). Skipping email.");
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
