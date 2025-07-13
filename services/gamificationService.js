const { Rule, Badge, Campaign, UserProgress } = require('../models/Gamification');

class GamificationService {

    
    // Process an event and award points/badges based on rules
    static async processEvent(userId, eventType, eventData = {}) {
        try {
            // Get user progress or create if doesn't exist
            let userProgress = await UserProgress.findOne({ userId });
            if (!userProgress) {
                userProgress = new UserProgress({ userId });
                await userProgress.save();
            }

            // Get all active rules for this event type
            const activeRules = await Rule.find({
                triggerEvent: eventType,
                isActive: true,
                $or: [
                    { startDate: { $exists: false } },
                    { startDate: { $lte: new Date() } }
                ],
                $or: [
                    { endDate: { $exists: false } },
                    { endDate: { $gte: new Date() } }
                ]
            }).populate('rewards.badgeId');

            let totalPoints = 0;
            const earnedBadges = [];
            const updatedMilestones = [];

            // Process each rule
            for (const rule of activeRules) {
                const ruleResult = await this.processRule(rule, userProgress, eventData);
                totalPoints += ruleResult.points;
                if (ruleResult.badge) earnedBadges.push(ruleResult.badge);
                if (ruleResult.milestone) updatedMilestones.push(ruleResult.milestone);
            }

            // Update user progress
            if (totalPoints > 0) {
                userProgress.points += totalPoints;
            }

            // Add earned badges
            for (const badge of earnedBadges) {
                if (!userProgress.badges.some(b => b.badgeId.toString() === badge._id.toString())) {
                    userProgress.badges.push({
                        badgeId: badge._id,
                        earnedAt: new Date()
                    });
                }
            }
        

            await userProgress.save();

            return {
                points: totalPoints,
                badges: earnedBadges,
                milestones: updatedMilestones,
                currentLevel: userProgress.level
            };
        } catch (error) {
            console.error('Error processing event:', error);
            throw error;
        }
    }

    // Process a single rule
    static async processRule(rule, userProgress, eventData) {
        const result = {
            points: 0,
            badge: null,
            milestone: null
        };

        try {
            // Check maxCount first - Add this block at the start
            if (rule.conditions.maxCount) {
                // Count how many times this specific rule has been triggered
                const triggerCount = userProgress.eventHistory.filter(event => 
                    event.eventType === rule.triggerEvent &&
                    event.ruleId?.toString() === rule._id.toString()
                ).length;
                
                // If we've hit the max count, return without processing
                if (triggerCount >= rule.conditions.maxCount) {
                    return result;
                }
            }

            // Rest of your existing condition checks
            if (rule.triggerEvent === 'bucket_list_add' && rule.conditions.contentType && 
                rule.conditions.contentType !== eventData.contentType) {
                return result;
            }

            if (rule.triggerEvent === 'user_login' && rule.conditions.referrer && 
                !eventData.referrer?.includes(rule.conditions.referrer)) {
                return result;
            }

                        // Add content type collection checking
            if (rule.conditions.requiredContentTypes?.length > 0) {
                const userContentTypes = new Set(
                    userProgress.eventHistory
                        .filter(e => e.eventType === 'bucket_list_add')
                        .map(e => e.details.contentType)
                );
                
                const hasAllTypes = rule.conditions.requiredContentTypes
                    .every(type => userContentTypes.has(type));
                
                if (!hasAllTypes) {
                    return result;
                }
            }

            switch (rule.type) {
                case 'immediate':
                    result.points = rule.rewards.points || 0;
                    if (rule.rewards.badgeId) {
                        result.badge = rule.rewards.badgeId;
                    }
                    break;
                case 'milestone':
                    const milestone = await this.processMilestoneRule(rule, userProgress, eventData);
                    if (milestone) {
                        result.milestone = milestone;
                        if (milestone.achieved) {
                            result.points = rule.rewards.points || 0;
                            if (rule.rewards.badgeId) {
                                result.badge = rule.rewards.badgeId;
                            }
                        }
                    }
                    break;
                case 'streak':
                    const streakResult = await this.processStreakRule(rule, userProgress);
                    result.points = streakResult.points;
                    if (streakResult.badge) {
                        result.badge = streakResult.badge;
                    }
                    break;
                case 'campaign':
                    const campaignResult = await this.processCampaignRule(rule, userProgress, eventData);
                    result.points = campaignResult.points;
                    if (campaignResult.badge) {
                        result.badge = campaignResult.badge;
                    }
                    break;
            }    
            // ... rest of the rule processing ...

            // When recording the event in history, include the ruleId
            if (result.points > 0 || result.badge) {
                if(rule.triggerEvent === 'user_login') {
                    console.log("Check1");
                }
                userProgress.eventHistory.push({
                    eventType: rule.triggerEvent,
                    timestamp: new Date(),
                    points: result.points,
                    ruleId: rule._id, // Add this line to track which rule was triggered
                    details: {
                        ...eventData,
                        ruleName: rule.name
                    }
                });
            }

            return result;
        } catch (error) {
            console.error('Error processing rule:', error);
            throw error;
        }
    }
    
