const express = require("express");
const { getFeed, getPublicFeed, getTrending, getCommunityStats } = require("../controllers/feedController");
const { isAuthCheck } = require("../middileware/IsAuthCheck");

const router = express.Router();

// Protected endpoint; requires auth
router.get("/", isAuthCheck, getFeed);

// Public endpoint; no auth
router.get("/public", getPublicFeed);

// Trending only (public)
router.get("/trending", getTrending);

// Community stats (public)
router.get("/community-stats", getCommunityStats);

module.exports = router;


