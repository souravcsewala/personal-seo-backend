const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const gmailUser = process.env.EMAIL_USER;
  const gmailPass = process.env.EMAIL_PASS;
  if (gmailUser && gmailPass) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
    });
    return transporter;
  }
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
    });
    return transporter;
  }
  return null;
}

async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  const from = process.env.MAIL_FROM || process.env.EMAIL_USER || process.env.SMTP_USER;
  if (!t) {
    // Fallback to console for development if SMTP not configured
    console.log('[MAIL:FALLBACK]', { to, subject, text: text || '', html: (html || '').slice(0, 2000) });
    return { mocked: true };
  }
  const info = await t.sendMail({ from, to, subject, text, html });
  return info;
}

module.exports = { sendMail };

// Helper to build links pointing to frontend domain
module.exports.buildFrontendUrl = function buildFrontendUrl(path, req) {
  // Prefer explicit FRONTEND_BASE_URL. If absent, choose by environment:
  // - production: https://blog.souravengineerwala.com
  // - otherwise:  http://localhost:3000
  let base = process.env.FRONTEND_BASE_URL;
  if (!base) {
    const env = (process.env.NODE_ENV || '').toLowerCase();
    base = env === 'production' ? 'https://blog.souravengineerwala.com' : 'http://localhost:3000';
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
};


