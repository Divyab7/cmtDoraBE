/**
 * Simple test script for the Travel Budget Estimator widget
 * 
 * How to use:
 * 1. Make sure your server is running
 * 2. Run this script with Node.js: node tests/widgets-budget-test.js
 */

const axios = require('axios');

// Configuration - change these values to test different scenarios
const config = {
  baseUrl: 'http://localhost:3000', // Change to your server URL if different
  endpoint: '/widgets/travel-budget',
  params: {
    destination: 'Tokyo, Japan',
    origin: 'New York, USA',
    passengers: 2,
    duration: 10,
    travelStyle: 'Mid-range',
    // Uncomment to add more detailed parameters
    // accommodation: 'Hotels and traditional ryokans',
    // transportation: 'Bullet train and public transport',
    // activities: 'Visiting temples, museums, and day trips to Mount Fuji'
  }
};

async function testBudgetEstimator() {
  try {
    console.log('Testing Travel Budget Estimator with parameters:');
    console.log(config.params);
    console.log('\nSending request...');

    const response = await axios.get(`${config.baseUrl}${config.endpoint}`, {
      params: config.params
    });

    console.log('\nResponse received!');
    console.log('Status:', response.status);
    
    if (response.data.success) {
      console.log('\nBudget Summary:');
      console.log('Total Cost:', response.data.data.summary.totalEstimatedCost, response.data.data.summary.currency);
      console.log('Cost Per Person:', response.data.data.summary.costPerPerson, response.data.data.summary.currency);
      console.log('Cost Per Day:', response.data.data.summary.costPerDay, response.data.data.summary.currency);
      console.log('Budget Level:', response.data.data.summary.budgetLevel);
      
      console.log('\nBreakdown:');
      console.log('Accommodation:', response.data.data.breakdown.accommodation.totalCost, response.data.data.summary.currency);
      console.log('International Transport:', response.data.data.breakdown.transportation.international.totalCost, response.data.data.summary.currency);
      console.log('Local Transport:', response.data.data.breakdown.transportation.local.totalCost, response.data.data.summary.currency);
      console.log('Food:', response.data.data.breakdown.food.totalCost, response.data.data.summary.currency);
      console.log('Activities:', response.data.data.breakdown.activities.totalCost, response.data.data.summary.currency);
      console.log('Miscellaneous:', response.data.data.breakdown.miscellaneous.totalCost, response.data.data.summary.currency);
      
      console.log('\nSuggested Activities:');
      response.data.data.breakdown.activities.suggestedActivities.forEach((activity, index) => {
        console.log(`${index + 1}. ${activity.name}: ${activity.estimatedCost} ${response.data.data.summary.currency}`);
      });
      
      console.log('\nSaving Tips:');
      response.data.data.savingTips.forEach((tip, index) => {
        console.log(`${index + 1}. ${tip}`);
      });
    } else {
      console.log('\nError:', response.data.message);
    }
  } catch (error) {
    console.error('Error testing budget estimator:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testBudgetEstimator(); 