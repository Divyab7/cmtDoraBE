const { Expo } = require('expo-server-sdk');

/**
 * Utility function to send push notifications using Expo's push notification service
 * @param {Array} messages - Array of message objects to be sent
 * @returns {Object} - Object containing successful and failed message IDs
 */
async function sendPushNotifications(messages) {
  // Create a new Expo SDK client
  const expo = new Expo();
  
  // Filter out invalid Expo push tokens
  const validMessages = messages.filter(message => {
    if (!Expo.isExpoPushToken(message.to)) {
      console.error(`Invalid Expo push token: ${message.to}`);
      return false;
    }
    return true;
  });

  // Chunk the messages to avoid exceeding Expo's limit
  const chunks = expo.chunkPushNotifications(validMessages);
  
  // Send the chunks to the Expo push notification service
  const tickets = [];
  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('Error sending push notification chunk:', error);
    }
  }

  // Process the tickets to check for errors
  const receiptIds = [];
  const failedMessages = [];

  tickets.forEach((ticket, index) => {
    if (ticket.status === 'ok') {
      receiptIds.push(ticket.id);
    } else {
      failedMessages.push({
        token: validMessages[index].to,
        error: ticket.details?.error || 'unknown error',
        message: validMessages[index]
      });
    }
  });

  // If there are receipt IDs, check their status later
  let receipts = {};
  if (receiptIds.length > 0) {
    const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
    for (const chunk of receiptIdChunks) {
      try {
        const receiptChunk = await expo.getPushNotificationReceiptsAsync(chunk);
        receipts = { ...receipts, ...receiptChunk };
      } catch (error) {
        console.error('Error getting push notification receipts:', error);
      }
    }
  }

  // Process receipts to identify delivery issues
  const receiptErrors = [];
  for (const [receiptId, receipt] of Object.entries(receipts)) {
    if (receipt.status === 'error') {
      receiptErrors.push({
        receiptId,
        error: receipt.details?.error || 'unknown error'
      });
    }
  }

  return {
    successful: receiptIds.length,
    failed: failedMessages,
    receiptErrors
  };
}

module.exports = {
  sendPushNotifications
}; 