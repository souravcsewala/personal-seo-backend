const Question = require("../models/Question");
const Category = require("../models/Category");
const ErrorHandeler = require("../special/errorHandelar");

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
    if (!title || !description || !category) return next(new ErrorHandeler('Missing required fields', 400));
    const categoryId = await resolveCategoryId(category);
    if (!categoryId) return next(new ErrorHandeler('Invalid category', 400));
    const question = await Question.create({
      title,
      description,
      category: categoryId,
      tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t=>t.trim()).filter(Boolean) : []),
      author: req.userid || (req.user && req.user._id) || undefined,
    });
    res.status(201).json({ success: true, data: question });
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
    const question = await Question.findById(id).populate('category').populate('author', 'fullname email');
    if (!question) return next(new ErrorHandeler('Question not found', 404));
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
    if (title) question.title = title;
    if (description) question.description = description;
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
    await question.deleteOne();
    res.json({ success: true, message: 'Question deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { createQuestion, getAllQuestions, getQuestionById, updateQuestion, deleteQuestion };


