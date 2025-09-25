const express = require("express");
const { isAuthCheck } = require("../middileware/IsAuthCheck");
const { isRoleCheak } = require("../middileware/IsRoleCheak");
const { createPoll, getAllPolls, getPollById, updatePoll, deletePoll, votePoll, getPollResults } = require("../controllers/pollController");

const router = express.Router();

router.get("/", getAllPolls);
router.get("/:id", getPollById);
router.get("/:id/results", getPollResults);
router.post("/", isAuthCheck, createPoll);
router.put("/:id", isAuthCheck, updatePoll);
router.delete("/:id", isAuthCheck, isRoleCheak("admin"), deletePoll);
router.post("/:id/vote", isAuthCheck, votePoll);

module.exports = router;


