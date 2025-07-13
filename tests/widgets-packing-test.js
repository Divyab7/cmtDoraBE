/**
 * Simple test script for the Packing Calculator widget
 * 
 * How to use:
 * 1. Make sure your server is running
 * 2. Run this script with Node.js: node tests/widgets-packing-test.js
 */

const axios = require('axios');

// Configuration - change these values to test different scenarios
const config = {
  baseUrl: 'http://localhost:3000', // Change to your server URL if different
  endpoint: '/widgets/packing-calculator',
  params: {
    destination: 'Amsterdam, Netherlands',
    duration: 7,
    gender: 'female',
    age: 35,
    activities: 'city sightseeing, museums, cycling',
    season: 'fall',
    style: 'efficient',
    tripType: 'leisure'
  }
};

async function testPackingCalculator() {
  try {
    console.log('Testing Packing Calculator with parameters:');
    console.log(config.params);
    console.log('\nSending request...');

    const response = await axios.get(`${config.baseUrl}${config.endpoint}`, {
      params: config.params
    });

    console.log('\nResponse received!');
    console.log('Status:', response.status);
    
    if (response.data.success) {
      const data = response.data.data;
      const packingList = data.packingList;
      const outfitPlanner = data.outfitPlanner;
      
      console.log('\n==== PERSONALIZED PACKING LIST ====');
      console.log('\nDestination:', response.data.query.destination);
      console.log('Duration:', response.data.query.duration, 'days');
      
      console.log('\n-- CLOTHING ESSENTIALS --');
      packingList.clothing.essentials.forEach(item => {
        console.log(`• ${item.item} (${item.quantity}) - ${item.notes}`);
      });
      
      console.log('\n-- OUTERWEAR --');
      packingList.clothing.outerwear.forEach(item => {
        console.log(`• ${item.item} (${item.quantity}) - ${item.notes}`);
      });
      
      console.log('\n-- FOOTWEAR --');
      packingList.clothing.footwear.forEach(item => {
        console.log(`• ${item.item} (${item.quantity}) - ${item.notes}`);
      });
      
      console.log('\n-- ACCESSORIES --');
      packingList.clothing.accessories.forEach(item => {
        console.log(`• ${item.item} (${item.quantity}) - ${item.notes}`);
      });
      
      if (packingList.clothing.specialItems && packingList.clothing.specialItems.length > 0) {
        console.log('\n-- SPECIAL ITEMS --');
        packingList.clothing.specialItems.forEach(item => {
          console.log(`• ${item.item} (${item.quantity}) - ${item.notes}`);
        });
      }
      
      console.log('\n-- TOILETRIES --');
      packingList.toiletries.forEach(item => {
        console.log(`• ${item.item} (${item.quantity}) - ${item.notes}`);
      });
      
      console.log('\n-- ELECTRONICS --');
      packingList.electronics.forEach(item => {
        console.log(`• ${item.item} (${item.quantity}) - ${item.notes}`);
      });
      
      console.log('\n-- HEALTH & SAFETY --');
      packingList.healthAndSafety.forEach(item => {
        console.log(`• ${item.item} (${item.quantity}) - ${item.notes}`);
      });
      
      console.log('\n-- MISCELLANEOUS --');
      packingList.miscellaneous.forEach(item => {
        console.log(`• ${item.item} (${item.quantity}) - ${item.notes}`);
      });
      
      console.log('\n==== OUTFIT PLANNER ====');
      console.log('\nDaily Outfits:');
      outfitPlanner.dailyOutfits.forEach(day => {
        console.log(`\nDay ${day.day}:`);
        console.log(`  Daytime: ${day.daytime.outfit}`);
        console.log(`  Reason: ${day.daytime.reason}`);
        console.log(`  Evening: ${day.evening.outfit}`);
        console.log(`  Reason: ${day.evening.reason}`);
      });
      
      if (outfitPlanner.specialOccasions && outfitPlanner.specialOccasions.length > 0) {
        console.log('\nSpecial Occasions:');
        outfitPlanner.specialOccasions.forEach(occasion => {
          console.log(`\n  ${occasion.occasion}:`);
          console.log(`  Outfit: ${occasion.outfit}`);
          console.log(`  Reason: ${occasion.reason}`);
        });
      }
      
      console.log('\nLayering Tips:', outfitPlanner.layeringTips);
      
      console.log('\nPacking Tips:');
      outfitPlanner.packingTips.forEach(tip => {
        console.log(`• ${tip}`);
      });
      
      console.log('\n==== DESTINATION SPECIFICS ====');
      console.log('\nWeather Summary:', data.destinationSpecifics.weatherSummary);
      
      console.log('\nLocal Considerations:');
      data.destinationSpecifics.localConsiderations.forEach(consideration => {
        console.log(`• ${consideration}`);
      });
      
      console.log('\nCultural Notes:');
      data.destinationSpecifics.culturalNotes.forEach(note => {
        console.log(`• ${note}`);
      });
      
      console.log('\nLaundry Strategy:', data.laundryStrategy.recommendation);
      
    } else {
      console.log('\nError:', response.data.message);
    }
  } catch (error) {
    console.error('Error testing packing calculator:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testPackingCalculator(); 