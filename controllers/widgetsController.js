const mongoose = require('mongoose');
const axios = require('axios');
const aiProvider = require('../utils/aiProvider');

/**
 * Helper function to attempt to repair truncated JSON
 * @param {string} incompleteJson - Incomplete JSON string
 * @returns {string} - Repaired JSON string
 */
const repairTruncatedJson = (incompleteJson) => {
  if (!incompleteJson) return '{}';
  
  // Replace control characters that could cause issues
  let json = incompleteJson.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  
  try {
    // Check if we can parse it as is
    JSON.parse(json);
    return json; // No repair needed
  } catch (e) {
    console.log("Attempting to repair truncated JSON");
    
    // Count open brackets vs close brackets to detect imbalance
    const counts = {
      '{': 0, '}': 0,
      '[': 0, ']': 0,
      '"': 0
    };
    
    // Track if we're inside a string to ignore brackets inside strings
    let inString = false;
    let escape = false;
    let lastPropStart = -1;
    let lastPropName = '';
    
    // First pass: count brackets and track state
    for (let i = 0; i < json.length; i++) {
      const char = json[i];
      
      if (escape) {
        escape = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escape = true;
        continue;
      }
      
      if (char === '"' && !escape) {
        counts['"']++;
        inString = !inString;
        
        // Track property names for possible truncation in key-value pairs
        if (!inString && lastPropStart !== -1) {
          lastPropName = json.substring(lastPropStart, i + 1);
          lastPropStart = -1;
        } else if (inString) {
          const prev = json.substring(Math.max(0, i - 2), i);
          if (prev.endsWith(':"') || prev.endsWith('{ "') || prev.endsWith('["')) {
            lastPropStart = i;
          }
        }
        continue;
      }
      
      if (!inString) {
        if (char === '{' || char === '[' || char === '}' || char === ']') {
          counts[char]++;
        }
      }
    }
    
    // Check if we have an unclosed string
    if (inString) {
      json += '"';
    }
    
    // Check for unclosed objects
    const missingCloseBraces = counts['{'] - counts['}'];
    const missingCloseBrackets = counts['['] - counts[']'];
    
    // Second pass: determine if we're in the middle of a property declaration
    // This handles cases where JSON is cut off after a property name but before its value
    let needsValueForProperty = false;
    const lastFew = json.substring(Math.max(0, json.length - 20));
    
    // Check patterns like '"key":'
    const propertyPattern = /"([^"]+)"\s*:\s*$/;
    const propertyMatch = lastFew.match(propertyPattern);
    
    if (propertyMatch) {
      needsValueForProperty = true;
      // If property is missing a value, add a placeholder
      if (needsValueForProperty) {
        if (propertyMatch[1].match(/summary|description|tips|notes|weather/i)) {
          json += '"Not available due to response truncation"';
        } else if (propertyMatch[1].match(/quantity|amount|cost|price|number/i)) {
          json += '0';
        } else if (propertyMatch[1].match(/items|list|array/i)) {
          json += '[]';
        } else {
          json += '""';
        }
      }
    }
    
    // Close any open arrays
    for (let i = 0; i < missingCloseBrackets; i++) {
      json += ']';
    }
    
    // Close any open objects
    for (let i = 0; i < missingCloseBraces; i++) {
      json += '}';
    }
    
    // Verify the repair worked
    try {
      JSON.parse(json);
      console.log("JSON repaired successfully");
      return json;
    } catch (finalErr) {
      console.error("JSON repair failed:", finalErr);
      // Last-ditch effort: extract any complete objects or arrays
      try {
        const objMatch = json.match(/({[^{]*})/g);
        if (objMatch && objMatch.length > 0) {
          // Take the largest complete object we can find
          const largestObj = objMatch.sort((a, b) => b.length - a.length)[0];
          JSON.parse(largestObj); // Validate it's parseable
          return largestObj;
        }
      } catch (e) {
        // Failed to extract - return empty object
        return '{}';
      }
      return '{}';
    }
  }
};

/**
 * Helper function to extract JSON from AI response content
 * @param {string} content - Raw content from AI response
 * @returns {object|null} - Parsed JSON or null if parsing failed
 */
const extractJsonFromResponse = (content) => {
  if (!content) return null;
  
  // Special handling for streaming markers - some AI providers add these
  if (content.includes('data:') && content.includes('[DONE]')) {
    console.log('Detected streaming markers in response, applying special handling');
    try {
      // Extract JSON from streaming format
      const dataLines = content.split('\n')
        .filter(line => line.startsWith('data:') && line !== 'data: [DONE]')
        .map(line => line.substring(5).trim());
      
      if (dataLines.length > 0) {
        // Try to join and parse all chunks
        const completeResponse = dataLines.join('');
        try {
          return JSON.parse(completeResponse);
        } catch (e) {
          // If complete parsing fails, try to extract from each chunk
          for (const line of dataLines) {
            try {
              if (line && line !== '[DONE]') {
                const parsed = JSON.parse(line);
                if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
                  return JSON.parse(parsed.choices[0].message.content);
                }
              }
            } catch (innerErr) {
              // Continue to next chunk
            }
          }
        }
      }
    } catch (streamErr) {
      console.error('Failed to parse streaming response:', streamErr);
    }
  }
  
  // Clean and normalize the content
  let cleanedContent = content.trim();
  
  // Step 1: Remove any markdown code block indicators
  cleanedContent = cleanedContent.replace(/```(?:json)?|```/g, '');
  
  // Handle case where the response is "wrapped" in additional text (often with models like Claude)
  // Look for patterns like "Here's the JSON: {..." or "JSON response: {..."
  const jsonWrapperMatches = [
    /(?:here(?:'s| is) the json:?|json response:?|here(?:'s| is) the response:?)([\s\S]*)/i,
    /[\s\S]*(```json)([\s\S]*?)(```)/i
  ];
  
  for (const pattern of jsonWrapperMatches) {
    const match = cleanedContent.match(pattern);
    if (match) {
      // If we matched a code block pattern, use the content between markers
      if (match[2] && match[1].includes('json')) {
        cleanedContent = match[2].trim();
        break;
      } 
      // Otherwise use everything after the introduction text
      else if (match[1]) {
        cleanedContent = match[1].trim();
        break;
      }
    }
  }
  
  // Step 2: Remove any text before the first { or [ and after the last } or ]
  let jsonStart = cleanedContent.indexOf('{');
  const arrayStart = cleanedContent.indexOf('[');
  
  // Find which comes first, { or [
  if (jsonStart === -1 || (arrayStart !== -1 && arrayStart < jsonStart)) {
    jsonStart = arrayStart;
  }
  
  if (jsonStart === -1) {
    console.error('No JSON object or array found in the response');
    return null;
  }
  
  // Extract just the JSON portion
  cleanedContent = cleanedContent.substring(jsonStart);
  
  // Check if JSON is truncated and attempt to repair
  let fixedJson = repairTruncatedJson(cleanedContent);
  
  // Try parsing the repaired JSON
  try {
    return JSON.parse(fixedJson);
  } catch (e) {
    console.error('Failed to parse repaired JSON:', e.message);
    
    // Additional cleaning for common issues
    try {
      // Fix trailing commas in arrays and objects - common AI output mistake
      const fixedCommas = fixedJson
        .replace(/,\s*}/g, '}')
        .replace(/,\s*\]/g, ']');
      
      return JSON.parse(fixedCommas);
    } catch (commaError) {
      console.error('Failed to parse after fixing commas:', commaError.message);
      
      // Try to fix missing quotes around property names
      try {
        const fixedQuotes = fixedJson
          .replace(/(\{|\,)\s*([a-zA-Z0-9_]+)\s*\:/g, '$1"$2":');
        
        return JSON.parse(fixedQuotes);
      } catch (quoteError) {
        console.error('Failed to parse after fixing quotes:', quoteError.message);
        
        // Try to handle single quotes instead of double quotes
        try {
          const fixedSingleQuotes = fixedJson
            .replace(/'/g, '"');
          
          return JSON.parse(fixedSingleQuotes);
        } catch (singleQuoteError) {
          console.error('Failed to parse after fixing single quotes:', singleQuoteError.message);
          
          // Fall back to returning null if all strategies fail
          return null;
        }
      }
    }
  }
};

