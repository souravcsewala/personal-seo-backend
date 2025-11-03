const Announcement = require("../models/Announcement");
const PushSend = require("../models/PushSend");
const ErrorHandeler = require("../special/errorHandelar");
const { sanitizeHtml } = require("../utils/sanitizeHtml");

function parseDateInput(value, endOfDay) {
  if (!value) return undefined;
  const str = String(value).trim();
  // When the UI sends a date-only value (YYYY-MM-DD), treat it as local time
  // at the start or end of that day to avoid timezone truncation at UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
    return new Date(`${str}T${time}`);
  }
  // Otherwise, fall back to native parsing
  return new Date(str);
}

function isActiveWindow(a) {
  const now = new Date();
  if (a.startAt && now < new Date(a.startAt)) return false;
  if (a.endAt && now > new Date(a.endAt)) return false;
  return !!a.isActive;
}

async function getActiveAnnouncement(req, res, next) {
  try {
    const list = await Announcement.find({ isActive: true })
      .sort({ priority: -1, createdAt: -1 })
      .limit(10);
    const active = list.find(isActiveWindow) || null;
    return res.json({ success: true, data: active });
  } catch (e) { next(e); }
}

async function listAnnouncements(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Announcement.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Announcement.countDocuments({}),
    ]);
    res.json({ success: true, data: items, pagination: { page, limit, total, hasMore: skip + items.length < total } });
  } catch (e) { next(e); }
}

const { sendAnnouncementPush } = require("../special/pushNotifier");

async function createAnnouncement(req, res, next) {
  try {
    const { title, contentHtml, linkUrl, isActive, priority, startAt, endAt } = req.body;
    if (!title || !String(title).trim()) return next(new ErrorHandeler("Title is required", 400));
    const sanitized = contentHtml ? sanitizeHtml(String(contentHtml)) : "";
    let link = String(linkUrl || "").trim();
    if (link && !/^https?:\/\//i.test(link) && !link.startsWith("/")) {
      return next(new ErrorHandeler("Invalid link URL", 400));
    }
    const doc = await Announcement.create({
      title: String(title).trim(),
      contentHtml: sanitized,
      linkUrl: link,
      isActive: typeof isActive === 'boolean' ? isActive : true,
      priority: typeof priority === 'number' ? priority : 0,
      startAt: parseDateInput(startAt, false),
      endAt: parseDateInput(endAt, true),
      createdBy: req.userid || (req.user && req.user._id) || undefined,
    });
    // Optional push notification
    try {
      if (req.body && (req.body.sendPush === true || req.body.sendPush === 'true')) {
        await sendAnnouncementPush(doc);
      }
    } catch (_) {}
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
}

async function updateAnnouncement(req, res, next) {
  try {
    const { id } = req.params;
    const a = await Announcement.findById(id);
    if (!a) return next(new ErrorHandeler("Announcement not found", 404));
    const { title, contentHtml, linkUrl, isActive, priority, startAt, endAt } = req.body;
    if (typeof title !== 'undefined') a.title = String(title || '').trim();
    if (typeof contentHtml !== 'undefined') a.contentHtml = sanitizeHtml(String(contentHtml || ''));
    if (typeof linkUrl !== 'undefined') {
      const link = String(linkUrl || '').trim();
      if (link && !/^https?:\/\//i.test(link) && !link.startsWith("/")) {
        return next(new ErrorHandeler("Invalid link URL", 400));
      }
      a.linkUrl = link;
    }
    if (typeof isActive !== 'undefined') a.isActive = !!isActive;
    if (typeof priority !== 'undefined') a.priority = Number(priority || 0);
    if (typeof startAt !== 'undefined') a.startAt = parseDateInput(startAt, false);
    if (typeof endAt !== 'undefined') a.endAt = parseDateInput(endAt, true);
    await a.save();
    // Optional push notification
    try {
      if (req.body && (req.body.sendPush === true || req.body.sendPush === 'true')) {
        await sendAnnouncementPush(a);
      }
    } catch (_) {}
    res.json({ success: true, data: a });
  } catch (e) { next(e); }
}

async function deleteAnnouncement(req, res, next) {
  try {
    const { id } = req.params;
    const a = await Announcement.findById(id);
    if (!a) return next(new ErrorHandeler("Announcement not found", 404));
    await Announcement.deleteOne({ _id: id });
    res.json({ success: true, data: { deleted: true } });
  } catch (e) { next(e); }
}

module.exports = {
  getActiveAnnouncement,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};

// Admin: list push send logs for a specific announcement
async function listPushSendsForAnnouncement(req, res, next) {
  try {
    const { id } = req.params;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      PushSend.find({ announcement: id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      PushSend.countDocuments({ announcement: id }),
    ]);
    res.json({ success: true, data: items, pagination: { page, limit, total, hasMore: skip + items.length < total } });
  } catch (e) { next(e); }
}

module.exports.listPushSendsForAnnouncement = listPushSendsForAnnouncement;



