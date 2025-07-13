const mongoose = require('mongoose');

// Schema for storing user-created or package-derived itinerary days
const tripItineraryDaySchema = new mongoose.Schema({
    day: {
        type: Number,
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
    },
    activities: [{
        placeId: {
            type: String,
            ref: 'location'
        },
        address: {
            type: String,
        },
        activityName: {
            type: String,
            required: true
        },
        activityType: {
            type: String,
            enum: ['visit', 'activity']
        }
    }],
    accommodationDetails: {
        name: String,
        bookingReference: String,
        address: String,
        contactInfo: String,
        checkIn: Date,
        checkOut: Date,
        notes: String
    },
    transportationDetails: {
        type: String,
        bookingReference: String,
        departureTime: Date,
        arrivalTime: Date,
        notes: String
    }
}, { _id: true });

// Main Trip Schema
const tripSchema = new mongoose.Schema({
    // Core trip information
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'user', 
        required: true,
        index: true
    },
    tripType: {
        type: String,
        required: true,
        enum: ['packaged', 'self-planned'],
        default: 'self-planned',
        index: true
    },
    groupType: {
        type: String,
        enum: ['couple', 'family', 'friends', 'solo'],
        default: 'friends'
    },
    tripPurpose: {
        type: String,
        enum: ['business', 'leisure', 'bachelorette', 'birthday', 'anniversary', 'familyVacation'],
        default: 'leisure'
    },
    createdVia: {
        type: String,
        enum: ['app', 'whatsapp', 'imported'],
        default: 'app'
    },
    tripName: {
        type: String,
        required: true
    },
    startDate: { 
        type: Date, 
        required: true,
        index: true
    },
    duration: {
        days: {
            type: Number,
            min: 0,
            default: 0
        },
        nights: {
            type: Number,
            min: 0,
            default: 0
        }
    },
    
    // Related booking and deal information (for packaged trips)
    bookingId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Booking',
        index: true
    },
    dealId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Deal',
        required: function() {
            return this.tripType === 'packaged';
        },
        index: true
    },
    
    // Passenger information
    passengers: [{
        passengerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user.knownContacts'
        },
        isPrimary: {
            type: Boolean,
            default: false
        },
        specialRequirements: String
    }],
    
    // Trip status and planning information
    status: { 
        type: String, 
        required: true,
        enum: ['planning', 'booked', 'active', 'completed', 'cancelled'],
        default: 'planning',
        index: true
    },
    planningData: {
        lastUpdated: Date,
        planningProgress: {
            type: Number,
            min: 0,
            max: 100,
            default: 0
        },
        lastMessage: String,
        planningNotes: [{ 
            note: String,
            timestamp: {
                type: Date,
                default: Date.now
            }
        }]
    },
    
    // Destination information
    destinations: [{
        location: String,
    }],
    
    // Trip itinerary - can be populated from deal or user-created
    itinerary: [tripItineraryDaySchema],
    
    // Budget and expense tracking
    budget: {
        currency: {
            type: String,
            default: 'INR'
        },
        totalBudget: {
            type: Number,
            min: 0
        },
        expenses: [{
            category: {
                type: String,
                enum: ['accommodation', 'transportation', 'food', 'activities', 'shopping', 'other']
            },
            amount: {
                type: Number,
                min: 0
            },
            date: Date,
            description: String,
            receipt: String // URL or reference to receipt image
        }]
    },
    
    // References to additional information that will be added later
    outfitInfo: {
        type: mongoose.Schema.Types.ObjectId
        // Will be populated later
    },
    
    // Notes and other information
    notes: String,
    
    // Trip sharing and collaboration
    isShared: {
        type: Boolean,
        default: false
    },
    collaborators: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user'
        },
        permissions: {
            type: String,
            enum: ['view', 'edit'],
            default: 'view'
        }
    }],
    
    // Weather information
    weatherInfo: [{
        date: Date,
        forecast: String,
        temperature: {
            min: Number,
            max: Number
        },
        notes: String
    }]
}, {
    timestamps: true
});

// Compound indexes for more complex queries
tripSchema.index({ userId: 1, startDate: 1 });
tripSchema.index({ status: 1, startDate: 1 });

