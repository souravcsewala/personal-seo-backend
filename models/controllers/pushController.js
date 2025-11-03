const PushToken = require("../models/PushToken");
const ErrorHandeler = require("../special/errorHandelar");

async function registerToken(req, res, next) {
  try {
    const userId = req.userid || (req.user && req.user._id);
    if (!userId) return next(new ErrorHandeler("Unauthorized", 401));
    const token = String(req.body?.token || "").trim();
    const platform = String(req.body?.platform || "web");
    if (!token) return next(new ErrorHandeler("Token is required", 400));
    const now = new Date();
    const existing = await PushToken.findOne({ token });
    if (existing) {
      existing.user = existing.user || userId;
      existing.platform = platform;
      existing.lastSeen = now;
      await existing.save();
      return res.json({ success: true, data: { registered: true } });
    }
    await PushToken.create({ user: userId, token, platform, lastSeen: now });
    res.status(201).json({ success: true, data: { registered: true } });
  } catch (e) { next(e); }
}

async function unregisterToken(req, res, next) {
  try {
    const userId = req.userid || (req.user && req.user._id);
    if (!userId) return next(new ErrorHandeler("Unauthorized", 401));
    const token = String((req.body && req.body.token) || req.query?.token || "").trim();
    if (!token) return next(new ErrorHandeler("Token is required", 400));
    await PushToken.deleteOne({ token });
    res.json({ success: true, data: { unregistered: true } });
  } catch (e) { next(e); }
}

// Public guest registration (no auth)
async function registerTokenGuest(req, res, next) {
  try {
    const token = String(req.body?.token || "").trim();
    const platform = String(req.body?.platform || "web");
    if (!token) return next(new ErrorHandeler("Token is required", 400));
    const now = new Date();
    const existing = await PushToken.findOne({ token });
    if (existing) {
      existing.platform = platform;
      existing.lastSeen = now;
      await existing.save();
      return res.json({ success: true, data: { registered: true, guest: true } });
    }
    await PushToken.create({ token, platform, lastSeen: now });
    res.status(201).json({ success: true, data: { registered: true, guest: true } });
  } catch (e) { next(e); }
}

module.exports = { registerToken, unregisterToken, registerTokenGuest };



