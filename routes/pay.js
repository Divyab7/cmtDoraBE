// importing modules
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const sha256 = require("sha256");
const uniqid = require("uniqid");
const { UserModel } = require("../models/User");
const Deal = require("../models/Deal");
const Booking = require("../models/Booking");
const Trip = require("../models/Trip");
const { mustRequiredLogin, deviceInfo } = require("../middleware/requiredLogin");
const { UserProgress } = require("../models/Gamification");
// locationModel
const router = express.Router();
// creating express application
// TripModel

// UAT environment

// const PHONE_PE_HOST_URL = "https://api-preprod.phonepe.com/apis/hermes";
const PHONE_PE_HOST_URL = "https://api.phonepe.com/apis/hermes";
const SALT_INDEX = 1;
// const SALT_KEY = "f94f0bb9-bcfb-4077-adc0-3f8408a17bf7";

const APP_BE_URL = "https://clonemytrips.com";

// Helper function to parse DD-MM-YYYY to Date object - same as in trip.js
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

// setting up middleware
// app.use(cors());
// app.use(bodyParser.json());
// app.use(
//   bodyParser.urlencoded({
//     extended: false,
//   })
// );

// Helper function to calculate price for passengers
async function calculateTotalPrice(
  deal,
  numberOfPassengers,
  rateType = "Standard",
  badgeId = null,
  userProgress = null
) {
  if (!deal.pricing || deal.pricing.length === 0) {
    throw new Error("Deal pricing information not found");
  }

  // Sort pricing tiers by min group size to find the applicable tier
  const sortedPricingTiers = [...deal.pricing].sort(
    (a, b) => a.groupSize.min - b.groupSize.min
  );

  // Find the appropriate pricing tier
  let pricingTier = null;

  // If number of passengers is less than minimum group size of first tier,
  // use the first tier but still calculate for actual number of passengers
  if (numberOfPassengers < sortedPricingTiers[0].groupSize.min) {
    pricingTier = sortedPricingTiers[0];
  } else {
    // Find the highest tier where numberOfPassengers >= min
    for (let i = sortedPricingTiers.length - 1; i >= 0; i--) {
      if (numberOfPassengers >= sortedPricingTiers[i].groupSize.min) {
        pricingTier = sortedPricingTiers[i];
        break;
      }
    }
  }

  if (!pricingTier) {
    throw new Error(
      "No suitable pricing tier found for the given number of passengers"
    );
  }

  // Get base rate for the selected type
  const baseRate = pricingTier.rates[rateType];
  if (!baseRate) {
    throw new Error(`Rate type ${rateType} not found in pricing tier`);
  }

  // Calculate actual price based on price type
  let actualPrice;
  if (deal.priceType === "person") {
    actualPrice = baseRate * numberOfPassengers;
  } else {
    // group pricing
    actualPrice = baseRate; // one price for the entire group
  }

  // Apply commission to get display price
  // Display_Price = P × (1 + Commission%)
  const commissionPercentage = deal.commissionPercentage || 0;
  let displayPrice = (actualPrice / (100 - commissionPercentage)) * 100;

  // Apply badge discount if applicable
  if (badgeId && userProgress) {
    // Check if badge is eligible for this deal
    const eligibleBadge = deal.gamification?.eligibleBadges?.find(
      (badge) => badge.badgeId.toString() === badgeId
    );

    // Check if user has the badge
    const userHasBadge = userProgress.badges?.some(
      (badge) => badge.badgeId.toString() === badgeId && badge.isActive
    );

    if (eligibleBadge && userHasBadge) {
      const discountPercentage = eligibleBadge.discountPercentage;
      // Final_Price = Display_Price × (1 - Badge_Discount%)
      displayPrice = displayPrice * (1 - discountPercentage / 100);
    }
  }

  return Math.round(displayPrice); // Round to nearest integer to avoid floating point issues
}

// Defining a test router
router.get("/", (req, res) => {
  res.send("PhonePe Integration APIs!");
});

