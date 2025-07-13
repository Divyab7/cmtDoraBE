/**
 * Test script for the Holidays endpoint
 * 
 * This script tests the endpoint that returns holidays for a specific country
 * with optional year and month filtering.
 * 
 * To use this script:
 * 1. Make sure the server is running
 * 2. Run: node tests/widgets-holidays-test.js
 */

const axios = require('axios');

// Configuration
const config = {
  baseUrl: 'http://localhost:3000',
  endpoint: '/widgets/holidays',
  params: {
    country: 'United States',
    year: 2025,
    // Uncomment to filter by month (1-12)
    // month: 1
  }
};

// Function to test the holidays endpoint
async function testHolidaysEndpoint() {
  try {
    console.log('\n🗓️ Testing Holidays Endpoint...');
    console.log(`Country: ${config.params.country}`);
    console.log(`Year: ${config.params.year || 'All years'}`);
    console.log(`Month: ${config.params.month || 'All months'}`);
    
    // Build query string
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(config.params)) {
      if (value) {
        queryParams.append(key, value);
      }
    }
    
    // Make the request
    const response = await axios.get(`${config.baseUrl}${config.endpoint}?${queryParams.toString()}`);
    
    const data = response.data;
    
    // Check if request was successful
    if (data.success) {
      console.log('✅ Request successful!');
      
      // Print query info
      console.log('\nQuery Parameters:');
      console.log(`  Country: ${data.query.country}`);
      console.log(`  Year: ${data.query.year || 'Not specified'}`);
      console.log(`  Month: ${data.query.month || 'Not specified'}`);
      
      // Print summary information
      console.log('\nHoliday Summary:');
      console.log(`  Total holidays: ${data.data.summary.totalHolidays}`);
      
      // Print holidays by month distribution
      console.log('\nHolidays by month:');
      if (Object.keys(data.data.summary.holidaysByMonth).length > 0) {
        Object.entries(data.data.summary.holidaysByMonth)
          .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
          .forEach(([month, count]) => {
            const monthName = new Date(2025, parseInt(month) - 1, 1).toLocaleString('default', { month: 'long' });
            console.log(`  ${monthName}: ${count} holidays`);
          });
      } else {
        console.log('  No holidays found for the specified criteria');
      }
      
      // Print the holidays
      console.log('\nHolidays:');
      if (data.data.holidays.length > 0) {
        data.data.holidays.forEach(holiday => {
          console.log(`  📅 ${holiday.date} (${holiday.day}): ${holiday.name} - ${holiday.type}`);
        });
      } else {
        console.log('  No holidays found for the specified criteria');
      }
      
      // If holidays are grouped by month, print them
      if (Object.keys(data.data.holidaysByMonth).length > 0 && !config.params.month) {
        console.log('\nHolidays by Month:');
        Object.entries(data.data.holidaysByMonth)
          .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
          .forEach(([month, holidays]) => {
            const monthName = new Date(2025, parseInt(month) - 1, 1).toLocaleString('default', { month: 'long' });
            console.log(`\n  ${monthName} (${holidays.length} holidays):`);
            
            holidays.forEach(holiday => {
              console.log(`    📅 ${holiday.date} (${holiday.day}): ${holiday.name}`);
            });
          });
      }
      
    } else {
      console.log('❌ Request failed:', data.message);
    }
  } catch (error) {
    console.error('❌ Error testing holidays endpoint:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testHolidaysEndpoint(); 