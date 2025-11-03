const Answer = require("../models/Answer");
const Question = require("../models/Question");
const ErrorHandeler = require("../special/errorHandelar");
const { sanitizeHtml } = require("../utils/sanitizeHtml");
const { sendMail, buildFrontendUrl } = require("../special/mailer");
const User = require("../models/User");

const createAnswer = async (req, res, next) => {
	try {
		const { questionId } = req.params;
        const { content } = req.body;
		if (!content || !content.trim()) return next(new ErrorHandeler("Content is required", 400));
		const question = await Question.findById(questionId);
		if (!question) return next(new ErrorHandeler("Question not found", 404));
    const answer = await Answer.create({
			question: question._id,
            content: sanitizeHtml(content.trim()),
			author: req.userid || (req.user && req.user._id) || undefined,
		});
		res.status(201).json({ success: true, data: answer });
		// Notify question author about new answer
        setImmediate(async () => {
			try {
                const q = await Question.findById(question._id).populate('author', 'email fullname');
				const email = q?.author?.email;
				const answererId = req.userid || (req.user && req.user._id);
                let actorName = (req.user && req.user.fullname) ? req.user.fullname : '';
                if (!actorName && answererId) {
                    try { const u = await User.findById(answererId).select('fullname'); actorName = u?.fullname || ''; } catch (_) {}
                }
                if (email && String(q.author._id) !== String(answererId)) {
                    const subject = `Your question received a new answer`;
                    const link = buildFrontendUrl(`question/${encodeURIComponent(q.slug || q._id)}#answers`, req);
                    const html = `<p>Hi ${q.author?.fullname || ''},</p>
<p><strong>${actorName || 'A member'}</strong> added a new answer to your question:</p>
<p><em>${q.title}</em></p>
<p><a href="${link}">View the answers</a></p>`;
					await sendMail({ to: email, subject, html, text: `${q.title} - ${link}` });
				}
			} catch (_) {}
		});
	} catch (error) {
		next(error);
	}
};

const getAnswers = async (req, res, next) => {
	try {
		const { questionId } = req.params;
		const { page = 1, limit = 10, sort = "-isAccepted,-likes,-createdAt" } = req.query;
		const question = await Question.findById(questionId);
		if (!question) return next(new ErrorHandeler("Question not found", 404));
		const skip = (Number(page) - 1) * Number(limit);
		const sortSpec = sort.split(",").join(" ");
		const [items, total] = await Promise.all([
			Answer.find({ question: question._id })
				.populate("author", "fullname email avatar")
				.sort(sortSpec)
				.skip(skip)
				.limit(Number(limit)),
			Answer.countDocuments({ question: question._id }),
		]);
		res.json({ success: true, data: items, pagination: { total, page: Number(page), limit: Number(limit) } });
	} catch (error) {
		next(error);
	}
};

const toggleLikeAnswer = async (req, res, next) => {
	try {
		const { answerId } = req.params;
		const userId = req.userid || (req.user && req.user._id);
		if (!userId) return next(new ErrorHandeler("Unauthorized", 401));
		const answer = await Answer.findById(answerId);
		if (!answer) return next(new ErrorHandeler("Answer not found", 404));
		const hasLiked = answer.likedBy?.some((id) => String(id) === String(userId));
		if (hasLiked) {
			answer.likedBy = answer.likedBy.filter((id) => String(id) !== String(userId));
			answer.likes = Math.max(0, (answer.likes || 0) - 1);
		} else {
			answer.likedBy = [...(answer.likedBy || []), userId];
			answer.likes = (answer.likes || 0) + 1;
		}
		await answer.save();
		res.json({ success: true, data: { likes: answer.likes, liked: !hasLiked } });
	} catch (error) {
		next(error);
	}
};

