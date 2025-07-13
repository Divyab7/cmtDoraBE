const mongoose = require('mongoose');

// Rule Schema - Defines what actions trigger rewards
const ruleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    type: { 
        type: String, 
        required: true,
        enum: ['immediate', 'milestone', 'streak', 'campaign']
    },
    triggerEvent: { type: String, required: true }, // e.g., 'bucket_list_add', 'review_posted'
    conditions: {
        milestoneCount: { type: Number }, // For milestone rules
        streakDays: { type: Number }, // For streak rules
        maxCount: { type: Number }, // Maximum times this rule can be triggered
        timeframe: { type: String }, // e.g., 'daily', 'weekly', 'monthly'
        contentType: { type: String }, // For content type specific rules
        referrer: { type: String },    // For referrer based rules
        requiredContentTypes: [{       // For content collector achievement
            type: String
        }]
    },
    rewards: {
        points: { type: Number, default: 0 },
        badgeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Badge' },
    },
    isActive: { type: Boolean, default: true },
    startDate: { type: Date },
    endDate: { type: Date }
}, { timestamps: true });

// Badge Schema
const badgeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String },
    type: { 
        type: String, 
        required: true,
        enum: ['achievement', 'milestone', 'special', 'partner']
    },
    benefits: [{
        type: { 
            type: String,
            enum: ['discount', 'points_multiplier', 'special_access']
        },
        value: { type: Number }, // e.g., 10 for 10% discount
        description: { type: String }
    }],
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner' }, // For partner badges
    isActive: { type: Boolean, default: true },
    requirements: {
        points: { type: Number },
        activities: [{ type: String }],
        otherBadges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Badge' }]
    }
}, { timestamps: true });

// Campaign Schema
const campaignSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    type: { 
        type: String,
        required: true,
        enum: ['time_limited', 'partner', 'seasonal']
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner' },
    rules: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Rule' }],
    rewards: {
        points: { type: Number },
        badges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Badge' }],
        specialRewards: [{
            type: { type: String },
            value: mongoose.Schema.Types.Mixed,
            description: { type: String }
        }]
    },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// User Progress Schema - Tracks user's gamification progress
const userProgressSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'user',
        required: true,
        index: true
    },
    points: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    completedRules: [{
        ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rule' },
        completedAt: { type: Date, default: Date.now },
        count: { type: Number, default: 1 } // Track how many times this rule was completed
    }],
    badges: [{
        badgeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Badge' },
        earnedAt: { type: Date, default: Date.now },
        isActive: { type: Boolean, default: true }
    }],
    streaks: [{
        type: { type: String }, // e.g., 'daily_login', 'weekly_review'
        currentStreak: { type: Number, default: 0 },
        longestStreak: { type: Number, default: 0 },
        lastActivityDate: { type: Date }
    }],
    milestones: [{
        ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rule' },
        progress: { type: Number, default: 0 },
        achieved: { type: Boolean, default: false },
        achievedAt: { type: Date }
    }],
    eventHistory: [{
        eventType: { type: String },
        timestamp: { type: Date, default: Date.now },
        points: { type: Number },
        ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rule' },
        details: mongoose.Schema.Types.Mixed
    }]
}, { timestamps: true });

// Create indexes
userProgressSchema.index({ userId: 1 });
ruleSchema.index({ triggerEvent: 1, isActive: 1 });
badgeSchema.index({ type: 1, isActive: 1 });
campaignSchema.index({ startDate: 1, endDate: 1, isActive: 1 });

const Rule = mongoose.model('Rule', ruleSchema);
const Badge = mongoose.model('Badge', badgeSchema);
const Campaign = mongoose.model('Campaign', campaignSchema);
const UserProgress = mongoose.model('UserProgress', userProgressSchema);

module.exports = {
    Rule,
    Badge,
    Campaign,
    UserProgress
};
