const WhatsappUser = require("../models/WhatsappUser");
const { UserModel } = require("../models/User");
const twilioClient = require("../services/twilioService");
const otpGenerator = require("otp-generator");
const axios = require("axios");
const mongoose = require("mongoose");
const Trip = require("../models/Trip");
const aiProvider = require("../utils/aiProvider");

/**
 * Helper function to call the AI service consistently
 */
async function callAIService(messages, defaultResponse = "I'm having trouble right now. Let's try again in a moment.") {
  try {
    // Use the aiProvider utility to generate a completion
    return await aiProvider.generateCompletion(messages, {
      temperature: 0.2,
      top_p: 0.9,
      // You can customize other options specific to your use case
      web_search_options: {
        search_context_size: "low"
      }
    }, defaultResponse);
  } catch (error) {
    console.error('Error calling AI service:', error.message);
    return { success: false, content: defaultResponse };
  }
}

// Note: Renamed function for clarity in code referencing it
// Original name kept for backward compatibility
const callPerplexityAPI = callAIService;

/**
 * Sanitize conversation history to ensure it follows API requirements
 * Note: This can now use the sanitizeConversationHistory from the aiProvider utility
 */
function sanitizeConversationHistory(messages) {
  return aiProvider.sanitizeConversationHistory(messages);
}

/**
 * Handle incoming WhatsApp messages from Twilio webhook
 */
async function handleIncomingMessage(req, res) {
  try {
    // Extract message details from Twilio webhook payload
    const { From, Body, ProfileName } = req.body;
    
    // Format phone number (remove 'whatsapp:' prefix from Twilio format)
    const phoneNumber = From.replace('whatsapp:', '');
    
    // Find or create a User with WhatsApp data
    let user = await UserModel.findOne({ phoneNumber });
    
    if (!user) {
      // Create new User if not exists (with WhatsApp as source)
      user = new UserModel({
        phoneNumber,
        name: ProfileName || 'Traveler',
        createdVia: 'whatsapp',
        verificationStatus: {
          phone: true // Consider the phone verified since they're receiving WhatsApp
        },
        whatsapp: {
          profilePic: null,
          lastActivity: new Date(),
          conversationHistory: [
            {
              role: 'system',
              content: `You're Dora, a travel companion from CloneMyTrips. You text like a friend - casual, helpful, and to the point.

              IMPORTANT TEXTING STYLE:
              - Keep messages short (under 100 words)
              - Use casual language with slang, abbreviations, and emojis occasionally
              - Show personality - be enthusiastic about travel
              - Don't sound like an AI or customer service rep
              - Ask follow-up questions naturally
              - Don't be overly formal or use business language
              - Sometimes use sentence fragments, like real texting
              - Occasionally make small typos and self-corrections
              
              You help with travel planning, finding deals, using handy travel tools, and booking trips.
              Always be casual and conversational. Never be robotic or corporate.`,
            }
          ],
          conversationContext: {
            currentState: 'idle',
            contextData: {},
            stateHistory: []
          }
        }
      });
      await user.save();
    } else if (!user.whatsapp) {
      // If user exists but doesn't have WhatsApp data (likely created via app first)
      user.whatsapp = {
        profilePic: null,
        lastActivity: new Date(),
        conversationHistory: [
          {
            role: 'system',
            content: `You're Dora, a travel companion from CloneMyTrips. You text like a friend - casual, helpful, and to the point.

            IMPORTANT TEXTING STYLE:
            - Keep messages short (under 100 words)
            - Use casual language with slang, abbreviations, and emojis occasionally
            - Show personality - be enthusiastic about travel
            - Don't sound like an AI or customer service rep
            - Ask follow-up questions naturally
            - Don't be overly formal or use business language
            - Sometimes use sentence fragments, like real texting
            - Occasionally make small typos and self-corrections
            
            You help with travel planning, finding deals, using handy travel tools, and booking trips.
            Always be casual and conversational. Never be robotic or corporate.`,
          }
        ],
        conversationContext: {
          currentState: 'idle',
          contextData: {},
          stateHistory: []
        }
      };
    }
    
    // Add user message to conversation history
    if (!user.whatsapp.conversationHistory) {
      user.whatsapp.conversationHistory = [];
    }
    
    user.whatsapp.conversationHistory.push({
      role: 'user',
      content: Body,
      timestamp: new Date()
    });
    
    // Update last activity
    user.whatsapp.lastActivity = new Date();
    
    // Save the updated user data
    await user.save();
    
    // Process the message and generate a response
    const processedResponse = await processMessage(user, Body);
    
    // Check if response is a string or an object with multiple messages
    let aiResponse;
    let multipleMessages = false;
    let contextType = 'general';
    
    if (typeof processedResponse === 'object' && processedResponse.messages) {
      // This is an intentional multi-message response
      aiResponse = processedResponse.messages[0]; // Use first message for immediate response
      multipleMessages = true;
      contextType = processedResponse.contextType || 'general';
    } else {
      // Single response string
      aiResponse = processedResponse;
      
      // Determine context type from conversation state and content
      if (user.whatsapp?.conversationContext?.currentState === 'widget_usage') {
        contextType = 'widget_response';
      } else if (aiResponse.includes('step by step') || 
                 aiResponse.includes('Here are the details') ||
                 aiResponse.length > 1500) {
        contextType = 'detailed_explanation';
      }
    }
    
    // Respond to Twilio with TwiML
    const twiml = twilioClient.getTwiml();
    
    // Split long messages if needed
    const messageParts = splitLongMessage(aiResponse, contextType);
    
    // If the message is short enough, send it directly
    if (messageParts.length === 1 && !multipleMessages) {
      twiml.message(messageParts[0]);
    } else {
      // For long messages or multiple messages, send the first part in the immediate response
      twiml.message(messageParts[0]);
      
      // Create the array of follow-up messages
      let followUpMessages = [];
      
      if (messageParts.length > 1) {
        // Add remaining parts of the split first message
        followUpMessages = followUpMessages.concat(messageParts.slice(1));
      }
      
      if (multipleMessages) {
        // Add the intentional additional messages
        followUpMessages = followUpMessages.concat(processedResponse.messages.slice(1));
      }
      
      // Send follow-up messages asynchronously if there are any
      if (followUpMessages.length > 0) {
        console.log(`Queuing ${followUpMessages.length} follow-up messages`);
        // We don't await this to avoid delaying the response
        sendFollowUpMessages(phoneNumber, followUpMessages)
          .catch(error => console.error('Error sending follow-up messages:', error));
      }
    }
    
    res.writeHead(200, {'Content-Type': 'text/xml'});
    res.end(twiml.toString());
  } catch (error) {
    console.error('Error handling WhatsApp message:', error);
    // Respond with success to Twilio even if there's an error to avoid retries
    res.status(200).send();
  }
}

/**
 * Split a long message into smaller chunks to respect WhatsApp's character limit
 * WhatsApp has a limit of approximately 4,096 characters per message
 */
function splitLongMessage(message, contextType = 'general') {
  // Determine appropriate max length based on context type
  const MAX_LENGTH = determineMessageMaxLength(contextType, message);
  
  // If the message is already short enough, return it as is
  if (message.length <= MAX_LENGTH) {
    return [message];
  }
  
  const parts = [];
  let remainingText = message;
  
  while (remainingText.length > 0) {
    if (remainingText.length <= MAX_LENGTH) {
      // If the remaining text fits in one message, add it and break
      parts.push(remainingText);
      break;
    }
    
    // Find a good breaking point (end of a paragraph, sentence, or word)
    let breakPoint = findBreakPoint(remainingText, MAX_LENGTH);
    
    // Extract the part before the breaking point
    const part = remainingText.substring(0, breakPoint).trim();
    parts.push(part);
    
    // Continue with the rest of the text
    remainingText = remainingText.substring(breakPoint).trim();
  }
  
  return parts;
}

/**
 * Determine the appropriate message length based on context and content
 */
function determineMessageMaxLength(contextType, messageContent) {
  // Base length is more generous than before - WhatsApp limit is 4096 but we stay conservative
  const BASE_LENGTH = 3800;
  
  // For detailed explanations, allow longer messages
  if (contextType === 'detailed_explanation' || 
      messageContent.includes('Here are the details') ||
      messageContent.includes('step by step') ||
      messageContent.includes('instructions for') ||
      messageContent.includes('guide to')) {
    return BASE_LENGTH; // Allow full length for detailed content
  }
  
  // For lists and multi-point responses, allow medium length
  if (messageContent.includes('\n•') || 
      messageContent.includes('\n-') ||
      messageContent.includes('\n1.')) {
    return 2500; // Good length for structured content
  }
  
  // For widget responses that include data (weather, currency, etc)
  if (contextType === 'widget_response') {
    return 1500; // Data-focused responses need moderate space
  }
  
  // Default for conversational messages - keep these brief and natural
  return 1200; // Still allows for thorough responses while feeling natural
}

/**
 * Find a good breaking point in a text near the specified length
 */
