const ErrorHandler = require("../special/errorHandelar");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const isAuthCheck = async (req, res, next) => {
  try {
    const token = req.header("x-auth-token");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No auth token, access denied.",
      });
    }

    
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    if (!decodedToken) {
      return res.status(401).json({
        success: false,
        message: "Token verification failed, authorization denied.",
      });
    }

    
    const user = await User.findById(decodedToken._id);
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    
    req.user = user;
    req.userid = user._id;
    req.userName = user.name;
    req.userRole = user.role;

    console.log("Authenticated as user, req.userid:", user._id);
    next();
  } catch (error) {
    console.error("Error in isAuthCheck middleware:", error);
    next(error);
  }
};

module.exports = { isAuthCheck };
