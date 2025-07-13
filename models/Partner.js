const mongoose = require("mongoose");

const partnerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    poc: {
      name: {
        type: String,
        // required: true,
        trim: true,
      },
      email: {
        type: String,
        // required: true,
        trim: true,
        lowercase: true,
      },
      phone: {
        type: String,
        // required: true
      },
    },
    type: {
      type: String,
      required: true,
      enum: [
        "DMC",
        "Hotel",
        "Transport",
        "Activity",
        "Guide",
        "Creator",
        "Other",
      ],
      default: "Other",
    },
    services: [
      {
        type: String,
        trim: true,
      },
    ],
    deals: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Deal",
      },
    ],
    status: {
      type: String,
      enum: ["active", "inactive", "pending"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Partner", partnerSchema);
