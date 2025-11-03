const express = require("express");
const router = express.Router();
const { registerToken, unregisterToken, registerTokenGuest } = require("../controllers/pushController");
const { isAuthCheck } = require("../middileware/IsAuthCheck");

router.post("/register-token", isAuthCheck, registerToken);
router.delete("/unregister-token", isAuthCheck, unregisterToken);
// Guest (no auth)
router.post("/register-token-guest", registerTokenGuest);

module.exports = router;



