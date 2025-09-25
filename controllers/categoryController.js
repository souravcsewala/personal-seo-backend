const Category = require("../models/Category");
const ErrorHandeler = require("../special/errorHandelar");
const slugify = require("slugify");

const toSlug = (name) => slugify(name || "", { lower: true, strict: true, trim: true });

// Create Category (admin)
const createCategory = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return next(new ErrorHandeler("Name is required", 400));

    const exists = await Category.findOne({ name: name.trim() }).select("_id");
    if (exists) return next(new ErrorHandeler("Category already exists", 409));

    const cat = await Category.create({ name: name.trim(), description });
    res.status(201).json({ success: true, data: cat });
  } catch (error) { next(error); }
};

// List Categories (public)
const listCategories = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, q } = req.query;
    const filter = {};
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Category.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Category.countDocuments(filter),
    ]);
    res.json({ success: true, data: items, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) { next(error); }
};

// Get Category by id (public)
const getCategoryById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cat = await Category.findById(id);
    if (!cat) return next(new ErrorHandeler("Category not found", 404));
    res.json({ success: true, data: cat });
  } catch (error) { next(error); }
};

// Update Category (admin)
const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const cat = await Category.findById(id);
    if (!cat) return next(new ErrorHandeler("Category not found", 404));
    if (name && name.trim()) cat.name = name.trim();
    if (typeof description !== "undefined") cat.description = description;
    await cat.save();
    res.json({ success: true, data: cat });
  } catch (error) { next(error); }
};

// Delete Category (admin)
const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cat = await Category.findById(id);
    if (!cat) return next(new ErrorHandeler("Category not found", 404));
    await cat.deleteOne();
    res.json({ success: true, message: "Category deleted" });
  } catch (error) { next(error); }
};

module.exports = { createCategory, listCategories, getCategoryById, updateCategory, deleteCategory };


