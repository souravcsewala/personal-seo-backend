const express = require("express");
const { isAuthCheck } = require("../middileware/IsAuthCheck");
const { isRoleCheak } = require("../middileware/IsRoleCheak");
const {
  getActiveAnnouncement,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  listPushSendsForAnnouncement,
} = require("../controllers/announcementController");

const router = express.Router();

// Public
router.get("/active", getActiveAnnouncement);
router.get("/", listAnnouncements);

// Admin
router.post("/", isAuthCheck, isRoleCheak("admin"), createAnnouncement);
router.put("/:id", isAuthCheck, isRoleCheak("admin"), updateAnnouncement);
router.delete("/:id", isAuthCheck, isRoleCheak("admin"), deleteAnnouncement);
router.get("/:id/push-sends", isAuthCheck, isRoleCheak("admin"), listPushSendsForAnnouncement);

module.exports = router;




