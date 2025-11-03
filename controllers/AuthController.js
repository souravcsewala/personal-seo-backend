const UserModel=require("../models/User")
const ErrorHandeler = require("../special/errorHandelar");
const sendToken = require("../special/jwtToken");
const Category = require("../models/Category");
const Blog = require("../models/Blog");
const mongoose = require("mongoose");


//!1. user register all admin,students, faculty
//! user register without otp verification further they tell for otp verification i add the logic 

const { uploadToS3, deleteFromS3 } = require("../special/s3Client");
const { sendMail, buildFrontendUrl } = require("../special/mailer");
const SignupOtp = require("../models/SignupOtp");
const crypto = require("crypto");
const otpGenerator = require("otp-generator");

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

async function sendVerificationEmail(email, code, req) {
  const subject = 'Your verification code';
  const html = `<p>Your verification code is:</p><h2>${code}</h2><p>This code expires in 2 minutes.</p>`;
  await sendMail({ to: email, subject, html, text: `Code: ${code}` });
}

// Request registration OTP
const RequestRegisterOtp = async (req, res, next) => {
  try {
    const { fullname, email, password, phone, interested_topic, bio, socialLink, location, website } = req.body;
    if (!fullname || !email || !password || !phone) {
      return next(new ErrorHandeler("Please provide all details", 401));
    }
    const existingUser = await UserModel.findOne({ $or: [{ email }, { phone }] }).select('_id');
    if (existingUser) return next(new ErrorHandeler('User already registered with this email or phone', 400));

    // Build normalized payload (image upload handled after verification via profile)
    let interestedTopicIds = [];
    if (typeof interested_topic !== 'undefined') {
      let items = [];
      if (Array.isArray(interested_topic)) items = interested_topic;
      else if (typeof interested_topic === 'string') items = interested_topic.includes(',') ? interested_topic.split(',') : [interested_topic];
      interestedTopicIds = items.map(v => String(v).trim()).filter(v => /^[0-9a-fA-F]{24}$/.test(v));
    }
    const payload = { fullname, email, password, phone, interested_topic: interestedTopicIds, bio: bio||'', socialLink: socialLink||'', location: location||'', website: website||'' };

    const now = new Date();
    const existing = await SignupOtp.findOne({ email });
    if (existing && existing.resendAfter && existing.resendAfter > now) {
      const ms = existing.resendAfter.getTime() - now.getTime();
      return next(new ErrorHandeler(`Please wait ${Math.ceil(ms/1000)} seconds before requesting a new code`, 429));
    }

    const code = otpGenerator.generate(6, { digits: true, lowerCaseAlphabets: false, upperCaseAlphabets: false, specialChars: false });
    const otpHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes
    const resendAfter = new Date(Date.now() + 30 * 1000); // throttle 30s

    if (existing) {
      existing.otpHash = otpHash;
      existing.expiresAt = expiresAt;
      existing.payload = payload;
      existing.resendAfter = resendAfter;
      await existing.save();
    } else {
      await SignupOtp.create({ email, otpHash, expiresAt, payload, resendAfter });
    }

    res.status(200).json({ success: true, message: 'OTP sent' });
    setImmediate(() => {
      sendVerificationEmail(email, code, req).catch((err) => {
        console.error('sendVerificationEmail failed:', err);
      });
    });
    return;
  } catch (error) { next(error); }
};

// Verify registration OTP and create user
const VerifyRegisterOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return next(new ErrorHandeler('Email and otp are required', 400));
    const rec = await SignupOtp.findOne({ email });
    if (!rec) return next(new ErrorHandeler('No pending verification found', 404));
    if (rec.expiresAt < new Date()) return next(new ErrorHandeler('Code expired. Please request a new one.', 400));
    const ok = rec.otpHash === hashOtp(String(otp));
    if (!ok) return next(new ErrorHandeler('Invalid code', 400));

    const p = rec.payload || {};
    const user = await UserModel.create({
      fullname: p.fullname,
      email: p.email,
      password: p.password,
      phone: p.phone,
      interested_topic: p.interested_topic || [],
      bio: p.bio || undefined,
      socialLink: p.socialLink || undefined,
      location: p.location || undefined,
      website: p.website || undefined,
      isVerified: true,
    });
    await SignupOtp.deleteOne({ _id: rec._id });

    res.status(201).json({ success: true, message: 'Registration complete', data: { _id: user._id, email: user.email } });
  } catch (error) { next(error); }
};

