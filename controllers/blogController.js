const slugify = require("slugify");
const Blog = require("../models/Blog");
const Category = require("../models/Category");
const User = require("../models/User");
const { uploadToS3, deleteFromS3, getSignedUrlForKey } = require("../special/s3Client");
const ErrorHandeler = require("../special/errorHandelar");
const { sendMail, buildFrontendUrl } = require("../special/mailer");
const BacklinkPolicy = require("../models/BacklinkPolicy");
const { applyBlogLinkPolicy } = require("../utils/linkPolicy");
const { sanitizeHtml } = require("../utils/sanitizeHtml");

const toSlug = (title) => slugify(title, { lower: true, strict: true, trim: true });

// Generate a slug from title and ensure uniqueness by appending a short suffix on collision
const generateUniqueSlug = async (title, excludeId) => {
  const base = toSlug(title || "");
  if (!base) return "";

  const exists = async (candidate) => {
    const filter = excludeId ? { slug: candidate, _id: { $ne: excludeId } } : { slug: candidate };
    const doc = await Blog.findOne(filter).select("_id");
    return !!doc;
  };

  let candidate = base;
  if (!(await exists(candidate))) return candidate;

  // Try with incremental numeric suffix, then fallback to time-based suffix
  for (let i = 2; i <= 50; i++) {
    const withNum = `${base}-${i}`;
    if (!(await exists(withNum))) return withNum;
  }
  const timeSuffix = Date.now().toString(36).slice(-5);
  candidate = `${base}-${timeSuffix}`;
  if (!(await exists(candidate))) return candidate;

  // As a last resort, append a random 4-char token
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${timeSuffix}-${rand}`;
};

const resolveCategoryId = async (categoryInput) => {
  if (!categoryInput) return null;
  if (categoryInput.match(/^[0-9a-fA-F]{24}$/)) return categoryInput;
  const doc = await Category.findOne({
    $or: [{ name: categoryInput }],
  });
  return doc ? doc._id : null;
};

function extractText(html) {
  try {
    const str = String(html || "");
    return str.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  } catch { return ""; }
}

function generateMetaDescriptionFromContent(html, maxLen = 160) {
  const text = extractText(html);
  if (!text) return "";
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

// Create Blog
const createBlog = async (req, res, next) => {
  try {
    const { title, metaDescription, category, tags, imageAlt } = req.body;
    let content = req.body.content;
    if (!title || !content || !category) {
      return next(new ErrorHandeler("Missing required fields", 400));
    }

    const categoryId = await resolveCategoryId(category);
    if (!categoryId) return next(new ErrorHandeler("Invalid category", 400));

    let imageUrl;
    let imageKey;
    if (req.files && req.files.image) {
      const file = req.files.image;
      const uploaded = await uploadToS3({
        filePath: file.tempFilePath,
        contentType: file.mimetype,
      });
      imageUrl = uploaded.url;
      imageKey = uploaded.key;
    }

    const slug = await generateUniqueSlug(title);

    // Sanitize first (strip scripts/javascript URLs), then apply backlink policy
    content = sanitizeHtml(content);
    // Apply backlink policy to content
    const policy = await BacklinkPolicy.findOne();
    if (policy) {
      try {
        const processed = applyBlogLinkPolicy(content, policy, req.protocol + '://' + req.get('host'));
        if (processed && processed.html) {
          req.body._policyStats = processed.stats; // optional debug
          content = processed.html;
        }
      } catch (e) {
        return next(new ErrorHandeler(e.message || 'Content policy validation failed', 400));
      }
    }
    const autoMeta = metaDescription && String(metaDescription).trim().length ? String(metaDescription).trim() : generateMetaDescriptionFromContent(content);
    let blog;
    try {
      blog = await Blog.create({
        title,
        content,
        metaDescription: autoMeta,
        category: categoryId,
        tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t=>t.trim()).filter(Boolean) : []),
        image: imageUrl,
        imageKey,
        imageAlt: imageAlt || undefined,
        author: req.userid || (req.user && req.user._id) || undefined,
        slug,
      });
    } catch (err) {
      // Handle duplicate slug race condition gracefully
      if (err && err.code === 11000 && err.keyPattern && err.keyPattern.slug) {
        const newUniqueSlug = await generateUniqueSlug(title);
        blog = await Blog.create({
          title,
          content,
          metaDescription: autoMeta,
          category: categoryId,
          tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t=>t.trim()).filter(Boolean) : []),
          image: imageUrl,
          imageKey,
          imageAlt: imageAlt || undefined,
          author: req.userid || (req.user && req.user._id) || undefined,
          slug: newUniqueSlug,
        });
      } else {
        throw err;
      }
    }

    const signedUrl = blog.imageKey ? await getSignedUrlForKey(blog.imageKey, 3600) : undefined;
    res.status(201).json({ success: true, data: { ...blog.toObject(), signedUrl } });
    // Notify users who follow this category (exclude author)
    setImmediate(async () => {
      try {
        const subs = await User.find({ interested_topic: blog.category }).select('email _id');
        const recipients = subs.filter(u => String(u._id) !== String(blog.author)).map(u => u.email).filter(Boolean);
        if (recipients.length) {
          const subject = `New Blog: ${blog.title}`;
          const link = buildFrontendUrl(`blog/${encodeURIComponent(blog.slug || blog._id)}`, req);
          const html = `<p>A new blog was posted in a category you follow.</p><p><strong>${blog.title}</strong></p><p><a href="${link}">Read Blog</a></p>`;
          await sendMail({ to: recipients, subject, html, text: `${blog.title} - ${link}` });
        }
      } catch (_) {}
    });
  } catch (error) {
    next(error);
  }
};

// Get all Blogs
const getAllBlogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, q } = req.query;
    const query = {};
    if (q) {
      query.$or = [
        { title: { $regex: q, $options: "i" } },
        { content: { $regex: q, $options: "i" } },
        { metaDescription: { $regex: q, $options: "i" } },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Blog.find(query)
        .populate("category")
        .populate("author", "fullname email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Blog.countDocuments(query),
    ]);
    res.json({ success: true, data: items, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

// List Blogs by Author (public)
const getBlogsByAuthor = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 100 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [itemsRaw, total] = await Promise.all([
      Blog.find({ author: userId })
        .populate("category")
        .populate("author", "fullname email profileimage")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Blog.countDocuments({ author: userId }),
    ]);

    const items = await Promise.all(
      itemsRaw.map(async (d) => {
        const plain = d.toObject();
        if (plain.imageKey) {
          try { plain.signedUrl = await getSignedUrlForKey(plain.imageKey, 3600); } catch (_) {}
        }
        // attach signed url for author's profile image if private
        try {
          if (plain.author && plain.author.profileimage && plain.author.profileimage.key) {
            plain.author.profileimage.signedUrl = await getSignedUrlForKey(plain.author.profileimage.key, 3600);
          }
        } catch (_) {}
        return plain;
      })
    );

    res.json({ success: true, data: items, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

// List Blogs by Category (public) - accepts category id or name
const getBlogsByCategory = async (req, res, next) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 100 } = req.query;

    const categoryId = await resolveCategoryId(category);
    if (!categoryId) return next(new ErrorHandeler("Invalid category", 400));

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Blog.find({ category: categoryId })
        .populate("category")
        .populate("author", "fullname email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Blog.countDocuments({ category: categoryId }),
    ]);

    res.json({ success: true, data: items, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

// Get Blog by ID or slug
const getBlogById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const filter = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
    const blog = await Blog.findOne(filter)
      .populate("category")
      .populate("author", "fullname email profileimage");
    if (!blog) return next(new ErrorHandeler("Blog not found", 404));
    // increment views
    try { await Blog.updateOne({ _id: blog._id }, { $inc: { viewsCount: 1 } }); } catch (_) {}
    const signedUrl = blog.imageKey ? await getSignedUrlForKey(blog.imageKey, 3600) : undefined;
    const plain = blog.toObject();
    // attach signedUrl for author's profile image if private
    try {
      if (plain.author && plain.author.profileimage && plain.author.profileimage.key) {
        plain.author.profileimage.signedUrl = await getSignedUrlForKey(plain.author.profileimage.key, 3600);
      }
    } catch (_) {}
    res.json({ success: true, data: { ...plain, signedUrl } });
  } catch (error) {
    next(error);
  }
};

// Get Blog by slug (public)
const getBlogBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    if (!slug || !String(slug).trim()) {
      return next(new ErrorHandeler("Slug is required", 400));
    }

    const blog = await Blog.findOne({ slug: String(slug).trim() })
      .populate("category")
      .populate("author", "fullname email profileimage");
    if (!blog) return next(new ErrorHandeler("Blog not found", 404));

    // increment views
    try { await Blog.updateOne({ _id: blog._id }, { $inc: { viewsCount: 1 } }); } catch (_) {}

    const signedUrl = blog.imageKey ? await getSignedUrlForKey(blog.imageKey, 3600) : undefined;
    const plain = blog.toObject();
    try {
      if (plain.author && plain.author.profileimage && plain.author.profileimage.key) {
        plain.author.profileimage.signedUrl = await getSignedUrlForKey(plain.author.profileimage.key, 3600);
      }
    } catch (_) {}
    res.json({ success: true, data: { ...plain, signedUrl } });
  } catch (error) {
    next(error);
  }
};

// Update Blog
const updateBlog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, content, metaDescription, category, tags, imageAlt } = req.body;
    const blog = await Blog.findById(id);
    if (!blog) return next(new ErrorHandeler("Blog not found", 404));

    if (title) blog.title = title;
    if (content) {
      const policy = await BacklinkPolicy.findOne();
      if (policy) {
        try {
          const processed = applyBlogLinkPolicy(sanitizeHtml(content), policy, req.protocol + '://' + req.get('host'));
          if (processed && processed.html) {
            blog.content = processed.html;
          } else {
            blog.content = sanitizeHtml(content);
          }
        } catch (e) {
          return next(new ErrorHandeler(e.message || 'Content policy validation failed', 400));
        }
      } else {
        blog.content = sanitizeHtml(content);
      }
      if (!metaDescription || !String(metaDescription).trim()) {
        blog.metaDescription = generateMetaDescriptionFromContent(blog.content);
      }
    }
    if (metaDescription && String(metaDescription).trim()) blog.metaDescription = String(metaDescription).trim();
    if (typeof tags !== 'undefined') {
      blog.tags = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t=>t.trim()).filter(Boolean) : []);
    }
    if (category) {
      const categoryId = await resolveCategoryId(category);
      if (!categoryId) return next(new ErrorHandeler("Invalid category", 400));
      blog.category = categoryId;
    }

    if (title) blog.slug = await generateUniqueSlug(title, blog._id);

    if (req.files && req.files.image) {
      if (blog.imageKey) {
        await deleteFromS3(blog.imageKey);
      }
      const file = req.files.image;
      const uploaded = await uploadToS3({
        filePath: file.tempFilePath,
        contentType: file.mimetype,
      });
      blog.image = uploaded.url;
      blog.imageKey = uploaded.key;
    }
    if (typeof imageAlt !== 'undefined') {
      blog.imageAlt = imageAlt;
    }

    try {
      await blog.save();
    } catch (err) {
      if (err && err.code === 11000 && err.keyPattern && err.keyPattern.slug && title) {
        // Regenerate on conflict and retry once
        blog.slug = await generateUniqueSlug(title, blog._id);
        await blog.save();
      } else {
        throw err;
      }
    }
    res.json({ success: true, data: blog });
  } catch (error) {
    next(error);
  }
};

// Delete Blog (only author or admin)
const deleteBlog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userid || (req.user && req.user._id);
    const userRole = (req.user && req.user.role) || 'user';
    const blog = await Blog.findById(id).select('author imageKey');
    if (!blog) return next(new ErrorHandeler("Blog not found", 404));
    const isOwner = userId && String(blog.author) === String(userId);
    const isAdmin = userRole === 'admin';
    if (!isOwner && !isAdmin) return next(new ErrorHandeler('Forbidden', 403));
    if (blog.imageKey) {
      await deleteFromS3(blog.imageKey);
    }
    await blog.deleteOne();
    res.json({ success: true, message: "Blog deleted" });
  } catch (error) {
    next(error);
  }
};

module.exports = { createBlog, getAllBlogs, getBlogById, updateBlog, deleteBlog };

// ====== Interactions: Comments, Likes, Shares ======

// Add a comment to a blog (auth required)
const addComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) {
      return next(new ErrorHandeler("Comment content is required", 400));
    }

    const filter = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
    const blog = await Blog.findOne(filter);
    if (!blog) return next(new ErrorHandeler("Blog not found", 404));

    const commentDoc = {
      user: req.userid || (req.user && req.user._id),
      content: content.trim(),
      createdAt: new Date(),
    };

    blog.comments.unshift(commentDoc);
    await blog.save();

    const populated = await Blog.findById(blog._id)
      .select("comments")
      .populate({
        path: "comments.user",
        select: "fullname email profileimage",
      });
    // add signed URLs for each comment user avatar
    try {
      const withAvatars = await Promise.all((populated.comments || []).map(async (c) => {
        const obj = c.toObject ? c.toObject() : c;
        if (obj.user && obj.user.profileimage && obj.user.profileimage.key) {
          try { obj.user.profileimage.signedUrl = await getSignedUrlForKey(obj.user.profileimage.key, 3600); } catch (_) {}
        }
        return obj;
      }));
      return res.status(201).json({ success: true, data: withAvatars[0] });
    } catch (_) {}

    res.status(201).json({ success: true, data: populated.comments[0] });
    // Notify blog author about new comment
    try {
      const author = await User.findById(blog.author).select('email fullname');
      const email = author?.email;
      const commenterId = req.userid || (req.user && req.user._id);
      if (email && String(blog.author) !== String(commenterId)) {
        let actorName = (req.user && req.user.fullname) ? req.user.fullname : '';
        if (!actorName && commenterId) { try { const u = await User.findById(commenterId).select('fullname'); actorName = u?.fullname || ''; } catch { } }
        const subject = `New comment on your blog`;
        const link = buildFrontendUrl(`blog/${encodeURIComponent(blog.slug || blog._id)}#comments`, req);
        const html = `<p>Hi ${author?.fullname || ''},</p><p><strong>${actorName || 'A member'}</strong> commented on your blog:</p><p><em>${blog.title}</em></p><p><a href="${link}">View comments</a></p>`;
        await sendMail({ to: email, subject, html, text: link });
      }
    } catch (_) {}
  } catch (error) {
    next(error);
  }
};

