const mongoose = require("mongoose");

const PollOptionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    votes: { type: Number, default: 0 },
  },
  { _id: false }
);

const PollSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, trim: true },
    description: { type: String },
    options: {
      type: [PollOptionSchema],
      validate: [
        (v) => Array.isArray(v) && v.length >= 2 && v.length <= 10,
        "Poll must have between 2 and 10 options",
      ],
      required: true,
    },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    durationDays: { type: Number, default: 7, min: 1, max: 365 },
    allowMultipleVotes: { type: Boolean, default: false },
    tags: [{ type: String, trim: true }],
    author: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    closesAt: { type: Date },
    viewsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PollSchema.pre("save", function (next) {
  if (!this.isModified("durationDays") && this.closesAt) return next();
  const days = this.durationDays || 7;
  this.closesAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  next();
});

// Ensure unique slug when present
PollSchema.index(
  { slug: 1 },
  {
    unique: true,
    name: "unique_poll_slug",
    partialFilterExpression: { slug: { $type: "string" } },
  }
);

module.exports = mongoose.model("Poll", PollSchema);


