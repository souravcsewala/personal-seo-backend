const Answer = require("../models/Answer");
const Question = require("../models/Question");
const ErrorHandeler = require("../special/errorHandelar");

const createAnswer = async (req, res, next) => {
	try {
		const { questionId } = req.params;
		const { content } = req.body;
		if (!content || !content.trim()) return next(new ErrorHandeler("Content is required", 400));
		const question = await Question.findById(questionId);
		if (!question) return next(new ErrorHandeler("Question not found", 404));
		const answer = await Answer.create({
			question: question._id,
			content: content.trim(),
			author: req.userid || (req.user && req.user._id) || undefined,
		});
		res.status(201).json({ success: true, data: answer });
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