// Get comments for a blog (public)
const getComments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const filter = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
    const blog = await Blog.findOne(filter)
      .select("comments")
      .populate({ path: "comments.user", select: "fullname email profileimage" });
    if (!blog) return next(new ErrorHandeler("Blog not found", 404));
    // attach signed URLs for comment user avatars
    const commentsWithAvatars = await Promise.all((blog.comments || []).map(async (c) => {
      const obj = c.toObject ? c.toObject() : c;
      if (obj.user && obj.user.profileimage && obj.user.profileimage.key) {
        try { obj.user.profileimage.signedUrl = await getSignedUrlForKey(obj.user.profileimage.key, 3600); } catch (_) {}
      }
      return obj;
    }));
    res.json({ success: true, data: commentsWithAvatars });
  } catch (error) {
    next(error);
  }
};

// Toggle like on a blog (auth required)
const toggleLike = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userid || (req.user && req.user._id);
    if (!userId) return next(new ErrorHandeler("Unauthorized", 401));

    const isObjectId = id.match(/^[0-9a-fA-F]{24}$/);
    const blog = await Blog.findOne(isObjectId ? { _id: id } : { slug: id }).select("_id likedBy likesCount");
    if (!blog) return next(new ErrorHandeler("Blog not found", 404));

    const alreadyLiked = blog.likedBy.some((u) => String(u) === String(userId));

    const update = alreadyLiked
      ? { $pull: { likedBy: userId }, $inc: { likesCount: -1 } }
      : { $addToSet: { likedBy: userId }, $inc: { likesCount: 1 } };

    const updated = await Blog.findByIdAndUpdate(blog._id, update, { new: true }).select("likesCount likedBy");

    res.json({ success: true, data: { liked: !alreadyLiked, likesCount: updated.likesCount } });
  } catch (error) {
    next(error);
  }
};

