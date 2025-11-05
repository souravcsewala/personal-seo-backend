const express = require("express");
const { isAuthCheck } = require("../middileware/IsAuthCheck");
const { followUser, unfollowUser, getFollowStats, getFollowers, getFollowing } = require("../controllers/userController");

const router = express.Router();

router.post("/:id/follow", isAuthCheck, followUser);
router.delete("/:id/follow", isAuthCheck, unfollowUser);
router.get("/:id/follow-stats", getFollowStats);
router.get("/:id/followers", getFollowers);
router.get("/:id/following", getFollowing);

module.exports = router;


