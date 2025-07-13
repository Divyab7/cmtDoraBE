const twilio = require('twilio');

// Initialize Twilio client with environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // Default Twilio sandbox number

// Create Twilio client
const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Send a WhatsApp message using Twilio
 * @param {string} to - Recipient phone number (with country code, e.g., +919876543210)
 * @param {string} message - Message content
 * @returns {Promise} - Twilio message response
 */
async function sendWhatsAppMessage(to, message) {
  if (!client) {
    throw new Error('Twilio client not initialized. Check your environment variables.');
  }

  // Format the 'to' number for WhatsApp
  const toWhatsApp = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  try {
    // Send message via Twilio
    const response = await client.messages.create({
      body: message,
      from: fromNumber,
      to: toWhatsApp
    });

    return response;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
}

/**
 * Get a TwiML object for responding to WhatsApp messages
 * @returns {Object} - TwiML MessagingResponse object
 */
function getTwiml() {
  const MessagingResponse = twilio.twiml.MessagingResponse;
  return new MessagingResponse();
}

module.exports = {
  client,
  sendWhatsAppMessage,
  getTwiml
}; 