    // Process an event and award points/badges based on rules
    // static async processEvent(userId, eventType, eventData = {}) {
    //     try {
    //         // Get user progress or create if doesn't exist
    //         let userProgress = await UserProgress.findOne({ userId });
    //         if (!userProgress) {
    //             userProgress = new UserProgress({ userId });
    //             await userProgress.save();
    //         }

    //         // Get all active rules for this event type
    //         const activeRules = await Rule.find({
    //             triggerEvent: eventType,
    //             isActive: true,
    //             $or: [
    //                 { startDate: { $exists: false } },
    //                 { startDate: { $lte: new Date() } }
    //             ],
    //             $or: [
    //                 { endDate: { $exists: false } },
    //                 { endDate: { $gte: new Date() } }
    //             ]
    //         }).populate('rewards.badgeId');

    //         let totalPoints = 0;
    //         const earnedBadges = [];
    //         const updatedMilestones = [];

    //         // Process each rule
    //         for (const rule of activeRules) {
    //             const ruleResult = await this.processRule(rule, userProgress, eventData);
    //             totalPoints += ruleResult.points;
    //             if (ruleResult.badge) earnedBadges.push(ruleResult.badge);
    //             if (ruleResult.milestone) updatedMilestones.push(ruleResult.milestone);
    //         }

    //         // Update user progress
    //         if (totalPoints > 0) {
    //             userProgress.points += totalPoints;
    //         }

    //         // Add earned badges
    //         for (const badge of earnedBadges) {
    //             userProgress.badges.push({
    //                 badgeId: badge._id,
    //                 earnedAt: new Date()
    //             });
    //         }

    //         // Update milestones
    //         for (const milestone of updatedMilestones) {
    //             const existingMilestone = userProgress.milestones.find(
    //                 m => m.ruleId.toString() === milestone.ruleId.toString()
    //             );
    //             if (existingMilestone) {
    //                 existingMilestone.progress = milestone.progress;
    //                 existingMilestone.achieved = milestone.achieved;
    //                 if (milestone.achieved) existingMilestone.achievedAt = new Date();
    //             } else {
    //                 userProgress.milestones.push(milestone);
    //             }
    //         }

    //         // Record event in history
    //         userProgress.eventHistory.push({
    //             eventType,
    //             points: totalPoints,
    //             details: eventData
    //         });

    //         // Update level if needed
    //         userProgress.level = Math.floor(userProgress.points / 1000) + 1;

    //         await userProgress.save();

    //         return {
    //             points: totalPoints,
    //             badges: earnedBadges,
    //             milestones: updatedMilestones,
    //             currentLevel: userProgress.level
    //         };
    //     } catch (error) {
    //         console.error('Error processing event:', error);
    //         throw error;
    //     }
    // }

    // // Process a single rule
    // static async processRule(rule, userProgress, eventData) {
    //     const result = {
    //         points: 0,
    //         badge: null,
    //         milestone: null
    //     };

    //     try {
    //         // Add content type checking
    //         if (rule.conditions.contentType && 
    //             rule.conditions.contentType !== eventData.contentType) {
    //             return result;
    //         }

