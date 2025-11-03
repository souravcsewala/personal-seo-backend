const Poll = require("../models/Poll");
const PollVote = require("../models/PollVote");
const Category = require("../models/Category");
const ErrorHandeler = require("../special/errorHandelar");
const User = require("../models/User");
const { sendMail, buildFrontendUrl } = require("../special/mailer");
const { sanitizeHtml } = require("../utils/sanitizeHtml");
const slugify = require("slugify");

const toSlug = (title) => slugify(title || "", { lower: true, strict: true, trim: true });
const generateUniqueSlug = async (title, excludeId) => {
  const base = toSlug(title);
  if (!base) return "";
  const exists = async (candidate) => {
    const filter = excludeId ? { slug: candidate, _id: { $ne: excludeId } } : { slug: candidate };
    const doc = await Poll.findOne(filter).select("_id");
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

const createPoll = async (req, res, next) => {
  try {
    const { title, description, options, category, duration, allowMultipleVotes, tags } = req.body;
    if (!title || !category) return next(new ErrorHandeler("Missing required fields", 400));

    const categoryId = await resolveCategoryId(category);
    if (!categoryId) return next(new ErrorHandeler("Invalid category", 400));

    let optionList = [];
    if (Array.isArray(options)) optionList = options;
    else if (typeof options === 'string') optionList = options.split(',').map(o=>o.trim()).filter(Boolean);
    optionList = optionList.map(text => ({ text }));

    const slug = await generateUniqueSlug(title);
    const poll = await Poll.create({
      title,
      description: sanitizeHtml(description),
      options: optionList,
      category: categoryId,
      durationDays: duration ? Number(duration) : undefined,
      allowMultipleVotes: Boolean(allowMultipleVotes),
      tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t=>t.trim()).filter(Boolean) : []),
      author: req.userid || (req.user && req.user._id) || undefined,
      slug,
    });
    res.status(201).json({ success: true, data: poll });
    // Notify subscribers to category
    setImmediate(async () => {
      try {
        const subs = await User.find({ interested_topic: categoryId }).select('email _id');
        const recipients = subs.filter(u => String(u._id) !== String(poll.author)).map(u => u.email).filter(Boolean);
        if (recipients.length) {
          const subject = `New Poll: ${poll.title}`;
          const link = buildFrontendUrl(`poll/${encodeURIComponent(poll.slug || poll._id)}`, req);
          const html = `<p>A new poll was posted in a category you follow.</p><p><strong>${poll.title}</strong></p><p><a href="${link}">Vote Now</a></p>`;
          await sendMail({ to: recipients, subject, html, text: `${poll.title} - ${link}` });
        }
      } catch (_) {}
    });
  } catch (error) {
    next(error);
  }
};

const getAllPolls = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, q } = req.query;
    const query = {};
    if (q) query.title = { $regex: q, $options: 'i' };
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Poll.find(query).populate('category').populate('author', 'fullname email').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Poll.countDocuments(query),
    ]);
    res.json({ success: true, data: items, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

const getPollById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isObjectId = String(id).match(/^[0-9a-fA-F]{24}$/);
    const filter = isObjectId ? { _id: id } : { slug: id };
    const poll = await Poll.findOne(filter).populate('category').populate('author', 'fullname email');
    if (!poll) return next(new ErrorHandeler('Poll not found', 404));
    // increment views
    try { await Poll.updateOne({ _id: poll._id }, { $inc: { viewsCount: 1 } }); } catch (_) {}
    res.json({ success: true, data: poll });
  } catch (error) {
    next(error);
  }
};