function findBreakPoint(text, maxLength) {
  // Try to break at a paragraph boundary
  const paragraphBreak = text.lastIndexOf('\n\n', maxLength);
  if (paragraphBreak > maxLength * 0.75) {
    return paragraphBreak + 2;
  }
  
  // Try to break at a line break
  const lineBreak = text.lastIndexOf('\n', maxLength);
  if (lineBreak > maxLength * 0.75) {
    return lineBreak + 1;
  }
  
  // Try to break at a sentence boundary
  for (const char of ['. ', '! ', '? ']) {
    const sentenceBreak = text.lastIndexOf(char, maxLength);
    if (sentenceBreak > maxLength * 0.75) {
      return sentenceBreak + 2;
    }
  }
  
  // Try to break at a comma or semicolon
  for (const char of [', ', '; ']) {
    const punctuationBreak = text.lastIndexOf(char, maxLength);
    if (punctuationBreak > maxLength * 0.75) {
      return punctuationBreak + 2;
    }
  }
  
  // Last resort: break at a word boundary
  const spaceBreak = text.lastIndexOf(' ', maxLength);
  if (spaceBreak > 0) {
    return spaceBreak + 1;
  }
  
  // If all else fails, just break at the maximum length
  return maxLength;
}

/**
 * Send follow-up messages with natural delays
 */
