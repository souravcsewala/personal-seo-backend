const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true },
    description: { type: String, required: true },
    slug: { type: String, trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    tags: [{ type: String, trim: true }],
    author: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    viewsCount: { type: Number, default: 0 },
    // Interactions
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    likesCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

QuestionSchema.index(
  { slug: 1 },
  {
    unique: true,
    name: "unique_question_slug",
    partialFilterExpression: { slug: { $type: "string" } },
  }
);

module.exports = mongoose.model("Question", QuestionSchema);


