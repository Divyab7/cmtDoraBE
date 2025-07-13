const express = require('express');//+
const { searchLocation } = require('../controllers/utilsController');//+
const route = express.Router();//+
//+
route.get('/searchLocation', searchLocation);//+
//+
module.exports = route;//+
