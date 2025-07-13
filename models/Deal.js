const mongoose = require("mongoose");

const accommodationSchema = new mongoose.Schema(
  {
    location: {
      type: String,
    },
    hotels: [
      {
        type: String,
      },
    ],
  },
  { _id: false }
);

const itineraryDaySchema = new mongoose.Schema(
  {
    day: {
      type: String,
    },
    title: {
      type: String,
    },
    description: {
      type: String,
    },
    accommodations: accommodationSchema,
  },
  { _id: false }
);

const pricingSchema = new mongoose.Schema(
  {
    groupSize: {
      min: {
        type: Number,
        required: true,
      },
      max: {
        type: Number,
        required: true,
      },
    },
    rates: {
      Standard: Number,
      Deluxe: Number,
      SuperDeluxe: Number,
      Luxury: Number,
      Premium: Number,
    },
    extraOptions: {
      WithExtraMattress: Number,
      WithoutExtraMattress: Number,
    },
  },
  { _id: false }
);

const customBreakSchema = new mongoose.Schema(
  {
    date: Date,
    recurring: String,
    reason: {
      type: String,
    },
  },
  { _id: false }
);

// Add gamification schema
const gamificationSchema = new mongoose.Schema(
  {
    maxPointsRedeemable: {
      type: Number,
      min: 0,
      default: 0,
    },
    pointsToDiscountRatio: {
      type: Number,
      min: 0,
      default: 0, // e.g., 10 means 10 points = 1 currency unit discount
    },
    eligibleBadges: [
      {
        badgeId: { type: mongoose.Schema.Types.ObjectId, ref: "Badge" },
        discountPercentage: { type: Number, min: 0, max: 100 },
      },
    ],
    specialOffers: [
      {
        name: { type: String },
        description: { type: String },
        type: {
          type: String,
          enum: ["points_multiplier", "bonus_points", "special_access"],
        },
        value: { type: Number },
        startDate: { type: Date },
        endDate: { type: Date },
        isActive: { type: Boolean, default: true },
      },
    ],
  },
  { _id: false }
);

const dealSchema = new mongoose.Schema(
  {
    packageName: {
      type: String,
      required: true,
      trim: true,
    },
    packageType: {
      type: String,
      trim: true,
    },
    duration: {
      days: {
        type: Number,
        required: true,
      },
      nights: {
        type: Number,
        required: true,
      },
    },
    destinations: [
      {
        type: String,
      },
    ],
    itinerary: [itineraryDaySchema],
    pricing: [pricingSchema],
    currency: String,
    commissionPercentage: {
      type: Number,
      // min: 0,
      // max: 100,
      default: 10,
    },
    priceType: {
      type: String,
      enum: ["person", "group"],
      required: true,
    },
    inclusions: [
      {
        type: String,
      },
    ],
    exclusions: [
      {
        type: String,
      },
    ],
    transportation: [
      {
        type: String,
      },
    ],
    contact: {
      email: {
        type: String,
        trim: true,
        lowercase: true,
      },
      phone: {
        type: String,
      },
      address: String,
    },
    validity: {
      startDate: {
        type: Date,
      },
      endDate: {
        type: Date,
      },
      customBreaks: [customBreakSchema],
    },
    termsAndConditions: {
      type: String,
    },
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
    },
    // Add gamification field
    gamification: {
      type: gamificationSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Deal", dealSchema);
