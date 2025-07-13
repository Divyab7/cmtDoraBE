const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Trip = require('../models/Trip');
const Booking = require('../models/Booking');
const Deal = require('../models/Deal');
const { UserModel } = require('../models/User');
const { mustRequiredLogin, deviceInfo } = require('../middleware/requiredLogin');

// Helper function to parse DD-MM-YYYY to Date object
function parseDateString(dateString) {
    if (!dateString) return null;
    
    // Validate date format
    if (!/^\d{2}-\d{2}-\d{4}$/.test(dateString)) {
        throw new Error('Invalid date format. Use DD-MM-YYYY');
    }
    
    const [day, month, year] = dateString.split('-').map(num => parseInt(num, 10));
    
    // Validate month and day ranges
    if (month < 1 || month > 12) throw new Error('Invalid month');
    if (day < 1 || day > 31) throw new Error('Invalid day');
    
    const date = new Date(year, month - 1, day);
    
    // Validate if it's a valid date (handles cases like 31st Feb)
    if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
        throw new Error('Invalid date');
    }
    
    return date;
}

// Helper function to format Date to DD-MM-YYYY
function formatDate(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null; // Handle invalid date
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

// Format trip data for response
function formatTripForResponse(trip) {
    if (!trip) return null;
    
    const formattedTrip = trip.toObject ? trip.toObject() : JSON.parse(JSON.stringify(trip));
    
    // Format top-level dates
    if (formattedTrip.startDate) {
        formattedTrip.startDate = formatDate(formattedTrip.startDate);
    }
    
    // Format itinerary dates
    if (formattedTrip.itinerary && Array.isArray(formattedTrip.itinerary)) {
        formattedTrip.itinerary = formattedTrip.itinerary.map(day => {
            const formattedDay = { ...day };
            
            // Format accommodation dates
            if (formattedDay.accommodationDetails) {
                if (formattedDay.accommodationDetails.checkIn) {
                    formattedDay.accommodationDetails.checkIn = formatDate(formattedDay.accommodationDetails.checkIn);
                }
                if (formattedDay.accommodationDetails.checkOut) {
                    formattedDay.accommodationDetails.checkOut = formatDate(formattedDay.accommodationDetails.checkOut);
                }
            }
            
            // Format transportation dates
            if (formattedDay.transportationDetails) {
                if (formattedDay.transportationDetails.departureTime) {
                    formattedDay.transportationDetails.departureTime = formatDate(formattedDay.transportationDetails.departureTime);
                }
                if (formattedDay.transportationDetails.arrivalTime) {
                    formattedDay.transportationDetails.arrivalTime = formatDate(formattedDay.transportationDetails.arrivalTime);
                }
            }
            
            return formattedDay;
        });
    }
    
    return formattedTrip;
}

// GET /trips - List all trips for a user
router.get('/', mustRequiredLogin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            tripType,
            startDate,
            endDate
        } = req.query;

        const userId = req.user.id;

        // Build query
        const query = { userId };
        
        // Add filters if provided
        if (tripType) query.tripType = tripType;
        if (status) query.status = status;
        
        // Parse start date if provided in DD-MM-YYYY format
        if (startDate) {
            try {
                query.startDate = { $gte: parseDateString(startDate) };
            } catch (dateError) {
                // If date parsing fails, try the default format
                query.startDate = { $gte: new Date(startDate) };
            }
        }
        
        // Parse end date if provided in DD-MM-YYYY format
        if (endDate) {
            let endDateObj;
            try {
                endDateObj = parseDateString(endDate);
            } catch (dateError) {
                // If date parsing fails, try the default format
                endDateObj = new Date(endDate);
            }
            
            query.$or = [
                { startDate: { $lte: endDateObj } },
                {
                    $expr: {
                        $lte: [
                            { $add: ['$startDate', { $multiply: ['$duration.days', 24 * 60 * 60 * 1000] }] },
                            endDateObj
                        ]
                    }
                }
            ];
        }

        // Calculate skip for pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Fetch trips with populated data
        const trips = await Trip.find(query)
            .populate({
                path: 'dealId',
                select: 'packageName duration pricing destinations',
                model: 'Deal'
            })
            .populate({
                path: 'passengers.passengerId',
                model: 'user'
            })
            .sort({ startDate: 1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Calculate total count for pagination
        const totalCount = await Trip.countDocuments(query);

        // Process trips to update status based on current date
        const processedTrips = trips.map(trip => {
            const currentStatus = trip.updateStatus();
            
            // If status has changed, update in database but don't wait for it
            if (currentStatus !== trip.status) {
                Trip.updateOne({ _id: trip._id }, { status: currentStatus }).exec();
                trip.status = currentStatus;
            }

            return trip;
        });

        // Format dates in response
        const formattedTrips = processedTrips.map(trip => formatTripForResponse(trip));

        res.status(200).json({
            success: true,
            data: formattedTrips,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error fetching trips:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching trips',
            error: error.message
        });
    }
});

