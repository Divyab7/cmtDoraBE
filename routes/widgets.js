const express = require('express');
const { 
  getAllWidgets,
  currencyConverter,
  packingCalculator,
  travelBudgetPlanner,
  emergencyContacts,
  travelPhrases,
  crowdEstimator,
  travelDocuments,
  getCountryList,
  getHolidays,
  holidayCalculator,
  excuseGenerator
} = require('../controllers/widgetsController');

const route = express.Router();

/**
 * @route   GET /widgets
 * @desc    Get all available widgets
 * @access  Public
 */
route.get('/', getAllWidgets);

/**
 * @route   GET /widgets/currency-converter
 * @desc    Currency converter tool
 * @params  {string} from - Required: Source currency code (e.g., USD)
 * @params  {string} to - Required: Target currency code (e.g., EUR)
 * @params  {number} amount - Optional: Amount to convert (default: 1)
 * @params  {string} date - Optional: Date for historical rates (default: current date)
 * @access  Public
 */
route.get('/currency-converter', currencyConverter);

/**
 * @route   GET /widgets/packing-calculator
 * @desc    Packing calculator tool
 * @access  Public
 */
route.get('/packing-calculator', packingCalculator);

/**
 * @route   GET /widgets/travel-budget
 * @desc    Travel budget planner tool
 * @params  {string} destination - Required: Destination city/country
 * @params  {string} origin - Optional: Origin city/country
 * @params  {number} passengers - Optional: Number of travelers (default: 1)
 * @params  {number} duration - Optional: Trip duration in days (default: 7)
 * @params  {string} travelStyle - Optional: Budget/Mid-range/Luxury
 * @params  {string} accommodation - Optional: Preferred accommodation type
 * @params  {string} transportation - Optional: Preferred transportation methods
 * @params  {string} activities - Optional: Planned activities
 * @access  Public
 */
route.get('/travel-budget', travelBudgetPlanner);

/**
 * @route   GET /widgets/emergency-contacts
 * @desc    Emergency contacts for travelers based on location
 * @access  Public
 */
route.get('/emergency-contacts', emergencyContacts);

/**
 * @route   GET /widgets/travel-phrases
 * @desc    Common phrases and slangs for travelers with translations and pronunciations
 * @params  {string} location - Required: Travel destination
 * @params  {string} sourceLanguage - Optional: Source language (default: English)
 * @access  Public
 */
route.get('/travel-phrases', travelPhrases);

/**
 * @route   GET /widgets/crowd-estimator
 * @desc    Estimate crowd levels at tourist destinations
 * @params  {string} location - Required: Tourist destination
 * @params  {string} date - Optional: Specific date for visit (YYYY-MM-DD)
 * @params  {string} season - Optional: Season of visit (spring/summer/fall/winter)
 * @access  Public
 */
route.get('/crowd-estimator', crowdEstimator);

/**
 * @route   GET /widgets/travel-documents
 * @desc    Get travel documents, requirements, and advisories for a destination
 * @params  {string} destination - Required: Travel destination country/region
 * @params  {string} nationality - Optional: Traveler's nationality (default: United States)
 * @params  {string} tripType - Optional: Purpose of travel (default: tourism)
 * @access  Public
 */
route.get('/travel-documents', travelDocuments);

/**
 * @route   GET /widgets/countries
 * @desc    Get list of countries for holiday calculator
 * @access  Public
 */
route.get('/countries', getCountryList);

/**
 * @route   GET /widgets/holidays
 * @desc    Get holidays for a specific country with optional year and month filters
 * @params  {string} country - Required: Country name
 * @params  {number} year - Optional: Filter by year
 * @params  {number} month - Optional: Filter by month (1-12)
 * @access  Public
 */
route.get('/holidays', getHolidays);

/**
 * @route   GET /widgets/holiday-calculator
 * @desc    Calculate optimal long weekends and holiday combinations
 * @params  {string} country - Required: Country name
 * @params  {number} year - Optional: Year to analyze (default: current year)
 * @params  {number} maxLeaveDays - Optional: Maximum leave days to consider for combinations (default: 2, range: 0-5)
 * @access  Public
 */
route.get('/holiday-calculator', holidayCalculator);

/**
 * @route   GET /widgets/excuse-generator
 * @desc    Generate believable work leave excuses
 * @params  {string} leaveDuration - Optional: Length of leave (short, medium, long) (default: short)
 * @params  {string} noticeTime - Optional: How far in advance (same-day, short-notice, planned) (default: same-day)
 * @params  {string} leaveType - Optional: Category of leave (personal, family, health, emergency) (default: personal)
 * @params  {string} deliveryMethod - Optional: How the excuse will be delivered (email, call, in-person, message) (default: email)
 * @params  {string} relationship - Optional: Who will receive the excuse (manager, team-lead, HR) (default: manager)
 * @params  {string} believability - Optional: Realism level (high, medium, creative) (default: high)
 * @params  {string} tone - Optional: Communication tone (professional, apologetic, straightforward) (default: professional)
 * @access  Public
 */
route.get('/excuse-generator', excuseGenerator);

module.exports = route; 