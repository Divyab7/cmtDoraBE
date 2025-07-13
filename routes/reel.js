// routes/profile.js
const {
    fetchYoutubeReels,
    fetchReelDetailsById,
    fetchReelDetails,
    fetchReelDetailsV2,
  } = require('../controllers/reelsController');
  
  const express = require('express');
  const route = express.Router();
  
  route.get('/', fetchYoutubeReels);

  route.get('/:type', fetchReelDetails);
  route.get('/id/:id', fetchReelDetailsById);
  route.get('/v2/:type', fetchReelDetailsV2);
  
  module.exports = route;
  