const mongoose = require("mongoose");

const otpSchema = mongoose.Schema({
    accountType: {
        name: {
            type: String,
            enum: ["email", "phone", "instagram"],
            required: true,
        },
        value: {
            type: String,
            required: true,
        }
    },
    otp: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 60 * 5,
    },
})

const otpModel = mongoose.model("otp", otpSchema);

module.exports = otpModel;
