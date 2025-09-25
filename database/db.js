const mongoose = require("mongoose");

const dbUrl = process.env.MONGODB_URL_DEV;    
  // console.log('dbUrl:', dbUrl);    
const DataBaseconnection = async () => {
  try {
    await mongoose.connect(dbUrl);
    console.log(`Database is connected to ${mongoose.connection.host}`);
  } catch (error) {
    console.log(`the problem from database ${error}`);   
  }
};
module.exports = { DataBaseconnection };