// Record a share (auth required)
const shareBlog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userid || (req.user && req.user._id);
    if (!userId) return next(new ErrorHandeler("Unauthorized", 401));

    const filter = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
    const updated = await Blog.findOneAndUpdate(filter, { $inc: { shareCount: 1 } }, { new: true }).select("shareCount");
    if (!updated) return next(new ErrorHandeler("Blog not found", 404));

    res.json({ success: true, data: { shareCount: updated.shareCount } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createBlog,
  getAllBlogs,
  getBlogsByAuthor,
  getBlogsByCategory,
  getBlogById,
  getBlogBySlug,
  updateBlog,
  deleteBlog,
  addComment,
  getComments,
  toggleLike,
  shareBlog,
  getCommentReplies,
  addCommentReply,
};

// Recommended blogs by category of a given blog id or slug
async function getRecommendedByBlog(req, res, next) {
  try {
    const { idOrSlug } = req.params;
    const filter = idOrSlug.match(/^[0-9a-fA-F]{24}$/) ? { _id: idOrSlug } : { slug: idOrSlug };
    const base = await Blog.findOne(filter).select('_id category');
    if (!base) return next(new ErrorHandeler('Blog not found', 404));
    const items = await Blog.find({ category: base.category, _id: { $ne: base._id } })
      .populate('author', 'fullname profileimage')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .limit(6);
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
}

module.exports.getRecommendedByBlog = getRecommendedByBlog;

// Edit a comment on a blog (only owner or admin)
async function editComment(req, res, next) {
  try {
    const { id, commentId } = req.params;
    const userId = req.userid || (req.user && req.user._id);
    if (!userId) return next(new ErrorHandeler('Unauthorized', 401));
    const filter = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
    const blog = await Blog.findOne(filter).select('comments author');
    if (!blog) return next(new ErrorHandeler('Blog not found', 404));
    const comment = (blog.comments || []).find(c => String(c._id) === String(commentId));
    if (!comment) return next(new ErrorHandeler('Comment not found', 404));
    const isOwner = String(comment.user) === String(userId);
    const isAdmin = req.user && req.user.role === 'admin';
    if (!isOwner && !isAdmin) return next(new ErrorHandeler('Forbidden', 403));
    const { content } = req.body || {};
    if (!content || !String(content).trim()) return next(new ErrorHandeler('Content is required', 400));
    comment.content = String(content).trim();
    await blog.save();
    const updated = await Blog.findById(blog._id).select('comments').populate({ path: 'comments.user', select: 'fullname email profileimage' });
    const updatedComment = (updated.comments || []).find(c => String(c._id) === String(commentId));
    res.json({ success: true, data: updatedComment });
  } catch (e) { next(e); }
}

// Delete a comment on a blog (only owner or admin)
async function deleteComment(req, res, next) {
  try {
    const { id, commentId } = req.params;
    const userId = req.userid || (req.user && req.user._id);
    if (!userId) return next(new ErrorHandeler('Unauthorized', 401));
    const filter = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
    const blog = await Blog.findOne(filter).select('comments');
    if (!blog) return next(new ErrorHandeler('Blog not found', 404));
    const comment = (blog.comments || []).find(c => String(c._id) === String(commentId));
    if (!comment) return next(new ErrorHandeler('Comment not found', 404));
    const isOwner = String(comment.user) === String(userId);
    const isAdmin = req.user && req.user.role === 'admin';
    if (!isOwner && !isAdmin) return next(new ErrorHandeler('Forbidden', 403));
    blog.comments = (blog.comments || []).filter(c => String(c._id) !== String(commentId));
    await blog.save();
    res.json({ success: true, message: 'Comment deleted' });
  } catch (e) { next(e); }
}

module.exports.editComment = editComment;
module.exports.deleteComment = deleteComment;

// Search blogs by title, metaDescription, or author fullname
async function searchBlogs(req, res, next) {
  try {
    const { q = '', page = 1, limit = 20 } = req.query;
    const queryText = String(q || '').trim();
    const skip = (Number(page) - 1) * Number(limit);
    console.log('[SearchBlogs] incoming', { q: queryText, page: Number(page), limit: Number(limit) });

    if (!queryText) {
      const [items, total] = await Promise.all([
        Blog.find({})
          .populate('author', 'fullname profileimage')
          .populate('category', 'name')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Blog.countDocuments({}),
      ]);
      console.log('[SearchBlogs] empty q fallback', { items: items.length, total });
      return res.json({ success: true, data: items, pagination: { total, page: Number(page), limit: Number(limit) } });
    }

    // Resolve matching authors by fullname, then search blogs by title/meta/author
    const matchingUsers = await User.find({ fullname: { $regex: queryText, $options: 'i' } }).select('_id');
    const authorIds = matchingUsers.map(u => u._id);
    console.log('[SearchBlogs] matching authors', { count: matchingUsers.length });

    const orConditions = [
      { title: { $regex: queryText, $options: 'i' } },
      { metaDescription: { $regex: queryText, $options: 'i' } },
    ];
    if (authorIds.length) {
      orConditions.push({ author: { $in: authorIds } });
    }

    const [items, total] = await Promise.all([
      Blog.find({ $or: orConditions })
        .populate('author', 'fullname profileimage')
        .populate('category', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Blog.countDocuments({ $or: orConditions })
    ]);

    console.log('[SearchBlogs] results', { items: items.length, total });
    res.json({ success: true, data: items, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (e) { next(e); }
}

module.exports.searchBlogs = searchBlogs;

// ===== Comment Replies =====
async function getCommentReplies(req, res, next) {
  try {
    const { id, commentId } = req.params;
    const filter = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
    const blog = await Blog.findOne(filter)
      .select('comments')
      .populate({ path: 'comments.user', select: 'fullname email profileimage' })
      .populate({ path: 'comments.replies.user', select: 'fullname email profileimage' });
    if (!blog) return next(new ErrorHandeler('Blog not found', 404));
    const comment = (blog.comments || []).find(c => String(c._id) === String(commentId));
    if (!comment) return next(new ErrorHandeler('Comment not found', 404));
    // Optionally add signed URLs for avatars
    try {
      const withAvatars = await Promise.all((comment.replies || []).map(async (r) => {
        const obj = r.toObject ? r.toObject() : r;
        if (obj.user && obj.user.profileimage && obj.user.profileimage.key) {
          try { obj.user.profileimage.signedUrl = await getSignedUrlForKey(obj.user.profileimage.key, 3600); } catch (_) {}
        }
        return obj;
      }));
      return res.json({ success: true, data: withAvatars });
    } catch (_) {}
    res.json({ success: true, data: comment.replies || [] });
  } catch (e) { next(e); }
}

async function addCommentReply(req, res, next) {
  try {
    const { id, commentId } = req.params;
    const { content, parentId } = req.body;
    const userId = req.userid || (req.user && req.user._id);
    if (!userId) return next(new ErrorHandeler('Unauthorized', 401));
    if (!content || !String(content).trim()) return next(new ErrorHandeler('Content is required', 400));
    const filter = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
    const blog = await Blog.findOne(filter).select('comments author title slug');
    if (!blog) return next(new ErrorHandeler('Blog not found', 404));
    const comment = (blog.comments || []).find(c => String(c._id) === String(commentId));
    if (!comment) return next(new ErrorHandeler('Comment not found', 404));
    const reply = { user: userId, content: String(content).trim(), parentId: parentId || undefined, createdAt: new Date() };
    comment.replies = [reply, ...(comment.replies || [])];
    await blog.save();
    const updated = await Blog.findById(blog._id)
      .select('comments')
      .populate({ path: 'comments.replies.user', select: 'fullname email profileimage' })
      .populate({ path: 'comments.user', select: 'fullname email profileimage' });
    const updatedComment = (updated.comments || []).find(c => String(c._id) === String(commentId));
    const created = (updatedComment?.replies || [])[0];
    res.status(201).json({ success: true, data: created });
    // Email notify target: if replying to a reply -> that reply's user, else the original comment author
    setImmediate(async () => {
      try {
        let targetUserId = null;
        if (parentId) {
          const parent = (comment.replies || []).find(r => String(r._id) === String(parentId));
          targetUserId = parent ? parent.user : null;
        } else {
          targetUserId = comment.user;
        }
        if (targetUserId && String(targetUserId) !== String(userId)) {
          const u = await User.findById(targetUserId).select('email fullname');
          if (u && u.email) {
            let actorName = (req.user && req.user.fullname) ? req.user.fullname : '';
            if (!actorName && userId) { try { const tu = await User.findById(userId).select('fullname'); actorName = tu?.fullname || ''; } catch {} }
            const subject = 'Someone replied to your comment';
            const link = buildFrontendUrl(`blog/${encodeURIComponent(blog.slug || blog._id)}#comments`, req);
            const html = `<p>Hi ${u.fullname || ''},</p><p><strong>${actorName || 'A member'}</strong> replied to your comment on:</p><p><em>${blog.title || ''}</em></p><p><a href="${link}">View the conversation</a></p>`;
            await sendMail({ to: u.email, subject, html, text: link });
          }
        }
      } catch (_) {}
    });
  } catch (e) { next(e); }
}

module.exports.getCommentReplies = getCommentReplies;
module.exports.addCommentReply = addCommentReply;

// Update a specific reply under a comment
async function updateCommentReply(req, res, next) {
  try {
    const { id, commentId, replyId } = req.params;
    const { content } = req.body;
    const userId = req.userid || (req.user && req.user._id);
    if (!userId) return next(new ErrorHandeler('Unauthorized', 401));
    if (!content || !String(content).trim()) return next(new ErrorHandeler('Content is required', 400));

    const filter = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
    const blog = await Blog.findOne(filter).select('comments');
    if (!blog) return next(new ErrorHandeler('Blog not found', 404));
    const comment = (blog.comments || []).find(c => String(c._id) === String(commentId));
    if (!comment) return next(new ErrorHandeler('Comment not found', 404));
    const reply = (comment.replies || []).find(r => String(r._id) === String(replyId));
    if (!reply) return next(new ErrorHandeler('Reply not found', 404));
    const isOwner = String(reply.user) === String(userId);
    const isAdmin = req.user && (req.user.role === 'admin');
    if (!isOwner && !isAdmin) return next(new ErrorHandeler('Forbidden', 403));

    reply.content = String(content).trim();
    await blog.save();

    const populated = await Blog.findById(blog._id)
      .select('comments')
      .populate({ path: 'comments.replies.user', select: 'fullname email profileimage' });
    const updatedComment = (populated.comments || []).find(c => String(c._id) === String(commentId));
    const updatedReply = (updatedComment?.replies || []).find(r => String(r._id) === String(replyId));
    return res.json({ success: true, data: updatedReply || reply });
  } catch (e) { next(e); }
}

// Delete a specific reply under a comment
async function deleteCommentReply(req, res, next) {
  try {
    const { id, commentId, replyId } = req.params;
    const userId = req.userid || (req.user && req.user._id);
    if (!userId) return next(new ErrorHandeler('Unauthorized', 401));

    const filter = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
    const blog = await Blog.findOne(filter).select('comments');
    if (!blog) return next(new ErrorHandeler('Blog not found', 404));
    const comment = (blog.comments || []).find(c => String(c._id) === String(commentId));
    if (!comment) return next(new ErrorHandeler('Comment not found', 404));
    const reply = (comment.replies || []).find(r => String(r._id) === String(replyId));
    if (!reply) return next(new ErrorHandeler('Reply not found', 404));
    const isOwner = String(reply.user) === String(userId);
    const isAdmin = req.user && (req.user.role === 'admin');
    if (!isOwner && !isAdmin) return next(new ErrorHandeler('Forbidden', 403));

    comment.replies = (comment.replies || []).filter(r => String(r._id) !== String(replyId));
    await blog.save();
    return res.json({ success: true, data: { deleted: true } });
  } catch (e) { next(e); }
}

module.exports.updateCommentReply = updateCommentReply;
module.exports.deleteCommentReply = deleteCommentReply;

