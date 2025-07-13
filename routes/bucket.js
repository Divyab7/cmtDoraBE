// routes/profile.js

const express = require('express');
const router = express.Router();
const { 
    saveBucket, 
    updateBucketStatus, 
    getCountriesBucketSummary,
    getCountryBucketDetails,
    getStateBucketDetails,
    getUserSavedContent,
    getContentDetailsById
} = require('../controllers/bucketController');
const GamificationService = require('../services/gamificationService');

// Get summary of all countries with bucket counts
router.get('/countries', getCountriesBucketSummary);

// Get detailed bucket information for a specific country
router.get('/countries/:countryId', getCountryBucketDetails);

// Get detailed bucket information for a specific state
router.get('/states/:stateId', getStateBucketDetails);

/**
 * @route GET /bucket/content
 * @description Get all content saved by a user in their bucket list with pagination. Results are sorted by creation date (newest first).
 * @access Private
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Number of items per page (default: 10)
 * @param {boolean} skipMetadata - Skip fetching external metadata for faster response (default: false)
 * @param {number} maxConcurrentRequests - Limit concurrent external metadata requests (default: 3)
 * @param {string} contentType - Filter content by type (ytShorts, instaReels, tikTok, blog, doraAI, etc.)
 * @returns {Object} Content items with pagination info
 */
router.get('/content', getUserSavedContent);

/**
 * @route GET /bucket/content/:contentId
 * @description Get details of a specific content item by ID, including all the user's buckets associated with it
 * @access Private
 * @returns {Object} Content details with all associated bucket items
 */
router.get('/content/:contentId', getContentDetailsById);

// Save bucket items with gamification
router.post('/', async (req, res) => {
    try {
        // Extract content type and items
        const { selectedItems, contentType = 'manual' } = req.body;

        // Validate content type
        const validContentTypes = ['manual', 'ytShorts', 'instaReels', 'doraAI', 'blog'];
        if (!validContentTypes.includes(contentType)) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid content type' 
            });
        }

        // First save the bucket items
        const bucketResult = await saveBucket(req, res);
        if (!bucketResult.success) {
            return res.status(400).json({result: "success"});
        }

        // Trigger gamification event
        const gamificationResult = await GamificationService.processEvent(req.user.id, 'bucket_list_add', {
            items: selectedItems,
            count: selectedItems.length,
            contentType,
            timestamp: new Date()
        });

        return res.status(200).json({
            success: true,
            message: 'Bucket items saved successfully',
            data: bucketResult.data,
            gamification: gamificationResult
        });

    } catch (error) {
        console.error('Error in bucket save with gamification:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
});

// Update bucket status with gamification
router.put('/status', async (req, res) => {
    try {
        const { bucketId, status, contentType = 'manual' } = req.body;

        // First update the status
        const updateResult = await updateBucketStatus(req, res);
        if (!updateResult.success) {
            return res.status(400).json(updateResult);
        }

        // Only trigger gamification for completion
        if (status === 'done') {
            await GamificationService.processEvent(req.user.id, 'bucket_list_complete', {
                itemId: bucketId,
                contentType,
                timestamp: new Date()
            });

            return res.status(200).json({result: "success"});
        }

        return res.status(200).json({result: "success"});

    } catch (error) {
        console.error('Error in bucket status update with gamification:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
});

module.exports = router;
  