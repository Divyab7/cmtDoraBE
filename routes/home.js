const {
    getTopCountriesAndRandomBlogs,
  } = require('../controllers/homeController');
  
  const express = require('express');
  const route = express.Router();
  
  route.get('/', getTopCountriesAndRandomBlogs);
  
  module.exports = route;