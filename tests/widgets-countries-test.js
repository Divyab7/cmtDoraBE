/**
 * Test script for the Countries endpoint
 * 
 * This script tests the endpoint that returns the list of countries
 * for the Holiday Calculator widget.
 * 
 * To use this script:
 * 1. Make sure the server is running
 * 2. Run: node tests/widgets-countries-test.js
 */

const axios = require('axios');

// Configuration
const config = {
  baseUrl: 'http://localhost:3000',
  endpoint: '/widgets/countries'
};

// Function to test the countries endpoint
async function testCountriesEndpoint() {
  try {
    console.log('\n🔍 Testing Countries Endpoint...');
    
    // Make the request
    const response = await axios.get(`${config.baseUrl}${config.endpoint}`);
    
    const data = response.data;
    
    // Check if request was successful
    if (data.success) {
      console.log('✅ Request successful!');
      console.log(`Found ${data.count} countries\n`);
      
      // Print first 10 countries as a sample
      console.log('Sample of countries (first 10):');
      data.countries.slice(0, 10).forEach(country => {
        console.log(`  - ${country}`);
      });
      
      // Print some statistics
      console.log('\nCountry list statistics:');
      console.log(`  Total countries: ${data.count}`);
      
      if (data.countries.length > 0) {
        console.log(`  First country alphabetically: ${data.countries[0]}`);
        console.log(`  Last country alphabetically: ${data.countries[data.countries.length - 1]}`);
      }
      
      // Check if certain major countries are included
      const majorCountries = ['United States', 'United Kingdom', 'Japan', 'France', 'Australia'];
      const foundMajorCountries = majorCountries.filter(country => data.countries.includes(country));
      
      console.log('\nChecking for major countries:');
      if (foundMajorCountries.length === majorCountries.length) {
        console.log('✅ All major countries found in the list');
      } else {
        console.log(`⚠️ Only ${foundMajorCountries.length}/${majorCountries.length} major countries found:`);
        foundMajorCountries.forEach(country => console.log(`  - ${country}`));
        
        const missingCountries = majorCountries.filter(country => !data.countries.includes(country));
        console.log('\nMissing major countries:');
        missingCountries.forEach(country => console.log(`  - ${country}`));
      }
      
    } else {
      console.log('❌ Request failed:', data.message);
    }
  } catch (error) {
    console.error('❌ Error testing countries endpoint:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testCountriesEndpoint(); 