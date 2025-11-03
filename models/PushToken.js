const mongoose = require("mongoose");

const PushTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    token: { type: String, required: true },
    platform: { type: String, enum: ["web"], default: "web" },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

PushTokenSchema.index({ token: 1 }, { unique: true });
PushTokenSchema.index({ user: 1, platform: 1 });

module.exports = mongoose.model("PushToken", PushTokenSchema);