    //         // Add referrer checking
    //         if (rule.conditions.referrer && 
    //             !eventData.referrer?.includes(rule.conditions.referrer)) {
    //             return result;
    //         }

    //         // Add content type collection checking
    //         if (rule.conditions.requiredContentTypes?.length > 0) {
    //             const userContentTypes = new Set(
    //                 userProgress.eventHistory
    //                     .filter(e => e.eventType === 'bucket_list_add')
    //                     .map(e => e.details.contentType)
    //             );
                
    //             const hasAllTypes = rule.conditions.requiredContentTypes
    //                 .every(type => userContentTypes.has(type));
                
    //             if (!hasAllTypes) {
    //                 return result;
    //             }
    //         }

    //         switch (rule.type) {
    //             case 'immediate':
    //                 result.points = rule.rewards.points || 0;
    //                 if (rule.rewards.badgeId) {
    //                     result.badge = rule.rewards.badgeId;
    //                 }
    //                 break;

    //             case 'milestone':
    //                 const milestone = await this.processMilestoneRule(rule, userProgress, eventData);
    //                 if (milestone) {
    //                     result.milestone = milestone;
    //                     if (milestone.achieved) {
    //                         result.points = rule.rewards.points || 0;
    //                         if (rule.rewards.badgeId) {
    //                             result.badge = rule.rewards.badgeId;
    //                         }
    //                     }
    //                 }
    //                 break;

    //             case 'streak':
    //                 const streakResult = await this.processStreakRule(rule, userProgress);
    //                 result.points = streakResult.points;
    //                 if (streakResult.badge) {
    //                     result.badge = streakResult.badge;
    //                 }
    //                 break;

    //             case 'campaign':
    //                 const campaignResult = await this.processCampaignRule(rule, userProgress, eventData);
    //                 result.points = campaignResult.points;
    //                 if (campaignResult.badge) {
    //                     result.badge = campaignResult.badge;
    //                 }
    //                 break;
    //         }

    //         return result;
    //     } catch (error) {
    //         console.error('Error processing rule:', error);
    //         throw error;
    //     }
    // }

    // Process milestone rules (e.g., every 15 places added to bucket list)
    static async processMilestoneRule(rule, userProgress, eventData) {
        const milestoneIndex = userProgress.milestones.findIndex(
            m => m.ruleId.toString() === rule._id.toString()
        );
        const milestone = milestoneIndex >= 0 ? userProgress.milestones[milestoneIndex] : {
            ruleId: rule._id,
            progress: 0,
            achieved: false
        };

        milestone.progress += 1;

        if (rule.conditions.milestoneCount && 
            milestone.progress >= rule.conditions.milestoneCount &&
            (!rule.conditions.maxCount || milestone.progress <= rule.conditions.maxCount)) {
            milestone.achieved = true;
            milestone.achievedAt = new Date();
        }

        // Save the updated milestone back to userProgress
        if (milestoneIndex >= 0) {
            userProgress.milestones[milestoneIndex] = milestone;
        } else {
            userProgress.milestones.push(milestone);
        }

        return milestone;
    }

    // Process streak rules (e.g., daily login streaks)
    static async processStreakRule(rule, userProgress) {
        const result = { points: 0, badge: null };
        const streakIndex = userProgress.streaks.findIndex(s => s.type === rule.triggerEvent);
        const streak = streakIndex >= 0 ? userProgress.streaks[streakIndex] : {
            type: rule.triggerEvent,
            currentStreak: 0,
            longestStreak: 0,
            lastActivityDate: null
        };

        const today = new Date();
        const lastActivity = streak.lastActivityDate ? new Date(streak.lastActivityDate) : null;

        // Check if this is a continuation of the streak
        if (lastActivity) {
            const daysSinceLastActivity = Math.floor(
                (today - lastActivity) / (1000 * 60 * 60 * 24)
            );

            if (daysSinceLastActivity === 1) {
                streak.currentStreak += 1;
            } else if (daysSinceLastActivity > 1) {
                streak.currentStreak = 1;
            }
        } else {
            streak.currentStreak = 1;
        }

        streak.lastActivityDate = today;
        streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);

