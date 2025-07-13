const express = require("express");
const { partnerCreate } = require("../controllers/partnerController");
const { requiredLogin } = require("../middleware/requiredLogin");
const { partnerLogin } = require("../controllers/partnerController");

const route = express.Router();

route.post("/register", requiredLogin, partnerCreate);
route.post("/login", partnerLogin);

module.exports = route;
