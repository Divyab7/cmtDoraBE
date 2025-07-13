/**
 * Simple test script for the Travel Documents widget
 * 
 * How to use:
 * 1. Make sure your server is running
 * 2. Run this script with Node.js: node tests/widgets-travel-docs-test.js
 */

const axios = require('axios');

// Configuration - change these values to test different scenarios
const config = {
  baseUrl: 'http://localhost:3000', // Change to your server URL if different
  endpoint: '/widgets/travel-documents',
  params: {
    destination: 'Italy',
    nationality: 'United States',
    tripType: 'tourism'
  }
};

async function testTravelDocuments() {
  try {
    console.log('Testing Travel Documents widget with parameters:');
    console.log(config.params);
    console.log('\nSending request...');

    const response = await axios.get(`${config.baseUrl}${config.endpoint}`, {
      params: config.params
    });

    console.log('\nResponse received!');
    console.log('Status:', response.status);
    
    if (response.data.success) {
      const data = response.data.data;
      
      console.log('\n========== TRAVEL DOCUMENTS FOR ==========');
      console.log(`Destination: ${response.data.query.destination}`);
      console.log(`Nationality: ${response.data.query.nationality}`);
      console.log(`Trip Type: ${response.data.query.tripType}`);
      
      console.log('\n---------- ESSENTIAL DOCUMENTS ----------');
      data.essentialDocuments.forEach(doc => {
        console.log(`\n${doc.documentType} - ${doc.required ? 'REQUIRED' : 'RECOMMENDED'}`);
        console.log(`Description: ${doc.description}`);
        console.log(`How to obtain: ${doc.howToObtain}`);
        console.log(`Processing time: ${doc.processingTime}`);
        console.log(`Validity requirements: ${doc.validityRequirements}`);
        if (doc.notes) console.log(`Note: ${doc.notes}`);
      });
      
      console.log('\n---------- VISA REQUIREMENTS ----------');
      const visa = data.visaRequirements;
      console.log(`Visa required: ${visa.visaRequired ? 'YES' : 'NO'}`);
      if (visa.visaType) console.log(`Type: ${visa.visaType}`);
      console.log(`Stay duration: ${visa.stayDuration}`);
      if (visa.applicationProcess) console.log(`Application: ${visa.applicationProcess}`);
      if (visa.cost) console.log(`Cost: ${visa.cost}`);
      
      if (visa.specialRequirements && visa.specialRequirements.length > 0) {
        console.log('\nSpecial requirements:');
        visa.specialRequirements.forEach(req => console.log(`• ${req}`));
      }
      
      if (visa.notes) console.log(`\nVisa notes: ${visa.notes}`);
      
      console.log('\n---------- HEALTH REQUIREMENTS ----------');
      
      if (data.healthRequirements.vaccinationsMandatory.length > 0) {
        console.log('\nMandatory vaccinations:');
        data.healthRequirements.vaccinationsMandatory.forEach(vax => {
          console.log(`• ${vax.name}: ${vax.details}`);
        });
      } else {
        console.log('\nNo mandatory vaccinations.');
      }
      
      if (data.healthRequirements.vaccinationsRecommended.length > 0) {
        console.log('\nRecommended vaccinations:');
        data.healthRequirements.vaccinationsRecommended.forEach(vax => {
          console.log(`• ${vax.name}: ${vax.details}`);
        });
      }
      
      if (data.healthRequirements.medicationRestrictions.length > 0) {
        console.log('\nMedication restrictions:');
        data.healthRequirements.medicationRestrictions.forEach(med => {
          console.log(`• ${med.medication}: ${med.restriction}`);
          if (med.alternative) console.log(`  Alternative: ${med.alternative}`);
        });
      }
      
      console.log('\n---------- GOVERNMENT ADVISORIES ----------');
      console.log(`Level: ${data.governmentAdvisories.advisoryLevel}`);
      console.log(`Advisory: ${data.governmentAdvisories.advisoryText}`);
      
      if (data.governmentAdvisories.securityConcerns.length > 0) {
        console.log('\nSecurity concerns:');
        data.governmentAdvisories.securityConcerns.forEach(concern => {
          console.log(`• ${concern}`);
        });
      }
      
      if (data.governmentAdvisories.localLaws.length > 0) {
        console.log('\nImportant local laws:');
        data.governmentAdvisories.localLaws.forEach(law => {
          console.log(`• ${law.category}: ${law.description}`);
        });
      }
      
      console.log('\n---------- CUSTOMS AND IMPORT ----------');
      console.log('\nCurrency restrictions:');
      console.log(`Entry: ${data.customsAndImport.currencyRestrictions.entryLimit}`);
      console.log(`Exit: ${data.customsAndImport.currencyRestrictions.exitLimit}`);
      
      console.log('\nProhibited items:');
      data.customsAndImport.prohibitedItems.forEach(item => {
        console.log(`• ${item}`);
      });
      
      console.log('\n---------- BOOKING DOCUMENTS ----------');
      data.bookingDocuments.forEach(doc => {
        console.log(`\n${doc.documentType} - ${doc.necessity}`);
        console.log(`Format: ${doc.format}`);
        console.log(`Tips: ${doc.tips}`);
      });
      
      console.log('\n---------- PRACTICAL TIPS ----------');
      data.practicalTips.forEach(tip => {
        console.log(`\n${tip.category}:`);
        console.log(`• ${tip.tip}`);
      });
      
    } else {
      console.log('\nError:', response.data.message);
    }
  } catch (error) {
    console.error('Error testing travel documents:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testTravelDocuments(); 