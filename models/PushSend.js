const mongoose = require("mongoose");

const PushSendSchema = new mongoose.Schema(
  {
    announcement: { type: mongoose.Schema.Types.ObjectId, ref: "Announcement", required: true },
    sentAt: { type: Date, default: Date.now },
    successCount: { type: Number, required: true },
    failureCount: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PushSend", PushSendSchema);


