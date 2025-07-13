/**
 * Simple test script for the Travel Phrases widget
 * 
 * How to use:
 * 1. Make sure your server is running
 * 2. Run this script with Node.js: node tests/widgets-phrases-test.js
 */

const axios = require('axios');

// Configuration - change these values to test different scenarios
const config = {
  baseUrl: 'http://localhost:3000', // Change to your server URL if different
  endpoint: '/widgets/travel-phrases',
  params: {
    location: 'Barcelona, Spain',
    // sourceLanguage is optional, defaults to English
    // sourceLanguage: 'French' 
  }
};

async function testTravelPhrases() {
  try {
    console.log('Testing Travel Phrases with parameters:');
    console.log(config.params);
    console.log('\nSending request...');

    const response = await axios.get(`${config.baseUrl}${config.endpoint}`, {
      params: config.params
    });

    console.log('\nResponse received!');
    console.log('Status:', response.status);
    
    if (response.data.success) {
      const data = response.data.data;
      
      console.log('\nLanguage Information:');
      console.log('Local Language:', data.localLanguage);
      console.log('Source Language:', data.sourceLanguage);
      console.log('Difficulty Level:', data.languageInfo.difficultyLevel);
      
      console.log('\nNumber of categories:', data.categories.length);
      data.categories.forEach(category => {
        console.log(`\n${category.name} Phrases (${category.phrases.length}):`);
        category.phrases.slice(0, 2).forEach((phrase, index) => {
          console.log(`${index + 1}. ${phrase.phrase} = ${phrase.translation} (${phrase.pronunciation})`);
        });
        if (category.phrases.length > 2) {
          console.log(`... and ${category.phrases.length - 2} more phrases`);
        }
      });
      
      console.log('\nCultural Notes:');
      data.culturalNotes.forEach((note, index) => {
        console.log(`${index + 1}. ${note.title}`);
      });
      
      console.log('\nUseful Tips:');
      data.languageInfo.usefulTips.forEach((tip, index) => {
        console.log(`${index + 1}. ${tip}`);
      });
    } else {
      console.log('\nError:', response.data.message);
    }
  } catch (error) {
    console.error('Error testing travel phrases:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testTravelPhrases(); 