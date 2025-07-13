const mongoose = require("mongoose");

const contentSchema = new mongoose.Schema(
  {
    embeddingLink: { type: String },
    contentType: {
      type: String,
      enum: ["ytShorts", "instaReels", "tikTok", "upload", "blog", "others", "doraAI"],
      required: true,
    },
    status: {
      type: String,
      enum: [null, "basic", "deep"],
      default: null
    },
    buckets: [{
        locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'location', required: true },
        activityName: { type: String, required: true },
        activityType: { type: String, required: true },
      },],
    creator: String,
    title: String,
    nftTokenId: { type: String, default: null },
    nftMetadataIpfsHash: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

const contentModel = mongoose.model("videoContent", contentSchema);

module.exports = contentModel;