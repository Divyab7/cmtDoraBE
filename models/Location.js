const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  startOffset: { type: Number },
  endOffset: { type: Number },
});

const textSchema = new mongoose.Schema({
  text: { type: String, required: true },
  matches: [matchSchema],
});

const structuredFormatSchema = new mongoose.Schema({
  mainText: textSchema,
  secondaryText: textSchema,
});

const addressComponentSchema = new mongoose.Schema({
  longText: { type: String },
  shortText: { type: String },
  types: [{ type: String }], // e.g., ["administrative_area_level_1", "political"]
  languageCode: { type: String },
});

const placePredictionSchema = new mongoose.Schema({
  place: { type: String, required: true }, // e.g., "places/ChIJO_eya5zu4joRPm8YCOkmFqU"
  placeId: { type: String, required: true }, // e.g., "ChIJO_eya5zu4joRPm8YCOkmFqU"
  text: textSchema,
  structuredFormat: structuredFormatSchema,
  types: [{ type: String }], // e.g., ["geocode", "locality", "political"]
  addressComponents: [addressComponentSchema], // New field for storing addressComponents
});

const Location = mongoose.model('location', placePredictionSchema);

module.exports = Location;
