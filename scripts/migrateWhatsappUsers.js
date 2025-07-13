/**
 * Migration script to merge WhatsappUser data into User model
 * 
 * Run with: node scripts/migrateWhatsappUsers.js
 */

const mongoose = require('mongoose');
const { UserModel } = require('../models/User');
const WhatsappUser = require('../models/WhatsappUser');
const Trip = require('../models/Trip');
require('dotenv').config();

async function migrateWhatsappUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB. Starting migration...');
    
    // Get all WhatsApp users
    const whatsappUsers = await WhatsappUser.find({});
    console.log(`Found ${whatsappUsers.length} WhatsApp users to migrate`);
    
    // Process each WhatsApp user
    for (const whatsappUser of whatsappUsers) {
      console.log(`Processing WhatsApp user: ${whatsappUser.phoneNumber}`);
      
      // Check if this WhatsApp user is linked to an app user
      if (whatsappUser.appUserId) {
        // WhatsApp user is linked to an app user, update the app user
        const appUser = await UserModel.findById(whatsappUser.appUserId);
        
        if (appUser) {
          console.log(`Found linked app user: ${appUser._id}`);
          
          // Add WhatsApp data to app user
          appUser.whatsapp = {
            profilePic: whatsappUser.profilePic,
            lastActivity: whatsappUser.lastActivity,
            conversationHistory: whatsappUser.conversationHistory,
            // Do not copy currentTripPlanning - will create Trip records instead
            recentSearches: whatsappUser.recentSearches,
            activeWidget: whatsappUser.activeWidget,
            conversationContext: whatsappUser.conversationContext
          };
          
          // Ensure phone number is set
          if (!appUser.phoneNumber) {
            appUser.phoneNumber = whatsappUser.phoneNumber;
            appUser.verificationStatus.phone = true;
          }
          
          // Merge bucket lists if needed
          if (whatsappUser.bucket && whatsappUser.bucket.length > 0) {
            if (!appUser.bucket) {
              appUser.bucket = [];
            }
            // Merge buckets, removing duplicates
            appUser.bucket = [...new Set([...appUser.bucket, ...whatsappUser.bucket])];
          }
          
          // If there's an active trip planning, create a Trip record
          if (whatsappUser.currentTripPlanning && whatsappUser.currentTripPlanning.isActive) {
            const trip = await createTripFromPlanningData(whatsappUser.currentTripPlanning, appUser._id);
            if (trip) {
              appUser.whatsapp.activeTripId = trip._id;
              console.log(`Created Trip record ${trip._id} from current planning data`);
            }
          }
          
          await appUser.save();
          console.log(`Updated app user ${appUser._id} with WhatsApp data`);
        } else {
          console.log(`Warning: Linked app user ${whatsappUser.appUserId} not found`);
          // Create a new user with the WhatsApp data
          await createNewUserFromWhatsapp(whatsappUser);
        }
      } else {
        // WhatsApp user is not linked to an app user
        // Check if there's an app user with the same phone number
        const existingUser = await UserModel.findOne({ phoneNumber: whatsappUser.phoneNumber });
        
        if (existingUser) {
          console.log(`Found existing user with same phone number: ${existingUser._id}`);
          
          // Add WhatsApp data to existing user
          existingUser.whatsapp = {
            profilePic: whatsappUser.profilePic,
            lastActivity: whatsappUser.lastActivity,
            conversationHistory: whatsappUser.conversationHistory,
            // Do not copy currentTripPlanning - will create Trip records instead
            recentSearches: whatsappUser.recentSearches,
            activeWidget: whatsappUser.activeWidget,
            conversationContext: whatsappUser.conversationContext
          };
          
          // Ensure verification status is set
          existingUser.verificationStatus.phone = true;
          
          // Merge bucket lists if needed
          if (whatsappUser.bucket && whatsappUser.bucket.length > 0) {
            if (!existingUser.bucket) {
              existingUser.bucket = [];
            }
            // Merge buckets, removing duplicates
            existingUser.bucket = [...new Set([...existingUser.bucket, ...whatsappUser.bucket])];
          }
          
          // If there's an active trip planning, create a Trip record
          if (whatsappUser.currentTripPlanning && whatsappUser.currentTripPlanning.isActive) {
            const trip = await createTripFromPlanningData(whatsappUser.currentTripPlanning, existingUser._id);
            if (trip) {
              existingUser.whatsapp.activeTripId = trip._id;
              console.log(`Created Trip record ${trip._id} from current planning data`);
            }
          }
          
          await existingUser.save();
          console.log(`Updated existing user ${existingUser._id} with WhatsApp data`);
        } else {
          // Create a new user with the WhatsApp data
          await createNewUserFromWhatsapp(whatsappUser);
        }
      }
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Helper function to create a Trip record from currentTripPlanning data
async function createTripFromPlanningData(planningData, userId) {
  try {
    // Skip if there's not enough data
    if (!planningData.destinations || planningData.destinations.length === 0) {
      return null;
    }
    
    const trip = new Trip({
      userId: userId,
      tripType: 'self-planned',
      tripName: planningData.destinations.join(', '),
      startDate: planningData.startDate || new Date(),
      status: 'planning',
      createdVia: 'whatsapp',
      destinations: planningData.destinations.map(dest => ({ location: dest })),
      planningData: {
        lastUpdated: new Date(),
        planningProgress: 50, // Default to 50% since we're migrating
        planningNotes: [{ 
          note: 'Trip migrated from previous model', 
          timestamp: new Date() 
        }]
      }
    });
    
    // Add duration if we have end date
    if (planningData.endDate && planningData.startDate) {
      const start = new Date(planningData.startDate);
      const end = new Date(planningData.endDate);
      const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      
      trip.duration = {
        days: durationDays,
        nights: durationDays > 0 ? durationDays - 1 : 0
      };
    }
    
    // Add travelers if specified
    if (planningData.travelers) {
      trip.passengers = [];
      for (let i = 0; i < planningData.travelers; i++) {
        trip.passengers.push({
          isPrimary: i === 0,
          specialRequirements: i === 0 ? "Primary traveler" : "Additional traveler"
        });
      }
    }
    
    // Add budget if specified
    if (planningData.budget && planningData.budget.amount) {
      trip.budget = {
        currency: planningData.budget.currency || 'INR',
        totalBudget: planningData.budget.amount
      };
    }
    
    // Add preferences as notes
    if (planningData.preferences) {
      trip.notes = '';
      Object.entries(planningData.preferences).forEach(([key, value]) => {
        trip.notes += `\n${key}: ${value}`;
      });
      trip.notes = trip.notes.trim();
    }
    
    await trip.save();
    return trip;
  } catch (error) {
    console.error('Error creating Trip from planning data:', error);
    return null;
  }
}

// Helper function to create a new user from WhatsApp user data
async function createNewUserFromWhatsapp(whatsappUser) {
  try {
    const newUser = new UserModel({
      phoneNumber: whatsappUser.phoneNumber,
      name: whatsappUser.name || 'WhatsApp User',
      createdVia: 'whatsapp',
      verificationStatus: {
        phone: true
      },
      whatsapp: {
        profilePic: whatsappUser.profilePic,
        lastActivity: whatsappUser.lastActivity,
        conversationHistory: whatsappUser.conversationHistory,
        // Don't copy currentTripPlanning - will create Trip records instead
        recentSearches: whatsappUser.recentSearches,
        activeWidget: whatsappUser.activeWidget,
        conversationContext: whatsappUser.conversationContext
      },
      bucket: whatsappUser.bucket || []
    });
    
    await newUser.save();
    console.log(`Created new user ${newUser._id} from WhatsApp data`);
    
    // If there's an active trip planning, create a Trip record
    if (whatsappUser.currentTripPlanning && whatsappUser.currentTripPlanning.isActive) {
      const trip = await createTripFromPlanningData(whatsappUser.currentTripPlanning, newUser._id);
      if (trip) {
        newUser.whatsapp.activeTripId = trip._id;
        await newUser.save();
        console.log(`Created Trip record ${trip._id} from current planning data`);
      }
    }
    
    return newUser;
  } catch (error) {
    console.error('Error creating new user from WhatsApp data:', error);
    return null;
  }
}

// Run the migration
migrateWhatsappUsers(); 