// GET /trips/:id - Get a single trip by ID
router.get('/:id', mustRequiredLogin, async (req, res) => {
    try {
        const userId = req.user.id;
        const tripId = req.params.id;

        const trip = await Trip.findOne({ _id: tripId, userId })
            .populate({
                path: 'dealId',
                select: 'packageName duration pricing destinations itinerary inclusions exclusions transportation',
                model: 'Deal'
            })
            .populate({
                path: 'bookingId',
                select: 'totalAmount remainingAmount transactions',
                model: 'Booking'
            })
            .populate({
                path: 'passengers.passengerId',
                model: 'user'
            });

        if (!trip) {
            return res.status(404).json({
                success: false,
                message: 'Trip not found or unauthorized'
            });
        }

        // Update trip status based on current date
        const currentStatus = trip.updateStatus();
        if (currentStatus !== trip.status) {
            trip.status = currentStatus;
            await trip.save();
        }

        // Format dates in response
        const formattedTrip = formatTripForResponse(trip);

        res.status(200).json({
            success: true,
            data: formattedTrip
        });

    } catch (error) {
        console.error('Error fetching trip:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching trip',
            error: error.message
        });
    }
});

// POST /trips - Create a new self-planned trip
router.post('/', mustRequiredLogin, async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            tripName,
            startDate,
            duration,
            passengers,
            destinations,
            notes,
            itinerary
        } = req.body;

        // Validate required fields
        if (!tripName || !startDate) {
            return res.status(400).json({
                success: false,
                message: 'Required fields missing: tripName, startDate'
            });
        }
        // Parse startDate from DD-MM-YYYY format
        let parsedStartDate;
        try {
            parsedStartDate = parseDateString(startDate);
        } catch (dateError) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format',
                error: dateError.message
            });
        }

        // Create the trip
        const trip = new Trip({
            userId,
            tripType: 'self-planned', // Default for manual creation
            tripName,
            startDate: parsedStartDate,
            duration: duration || { days: 0, nights: 0 }, // Optional initial duration
            passengers: passengers || [],
            destinations: destinations || [],
            itinerary: itinerary || [],
            notes,
            status: 'planning'
        });

        // If itinerary is provided, duration will be calculated automatically via pre-save hook
        await trip.save();

        // Format the response with DD-MM-YYYY date format
        const formattedTrip = formatTripForResponse(trip);

        res.status(201).json({
            success: true,
            message: 'Self-planned trip created successfully',
            data: formattedTrip
        });

    } catch (error) {
        console.error('Error creating self-planned trip:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating self-planned trip',
            error: error.message
        });
    }
});

