const express = require("express");
const router = express.Router();
const Deal = require("../models/Deal");

// Helper function to calculate display price
const calculateDisplayPrice = (actualPrice, commissionPercentage) => {
  if (!actualPrice) return null;
  return (actualPrice / (100 - commissionPercentage)) * 100;
};

// Helper function to transform pricing data
const transformPricingData = (pricing, commissionPercentage) => {
  return pricing.map((priceGroup) => ({
    ...priceGroup,
    rates: {
      Standard: calculateDisplayPrice(
        priceGroup.rates.Standard,
        commissionPercentage
      ),
      Deluxe: calculateDisplayPrice(
        priceGroup.rates.Deluxe,
        commissionPercentage
      ),
      SuperDeluxe: calculateDisplayPrice(
        priceGroup.rates.SuperDeluxe,
        commissionPercentage
      ),
      Luxury: calculateDisplayPrice(
        priceGroup.rates.Luxury,
        commissionPercentage
      ),
      Premium: calculateDisplayPrice(
        priceGroup.rates.Premium,
        commissionPercentage
      ),
    },
    extraOptions: {
      WithExtraMattress: calculateDisplayPrice(
        priceGroup.extraOptions?.WithExtraMattress,
        commissionPercentage
      ),
      WithoutExtraMattress: calculateDisplayPrice(
        priceGroup.extraOptions?.WithoutExtraMattress,
        commissionPercentage
      ),
    },
  }));
};

// Get list of all deals with search, filters and pagination
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      minPrice,
      maxPrice,
      destinations,
      packageType,
      duration,
      sortBy = "createdAt",
      sortOrder = "desc",
      startDate,
      endDate,
    } = req.query;

    // Build query
    const query = {};

    // Search in package name and destinations
    if (search) {
      query.$or = [
        { packageName: { $regex: search, $options: "i" } },
        { destinations: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by package type
    if (packageType) {
      query.packageType = { $regex: packageType, $options: "i" };
    }

    // Filter by destinations
    if (destinations) {
      const destinationArray = destinations
        .split(",")
        .map((dest) => dest.trim());
      query.destinations = { $in: destinationArray };
    }

    // Filter by duration
    if (duration) {
      query["duration.days"] = parseInt(duration);
    }

    // Filter by price range (adjusted for display price)
    if (minPrice || maxPrice) {
      query.pricing = query.pricing || {};

      if (minPrice) {
        const minActualPrice = parseFloat(minPrice);
        query.$or = [{ "pricing.rates.Standard": { $exists: true } }];
      }

      if (maxPrice) {
        const maxActualPrice = parseFloat(maxPrice);
        query.$and = [{ "pricing.rates.Standard": { $exists: true } }];
      }
    }

    // Filter by validity dates
    if (startDate || endDate) {
      query.validity = query.validity || {};

      if (startDate) {
        query["validity.startDate"] = { $gte: new Date(startDate) };
      }

      if (endDate) {
        query["validity.endDate"] = { $lte: new Date(endDate) };
      }
    }

    // Calculate skip value for pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Prepare sort object
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get total count for pagination
    const totalDeals = await Deal.countDocuments(query);

    // Execute query with pagination
    const deals = await Deal.find(query)
      .select(
        "packageName packageType duration destinations pricing currency validity commissionPercentage gamification"
      )
      .populate("partner", "name email phone")
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // Transform deals to include display prices and remove commissionPercentage
    const transformedDeals = deals.map((deal) => {
      const dealObj = deal.toObject();
      dealObj.pricing = transformPricingData(
        dealObj.pricing,
        dealObj.commissionPercentage
      );
      return dealObj;
    });

    res.status(200).json({
      success: true,
      data: transformedDeals,
      pagination: {
        total: totalDeals,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalDeals / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching deals",
      error: error.message,
    });
  }
});

// Get details of a specific deal
router.get("/:id", async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id)
      // .select('packageName packageType duration destinations pricing currency validity itinerary commissionPercentage gamification')
      .populate("partner", "name email phone");

    if (!deal) {
      return res.status(404).json({
        success: false,
        message: "Deal not found",
      });
    }

    // Transform deal to include display prices and remove commissionPercentage
    const dealObj = deal.toObject();
    dealObj.pricing = transformPricingData(
      dealObj.pricing,
      dealObj.commissionPercentage
    );

    res.status(200).json({
      success: true,
      data: dealObj,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching deal details",
      error: error.message,
    });
  }
});

module.exports = router;
