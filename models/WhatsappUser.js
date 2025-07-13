const mongoose = require("mongoose");

const whatsappUserSchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (value) {
          return /^\+?\d{10,15}$/.test(value);
        },
        message: "Invalid phone number format",
      },
    },
    name: {
      type: String,
    },
    profilePic: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    appUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      default: null
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    preferences: {
      language: {
        type: String,
        default: 'en'
      },
      currency: {
        type: String,
        default: 'INR'
      },
      notificationSettings: {
        type: Boolean,
        default: true
      }
    },
    conversationHistory: [
      {
        role: {
          type: String,
          enum: ['user', 'assistant', 'system'],
          required: true
        },
        content: {
          type: String,
          required: true
        },
        timestamp: {
          type: Date,
          default: Date.now
        }
      }
    ],
    currentTripPlanning: {
      isActive: {
        type: Boolean,
        default: false
      },
      destinations: [String],
      startDate: Date,
      endDate: Date,
      travelers: {
        type: Number,
        default: 1
      },
      budget: {
        amount: Number,
        currency: {
          type: String,
          default: 'USD'
        }
      },
      preferences: {
        accommodationType: String,
        transportationMode: String,
        activities: [String],
        dietaryRestrictions: [String]
      },
      savedTripId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Trip',
        default: null
      }
    },
    recentSearches: [
      {
        query: String,
        timestamp: {
          type: Date,
          default: Date.now
        },
        type: {
          type: String,
          enum: ['destination', 'activity', 'deal', 'general'],
          default: 'general'
        }
      }
    ],
    bucket: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'BucketListItem' 
    }],
    activeWidget: {
      widgetId: String,
      state: Object,
      lastUpdated: {
        type: Date,
        default: Date.now
      }
    },
    conversationContext: {
      currentState: {
        type: String,
        enum: ['idle', 'trip_planning', 'deal_search', 'widget_usage', 'booking', 'trip_management'],
        default: 'idle'
      },
      contextData: Object,
      previousState: String,
      stateHistory: [
        {
          state: String,
          timestamp: {
            type: Date,
            default: Date.now
          }
        }
      ]
    }
  },
  { timestamps: true }
);

// Update user's conversation context
whatsappUserSchema.methods.updateConversationContext = function(newState, contextData = {}) {
  // If state is changing, update state history
  if (this.conversationContext.currentState !== newState) {
    this.conversationContext.previousState = this.conversationContext.currentState;
    
    this.conversationContext.stateHistory.push({
      state: this.conversationContext.currentState,
      timestamp: new Date()
    });
    
    this.conversationContext.currentState = newState;
  }
  
  // Update context data
  this.conversationContext.contextData = {
    ...this.conversationContext.contextData,
    ...contextData
  };
  
  return this;
};

const WhatsappUser = mongoose.model("whatsappUser", whatsappUserSchema);

module.exports = WhatsappUser; 