// PUT /trips/:id - Update a trip
router.put('/:id', mustRequiredLogin, async (req, res) => {
    try {
        const userId = req.user.id;
        const tripId = req.params.id;
        const updateData = req.body;

        // Find trip and check ownership
        const trip = await Trip.findOne({ _id: tripId, userId });
        if (!trip) {
            return res.status(404).json({
                success: false,
                message: 'Trip not found or unauthorized'
            });
        }

        // Disallow changing tripType and related references
        delete updateData.tripType;
        delete updateData.bookingId;
        delete updateData.dealId;
        delete updateData.userId;

        // Parse startDate if provided
        if (updateData.startDate) {
            try {
                updateData.startDate = parseDateString(updateData.startDate);
            } catch (dateError) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format',
                    error: dateError.message
                });
            }
        }

        // Update allowed fields
        Object.keys(updateData).forEach(key => {
            if (key !== '_id' && key !== '__v') {
                trip[key] = updateData[key];
            }
        });

        // Update trip status
        trip.status = trip.updateStatus();
        
        await trip.save();

        // Format the response with DD-MM-YYYY date format
        const formattedTrip = formatTripForResponse(trip);

        res.status(200).json({
            success: true,
            message: 'Trip updated successfully',
            data: formattedTrip
        });

    } catch (error) {
        console.error('Error updating trip:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating trip',
            error: error.message
        });
    }
});

// DELETE /trips/:id - Delete a trip
router.delete('/:id', mustRequiredLogin, async (req, res) => {
    try {
        const userId = req.user.id;
        const tripId = req.params.id;

        const result = await Trip.deleteOne({ _id: tripId, userId });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Trip not found or unauthorized'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Trip deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting trip:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting trip',
            error: error.message
        });
    }
});