const acceptAnswer = async (req, res, next) => {
	try {
		const { answerId } = req.params;
		const userId = req.userid || (req.user && req.user._id);
		if (!userId) return next(new ErrorHandeler("Unauthorized", 401));
		const answer = await Answer.findById(answerId).populate("question");
		if (!answer) return next(new ErrorHandeler("Answer not found", 404));
		const question = answer.question;
		if (!question) return next(new ErrorHandeler("Question not found", 404));
		const isOwner = String(question.author) === String(userId);
		const isAdmin = req.user && req.user.role === "admin";
		if (!isOwner && !isAdmin) return next(new ErrorHandeler("Forbidden", 403));
		await Answer.updateMany({ question: question._id, isAccepted: true }, { $set: { isAccepted: false } });
		answer.isAccepted = true;
		await answer.save();
		res.json({ success: true, data: { answerId: answer._id, isAccepted: true } });
	} catch (error) {
		next(error);
	}
};

module.exports = { createAnswer, getAnswers, toggleLikeAnswer, acceptAnswer };

// ===== Replies =====
const addReply = async (req, res, next) => {
	try {
        const { answerId } = req.params;
        const { content, parentId } = req.body;
		if (!content || !content.trim()) return next(new ErrorHandeler("Content is required", 400));
		const userId = req.userid || (req.user && req.user._id);
		if (!userId) return next(new ErrorHandeler("Unauthorized", 401));
		const answer = await Answer.findById(answerId);
		if (!answer) return next(new ErrorHandeler("Answer not found", 404));
        // Policy:
        // - If parentId missing (top-level reply), disallow answer owner replying to own answer
        // - If parentId present, allow owner to reply unless replying to own reply
        if (!parentId) {
            if (String(answer.author || '') === String(userId || '')) {
                return next(new ErrorHandeler("You cannot reply to your own answer", 403));
            }
        } else {
            const parent = (answer.replies || []).find((r) => String(r._id) === String(parentId));
            if (!parent) return next(new ErrorHandeler("Parent reply not found", 400));
            if (String(parent.user || '') === String(userId || '')) {
                return next(new ErrorHandeler("You cannot reply to your own reply", 403));
            }
        }
    const reply = {
			user: userId,
			content: sanitizeHtml(content.trim()),
			parentId: parentId || undefined,
			createdAt: new Date(),
		};
		answer.replies = [reply, ...(answer.replies || [])];
		await answer.save();
		const populated = await Answer.findById(answer._id).select("replies").populate({ path: "replies.user", select: "fullname email profileimage" });
        const created = populated.replies[0];
		// Notify the target (parent reply author or answer author)
        setImmediate(async () => {
			try {
				let targetEmail = null;
				if (parentId) {
					const parent = (answer.replies || []).find(r => String(r._id) === String(parentId));
					if (parent) {
						const u = await User.findById(parent.user).select('email');
						targetEmail = u?.email || null;
					}
				} else {
					const aAuthor = await User.findById(answer.author).select('email');
					targetEmail = aAuthor?.email || null;
				}
                if (targetEmail && String(targetEmail).length) {
					const q = await Question.findById(answer.question).select('title slug');
                    const subject = parentId ? `Someone replied to your comment` : `Someone replied to your answer`;
                    const actorId = req.userid || (req.user && req.user._id);
                    let actorName = (req.user && req.user.fullname) ? req.user.fullname : '';
                    if (!actorName && actorId) {
                        try { const u = await User.findById(actorId).select('fullname'); actorName = u?.fullname || ''; } catch (_) {}
                    }
                    const link = buildFrontendUrl(`question/${encodeURIComponent(q?.slug || answer.question)}#answers`, req);
                    const html = `<p>Hi,</p>
<p><strong>${actorName || 'A member'}</strong> ${parentId ? 'replied to your comment' : 'replied to your answer'} on:</p>
<p><em>${q?.title || ''}</em></p>
<p><a href="${link}">View the conversation</a></p>`;
					await sendMail({ to: targetEmail, subject, html, text: link });
				}
			} catch (_) {}
		});
		return res.status(201).json({ success: true, data: created });
	} catch (error) {
		next(error);
	}
};

