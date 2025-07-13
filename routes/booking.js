const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Deal = require('../models/Deal');
const { UserModel } = require('../models/User');

// Helper function to calculate booking status
function calculateBookingStatus(booking, dealDuration) {
    const now = new Date();
    const tripDate = new Date(booking.dateOfTrip);
    
    // If booking is cancelled, return cancelled status
    if (booking.status === 'cancelled') {
        return 'cancelled';
    }

    // Check if there's at least one successful transaction
    const hasSuccessfulTransaction = booking.transactions.some(tx => tx.status === 'success');
    
    // If trip hasn't started and no successful transaction
    if (tripDate > now && !hasSuccessfulTransaction) {
        return 'draft';
    }

    // If trip hasn't started but has successful transaction
    if (tripDate > now && hasSuccessfulTransaction) {
        return 'upcoming';
    }

    // Calculate trip end date (if deal-based booking)
    let tripEndDate = new Date(tripDate);
    if (dealDuration && dealDuration.days) {
        tripEndDate.setDate(tripEndDate.getDate() + dealDuration.days);
    } else {
        // For independent bookings, assume 1 day duration
        tripEndDate.setDate(tripEndDate.getDate() + 1);
    }

    // If trip is ongoing
    if (now >= tripDate && now <= tripEndDate) {
        return 'active';
    }

    // If trip has ended
    if (now > tripEndDate) {
        return 'completed';
    }

    return 'upcoming'; // Default status
}

// GET /bookings - List all bookings with filters
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            bookingType,
            startDate,
            endDate,
            userId
        } = req.query;

        // Build query
        const query = {};
        
        // Add filters if provided
        if (userId) query.userId = userId;
        if (bookingType) query.bookingType = bookingType;
        if (startDate) query.dateOfTrip = { $gte: new Date(startDate) };
        if (endDate) {
            query.dateOfTrip = { ...query.dateOfTrip, $lte: new Date(endDate) };
        }

        // Calculate skip for pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Register models explicitly to ensure they're available
        mongoose.model('Deal', require('../models/Deal').schema);
        mongoose.model('user', require('../models/User').UserModel.schema);

        // Fetch bookings with populated data
        const bookings = await Booking.find(query)
            .populate({
                path: 'dealId',
                select: 'packageName duration pricing destinations',
                model: 'Deal'
            })
            .populate({
                path: 'userId',
                select: 'name email phoneNumber knownContacts',
                model: 'user'
            })
            .sort({ dateOfTrip: 1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Calculate total count for pagination
        const totalCount = await Booking.countDocuments(query);

        // Process bookings to add calculated status and format response
        const processedBookings = bookings.map(booking => {
            const dealDuration = booking.dealId?.duration;
            const calculatedStatus = calculateBookingStatus(booking, dealDuration);

            // Filter by calculated status if provided in query
            if (status && calculatedStatus !== status) {
                return null;
            }

            // Get passenger details from user's knownContacts
            const passengers = booking.passengerDetails.map(passengerId => {
                if (!booking.userId?.knownContacts) return { id: passengerId, name: 'Unknown Passenger' };
                
                const contact = booking.userId.knownContacts.find(
                    contact => contact._id.toString() === passengerId.toString()
                );
                
                return contact || { id: passengerId, name: 'Unknown Passenger' };
            });

            return {
                id: booking._id,
                bookingType: booking.bookingType,
                status: calculatedStatus,
                dealInfo: booking.dealId ? {
                    id: booking.dealId._id,
                    packageName: booking.dealId.packageName,
                    duration: booking.dealId.duration,
                    destinations: booking.dealId.destinations
                } : null,
                tripDate: booking.dateOfTrip,
                passengers,
                userInfo: booking.userId ? {
                    name: booking.userId.name,
                    email: booking.userId.email,
                    phone: booking.userId.phoneNumber
                } : null,
                paymentInfo: {
                    totalAmount: booking.totalAmount,
                    remainingAmount: booking.remainingAmount,
                    paymentStatus: booking.remainingAmount === 0 ? 'fully_paid' : 
                                 booking.remainingAmount === booking.totalAmount ? 'unpaid' : 'partially_paid'
                },
                createdAt: booking.createdAt,
                updatedAt: booking.updatedAt
            };
        }).filter(booking => booking !== null);

        res.status(200).json({
            success: true,
            data: processedBookings,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching bookings',
            error: error.message
        });
    }
});

module.exports = router;