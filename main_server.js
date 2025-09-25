require("dotenv").config();
const { sub_server } = require("./sub_server");
require("colors");   
const PORT = process.env.PORT || 7080; 

    
const LETSGOSERVER = () => {
  try {
    sub_server.listen(PORT, () => {
      console.log(
        `Server is running on port ${PORT}`
      );
    });
  } catch (error) {
    console.log(`error from main server ${error}`);
  }
};
LETSGOSERVER();