const getReplies = async (req, res, next) => {
	try {
		const { answerId } = req.params;
		const answer = await Answer.findById(answerId).select("replies").populate({ path: "replies.user", select: "fullname email profileimage" });
		if (!answer) return next(new ErrorHandeler("Answer not found", 404));
		res.json({ success: true, data: answer.replies || [] });
	} catch (error) {
		next(error);
	}
};

module.exports.addReply = addReply;
module.exports.getReplies = getReplies;

// ===== Answer Update/Delete =====
const updateAnswer = async (req, res, next) => {
	try {
		const { answerId } = req.params;
		const { content } = req.body;
		if (!content || !content.trim()) return next(new ErrorHandeler("Content is required", 400));
		const userId = req.userid || (req.user && req.user._id);
		const isAdmin = req.user && req.user.role === "admin";
		const answer = await Answer.findById(answerId);
		if (!answer) return next(new ErrorHandeler("Answer not found", 404));
		const isOwner = String(answer.author) === String(userId);
		if (!isOwner && !isAdmin) return next(new ErrorHandeler("Forbidden", 403));
		answer.content = sanitizeHtml(content.trim());
		await answer.save();
		res.json({ success: true, data: answer });
	} catch (error) {
		next(error);
	}
};

const deleteAnswer = async (req, res, next) => {
	try {
		const { answerId } = req.params;
		const userId = req.userid || (req.user && req.user._id);
		const isAdmin = req.user && req.user.role === "admin";
		const answer = await Answer.findById(answerId);
		if (!answer) return next(new ErrorHandeler("Answer not found", 404));
		const isOwner = String(answer.author) === String(userId);
		if (!isOwner && !isAdmin) return next(new ErrorHandeler("Forbidden", 403));
		await Answer.deleteOne({ _id: answerId });
		res.json({ success: true, data: { deleted: true, answerId } });
	} catch (error) {
		next(error);
	}
};

// ===== Reply Update/Delete =====
const updateReply = async (req, res, next) => {
	try {
		const { answerId, replyId } = req.params;
		const { content } = req.body;
		if (!content || !content.trim()) return next(new ErrorHandeler("Content is required", 400));
		const userId = req.userid || (req.user && req.user._id);
		const isAdmin = req.user && req.user.role === "admin";
		const answer = await Answer.findById(answerId);
		if (!answer) return next(new ErrorHandeler("Answer not found", 404));
		const idx = (answer.replies || []).findIndex((r) => String(r._id) === String(replyId));
		if (idx === -1) return next(new ErrorHandeler("Reply not found", 404));
		const reply = answer.replies[idx];
		const isOwner = String(reply.user) === String(userId);
		if (!isOwner && !isAdmin) return next(new ErrorHandeler("Forbidden", 403));
		reply.content = sanitizeHtml(content.trim());
		answer.replies.set(idx, reply);
		await answer.save();
		res.json({ success: true, data: reply });
	} catch (error) {
		next(error);
	}
};

const deleteReply = async (req, res, next) => {
	try {
		const { answerId, replyId } = req.params;
		const userId = req.userid || (req.user && req.user._id);
		const isAdmin = req.user && req.user.role === "admin";
		const answer = await Answer.findById(answerId);
		if (!answer) return next(new ErrorHandeler("Answer not found", 404));
		const idx = (answer.replies || []).findIndex((r) => String(r._id) === String(replyId));
		if (idx === -1) return next(new ErrorHandeler("Reply not found", 404));
		const reply = answer.replies[idx];
		const isOwner = String(reply.user) === String(userId);
		if (!isOwner && !isAdmin) return next(new ErrorHandeler("Forbidden", 403));
		answer.replies.splice(idx, 1);
		await answer.save();
		res.json({ success: true, data: { deleted: true, replyId } });
	} catch (error) {
		next(error);
	}
};

module.exports.updateAnswer = updateAnswer;
module.exports.deleteAnswer = deleteAnswer;
module.exports.updateReply = updateReply;
module.exports.deleteReply = deleteReply;