// PATCH /trips/:id/itinerary - Add or update a day in the trip itinerary
router.patch('/:id/itinerary', mustRequiredLogin, async (req, res) => {
    try {
        const userId = req.user.id;
        const tripId = req.params.id;
        const { day, itineraryData } = req.body;

        if (!day || !itineraryData) {
            return res.status(400).json({
                success: false,
                message: 'Day number and itinerary data are required'
            });
        }

        // Find trip and check ownership
        const trip = await Trip.findOne({ _id: tripId, userId });
        if (!trip) {
            return res.status(404).json({
                success: false,
                message: 'Trip not found or unauthorized'
            });
        }

        // Ensure itineraryData has a day property
        itineraryData.day = parseInt(day);
        
        // Parse dates for accommodationDetails if provided
        if (itineraryData.accommodationDetails) {
            try {
                if (itineraryData.accommodationDetails.checkIn && typeof itineraryData.accommodationDetails.checkIn === 'string' && itineraryData.accommodationDetails.checkIn.match(/^\d{2}-\d{2}-\d{4}$/)) {
                    itineraryData.accommodationDetails.checkIn = parseDateString(itineraryData.accommodationDetails.checkIn);
                }
                if (itineraryData.accommodationDetails.checkOut && typeof itineraryData.accommodationDetails.checkOut === 'string' && itineraryData.accommodationDetails.checkOut.match(/^\d{2}-\d{2}-\d{4}$/)) {
                    itineraryData.accommodationDetails.checkOut = parseDateString(itineraryData.accommodationDetails.checkOut);
                }
            } catch (dateError) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format in accommodation details',
                    error: dateError.message
                });
            }
        }
        
        // Parse dates for transportationDetails if provided
        if (itineraryData.transportationDetails) {
            try {
                if (itineraryData.transportationDetails.departureTime && typeof itineraryData.transportationDetails.departureTime === 'string' && itineraryData.transportationDetails.departureTime.match(/^\d{2}-\d{2}-\d{4}$/)) {
                    itineraryData.transportationDetails.departureTime = parseDateString(itineraryData.transportationDetails.departureTime);
                }
                if (itineraryData.transportationDetails.arrivalTime && typeof itineraryData.transportationDetails.arrivalTime === 'string' && itineraryData.transportationDetails.arrivalTime.match(/^\d{2}-\d{2}-\d{4}$/)) {
                    itineraryData.transportationDetails.arrivalTime = parseDateString(itineraryData.transportationDetails.arrivalTime);
                }
            } catch (dateError) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format in transportation details',
                    error: dateError.message
                });
            }
        }
        
        // Validate activities if provided
        if (itineraryData.activities && Array.isArray(itineraryData.activities)) {
            // Check each activity has the required fields
            const isValid = itineraryData.activities.every(activity => 
                activity.activityName && typeof activity.activityName === 'string'
            );
            
            if (!isValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Each activity must have an activityName'
                });
            }
        }
        
        // Find if this day already exists in the itinerary
        const existingDayIndex = trip.itinerary.findIndex(item => item.day === itineraryData.day);
        
        if (existingDayIndex >= 0) {
            // Update existing day
            trip.itinerary[existingDayIndex] = { 
                ...trip.itinerary[existingDayIndex].toObject(), 
                ...itineraryData 
            };
        } else {
            // Add new day
            trip.itinerary.push(itineraryData);
            
            // Sort itinerary by day number
            trip.itinerary.sort((a, b) => a.day - b.day);
        }
        
        // Duration will be updated automatically via pre-save hook
        await trip.save();

        // Format the response with dates in DD-MM-YYYY format
        const formattedItinerary = trip.itinerary.map(day => {
            const formattedDay = day.toObject();
            
            // Format accommodation dates
            if (formattedDay.accommodationDetails) {
                if (formattedDay.accommodationDetails.checkIn) {
                    formattedDay.accommodationDetails.checkIn = formatDate(formattedDay.accommodationDetails.checkIn);
                }
                if (formattedDay.accommodationDetails.checkOut) {
                    formattedDay.accommodationDetails.checkOut = formatDate(formattedDay.accommodationDetails.checkOut);
                }
            }
            
            // Format transportation dates
            if (formattedDay.transportationDetails) {
                if (formattedDay.transportationDetails.departureTime) {
                    formattedDay.transportationDetails.departureTime = formatDate(formattedDay.transportationDetails.departureTime);
                }
                if (formattedDay.transportationDetails.arrivalTime) {
                    formattedDay.transportationDetails.arrivalTime = formatDate(formattedDay.transportationDetails.arrivalTime);
                }
            }
            
            return formattedDay;
        });

        res.status(200).json({
            success: true,
            message: 'Trip itinerary updated successfully',
            data: {
                itinerary: formattedItinerary,
                duration: trip.duration
            }
        });

    } catch (error) {
        console.error('Error updating trip itinerary:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating trip itinerary',
            error: error.message
        });
    }
});

// DELETE /trips/:id/itinerary/:day - Remove a day from the itinerary
// router.delete('/:id/itinerary/:day', mustRequiredLogin, async (req, res) => {
//     try {
//         const userId = req.user.id;
//         const tripId = req.params.id;
//         const dayNumber = parseInt(req.params.day);

//         // Find trip and check ownership
//         const trip = await Trip.findOne({ _id: tripId, userId });
//         if (!trip) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Trip not found or unauthorized'
//             });
//         }

//         // Find the day in the itinerary
//         const dayIndex = trip.itinerary.findIndex(item => item.day === dayNumber);
        
//         if (dayIndex === -1) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Day not found in itinerary'
//             });
//         }

//         // Remove the day from the itinerary
//         trip.itinerary.splice(dayIndex, 1);
        
//         // Duration will be updated automatically via pre-save hook
//         await trip.save();

//         res.status(200).json({
//             success: true,
//             message: 'Itinerary day removed successfully',
//             data: {
//                 itinerary: trip.itinerary,
//                 duration: trip.duration
//             }
//         });

//     } catch (error) {
//         console.error('Error removing itinerary day:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error removing itinerary day',
//             error: error.message
//         });
//     }
// });

