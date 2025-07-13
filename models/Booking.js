const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    phonePeTxId: { 
        type: String, 
        required: true,
        index: true // Index for searching transactions by phonePeTxId
    },
    dateOfTx: { 
        type: Date, 
        required: true 
    },
    status: { 
        type: String, 
        required: true,
        enum: ['success', 'pending', 'failed']
    },
    amount: { 
        type: Number, 
        required: true,
        min: 0 
    }
});

const bookingSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'user', 
        required: true,
        index: true // Index for searching bookings by user
    },
    bookingType: {
        type: String,
        required: true,
        enum: ['deal', 'independent'],
        default: 'deal',
        index: true // Index for filtering by booking type
    },
    dealId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Deal',
        required: function() {
            return this.bookingType === 'deal';
        },
        index: true // Index for searching bookings by deal
    },
    passengerDetails: [{
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'user.knownContacts'
    }],
    dateOfTrip: { 
        type: Date, 
        required: true,
        index: true // Index for searching bookings by trip date
    },
    status: { 
        type: String, 
        required: true,
        enum: ['unCancelled', 'cancelled'],
        default: 'unCancelled',
        index: true // Index for filtering by status
    },
    type: { 
        type: String, 
        required: true,
        enum: ['full', '2installments']
    },
    totalAmount: {
        type: Number,
        // required: true,
        min: 0
    },
    remainingAmount: {
        type: Number,
        min: 0,
        default: function() {
            return this.totalAmount; // Initially, remaining amount equals total amount
        }
    },
    transactions: [transactionSchema],
    cancellationReason: {
        type: String,
        // required: function() {
        //     return this.status === 'cancelled';
        // }
    },
    cancellationDate: {
        type: Date,
        required: function() {
            return this.status === 'cancelled';
        }
    }
}, {
    timestamps: true // This will add createdAt and updatedAt fields automatically
});

// Compound index for more complex queries
bookingSchema.index({ userId: 1, dateOfTrip: 1 });
bookingSchema.index({ dealId: 1, dateOfTrip: 1 });
bookingSchema.index({ status: 1, dateOfTrip: 1 });

// Virtual field to calculate payment status
bookingSchema.virtual('paymentStatus').get(function() {
    if (this.remainingAmount === 0) return 'fully_paid';
    if (this.remainingAmount === this.totalAmount) return 'unpaid';
    return 'partially_paid';
});

// Method to update remaining amount after a successful transaction
bookingSchema.methods.updateRemainingAmount = function(transactionAmount) {
    this.remainingAmount = Math.max(0, this.remainingAmount - transactionAmount);
};

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking; 