async function sendFollowUpMessages(phoneNumber, messageParts) {
  try {
    console.log(`Sending ${messageParts.length} follow-up messages to ${phoneNumber}`);
    
    // Add some initial delay before first follow-up to ensure the first message was delivered
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    for (let i = 0; i < messageParts.length; i++) {
      const message = messageParts[i];
      
      // Calculate a natural delay based on:
      // 1. Message length (longer messages should have longer delays)
      // 2. Random component (to make it feel less robotic)
      
      // Base delay of 2-3 seconds between messages
      let delay = 2000 + Math.floor(Math.random() * 1000);
      
      // Add delay based on message length - max 1 second per 100 chars
      const lengthDelay = Math.min(8000, Math.floor(message.length / 100) * 1000);
      delay += lengthDelay;
      
      // Add some "thinking time" for messages that introduce new thoughts
      if (message.startsWith("Also") || 
          message.startsWith("Oh") || 
          message.startsWith("Let me") || 
          message.startsWith("I should") ||
          message.startsWith("And") ||
          message.startsWith("One more thing")) {
        delay += 1500 + Math.floor(Math.random() * 1500);
      }
      
      // Cap delay at reasonable values (between 2-10 seconds)
      delay = Math.max(2000, Math.min(10000, delay));
      
      console.log(`Waiting ${delay}ms before sending follow-up message ${i+1}`);
      
      try {
        // Wait before sending the next message
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Send the message and log response
        const response = await twilioClient.sendWhatsAppMessage(phoneNumber, message);
        console.log(`Follow-up message ${i+1} sent successfully, SID: ${response?.sid || 'unknown'}`);
      } catch (msgError) {
        // Log but continue with next message rather than failing entire sequence
        console.error(`Error sending follow-up message ${i+1}:`, msgError);
        
        // Add a recovery delay before attempting the next message
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  } catch (error) {
    console.error('Error in sendFollowUpMessages:', error);
    // Log more detailed error information
    if (error.response) {
      console.error('Twilio API error details:', {
        status: error.status,
        message: error.message,
        code: error.code,
        moreInfo: error.moreInfo
      });
    }
  }
}

/**
 * Detect if a message is a simple greeting that might indicate a returning user
 */
function isSimpleGreeting(messageText) {
  const greetingPatterns = [
    /^(hi|hello|hey|hola|good morning|good afternoon|good evening|howdy|sup|yo|hiya)(?:\s|$|\?|\.|\!)/i,
    /^(what'?s up|how are you|how'?s it going)(?:\s|$|\?|\.|\!)/i
  ];
  
  return greetingPatterns.some(pattern => pattern.test(messageText.trim()));
}

/**
 * Determine if the conversation context needs to be refreshed based on time elapsed
 */
function shouldRefreshContext(user, messageText) {
  // Check if this is a simple greeting
  if (!isSimpleGreeting(messageText)) {
    return false;
  }
  
  // Get the last conversation timestamp
  const conversationHistory = user.whatsapp?.conversationHistory || [];
  if (conversationHistory.length < 2) {
    return false; // Not enough history to determine a gap
  }
  
  // Find the last assistant and user message timestamps
  const userMessages = conversationHistory.filter(msg => msg.role === 'user' && msg.timestamp);
  if (userMessages.length < 2) {
    return false; // Not enough user messages to determine a gap
  }
  
  // Get the timestamp of the second-to-last user message
  const previousMessageTime = new Date(userMessages[userMessages.length - 2].timestamp);
  const currentTime = new Date();
  
  // Calculate elapsed time in hours
  const elapsedHours = (currentTime - previousMessageTime) / (1000 * 60 * 60);
  
  // Refresh if more than 12 hours have passed
  return elapsedHours > 12;
}

/**
 * Generate a returning user greeting based on context
 */
async function generateReturningUserGreeting(user, messageText) {
  // Check what state they were in before
  const currentState = user.whatsapp?.conversationContext?.currentState || 'idle';
  
  // Get time gap info
  const conversationHistory = user.whatsapp?.conversationHistory || [];
  const userMessages = conversationHistory.filter(msg => msg.role === 'user' && msg.timestamp);
  const previousMessageTime = userMessages.length > 1 ? new Date(userMessages[userMessages.length - 2].timestamp) : null;
  
  // Calculate elapsed time if we have a previous message
  let timeGapText = '';
  if (previousMessageTime) {
    const currentTime = new Date();
    const elapsedHours = (currentTime - previousMessageTime) / (1000 * 60 * 60);
    
    if (elapsedHours > 168) { // More than a week
      timeGapText = "It's been a while! ";
    } else if (elapsedHours > 48) { // More than 2 days
      timeGapText = "Haven't chatted in a few days! ";
    }
  }
  
  let contextReference = '';
  
  // Reference previous context if relevant
  if (currentState === 'trip_planning' && user.whatsapp?.activeTripId) {
    try {
      const trip = await Trip.findById(user.whatsapp.activeTripId);
      if (trip) {
        const destination = trip.destinations?.[0]?.location || 'your trip';
        contextReference = `Last time we were planning your trip to ${destination}. Still working on that or something new? `;
      }
    } catch (error) {
      console.error('Error fetching trip data for returning user:', error);
    }
  } else if (currentState === 'widget_usage') {
    const widgetId = user.whatsapp?.conversationContext?.contextData?.widgetId || 
                     user.activeWidget?.widgetId;
    if (widgetId) {
      const widgets = {
        'currency-converter': 'currency conversion',
        'packing-calculator': 'packing list',
        'travel-budget': 'travel budget',
        'travel-phrases': 'travel phrases',
        'emergency-contacts': 'emergency contacts'
      };
      const widgetName = widgets[widgetId] || 'that travel tool';
      contextReference = `We were looking at ${widgetName}. Still need help with that or something else? `;
    }
  }
  
  // Create casual greeting with appropriate context
  let greeting = `Hey there! ${timeGapText}${contextReference}What can I help with today?`;
  
  return greeting;
}

/**
 * Process the incoming message and generate a response
 */
async function processMessage(user, messageText) {
  try {
    console.log(`Processing message: "${messageText}" from user ${user._id} with state:`, user.whatsapp?.conversationContext);

    // Extract all needed data upfront
    const conversationHistory = user.whatsapp?.conversationHistory || [];
    const conversationState = user.whatsapp?.conversationContext || { currentState: 'idle' };
    const lowerMessage = messageText.toLowerCase();
    
    // Check if this is a returning user with a simple greeting
    if (shouldRefreshContext(user, messageText)) {
      console.log("Detected returning user with simple greeting after time gap");
      return await generateReturningUserGreeting(user, messageText);
    }

    // Detect context switches
    let shouldSwitchContext = false;
    
    // Check for location mentions that might indicate a topic change
    const locationPattern = /\b(?:in|at|to)\s+([A-Z][a-zA-Z\s]+)(?:\?|\.|$|\s)/;
    const mentionsNewLocation = messageText.match(locationPattern)?.length > 0;
    
    // Check for explicit context switching phrases
    const contextSwitchIndicators = [
      "forget this", "forget about", "change topic", "talk about something else",
      "let's discuss", "instead tell me about", "switch to", "can we talk about",
      "tell me about your", "show me your", "what else can you do", "tell me something"
    ];
    const isExplicitSwitch = contextSwitchIndicators.some(phrase => lowerMessage.includes(phrase.toLowerCase()));
    
    // Check for implicit patterns indicating a topic change
    let isImplicitSwitch = false;
    if (conversationState.currentState !== 'widget_usage' && conversationState.currentState !== 'idle') {
      // Various patterns that suggest the user wants to use a different functionality
      if (mentionsNewLocation ||
          /(\d+(?:\.\d+)?)\s*([a-zA-Z]{3})\s*(?:to|in)\s*([a-zA-Z]{3})/i.test(lowerMessage) ||
          lowerMessage.includes("currency") || 
          lowerMessage.includes("exchange rate") ||
          lowerMessage.includes("convert money") ||
          /(?:packing|pack list|what (?:should|to) pack|packing list)/i.test(lowerMessage) ||
          (/(?:weather|temperature|forecast|rain|sunny|humidity)/i.test(lowerMessage) && 
           lowerMessage.includes("in") && !lowerMessage.includes("trip")) ||
          /(?:phrases|translate|say in|language|how to say)/i.test(lowerMessage)) {
        isImplicitSwitch = true;
      }
    }
    
    shouldSwitchContext = isExplicitSwitch || isImplicitSwitch;
    
    // Handle context switching
    if (shouldSwitchContext) {
      console.log(`Context switch detected: ${isExplicitSwitch ? 'explicit' : 'implicit'}`);
      await updateConversationState(user, 'idle', messageText);
      // Update local state to match DB update
      conversationState.currentState = 'idle'; 
    }
    
    // Generate appropriate response based on state
    let response;
    
    if (conversationState.currentState === 'idle') {
      // For idle state or after context switch, analyze intent and handle accordingly
      const userIntent = await analyzeUserIntent(messageText, conversationHistory);
      console.log(`User intent identified: ${userIntent}`);
      
      switch (userIntent) {
        case 'trip_planning': response = await handleTripPlanning(user, messageText, conversationHistory); break;
        case 'deal_search': response = await handleDealSearch(user, messageText, conversationHistory); break;
        case 'widget_usage': response = await handleWidgetUsage(user, messageText, conversationHistory); break;
        case 'booking': response = await handleBooking(user, messageText, conversationHistory); break;
        case 'trip_management': response = await handleTripManagement(user, messageText, conversationHistory); break;
        default: response = await handleGeneralQuestion(user, messageText, conversationHistory); break;
      }
    } else {
      // Continue with existing conversation flow
      switch (conversationState.currentState) {
        case 'trip_planning': response = await handleTripPlanning(user, messageText, conversationHistory); break;
        case 'deal_search': response = await handleDealSearch(user, messageText, conversationHistory); break;
        case 'widget_usage': response = await handleWidgetUsage(user, messageText, conversationHistory); break;
        case 'booking': response = await handleBooking(user, messageText, conversationHistory); break;
        case 'trip_management': response = await handleTripManagement(user, messageText, conversationHistory); break;
        default: response = await handleGeneralQuestion(user, messageText, conversationHistory); break;
      }
    }
    
    // Format long responses for better readability
    if (typeof response === 'string' && response.length > 400) {
      return createConversationalResponses(response);
    }
    
    return response;
  } catch (error) {
    console.error('Error processing message:', error);
    return "Sorry, something went wrong. Let's try again?";
  }
}

/**
 * Verify WhatsApp number and link to existing app account
 */
async function verifyWhatsappNumber(req, res) {
  try {
    const { phoneNumber, otp, userId } = req.body;
    
    // Validate OTP
    const isValid = await validateOtp(phoneNumber, otp);
    
    if (!isValid) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
    
    // Find the user who initiated the verification
    const appUser = await UserModel.findById(userId);
    
    if (!appUser) {
      return res.status(404).json({ success: false, message: "App user not found" });
    }
    
    // Check if there's already a different user with this phone number
    const existingUserWithPhone = await UserModel.findOne({ 
      phoneNumber, 
      _id: { $ne: appUser._id } 
    });
    
    if (existingUserWithPhone) {
      // We have a user who started with WhatsApp first and now needs to be merged
      // Move all WhatsApp data to the app user
      if (!appUser.whatsapp) {
        appUser.whatsapp = existingUserWithPhone.whatsapp || {};
      } else {
        // Merge conversation histories if both exist
        if (existingUserWithPhone.whatsapp && existingUserWithPhone.whatsapp.conversationHistory) {
          if (!appUser.whatsapp.conversationHistory) {
            appUser.whatsapp.conversationHistory = [];
          }
          appUser.whatsapp.conversationHistory = [
            ...existingUserWithPhone.whatsapp.conversationHistory,
            ...appUser.whatsapp.conversationHistory
          ];
        }
      }
      
      // Merge bucket lists
      if (existingUserWithPhone.bucket && existingUserWithPhone.bucket.length > 0) {
        appUser.bucket = [...new Set([
          ...(appUser.bucket || []),
          ...existingUserWithPhone.bucket
        ])];
      }
      
      // Update the app user with the WhatsApp number
      appUser.phoneNumber = phoneNumber;
      appUser.verificationStatus.phone = true;
      
      // Save the merged app user
      await appUser.save();
      
      // Delete the WhatsApp-only user since we've merged the data
      await UserModel.deleteOne({ _id: existingUserWithPhone._id });
      
      return res.status(200).json({ 
        success: true, 
        message: "WhatsApp account merged with app account" 
      });
    } else {
      // No existing WhatsApp user - just update the app user with the phone number
      appUser.phoneNumber = phoneNumber;
      appUser.verificationStatus.phone = true;
      
      // Initialize WhatsApp data if not present
      if (!appUser.whatsapp) {
        appUser.whatsapp = {
          lastActivity: new Date(),
          conversationHistory: [
            {
              role: 'system',
              content: `You're Dora, a travel companion from CloneMyTrips. You text like a friend - casual, helpful, and to the point.

              IMPORTANT TEXTING STYLE:
              - Keep messages short (under 100 words)
              - Use casual language with slang, abbreviations, and emojis occasionally
              - Show personality - be enthusiastic about travel
              - Don't sound like an AI or customer service rep
              - Ask follow-up questions naturally
              - Don't be overly formal or use business language
              - Sometimes use sentence fragments, like real texting
              - Occasionally make small typos and self-corrections
              
              You help with travel planning, finding deals, using handy travel tools, and booking trips.
              Always be casual and conversational. Never be robotic or corporate.`,
            }
          ],
          conversationContext: {
            currentState: 'idle',
            contextData: {},
            stateHistory: []
          }
        };
      }
      
      await appUser.save();
      
      return res.status(200).json({ 
        success: true, 
        message: "WhatsApp number verified and added to app account" 
      });
    }
  } catch (error) {
    console.error('Error verifying WhatsApp number:', error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}

/**
 * Send OTP for verification
 */
async function sendOtp(req, res) {
  try {
    const { phoneNumber } = req.body;
    
    // Generate OTP
    const otp = otpGenerator.generate(6, { 
      upperCaseAlphabets: false, 
      lowerCaseAlphabets: false, 
      specialChars: false 
    });
    
    // Store OTP in database or cache (e.g., Redis)
    // For simplicity, we'll just handle this in memory
    // In production, use a proper storage mechanism
    global.otpStore = global.otpStore || {};
    global.otpStore[phoneNumber] = {
      otp,
      createdAt: new Date()
    };
    
    // Send OTP via WhatsApp
    await twilioClient.sendWhatsAppMessage(
      phoneNumber,
      `Your CloneMyTrips verification code is: ${otp}. It expires in 10 minutes.`
    );
    
    return res.status(200).json({ 
      success: true, 
      message: "OTP sent successfully" 
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
}

/**
 * Validate OTP
 */
async function validateOtp(phoneNumber, otp) {
  // In a real implementation, this would check against a database or cache
  if (!global.otpStore || !global.otpStore[phoneNumber]) {
    return false;
  }
  
  const storedOtp = global.otpStore[phoneNumber];
  
  // Check if OTP has expired (10 minutes)
  const now = new Date();
  const expirationTime = new Date(storedOtp.createdAt.getTime() + 10 * 60 * 1000);
  
  if (now > expirationTime) {
    delete global.otpStore[phoneNumber];
    return false;
  }
  
  // Check if OTP matches
  if (storedOtp.otp !== otp) {
    return false;
  }
  
  // OTP is valid, delete it so it can't be reused
  delete global.otpStore[phoneNumber];
  
  return true;
}

/**
 * Get conversation history for a WhatsApp user
 */
async function getConversationHistory(req, res) {
  try {
    const { phoneNumber } = req.params;
    
    const user = await UserModel.findOne({ phoneNumber });
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    if (!user.whatsapp || !user.whatsapp.conversationHistory) {
      return res.status(200).json({ 
        success: true, 
        conversation: [] 
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      conversation: user.whatsapp.conversationHistory 
    });
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}

/**
 * Create more natural, conversational responses by breaking up a long message
 * into multiple smaller messages that feel more like real texting
 */
function createConversationalResponses(message) {
  // If message already has explicit split markers, use those
  if (message.includes('[SPLIT MESSAGE HERE]')) {
    return {
      messages: message.split('[SPLIT MESSAGE HERE]').map(msg => msg.trim()),
      contextType: message.length > 1500 ? 'detailed_explanation' : 'general'
    };
  }
  
  // Don't break up short messages
  if (message.length < 400) {
    return message;
  }
  
  // Find natural breaking points based on content structure
  const messages = [];
  let paragraphs = message.split('\n\n');
  
  // If we have more than 3 paragraphs, we can split by paragraphs
  if (paragraphs.length >= 3) {
    let currentMessage = '';
    
    for (const paragraph of paragraphs) {
      // If adding this paragraph would make the message too long, start a new message
      if (currentMessage.length + paragraph.length > 1000 && currentMessage.length > 0) {
        messages.push(currentMessage.trim());
        currentMessage = paragraph;
      } else {
        // Otherwise, add to current message
        currentMessage = currentMessage.length > 0 
          ? `${currentMessage}\n\n${paragraph}` 
          : paragraph;
      }
    }
    
    // Add the last message
    if (currentMessage.length > 0) {
      messages.push(currentMessage.trim());
    }
  } 
  // For messages with bullet points, we can split by sections
  else if (message.includes('\n•') || message.includes('\n-') || message.includes('\n1.')) {
    // Try to find logical breaks between list sections
    const sections = [];
    let currentSection = '';
    const lines = message.split('\n');
    
    for (const line of lines) {
      // If this line starts a new section or list, consider it a potential break point
      if ((line.startsWith('•') || line.startsWith('-') || /^\d+\./.test(line)) && 
          currentSection.length > 300) {
        sections.push(currentSection.trim());
        currentSection = line;
      } else {
        // Otherwise, add to current section
        currentSection = currentSection.length > 0 
          ? `${currentSection}\n${line}` 
          : line;
      }
    }
    
    // Add the last section
    if (currentSection.length > 0) {
      sections.push(currentSection.trim());
    }
    
    // Now combine sections into messages of appropriate length
    let currentMessage = '';
    
    for (const section of sections) {
      // If adding this section would make the message too long, start a new message
      if (currentMessage.length + section.length > 1000 && currentMessage.length > 0) {
        messages.push(currentMessage.trim());
        currentMessage = section;
      } else {
        // Otherwise, add to current message
        currentMessage = currentMessage.length > 0 
          ? `${currentMessage}\n\n${section}` 
          : section;
      }
    }
    
    // Add the last message
    if (currentMessage.length > 0) {
      messages.push(currentMessage.trim());
    }
  }
  // For long unstructured text, we'll look for good sentence breaks
  else {
    // Split into sentences, being careful about abbreviations and other edge cases
    const sentenceRegex = /[.!?]\s+(?=[A-Z])/g;
    let textParts = message.split(sentenceRegex);
    
    // If we couldn't find good sentence breaks, fall back to length-based splitting
    if (textParts.length <= 2) {
      // We'll create chunks of approximately 800 characters
      const chunkSize = 800;
      textParts = [];
      
      for (let i = 0; i < message.length; i += chunkSize) {
        // Find a good breaking point near the chunk size
        const endPos = Math.min(i + chunkSize, message.length);
        let breakPoint = message.lastIndexOf('. ', endPos);
        
        // If no good break found, just use the chunk size
        if (breakPoint < i || breakPoint > endPos) {
          breakPoint = message.lastIndexOf(' ', endPos);
          if (breakPoint < i || breakPoint > endPos) {
            breakPoint = endPos;
          }
        }
        
        textParts.push(message.substring(i, breakPoint + 1).trim());
        i = breakPoint;
      }
    }
    
    // Combine sentences into natural message chunks
    let currentMessage = '';
    
    for (const part of textParts) {
      // If adding this part would make the message too long, start a new message
      if (currentMessage.length + part.length > 1000 && currentMessage.length > 0) {
        messages.push(currentMessage.trim());
        currentMessage = part;
      } else {
        // Otherwise, add to current message
        currentMessage = currentMessage.length > 0 
          ? `${currentMessage} ${part}` 
          : part;
      }
    }
    
    // Add the last message
    if (currentMessage.length > 0) {
      messages.push(currentMessage.trim());
    }
  }
  
  // If we didn't create multiple messages, return the original
  if (messages.length <= 1) {
    return message;
  }
  
  // Determine context type based on message length and content
  const contextType = message.length > 1500 ? 'detailed_explanation' : 'general';
  
  return {
    messages: messages,
    contextType: contextType
  };
}

/**
 * Extract trip details from a message about existing trip management
 */
function extractTripDetails(messageText) {
  const tripDetails = {
    action: null,
    identifier: null,
    specifics: {}
  };
  
  const lowerText = messageText.toLowerCase();
  
  // Determine the requested action
  if (lowerText.includes('cancel') || lowerText.includes('refund')) {
    tripDetails.action = 'cancel';
  } else if (lowerText.includes('change') || lowerText.includes('modify') || lowerText.includes('reschedule')) {
    tripDetails.action = 'modify';
  } else if (lowerText.includes('detail') || lowerText.includes('information') || lowerText.includes('itinerary')) {
    tripDetails.action = 'details';
  } else if (lowerText.includes('check') || lowerText.includes('confirm') || lowerText.includes('status')) {
    tripDetails.action = 'status';
  } else {
    tripDetails.action = 'general';
  }
  
  // Try to extract trip/booking identifier
  const confirmationPattern = /(?:confirmation|booking|reservation|order)\s+(?:number|id|code)?\s*[:#]?\s*([A-Z0-9]{6,10})/i;
  const confirmationMatch = messageText.match(confirmationPattern);
  if (confirmationMatch) {
    tripDetails.identifier = confirmationMatch[1].toUpperCase();
  }
  
  // Extract any dates mentioned (might be original or new dates for changes)
  tripDetails.specifics.dates = extractDates(messageText);
  
  // Extract destination if mentioned
  const destinations = extractDestinations(messageText);
  if (destinations.length > 0) {
    tripDetails.specifics.destination = destinations[0];
  }
  
  return tripDetails;
}

/**
 * Processes a widget request based on the identified widget type and message content
 * @param {string} messageText - The original message from the user
 * @param {object} conversationState - The current state of the conversation
 * @returns {object} An object containing the widget type and extracted parameters
 */
const processWidgetRequest = async (messageText, conversationState) => {
  try {
    // Identify the widget type based on the message content
    const widgetType = identifyWidgetType(messageText);
    
    // Initialize result object
    const result = {
      widgetType,
      parameters: {}
    };
    
    // Extract parameters based on widget type
    switch (widgetType) {
      case 'weather':
        // Extract destinations for weather lookup
        const destinations = extractDestinations(messageText);
        // Extract dates (if any) for weather forecast
        const dates = extractDates(messageText);
        
        result.parameters = {
          locations: destinations,
          dates: dates
        };
        break;
        
      case 'flights':
        // Extract booking details for flights
        const flightDetails = extractBookingDetails(messageText);
        // Extract additional search parameters
        const flightSearchParams = extractSearchParameters(messageText);
        
        result.parameters = {
          ...flightDetails,
          ...flightSearchParams
        };
        break;
        
      case 'accommodations':
        // Extract destinations for accommodation search
        const accommodationDestinations = extractDestinations(messageText);
        // Extract dates for stay
        const accommodationDates = extractDates(messageText);
        // Extract additional search parameters
        const accommodationParams = extractSearchParameters(messageText);
        
        result.parameters = {
          locations: accommodationDestinations,
          dates: accommodationDates,
          ...accommodationParams
        };
        break;
        
      case 'tripManagement':
        // Extract trip details for management actions
        const tripDetails = extractTripDetails(messageText);
        
        result.parameters = {
          ...tripDetails
        };
        break;
        
      case 'recommendations':
        // Extract destinations, dates, and preferences for recommendations
        const recommendationDestinations = extractDestinations(messageText);
        const recommendationParams = extractSearchParameters(messageText);
        
        result.parameters = {
          locations: recommendationDestinations,
          ...recommendationParams
        };
        break;
        
      case 'itinerary':
        // Extract trip details for itinerary generation or retrieval
        const itineraryDetails = extractTripDetails(messageText);
        const itineraryDestinations = extractDestinations(messageText);
        const itineraryDates = extractDates(messageText);
        
        result.parameters = {
          ...itineraryDetails,
          locations: itineraryDestinations,
          dates: itineraryDates
        };
        break;
        
      default:
        // For unknown widget types or general inquiries
        result.parameters = {
          query: messageText
        };
    }
    
    // Store the widget type and parameters in conversation state
    if (conversationState) {
      conversationState.currentWidgetType = widgetType;
      conversationState.currentWidgetParameters = result.parameters;
    }
    
    return result;
  } catch (error) {
    console.error('Error processing widget request:', error);
    return {
      widgetType: 'error',
      parameters: {
        error: 'Failed to process widget request'
      }
    };
  }
};

/**
 * Handles widget requests by processing the request and calling the appropriate service
 * @param {string} messageText - The original message from the user
 * @param {object} conversationState - The current state of the conversation
 * @param {string} userId - The user ID
 * @returns {object} Response from the widget service
 */
const handleWidgetRequest = async (messageText, conversationState, userId) => {
  try {
    // Process the widget request to identify type and extract parameters
    const widgetRequest = await processWidgetRequest(messageText, conversationState);
    
    // Log the processed widget request
    console.log(`Processing ${widgetRequest.widgetType} widget for user ${userId}`);
    console.log('Widget parameters:', JSON.stringify(widgetRequest.parameters, null, 2));
    
    // Call the appropriate service based on widget type
    let response;
    
    switch (widgetRequest.widgetType) {
      case 'weather':
        // Call weather service
        response = await callWeatherService(widgetRequest.parameters);
        break;
        
      case 'flights':
        // Call flight search service
        response = await callFlightService(widgetRequest.parameters);
        break;
        
      case 'accommodations':
        // Call accommodation search service
        response = await callAccommodationService(widgetRequest.parameters);
        break;
        
      case 'tripManagement':
        // Call trip management service
        response = await callTripManagementService(widgetRequest.parameters);
        break;
        
      case 'recommendations':
        // Call recommendations service
        // Missing implementation - let's add the proper closure
        response = await generateRecommendations(widgetRequest.parameters);
        break;
        
      default:
        // Default handler for unknown widget types
        response = {
          type: 'text',
          content: "I'm not sure how to help with that specific request. Can you try asking in a different way?"
        };
    }
    
    return response;
  } catch (error) {
    console.error('Error handling widget request:', error);
    return {
      type: 'text',
      content: "I'm having trouble processing your request right now. Let's try something else."
    };
  }
};

/**
 * Placeholder for weather service
 */
async function callWeatherService(parameters) {
  // Implement actual service call
  return {
    type: 'weather',
    content: `Here's the weather information you requested for ${parameters.locations?.[0] || 'your location'}.`
  };
}

/**
 * Placeholder for flight service
 */
async function callFlightService(parameters) {
  // Implement actual service call
  return {
    type: 'flights',
    content: `Here are the flight options based on your search.`
  };
}

/**
 * Placeholder for accommodation service
 */
async function callAccommodationService(parameters) {
  // Implement actual service call
  return {
    type: 'accommodations',
    content: `Here are accommodation options for ${parameters.locations?.[0] || 'your destination'}.`
  };
}

/**
 * Placeholder for trip management service
 */
async function callTripManagementService(parameters) {
  // Implement actual service call
  return {
    type: 'tripManagement',
    content: `I've processed your trip management request.`
  };
}

/**
 * Placeholder for recommendations generator
 */
async function generateRecommendations(parameters) {
  // Implement actual service call
  return {
    type: 'recommendations',
    content: `Here are some recommendations based on your preferences.`
  };
}

/**
 * Update the user's conversation state based on detected intent
 */
async function updateConversationState(user, intent, messageText) {
  try {
    // Determine the new state based on the user's intent
    let newState = 'idle';
    const contextData = {};
    
    switch(intent) {
      case 'trip_planning':
        newState = 'trip_planning';
        // Extract any initial trip planning parameters from the message
        contextData.destinations = extractDestinations(messageText);
        contextData.dates = extractDates(messageText);
        contextData.isNewPlan = true; // Flag to indicate this is a new planning session
        break;
        
      case 'deal_search':
        newState = 'deal_search';
        contextData.searchParams = extractSearchParameters(messageText);
        break;
        
      case 'widget_usage':
        newState = 'widget_usage';
        // Identify which widget the user wants to interact with
        contextData.widgetType = identifyWidgetType(messageText);
        break;
        
      case 'booking':
        newState = 'booking';
        contextData.bookingDetails = extractBookingDetails(messageText);
        break;
        
      case 'trip_management':
        newState = 'trip_management';
        contextData.tripDetails = extractTripDetails(messageText);
        break;
        
      case 'general_question':
      default:
        // Stay in idle state for general questions
        newState = 'idle';
        break;
    }
    
    // Initialize whatsapp object if it doesn't exist
    if (!user.whatsapp) {
      user.whatsapp = {};
    }
    
    // Initialize conversationContext if it doesn't exist
    if (!user.whatsapp.conversationContext) {
      user.whatsapp.conversationContext = {
        currentState: 'idle',
        stateHistory: [],
        contextData: {}
      };
    }
    
    // Update state history
    const currentState = user.whatsapp.conversationContext.currentState;
    if (currentState !== newState) {
      if (!user.whatsapp.conversationContext.stateHistory) {
        user.whatsapp.conversationContext.stateHistory = [];
      }
      
      // Add the previous state to history
      if (currentState !== 'idle') {
        user.whatsapp.conversationContext.stateHistory.push({
          state: currentState,
          timestamp: new Date()
        });
      }
      
      // Limit state history to last 5 states
      if (user.whatsapp.conversationContext.stateHistory.length > 5) {
        user.whatsapp.conversationContext.stateHistory.shift();
      }
    }
    
    // When switching to a completely different intent, clear previous context data
    // Update current state and context data
    user.whatsapp.conversationContext.currentState = newState;
    
    // When switching states, we completely replace the contextData instead of merging
    // This prevents old context from affecting the new conversation direction
    if (currentState !== newState) {
      user.whatsapp.conversationContext.contextData = contextData;
    } else {
      // Only merge contextData if staying in the same state
      user.whatsapp.conversationContext.contextData = {
        ...user.whatsapp.conversationContext.contextData,
        ...contextData
      };
    }
    
    // Update last activity timestamp
    user.whatsapp.lastActivity = new Date();
    
    // If switching to a new topic, clear any active trips or widgets
    if (currentState !== newState && ['trip_planning', 'widget_usage'].includes(currentState)) {
      if (currentState === 'trip_planning' && user.whatsapp.activeTripId) {
        // Clear active trip ID when leaving trip planning mode
        user.whatsapp.activeTripId = null;
      }
      
      if (currentState === 'widget_usage' && user.activeWidget) {
        // Clear active widget when leaving widget usage mode
        user.activeWidget = null;
      }
    }
    
    // Save the updated user document
    await user.save();
    
    return newState;
  } catch (error) {
    console.error('Error updating conversation state:', error);
    // Default to idle state if there's an error
    return 'idle';
  }
}

/**
 * Generate a response based on user intent and context
 */
async function generateResponse(user, userMessage, conversationHistory, userIntent, contextData = {}) {
  // Construct the system prompt based on user intent
  let systemPrompt = `You are Dora, an AI travel and trip companion on WhatsApp. 
Keep your tone friendly, helpful, and conversational as if texting with a friend. 
This is a mobile conversation, so use natural breaks between thoughts and keep your responses concise.

IMPORTANT FORMATTING GUIDELINES:
1. Use short, conversational messages with natural pauses. It's better to break thoughts into separate messages like a human would text.
2. Feel free to use appropriate emojis occasionally, but don't overdo it.
3. Use bullet points (•) for lists - never use numbers or dashes.
4. For emphasis, use *asterisks* around important words rather than ALL CAPS.
5. When sharing factual information, be accurate and precise.

RESPONSE LENGTH:
• For simple questions: 1-2 concise sentences (30-100 words)
• For moderate questions: 2-5 short paragraphs (100-300 words) 
• Only for complex topics: up to 400 words maximum, broken into natural thought units

IMPORTANT - AVOID EXCESSIVE QUESTIONS:
• Do NOT ask multiple questions in one response
• Do NOT demand details the user hasn't volunteered
• If the user hasn't provided specific details, make reasonable assumptions rather than asking
• Only ask for critical information if absolutely necessary

SOMETIMES USE MULTIPLE MESSAGES:
For certain types of responses, especially when:
1. There's a natural pause in the conversation
2. You're adding a new thought after the main response
3. You're sharing detailed information that would feel more natural as separate texts

Indicate this by using the format: [SPLIT MESSAGE HERE]
Example: "Here's the weather for Paris. [SPLIT MESSAGE HERE] Don't forget to pack an umbrella!"

NEVER provide lengthy, academic-style responses. If you have a lot to say, focus on the most important information first, as if you're texting a friend who asked for advice.`;

  // Add intent-specific instructions
  switch (userIntent) {
    case 'trip_planning':
      systemPrompt += `
      
You're helping the user plan a trip. Keep your approach casual but informative.
• Make reasonable assumptions about details the user hasn't provided
• Suggest destinations based on their stated interests and constraints
• For detailed itineraries, use bullet points and organize by days
• Avoid asking many questions - focus on giving helpful information with what you know`;
      break;
      
    case 'deal_search':
      systemPrompt += `
      
You're helping the user find travel deals. Be specific and actionable.
• Make educated guesses about budget and preferences if not stated
• Suggest specific destinations that might have good deals 
• Recommend booking strategies without demanding more details`;
      break;
      
    case 'widget_usage':
      systemPrompt += `
      
You're helping the user with travel tools like currency conversion, packing lists, etc.
• Be direct and practical
• Present data clearly
• Use conversational language, not technical jargon
• If information is missing, make reasonable assumptions rather than asking questions`;
      break;
      
    case 'booking':
      systemPrompt += `
      
You're helping the user book travel. Be clear and concise.
• Work with whatever details the user has already provided
• Only ask for truly essential details if missing (dates, destination)
• Explain the booking process briefly
• Set realistic expectations`;
      break;
      
    case 'trip_management':
      systemPrompt += `
      
You're helping the user manage an existing trip. Be reassuring and practical.
• Respond to their specific concerns
• Suggest concrete solutions
• Use a helpful, supportive tone
• Don't ask for information they haven't voluntarily shared`;
      break;
      
    case 'general_question':
    default:
      systemPrompt += `
      
You're answering a general travel question. Be informative but conversational.
• Provide accurate, concise information
• Add personal touches (like a brief anecdote if relevant)
• Avoid asking unnecessary follow-up questions`;
      break;
  }
  
  // Add any context-specific data to the system prompt
  if (Object.keys(contextData).length > 0) {
    systemPrompt += `\n\nCONTEXT INFORMATION (reference this when relevant):\n`;
    
    Object.entries(contextData).forEach(([key, value]) => {
      if (value) {
        systemPrompt += `• ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}\n`;
      }
    });
  }
  
  // Generate response using Perplexity API
  // Make sure we're using recent conversation history and in the right order (oldest to newest)
  const orderedHistory = [...conversationHistory]
    .filter(msg => msg.timestamp) // Filter messages with timestamp
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Sort by timestamp

  // Take only the system messages and the last few non-system messages to prevent confusion
  const systemMessages = conversationHistory.filter(msg => msg.role === 'system');
  const recentMessages = orderedHistory
    .filter(msg => msg.role !== 'system')
    .slice(-7); // Limit to last 7 messages to avoid confusion
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...systemMessages,
    ...recentMessages
  ];
  
  const result = await callPerplexityAPI(messages, "I'm having trouble right now. Let's try again in a moment.");
  
  // Check if the response contains message split markers
  if (result.content.includes('[SPLIT MESSAGE HERE]')) {
    // Split into multiple messages
    const messageArray = result.content.split('[SPLIT MESSAGE HERE]').map(msg => msg.trim());
    
    // Determine appropriate context type
    let contextType = 'general';
    if (userIntent === 'widget_usage') {
      contextType = 'widget_response';
    } else if (result.content.includes('step by step') || 
               result.content.includes('Here are the details') ||
               result.content.length > 1500) {
      contextType = 'detailed_explanation';
    }
    
    // Return object with multiple messages
    return {
      messages: messageArray,
      contextType: contextType
    };
  }
  
  // For responses without explicit splits, return the regular string response
  return result.content;
}

/**
 * Handle general travel questions
 */
async function handleGeneralQuestion(user, messageText, conversationHistory) {
  try {
    // Determine if this question deserves a more elaborate response
    const isDetailedQuestion = messageText.length > 50 || 
                               messageText.includes("explain") ||
                               messageText.includes("details") ||
                               messageText.includes("how to") ||
                               messageText.includes("steps") ||
                               messageText.includes("guide");
    
    // Check if the question might warrant a more relaxed, multi-message response
    const isConversationalTopic = messageText.includes("favorite") ||
                                  messageText.includes("best place") ||
                                  messageText.includes("recommend") ||
                                  messageText.includes("suggestion") ||
                                  messageText.includes("opinion") ||
                                  messageText.toLowerCase().includes("what do you think");
    
    // Generate appropriate contextData
    const contextData = {
      isDetailedQuestion: isDetailedQuestion,
      isConversationalTopic: isConversationalTopic,
      // Add any user profile data that might be relevant
      userName: user.name || "there",
      previousDestinations: user.recentTrips?.map(trip => trip.destination).slice(0, 3) || []
    };
    
    // Generate a response based on the user's question
    const response = await generateResponse(
      user, 
      messageText, 
      conversationHistory, 
      'general_question',
      contextData
    );
    
    return response;
  } catch (error) {
    console.error('Error handling general question:', error);
    return "I'm having trouble answering that question right now. Let's try something else?";
  }
}

function extractBookingDetails(messageText) {
  const bookingDetails = {
    type: null,
    specifics: {}
  };
  
  const lowerText = messageText.toLowerCase();
  
  // Try to determine booking type
  if (lowerText.includes('flight') || lowerText.includes('fly') || lowerText.includes('plane')) {
    bookingDetails.type = 'flight';
    
    // Try to extract flight-specific details like origin and destination
    const fromToPattern = /from\s+([a-zA-Z\s]+)\s+to\s+([a-zA-Z\s]+)/i;
    const fromToMatch = messageText.match(fromToPattern);
    
    if (fromToMatch) {
      bookingDetails.specifics.origin = fromToMatch[1].trim();
      bookingDetails.specifics.destination = fromToMatch[2].trim();
    } else {
      // Try to extract just destination
      const destinations = extractDestinations(messageText);
      if (destinations.length > 0) {
        bookingDetails.specifics.destination = destinations[0];
      }
    }
  } else if (lowerText.includes('hotel') || lowerText.includes('stay') || lowerText.includes('room') || lowerText.includes('accommodation')) {
    bookingDetails.type = 'hotel';
    
    // Try to extract hotel-specific details
    const destinations = extractDestinations(messageText);
    if (destinations.length > 0) {
      bookingDetails.specifics.location = destinations[0];
    }
    
    // Try to extract room type and number of guests
    const roomPattern = /(\d+)\s+(?:room|bedroom)/i;
    const roomMatch = messageText.match(roomPattern);
    if (roomMatch) {
      bookingDetails.specifics.rooms = parseInt(roomMatch[1]);
    }
    
    const guestPattern = /(\d+)\s+(?:guest|person|people|adult|child)/i;
    const guestMatch = messageText.match(guestPattern);
    if (guestMatch) {
      bookingDetails.specifics.guests = parseInt(guestMatch[1]);
    }
  } else if (lowerText.includes('car') || lowerText.includes('rental') || lowerText.includes('vehicle')) {
    bookingDetails.type = 'car';
    
    // Try to extract car rental specific details
    const destinations = extractDestinations(messageText);
    if (destinations.length > 0) {
      bookingDetails.specifics.pickupLocation = destinations[0];
    }
    
    // Try to extract car type
    if (lowerText.includes('suv')) {
      bookingDetails.specifics.carType = 'SUV';
    } else if (lowerText.includes('sedan')) {
      bookingDetails.specifics.carType = 'Sedan';
    } else if (lowerText.includes('compact')) {
      bookingDetails.specifics.carType = 'Compact';
    } else if (lowerText.includes('luxury')) {
      bookingDetails.specifics.carType = 'Luxury';
    }
  } else if (lowerText.includes('package') || (lowerText.includes('flight') && (lowerText.includes('hotel') || lowerText.includes('stay')))) {
    bookingDetails.type = 'package';
    
    // Try to extract package details
    const destinations = extractDestinations(messageText);
    if (destinations.length > 0) {
      bookingDetails.specifics.destination = destinations[0];
    }
    
    // Try to extract number of travelers
    const travelerPattern = /(\d+)\s+(?:traveler|person|people|passenger)/i;
    const travelerMatch = messageText.match(travelerPattern);
    if (travelerMatch) {
      bookingDetails.specifics.travelers = parseInt(travelerMatch[1]);
    }
  } else {
    bookingDetails.type = 'unknown';
  }
  
  // Extract dates for any booking type
  bookingDetails.specifics.dates = extractDates(messageText);
  
  return bookingDetails;
}

/**
 * Send a WhatsApp message to a specific phone number
 */
async function sendMessage(req, res) {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({ 
        success: false, 
        message: "Phone number and message are required" 
      });
    }
    
    // Send message via Twilio
    const response = await twilioClient.sendWhatsAppMessage(phoneNumber, message);
    
    // Find the user to update their conversation history
    let user = await UserModel.findOne({ phoneNumber });
    
    if (user && user.whatsapp) {
      // Add the message to the conversation history
      if (!user.whatsapp.conversationHistory) {
        user.whatsapp.conversationHistory = [];
      }
      
      user.whatsapp.conversationHistory.push({
        role: 'assistant',
        content: message,
        timestamp: new Date(),
        messageId: response.sid // Store Twilio message ID for reference
      });
      
      // Update last activity
      user.whatsapp.lastActivity = new Date();
      
      // Save the updated user
      await user.save();
    }
    
    return res.status(200).json({ 
      success: true, 
      message: "Message sent successfully",
      messageId: response.sid
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to send message",
      error: error.message
    });
  }
}

/**
 * Handle message status callbacks from Twilio
 */
async function handleStatusCallback(req, res) {
  try {
    // Extract message status details from Twilio webhook payload
    const { MessageSid, MessageStatus, To } = req.body;
    
    // Log the status update
    console.log(`Message ${MessageSid} to ${To} status: ${MessageStatus}`);
    
    // Format phone number (remove 'whatsapp:' prefix from Twilio format)
    const phoneNumber = To.replace('whatsapp:', '');
    
    // Find the user 
    const user = await UserModel.findOne({ phoneNumber });
    
    if (user && user.whatsapp && user.whatsapp.conversationHistory) {
      // Find the message in conversation history
      const messageIndex = user.whatsapp.conversationHistory.findIndex(
        msg => msg.messageId === MessageSid
      );
      
      if (messageIndex !== -1) {
        // Update message status
        user.whatsapp.conversationHistory[messageIndex].status = MessageStatus;
        
        // Add timestamp for status update
        user.whatsapp.conversationHistory[messageIndex].statusUpdatedAt = new Date();
        
        // Save the updated user
        await user.save();
      }
    }
    
    // Always respond with success to Twilio
    res.status(200).send();
  } catch (error) {
    console.error('Error handling message status callback:', error);
    // Still respond with success to Twilio even if there's an error
    res.status(200).send();
  }
}

/**
 * Extract search parameters from message text
 */
function extractSearchParameters(messageText) {
  const searchParams = {
    budget: null,
    dateRange: null,
    travelers: null,
    preferences: []
  };
  
  const lowerText = messageText.toLowerCase();
  
  // Extract budget information
  const budgetPattern = /(\$|rs\.?|inr|usd|eur|gbp)?\s*(\d+[,\d]*)\s*(\$|rs\.?|inr|usd|eur|gbp)?/i;
  const budgetMatch = messageText.match(budgetPattern);
  
  if (budgetMatch) {
    // Determine currency
    let currency = 'INR'; // Default to INR
    if (budgetMatch[1]) {
      const currSymbol = budgetMatch[1].toLowerCase();
      if (currSymbol === '$' || currSymbol === 'usd') currency = 'USD';
      else if (currSymbol === 'eur') currency = 'EUR';
      else if (currSymbol === 'gbp') currency = 'GBP';
    } else if (budgetMatch[3]) {
      const currSymbol = budgetMatch[3].toLowerCase();
      if (currSymbol === '$' || currSymbol === 'usd') currency = 'USD';
      else if (currSymbol === 'eur') currency = 'EUR';
      else if (currSymbol === 'gbp') currency = 'GBP';
    }
    
    // Parse amount
    const amount = parseInt(budgetMatch[2].replace(/,/g, ''));
    
    searchParams.budget = {
      amount,
      currency
    };
  }
  
  // Extract traveler count
  const travelerPattern = /(\d+)\s+(?:adult|person|people|travell?er|passenger|guest)/i;
  const travelerMatch = messageText.match(travelerPattern);
  
  if (travelerMatch) {
    searchParams.travelers = parseInt(travelerMatch[1]);
  }
  
  // Extract preferences based on keywords
  const preferenceKeywords = {
    'luxury': 'Luxury',
    'budget': 'Budget',
    'family': 'Family-friendly',
    'beach': 'Beach',
    'mountain': 'Mountain',
    'city': 'City',
    'adventure': 'Adventure',
    'relax': 'Relaxation',
    'culture': 'Cultural',
    'food': 'Culinary',
    'nightlife': 'Nightlife',
    'romantic': 'Romantic',
    'shopping': 'Shopping',
    'spa': 'Spa & Wellness',
    'historic': 'Historical',
    'nature': 'Nature',
    'wildlife': 'Wildlife',
    'resort': 'Resort',
    'hotel': 'Hotel',
    'hostel': 'Hostel',
    'apartment': 'Apartment',
    'villa': 'Villa'
  };
  
  for (const [keyword, preference] of Object.entries(preferenceKeywords)) {
    if (lowerText.includes(keyword)) {
      searchParams.preferences.push(preference);
    }
  }
  
  // Extract dates
  const dates = extractDates(messageText);
  if (dates && dates.length > 0) {
    searchParams.dateRange = dates;
  }
  
  return searchParams;
}

/**
 * Extract potential destinations from message text
 */
function extractDestinations(messageText) {
  const destinations = [];
  
  // Common prepositions that might precede a location
  const prepositions = ['to', 'in', 'at', 'for', 'from'];
  
  // Try to extract destinations with prepositions
  for (const prep of prepositions) {
    const regex = new RegExp(`${prep}\\s+([A-Z][a-zA-Z\\s,]+?)(?:\\s+${prepositions.join('|\\s+')}|\\.|,|$)`, 'g');
    let match;
    
    while ((match = regex.exec(messageText)) !== null) {
      const destination = match[1].trim();
      
      // Skip very short destinations (likely false positives)
      if (destination.length > 2 && !destinations.includes(destination)) {
        destinations.push(destination);
      }
    }
  }
  
  // If that didn't work, try to identify capitalized location names
  if (destinations.length === 0) {
    const capitalizedPattern = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/g;
    let match;
    
    while ((match = capitalizedPattern.exec(messageText)) !== null) {
      const potentialDestination = match[1].trim();
      
      // Skip known non-destination capitalized words
      const nonDestinations = ['I', 'WhatsApp', 'SMS', 'AI', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      
      if (!nonDestinations.includes(potentialDestination) && 
          potentialDestination.length > 2 && 
          !destinations.includes(potentialDestination)) {
        destinations.push(potentialDestination);
      }
    }
  }
  
  return destinations;
}

/**
 * Extract dates from message text
 */
function extractDates(messageText) {
  const dates = [];
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
                  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];
  
  // Pattern for dates like "January 15" or "15th of January" or "15 Jan"
  const namedMonthPattern = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${months.join('|')})\\b|\\b(${months.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    'gi'
  );
  
  let match;
  while ((match = namedMonthPattern.exec(messageText)) !== null) {
    let day, month;
    if (match[1] && match[2]) {
      // Format: "15 January"
      day = parseInt(match[1]);
      month = months.findIndex(m => m === match[2].toLowerCase()) % 12;
    } else if (match[3] && match[4]) {
      // Format: "January 15"
      day = parseInt(match[4]);
      month = months.findIndex(m => m === match[3].toLowerCase()) % 12;
    }
    
    if (day && month >= 0) {
      const currentYear = new Date().getFullYear();
      const date = new Date(currentYear, month, day);
      
      // If the date is in the past, assume next year
      if (date < new Date()) {
        date.setFullYear(currentYear + 1);
      }
      
      dates.push(date.toISOString().split('T')[0]); // Format as YYYY-MM-DD
    }
  }
  
  // Pattern for date ranges with named months
  const dateRangePattern = new RegExp(
    `\\b(${months.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to|until|through)\\s*(${months.join('|')})?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    'gi'
  );
  
  while ((match = dateRangePattern.exec(messageText)) !== null) {
    const startMonth = months.findIndex(m => m === match[1].toLowerCase()) % 12;
    const startDay = parseInt(match[2]);
    
    // End month might be the same as start month
    const endMonth = match[3] ? months.findIndex(m => m === match[3].toLowerCase()) % 12 : startMonth;
    const endDay = parseInt(match[4]);
    
    if (startDay && endDay && startMonth >= 0 && endMonth >= 0) {
      const currentYear = new Date().getFullYear();
      const startDate = new Date(currentYear, startMonth, startDay);
      const endDate = new Date(currentYear, endMonth, endDay);
      
      // If both dates are in the past, assume next year
      if (startDate < new Date() && endDate < new Date()) {
        startDate.setFullYear(currentYear + 1);
        endDate.setFullYear(currentYear + 1);
      }
      
      dates.push(startDate.toISOString().split('T')[0]); // Start date
      dates.push(endDate.toISOString().split('T')[0]);   // End date
    }
  }
  
  // Pattern for dates like "MM/DD" or "MM-DD"
  const slashPattern = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/g;
  
  while ((match = slashPattern.exec(messageText)) !== null) {
    let month = parseInt(match[1]) - 1; // JavaScript months are 0-indexed
    let day = parseInt(match[2]);
    
    // Handle both MM/DD and DD/MM formats based on range
    if (month > 11) {
      // If "month" is > 11, it's probably a day, so swap
      [month, day] = [day - 1, month];
    }
    
    // Only proceed if the values make sense
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      let year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
      
      // Handle 2-digit years
      if (year < 100) {
        year += year < 50 ? 2000 : 1900;
      }
      
      const date = new Date(year, month, day);
      
      // If the date is in the past, assume next year unless the year was explicitly specified
      if (date < new Date() && !match[3]) {
        date.setFullYear(year + 1);
      }
      
      dates.push(date.toISOString().split('T')[0]); // Format as YYYY-MM-DD
    }
  }
  
  return dates;
}

/**
 * Identify which type of widget the user is trying to use
 */
function identifyWidgetType(messageText) {
  const lowerText = messageText.toLowerCase();
  
  // Define patterns for different widget types
  const patterns = {
    'weather': [
      /weather/i,
      /temperature/i,
      /forecast/i,
      /(?:sunny|rainy|cloudy|rain|snow|humidity)/i,
      /climate/i
    ],
    
    'flights': [
      /flight/i,
      /fly(?:ing)?/i,
      /(?:plane|airplane|aircraft)/i,
      /airport/i,
      /airline/i,
      /book\s+(?:a\s+)?(?:flight|ticket)/i
    ],
    
    'accommodations': [
      /hotel/i,
      /(?:book|find|reserve)\s+(?:a\s+)?(?:room|hotel|accommodation)/i,
      /place\s+to\s+stay/i,
      /(?:hostel|airbnb|resort|lodging)/i,
      /accommodation/i
    ],
    
    'tripManagement': [
      /(?:change|modify|cancel|update|view)\s+(?:my\s+)?(?:trip|booking|reservation|itinerary)/i,
      /(?:status|details|information)\s+(?:of|about|for)\s+(?:my\s+)?(?:trip|booking|reservation)/i,
      /(?:manage|reschedule)\s+(?:my\s+)?(?:trip|booking|reservation)/i
    ],
    
    'recommendations': [
      /recommend/i,
      /suggestion/i,
      /what.s\s+(?:good|nice|best)\s+(?:to\s+do|to\s+see|attraction)/i,
      /(?:popular|top)\s+(?:attraction|place|sight|destination)/i,
      /things\s+to\s+do/i
    ],
    
    'itinerary': [
      /(?:create|make|plan|design)\s+(?:a|an)\s+(?:itinerary|schedule|plan)/i,
      /itinerary/i,
      /day(?:\s+by\s+day|wise)\s+plan/i,
      /travel\s+plan/i
    ]
  };
  
  // Check each pattern
  for (const [type, typePatterns] of Object.entries(patterns)) {
    for (const pattern of typePatterns) {
      if (pattern.test(lowerText)) {
        return type;
      }
    }
  }
  
  // Check for currency conversion
  const currencyPattern = /(\d+(?:\.\d+)?)\s*([a-zA-Z]{3})\s*(?:to|in)\s*([a-zA-Z]{3})/i;
  if (currencyPattern.test(lowerText) || 
      lowerText.includes("currency") || 
      lowerText.includes("exchange rate") || 
      lowerText.includes("convert money")) {
    return 'currency';
  }
  
  // Check for packing lists
  const packingPattern = /(?:packing|pack list|what (?:should|to) pack|packing list)/i;
  if (packingPattern.test(lowerText)) {
    return 'packing';
  }
  
  // Default to weather if no pattern matches (most common widget)
  return 'general';
}

/**
 * Analyze user message to determine their intent
 * @param {string} messageText - The message from the user
 * @param {Array} conversationHistory - User's conversation history
 * @returns {Promise<string>} The detected user intent
 */
async function analyzeUserIntent(messageText, conversationHistory) {
  try {
    const lowerMessage = messageText.toLowerCase();
    
    // Check for high-confidence indicators of widget usage
    // These are very clear patterns that almost certainly indicate widget usage
    if (lowerMessage.includes('widget') || 
        lowerMessage.includes('tool') || 
        lowerMessage.includes('utility') ||
        lowerMessage.includes('what can you do') ||
        lowerMessage.includes('what tools') ||
        lowerMessage.includes('what widgets')) {
      return 'widget_usage';
    }
    
    // Check for specific widget patterns with very high confidence
    // Currency conversion pattern
    const currencyPattern = /(\d+(?:\.\d+)?)\s*([a-zA-Z]{3})\s*(?:to|in)\s*([a-zA-Z]{3})/i;
    if (currencyPattern.test(lowerMessage) || 
        lowerMessage.includes("currency") || 
        lowerMessage.includes("exchange rate") || 
        lowerMessage.includes("convert money")) {
      return 'widget_usage';
    }
    
    // Packing list pattern
    const packingPattern = /(?:packing|pack list|what (?:should|to) pack|packing list)/i;
    if (packingPattern.test(lowerMessage)) {
      return 'widget_usage';
    }
    
    // Weather pattern
    const weatherPattern = /(?:weather|temperature|forecast|rain|sunny|humidity|how hot|how cold)/i;
    if (weatherPattern.test(lowerMessage)) {
      return 'widget_usage';
    }
    
    // Travel phrases pattern
    const phrasesPattern = /(?:phrases|translate|say in|language|how to say)/i;
    if (phrasesPattern.test(lowerMessage)) {
      return 'widget_usage';
    }
    
    // Emergency contacts pattern
    const emergencyPattern = /(?:emergency|contacts|help line|embassy|consulate)/i;
    if (emergencyPattern.test(lowerMessage)) {
      return 'widget_usage';
    }
    
    // Trip planning indicators
    const tripPlanningPatterns = [
      /(?:plan|planning)\s+(?:a|my)\s+trip/i,
      /(?:vacation|holiday|getaway)\s+(?:to|in|at)/i,
      /(?:visit|visiting|go to|travel to)\s+[A-Z][a-z]+/i,
      /itinerary/i,
      /things\s+to\s+do\s+in/i,
      /places\s+to\s+(?:visit|see)/i,
      /trip\s+to/i,
      /travel\s+(?:plan|planning|to)/i
    ];
    if (tripPlanningPatterns.some(pattern => pattern.test(messageText))) {
      return 'trip_planning';
    }
    
    // Deal search indicators
    const dealSearchPatterns = [
      /(?:deal|discount|offer|cheap|affordable|budget)/i,
      /best\s+(?:price|rate|deal)/i,
      /(?:find|search for|looking for)\s+(?:a)?\s+(?:cheap|affordable)/i,
      /(?:save|saving)\s+money/i,
      /(?:last minute|flash|special)\s+(?:deal|offer)/i,
      /price\s+(?:drop|alert|comparison)/i
    ];
    if (dealSearchPatterns.some(pattern => pattern.test(messageText))) {
      return 'deal_search';
    }
    
    // Booking indicators
    const bookingPatterns = [
      /(?:book|booking|reserve|reservation)/i,
      /(?:buy|purchase)\s+(?:ticket|flight|room)/i,
      /(?:hotel|flight|car rental|accommodation)\s+(?:booking|reservation)/i,
      /make\s+(?:a)?\s+(?:reservation|booking)/i
    ];
    if (bookingPatterns.some(pattern => pattern.test(messageText))) {
      return 'booking';
    }
    
    // Trip management indicators
    const tripManagementPatterns = [
      /(?:change|modify|cancel|update|view)\s+(?:my)?\s+(?:trip|booking|reservation|itinerary)/i,
      /(?:status|detail|information)\s+(?:of|about|for)\s+(?:my)?\s+(?:trip|booking|reservation)/i,
      /(?:manage|reschedule)\s+(?:my)?\s+(?:trip|booking|reservation)/i,
      /(?:what|where)\s+(?:is|are)\s+(?:my)\s+(?:trip|booking|reservation|flight|hotel)/i
    ];
    if (tripManagementPatterns.some(pattern => pattern.test(messageText))) {
      return 'trip_management';
    }
    
    // If we can't determine a specific intent through patterns, use Perplexity API for more advanced analysis
    // We'll prepare a prompt to analyze the user intent with deeper context awareness
    const systemPrompt = `You are a travel assistant analyzing user queries to determine their intent. Categorize the query into one of these intents:
1. trip_planning - User wants to plan a new trip or explore destinations
2. deal_search - User is looking for deals, discounts, or affordable options
3. widget_usage - User wants to use a specific travel tool/widget like currency converter, weather, packing list, etc.
4. booking - User wants to book or reserve something like flights, hotels, cars
5. trip_management - User wants to manage an existing booking or get details about their trip
6. general_question - For general travel questions that don't fit the above categories

Respond with ONLY one of these category names, no explanation.`;
    
    // Create messages array with enough context
    const messages = [
      { role: 'system', content: systemPrompt }
    ];
    
    // Sort conversation history by timestamp if available
    let sortedHistory = [...conversationHistory];
    if (sortedHistory.length > 0 && sortedHistory[0].timestamp) {
      sortedHistory = sortedHistory.sort((a, b) => {
        return new Date(a.timestamp || 0) - new Date(b.timestamp || 0);
      });
    }
    
    // Add recent conversation history for context (up to 3 most recent non-system messages)
    const recentMessages = sortedHistory
      .filter(msg => msg.role !== 'system')
      .slice(-3);
    
    messages.push(...recentMessages);
    
    // Add the current message if it's not already included
    if (recentMessages.length === 0 || 
        recentMessages[recentMessages.length - 1].content !== messageText) {
      messages.push({ role: 'user', content: messageText });
    }
    
    // Call Perplexity API to analyze intent
    const result = await callPerplexityAPI(messages, "general_question");
    
    // Extract the intent from the response
    const intent = result.content.trim().toLowerCase();
    
    // Validate the returned intent is one we expect
    const validIntents = ['trip_planning', 'deal_search', 'widget_usage', 'booking', 'trip_management', 'general_question'];
    
    if (validIntents.includes(intent)) {
      return intent;
    }
    
    // Default to general question if we get an unexpected response
    return 'general_question';
  } catch (error) {
    console.error('Error analyzing user intent:', error);
    // Default to general question if there's an error
    return 'general_question';
  }
}

module.exports = {
  handleIncomingMessage,
  verifyWhatsappNumber,
  sendOtp,
  getConversationHistory,
  sendMessage,
  handleStatusCallback,
  processMessage,
  splitLongMessage,
  updateConversationState,
  extractDestinations,
  extractDates,
  extractSearchParameters,
  identifyWidgetType,
  extractBookingDetails,
  extractTripDetails,
  processWidgetRequest,
  handleWidgetRequest,
  isSimpleGreeting,
  shouldRefreshContext,
  generateReturningUserGreeting,
  analyzeUserIntent
}; 