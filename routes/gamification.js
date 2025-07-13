const express = require('express');
const router = express.Router();
const { Rule, Badge, Campaign, UserProgress } = require('../models/Gamification');
const GamificationService = require('../services/gamificationService');
const { verifyAdminToken } = require('../middleware/adminAuth');
const { mustRequiredLogin, deviceInfo } = require('../middleware/requiredLogin');

// User Profile Routes
router.get('/profile', mustRequiredLogin, deviceInfo, async (req, res) => {
    try {
        const profile = await GamificationService.getUserProfile(req.user.id);
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }
        res.json(profile);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Leaderboard Routes
router.get('/leaderboard', async (req, res) => {
    try {
        const { timeframe = 'all', limit = 10 } = req.query;
        const leaderboard = await GamificationService.getLeaderboard(timeframe, parseInt(limit));
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Rule Management Routes (Admin only)
router.post('/rules', verifyAdminToken, async (req, res) => {
    try {
        const rule = new Rule(req.body);
        await rule.save();
        res.status(201).json(rule);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.get('/rules', async (req, res) => {
    try {
        const rules = await Rule.find().populate('rewards.badgeId');
        res.json(rules);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/rules/:id', verifyAdminToken, async (req, res) => {
    try {
        const rule = await Rule.findById(req.params.id).populate('rewards.badgeId');
        if (!rule) {
            return res.status(404).json({ message: 'Rule not found' });
        }
        res.json(rule);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.patch('/rules/:id', verifyAdminToken, async (req, res) => {
    try {
        const rule = await Rule.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!rule) {
            return res.status(404).json({ message: 'Rule not found' });
        }
        res.json(rule);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Badge Management Routes (Admin only)
router.post('/badges', verifyAdminToken, async (req, res) => {
    try {
        const badge = new Badge(req.body);
        await badge.save();
        res.status(201).json(badge);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.get('/badges', async (req, res) => {
    try {
        const badges = await Badge.find({ isActive: true });
        res.json(badges);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/badges/:id', async (req, res) => {
    try {
        const badge = await Badge.findOne({ _id: req.params.id, isActive: true });
        if (!badge) {
            return res.status(404).json({ message: 'Badge not found' });
        }
        res.json(badge);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.patch('/badges/:id', verifyAdminToken, async (req, res) => {
    try {
        const badge = await Badge.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!badge) {
            return res.status(404).json({ message: 'Badge not found' });
        }
        res.json(badge);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Campaign Management Routes (Admin only)
router.post('/campaigns', verifyAdminToken, async (req, res) => {
    try {
        const campaign = new Campaign(req.body);
        await campaign.save();
        res.status(201).json(campaign);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.get('/campaigns', async (req, res) => {
    try {
        const { active } = req.query;
        const query = {};
        
        if (active === 'true') {
            query.startDate = { $lte: new Date() };
            query.endDate = { $gte: new Date() };
            query.isActive = true;
        }
        
        const campaigns = await Campaign.find(query)
            .populate('partnerId')
            .populate('rules')
            .populate('rewards.badges');
            
        res.json(campaigns);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/campaigns/:id', async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id)
            .populate('partnerId')
            .populate('rules')
            .populate('rewards.badges');
        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        res.json(campaign);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.patch('/campaigns/:id', verifyAdminToken, async (req, res) => {
    try {
        const campaign = await Campaign.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        res.json(campaign);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Points Redemption Routes
router.post('/redeem', mustRequiredLogin, deviceInfo, async (req, res) => {
    try {
        const { dealId, points } = req.body;
        const userProgress = await UserProgress.findOne({ userId: req.user.id });
        
        if (!userProgress) {
            return res.status(404).json({ message: 'User progress not found' });
        }
        
        if (userProgress.points < points) {
            return res.status(400).json({ message: 'Insufficient points' });
        }
        
        // Deduct points and save
        userProgress.points -= points;
        userProgress.eventHistory.push({
            eventType: 'points_redemption',
            points: -points,
            details: { dealId }
        });
        
        await userProgress.save();
        
        res.json({
            message: 'Points redeemed successfully',
            remainingPoints: userProgress.points
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Coupon code to badge mapping
const COUPON_BADGE_MAP = {
    'PHUSER': '67cc2bb54b09b63ce96f5728', // Replace with actual badge ID for PHUSER
    'NITW25': '67cc2cca4b09b63ce96f5740',  // Replace with actual badge ID for NITW25
    'NITIAN': '67d53f7f498be5edd311453d'  // Replace with actual badge ID for NITIAN
};

// Manual Badge Award Route
router.post('/award-badge', mustRequiredLogin, deviceInfo, async (req, res) => {
    try {
        const userId = req.user.id;
        const { couponCode } = req.body;
        
        // Get badge ID from coupon code
        const badgeId = COUPON_BADGE_MAP[couponCode];
        if (!badgeId) {
            return res.status(400).json({ message: 'Invalid coupon code' });
        }
        
        // Validate badge exists and is active
        const badge = await Badge.findOne({ _id: badgeId, isActive: true });
        if (!badge) {
            return res.status(404).json({ message: 'Badge not found or inactive' });
        }

        const userProgress = await GamificationService.awardBadge(userId, badgeId);
        res.json({
            message: 'Badge awarded successfully',
            badge,
            userProgress
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router; 