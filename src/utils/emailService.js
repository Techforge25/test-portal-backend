const nodemailer = require("nodemailer");
const { logger } = require("./logger");

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user,
      pass,
    },
  });

  return cachedTransporter;
}

async function sendEmail({ to, subject, text, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    logger.warn("SMTP is not configured. Skipping email send.");
    return false;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
  return true;
}

module.exports = { sendEmail };
