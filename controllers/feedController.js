const Blog = require("../models/Blog");
const Question = require("../models/Question");
const Poll = require("../models/Poll");
const TrendingScore = require("../models/TrendingScore");
const User = require("../models/User");
const { getSignedUrlForKey } = require("../special/s3Client");
const slugify = require("slugify");

function toSlug(title) {
  return slugify(String(title || ""), { lower: true, strict: true, trim: true });
}
function htmlToPlainText(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

async function ensureQuestionSlug(doc) {
  if (!doc || doc.slug) return doc;
  const base = toSlug(htmlToPlainText(doc.description) || 'question');
  if (!base) return doc;
  let candidate = base;
  let i = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await Question.findOne({ slug: candidate, _id: { $ne: doc._id } }).select("_id");
    if (!exists) break;
    candidate = `${base}-${i++}`;
    if (i > 50) {
      candidate = `${base}-${Date.now().toString(36).slice(-5)}`;
      break;
    }
  }
  doc.slug = candidate;
  try { await doc.save(); } catch (_) {}
  return doc;
}

async function ensurePollSlug(doc) {
  if (!doc || doc.slug) return doc;
  const base = toSlug(doc.title || "");
  if (!base) return doc;
  let candidate = base;
  let i = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await Poll.findOne({ slug: candidate, _id: { $ne: doc._id } }).select("_id");
    if (!exists) break;
    candidate = `${base}-${i++}`;
    if (i > 50) {
      candidate = `${base}-${Date.now().toString(36).slice(-5)}`;
      break;
    }
  }
  doc.slug = candidate;
  try { await doc.save(); } catch (_) {}
  return doc;
}

function wrapBlog(doc) {
  return {
    type: "blog",
    createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : Date.now(),
    doc,
  };
}

function wrapQuestion(doc) {
  return {
    type: "question",
    createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : Date.now(),
    doc,
  };
}

function wrapPoll(doc) {
  return {
    type: "poll",
    createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : Date.now(),
    doc,
  };
}

// We intentionally do not augment the raw model documents with derived counts
// to keep the response aligned with model structure as requested.

