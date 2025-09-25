const express = require("express");
const { isAuthCheck } = require("../middileware/IsAuthCheck");
const { isRoleCheak } = require("../middileware/IsRoleCheak");
const { createQuestion, getAllQuestions, getQuestionById, updateQuestion, deleteQuestion } = require("../controllers/questionController");
const { createAnswer, getAnswers, toggleLikeAnswer, acceptAnswer } = require("../controllers/answerController");

const router = express.Router();

router.get("/", getAllQuestions);
router.get("/:id", getQuestionById);
router.post("/", isAuthCheck, createQuestion);
router.put("/:id", isAuthCheck, updateQuestion);
router.delete("/:id", isAuthCheck, isRoleCheak("admin"), deleteQuestion);

// Answers
router.get("/:questionId/answers", getAnswers);
router.post("/:questionId/answers", isAuthCheck, createAnswer);
router.post("/answers/:answerId/like", isAuthCheck, toggleLikeAnswer);
router.post("/answers/:answerId/accept", isAuthCheck, acceptAnswer);

module.exports = router;


