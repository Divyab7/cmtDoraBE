/**
 * Test script for the Work Leave Excuse Generator widget
 * 
 * This script tests the endpoint that generates believable excuses
 * for requesting time off work.
 * 
 * To use this script:
 * 1. Make sure the server is running
 * 2. Run: node tests/widgets-excuse-generator-test.js
 */

const axios = require('axios');

// Configuration
const config = {
  baseUrl: 'http://localhost:3000',
  endpoint: '/widgets/excuse-generator',
  params: {
    leaveDuration: 'medium',
    noticeTime: 'short-notice',
    leaveType: 'family',
    deliveryMethod: 'email',
    relationship: 'manager',
    believability: 'high',
    tone: 'professional'
  }
};

// Function to test the work leave excuse generator endpoint
async function testExcuseGenerator() {
  try {
    console.log('\n💼 Testing Work Leave Excuse Generator Widget...');
    console.log(`Leave Duration: ${config.params.leaveDuration}`);
    console.log(`Notice Time: ${config.params.noticeTime}`);
    console.log(`Leave Type: ${config.params.leaveType}`);
    console.log(`Delivery Method: ${config.params.deliveryMethod}`);
    console.log(`Relationship: ${config.params.relationship}`);
    console.log(`Believability: ${config.params.believability}`);
    console.log(`Tone: ${config.params.tone}`);
    
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
      console.log(`  Leave Duration: ${data.query.leaveDuration}`);
      console.log(`  Notice Time: ${data.query.noticeTime}`);
      console.log(`  Leave Type: ${data.query.leaveType}`);
      console.log(`  Delivery Method: ${data.query.deliveryMethod}`);
      console.log(`  Relationship: ${data.query.relationship}`);
      console.log(`  Believability: ${data.query.believability}`);
      console.log(`  Tone: ${data.query.tone}`);
      
      // Print excuse summary
      console.log('\nExcuse Summary:');
      console.log(`  Title: ${data.data.excuseSummary.title}`);
      console.log(`  Believability Score: ${data.data.excuseSummary.believabilityScore}/100`);
      console.log(`  Reuse Risk: ${data.data.excuseSummary.reuseRisk}`);
      console.log(`  Suitable For: ${data.data.excuseSummary.suitableFor.join(', ')}`);
      console.log(`  Suggested Leave Type: ${data.data.excuseSummary.suggestedLeaveType}`);
      
      // Print short version
      console.log('\nShort Version:');
      console.log(`  "${data.data.excuseContent.shortVersion}"`);
      
      // Print full content
      console.log('\nFull Content:');
      console.log(`  Greeting: ${data.data.excuseContent.fullContent.greeting}`);
      console.log(`  Introduction: ${data.data.excuseContent.fullContent.introduction}`);
      console.log(`  Main Excuse: ${data.data.excuseContent.fullContent.mainExcuse}`);
      
      console.log('\n  Supporting Details:');
      data.data.excuseContent.fullContent.supportingDetails.forEach((detail, index) => {
        console.log(`    ${index + 1}. ${detail}`);
      });
      
      console.log(`\n  Impact on Work: ${data.data.excuseContent.fullContent.impactOnWork}`);
      console.log(`  Proposed Arrangements: ${data.data.excuseContent.fullContent.proposedArrangements}`);
      console.log(`  Return Plan: ${data.data.excuseContent.fullContent.returnPlan}`);
      console.log(`  Closing: ${data.data.excuseContent.fullContent.closing}`);
      console.log(`  Signature: ${data.data.excuseContent.fullContent.signature}`);
      
      // Print call script
      console.log('\nCall Script:');
      console.log(`  Opening Line: "${data.data.excuseContent.callScript.openingLine}"`);
      
      console.log('\n  Key Points:');
      data.data.excuseContent.callScript.keyPoints.forEach((point, index) => {
        console.log(`    ${index + 1}. ${point}`);
      });
      
      console.log('\n  Anticipated Questions:');
      data.data.excuseContent.callScript.anticipatedQuestions.forEach((qa, index) => {
        console.log(`    Q${index + 1}: ${qa.question}`);
        console.log(`    A${index + 1}: ${qa.response}\n`);
      });
      
      // Print documentation information
      console.log('Required Documentation:');
      console.log(`  Needed: ${data.data.requiredDocumentation.needed ? 'Yes' : 'No'}`);
      if (data.data.requiredDocumentation.needed) {
        console.log('  Types:');
        data.data.requiredDocumentation.types.forEach((type, index) => {
          console.log(`    - ${type}`);
        });
        console.log(`  Tips: ${data.data.requiredDocumentation.tips}`);
      }
      
      // Print alternatives
      console.log('\nAlternative Excuses:');
      data.data.alternatives.forEach((alt, index) => {
        console.log(`  ${index + 1}. ${alt.title} (${alt.bestFor}):`);
        console.log(`     "${alt.shortVersion}"`);
      });
      
      // Print do's and don'ts
      console.log('\nDo\'s and Don\'ts:');
      console.log('  Do:');
      data.data.doAndDontTips.do.forEach((tip, index) => {
        console.log(`    ✓ ${tip}`);
      });
      
      console.log('  Don\'t:');
      data.data.doAndDontTips.dont.forEach((tip, index) => {
        console.log(`    ✗ ${tip}`);
      });
      
    } else {
      console.log('❌ Request failed:', data.message);
    }
  } catch (error) {
    console.error('❌ Error testing leave excuse generator:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testExcuseGenerator(); 