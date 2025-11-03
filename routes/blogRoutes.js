const express = require("express");
const { createBlog, getAllBlogs, getBlogsByAuthor, getBlogsByCategory, getBlogById, getBlogBySlug, updateBlog, deleteBlog, addComment, getComments, toggleLike, shareBlog, getRecommendedByBlog, editComment, deleteComment, searchBlogs, getCommentReplies, addCommentReply, updateCommentReply, deleteCommentReply } = require("../controllers/blogController");
const { isAuthCheck } = require("../middileware/IsAuthCheck");
const { isRoleCheak } = require("../middileware/IsRoleCheak");

const router = express.Router();

router.get("/get-all-blogs", getAllBlogs);
router.get("/get-blog-by-author/:userId", getBlogsByAuthor);
router.get("/get-blog-by-category/:category", getBlogsByCategory); // category id or name
router.get("/blog-details/:slug", getBlogBySlug);
// search must come BEFORE the dynamic :id route
router.get("/search", searchBlogs);
router.get("/:id", getBlogById); // id or slug

// interactions
router.get("/:id/get-all-comments", getComments);
router.post("/:id/add-comments", isAuthCheck, addComment);
router.get("/:id/comments/:commentId/replies", getCommentReplies);
router.post("/:id/comments/:commentId/replies", isAuthCheck, addCommentReply);
router.put("/:id/comments/:commentId/replies/:replyId", isAuthCheck, updateCommentReply);
router.delete("/:id/comments/:commentId/replies/:replyId", isAuthCheck, deleteCommentReply);
router.put("/:id/comments/:commentId", isAuthCheck, editComment);
router.delete("/:id/comments/:commentId", isAuthCheck, deleteComment);
router.post("/:id/like", isAuthCheck, toggleLike);
router.post("/:id/share", isAuthCheck, shareBlog);

// recommended by category (id or slug)
router.get("/:idOrSlug/recommended", getRecommendedByBlog);

router.post("/create-blog", isAuthCheck, createBlog);
router.put("/update-blog/:id", isAuthCheck, updateBlog);
router.delete("/delete-blog/:id", isAuthCheck, isRoleCheak("admin","user"), deleteBlog);

module.exports = router;


