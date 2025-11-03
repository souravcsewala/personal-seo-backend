const express = require("express");



const { isAuthCheck } = require("../middileware/IsAuthCheck");
const{UserRegister,StudentLogin,Login,UpdateInterestedTopic,GetUserProfile, EditProfile, GetUserStats, RequestRegisterOtp, VerifyRegisterOtp, ResendRegisterOtp}=require("../controllers/AuthController")

const Router = express.Router();


Router.route("/user-register").post(UserRegister)

// OTP based registration
Router.route("/register-otp/request").post(RequestRegisterOtp)
Router.route("/register-otp/verify").post(VerifyRegisterOtp)
Router.route("/register-otp/resend").post(ResendRegisterOtp)

Router.route("/user-login").post(Login)

Router.route("/student-login").post(StudentLogin)

// update interested topics (protected)
Router.route("/interested-topic-update").put(isAuthCheck, UpdateInterestedTopic)

// get user profile with interested topics (protected)
Router.route("/user-profile").get(isAuthCheck, GetUserProfile)

// get user stats (protected)
Router.route("/user-stats").get(isAuthCheck, GetUserStats)

// edit profile (protected)
Router.route("/edit-profile").put(isAuthCheck, EditProfile)


module.exports = Router;







