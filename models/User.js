const mongoose = require("mongoose");

const bucketListItemSchema = new mongoose.Schema({
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'location', required: true },
  activityName: { type: String, required: true },
  activityType: { type: String, required: true },
  contentId: { type: mongoose.Schema.Types.ObjectId, ref: 'videoContent' },
  stateId: { type: mongoose.Schema.Types.ObjectId, ref: 'State' },
  countryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Country' },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'user', required: true },
  status: { type: String, required: true, enum: ['toDo', 'done'] },
  history: [ { type: String }]
});

const stateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  bucketList: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BucketListItem' }],
  countryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Country', required: true },
});

const countrySchema = new mongoose.Schema({
  name: { type: String, required: true },
  bucketList: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BucketListItem' }],
  states: [{ type: mongoose.Schema.Types.ObjectId, ref: 'State' }],
});

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      // required: true,
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
    },
    password: {
      type: String,
      required: function() {
        // Only require password if user is not WhatsApp-only
        return !this.createdVia || this.createdVia !== 'whatsapp';
      },
    },
    role: {
      type: String,
      enum: ["admin", "moderator"],
    },
    phoneNumber: {
      type: String,
      unique: true, // Make phone number unique
      sparse: true,
      validate: {
        validator: function (value) {
          return /^\+?\d{10,15}$/.test(value);
        },
        message: "Invalid phone number format",
      },
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      // required: true,
    },
    verificationStatus: {
      email: {
        type: Boolean,
        default: false,
      },
      phone: {
        type: Boolean,
        default: false,
      },
      instagram: {
        type: Boolean,
        default: false,
      },
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    appleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    instagram: {
      id: {
        type: String,
        unique: true,
        sparse: true,
      },
      username: {
        type: String,
        unique: true,
        sparse: true,
      },
      accountType: {
        type: String,
      },
      accessToken: {
        type: String,
        unique: true,
        sparse: true,
      },
    },
    // Track how the user was created
    createdVia: {
      type: String,
      enum: ['app', 'whatsapp', 'instagram', 'google', 'apple'],
      default: 'app'
    },
    // WhatsApp specific fields
    whatsapp: {
      profilePic: String,
      lastActivity: {
        type: Date,
        default: Date.now,
      },
      conversationHistory: [
        {
          role: {
            type: String,
            enum: ['user', 'assistant', 'system'],
          },
          content: String,
          timestamp: {
            type: Date,
            default: Date.now
          }
        }
      ],
      // Replace detailed currentTripPlanning with reference to active Trip
      activeTripId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Trip',
        default: null
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
    bucket: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BucketListItem' }],
    devices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Device' }],
    knownContacts: [{
      name: { type: String, required: true },
      email: { type: String },
      phoneNumber: { 
        type: String,
        validate: {
          validator: function (value) {
            return !value || /^\+?\d{10,15}$/.test(value);
          },
          message: "Invalid phone number format"
        }
      },
      dateOfBirth: { 
        type: Date,
        validate: {
          validator: function(value) {
            if (!value) return true; // Allow null/undefined
            return value instanceof Date && !isNaN(value) && value <= new Date();
          },
          message: "Invalid date of birth or date is in the future"
        }
      }
    }],
    // Hedera account info
    hedera: {
      accountId: { type: String },
      publicKey: { type: String },
      privateKey: { type: String }, // Store encrypted in production
    }
  },
  { timestamps: true }
);

// Add the method from WhatsappUser model
userSchema.methods.updateConversationContext = function(newState, contextData = {}) {
  // Check if whatsapp field exists
  if (!this.whatsapp || !this.whatsapp.conversationContext) {
    return this;
  }
  
  // If state is changing, update state history
  if (this.whatsapp.conversationContext.currentState !== newState) {
    this.whatsapp.conversationContext.previousState = this.whatsapp.conversationContext.currentState;
    
    this.whatsapp.conversationContext.stateHistory.push({
      state: this.whatsapp.conversationContext.currentState,
      timestamp: new Date()
    });
    
    this.whatsapp.conversationContext.currentState = newState;
  }
  
  // Update context data
  this.whatsapp.conversationContext.contextData = {
    ...this.whatsapp.conversationContext.contextData,
    ...contextData
  };
  
  return this;
};

const BucketListItem = mongoose.model('BucketListItem', bucketListItemSchema);
const State = mongoose.model('State', stateSchema);
const Country = mongoose.model('Country', countrySchema);
const UserModel = mongoose.model("user", userSchema);

module.exports = {
  UserModel,
  BucketListItem,
  State,
  Country,
};

