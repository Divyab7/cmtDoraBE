const express = require("express");
const {
  sendEmailOTP,
  checkEmailOTP,
} = require("../controllers/verifyController");
const route = express.Router();

const { mustRequiredLogin } = require("../middleware/requiredLogin");

route.get("/sendMailOTP", mustRequiredLogin, sendEmailOTP);
route.post("/checkMailOTP", mustRequiredLogin, checkEmailOTP);

module.exports = route;
