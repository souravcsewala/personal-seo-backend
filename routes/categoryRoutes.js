const express = require("express");
const { isAuthCheck } = require("../middileware/IsAuthCheck");
const { isRoleCheak } = require("../middileware/IsRoleCheak");
const { createCategory, listCategories, getCategoryById, updateCategory, deleteCategory } = require("../controllers/categoryController");

const router = express.Router();

// Public
router.get("/get-all-category", listCategories);
router.get("/get-category/:id", getCategoryById);

// Admin only
router.post("/create-category", isAuthCheck, isRoleCheak("admin"), createCategory);
router.put("/update-category/:id", isAuthCheck, isRoleCheak("admin"), updateCategory);
router.delete("/delete-category/:id", isAuthCheck, isRoleCheak("admin"), deleteCategory);

module.exports = router;


