const { getFirebaseAdmin } = require('./firebaseAdmin');
const PushToken = require('../models/PushToken');
const PushSend = require('../models/PushSend');

async function sendAnnouncementPush(announcement) {
  let sent = 0;
  let failed = 0;
  let tokenCount = 0;
  try {
    const admin = getFirebaseAdmin();

    // Collect tokens even if messaging is unavailable, so we can log attempts
    const tokens = await PushToken.find({}).select('token').lean();
    const tokenList = tokens.map((t) => t.token).filter(Boolean);
    tokenCount = tokenList.length;

    // Only attempt send if an app is initialized and we have tokens
    if (admin && Array.isArray(admin.apps) && admin.apps.length > 0 && tokenList.length > 0) {
      const title = announcement?.title || 'New announcement';
      const body = stripHtml((announcement?.contentHtml || '')).slice(0, 140);
      const url = announcement?.linkUrl || '/announcements';

      const chunkSize = 500;
      for (let i = 0; i < tokenList.length; i += chunkSize) {
        const chunk = tokenList.slice(i, i + chunkSize);
        try {
          const resp = await admin.messaging().sendEachForMulticast({
            tokens: chunk,
            webpush: {
              notification: {
                title,
                body,
                icon: '/favicon.ico',
                data: { url }
              },
              fcmOptions: { link: url }
            },
            data: { url }
          });
          sent += (resp?.successCount || 0);
          failed += (resp?.failureCount || 0);
          if (Array.isArray(resp?.responses)) {
            const toDelete = [];
            let logged = 0;
            resp.responses.forEach((r, idx) => {
              const code = r?.error?.code || '';
              if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
                toDelete.push(chunk[idx]);
              }
              if (!r.success && r.error && logged < 5) {
                try {
                  console.error('[Push] FCM response error:', r.error.code || '', r.error.message || '', 'tokenIdx=', idx);
                } catch (_) {}
                logged += 1;
              }
            });
            if (toDelete.length) await PushToken.deleteMany({ token: { $in: toDelete } });
          }
        } catch (err) {
          // Count the whole chunk as failed if the request itself errored out
          failed += chunk.length;
          try { console.error('[Push] FCM send error:', err?.code || '', err?.message || err); } catch (_) {}
        }
      }
    } else if (tokenList.length > 0 && (!admin || !Array.isArray(admin.apps) || admin.apps.length === 0)) {
      try { console.warn('[Push] Admin messaging not initialized; skipping send'); } catch (_) {}
    }
  } catch (_) {
    try { console.error('[Push] Unexpected error during push send'); } catch (__) {}
  } finally {
    try {
      const announcementId = announcement && (announcement._id || announcement.id);
      if (announcementId) {
        await PushSend.create({
          announcement: announcementId,
          successCount: sent,
          failureCount: failed,
          sentAt: new Date(),
        });
        try {
          console.log(
            `[Push] Announcement ${announcementId} → tokens=${tokenCount}, success=${sent}, failed=${failed}`
          );
        } catch (__) {}
      }
    } catch (_) {}
  }
  return { sent, failed };
}

function stripHtml(html) {
  try {
    return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch { return ''; }
}

module.exports = { sendAnnouncementPush };