router.post("/pay", mustRequiredLogin, deviceInfo, async function (req, res) {
    try {
        const userId = req.user.id;
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const { dealId, passengerIds, tripDate, rateType = 'Standard', badgeId } = req.body;

        // Validate required fields
        if (!userId || !dealId || !passengerIds || !tripDate) {
            return res.status(400).json({ 
                message: "Missing required fields: userId, dealId, passengerIds, tripDate" 
            });
        }

        // Fetch user progress, deal, and other necessary details
        const [deal, userProgress] = await Promise.all([
            Deal.findById(dealId),
            badgeId ? UserProgress.findOne({ userId }) : null
        ]);

        if (!deal) {
            return res.status(404).json({ 
                message: "Deal not found" 
            });
        }

        // If badge ID is provided, validate it
        if (badgeId) {
            // Check if badge is eligible for this deal
            const eligibleBadge = deal.gamification?.eligibleBadges?.find(
                badge => badge.badgeId.toString() === badgeId
            );

            if (!eligibleBadge) {
                return res.status(400).json({
                    message: "Badge is not eligible for this deal"
                });
            }

            // Check if user has the badge
            if (!userProgress || !userProgress.badges?.some(
                badge => badge.badgeId.toString() === badgeId && badge.isActive
            )) {
                return res.status(400).json({
                    message: "User does not possess this badge"
                });
            }
        }

        // Parse tripDate from DD-MM-YYYY format or fallback to standard date parsing
        let tripDateObj;
        try {
            // First try to parse as DD-MM-YYYY
            if (typeof tripDate === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(tripDate)) {
                tripDateObj = parseDateString(tripDate);
            } else {
                // Fallback to standard date parsing
                tripDateObj = new Date(tripDate);
                if (isNaN(tripDateObj.getTime())) {
                    throw new Error('Invalid date format');
                }
            }
        } catch (dateError) {
            return res.status(400).json({
                message: "Invalid date format for tripDate. Use DD-MM-YYYY format.",
                error: dateError.message
            });
        }

        // Validate trip date against deal validity
        if (deal.validity) {
            if (deal.validity.startDate && tripDateObj < deal.validity.startDate) {
                return res.status(400).json({ 
                    message: "Trip date is before deal validity period" 
                });
            }
            if (deal.validity.endDate && tripDateObj > deal.validity.endDate) {
                return res.status(400).json({ 
                    message: "Trip date is after deal validity period" 
                });
            }
        }

        // Calculate total price with badge discount if applicable
        const amount = await calculateTotalPrice(deal, passengerIds.length, rateType, badgeId, userProgress);

        // Generate merchant transaction ID
        const merchantTransactionId = uniqid();

        // Create a pending booking with initial pending transaction
        const booking = new Booking({
            userId,
            dealId,
            passengerDetails: passengerIds,
            dateOfTrip: tripDateObj,
            type: 'full',
            totalAmount: amount,
            remainingAmount: amount,
            status: 'unCancelled',
            bookingType: 'deal',
            appliedBadgeId: badgeId, // Store the applied badge ID
            transactions: [{
                phonePeTxId: merchantTransactionId,
                dateOfTx: new Date(),
                status: 'pending',
                amount: amount
            }]
        });
        await booking.save();

        // Prepare the payload for the payment request
        const normalPayLoad = {
            merchantId: process.env.MERCHANTID,
            merchantTransactionId,
            merchantUserId: userId,
            amount: Math.round(amount * 100), // converting to paise
            redirectUrl: `${APP_BE_URL}/payment/validate/${merchantTransactionId}`,
            redirectMode: "REDIRECT",
            mobileNumber: user.phoneNumber || "",
            paymentInstrument: {
                type: "PAY_PAGE",
            },
            callbackUrl: `${APP_BE_URL}/payment/callback/${booking._id}`,
        };

        // Make base64 encoded payload
        let bufferObj = Buffer.from(JSON.stringify(normalPayLoad), "utf8");
        let base64EncodedPayload = bufferObj.toString("base64");

        // Generate X-VERIFY header
        let string = base64EncodedPayload + "/pg/v1/pay" + process.env.SALT_KEY;
        let sha256_val = sha256(string);
        let xVerifyChecksum = sha256_val + "###" + SALT_INDEX;

        const response = await axios.post(
            `${PHONE_PE_HOST_URL}/pg/v1/pay`,
            {
                request: base64EncodedPayload,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-VERIFY": xVerifyChecksum,
                    accept: "application/json",
                    "Referer-policy": "strict-origin-when-cross-origin",
                },
            }
        );

        return res.status(200).json({
            ...response.data,
            bookingId: booking._id,
            merchantTransactionId,
            appliedBadgeDiscount: badgeId ? true : false
        });
    } catch (error) {
        console.error('Payment initiation error:', error);
        return res.status(500).json({
            message: "Error initiating payment",
            error: error.message
        });
  }
});

