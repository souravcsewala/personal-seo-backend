const User = require("../models/User");
const ErrorHandeler = require("../special/errorHandelar");
const jwt = require('jsonwebtoken');

// POST /api/users/:id/follow
async function followUser(req, res, next) {
  try {
    const targetId = req.params.id;
    const me = req.userid || (req.user && req.user._id);
    if (!me) return next(new ErrorHandeler("Unauthorized", 401));
    if (!targetId || String(targetId) === String(me)) return next(new ErrorHandeler("Invalid target", 400));

    const [meDoc, target] = await Promise.all([
      User.findById(me).select("_id following"),
      User.findById(targetId).select("_id followers"),
    ]);
    if (!target) return next(new ErrorHandeler("User not found", 404));

    await Promise.all([
      User.updateOne({ _id: me }, { $addToSet: { following: target._id } }),
      User.updateOne({ _id: target._id }, { $addToSet: { followers: me } }),
    ]);

    const fresh = await User.findById(target._id).select("followers following");
    res.json({ success: true, message: "Followed", data: { isFollowing: true, followers: fresh.followers.length, following: fresh.following.length } });
  } catch (e) { next(e); }
}

// DELETE /api/users/:id/follow
async function unfollowUser(req, res, next) {
  try {
    const targetId = req.params.id;
    const me = req.userid || (req.user && req.user._id);
    if (!me) return next(new ErrorHandeler("Unauthorized", 401));
    if (!targetId || String(targetId) === String(me)) return next(new ErrorHandeler("Invalid target", 400));

    const target = await User.findById(targetId).select("_id");
    if (!target) return next(new ErrorHandeler("User not found", 404));

    await Promise.all([
      User.updateOne({ _id: me }, { $pull: { following: target._id } }),
      User.updateOne({ _id: target._id }, { $pull: { followers: me } }),
    ]);

    const fresh = await User.findById(target._id).select("followers following");
    res.json({ success: true, message: "Unfollowed", data: { isFollowing: false, followers: fresh.followers.length, following: fresh.following.length } });
  } catch (e) { next(e); }
}

// GET /api/users/:id/follow-stats
async function getFollowStats(req, res, next) {
  try {
    const targetId = req.params.id;
    let me = req.userid || (req.user && req.user._id);
    if (!me) {
      // Best-effort: allow optional auth via x-auth-token without requiring middleware
      try {
        const token = req.header('x-auth-token');
        if (token) {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded && decoded._id) me = decoded._id;
        }
      } catch (_) {}
    }
    const u = await User.findById(targetId).select("followers following");
    if (!u) return next(new ErrorHandeler("User not found", 404));
    const isFollowing = me ? u.followers.some((x) => String(x) === String(me)) : false;
    res.json({ success: true, data: { followers: u.followers.length, following: u.following.length, isFollowing } });
  } catch (e) { next(e); }
}

// GET /api/users/:id/followers
async function getFollowers(req, res, next) {
  try {
    const targetId = req.params.id;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const user = await User.findById(targetId).select("followers");
    if (!user) return next(new ErrorHandeler("User not found", 404));
    const ids = user.followers || [];
    const paged = ids.slice((page - 1) * limit, page * limit);
    const rows = await User.find({ _id: { $in: paged } }).select("fullname profileimage");
    res.json({ success: true, data: rows, pagination: { page, limit, total: ids.length } });
  } catch (e) { next(e); }
}

// GET /api/users/:id/following
async function getFollowing(req, res, next) {
  try {
    const targetId = req.params.id;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const user = await User.findById(targetId).select("following");
    if (!user) return next(new ErrorHandeler("User not found", 404));
    const ids = user.following || [];
    const paged = ids.slice((page - 1) * limit, page * limit);
    const rows = await User.find({ _id: { $in: paged } }).select("fullname profileimage");
    res.json({ success: true, data: rows, pagination: { page, limit, total: ids.length } });
  } catch (e) { next(e); }
}

module.exports = { followUser, unfollowUser, getFollowStats, getFollowers, getFollowing };


