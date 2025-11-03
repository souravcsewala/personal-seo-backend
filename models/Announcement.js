const mongoose = require("mongoose");

const AnnouncementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    contentHtml: { type: String, default: "" },
    linkUrl: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
    startAt: { type: Date },
    endAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  },
  { timestamps: true }
);

AnnouncementSchema.index({ isActive: 1, startAt: 1, endAt: 1, priority: -1, createdAt: -1 });

module.exports = mongoose.model("Announcement", AnnouncementSchema);




