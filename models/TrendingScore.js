const mongoose = require("mongoose");

const LastTotalsSchema = new mongoose.Schema(
  {
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    answers: { type: Number, default: 0 },
    votes: { type: Number, default: 0 },
  },
  { _id: false }
);

const BreakdownSchema = new mongoose.Schema(
  {
    viewsDelta: { type: Number, default: 0 },
    likesDelta: { type: Number, default: 0 },
    commentsDelta: { type: Number, default: 0 },
    sharesDelta: { type: Number, default: 0 },
    answersDelta: { type: Number, default: 0 },
    votesDelta: { type: Number, default: 0 },
    weightedEngagement: { type: Number, default: 0 },
  },
  { _id: false }
);

const TrendingScoreSchema = new mongoose.Schema(
  {
    contentType: { type: String, enum: ["blog", "question", "poll"], required: true },
    contentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    score: { type: Number, default: 0 },
    lastTotals: { type: LastTotalsSchema, default: () => ({}) },
    breakdown: { type: BreakdownSchema, default: () => ({}) },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

TrendingScoreSchema.index({ contentType: 1, contentId: 1 }, { unique: true });
TrendingScoreSchema.index({ contentType: 1, score: -1 });

module.exports = mongoose.model("TrendingScore", TrendingScoreSchema);