// endpoint to check the status of payment
router.get(
  "/payment/validate/:merchantTransactionId",
  async function (req, res) {
    const { merchantTransactionId } = req.params;

    try {
      // Find the booking with this transaction ID
      const booking = await Booking.findOne({
        "transactions.phonePeTxId": merchantTransactionId,
      });

      if (!booking) {
        return res.status(404).json({
          message: "Booking not found for this transaction",
        });
      }

      // check the status of the payment using merchantTransactionId
      if (merchantTransactionId) {
        let statusUrl = `${PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANTID}/${merchantTransactionId}`;

        // generate X-VERIFY
        let string = `/pg/v1/status/${process.env.MERCHANTID}/${merchantTransactionId}${process.env.SALT_KEY}`;
        let sha256_val = sha256(string);
        let xVerifyChecksum = sha256_val + "###" + SALT_INDEX;

        const response = await axios.get(statusUrl, {
            headers: {
              "Content-Type": "application/json",
              "X-VERIFY": xVerifyChecksum,
              "X-MERCHANT-ID": process.env.MERCHANTID, //merchantTransactionId,
              accept: "application/json",
            },
          });

        if (response.data && response.data.code === "PAYMENT_SUCCESS") {
            // Update the transaction status in booking
            const transaction = booking.transactions.find(t => t.phonePeTxId === merchantTransactionId);
            if (transaction) {
                transaction.status = 'success';
                transaction.dateOfTx = new Date(); // Update with actual success time
                
                // Update remaining amount
                booking.remainingAmount = Math.max(0, booking.remainingAmount - transaction.amount);
                
                await booking.save();
                
                // Create a Trip for successful payment
                try {
                    // Check if a trip already exists for this booking
                    const existingTrip = await Trip.findOne({ bookingId: booking._id });
                    
                    if (!existingTrip && booking.bookingType === 'deal') {
                        // Verify that the deal exists
                        const dealExists = await Deal.findById(booking.dealId).exec();
                        if (dealExists) {
                            // Create a new trip from the booking
                            const trip = await Trip.createFromBooking(booking._id);
                            await trip.save();
                            
                            console.log(`Created new trip ${trip._id} for booking ${booking._id}`);
                        } else {
                            console.error(`Deal ${booking.dealId} not found for booking ${booking._id}`);
                        }
                    }
                } catch (tripError) {
                    // Don't fail the payment if trip creation fails
                    console.error('Error creating trip from booking:', tripError);
                }
            }

            return res.status(200).json({
                ...response.data,
                bookingId: booking._id,
                paymentDate: formatDate(new Date()), // Add formatted payment date
                tripDate: formatDate(booking.dateOfTrip) // Add formatted trip date
            });
        } else {
            // Update transaction status to failed if payment failed
            const transaction = booking.transactions.find(t => t.phonePeTxId === merchantTransactionId);
            if (transaction) {
                transaction.status = 'failed';
                transaction.dateOfTx = new Date();
                await booking.save();
            }

          return res.status(400).json({
            message: "Payment failed",
            code: response.data.code,
            bookingId: booking._id,
          });
        }
      } else {
        return res.status(400).json({
          message: "Invalid merchant transaction ID",
        });
      }
    } catch (error) {
      console.error("Payment validation error:", error);
      return res.status(500).json({
        message: "Error validating payment",
        error: error.message,
      });
    }
  }
);

// Create a callback endpoint
router.post(
    "/callback/:bookingId",
    async function (req, res) {
        try {
            const { bookingId } = req.params;
            const callbackData = req.body;
            
            // Verify the callback using X-VERIFY if needed
            
            console.log(`Received payment callback for booking ${bookingId}:`, callbackData);
            
            // Find the booking
            const booking = await Booking.findById(bookingId);
            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: "Booking not found"
                });
            }
            
            // Process the callback data
            if (callbackData.code === "PAYMENT_SUCCESS") {
                // Find the transaction
                const transaction = booking.transactions.find(
                    t => t.phonePeTxId === callbackData.merchantTransactionId
                );
                
                if (transaction) {
                    transaction.status = 'success';
                    transaction.dateOfTx = new Date();
                    
                    // Update remaining amount
                    booking.remainingAmount = Math.max(0, booking.remainingAmount - transaction.amount);
                    
                    await booking.save();
                    
                    // Create a Trip for successful payment
                    try {
                        // Check if a trip already exists for this booking
                        const existingTrip = await Trip.findOne({ bookingId: booking._id });
                        
                        if (!existingTrip && booking.bookingType === 'deal') {
                            // Verify that the deal exists
                            const dealExists = await Deal.findById(booking.dealId).exec();
                            if (dealExists) {
                                // Create a new trip from the booking
                                const trip = await Trip.createFromBooking(booking._id);
                                await trip.save();
                                
                                console.log(`Created new trip ${trip._id} for booking ${booking._id}`);
                            } else {
                                console.error(`Deal ${booking.dealId} not found for booking ${booking._id}`);
                            }
                        }
                    } catch (tripError) {
                        // Don't fail the callback if trip creation fails
                        console.error('Error creating trip from booking:', tripError);
                    }
                }
            }
            
            // Always return success to PhonePe with formatted date info
            return res.status(200).json({
                success: true,
                message: "Callback received successfully",
                callbackDate: formatDate(new Date()),
                tripDate: booking ? formatDate(booking.dateOfTrip) : null
            });
            
        } catch (error) {
            console.error('Payment callback error:', error);
            // Always return success to PhonePe even on error to prevent retries
            return res.status(200).json({
                success: true,
                message: "Callback received"
            });
        }
    }
);

// Starting the server
// const port = 3000;

module.exports = router;
