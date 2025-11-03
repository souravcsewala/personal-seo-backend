const ErrorHandelar = require("../special/errorHandelar");

const isRoleCheak = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      const userRole = req.user.role;
      const userName = req.user.name || "User"; 

      if (!allowedRoles.includes(userRole)) {
        return next(
          new ErrorHandelar(
            `Hi ${userName}, you are not allowed to access this resource.`,
            403 
          )
        );
      }

      next();
    } catch (error) {
      console.error("Error in isRoleCheak middleware:", error);
      next(error);
    }
  };
};

module.exports = { isRoleCheak };
