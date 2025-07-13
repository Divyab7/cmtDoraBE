/**
 * Test script for the root endpoint
 * 
 * This script tests that the root endpoint returns the expected JSON response
 * with the welcome message and API version.
 * 
 * To use this script:
 * 1. Make sure the server is running
 * 2. Run: node tests/root-endpoint-test.js
 */

const axios = require('axios');

// Configuration
const config = {
  baseUrl: 'http://localhost:3000'
};

// Function to test the root endpoint
async function testRootEndpoint() {
  try {
    console.log('\n🔍 Testing Root Endpoint...');
    
    // Make the request
    const response = await axios.get(config.baseUrl);
    
    const data = response.data;
    
    console.log('✅ Response received!');
    console.log('\nResponse Data:');
    console.log(JSON.stringify(data, null, 2));
    
    // Verify expected properties
    if (data.message === 'Hello Traveler!' && data.version) {
      console.log('\n✅ Root endpoint is returning the expected JSON format!');
      console.log(`✅ Welcome message: "${data.message}"`);
      console.log(`✅ API version: ${data.version}`);
    } else {
      console.log('\n❌ Root endpoint response does not match expected format.');
      if (data.message !== 'Hello Traveler!') {
        console.log(`❌ Expected message "Hello Traveler!" but got "${data.message}"`);
      }
      if (!data.version) {
        console.log('❌ API version is missing in the response');
      }
    }
  } catch (error) {
    console.error('❌ Error testing root endpoint:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

// Run the test
testRootEndpoint(); 