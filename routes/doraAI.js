// routes/doraAI.js

const {
  processQuery,
} = require('../controllers/doraAIController');
  
const express = require('express');
const route = express.Router();
  
route.post('/', processQuery);
  
module.exports = route;