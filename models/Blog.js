const mongoose = require("mongoose");

const BlogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    metaDescription: { type: String },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    tags: [{ type: String, }],
    image: { type: String },
    imageKey: { type: String },
  imageAlt: { type: String, trim: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: false },
    readTime: { type: String },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
    slug: { type: String, trim: true },
    // Interactions
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    likesCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    viewsCount: { type: Number, default: 0 },
    comments: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
        content: { type: String, required: true, trim: true },
        createdAt: { type: Date, default: Date.now },
        replies: [
          {
            _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
            user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
            content: { type: String, required: true, trim: true },
            parentId: { type: mongoose.Schema.Types.ObjectId },
            createdAt: { type: Date, default: Date.now },
          }
        ],
      },
    ],
  },
  { timestamps: true }
);

// Ensure slug uniqueness at the database level
// BlogSchema.index({ slug: 1 }, { unique: true, name: "unique_slug_index" });

module.exports = mongoose.model("Blog", BlogSchema);