/**
 * Get all available widgets
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const getAllWidgets = async (req, res) => {
  try {
    // This will be implemented later with actual widgets
    const widgets = [
      { id: "currency-converter", name: "Currency Converter", description: "Convert between different currencies for your trip" },
      { id: "packing-calculator", name: "Packing Calculator", description: "Calculate what to pack based on destination and duration" },
      { id: "travel-budget", name: "Travel Budget Planner", description: "Plan your travel budget based on destination and preferences" },
      { id: "emergency-contacts", name: "Emergency Contacts", description: "Find emergency contacts and services for your travel destination" },
      { id: "travel-phrases", name: "Travel Phrases", description: "Learn common phrases and local slang with pronunciation guides" },
      { id: "crowd-estimator", name: "Crowd Estimator", description: "Get crowd level predictions and tips for avoiding busy periods at tourist destinations" },
      { id: "travel-documents", name: "Travel Documents", description: "Get comprehensive information on required documents, visas, and travel advisories" },
      { id: "holiday-calculator", name: "Holiday Calculator", description: "Check public holidays and special events for your travel destination" },
      { id: "excuse-generator", name: "Leave Excuse Generator", description: "Generate believable excuses for requesting time off work" }
    ];

    return res.status(200).json({ success: true, widgets });
  } catch (error) {
    console.error("Error getting widgets:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching widgets",
      error: error.message
    });
  }
};

/**
 * Currency converter widget
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const currencyConverter = async (req, res) => {
  try {
    const { from, to, amount, date } = req.query;
    
    // Validate required parameters
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: "Both 'from' and 'to' currency codes are required"
      });
    }
    
    // Set default amount if not provided
    const conversionAmount = parseFloat(amount) || 1;
    
    // Get current date if not provided
    const conversionDate = date || new Date().toISOString().split('T')[0];
    
    // Create prompt for AI API
    const prompt = `Please provide comprehensive currency conversion information for ${conversionAmount} ${from.toUpperCase()} to ${to.toUpperCase()} as of ${conversionDate}. 
    
    Return the information in JSON format strictly following this structure:
    {
      "conversion": {
        "fromCurrency": {
          "code": "",
          "name": "",
          "symbol": "",
          "flag": "🇺🇸", 
          "amount": 0
        },
        "toCurrency": {
          "code": "",
          "name": "",
          "symbol": "",
          "flag": "🇯🇵",
          "amount": 0
        },
        "rate": 0,
        "date": "",
        "inverse": 0
      },
      "denominations": {
        "bills": [
          {"value": 0, "equivalent": 0, "notes": ""}
        ],
        "coins": [
          {"value": 0, "equivalent": 0, "notes": ""}
        ]
      },
      "practicalInfo": {
        "tipping": "",
        "cashVsCard": "",
        "atms": {
          "availability": "",
          "fees": "",
          "recommendations": "",
          "locations": ""
        },
        "moneyChangers": {
          "availability": "",
          "bestLocations": "",
          "typicalRates": "",
          "avoidLocations": ""
        },
        "bankHours": "",
        "currencyFacts": [
          {"fact": "", "relevance": ""}
        ],
        "counterfeit": {
          "risk": "low/medium/high",
          "commonDenominations": [],
          "securityFeatures": [],
          "warningSign": []
        },
        "bestPractices": [
          ""
        ]
      },
      "commonExpenses": [
        {
          "item": "",
          "localPrice": 0,
          "convertedPrice": 0,
          "category": ""
        }
      ],
      "additionalInfo": {
        "travelTips": [
          {"category": "", "tip": ""}
        ],
        "currencyAvailability": {
          "atmWithdrawalLimits": "",
          "currencyExchangeAvailability": "",
          "cardAcceptance": ""
        },
        "localPaymentMethods": [
          {"method": "", "description": "", "popularity": "", "touristFriendliness": ""}
        ],
        "budgetGuide": {
          "budget": {"dailyCost": 0, "description": ""},
          "midRange": {"dailyCost": 0, "description": ""},
          "luxury": {"dailyCost": 0, "description": ""}
        }
      }
    }

    Please ensure:
    1. All currency codes are in ISO 4217 format (e.g., USD, EUR, JPY)
    2. The conversion rate is accurate as of the specified date (${conversionDate})
    3. Include the inverse rate (how much 1 unit of the target currency is worth in the source currency)
    4. Provide accurate flag emoji for each currency
    5. Include common denominations of bills and coins for the target currency with their equivalents in the source currency
    6. For common expenses, include items from categories like food, transportation, accommodation, and entertainment
    7. All numerical values should be numbers, not strings
    8. Ensure the practical information is accurate and helpful for travelers
    9. If the specified date is in the future, use the most recent available exchange rate
    10. Include detailed information on ATMs, payment methods, and money changers
    11. Provide a budget guide with estimated daily costs for different travel styles
    12. Focus on practical information that will help travelers manage their money effectively
    
    Return only JSON response with no additional text or explanation.`;

    // Call AI provider with appropriate max_tokens for this specific widget
    // Increased from 2000 to 3000 to avoid truncation
    const result = await aiProvider.generateCompletion([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.2,
      max_tokens: 5000
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve currency conversion data"
      });
    }

    // Log the active AI provider for debugging
    console.log('Active AI Provider:', process.env.AI_PROVIDER);

    // Extract and parse the JSON from the response using the helper function
    const currencyData = extractJsonFromResponse(result.content);
    
    if (!currencyData) {
      return res.status(500).json({
        success: false,
        message: "Failed to parse currency conversion data from AI response"
      });
    }

    // Calculate common conversion amounts for quick reference
    const rate = currencyData.conversion.rate;
    const quickConversions = [
      { from: 1, to: rate },
      { from: 5, to: 5 * rate },
      { from: 10, to: 10 * rate },
      { from: 20, to: 20 * rate },
      { from: 50, to: 50 * rate },
      { from: 100, to: 100 * rate },
      { from: 500, to: 500 * rate },
      { from: 1000, to: 1000 * rate }
    ];

    // Add quick conversions to the response
    currencyData.quickConversions = quickConversions;

    return res.status(200).json({
      success: true,
      query: {
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        amount: conversionAmount,
        date: conversionDate
      },
      data: currencyData
    });
  } catch (error) {
    console.error("Error in currency converter:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong with the currency converter",
      error: error.message
    });
  }
};

/**
 * Packing calculator widget
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const packingCalculator = async (req, res) => {
  try {
    const { destination, duration, gender, age, activities, season, style, tripType } = req.query;
    
    if (!destination) {
      return res.status(400).json({
        success: false,
        message: "Destination is required"
      });
    }

    // Set defaults and parse inputs
    const tripDuration = parseInt(duration) || 7; // Default to 7 days if not specified
    const tripGender = gender || 'neutral'; // Default to neutral if not specified
    const tripAge = age ? parseInt(age) : 'adult'; // Default to adult if not specified
    const tripActivities = activities || 'general sightseeing';
    const tripSeason = season || 'current';
    const packingStyle = style || 'efficient'; // Can be: efficient, minimal, prepared
    const typeOfTrip = tripType || 'leisure'; // Can be: leisure, business, adventure, beach, winter
    
    // Create prompt for AI API
    const prompt = `Please provide a detailed, personalized packing list for a traveler with the following details:
    
    Destination: ${destination}
    Duration: ${tripDuration} days
    Gender: ${tripGender}
    Age: ${tripAge}
    Activities: ${tripActivities || 'General tourism and sightseeing'}
    Season/Weather: ${tripSeason}
    Packing Style: ${packingStyle}
    Trip Type: ${typeOfTrip}

    Return the information in JSON format strictly following this structure:
    {
      "packingList": {
        "clothing": {
          "essentials": [
            {"item": "", "quantity": 0, "notes": ""}
          ],
          "outerwear": [
            {"item": "", "quantity": 0, "notes": ""}
          ],
          "footwear": [
            {"item": "", "quantity": 0, "notes": ""}
          ],
          "accessories": [
            {"item": "", "quantity": 0, "notes": ""}
          ],
          "specialItems": [
            {"item": "", "quantity": 0, "notes": ""}
          ]
        },
        "toiletries": [
          {"item": "", "quantity": 0, "notes": ""}
        ],
        "electronics": [
          {"item": "", "quantity": 0, "notes": ""}
        ],
        "healthAndSafety": [
          {"item": "", "quantity": 0, "notes": ""}
        ],
        "miscellaneous": [
          {"item": "", "quantity": 0, "notes": ""}
        ]
      },
      "outfitPlanner": {
        "dailyOutfits": [
          {
            "day": 1,
            "daytime": {
              "outfit": "",
              "reason": ""
            },
            "evening": {
              "outfit": "",
              "reason": ""
            }
          }
        ],
        "specialOccasions": [
          {
            "occasion": "",
            "outfit": "",
            "reason": ""
          }
        ],
        "layeringTips": "",
        "packingTips": [
          ""
        ]
      },
      "destinationSpecifics": {
        "weatherSummary": "",
        "localConsiderations": [
          ""
        ],
        "culturalNotes": [
          ""
        ],
        "packingChallenges": [
          ""
        ]
      },
      "laundryStrategy": {
        "recommendation": "",
        "options": [
          ""
        ]
      }
    }

    Please ensure:
    1. All clothing recommendations are appropriate for the destination's climate, culture, and specified activities
    2. Include gender-specific items only if relevant for the specified gender
    3. Age-appropriate recommendations are provided
    4. Outfit planner should cover the entire trip duration, but for trips longer than 7 days, provide a weekly rotation strategy
    5. Quantities should be realistic and based on the trip duration (considering laundry options for longer trips)
    6. Include destination-specific items and cultural considerations (e.g., modest clothing for religious sites)
    7. For 'dailyOutfits', only include one outfit per day for trips up to 7 days. For longer trips, provide a representative week
    8. Add practical layering and packing tips specific to the destination and activities
    9. Include any special considerations for the destination (e.g., insect protection, altitude sickness prevention)
    10. Do not include travel documents, passports, visas, etc.
    
    Return only JSON response with no additional text or explanation.`;

    // Call AI provider with higher max_tokens limit
    const result = await aiProvider.generateCompletion([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.2,
      max_tokens: 5000
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate packing list"
      });
    }

    // Log the raw response for debugging
    console.log('=== RAW AI RESPONSE START ===');
    console.log(result.content);
    console.log('=== RAW AI RESPONSE END ===');
    
    // Log the active AI provider for debugging
    console.log('Active AI Provider:', process.env.AI_PROVIDER);

    // Extract and parse the JSON from the response using the helper function
    const packingList = extractJsonFromResponse(result.content);
    
    if (!packingList) {
      return res.status(500).json({
        success: false,
        message: "Failed to parse packing list from AI response"
      });
    }

    return res.status(200).json({
      success: true,
      query: {
        destination,
        duration: tripDuration,
        gender: tripGender,
        age: tripAge,
        activities: tripActivities,
        season: tripSeason,
        style: packingStyle,
        tripType: typeOfTrip
      },
      data: packingList
    });
  } catch (error) {
    console.error("Error in packing calculator:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong with the packing calculator",
      error: error.message
    });
  }
};

/**
 * Travel budget planner widget
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const travelBudgetPlanner = async (req, res) => {
  try {
    const { origin, destination, passengers, duration, travelStyle, accommodation, transportation, activities, currency } = req.query;
    
    if (!destination) {
      return res.status(400).json({
        success: false,
        message: "Destination is required"
      });
    }

    const numPassengers = parseInt(passengers) || 1;
    const tripDuration = parseInt(duration) || 7; // Default to 7 days if not specified
    
    // Create prompt for AI API
    const prompt = `Please provide a detailed travel budget estimate for a trip with the following details:
    
    Origin: ${origin || 'Not specified'}
    Destination: ${destination}
    Number of Passengers: ${numPassengers}
    Duration: ${tripDuration} days
    Travel Style: ${travelStyle || 'Average/Mid-range'} 
    Preferred Accommodation: ${accommodation || 'Not specified (consider standard hotels)'}
    Transportation Preferences: ${transportation || 'Not specified (consider common options)'}
    Planned Activities: ${activities || 'Not specified (consider typical tourist activities)'}
    Currency: ${currency || 'USD'}

    Return the information in JSON format strictly following this structure:
    {
      "summary": {
        "totalEstimatedCost": 0,
        "costPerPerson": 0,
        "costPerDay": 0,
        "currency": "${currency || 'USD'}",
        "budgetLevel": ""
      },
      "breakdown": {
        "accommodation": {
          "totalCost": 0,
          "perNight": 0,
          "description": ""
        },
        "transportation": {
          "international": {
            "totalCost": 0,
            "perPerson": 0,
            "description": ""
          },
          "local": {
            "totalCost": 0,
            "perPerson": 0,
            "description": ""
          }
        },
        "food": {
          "totalCost": 0,
          "perDayPerPerson": 0,
          "description": ""
        },
        "activities": {
          "totalCost": 0,
          "perPerson": 0,
          "description": "",
          "suggestedActivities": [
            {"name": "", "estimatedCost": 0, "description": ""}
          ]
        },
        "miscellaneous": {
          "totalCost": 0,
          "description": ""
        }
      },
      "notes": [
        ""
      ],
      "savingTips": [
        ""
      ],
      "seasonalConsiderations": ""
    }

    Please ensure:
    1. All costs are realistic and based on current market rates for the specified location and travel style
    2. The budget breakdown is comprehensive and covers all major travel expenses
    3. Include at least 3-5 suggested activities with their estimated costs
    4. Include at least 3-5 money-saving tips specific to the destination
    5. Account for seasonal variations in pricing if relevant
    6. All monetary values should be numeric (not strings) and in USD unless another currency is more appropriate
    7. The budgetLevel should be one of: "Budget", "Mid-range", "Luxury", or "Ultra-luxury"
    
    Return only JSON response with no additional text or explanation.`;

    // Call AI provider with higher max_tokens limit
    const result = await aiProvider.generateCompletion([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.2,
      max_tokens: 5000
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate budget estimate"
      });
    }

    // Log the raw response for debugging
    console.log('=== RAW AI RESPONSE START ===');
    console.log(result.content);
    console.log('=== RAW AI RESPONSE END ===');
    
    // Log the active AI provider for debugging
    console.log('Active AI Provider:', process.env.AI_PROVIDER);

    // Extract and parse the JSON from the response using the helper function
    const budgetEstimate = extractJsonFromResponse(result.content);
    
    if (!budgetEstimate) {
      return res.status(500).json({
        success: false,
        message: "Failed to parse budget estimate from AI response"
      });
    }

    return res.status(200).json({
      success: true,
      query: {
        origin: origin || 'Not specified',
        destination,
        passengers: numPassengers,
        duration: tripDuration,
        travelStyle: travelStyle || 'Average/Mid-range',
        accommodation: accommodation || 'Not specified',
        transportation: transportation || 'Not specified',
        activities: activities || 'Not specified'
      },
      data: budgetEstimate
    });
  } catch (error) {
    console.error("Error in travel budget planner:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong with the travel budget planner",
      error: error.message
    });
  }
};

/**
 * Emergency contacts widget
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const emergencyContacts = async (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Address is required"
      });
    }

    // Create prompt for AI API
    const prompt = `Please provide a comprehensive list of emergency contacts and services for travelers visiting ${address}. 
    Return the information in JSON format strictly following this structure:
    {
      "emergencyNumbers": [
        {"service": "General Emergency", "number": "", "description": ""},
        {"service": "Police", "number": "", "description": ""},
        {"service": "Ambulance", "number": "", "description": ""},
        {"service": "Fire Department", "number": "", "description": ""}
      ],
      "medicalFacilities": [
        {"name": "", "address": "", "phone": "", "description": "", "emergencyHours": ""}
      ],
      "embassiesConsulates": [
        {"country": "", "address": "", "phone": "", "email": ""}
      ],
      "touristPolice": {"available": true/false, "number": "", "locations": []},
      "localHelplines": [
        {"service": "", "number": "", "description": ""}
      ],
      "travelAdvisories": {"source": "", "level": "", "summary": ""},
      "usefulPhrases": [
        {"phrase": "I need help", "localLanguage": "", "pronunciation": ""},
        {"phrase": "Call an ambulance", "localLanguage": "", "pronunciation": ""},
        {"phrase": "Police", "localLanguage": "", "pronunciation": ""}
      ]
    }

    Include at least:
    1. All standard emergency numbers (police, ambulance, fire)
    2. At least 3 major hospitals or medical facilities nearby
    3. Embassy/consulate information for major countries if applicable
    4. Tourist police contact if available
    5. Any travel advisories or warnings currently in effect
    6. Useful emergency phrases in the local language

    The data must be accurate and up-to-date. If you don't have specific information for any field, use "Not available" rather than making up information. Return only JSON response.`;
    
    // Call AI provider with higher max_tokens limit
    const result = await aiProvider.generateCompletion([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.2,
      max_tokens: 5000
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve emergency contacts information"
      });
    }

    // Log the raw response for debugging
    console.log('=== RAW AI RESPONSE START ===');
    console.log(result.content);
    console.log('=== RAW AI RESPONSE END ===');
    
    // Log the active AI provider for debugging
    console.log('Active AI Provider:', process.env.AI_PROVIDER);

    // Extract and parse the JSON from the response using the helper function
    const emergencyData = extractJsonFromResponse(result.content);
    
    if (!emergencyData) {
      return res.status(500).json({
        success: false,
        message: "Failed to parse emergency contacts data from AI response"
      });
    }

    return res.status(200).json({
      success: true,
      query: {
        address
      },
      data: emergencyData
    });
  } catch (error) {
    console.error("Error in emergency contacts:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong with the emergency contacts widget",
      error: error.message
    });
  }
};

/**
 * Travel phrases widget
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const travelPhrases = async (req, res) => {
  try {
    const { location, sourceLanguage = 'English' } = req.query;
    
    if (!location) {
      return res.status(400).json({
        success: false,
        message: "Location is required"
      });
    }

    // Create prompt for AI API
    const prompt = `Please provide a comprehensive list of useful phrases and expressions for travelers visiting ${location}. 
    The source language is ${sourceLanguage}.
    
    Return the information in JSON format strictly following this structure:
    {
      "localLanguage": "",
      "sourceLanguage": "${sourceLanguage}",
      "languageInfo": {
        "name": "",
        "description": "",
        "difficultyLevel": "",
        "usefulTips": []
      },
      "categories": [
        {
          "name": "Greetings",
          "phrases": [
            {
              "phrase": "",
              "translation": "",
              "pronunciation": "",
              "context": ""
            }
          ]
        },
        {
          "name": "Basics",
          "phrases": []
        },
        {
          "name": "Emergencies",
          "phrases": []
        },
        {
          "name": "Food and Dining",
          "phrases": []
        },
        {
          "name": "Transportation",
          "phrases": []
        },
        {
          "name": "Shopping",
          "phrases": []
        },
        {
          "name": "Local Slang",
          "phrases": []
        }
      ],
      "culturalNotes": [
        {
          "title": "",
          "description": ""
        }
      ]
    }

    Please ensure:
    1. The phrases are accurate and commonly used in the target location
    2. Each category should have at least 5-7 useful phrases
    3. The "Local Slang" category should contain popular colloquial expressions that travelers might hear
    4. Pronunciations should be written in a way that's easy for English speakers to understand
    5. Include important cultural context where relevant
    6. For multilingual destinations, focus on the most widely spoken language
    7. Each cultural note should highlight important etiquette or communication customs
    8. Pay special attention to politeness levels where applicable

    Return only JSON response with no additional text or explanation.`;

    // Call AI provider with higher max_tokens limit
    const result = await aiProvider.generateCompletion([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.2,
      max_tokens: 5000
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve travel phrases"
      });
    }

    // Log the raw response for debugging
    console.log('=== RAW AI RESPONSE START ===');
    console.log(result.content);
    console.log('=== RAW AI RESPONSE END ===');
    
    // Log the active AI provider for debugging
    console.log('Active AI Provider:', process.env.AI_PROVIDER);

    // Extract and parse the JSON from the response using the helper function
    const phrasesData = extractJsonFromResponse(result.content);
    
    if (!phrasesData) {
      return res.status(500).json({
        success: false,
        message: "Failed to parse travel phrases from AI response"
      });
    }

    return res.status(200).json({
      success: true,
      query: {
        location,
        sourceLanguage
      },
      data: phrasesData
    });
  } catch (error) {
    console.error("Error in travel phrases:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong with the travel phrases widget",
      error: error.message
    });
  }
};

/**
 * Crowd estimator widget
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const crowdEstimator = async (req, res) => {
  try {
    const { location, date, season } = req.query;
    
    if (!location) {
      return res.status(400).json({
        success: false,
        message: "Location is required"
      });
    }

    // Use season parameter or determine it from date if provided
    let visitPeriod = season || 'current';
    let formattedDate = null;
    
    if (!season && date) {
      // Parse date in DD-MM-YYYY format
      const dateParts = date.split('-');
      if (dateParts.length === 3) {
        const day = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
        const year = parseInt(dateParts[2]);
        
        const dateObj = new Date(year, month, day);
        
        if (!isNaN(dateObj.getTime())) {
          // Store the properly formatted date for API response
          formattedDate = `${day}-${month + 1}-${year}`;
          
          // Determine season from month
          const currentMonth = dateObj.getMonth();
          // Rough season determination based on Northern Hemisphere
          if (currentMonth >= 2 && currentMonth <= 4) visitPeriod = 'spring';
          else if (currentMonth >= 5 && currentMonth <= 7) visitPeriod = 'summer';
          else if (currentMonth >= 8 && currentMonth <= 10) visitPeriod = 'fall';
          else visitPeriod = 'winter';
        }
      }
    }

    // Create prompt for AI API
    const prompt = `Please provide detailed crowd estimations and analysis for tourists visiting ${location}${date ? ` on or around ${date}` : ` during ${visitPeriod} season`}.
    
    Return the information in JSON format strictly following this structure:
    {
      "location": {
        "name": "${location}",
        "type": "",
        "region": "",
        "country": ""
      },
      "overallCrowdLevel": {
        "level": "",
        "description": ""
      },
      "seasonalAnalysis": {
        "peakSeason": {
          "months": [],
          "crowdLevel": "",
          "description": ""
        },
        "shoulderSeason": {
          "months": [],
          "crowdLevel": "",
          "description": ""
        },
        "offSeason": {
          "months": [],
          "crowdLevel": "",
          "description": ""
        }
      },
      "currentPeriod": {
        "season": "${visitPeriod}",
        "crowdLevel": "",
        "description": ""
      },
      "popularAttractions": [
        {
          "name": "",
          "crowdLevel": "",
          "bestTimeToVisit": "",
          "tips": ""
        }
      ],
      "weekdayAnalysis": {
        "leastCrowded": [],
        "mostCrowded": [],
        "notes": ""
      },
      "timeOfDayAnalysis": {
        "morning": {
          "crowdLevel": "",
          "bestFor": []
        },
        "afternoon": {
          "crowdLevel": "",
          "bestFor": []
        },
        "evening": {
          "crowdLevel": "",
          "bestFor": []
        }
      },
      "avoidingCrowdsTips": [],
      "eventsImpactingCrowds": [
        {
          "name": "",
          "dates": "",
          "impact": "",
          "description": ""
        }
      ]
    }

    Please ensure:
    1. Crowd levels use descriptive terms (e.g., "Very High", "High", "Moderate", "Low", "Very Low")
    2. Include at least 3-5 popular attractions with their specific crowd information
    3. Include at least 3-5 practical tips for avoiding crowds
    4. Special events or holidays that might impact crowd levels should be noted if relevant
    5. If the location has multiple distinct areas, provide crowd information for the key areas
    6. Be specific about peak hours or days when attractions are most crowded
    7. For attractions, suggest the best alternative times to visit when crowds are lighter
    
    Return only JSON response with no additional text or explanation.`;

    // Call AI provider with higher max_tokens limit
    const result = await aiProvider.generateCompletion([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.2,
      max_tokens: 5000
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve crowd information"
      });
    }

    // Log the raw response for debugging
    console.log('=== RAW AI RESPONSE START ===');
    console.log(result.content);
    console.log('=== RAW AI RESPONSE END ===');
    
    // Log the active AI provider for debugging
    console.log('Active AI Provider:', process.env.AI_PROVIDER);

    // Extract and parse the JSON from the response using the helper function
    const crowdData = extractJsonFromResponse(result.content);
    
    if (!crowdData) {
      return res.status(500).json({
        success: false,
        message: "Failed to parse crowd information from AI response"
      });
    }

    return res.status(200).json({
      success: true,
      query: {
        location,
        date: formattedDate || undefined,
        season: visitPeriod
      },
      data: crowdData
    });
  } catch (error) {
    console.error("Error in crowd estimator:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong with the crowd estimator widget",
      error: error.message
    });
  }
};

/**
 * Travel documents widget
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const travelDocuments = async (req, res) => {
  try {
    const { destination, nationality = 'United States', tripType = 'tourism' } = req.query;
    
    if (!destination) {
      return res.status(400).json({
        success: false,
        message: "Destination is required"
      });
    }

    // Create prompt for AI API
    const prompt = `Please provide a comprehensive list of travel documents and requirements for a ${nationality} citizen traveling to ${destination} for ${tripType}. 
    
    Return the information in JSON format strictly following this structure:
    {
      "essentialDocuments": [
        {
          "documentType": "",
          "required": true/false,
          "description": "",
          "howToObtain": "",
          "processingTime": "",
          "validityRequirements": "",
          "estimatedCost": "",
          "notes": ""
        }
      ],
      "visaRequirements": {
        "visaRequired": true/false,
        "visaType": "",
        "entryType": "", 
        "stayDuration": "",
        "applicationProcess": "",
        "processingTime": "",
        "cost": "",
        "documents": [
          {
            "name": "",
            "details": ""
          }
        ],
        "specialRequirements": [
          ""
        ],
        "notes": ""
      },
      "healthRequirements": {
        "vaccinationsMandatory": [
          {
            "name": "",
            "details": "",
            "validityPeriod": ""
          }
        ],
        "vaccinationsRecommended": [
          {
            "name": "",
            "details": ""
          }
        ],
        "medicationRestrictions": [
          {
            "medication": "",
            "restriction": "",
            "alternative": ""
          }
        ],
        "healthInsuranceRequirements": "",
        "notes": ""
      },
      "governmentAdvisories": {
        "advisoryLevel": "",
        "advisoryText": "",
        "securityConcerns": [
          ""
        ],
        "healthConcerns": [
          ""
        ],
        "naturalDisasterRisks": [
          ""
        ],
        "localLaws": [
          {
            "category": "",
            "description": ""
          }
        ],
        "source": ""
      },
      "customsAndImport": {
        "currencyRestrictions": {
          "entryLimit": "",
          "exitLimit": "",
          "declarationRequirement": ""
        },
        "prohibitedItems": [
          ""
        ],
        "restrictedItems": [
          {
            "item": "",
            "restriction": ""
          }
        ],
        "dutyFreeAllowances": [
          {
            "category": "",
            "allowance": ""
          }
        ]
      },
      "digitalRequirements": {
        "entryRegistration": {
          "required": true/false,
          "system": "",
          "howToRegister": "",
          "deadlines": "",
          "cost": ""
        },
        "apps": [
          {
            "name": "",
            "purpose": "",
            "mandatoryStatus": true/false,
            "downloadLink": ""
          }
        ]
      },
      "bookingDocuments": [
        {
          "documentType": "",
          "format": "",
          "necessity": "",
          "tips": ""
        }
      ],
      "specialCategories": {
        "minors": {
          "additionalDocuments": [
            {
              "documentType": "",
              "description": "",
              "requirements": ""
            }
          ],
          "specialConsiderations": ""
        },
        "businessTravelers": {
          "additionalDocuments": [
            {
              "documentType": "",
              "description": "",
              "requirements": ""
            }
          ]
        },
        "dualCitizens": {
          "considerations": ""
        }
      },
      "practicalTips": [
        {
          "category": "",
          "tip": ""
        }
      ]
    }

    Please ensure:
    1. All information is accurate and up-to-date, particularly visa and entry requirements
    2. If a document section doesn't apply, include it with appropriate indication (e.g., "Not required" or "Not applicable") rather than omitting it
    3. For visaRequirements, clearly state if visa-free travel is possible and any conditions
    4. Include all legally required documents as well as strongly recommended ones
    5. Provide practical information like processing times and costs where available
    6. For government advisories, use official classification levels and provide balanced information
    7. Include digital requirements like online forms, travel registrations, or required mobile apps
    8. Add special considerations for different categories of travelers when relevant
    9. Focus on the specific route from ${nationality} to ${destination}
    10. Include practical advice on document storage, copies, and presentation at borders

    Return only JSON response with no additional text or explanation.`;

    // Call AI provider with higher max_tokens limit
    const result = await aiProvider.generateCompletion([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.2,
      max_tokens: 5000
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve travel documents information"
      });
    }

    // Log the raw response for debugging
    console.log('=== RAW AI RESPONSE START ===');
    console.log(result.content);
    console.log('=== RAW AI RESPONSE END ===');
    
    // Log the active AI provider for debugging
    console.log('Active AI Provider:', process.env.AI_PROVIDER);

    // Extract and parse the JSON from the response using the helper function
    const documentsData = extractJsonFromResponse(result.content);
    
    if (!documentsData) {
      return res.status(500).json({
        success: false,
        message: "Failed to parse travel documents data from AI response"
      });
    }

    return res.status(200).json({
      success: true,
      query: {
        destination,
        nationality,
        tripType
      },
      data: documentsData
    });
  } catch (error) {
    console.error("Error in travel documents:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong with the travel documents widget",
      error: error.message
    });
  }
};

/**
 * Get list of countries for holiday calculator
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const getCountryList = async (req, res) => {
  try {
    // Read calendar.json file
    const calendarData = require('../utils/calendar.json');
    
    // Extract only the country names (keys from the JSON)
    const countries = Object.keys(calendarData).sort();
    
    return res.status(200).json({
      success: true,
      count: countries.length,
      countries: countries
    });
  } catch (error) {
    console.error("Error getting country list:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching country list",
      error: error.message
    });
  }
};

/**
 * Get holidays for a specific country
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const getHolidays = async (req, res) => {
  try {
    const { country, year, month } = req.query;
    
    if (!country) {
      return res.status(400).json({
        success: false,
        message: "Country name is required"
      });
    }

    // Read calendar.json file
    const calendarData = require('../utils/calendar.json');
    
    // Check if the country exists in the calendar data
    if (!calendarData[country]) {
      return res.status(404).json({
        success: false,
        message: `No holiday data found for '${country}'`
      });
    }
    
    // Get holidays for the specified country
    const countryHolidays = calendarData[country];
    
    // Filter holidays by year and month if provided
    const filteredHolidays = [];
    
    for (const [date, holidayNames] of Object.entries(countryHolidays)) {
      // Parse the date to extract year and month
      const [holidayYear, holidayMonth] = date.split('-').map(Number);
      
      // Filter by year if provided
      if (year && holidayYear !== parseInt(year)) {
        continue;
      }
      
      // Filter by month if provided
      if (month && holidayMonth !== parseInt(month)) {
        continue;
      }
      
      // Add holiday to the filtered list
      holidayNames.forEach(name => {
        filteredHolidays.push({
          date,
          name,
          day: new Date(date).toLocaleDateString('en-US', { weekday: 'long' }),
          type: name.toLowerCase().includes('holiday') ? 'Holiday' : 'Public Holiday'
        });
      });
    }
    
    // Sort holidays by date
    filteredHolidays.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Group holidays by month for easier reading
    const holidaysByMonth = {};
    filteredHolidays.forEach(holiday => {
      const [, month] = holiday.date.split('-');
      if (!holidaysByMonth[month]) {
        holidaysByMonth[month] = [];
      }
      holidaysByMonth[month].push(holiday);
    });
    
    // Generate summary data
    const summary = {
      totalHolidays: filteredHolidays.length,
      holidaysByMonth: Object.fromEntries(
        Object.entries(holidaysByMonth).map(([month, holidays]) => [month, holidays.length])
      )
    };

    return res.status(200).json({
      success: true,
      data: {
        countryInfo: {
          name: country
        },
        holidays: filteredHolidays,
        summary,
      }
    });
  } catch (error) {
    console.error("Error getting holidays:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching holidays",
      error: error.message
    });
  }
};

/**
 * Holiday Calculator widget
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const holidayCalculator = async (req, res) => {
  try {
    const { country, year, maxLeaveDays = 2 } = req.query;
    
    if (!country) {
      return res.status(400).json({
        success: false,
        message: "Country name is required"
      });
    }

    // Default to current year if not provided
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    
    // Convert maxLeaveDays to number and limit it to a reasonable range (0-5)
    const maxLeave = Math.min(Math.max(parseInt(maxLeaveDays) || 2, 0), 5);

    // Read calendar.json file
    const calendarData = require('../utils/calendar.json');
    
    // Check if the country exists in the calendar data
    if (!calendarData[country]) {
      return res.status(404).json({
        success: false,
        message: `No holiday data found for '${country}'`
      });
    }
    
    // Get holidays for the specified country
    const countryHolidays = calendarData[country];
    
    // Extract holidays for the target year
    const holidaysInYear = {};
    Object.entries(countryHolidays).forEach(([date, events]) => {
      if (date.startsWith(targetYear.toString())) {
        holidaysInYear[date] = events;
      }
    });
    
    // Function to determine if a date is a weekend (Saturday or Sunday)
    const isWeekend = (dateStr) => {
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay(); // 0 is Sunday, 6 is Saturday
      return dayOfWeek === 0 || dayOfWeek === 6;
    };
    
    // Function to get day of week name
    const getDayOfWeek = (dateStr) => {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const date = new Date(dateStr);
      return days[date.getDay()];
    };
    
    // Function to format a date as YYYY-MM-DD
    const formatDate = (date) => {
      return date.toISOString().split('T')[0];
    };
    
    // Function to add days to a date
    const addDays = (dateStr, days) => {
      const date = new Date(dateStr);
      date.setDate(date.getDate() + days);
      return formatDate(date);
    };
    
    // Function to subtract days from a date
    const subtractDays = (dateStr, days) => {
      const date = new Date(dateStr);
      date.setDate(date.getDate() - days);
      return formatDate(date);
    };

    // Prepare an array of all holidays (including weekends)
    const allHolidays = [];
    
    // Add public holidays to the list
    for (const [date, events] of Object.entries(holidaysInYear)) {
      allHolidays.push({
        date,
        events,
        isWeekend: isWeekend(date),
        dayOfWeek: getDayOfWeek(date)
      });
    }
    
    // Add all weekends for the year
    const startDate = new Date(targetYear, 0, 1); // Jan 1
    const endDate = new Date(targetYear, 11, 31); // Dec 31
    
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = formatDate(currentDate);
      
      // If it's a weekend and not already in the list as a holiday
      if (isWeekend(dateStr) && !holidaysInYear[dateStr]) {
        allHolidays.push({
          date: dateStr,
          events: ["Weekend"],
          isWeekend: true,
          dayOfWeek: getDayOfWeek(dateStr)
        });
      }
      
      // Move to the next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Sort all holidays by date
    allHolidays.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Find long weekend combinations
    const longWeekendCombinations = [];
    
    // Process each holiday date
    for (let i = 0; i < allHolidays.length; i++) {
      const holiday = allHolidays[i];
      const date = holiday.date;
      const dayOfWeek = new Date(date).getDay(); // 0 (Sunday) to 6 (Saturday)
      
      // Skip if it's a regular weekend with no special holiday
      if (holiday.isWeekend && holiday.events.length === 1 && holiday.events[0] === "Weekend") {
        continue;
      }

      // Case 1: Holiday falls on Monday
      if (dayOfWeek === 1) {
        // Saturday, Sunday, Monday holiday (3-day weekend, no leave needed)
        const saturdayDate = subtractDays(date, 2);
        const sundayDate = subtractDays(date, 1);
        
        longWeekendCombinations.push({
          name: "Long Weekend: Saturday to Monday (3 days)",
          dates: [saturdayDate, sundayDate, date],
          daysOff: [
            { date: saturdayDate, reason: "Weekend" },
            { date: sundayDate, reason: "Weekend" },
            { date: date, reason: holiday.events[0] }
          ],
          leaveDaysNeeded: 0,
          totalDays: 3
        });
        
        // Check if we can extend by taking Tuesday off
        if (maxLeave >= 1) {
          const tuesdayDate = addDays(date, 1);
          longWeekendCombinations.push({
            name: "Extended Weekend: Saturday to Tuesday (4 days)",
            dates: [saturdayDate, sundayDate, date, tuesdayDate],
            daysOff: [
              { date: saturdayDate, reason: "Weekend" },
              { date: sundayDate, reason: "Weekend" },
              { date: date, reason: holiday.events[0] },
              { date: tuesdayDate, reason: "Leave Day" }
            ],
            leaveDaysNeeded: 1,
            totalDays: 4
          });
        }
        
        // Check if we can extend by taking Tuesday and Wednesday off
        if (maxLeave >= 2) {
          const tuesdayDate = addDays(date, 1);
          const wednesdayDate = addDays(date, 2);
          longWeekendCombinations.push({
            name: "Extended Weekend: Saturday to Wednesday (5 days)",
            dates: [saturdayDate, sundayDate, date, tuesdayDate, wednesdayDate],
            daysOff: [
              { date: saturdayDate, reason: "Weekend" },
              { date: sundayDate, reason: "Weekend" },
              { date: date, reason: holiday.events[0] },
              { date: tuesdayDate, reason: "Leave Day" },
              { date: wednesdayDate, reason: "Leave Day" }
            ],
            leaveDaysNeeded: 2,
            totalDays: 5
          });
        }
      }
      
      // Case 2: Holiday falls on Friday
      else if (dayOfWeek === 5) {
        // Friday holiday, Saturday, Sunday (3-day weekend, no leave needed)
        const saturdayDate = addDays(date, 1);
        const sundayDate = addDays(date, 2);
        
        longWeekendCombinations.push({
          name: "Long Weekend: Friday to Sunday (3 days)",
          dates: [date, saturdayDate, sundayDate],
          daysOff: [
            { date: date, reason: holiday.events[0] },
            { date: saturdayDate, reason: "Weekend" },
            { date: sundayDate, reason: "Weekend" }
          ],
          leaveDaysNeeded: 0,
          totalDays: 3
        });
        
        // Check if we can extend by taking Thursday off
        if (maxLeave >= 1) {
          const thursdayDate = subtractDays(date, 1);
          longWeekendCombinations.push({
            name: "Extended Weekend: Thursday to Sunday (4 days)",
            dates: [thursdayDate, date, saturdayDate, sundayDate],
            daysOff: [
              { date: thursdayDate, reason: "Leave Day" },
              { date: date, reason: holiday.events[0] },
              { date: saturdayDate, reason: "Weekend" },
              { date: sundayDate, reason: "Weekend" }
            ],
            leaveDaysNeeded: 1,
            totalDays: 4
          });
        }
        
        // Check if we can extend by taking Wednesday and Thursday off
        if (maxLeave >= 2) {
          const wednesdayDate = subtractDays(date, 2);
          const thursdayDate = subtractDays(date, 1);
          longWeekendCombinations.push({
            name: "Extended Weekend: Wednesday to Sunday (5 days)",
            dates: [wednesdayDate, thursdayDate, date, saturdayDate, sundayDate],
            daysOff: [
              { date: wednesdayDate, reason: "Leave Day" },
              { date: thursdayDate, reason: "Leave Day" },
              { date: date, reason: holiday.events[0] },
              { date: saturdayDate, reason: "Weekend" },
              { date: sundayDate, reason: "Weekend" }
            ],
            leaveDaysNeeded: 2,
            totalDays: 5
          });
        }
      }
      
      // Case 3: Holiday falls on Tuesday
      else if (dayOfWeek === 2) {
        // Check if we can create a 4-day weekend by taking Monday off
        if (maxLeave >= 1) {
          const saturdayDate = subtractDays(date, 3);
          const sundayDate = subtractDays(date, 2);
          const mondayDate = subtractDays(date, 1);
          
          longWeekendCombinations.push({
            name: "Extended Weekend: Saturday to Tuesday (4 days)",
            dates: [saturdayDate, sundayDate, mondayDate, date],
            daysOff: [
              { date: saturdayDate, reason: "Weekend" },
              { date: sundayDate, reason: "Weekend" },
              { date: mondayDate, reason: "Leave Day" },
              { date: date, reason: holiday.events[0] }
            ],
            leaveDaysNeeded: 1,
            totalDays: 4
          });
        }
      }
      
      // Case 4: Holiday falls on Thursday
      else if (dayOfWeek === 4) {
        // Check if we can create a 4-day weekend by taking Friday off
        if (maxLeave >= 1) {
          const fridayDate = addDays(date, 1);
          const saturdayDate = addDays(date, 2);
          const sundayDate = addDays(date, 3);
          
          longWeekendCombinations.push({
            name: "Extended Weekend: Thursday to Sunday (4 days)",
            dates: [date, fridayDate, saturdayDate, sundayDate],
            daysOff: [
              { date: date, reason: holiday.events[0] },
              { date: fridayDate, reason: "Leave Day" },
              { date: saturdayDate, reason: "Weekend" },
              { date: sundayDate, reason: "Weekend" }
            ],
            leaveDaysNeeded: 1,
            totalDays: 4
          });
        }
      }
      
      // Case 5: Holiday falls on Wednesday
      else if (dayOfWeek === 3) {
        // Check for the "take 2 days off, get 5 days" scenario (Monday, Tuesday, Wednesday[Holiday], Thursday, Friday)
        if (maxLeave >= 4) {
          const mondayDate = subtractDays(date, 2);
          const tuesdayDate = subtractDays(date, 1);
          const thursdayDate = addDays(date, 1);
          const fridayDate = addDays(date, 2);
          
          longWeekendCombinations.push({
            name: "Extended Break: Monday to Friday (5 days)",
            dates: [mondayDate, tuesdayDate, date, thursdayDate, fridayDate],
            daysOff: [
              { date: mondayDate, reason: "Leave Day" },
              { date: tuesdayDate, reason: "Leave Day" },
              { date: date, reason: holiday.events[0] },
              { date: thursdayDate, reason: "Leave Day" },
              { date: fridayDate, reason: "Leave Day" }
            ],
            leaveDaysNeeded: 4,
            totalDays: 5
          });
        }
        
        // Check for the "take 4 days off, get 9 days" scenario
        if (maxLeave >= 4) {
          const saturdayBefore = subtractDays(date, 4);
          const sundayBefore = subtractDays(date, 3);
          const mondayDate = subtractDays(date, 2);
          const tuesdayDate = subtractDays(date, 1);
          const thursdayDate = addDays(date, 1);
          const fridayDate = addDays(date, 2);
          const saturdayAfter = addDays(date, 3);
          const sundayAfter = addDays(date, 4);
          
          longWeekendCombinations.push({
            name: "Extended Vacation: Saturday to Sunday (9 days)",
            dates: [saturdayBefore, sundayBefore, mondayDate, tuesdayDate, date, thursdayDate, fridayDate, saturdayAfter, sundayAfter],
            daysOff: [
              { date: saturdayBefore, reason: "Weekend" },
              { date: sundayBefore, reason: "Weekend" },
              { date: mondayDate, reason: "Leave Day" },
              { date: tuesdayDate, reason: "Leave Day" },
              { date: date, reason: holiday.events[0] },
              { date: thursdayDate, reason: "Leave Day" },
              { date: fridayDate, reason: "Leave Day" },
              { date: saturdayAfter, reason: "Weekend" },
              { date: sundayAfter, reason: "Weekend" }
            ],
            leaveDaysNeeded: 4,
            totalDays: 9
          });
        }
      }
      
      // Case 6: Multiple holidays in sequence or bridgeable
      // Look ahead for holidays in the next 7 days that could be bridged
      for (let j = i + 1; j < allHolidays.length; j++) {
        const nextHoliday = allHolidays[j];
        const nextDate = nextHoliday.date;
        
        // Only consider holidays within 5 days (maximum bridge span we'll consider)
        const daysBetween = Math.floor((new Date(nextDate) - new Date(date)) / (1000 * 60 * 60 * 24));
        if (daysBetween > 5) break;
        
        // Skip if the next "holiday" is just a regular weekend with no special holiday
        if (nextHoliday.isWeekend && nextHoliday.events.length === 1 && nextHoliday.events[0] === "Weekend") {
          continue;
        }
        
        // If there's a gap between holidays that can be bridged with leave days
        if (daysBetween >= 2 && daysBetween <= maxLeave + 1) {
          const bridgeDays = [];
          const daysOff = [
            { date, reason: holiday.events[0] },
            { date: nextDate, reason: nextHoliday.events[0] }
          ];
          
          // Add the bridge days
          for (let k = 1; k < daysBetween; k++) {
            const bridgeDate = addDays(date, k);
            const bridgeDay = new Date(bridgeDate).getDay();
            
            // Skip weekends in the bridge (they're already off)
            if (bridgeDay === 0 || bridgeDay === 6) {
              daysOff.push({ date: bridgeDate, reason: "Weekend" });
            } else {
              bridgeDays.push(bridgeDate);
              daysOff.push({ date: bridgeDate, reason: "Leave Day" });
            }
          }
          
          // Calculate required leave days (exclude weekends)
          const leaveDaysRequired = bridgeDays.length;
          
          // Only add if it's within the allowed leave days
          if (leaveDaysRequired <= maxLeave) {
            // Get start and end dates inclusive
            const startDateObj = new Date(date);
            const endDateObj = new Date(nextDate);
            
            // Create all dates in range
            const allDates = [];
            let current = new Date(startDateObj);
            while (current <= endDateObj) {
              allDates.push(formatDate(current));
              current.setDate(current.getDate() + 1);
            }
            
            // Add to long weekend combinations
            longWeekendCombinations.push({
              name: `Bridge between ${getDayOfWeek(date)} and ${getDayOfWeek(nextDate)} (${allDates.length} days)`,
              dates: allDates,
              daysOff: daysOff,
              leaveDaysNeeded: leaveDaysRequired,
              totalDays: allDates.length
            });
          }
        }
      }
    }
    
    // Group combinations by month for easier planning
    const combinations = {};
    
    longWeekendCombinations.forEach(combo => {
      // Get the month of the first date in the combination
      const firstDate = combo.dates[0];
      const month = new Date(firstDate).getMonth() + 1; // 1-12
      const monthName = new Date(targetYear, month - 1, 1).toLocaleString('default', { month: 'long' });
      
      if (!combinations[month]) {
        combinations[month] = {
          month: monthName,
          combinations: []
        };
      }
      
      combinations[month].combinations.push(combo);
    });
    
    // Sort combinations by month and then by date
    const sortedCombinations = Object.keys(combinations)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map(month => combinations[month]);

    return res.status(200).json({
      success: true,
      data: {
        longWeekendsByMonth: sortedCombinations,
        totalCombinations: longWeekendCombinations.length,
        stats: {
          noLeaveRequired: longWeekendCombinations.filter(c => c.leaveDaysNeeded === 0).length,
          withLeave: {
            "1_day": longWeekendCombinations.filter(c => c.leaveDaysNeeded === 1).length,
            "2_days": longWeekendCombinations.filter(c => c.leaveDaysNeeded === 2).length,
            "3_days": longWeekendCombinations.filter(c => c.leaveDaysNeeded === 3).length,
            "4_days": longWeekendCombinations.filter(c => c.leaveDaysNeeded === 4).length,
            "5_days": longWeekendCombinations.filter(c => c.leaveDaysNeeded === 5).length
          }
        }
      }
    });
  } catch (error) {
    console.error("Error in holiday calculator:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong with the holiday calculator",
      error: error.message
    });
  }
};

/**
 * Excuse generator for leave requests
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const excuseGenerator = async (req, res) => {
  try {
    const { leaveDuration, noticeTime, leaveType, deliveryMethod, relationship, believability, tone } = req.query;
    
    // Create prompt for AI API
    const prompt = `Generate a convincing, customized leave request or excuse for work absence with the following parameters:
    
    - Leave duration: ${leaveDuration || 'one day'} (how long the person will be absent)
    - Notice time: ${noticeTime} (how much advance notice: same-day, short-notice, planned)
    - Leave type: ${leaveType} (personal, family, health, emergency, etc.)
    - Delivery method: ${deliveryMethod} (email, call, in-person, message)
    - Relationship with recipient: ${relationship} (manager, team-lead, HR, etc.)
    - Believability requirement: ${believability} (how realistic it needs to be)
    - Tone: ${tone} (professional, apologetic, straightforward, etc.)
    
    Return the information in JSON format strictly following this structure:
    {
      "excuseSummary": {
        "title": "",
        "believabilityScore": 0,
        "reuseRisk": "",
        "suitableFor": [],
        "suggestedLeaveType": ""
      },
      "excuseContent": {
        "shortVersion": "",
        "fullContent": {
          "greeting": "",
          "introduction": "",
          "mainExcuse": "",
          "supportingDetails": [],
          "impactOnWork": "",
          "proposedArrangements": "",
          "returnPlan": "",
          "closing": "",
          "signature": ""
        },
        "callScript": {
          "openingLine": "",
          "keyPoints": [],
          "anticipatedQuestions": [
            {
              "question": "",
              "response": ""
            }
          ]
        }
      },
      "requiredDocumentation": {
        "needed": true/false,
        "types": [],
        "tips": ""
      },
      "alternatives": [
        {
          "title": "",
          "shortVersion": "",
          "bestFor": ""
        }
      ],
      "doAndDontTips": {
        "do": [],
        "dont": []
      }
    }
    
    Please ensure:
    1. The excuse is appropriate for a workplace leave request
    2. For 'believabilityScore', provide a rating from 1-100 on how believable the excuse would be
    3. For 'reuseRisk', indicate "low", "medium", or "high" based on how risky it would be to reuse this excuse with the same manager
    4. Include details on whether documentation (doctor's note, etc.) might be requested and how to handle it
    5. For 'suggestedLeaveType', indicate the official leave category this might fall under (sick leave, personal leave, bereavement, etc.)
    6. Include specific work impact and handover arrangements in the excuse
    7. For 'anticipatedQuestions', prepare responses for follow-up questions the manager might ask
    8. Provide 2-3 alternative excuses that would work for the same parameters
    9. Include practical do's and don'ts for delivering the excuse convincingly
    10. The 'suitableFor' field should contain work contexts where this excuse would be most appropriate
    
    Return only JSON response with no additional text or explanation.`;

    // Call AI provider with higher max_tokens limit
    const result = await aiProvider.generateCompletion([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.3,
      max_tokens: 5000
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate leave excuse"
      });
    }

    // Log the raw response for debugging
    console.log('=== RAW AI RESPONSE START ===');
    console.log(result.content);
    console.log('=== RAW AI RESPONSE END ===');
    
    // Log the active AI provider for debugging
    console.log('Active AI Provider:', process.env.AI_PROVIDER);

    // Extract and parse the JSON from the response using the helper function
    const excuseData = extractJsonFromResponse(result.content);
    
    if (!excuseData) {
      return res.status(500).json({
        success: false,
        message: "Failed to parse leave excuse data from AI response"
      });
    }

    return res.status(200).json({
      success: true,
      query: {
        leaveDuration: leaveDuration || 'one day',
        noticeTime,
        leaveType,
        deliveryMethod,
        relationship,
        believability,
        tone
      },
      data: excuseData
    });
  } catch (error) {
    console.error("Error in leave excuse generator:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong with the leave excuse generator",
      error: error.message
    });
  }
};

module.exports = {
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
}; 