// Resend OTP (throttled)
const ResendRegisterOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(new ErrorHandeler('Email is required', 400));
    const rec = await SignupOtp.findOne({ email });
    if (!rec) return next(new ErrorHandeler('No pending verification found', 404));
    const now = new Date();
    if (rec.resendAfter && rec.resendAfter > now) {
      const ms = rec.resendAfter.getTime() - now.getTime();
      return next(new ErrorHandeler(`Please wait ${Math.ceil(ms/1000)} seconds before requesting a new code`, 429));
    }
    const code = otpGenerator.generate(6, { digits: true, lowerCaseAlphabets: false, upperCaseAlphabets: false, specialChars: false });
    rec.otpHash = hashOtp(code);
    rec.expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    rec.resendAfter = new Date(Date.now() + 30 * 1000);
    await rec.save();
    await sendVerificationEmail(email, code, req);
    res.json({ success: true, message: 'Verification code resent' });
  } catch (error) { next(error); }
};

const UserRegister = async (req, res, next) => {
  try {
    const { fullname, email, password, phone, interested_topic, bio, socialLink, location, website } = req.body;
    if (!fullname || !email || !password || !phone) {
      return next(new ErrorHandeler("Please provide all details", 401));
    }

    const existingUser = await UserModel.findOne({
      $or: [{ email }, { phone }],
    }).select("_id email phone");

    if (existingUser) {
      return next(
        new ErrorHandeler("User already registered with this email or phone", 400)
      );
    }

    // Normalize interested_topic into an array of valid ObjectId-like strings
    let interestedTopicIds = [];
    if (typeof interested_topic !== "undefined") {
      let items = [];
      if (Array.isArray(interested_topic)) items = interested_topic;
      else if (typeof interested_topic === "string") {
        if (interested_topic.includes(",")) items = interested_topic.split(",");
        else items = [interested_topic];
      } else {
        items = [interested_topic];
      }
      interestedTopicIds = items
        .map((v) => String(v).trim())
        .filter((v) => /^[0-9a-fA-F]{24}$/.test(v));
    }

    // Optional profile image via express-fileupload → req.files.profileimage
    let profileimage = undefined;
    if (req.files && req.files.profileimage) {
      const file = req.files.profileimage;
      const uploaded = await uploadToS3({ filePath: file.tempFilePath, contentType: file.mimetype, key: undefined });
      profileimage = { key: uploaded.key, url: uploaded.url };
    }

    const user = await UserModel.create({
      fullname,
      email,
      password,
      phone,
      interested_topic: interestedTopicIds,
      bio: bio || undefined,
      socialLink: socialLink || undefined,
      location: location || undefined,
      website: website || undefined,
      profileimage,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    // Handle duplicate key error gracefully (in case of race conditions)
    if (error && error.code === 11000 && error.keyPattern) {
      const field = Object.keys(error.keyPattern)[0] || "field";
      return next(new ErrorHandeler(`Duplicate ${field}`, 400));
    }
    console.log("Error from UserRegister", error);
    next(error);
  }
};



//*2.  login -- admin,user,instructor
const Login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new ErrorHandeler("Please provide email and password", 400));
    }

    const user = await UserModel.findOne({ email }).select("+password");
    
    if (!user) {
      return next(new ErrorHandeler("Invalid email or password", 401));
    }

    const isPasswordMatch = await user.ComparePassword(password);
    if (!isPasswordMatch) {
      return next(new ErrorHandeler("Invalid email or password", 404));
    }

    
    sendToken(user, 200, res);
    
  } catch (error) {
    console.log("Error from admin,user,faculty login", error);
    next(error);
  }
};


//?3. logout -- user,admin,student,
const Logout = async (req, res, next) => {
  try {
  
    res.status(200).json({
      success: true,
      message: " Logged Out",
    });
  } catch (error) {
    console.log("Error from admin logout", error);
    next(error);
  }
};


//?4. user load after user login only for loggin user 
    const LoadUser=async(req,res,next)=>{
         try{
             const user=await UserModel.findById( req.userid).select("-password");;
            if(!user) return next(new ErrorHandeler("user not found",404));
              res.status(200).send({
                 success:true,
                 data:user,
                isLoggedIn:true
              })
         }catch(error){
            console.log("The error from load user",error);
             next(error)
         }
    }


    //*5. student login 
const StudentLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new ErrorHandeler("Please provide email and password", 400));
    }

    const user = await UserModel.findOne({ email }).select("+password");

    if (!user) {
      return next(new ErrorHandeler("Invalid email or password", 401));
    }

    const isPasswordMatch = await user.ComparePassword(password);
    if (!isPasswordMatch) {
      return next(new ErrorHandeler("Invalid email or password", 401));
    }

    
    if (user.role === "student") {
      if (!user.isVerified) {
        return res.status(403).json({
          success: false,
          message: "You are not approved by the admin. Please wait for approval.",
        });
      } }

    
    sendToken(user, 200, res);
  } catch (error) {
    console.log("Error from admin login", error);
    next(error);
  }
};


