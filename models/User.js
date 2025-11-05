const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const validator = require("validator");

const UserSchema = new mongoose.Schema({
  fullname: {
    type: String,
    required: [true, "name is required plz provide it"],
    maxLength: [30, "Name cannot exceed 30 characters"],
    minLength: [4, "Name should have more than 4 characters"],
  },
  email: {
    type: String,
    required: [true, "mail id is required plz provide it"],
    unique: true,
    validate: [validator.isEmail, "plz enter valid mail id"],
  },
  phone: {
    type: String,
    required: [true, "please enter your valid phone number"],
    maxLength: [15, "Invalid phone number"],
    minLength: [3, "Invalid phone number"],
  },
  password: {
    type: String,
    required: true,
    minLength: [8, "Password should be greater than 8 characters"],
    select: false,
  },
  profileimage: {
  public_id: { type: String },
  // S3 storage
  key: { type: String },
  url: { type: String },
  },
  role: { type: String, default: "user" },
  bio: { type: String },
  socialLink: { type: String },
  location: { type: String },
  website: { type: String },
 
  isBlocked: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  interested_topic: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Category" }
  ],
  // Social graph
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user', index: true }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user', index: true }],
 
  createdAt: {
    type: Date,
    default: Date.now,
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
});

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.getJwtToken = function () {
  return jwt.sign({ _id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

UserSchema.methods.ComparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

UserSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

const UserModel = mongoose.model("user", UserSchema);
module.exports = UserModel;


