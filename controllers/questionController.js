const Question = require("../models/Question");
const Category = require("../models/Category");
const User = require("../models/User");
const { sendMail, buildFrontendUrl } = require("../special/mailer");
const ErrorHandeler = require("../special/errorHandelar");
const { sanitizeHtml } = require("../utils/sanitizeHtml");
const slugify = require("slugify");

const toSlug = (str) => slugify(str || "", { lower: true, strict: true, trim: true });
function htmlToPlainText(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}
function deriveTitleFromDescription(descriptionHtml) {
  const text = htmlToPlainText(descriptionHtml);
  if (!text) return 'Question';
  const words = text.split(/\s+/).slice(0, 12).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function slugBaseFromDescription(descriptionHtml) {
  const text = htmlToPlainText(descriptionHtml);
  if (!text) return 'question';
  const words = text.split(/\s+/).slice(0, 8).join(' ');
  return words || 'question';
}
const generateUniqueSlug = async (baseString, excludeId) => {
  const base = toSlug(baseString);
  if (!base) return "";
  const exists = async (candidate) => {
    const filter = excludeId ? { slug: candidate, _id: { $ne: excludeId } } : { slug: candidate };
    const doc = await Question.findOne(filter).select("_id");
    return !!doc;
  };
  let candidate = base;
  if (!(await exists(candidate))) return candidate;
  for (let i = 2; i <= 50; i++) {
    const withNum = `${base}-${i}`;
    if (!(await exists(withNum))) return withNum;
  }
  const timeSuffix = Date.now().toString(36).slice(-5);
  candidate = `${base}-${timeSuffix}`;
  if (!(await exists(candidate))) return candidate;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${timeSuffix}-${rand}`;
};

const resolveCategoryId = async (categoryInput) => {
  if (!categoryInput) return null;
  if (categoryInput.match(/^[0-9a-fA-F]{24}$/)) return categoryInput;
  const doc = await Category.findOne({
    $or: [{ name: categoryInput }, { slug: categoryInput }],
  });
  return doc ? doc._id : null;
};

const createQuestion = async (req, res, next) => {
  try {
    const { title, description, tags, category } = req.body;
    if (!description || !category) return next(new ErrorHandeler('Missing required fields', 400));
    const categoryId = await resolveCategoryId(category);
    if (!categoryId) return next(new ErrorHandeler('Invalid category', 400));
    const slug = await generateUniqueSlug(slugBaseFromDescription(description));
    const finalTitle = title && String(title).trim().length > 0 ? title : deriveTitleFromDescription(description);
    const question = await Question.create({
      title: finalTitle,
      description: sanitizeHtml(description),
      category: categoryId,
      tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t=>t.trim()).filter(Boolean) : []),
      author: req.userid || (req.user && req.user._id) || undefined,
      slug,
    });
    res.status(201).json({ success: true, data: question });
    // Fire-and-forget: notify users subscribed to this category (excluding author)
    setImmediate(async () => {
      try {
        const authorId = question.author;
        const subs = await User.find({ interested_topic: categoryId }).select('email _id fullname');
        const recipients = subs.filter(u => String(u._id) !== String(authorId)).map(u => u.email).filter(Boolean);
        if (recipients.length) {
          const subject = `New Question: ${question.title}`;
          const link = buildFrontendUrl(`question/${encodeURIComponent(question.slug || question._id)}`, req);
          const html = `<p>A new question was posted in a category you follow.</p><p><strong>${question.title}</strong></p><p><a href="${link}">View Question</a></p>`;
          await sendMail({ to: recipients, subject, html, text: `${question.title} - ${link}` });
        }
      } catch (_) {}
    });
  } catch (error) {
    next(error);
  }
};

const getAllQuestions = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, q } = req.query;
    const query = {};
    if (q) query.$or = [{ title: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }];
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Question.find(query).populate('category').populate('author', 'fullname email').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Question.countDocuments(query),
    ]);
    res.json({ success: true, data: items, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

const getQuestionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isObjectId = String(id).match(/^[0-9a-fA-F]{24}$/);
    const filter = isObjectId ? { _id: id } : { slug: id };
    const question = await Question.findOne(filter).populate('category').populate('author', 'fullname email');
    if (!question) return next(new ErrorHandeler('Question not found', 404));
    // Backfill slug if missing so frontend can redirect to pretty URL
    if (!question.slug) {
      try {
        question.slug = await generateUniqueSlug(slugBaseFromDescription(question.description), question._id);
        await question.save();
      } catch (_) {}
    }
    // increment views
    try { await Question.updateOne({ _id: question._id }, { $inc: { viewsCount: 1 } }); } catch (_) {}
    res.json({ success: true, data: question });
  } catch (error) {
    next(error);
  }
};

const updateQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, tags, category, status } = req.body;
    const question = await Question.findById(id);
    if (!question) return next(new ErrorHandeler('Question not found', 404));
    const userId = req.userid || (req.user && req.user._id);
    const isAdmin = req.user && req.user.role === 'admin';
    const isOwner = userId && String(question.author) === String(userId);
    if (!isOwner && !isAdmin) return next(new ErrorHandeler('Forbidden', 403));
    if (description) {
      question.description = sanitizeHtml(description);
      // regenerate slug when description changes
      question.slug = await generateUniqueSlug(slugBaseFromDescription(description), question._id);
      // also refresh derived title if no explicit title provided in this update
      if (!title || String(title).trim().length === 0) {
        question.title = deriveTitleFromDescription(description);
      }
    }
    if (typeof status !== 'undefined') question.status = status;
    if (typeof tags !== 'undefined') question.tags = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t=>t.trim()).filter(Boolean) : []);
    if (category) {
      const categoryId = await resolveCategoryId(category);
      if (!categoryId) return next(new ErrorHandeler('Invalid category', 400));
      question.category = categoryId;
    }
    await question.save();
    res.json({ success: true, data: question });
  } catch (error) {
    next(error);
  }
};

const deleteQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id);
    if (!question) return next(new ErrorHandeler('Question not found', 404));
    const userId = req.userid || (req.user && req.user._id);
    const isAdmin = req.user && req.user.role === 'admin';
    const isOwner = userId && String(question.author) === String(userId);
    if (!isOwner && !isAdmin) return next(new ErrorHandeler('Forbidden', 403));
    await question.deleteOne();
    res.json({ success: true, message: 'Question deleted' });
  } catch (error) {
    next(error);
  }
};

// List Questions by Author (public)
const getQuestionsByAuthor = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 100 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Question.find({ author: userId })
        .populate('category')
        .populate('author', 'fullname email profileimage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Question.countDocuments({ author: userId }),
    ]);
    res.json({ success: true, data: items, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

module.exports = { createQuestion, getAllQuestions, getQuestionById, updateQuestion, deleteQuestion, getQuestionsByAuthor };


