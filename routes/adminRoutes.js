const express = require("express");
const { isAuthCheck } = require("../middileware/IsAuthCheck");
const { isRoleCheak } = require("../middileware/IsRoleCheak");
const { getBlogLinkPolicy, updateBlogLinkPolicy, createBlogLinkPolicy, deleteBlogLinkPolicy, getDashboardOverview, getBlogLinkPolicyPublic, listUsers, getUserByIdAdmin, listBlogsAdmin, setBlogStatusAdmin } = require("../controllers/adminController");
const TrendingScore = require("../models/TrendingScore");
const Blog = require("../models/Blog");
const Question = require("../models/Question");
const Poll = require("../models/Poll");

const router = express.Router();

router.get("/blog-link-policy-get", isAuthCheck, isRoleCheak("admin"), getBlogLinkPolicy);
router.post("/blog-link-policy-create", isAuthCheck, isRoleCheak("admin"), createBlogLinkPolicy);
router.put("/blog-link-policy-update", isAuthCheck, isRoleCheak("admin"), updateBlogLinkPolicy);
router.delete("/blog-link-policy-delete", isAuthCheck, isRoleCheak("admin"), deleteBlogLinkPolicy);

// Public read-only policy for frontend guidelines
router.get("/blog-link-policy-public", getBlogLinkPolicyPublic);

module.exports = router;

// Trending endpoint (admin scope for now; can move to public route)
router.get("/trending", isAuthCheck, isRoleCheak("admin"), async (req, res, next) => {
  try {
    const { type = "all", limit = 20 } = req.query;
    const q = type === "all" ? {} : { contentType: type };
    const items = await TrendingScore.find(q).sort({ score: -1 }).limit(Number(limit));
    const results = [];
    for (const it of items) {
      let doc = null;
      if (it.contentType === 'blog') doc = await Blog.findById(it.contentId).select("title slug image likesCount shareCount viewsCount comments createdAt");
      if (it.contentType === 'question') doc = await Question.findById(it.contentId).select("title viewsCount createdAt");
      if (it.contentType === 'poll') doc = await Poll.findById(it.contentId).select("title viewsCount options createdAt");
      if (!doc) continue;
      results.push({
        type: it.contentType,
        id: it.contentId,
        score: it.score,
        computedAt: it.computedAt,
        doc,
      });
    }
    res.json({ success: true, data: results });
  } catch (e) { next(e); }
});


// Admin dashboard overview
router.get("/dashboard/overview", isAuthCheck, isRoleCheak("admin"), getDashboardOverview);

// Users management (admin)
router.get("/users", isAuthCheck, isRoleCheak("admin"), listUsers);
router.get("/users/:id", isAuthCheck, isRoleCheak("admin"), getUserByIdAdmin);

// Blog approvals (admin)
router.get("/blogs", isAuthCheck, isRoleCheak("admin"), listBlogsAdmin);
router.put("/blogs/:id/status", isAuthCheck, isRoleCheak("admin"), setBlogStatusAdmin);