const updatePoll = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, options, category, duration, allowMultipleVotes, tags, status } = req.body;
    const poll = await Poll.findById(id);
    if (!poll) return next(new ErrorHandeler('Poll not found', 404));

    if (title) {
      poll.title = title;
      poll.slug = await generateUniqueSlug(title, poll._id);
    }
    if (description) poll.description = sanitizeHtml(description);
    if (typeof allowMultipleVotes !== 'undefined') poll.allowMultipleVotes = Boolean(allowMultipleVotes);
    if (typeof duration !== 'undefined') poll.durationDays = Number(duration);
    if (typeof status !== 'undefined') poll.status = status;
    if (typeof tags !== 'undefined') poll.tags = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t=>t.trim()).filter(Boolean) : []);
    if (category) {
      const categoryId = await resolveCategoryId(category);
      if (!categoryId) return next(new ErrorHandeler('Invalid category', 400));
      poll.category = categoryId;
    }
    if (typeof options !== 'undefined') {
      let optionList = [];
      if (Array.isArray(options)) optionList = options;
      else if (typeof options === 'string') optionList = options.split(',').map(o=>o.trim()).filter(Boolean);
      poll.options = optionList.map(text => ({ text }));
    }

    await poll.save();
    res.json({ success: true, data: poll });
  } catch (error) {
    next(error);
  }
};

const deletePoll = async (req, res, next) => {
  try {
    const { id } = req.params;
    const poll = await Poll.findById(id);
    if (!poll) return next(new ErrorHandeler('Poll not found', 404));
    await poll.deleteOne();
    res.json({ success: true, message: 'Poll deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { createPoll, getAllPolls, getPollById, updatePoll, deletePoll };


const votePoll = async (req, res, next) => {
	try {
		const { id } = req.params;
		const userId = req.userid || (req.user && req.user._id);
		if (!userId) return next(new ErrorHandeler("Unauthorized", 401));
		const poll = await Poll.findById(id);
		if (!poll) return next(new ErrorHandeler("Poll not found", 404));
		if (poll.status === "closed" || (poll.closesAt && poll.closesAt < new Date())) {
			return next(new ErrorHandeler("Poll is closed", 400));
		}
		let { optionIndexes } = req.body;
		if (!Array.isArray(optionIndexes)) optionIndexes = [optionIndexes].filter(v => v !== undefined);
		optionIndexes = optionIndexes.map(n => Number(n)).filter(n => Number.isInteger(n));
		if (optionIndexes.length === 0) return next(new ErrorHandeler("No option selected", 400));
		if (!poll.allowMultipleVotes && optionIndexes.length > 1) return next(new ErrorHandeler("Multiple votes not allowed", 400));
		const maxIndex = poll.options.length - 1;
		if (optionIndexes.some(i => i < 0 || i > maxIndex)) return next(new ErrorHandeler("Invalid option index", 400));

		const existing = await PollVote.findOne({ poll: poll._id, user: userId });
		if (existing) {
			// To keep it simple, block revote; change to update if you want edit support
			return next(new ErrorHandeler("You have already voted on this poll", 400));
		}

		// Increment vote counts atomically per option
		for (const idx of optionIndexes) {
			await Poll.updateOne({ _id: poll._id }, { $inc: { [`options.${idx}.votes`]: 1 } });
		}
		await PollVote.create({ poll: poll._id, user: userId, optionIndexes });
		res.status(201).json({ success: true, data: { pollId: poll._id, optionIndexes } });
	} catch (error) {
		next(error);
	}
};

const getPollResults = async (req, res, next) => {
	try {
		const { id } = req.params;
		const userId = req.userid || (req.user && req.user._id);
		const poll = await Poll.findById(id);
		if (!poll) return next(new ErrorHandeler("Poll not found", 404));
		const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes || 0), 0);
		let userVote = null;
		if (userId) {
			const v = await PollVote.findOne({ poll: poll._id, user: userId });
			userVote = v ? v.optionIndexes : null;
		}
		res.json({ success: true, data: { 
			_id: poll._id,
			title: poll.title,
			description: poll.description,
			options: poll.options,
			totalVotes,
			status: poll.status,
			closesAt: poll.closesAt,
			allowMultipleVotes: poll.allowMultipleVotes,
			userVote,
		} });
	} catch (error) {
		next(error);
	}
};

module.exports.votePoll = votePoll;
module.exports.getPollResults = getPollResults;