function mergeAndSortByDate(groups) {
  const merged = groups.flat();
  return merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// GET /api/feed (requires auth)
async function getFeed(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const cap = Math.min(limit * page * 3, 1000);
    const user = req.user; // set by isAuthCheck

    // trending
    const trendingRows = await TrendingScore.find({}).sort({ score: -1 }).limit(cap);
    const trendingKeys = new Set(trendingRows.map((t) => `${t.contentType}:${String(t.contentId)}`));

    const trendingDocs = [];
    for (const t of trendingRows) {
      if (t.contentType === "blog") {
        let doc = null;
        if (String(t.contentId).match(/^[0-9a-fA-F]{24}$/)) {
          doc = await Blog.findById(t.contentId)
            .populate("category")
            .populate("author", "fullname email profileimage");
        } else {
          doc = await Blog.findOne({ slug: t.contentId })
            .populate("category")
            .populate("author", "fullname email profileimage");
        }
        if (doc) {
          const plain = doc.toObject();
          if (plain.imageKey) {
            try { plain.signedUrl = await getSignedUrlForKey(plain.imageKey, 3600); } catch (_) {}
          }
          trendingDocs.push(wrapBlog(plain));
        }
      } else if (t.contentType === "question") {
        let doc = await Question.findById(t.contentId)
          .populate("category")
          .populate("author", "fullname email profileimage");
        if (doc && !doc.slug) doc = await ensureQuestionSlug(doc);
        if (doc) trendingDocs.push(wrapQuestion(doc));
      } else if (t.contentType === "poll") {
        let doc = await Poll.findById(t.contentId)
          .populate("category")
          .populate("author", "fullname email profileimage");
        if (doc && !doc.slug) doc = await ensurePollSlug(doc);
        if (doc) trendingDocs.push(wrapPoll(doc));
      }
    }

    // interested categories from authenticated user
    let interestedIds = [];
    if (user && Array.isArray(user.interested_topic) && user.interested_topic.length > 0) {
      interestedIds = user.interested_topic.map((id) => id);
    }

    // interested content (newest first), excluding trending
    let interestedBlogs = [];
    let interestedQuestions = [];
    let interestedPolls = [];
    if (interestedIds.length > 0) {
      interestedBlogs = await Blog.find({ category: { $in: interestedIds } })
        .populate("category")
        .populate("author", "fullname email profileimage")
        .sort({ createdAt: -1 })
        .limit(cap);
      interestedBlogs = await Promise.all(
        interestedBlogs
          .filter((d) => !trendingKeys.has(`blog:${String(d._id)}`))
          .map(async (d) => {
            const plain = d.toObject();
            if (plain.imageKey) {
              try { plain.signedUrl = await getSignedUrlForKey(plain.imageKey, 3600); } catch (_) {}
            }
            return wrapBlog(plain);
          })
      );

      let iq = await Question.find({ category: { $in: interestedIds } })
        .populate("category")
        .populate("author", "fullname email profileimage")
        .sort({ createdAt: -1 })
        .limit(cap);
      // backfill slugs
      await Promise.all(iq.map((d) => ensureQuestionSlug(d)));
      interestedQuestions = iq
        .filter((d) => !trendingKeys.has(`question:${String(d._id)}`))
        .map(wrapQuestion);

      interestedPolls = await Poll.find({ category: { $in: interestedIds } })
        .populate("category")
        .populate("author", "fullname email profileimage")
        .sort({ createdAt: -1 })
        .limit(cap);
      await Promise.all(interestedPolls.map((d) => ensurePollSlug(d)));
      interestedPolls = interestedPolls
        .filter((d) => !trendingKeys.has(`poll:${String(d._id)}`))
        .map(wrapPoll);
    }

    // other content (not in trending nor interested)
    const excludeIds = {
      blog: new Set(trendingRows.filter(t => t.contentType === 'blog').map(t => String(t.contentId))),
      question: new Set(trendingRows.filter(t => t.contentType === 'question').map(t => String(t.contentId))),
      poll: new Set(trendingRows.filter(t => t.contentType === 'poll').map(t => String(t.contentId))),
    };
    for (const b of interestedBlogs) {
      const id = b && b.doc && b.doc._id ? String(b.doc._id) : null;
      if (id) excludeIds.blog.add(id);
    }
    for (const q of interestedQuestions) {
      const id = q && q.doc && q.doc._id ? String(q.doc._id) : null;
      if (id) excludeIds.question.add(id);
    }
    for (const p of interestedPolls) {
      const id = p && p.doc && p.doc._id ? String(p.doc._id) : null;
      if (id) excludeIds.poll.add(id);
    }

    const otherBlogsDocs = await Blog.find({ _id: { $nin: Array.from(excludeIds.blog).filter((id) => /^[0-9a-fA-F]{24}$/.test(String(id))) } })
      .populate("category")
      .populate("author", "fullname email profileimage")
      .sort({ createdAt: -1 })
      .limit(cap);
    const otherBlogs = await Promise.all(
      otherBlogsDocs.map(async (d) => {
        const plain = d.toObject();
        if (plain.imageKey) {
          try { plain.signedUrl = await getSignedUrlForKey(plain.imageKey, 3600); } catch (_) {}
        }
        return wrapBlog(plain);
      })
    );

    const otherQuestionsDocs = await Question.find({ _id: { $nin: Array.from(excludeIds.question).filter((id) => /^[0-9a-fA-F]{24}$/.test(String(id))) } })
      .populate("category")
      .populate("author", "fullname email profileimage")
      .sort({ createdAt: -1 })
      .limit(cap);
    await Promise.all(otherQuestionsDocs.map((d) => ensureQuestionSlug(d)));
    const otherQuestions = otherQuestionsDocs.map((q) => wrapQuestion(q));

    const otherPollsDocs = await Poll.find({ _id: { $nin: Array.from(excludeIds.poll).filter((id) => /^[0-9a-fA-F]{24}$/.test(String(id))) } })
      .populate("category")
      .populate("author", "fullname email profileimage")
      .sort({ createdAt: -1 })
      .limit(cap);
    await Promise.all(otherPollsDocs.map((d) => ensurePollSlug(d)));
    const otherPolls = otherPollsDocs.map(wrapPoll);

    // Compose feed per rules
    const hasTrending = trendingDocs.length > 0;
    const interestedMerged = mergeAndSortByDate([interestedBlogs, interestedQuestions, interestedPolls]).slice(0, cap);
    const othersMerged = mergeAndSortByDate([otherBlogs, otherQuestions, otherPolls]).slice(0, cap);

    let feed = [];
    if (hasTrending) {
      feed = [...trendingDocs.slice(0, cap), ...interestedMerged, ...othersMerged];
    } else {
      feed = [...interestedMerged, ...othersMerged];
    }

    // paginate the composed feed
    const skip = (page - 1) * limit;
    const pageItems = feed.slice(skip, skip + limit);
    const hasMore = feed.length > skip + pageItems.length;
    res.json({ success: true, data: pageItems, pagination: { page, limit, hasMore, total: feed.length } });
  } catch (error) {
    console.log("error from feed auth controller",error)
    next(error);
  }
}

