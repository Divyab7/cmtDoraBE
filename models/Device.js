const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  expoPushToken: { type: String },
  deviceId: { type: String },
  lastActive: { type: Date, default: Date.now },
  platform: { 
    type: String, 
    enum: ['ios', 'android', 'web'],
    required: true 
  },
  createdAt: { type: Date, default: Date.now }
});

const Device = mongoose.model('Device', deviceSchema);

module.exports = Device; 