        // Save the updated streak back to userProgress
        if (streakIndex >= 0) {
            userProgress.streaks[streakIndex] = streak;
        } else {
            userProgress.streaks.push(streak);
        }

        // Award points/badges based on streak
        if (rule.conditions.streakDays && streak.currentStreak >= rule.conditions.streakDays) {
            result.points = rule.rewards.points || 0;
            if (rule.rewards.badgeId) {
                result.badge = rule.rewards.badgeId;
            }
        }

        return result;
    }

    // Process campaign rules
    static async processCampaignRule(rule, userProgress, eventData) {
        const result = { points: 0, badge: null };
        
        // Check if campaign is active
        const campaign = await Campaign.findOne({
            rules: rule._id,
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() },
            isActive: true
        });

        if (campaign) {
            result.points = rule.rewards.points || 0;
            if (rule.rewards.badgeId) {
                result.badge = rule.rewards.badgeId;
            }
        }

        return result;
    }

    // Get user's gamification profile
    static async getUserProfile(userId) {
        try {
            const userProgress = await UserProgress.findOne({ userId })
                .populate('badges.badgeId')
                .populate('milestones.ruleId');

            if (!userProgress) {
                return null;
            }

            // Calculate next level threshold
            const currentLevel = userProgress.level;
            const pointsForNextLevel = (currentLevel) * 1000;
            const pointsNeeded = pointsForNextLevel - userProgress.points;

            // Get active campaigns
            const activeCampaigns = await Campaign.find({
                startDate: { $lte: new Date() },
                endDate: { $gte: new Date() },
                isActive: true
            });

            return {
                userId: userProgress.userId,
                points: userProgress.points,
                level: userProgress.level,
                completedRules: userProgress.completedRules,
                nextLevelProgress: {
                    pointsNeeded,
                    percentage: ((userProgress.points % 1000) / 1000) * 100
                },
                badges: userProgress.badges,
                streaks: userProgress.streaks,
                milestones: userProgress.milestones,
                activeCampaigns
            };
        } catch (error) {
            console.error('Error getting user profile:', error);
            throw error;
        }
    }

    // Get leaderboard
    static async getLeaderboard(timeframe = 'all', limit = 10) {
        try {
            const query = {};
            
            if (timeframe !== 'all') {
                const startDate = new Date();
                switch (timeframe) {
                    case 'daily':
                        startDate.setDate(startDate.getDate() - 1);
                        break;
                    case 'weekly':
                        startDate.setDate(startDate.getDate() - 7);
                        break;
                    case 'monthly':
                        startDate.setMonth(startDate.getMonth() - 1);
                        break;
                }
                query.createdAt = { $gte: startDate };
            }

            const leaderboard = await UserProgress.find(query)
                .sort({ points: -1, level: -1 })
                .limit(limit)
                .populate('userId', 'name username');

            return leaderboard.map(entry => ({
                userId: entry.userId._id,
                name: entry.userId.name || entry.userId.username,
                points: entry.points,
                level: entry.level,
                badges: entry.badges.length
            }));
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            throw error;
        }
    }

    // Manually award a badge to a user
    static async awardBadge(userId, badgeId, reason = 'manual_award') {
        try {
            let userProgress = await UserProgress.findOne({ userId });
            if (!userProgress) {
                userProgress = new UserProgress({ userId });
            }

            // Check if user already has this badge
            const existingBadge = userProgress.badges.find(
                b => b.badgeId.toString() === badgeId.toString()
            );

            if (!existingBadge) {
                userProgress.badges.push({
                    badgeId,
                    earnedAt: new Date()
                });

                // Record in event history
                userProgress.eventHistory.push({
                    eventType: 'badge_awarded',
                    points: 0,
                    details: { badgeId, reason }
                });

                await userProgress.save();
            }

            return userProgress;
        } catch (error) {
            console.error('Error awarding badge:', error);
            throw error;
        }
    }
}

module.exports = GamificationService; 