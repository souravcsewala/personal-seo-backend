const nodemailer = require('nodemailer');
const https = require('https');

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
  const from = process.env.MAIL_FROM || process.env.EMAIL_USER || process.env.SMTP_USER || 'no-reply@example.com';

  // 1) Prefer HTTP provider (Resend) when configured — avoids SMTP firewalls/timeouts
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const payload = JSON.stringify({ from, to, subject, html, text });
    const options = {
      method: 'POST',
      hostname: 'api.resend.com',
      path: '/emails',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 8000,
    };
    const result = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(data || '{}');
              resolve({ provider: 'resend', id: parsed.id || null });
            } catch (_) {
              resolve({ provider: 'resend', id: null });
            }
          } else {
            reject(new Error(`Resend error ${res.statusCode}: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Resend request timeout')));
      req.write(payload);
      req.end();
    });
    return result;
  }

  // 2) SMTP transport (Gmail or custom)
  const t = getTransporter();
  if (!t) {
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