// Update logged-in user's interested topics
const UpdateInterestedTopic = async (req, res, next) => {
  try {
    const userId = req.userid;
    if (!userId) return next(new ErrorHandeler("Unauthorized", 401));

    const { interested_topic } = req.body || {};
    if (typeof interested_topic === "undefined") {
      return next(new ErrorHandeler("interested_topic is required", 400));
    }

    let items = [];
    if (Array.isArray(interested_topic)) items = interested_topic;
    else if (typeof interested_topic === "string") {
      items = interested_topic.includes(",")
        ? interested_topic.split(",")
        : [interested_topic];
    } else {
      items = [interested_topic];
    }

    const interestedTopicIds = items
      .map((v) => String(v).trim())
      .filter((v) => /^[0-9a-fA-F]{24}$/.test(v));

    const updated = await UserModel.findByIdAndUpdate(
      userId,
      { interested_topic: interestedTopicIds },
      { new: true }
    ).select("-password");

    if (!updated) return next(new ErrorHandeler("user not found", 404));

    res.json({ success: true, message: "Interests updated", data: updated });
  } catch (error) {
    console.log("Error updating interested topics", error);
    next(error);
  }
};


// Get logged-in user's profile with populated interested topics
const { getSignedUrlForKey } = require("../special/s3Client");

const GetUserProfile = async (req, res, next) => {
  try {
    const userId = req.userid;
    if (!userId) return next(new ErrorHandeler("Unauthorized", 401));

    const user = await UserModel.findById(userId)
      .select("-password")
      .populate({ path: "interested_topic", select: "name" });

    if (!user) return next(new ErrorHandeler("user not found", 404));

    const plain = user.toObject();
    try {
      if (plain && plain.profileimage && plain.profileimage.key) {
        plain.profileimage.signedUrl = await getSignedUrlForKey(plain.profileimage.key, 3600);
      }
    } catch (_) {}

    res.json({ success: true, data: plain });
  } catch (error) {
    console.log("Error fetching user profile", error);
    next(error);
  }
};

// Edit profile for logged-in user
const EditProfile = async (req, res, next) => {
  try {
    const userId = req.userid;
    if (!userId) return next(new ErrorHandeler("Unauthorized", 401));

    const { fullname, bio, socialLink, location, website, phone } = req.body || {};

    const user = await UserModel.findById(userId);
    if (!user) return next(new ErrorHandeler("user not found", 404));

    if (typeof fullname !== "undefined") user.fullname = fullname;
    if (typeof bio !== "undefined") user.bio = bio;
    if (typeof socialLink !== "undefined") user.socialLink = socialLink;
    if (typeof location !== "undefined") user.location = location;
    if (typeof website !== "undefined") user.website = website;
    if (typeof phone !== "undefined") user.phone = phone;

    // Optional new profile image
    if (req.files && req.files.profileimage) {
      try {
        if (user.profileimage && user.profileimage.key) {
          await deleteFromS3(user.profileimage.key);
        }
      } catch (_) {}
      const file = req.files.profileimage;
      const uploaded = await uploadToS3({ filePath: file.tempFilePath, contentType: file.mimetype });
      user.profileimage = { key: uploaded.key, url: uploaded.url };
    }

    await user.save();
    const sanitized = await UserModel.findById(user._id).select("-password");
    const plain = sanitized ? sanitized.toObject() : null;
    try {
      if (plain && plain.profileimage && plain.profileimage.key) {
        plain.profileimage.signedUrl = await getSignedUrlForKey(plain.profileimage.key, 3600);
      }
    } catch (_) {}
    res.json({ success: true, message: "Profile updated", data: plain || sanitized });
  } catch (error) {
    next(error);
  }
};

// Get simple stats for the logged-in user (counts only)
const GetUserStats = async (req, res, next) => {
  try {
    const userId = req.userid;
    if (!userId) return next(new ErrorHandeler("Unauthorized", 401));

    const [postsCount, likesAgg] = await Promise.all([
      Blog.countDocuments({ author: userId }),
      Blog.aggregate([
        { $match: { author: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, totalLikes: { $sum: "$likesCount" } } },
      ]),
    ]);

    const likes = (likesAgg && likesAgg[0] && likesAgg[0].totalLikes) ? likesAgg[0].totalLikes : 0;

    res.json({
      success: true,
      data: {
        posts: postsCount || 0,
        followers: 0, // not implemented yet
        following: 0, // not implemented yet
        likes: likes || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { UserRegister,Logout,Login ,StudentLogin,LoadUser,UpdateInterestedTopic,GetUserProfile, EditProfile, GetUserStats, RequestRegisterOtp, VerifyRegisterOtp, ResendRegisterOtp };
