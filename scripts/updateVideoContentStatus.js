const VideoContent = require('../models/VideoContent');

/**
 * Script to update all videoContent documents by adding a status field if missing
 * Sets status to 'deep' for instaReels and 'basic' for all other content types
 */
async function updateVideoContentStatus() {
  try {
    console.log('Starting videoContent status update...');
    
    // Find all videoContent documents
    const videoContents = await VideoContent.find();
    console.log(`Found ${videoContents.length} videoContent documents to process`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    // Process each document
    for (const content of videoContents) {
      // Determine the status value based on content type
      const newStatus = content.contentType === 'instaReels' ? 'deep' : 'basic';
      
      // Check if status needs to be updated (if it's missing or null)
      if (!content.status) {
        content.status = newStatus;
        await content.save();
        updatedCount++;
        console.log(`Updated document ID: ${content._id}, type: ${content.contentType}, new status: ${newStatus}`);
      } else {
        skippedCount++;
        console.log(`Skipped document ID: ${content._id} - already has status: ${content.status}`);
      }
    }
    
    console.log('Update completed successfully!');
    console.log(`Updated: ${updatedCount} documents`);
    console.log(`Skipped: ${skippedCount} documents (already had status field)`);
    
  } catch (error) {
    console.error('Error updating videoContent status:', error);
  }
}

module.exports = {
  updateVideoContentStatus,
}; 