// PATCH /trips/:id/itinerary/:day/activities - Manage activities for a specific day
// router.patch('/:id/itinerary/:day/activities', mustRequiredLogin, async (req, res) => {
//     try {
//         const userId = req.user.id;
//         const tripId = req.params.id;
//         const dayNumber = parseInt(req.params.day);
//         const { action, activities } = req.body;

//         if (!action || !['add', 'update', 'remove'].includes(action)) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Valid action (add, update, or remove) is required'
//             });
//         }

//         // Find trip and check ownership
//         const trip = await Trip.findOne({ _id: tripId, userId });
//         if (!trip) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Trip not found or unauthorized'
//             });
//         }

//         // Find the day in the itinerary
//         const dayIndex = trip.itinerary.findIndex(item => item.day === dayNumber);
        
//         if (dayIndex === -1) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Day not found in itinerary'
//             });
//         }

//         // Perform action based on request
//         switch (action) {
//             case 'add':
//                 // Validate activities
//                 if (!activities || !Array.isArray(activities) || activities.length === 0) {
//                     return res.status(400).json({
//                         success: false,
//                         message: 'Activities array is required for add action'
//                     });
//                 }
                
//                 // Validate each activity
//                 for (const activity of activities) {
//                     if (!activity.activityName) {
//                         return res.status(400).json({
//                             success: false,
//                             message: 'Each activity must have an activityName'
//                         });
//                     }
//                 }
                
//                 // Add activities to the day
//                 if (!trip.itinerary[dayIndex].activities) {
//                     trip.itinerary[dayIndex].activities = [];
//                 }
                
//                 trip.itinerary[dayIndex].activities.push(...activities);
//                 break;
                
//             case 'update':
//                 // Validate activity ID and data
//                 if (!activities || !Array.isArray(activities) || activities.length === 0) {
//                     return res.status(400).json({
//                         success: false,
//                         message: 'Activities array with activity IDs is required for update action'
//                     });
//                 }
                
//                 // Update each activity that matches by ID
//                 activities.forEach(updatedActivity => {
//                     if (!updatedActivity._id) {
//                         return; // Skip activities without ID
//                     }
                    
//                     const activityIndex = trip.itinerary[dayIndex].activities.findIndex(
//                         a => a._id.toString() === updatedActivity._id.toString()
//                     );
                    
//                     if (activityIndex !== -1) {
//                         // Ensure activityName is present
//                         if (!updatedActivity.activityName) {
//                             updatedActivity.activityName = trip.itinerary[dayIndex].activities[activityIndex].activityName;
//                         }
                        
//                         // Update the activity
//                         trip.itinerary[dayIndex].activities[activityIndex] = {
//                             ...trip.itinerary[dayIndex].activities[activityIndex].toObject(),
//                             ...updatedActivity
//                         };
//                     }
//                 });
//                 break;
                
//             case 'remove':
//                 // Validate activity IDs
//                 if (!activities || !Array.isArray(activities) || activities.length === 0) {
//                     return res.status(400).json({
//                         success: false,
//                         message: 'Activity IDs array is required for remove action'
//                     });
//                 }
                
//                 // Filter out activities that match the provided IDs
//                 const activityIds = activities.map(a => a._id ? a._id.toString() : a.toString());
//                 trip.itinerary[dayIndex].activities = trip.itinerary[dayIndex].activities.filter(
//                     activity => !activityIds.includes(activity._id.toString())
//                 );
//                 break;
//         }
        
//         await trip.save();
        
//         res.status(200).json({
//             success: true,
//             message: `Activities ${action === 'add' ? 'added to' : action === 'update' ? 'updated in' : 'removed from'} itinerary day successfully`,
//             data: {
//                 day: trip.itinerary[dayIndex]
//             }
//         });
        
//     } catch (error) {
//         console.error('Error managing activities:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error managing activities',
//             error: error.message
//         });
//     }
// });

module.exports = router; 