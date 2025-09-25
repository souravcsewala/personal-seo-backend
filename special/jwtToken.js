const sendToken = (user, statusCode, res) => {
  const token = user.getJwtToken(); 
  
    
    res.status(statusCode).json({
      success: true,
      token, 
      user,
      message:"login successfully"
    });
 
};
module.exports=sendToken