/**
 * Test script for the Currency Converter widget
 * 
 * This script tests the Currency Converter widget by making a request to the API
 * and printing the response to the console.
 * 
 * To use this script:
 * 1. Make sure the server is running
 * 2. Run: node tests/widgets-currency-test.js
 */

const axios = require('axios');

// Configuration
const config = {
  baseUrl: 'http://localhost:3000',
  endpoint: '/widgets/currency-converter',
  params: {
    from: 'USD',       // Source currency
    to: 'EUR',         // Target currency
    amount: 100,       // Amount to convert
    date: ''           // Leave empty for current date
  }
};

// Function to test the currency converter
async function testCurrencyConverter() {
  try {
    console.log('\n🔄 Testing Currency Converter Widget...');
    console.log(`Converting ${config.params.amount} ${config.params.from} to ${config.params.to}...\n`);
    
    // Make the request
    const response = await axios.get(`${config.baseUrl}${config.endpoint}`, {
      params: config.params
    });
    
    const data = response.data;
    
    // Check if request was successful
    if (data.success) {
      console.log('✅ Request successful!\n');
      
      // Print basic conversion information
      const conversion = data.data.conversion;
      console.log('📊 CONVERSION DETAILS:');
      console.log(`${conversion.fromCurrency.amount} ${conversion.fromCurrency.code} (${conversion.fromCurrency.name}) ${conversion.fromCurrency.flag}`);
      console.log(`= ${conversion.toCurrency.amount} ${conversion.toCurrency.code} (${conversion.toCurrency.name}) ${conversion.toCurrency.flag}`);
      console.log(`Rate: 1 ${conversion.fromCurrency.code} = ${conversion.rate} ${conversion.toCurrency.code}`);
      console.log(`Inverse: 1 ${conversion.toCurrency.code} = ${conversion.inverse} ${conversion.fromCurrency.code}`);
      console.log(`Date: ${conversion.date}\n`);
      
      // Print denominations
      console.log('💵 DENOMINATIONS:');
      console.log('Bills:');
      data.data.denominations.bills.forEach(bill => {
        console.log(`  ${bill.value} ${conversion.toCurrency.code} (= ${bill.equivalent} ${conversion.fromCurrency.code}) - ${bill.notes}`);
      });
      
      console.log('Coins:');
      data.data.denominations.coins.forEach(coin => {
        console.log(`  ${coin.value} ${conversion.toCurrency.code} (= ${coin.equivalent} ${conversion.fromCurrency.code}) - ${coin.notes}`);
      });
      console.log('');
      
      // Print practical information
      const info = data.data.practicalInfo;
      console.log('🧳 PRACTICAL INFORMATION:');
      console.log(`Tipping: ${info.tipping}`);
      console.log(`Cash vs Card: ${info.cashVsCard}`);
      
      console.log('ATM Information:');
      console.log(`  Availability: ${info.atms.availability}`);
      console.log(`  Fees: ${info.atms.fees}`);
      console.log(`  Recommendations: ${info.atms.recommendations}`);
      console.log(`  Locations: ${info.atms.locations}`);
      
      console.log('Money Changers:');
      console.log(`  Availability: ${info.moneyChangers.availability}`);
      console.log(`  Best Locations: ${info.moneyChangers.bestLocations}`);
      console.log(`  Typical Rates: ${info.moneyChangers.typicalRates}`);
      console.log(`  Places to Avoid: ${info.moneyChangers.avoidLocations}`);
      
      console.log(`Bank Hours: ${info.bankHours}`);
      
      console.log('Currency Facts:');
      info.currencyFacts.forEach((fact, index) => {
        console.log(`  ${index + 1}. ${fact.fact} - ${fact.relevance}`);
      });
      
      console.log('Counterfeit Information:');
      console.log(`  Risk Level: ${info.counterfeit.risk}`);
      console.log(`  Common Counterfeit Denominations: ${info.counterfeit.commonDenominations.join(', ')}`);
      console.log(`  Security Features to Check: ${info.counterfeit.securityFeatures.join(', ')}`);
      console.log(`  Warning Signs: ${info.counterfeit.warningSign.join(', ')}`);
      
      console.log('Best Practices:');
      info.bestPractices.forEach((tip, index) => {
        console.log(`  ${index + 1}. ${tip}`);
      });
      console.log('');
      
      // Print common expenses
      console.log('💰 COMMON EXPENSES:');
      
      // Group expenses by category
      const categories = {};
      data.data.commonExpenses.forEach(expense => {
        if (!categories[expense.category]) {
          categories[expense.category] = [];
        }
        categories[expense.category].push(expense);
      });
      
      // Print expenses by category
      for (const [category, expenses] of Object.entries(categories)) {
        console.log(`${category}:`);
        expenses.forEach(expense => {
          console.log(`  ${expense.item}: ${expense.localPrice} ${conversion.toCurrency.code} (= ${expense.convertedPrice} ${conversion.fromCurrency.code})`);
        });
      }
      console.log('');
      
      // Print additional information
      const additionalInfo = data.data.additionalInfo;
      console.log('ℹ️ ADDITIONAL INFORMATION:');
      
      console.log('Travel Tips:');
      additionalInfo.travelTips.forEach((tip, index) => {
        console.log(`  ${index + 1}. [${tip.category}] ${tip.tip}`);
      });
      
      console.log('Currency Availability:');
      console.log(`  ATM Withdrawal Limits: ${additionalInfo.currencyAvailability.atmWithdrawalLimits}`);
      console.log(`  Currency Exchange Availability: ${additionalInfo.currencyAvailability.currencyExchangeAvailability}`);
      console.log(`  Card Acceptance: ${additionalInfo.currencyAvailability.cardAcceptance}`);
      
      console.log('Local Payment Methods:');
      additionalInfo.localPaymentMethods.forEach((method, index) => {
        console.log(`  ${index + 1}. ${method.method} - ${method.description}`);
        console.log(`     Popularity: ${method.popularity}, Tourist-Friendliness: ${method.touristFriendliness}`);
      });
      
      console.log('Budget Guide (Daily Costs):');
      console.log(`  Budget: ${additionalInfo.budgetGuide.budget.dailyCost} ${conversion.toCurrency.code} - ${additionalInfo.budgetGuide.budget.description}`);
      console.log(`  Mid-Range: ${additionalInfo.budgetGuide.midRange.dailyCost} ${conversion.toCurrency.code} - ${additionalInfo.budgetGuide.midRange.description}`);
      console.log(`  Luxury: ${additionalInfo.budgetGuide.luxury.dailyCost} ${conversion.toCurrency.code} - ${additionalInfo.budgetGuide.luxury.description}`);
      console.log('');
      
      // Print quick conversions
      console.log('🔄 QUICK CONVERSIONS:');
      data.data.quickConversions.forEach(conversion => {
        console.log(`${conversion.from} ${config.params.from} = ${conversion.to.toFixed(2)} ${config.params.to}`);
      });
      
    } else {
      console.log('❌ Request failed:', data.message);
    }
  } catch (error) {
    console.error('❌ Error testing currency converter:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testCurrencyConverter(); 