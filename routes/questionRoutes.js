const express = require("express");
const { isAuthCheck } = require("../middileware/IsAuthCheck");
const { isRoleCheak } = require("../middileware/IsRoleCheak");
const { createQuestion, getAllQuestions, getQuestionById, updateQuestion, deleteQuestion, getQuestionsByAuthor } = require("../controllers/questionController");
const { createAnswer, getAnswers, toggleLikeAnswer, acceptAnswer, addReply, getReplies, updateAnswer, deleteAnswer, updateReply, deleteReply } = require("../controllers/answerController");

const router = express.Router();

router.get("/", getAllQuestions);
router.get("/by-author/:userId", getQuestionsByAuthor);
router.get("/:id", getQuestionById);
router.post("/", isAuthCheck, createQuestion);
router.put("/:id", isAuthCheck, updateQuestion);
router.delete("/:id", isAuthCheck, deleteQuestion);

// Answers
router.get("/:questionId/answers", getAnswers);
router.post("/:questionId/answers", isAuthCheck, createAnswer);
router.post("/answers/:answerId/like", isAuthCheck, toggleLikeAnswer);
router.post("/answers/:answerId/accept", isAuthCheck, acceptAnswer);
router.get("/answers/:answerId/replies", getReplies);
router.post("/answers/:answerId/replies", isAuthCheck, addReply);
router.put("/answers/:answerId", isAuthCheck, updateAnswer);
router.delete("/answers/:answerId", isAuthCheck, deleteAnswer);
router.put("/answers/:answerId/replies/:replyId", isAuthCheck, updateReply);
router.delete("/answers/:answerId/replies/:replyId", isAuthCheck, deleteReply);

module.exports = router;