// GET /api/feed/public (no auth)
async function getPublicFeed(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const cap = Math.min(limit * page * 3, 1000);

    // trending
    const trendingRows = await TrendingScore.find({}).sort({ score: -1 }).limit(cap);
    const trendingKeys = new Set(trendingRows.map((t) => `${t.contentType}:${String(t.contentId)}`));

    const trendingDocs = [];
    for (const t of trendingRows) {
      if (t.contentType === "blog") {
        let doc = null;
        if (String(t.contentId).match(/^[0-9a-fA-F]{24}$/)) {
          doc = await Blog.findById(t.contentId)
            .populate("category")
            .populate("author", "fullname email profileimage");
        } else {
          doc = await Blog.findOne({ slug: t.contentId })
            .populate("category")
            .populate("author", "fullname email profileimage");
        }
        if (doc) {
          const plain = doc.toObject();
          if (plain.imageKey) {
            try { plain.signedUrl = await getSignedUrlForKey(plain.imageKey, 3600); } catch (_) {}
          }
          trendingDocs.push(wrapBlog(plain));
        }
      } else if (t.contentType === "question") {
        let doc = await Question.findById(t.contentId)
          .populate("category")
          .populate("author", "fullname email profileimage");
        if (doc && !doc.slug) doc = await ensureQuestionSlug(doc);
        if (doc) trendingDocs.push(wrapQuestion(doc));
      } else if (t.contentType === "poll") {
        let doc = await Poll.findById(t.contentId)
          .populate("category")
          .populate("author", "fullname email profileimage");
        if (doc && !doc.slug) doc = await ensurePollSlug(doc);
        if (doc) trendingDocs.push(wrapPoll(doc));
      }
    }

    // other content (not in trending)
    const excludeIds = {
      blog: new Set(trendingRows.filter(t => t.contentType === 'blog').map(t => String(t.contentId))),
      question: new Set(trendingRows.filter(t => t.contentType === 'question').map(t => String(t.contentId))),
      poll: new Set(trendingRows.filter(t => t.contentType === 'poll').map(t => String(t.contentId))),
    };

    const otherBlogsDocs = await Blog.find({ _id: { $nin: Array.from(excludeIds.blog) } })
      .populate("category")
      .populate("author", "fullname email profileimage")
      .sort({ createdAt: -1 })
      .limit(cap);
    const otherBlogs = await Promise.all(
      otherBlogsDocs.map(async (d) => {
        const plain = d.toObject();
        if (plain.imageKey) {
          try { plain.signedUrl = await getSignedUrlForKey(plain.imageKey, 3600); } catch (_) {}
        }
        return wrapBlog(plain);
      })
    );

    const otherQuestionsDocs = await Question.find({ _id: { $nin: Array.from(excludeIds.question) } })
      .populate("category")
      .populate("author", "fullname email profileimage")
      .sort({ createdAt: -1 })
      .limit(cap);
    const otherQuestions = otherQuestionsDocs.map((q) => wrapQuestion(q));

    const otherPollsDocs = await Poll.find({ _id: { $nin: Array.from(excludeIds.poll) } })
      .populate("category")
      .populate("author", "fullname email profileimage")
      .sort({ createdAt: -1 })
      .limit(cap);
    const otherPolls = otherPollsDocs.map(wrapPoll);

    // Compose feed per public rules
    const hasTrending = trendingDocs.length > 0;
    const othersMerged = mergeAndSortByDate([otherBlogs, otherQuestions, otherPolls]).slice(0, cap);

    let feed = [];
    if (hasTrending) {
      feed = [...trendingDocs.slice(0, cap), ...othersMerged];
    } else {
      feed = [...othersMerged];
    }

    // paginate the composed feed
    const skip = (page - 1) * limit;
    const pageItems = feed.slice(skip, skip + limit);
    const hasMore = feed.length > skip + pageItems.length;
    res.json({ success: true, data: pageItems, pagination: { page, limit, hasMore, total: feed.length } });
  } catch (error) {
    next(error);
  }
}

