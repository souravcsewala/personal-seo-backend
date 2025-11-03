const mongoose = require("mongoose");

const SignupOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    payload: { type: Object, required: true },
    resendAfter: { type: Date },
  },
  { timestamps: true }
);

SignupOtpSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model("SignupOtp", SignupOtpSchema);


