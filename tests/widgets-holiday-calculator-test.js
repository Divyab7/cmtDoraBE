/**
 * Test script for the Holiday Calculator widget
 * 
 * This script tests the endpoint that calculates optimal long weekends
 * and holiday combinations for a specified country.
 * 
 * To use this script:
 * 1. Make sure the server is running
 * 2. Run: node tests/widgets-holiday-calculator-test.js
 */

const axios = require('axios');

// Configuration
const config = {
  baseUrl: 'http://localhost:3000',
  endpoint: '/widgets/holiday-calculator',
  params: {
    country: 'United States',
    year: 2025,
    maxLeaveDays: 2
  }
};

// Function to test the holiday calculator endpoint
async function testHolidayCalculator() {
  try {
    console.log('\n🗓️ Testing Holiday Calculator Widget...');
    console.log(`Country: ${config.params.country}`);
    console.log(`Year: ${config.params.year}`);
    console.log(`Max Leave Days: ${config.params.maxLeaveDays}`);
    
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
      console.log(`  Year: ${data.query.year}`);
      console.log(`  Max Leave Days: ${data.query.maxLeaveDays}`);
      
      // Print country info
      console.log('\nCountry Information:');
      console.log(`  Name: ${data.data.countryInfo.name}`);
      console.log(`  Year: ${data.data.countryInfo.year}`);
      console.log(`  Total Public Holidays: ${data.data.countryInfo.totalHolidays}`);
      
      // Print long weekend statistics
      console.log('\nLong Weekend Combinations:');
      console.log(`  Total Combinations: ${data.data.totalCombinations}`);
      console.log(`  No Leave Required: ${data.data.stats.noLeaveRequired}`);
      console.log('  With Leave Days:');
      console.log(`    1 Day: ${data.data.stats.withLeave['1_day']}`);
      console.log(`    2 Days: ${data.data.stats.withLeave['2_days']}`);
      console.log(`    3 Days: ${data.data.stats.withLeave['3_days'] || 0}`);
      console.log(`    4 Days: ${data.data.stats.withLeave['4_days'] || 0}`);
      console.log(`    5 Days: ${data.data.stats.withLeave['5_days'] || 0}`);
      
      // Print the holidays
      console.log('\nPublic Holidays:');
      if (data.data.holidays.length > 0) {
        data.data.holidays.forEach(holiday => {
          console.log(`  📅 ${holiday.date} (${holiday.dayOfWeek}): ${holiday.events.join(', ')}`);
        });
      } else {
        console.log('  No holidays found for the specified criteria');
      }
      
      // Print long weekends by month
      console.log('\nLong Weekend Combinations by Month:');
      if (data.data.longWeekendsByMonth.length > 0) {
        data.data.longWeekendsByMonth.forEach(month => {
          console.log(`\n  📆 ${month.month} (${month.combinations.length} combinations):`);
          
          month.combinations.forEach((combo, index) => {
            console.log(`\n    Combination #${index + 1}: ${combo.name}`);
            console.log(`    Dates: ${combo.dates.join(', ')}`);
            console.log(`    Leave Days Needed: ${combo.leaveDaysNeeded}`);
            console.log(`    Total Days Off: ${combo.totalDays}`);
            
            console.log('    Days Off Details:');
            combo.daysOff.forEach(day => {
              console.log(`      - ${day.date}: ${day.reason}`);
            });
          });
        });
      } else {
        console.log('  No long weekend combinations found');
      }
      
    } else {
      console.log('❌ Request failed:', data.message);
    }
  } catch (error) {
    console.error('❌ Error testing holiday calculator:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testHolidayCalculator(); 