// GET /api/feed/trending (no auth) — returns only trending items
async function getTrending(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const trendingRows = await TrendingScore.find({ score: { $gt: 0 } })
    .sort({ score: -1 })
    .limit(limit);
console.log(trendingRows)  
    const trendingDocs = [];
    for (const t of trendingRows) {
      if (t.contentType === "blog") {
        let doc = null;
        if (String(t.contentId).match(/^[0-9a-fA-F]{24}$/)) {
          doc = await Blog.findById(t.contentId)
            .populate("category")
            .populate("author", "fullname email profileimage");
        } else {
          doc = await Blog.findOne({ slug: t.contentId })
            .populate("category")
            .populate("author", "fullname email profileimage");
        }
        if (doc) {
          const plain = doc.toObject();
          if (plain.imageKey) {
            try { plain.signedUrl = await getSignedUrlForKey(plain.imageKey, 3600); } catch (_) {}
          }
          trendingDocs.push(wrapBlog(plain));
        }
      } else if (t.contentType === "question") {
        const doc = await Question.findById(t.contentId)
          .populate("category")
          .populate("author", "fullname email profileimage");
        if (doc) trendingDocs.push(wrapQuestion(doc));
      } else if (t.contentType === "poll") {
        const doc = await Poll.findById(t.contentId)
          .populate("category")
          .populate("author", "fullname email profileimage");
        if (doc) trendingDocs.push(wrapPoll(doc));
      }
    }

    res.json({ success: true, data: trendingDocs });
  } catch (error) {
    next(error);
  }
}

module.exports = { getFeed, getPublicFeed, getTrending };

// GET /api/feed/community-stats (no auth)
async function getCommunityStats(req, res, next) {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [activeMembers, blogToday, questionToday, pollToday] = await Promise.all([
      User.countDocuments({ isBlocked: false }),
      Blog.countDocuments({ createdAt: { $gte: todayStart } }),
      Question.countDocuments({ createdAt: { $gte: todayStart } }),
      Poll.countDocuments({ createdAt: { $gte: todayStart } }),
    ]);

    const [blogAuthors, questionAuthors, pollAuthors] = await Promise.all([
      Blog.distinct("author", { createdAt: { $gte: since30 }, author: { $ne: null } }),
      Question.distinct("author", { createdAt: { $gte: since30 }, author: { $ne: null } }),
      Poll.distinct("author", { createdAt: { $gte: since30 }, author: { $ne: null } }),
    ]);
    const unique = new Set([
      ...blogAuthors.map((x) => String(x)),
      ...questionAuthors.map((x) => String(x)),
      ...pollAuthors.map((x) => String(x)),
    ].filter(Boolean));

    res.json({
      success: true,
      data: {
        activeMembers,
        postsToday: (blogToday || 0) + (questionToday || 0) + (pollToday || 0),
        topContributors: unique.size,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports.getCommunityStats = getCommunityStats;


