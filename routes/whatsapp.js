const express = require("express");
const router = express.Router();
const whatsappController = require("../controllers/whatsappController");

// Twilio webhook for incoming WhatsApp messages
router.post("/webhook", whatsappController.handleIncomingMessage);

// Route to verify WhatsApp number and link to existing app account
router.post("/verify", whatsappController.verifyWhatsappNumber);

// Route to send OTP for verification
router.post("/send-otp", whatsappController.sendOtp);

// Route to get conversation history for a WhatsApp user
router.get("/conversation/:phoneNumber", whatsappController.getConversationHistory);

// Route to manually send a message to a WhatsApp user
router.post("/send-message", whatsappController.sendMessage);

// Add this route to handle message status callbacks
router.post("/status", whatsappController.handleStatusCallback);

module.exports = router; 