// Static method to create a trip from a booking
tripSchema.statics.createFromBooking = async function(bookingId) {
    const Booking = mongoose.model('Booking');
    const Deal = mongoose.model('Deal');
    
    // First, find the booking
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
        throw new Error('Booking not found');
    }
    
    if (booking.bookingType !== 'deal' || !booking.dealId) {
        throw new Error('Booking is not associated with a deal');
    }
    
    // Get user info
    const user = await mongoose.model('user').findById(booking.userId);
    
    // Get deal info separately since the reference might be inconsistent
    const deal = await Deal.findById(booking.dealId);
    
    if (!deal) {
        throw new Error('Deal not found for this booking');
    }
    
    // Ensure booking.dateOfTrip is a valid Date object
    let startDate;
    if (booking.dateOfTrip) {
        // Make sure we have a valid Date object
        startDate = new Date(booking.dateOfTrip);
        if (isNaN(startDate.getTime())) {
            // If invalid date, default to current date
            startDate = new Date();
        }
    } else {
        // If no date provided, default to current date
        startDate = new Date();
    }
    
    // Create a new trip based on the booking and deal
    const trip = new this({
        userId: booking.userId,
        tripType: 'packaged',
        tripName: deal.packageName,
        startDate: startDate,
        duration: deal.duration,
        bookingId: booking._id,
        dealId: deal._id,
        passengers: booking.passengerDetails.map((passengerId, index) => ({
            passengerId,
            isPrimary: index === 0 // First passenger is primary
        })),
        status: 'booked',
        destinations: deal.destinations.map(destination => ({ location: destination })),
        itinerary: deal.itinerary.map(day => ({
            day: parseInt(day.day),
            title: day.title,
            description: day.description,
            // Convert any existing activities if available
            // activities: day.activities ? day.activities.map(activity => {
            //     if (typeof activity === 'string') {
            //         // Simple string activity from older format
            //         return {
            //             activityName: activity,
            //             activityType: 'visit'
            //         };
            //     } else if (activity.location) {
            //         // Handle older format with location field
            //         return {
            //             placeId: activity.placeId || null, // Use placeId if available, null otherwise
            //             activityName: activity.activityName || activity.location || 'Unnamed Activity',
            //             activityType: activity.activityType || 'visit'
            //         };
            //     } else {
            //         // Return activity as is if it's already in the new format or has no location
            //         return activity;
            //     }
            // }) : [],
            accommodationDetails: day.accommodations ? {
                name: day.accommodations.hotels && day.accommodations.hotels.length > 0 ? 
                    day.accommodations.hotels[0] : '',
                address: day.accommodations.location
            } : {}
        }))
    });
    
    return trip;
};

// Method to calculate trip status based on dates
tripSchema.methods.updateStatus = function() {
    const now = new Date();
    
    // Calculate end date using either stored duration or itinerary-derived duration
    const durationDays = this.calculateDuration();
    const tripEndDate = new Date(this.startDate);
    tripEndDate.setDate(tripEndDate.getDate() + durationDays);
    
    if (this.status === 'cancelled') {
        return 'cancelled';
    }
    
    if (now < this.startDate) {
        return this.bookingId ? 'booked' : 'planning';
    }
    
    if (now >= this.startDate && now <= tripEndDate) {
        return 'active';
    }
    
    if (now > tripEndDate) {
        return 'completed';
    }
    
    return this.status;
};

// Method to calculate trip duration from itinerary
tripSchema.methods.calculateDuration = function() {
    // For packaged trips with set duration, use that value
    if (this.tripType === 'packaged' && this.duration && this.duration.days > 0) {
        return this.duration.days;
    }
    
    // For self-planned trips or if no duration set, calculate from itinerary
    if (this.itinerary && this.itinerary.length > 0) {
        // Find the maximum day number in the itinerary
        const maxDay = Math.max(...this.itinerary.map(day => day.day));
        return maxDay;
    }
    
    // Default to stored duration or 0 if no itinerary yet
    return this.duration.days || 0;
};

// Method to update the duration based on itinerary
tripSchema.methods.updateDurationFromItinerary = function() {
    if (this.itinerary && this.itinerary.length > 0) {
        const maxDay = Math.max(...this.itinerary.map(day => day.day));
        this.duration = {
            days: maxDay,
            nights: Math.max(0, maxDay - 1)
        };
    }
    return this;
};

// Pre-save middleware to update duration based on itinerary
tripSchema.pre('save', function(next) {
    // Only auto-update duration for self-planned trips
    if (this.tripType === 'self-planned') {
        this.updateDurationFromItinerary();
    }
    next();
});

const Trip = mongoose.model('Trip', tripSchema);

module.exports = Trip; 