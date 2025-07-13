/**
 * Simple test script for the Crowd Estimator widget
 * 
 * How to use:
 * 1. Make sure your server is running
 * 2. Run this script with Node.js: node tests/widgets-crowd-test.js
 */

const axios = require('axios');

// Configuration - change these values to test different scenarios
const config = {
  baseUrl: 'http://localhost:3000', // Change to your server URL if different
  endpoint: '/widgets/crowd-estimator',
  params: {
    location: 'Eiffel Tower',
    // Uncomment one of these to test with season or date
    season: 'summer',
    // date: '15-07-2024'  // DD-MM-YYYY format
  }
};

async function testCrowdEstimator() {
  try {
    console.log('Testing Crowd Estimator with parameters:');
    console.log(config.params);
    console.log('\nSending request...');

    const response = await axios.get(`${config.baseUrl}${config.endpoint}`, {
      params: config.params
    });

    console.log('\nResponse received!');
    console.log('Status:', response.status);
    
    if (response.data.success) {
      const data = response.data.data;
      
      console.log('\nLocation Information:');
      console.log(`${data.location.name}, ${data.location.region}, ${data.location.country} (${data.location.type})`);
      
      console.log('\nOverall Crowd Level:');
      console.log(`Level: ${data.overallCrowdLevel.level}`);
      console.log(`Description: ${data.overallCrowdLevel.description}`);
      
      console.log('\nSeasonal Analysis:');
      console.log(`Requested Season: ${data.seasonalAnalysis.currentOrRequestedSeason.name}`);
      console.log(`Crowd Level: ${data.seasonalAnalysis.currentOrRequestedSeason.crowdLevel}`);
      
      console.log('\nBusiest Days:', data.weeklyPatterns.busiestDays.join(', '));
      console.log('Quietest Days:', data.weeklyPatterns.quietestDays.join(', '));
      
      console.log('\nBest Time to Visit:', data.dailyPatterns.bestTimeToVisit);
      
      console.log('\nPopular Attractions:');
      data.popularAttractions.forEach((attraction, index) => {
        console.log(`${index + 1}. ${attraction.name} - Crowd Level: ${attraction.crowdLevel}`);
        console.log(`   Best Time: ${attraction.bestTimeToVisit}`);
      });
      
      console.log('\nCrowd Avoidance Tips:');
      data.crowdAvoidanceTips.forEach((tip, index) => {
        console.log(`${index + 1}. ${tip.tip}`);
      });
      
      if (data.specialEvents.length > 0) {
        console.log('\nSpecial Events:');
        data.specialEvents.forEach((event, index) => {
          console.log(`${index + 1}. ${event.name} (${event.dates}) - Impact: ${event.crowdImpact}`);
        });
      }
    } else {
      console.log('\nError:', response.data.message);
    }
  } catch (error) {
    console.error('Error testing crowd estimator:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testCrowdEstimator(); 