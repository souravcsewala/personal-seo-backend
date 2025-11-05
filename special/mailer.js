const https = require('https');

async function sendMail({ to, subject, html, text }) {
  const from = process.env.MAIL_FROM || process.env.EMAIL_USER || process.env.SMTP_USER || 'no-reply@example.com';

  // Enforce HTTP provider (Resend) for all notifications
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    throw new Error('RESEND_API_KEY not configured. Resend is required for all emails.');
  }

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


