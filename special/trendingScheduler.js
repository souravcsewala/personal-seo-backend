const mongoose = require("mongoose");
const Blog = require("../models/Blog");
const Question = require("../models/Question");
const Poll = require("../models/Poll");
const TrendingScore = require("../models/TrendingScore");
const { computeWeightedEngagement, scoreWithAge } = require("../utils/trendingScoring");

async function computeBlogScores(now) {
  const blogs = await Blog.find({}).select("_id createdAt likesCount shareCount comments viewsCount");
  for (const b of blogs) {
    const existing = await TrendingScore.findOne({ contentType: 'blog', contentId: b._id });
    const currentTotals = {
      views: b.viewsCount || 0,
      likes: b.likesCount || 0,
      comments: Array.isArray(b.comments) ? b.comments.length : 0,
      shares: b.shareCount || 0,
    };
    const lastTotals = existing?.lastTotals || {};
    const deltas = {
      viewsDelta: Math.max(0, (currentTotals.views || 0) - (lastTotals.views || 0)),
      likesDelta: Math.max(0, (currentTotals.likes || 0) - (lastTotals.likes || 0)),
      commentsDelta: Math.max(0, (currentTotals.comments || 0) - (lastTotals.comments || 0)),
      sharesDelta: Math.max(0, (currentTotals.shares || 0) - (lastTotals.shares || 0)),
    };
    const weightedEngagement = computeWeightedEngagement('blog', deltas);
    const ageHours = Math.max(0, (now - new Date(b.createdAt)) / 36e5);
    const score = scoreWithAge(weightedEngagement, ageHours);
    await TrendingScore.updateOne(
      { contentType: 'blog', contentId: b._id },
      {
        $set: {
          score,
          lastTotals: currentTotals,
          breakdown: { ...deltas, weightedEngagement },
          computedAt: now,
        },
      },
      { upsert: true }
    );
  }
}

async function computeQuestionScores(now) {
  const questions = await Question.find({}).select("_id createdAt viewsCount");
  // answers count per question
  const Answer = require("../models/Answer");
  const counts = await Answer.aggregate([
    { $group: { _id: "$question", c: { $sum: 1 } } }
  ]);
  const mapCounts = new Map(counts.map(r => [String(r._id), r.c]));
  for (const q of questions) {
    const existing = await TrendingScore.findOne({ contentType: 'question', contentId: q._id });
    const currentTotals = {
      views: q.viewsCount || 0,
      answers: mapCounts.get(String(q._id)) || 0,
    };
    const lastTotals = existing?.lastTotals || {};
    const deltas = {
      viewsDelta: Math.max(0, (currentTotals.views || 0) - (lastTotals.views || 0)),
      answersDelta: Math.max(0, (currentTotals.answers || 0) - (lastTotals.answers || 0)),
    };
    const weightedEngagement = computeWeightedEngagement('question', deltas);
    const ageHours = Math.max(0, (now - new Date(q.createdAt)) / 36e5);
    const score = scoreWithAge(weightedEngagement, ageHours);
    await TrendingScore.updateOne(
      { contentType: 'question', contentId: q._id },
      {
        $set: {
          score,
          lastTotals: currentTotals,
          breakdown: { ...deltas, weightedEngagement },
          computedAt: now,
        },
      },
      { upsert: true }
    );
  }
}

async function computePollScores(now) {
  const polls = await Poll.find({}).select("_id createdAt options viewsCount");
  for (const p of polls) {
    const existing = await TrendingScore.findOne({ contentType: 'poll', contentId: p._id });
    const votes = (p.options || []).reduce((s, o) => s + (o.votes || 0), 0);
    const currentTotals = {
      views: p.viewsCount || 0,
      votes,
    };
    const lastTotals = existing?.lastTotals || {};
    const deltas = {
      viewsDelta: Math.max(0, (currentTotals.views || 0) - (lastTotals.views || 0)),
      votesDelta: Math.max(0, (currentTotals.votes || 0) - (lastTotals.votes || 0)),
    };
    const weightedEngagement = computeWeightedEngagement('poll', deltas);
    const ageHours = Math.max(0, (now - new Date(p.createdAt)) / 36e5);
    const score = scoreWithAge(weightedEngagement, ageHours);
    await TrendingScore.updateOne(
      { contentType: 'poll', contentId: p._id },
      {
        $set: {
          score,
          lastTotals: currentTotals,
          breakdown: { ...deltas, weightedEngagement },
          computedAt: now,
        },
      },
      { upsert: true }
    );
  }
}

async function removeOrphans() {
  const all = await TrendingScore.find({}).select("_id contentType contentId");
  for (const t of all) {
    let exists = false;
    if (t.contentType === 'blog') exists = await Blog.exists({ _id: t.contentId });
    else if (t.contentType === 'question') exists = await Question.exists({ _id: t.contentId });
    else if (t.contentType === 'poll') exists = await Poll.exists({ _id: t.contentId });
    if (!exists) {
      await TrendingScore.deleteOne({ _id: t._id });
    }
  }
}

async function runTrendingComputation() {
  const now = new Date();
  await Promise.all([
    computeBlogScores(now),
    computeQuestionScores(now),
    computePollScores(now),
  ]);
  await removeOrphans();
}

function startTrendingScheduler() {
  // run every 5 minutes
  const FIVE_MIN = 30 * 60 * 1000;
  setInterval(() => {
    runTrendingComputation()
      .then(() => console.log("Trending scheduler run completed", new Date().toLocaleString()))
      .catch((e) => console.error("Trending scheduler error", e));
  }, FIVE_MIN);
  // initial warm-up run
  runTrendingComputation()
    .then(() => console.log("Trending scheduler initial run completed", new Date().toLocaleString()))
    .catch((e) => console.error("Trending initial run error", e));
}

module.exports = { startTrendingScheduler, runTrendingComputation };


