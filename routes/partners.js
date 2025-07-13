const express = require("express");
const route = express.Router();
const Partner = require("../models/Partner");
const Deal = require("../models/Deal");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const XLSX = require("xlsx");
const Tesseract = require("tesseract.js");
const axios = require("axios");
const { UserModel, State, Country } = require("../models/User");
const {
  verifyAdminToken,
  checkAdminAccess,
} = require("../middleware/adminAuth");
const Device = require("../models/Device");
const { sendPushNotifications } = require("../utils/notificationUtil");
const { partnerCreate } = require("../controllers/partnerController");
const { requiredLogin } = require("../middleware/requiredLogin");
const { partnerLogin } = require("../controllers/partnerController");
const aiProvider = require('../utils/aiProvider');

// Access check endpoint
route.get("/check-access", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const result = checkAdminAccess(token);
  res.json(result);
});

// Apply admin middleware to all routes below this
route.post("/", requiredLogin, partnerCreate);
route.post("/login", partnerLogin);
route.use(verifyAdminToken);

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Use the temp directory for Azure compatibility
    const uploadDir = process.env.AZURE_STORAGE_TEMP || "uploads/";

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      // Documents
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/heic",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Supported formats: PDF, Word, Excel, and Images (JPEG, JPG, PNG, WebP, HEIC)"
        )
      );
    }
  },
});

// Utility function to extract text from images using OCR
async function extractTextFromImage(filePath) {
  try {
    const worker = await Tesseract.createWorker("eng");
    const {
      data: { text },
    } = await worker.recognize(filePath);
    await worker.terminate();
    return text;
  } catch (error) {
    throw new Error(`OCR failed: ${error.message}`);
  }
}

// Utility function to extract text from Excel files
async function extractTextFromExcel(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    let fullText = "";

    // Iterate through all sheets
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const sheetText = XLSX.utils.sheet_to_txt(sheet);
      fullText += `Sheet: ${sheetName}\n${sheetText}\n\n`;
    });

    return fullText;
  } catch (error) {
    throw new Error(`Excel parsing failed: ${error.message}`);
  }
}

// Utility function to extract text from PDF/Word/Excel/Images
async function extractTextFromFile(filePath, mimeType) {
  try {
    // Handle documents
    if (mimeType === "application/pdf") {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } else if (
      [
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(mimeType)
    ) {
      const result = await mammoth.extractRawText({
        path: filePath,
      });
      return result.value;
    } else if (
      [
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ].includes(mimeType)
    ) {
      return await extractTextFromExcel(filePath);
    }
    // Handle images
    else if (mimeType.startsWith("image/")) {
      return await extractTextFromImage(filePath);
    }

    throw new Error("Unsupported file type");
  } catch (error) {
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

// Function to process text with AI provider
async function processWithPerplexity(text) {
  try {
    const prompt = `
        Extract travel package information from the following text and format it as a JSON object.
        If certain fields are not found in the text, use reasonable defaults or leave them empty.
        Required format:
        {
            "packageName": "Name of the package",
            "packageType": "Type of package (e.g., Packaged Trip, Custom Tour)",
            "duration": {
                "days": number,
                "nights": number
            },
            "destinations": ["destination1", "destination2"],
            "currency": "Currency code (e.g., USD, EUR, INR)",
            "priceType": "Type of pricing (e.g., person, group)",
            "itinerary": [
                {
                    "day": number,
                    "title": "Day title",
                    "description": "Day description",
                    "accommodations": {
                        "location": "Place name",
                        "hotels": ["hotel1", "hotel2"]
                    }
                }
            ],
            "pricing": [
                {
                    "groupSize": {
                        "min": number,
                        "max": number
                    },
                    "rates": {
                        "Standard": number,
                        "Deluxe": number,
                        "SuperDeluxe": number,
                        "Luxury": number,
                        "Premium": number
                    },
                    "extraOptions": {
                        "WithExtraMattress": number,
                        "WithoutExtraMattress": number
                    }
                }
            ],
            "inclusions": ["inclusion1", "inclusion2"],
            "exclusions": ["exclusion1", "exclusion2"],
            "transportation": ["transport1", "transport2"],
            "contact": {
                "email": "contact email",
                "phone": "contact phone",
                "address": "address"
            },
            "validity": {
                "startDate": "YYYY-MM-DD",
                "endDate": "YYYY-MM-DD",
                "customBreaks": [
                    {
                        "date": "YYYY-MM-DD",
                        "recurring": "Monday/Tuesday/etc",
                        "reason": "text"
                    }
                ]
            },
            "termsAndConditions": "T&C text and notes"
        }

        Important Notes for Processing:
        1. For group sizes:
           - If a single number is found (e.g., "2 people"), set both min and max to that number
           - If a range is found (e.g., "2-4 people" or "2 to 4 people"), set min and max accordingly
           - If multiple pricing tiers exist, create separate pricing objects for each
           - Default to 1 if unclear and nothing is mentioned
           - pax means person
        2. For price type:
           - Set as "person" if prices are mentioned per person/per head/per pax
           - Set as "group" if prices are for entire group/family/package
           - Default to "person" if unclear
        3. All numbers should be actual numbers, not strings
        4. Dates must be in ISO format (YYYY-MM-DD)
        5. Currency should be a standard 3-letter code (USD, EUR, INR, etc.)
        6. If pricing information is found in different formats, normalize it to match the required structure
        7. For missing information, use null for optional fields or empty arrays for array fields
        8. Do not include any comments or explanations in the JSON
        9. Ensure all property names exactly match the schema
        10. Strictly return only JSON and nothing else

        Text to analyze:
        ${text}
        `;

    const result = await aiProvider.generateCompletion([
      { role: "user", content: prompt }
    ], {
      temperature: 0.2,
      max_tokens: 2000
    });

    if (!result.success) {
      throw new Error("Failed to process document with AI");
    }

    // Extract JSON from the response
    const jsonMatch = result.content.match(
      /```json\s*([\s\S]*?)\s*```/
    );

    // If no JSON match is found, try to parse the entire response as JSON
    let data;
    if (!jsonMatch) {
      try {
        data = JSON.parse(result.content);
      } catch (e) {
        // Try to find JSON within the response
        const potentialJson = result.content.match(/\{[\s\S]*\}/);
        if (potentialJson) {
          data = JSON.parse(potentialJson[0]);
        } else {
          throw new Error("Failed to extract JSON from AI response");
        }
      }
    } else {
      data = JSON.parse(jsonMatch[1]);
    }

    // Post-process the data to ensure correct format
    data = {
      ...data,
      priceType: data.priceType || "person", // Default to 'person' if not specified
      pricing:
        data.pricing?.map((price) => ({
          ...price,
          groupSize: {
            min:
              typeof price.groupSize === "number"
                ? price.groupSize
                : price.groupSize?.min,
            max:
              typeof price.groupSize === "number"
                ? price.groupSize
                : price.groupSize?.max,
          },
        })) || [],
    };

    return data;
  } catch (error) {
    throw new Error(`Failed to process with AI: ${error.message}`);
  }
}

// File upload and processing endpoint - only returns processed JSON
route.post(
  "/:partnerId/deals/process-file",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const partner = await Partner.findById(req.params.partnerId);
      if (!partner) {
        return res.status(404).json({ message: "Partner not found" });
      }

      try {
        // Extract text from the uploaded file
        const extractedText = await extractTextFromFile(
          req.file.path,
          req.file.mimetype
        );

        // Process the extracted text with Perplexity API
        const processedData = await processWithPerplexity(extractedText);

        // Clean up uploaded file
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error("Error cleaning up file:", cleanupError);
          // Continue execution even if cleanup fails
        }

        // Return the processed data without saving
        res.status(200).json({
          message: "File processed successfully",
          data: {
            ...processedData,
            partner: req.params.partnerId,
          },
        });
      } catch (processingError) {
        // Clean up uploaded file if it exists
        try {
          if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (cleanupError) {
          console.error("Error cleaning up file:", cleanupError);
        }
        throw processingError;
      }
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

// Partner routes

route.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const type = req.query.type;
    const status = req.query.status;
    const searchQuery = req.query.q;

    // Build query based on filters and search
    const query = {};

    // Add type and status filters
    if (type) query.type = type;
    if (status) query.status = status;

    // Add search conditions if search query exists
    if (searchQuery) {
      query.$or = [
        { name: { $regex: searchQuery, $options: "i" } },
        { "poc.name": { $regex: searchQuery, $options: "i" } },
        { "poc.email": { $regex: searchQuery, $options: "i" } },
        { type: { $regex: searchQuery, $options: "i" } },
        { services: { $regex: searchQuery, $options: "i" } },
      ];
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalCount = await Partner.countDocuments(query);

    // Get paginated partners
    const partners = await Partner.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "deals",
        select: "packageName packageType duration destinations",
      });

    res.json({
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      hasNextPage: skip + partners.length < totalCount,
      hasPrevPage: page > 1,
      results: partners,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

route.get("/:id", async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id); //.populate('deals');
    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }
    res.json(partner);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

route.put("/:id", async (req, res) => {
  try {
    console.log(req);
    const partner = await Partner.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }
    res.json(partner);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

route.delete("/:id", async (req, res) => {
  try {
    const partner = await Partner.findByIdAndDelete(req.params.id);
    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }
    // Also delete all deals associated with this partner
    await Deal.deleteMany({ partner: req.params.id });
    res.json({ message: "Partner deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Deal routes
route.post("/:partnerId/deals", async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.partnerId);
    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    const deal = new Deal({
      ...req.body,
      partner: req.params.partnerId,
    });
    await deal.save();

    partner.deals.push(deal._id);
    await partner.save();

    res.status(201).json(deal);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all deals with pagination, search and filters
route.get("/deals/all", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const searchQuery = req.query.q;

    // Filters
    const packageType = req.query.packageType;
    const priceType = req.query.priceType;
    const minPrice = req.query.minPrice;
    const maxPrice = req.query.maxPrice;
    const currency = req.query.currency;
    const destination = req.query.destination;
    const partnerId = req.query.partnerId;

    // Build query based on filters and search
    const query = {};

    // Add search conditions if search query exists
    if (searchQuery) {
      query.$or = [
        { packageName: { $regex: searchQuery, $options: "i" } },
        { packageType: { $regex: searchQuery, $options: "i" } },
        { destinations: { $regex: searchQuery, $options: "i" } },
      ];
    }

    // Add filters
    if (packageType) query.packageType = packageType;
    if (priceType) query.priceType = priceType;
    if (currency) query.currency = currency;
    if (partnerId) query.partner = partnerId;
    if (destination) {
      query.destinations = { $regex: destination, $options: "i" };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query["pricing.rates"] = {};
      if (minPrice) query["pricing.rates"].$gte = parseFloat(minPrice);
      if (maxPrice) query["pricing.rates"].$lte = parseFloat(maxPrice);
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalCount = await Deal.countDocuments(query);

    // Get paginated deals
    const deals = await Deal.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "partner",
        select: "name type status",
      });

    res.json({
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      hasNextPage: skip + deals.length < totalCount,
      hasPrevPage: page > 1,
      results: deals,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get deals for a specific partner with pagination and filters

route.get("/:partnerId/deals", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const searchQuery = req.query.q;

    // Filters
    const packageType = req.query.packageType;
    const priceType = req.query.priceType;
    const minPrice = req.query.minPrice;
    const maxPrice = req.query.maxPrice;
    const currency = req.query.currency;
    const destination = req.query.destination;

    // Build query
    const query = { partner: req.params.partnerId };

    // Add search conditions
    if (searchQuery) {
      query.$or = [
        { packageName: { $regex: searchQuery, $options: "i" } },
        { packageType: { $regex: searchQuery, $options: "i" } },
        { destinations: { $regex: searchQuery, $options: "i" } },
      ];
    }

    // Add filters
    if (packageType) query.packageType = packageType;
    if (priceType) query.priceType = priceType;
    if (currency) query.currency = currency;
    if (destination) {
      query.destinations = { $regex: destination, $options: "i" };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query["pricing.rates"] = {};
      if (minPrice) query["pricing.rates"].$gte = parseFloat(minPrice);
      if (maxPrice) query["pricing.rates"].$lte = parseFloat(maxPrice);
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get total count
    const totalCount = await Deal.countDocuments(query);

    // Get paginated deals
    const deals = await Deal.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);
    console.log(deals);

    res.json({
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      hasNextPage: skip + deals.length < totalCount,
      hasPrevPage: page > 1,
      results: deals,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

route.get("/:partnerId/deals/:dealId", async (req, res) => {
  try {
    const deal = await Deal.findOne({
      _id: req.params.dealId,
      partner: req.params.partnerId,
    });
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }
    res.json(deal);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

route.put("/:partnerId/deals/:dealId", async (req, res) => {
  try {
    const deal = await Deal.findOneAndUpdate(
      {
        _id: req.params.dealId,
        partner: req.params.partnerId,
      },
      req.body,
      { new: true, runValidators: true }
    );
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }
    res.json(deal);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

route.delete("/:partnerId/deals/:dealId", async (req, res) => {
  try {
    const deal = await Deal.findOneAndDelete({
      _id: req.params.dealId,
      partner: req.params.partnerId,
    });
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    // Remove deal from partner's deals array
    await Partner.findByIdAndUpdate(req.params.partnerId, {
      $pull: { deals: req.params.dealId },
    });

    res.json({ message: "Deal deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Combined statistics route
route.get("/stats/dashboard", async (req, res) => {
  try {
    // Get all counts in parallel
    const [totalUsers, totalPartners, totalDeals, states, countries] =
      await Promise.all([
        // Get total users count
        UserModel.countDocuments(),

        // Get total partners count
        Partner.countDocuments(),

        // Get total deals count
        Deal.countDocuments(),

        // Get Indian states sorted by bucket list count
        State.aggregate([
          // Match only Indian states by looking up country
          {
            $lookup: {
              from: "countries",
              localField: "countryId",
              foreignField: "_id",
              as: "country",
            },
          },
          {
            $match: {
              "country.name": "India",
            },
          },
          // Add bucket list count
          {
            $addFields: {
              bucketCount: { $size: "$bucketList" },
            },
          },
          // Sort by bucket count in descending order
          {
            $sort: { bucketCount: -1 },
          },
          // Project only needed fields
          {
            $project: {
              _id: 1,
              name: 1,
              bucketCount: 1,
            },
          },
        ]),

        // Get countries sorted by total bucket list count
        Country.aggregate([
          // Lookup states for each country
          {
            $lookup: {
              from: "states",
              localField: "states",
              foreignField: "_id",
              as: "statesList",
            },
          },
          // Calculate total buckets (country buckets + state buckets)
          {
            $addFields: {
              countryBucketCount: { $size: "$bucketList" },
              stateBucketCount: {
                $reduce: {
                  input: "$statesList",
                  initialValue: 0,
                  in: {
                    $add: ["$$value", { $size: "$$this.bucketList" }],
                  },
                },
              },
            },
          },
          // Calculate total bucket count
          {
            $addFields: {
              totalBucketCount: {
                $add: ["$countryBucketCount", "$stateBucketCount"],
              },
            },
          },
          // Sort by total bucket count in descending order
          {
            $sort: { totalBucketCount: -1 },
          },
          // Project only needed fields
          {
            $project: {
              _id: 1,
              name: 1,
              countryBucketCount: 1,
              stateBucketCount: 1,
              totalBucketCount: 1,
            },
          },
        ]),
      ]);

    // Return combined response
    res.json({
      counts: {
        users: totalUsers,
        partners: totalPartners,
        deals: totalDeals,
      },
      statesBucketList: states,
      countriesBucketList: countries,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
      details: "Error fetching dashboard statistics",
    });
  }
});

// Notification routes
// Send notification to all users
route.post("/notifications/send-all", async (req, res) => {
  try {
    const { title, body, data } = req.body;

    if (!title || !body) {
      return res.status(400).json({ message: "Title and body are required" });
    }

    // Get all devices with valid expoPushTokens
    const devices = await Device.find({
      expoPushToken: { $exists: true, $ne: null, $ne: "" },
    });

    if (devices.length === 0) {
      return res
        .status(404)
        .json({ message: "No devices found with valid push tokens" });
    }

    // Prepare messages for each device
    const messages = devices.map((device) => ({
      to: device.expoPushToken,
      sound: "default",
      title,
      body,
      data: data || {},
    }));

    // Send notifications
    const result = await sendPushNotifications(messages);

    res.status(200).json({
      message: "Notifications sent",
      stats: {
        total: devices.length,
        successful: result.successful,
        failed: result.failed.length,
      },
      details: result,
    });
  } catch (error) {
    console.error("Error sending notifications:", error);
    res.status(500).json({ message: error.message });
  }
});

// Send notification to filtered users
route.post("/notifications/send-filtered", async (req, res) => {
  try {
    const { title, body, data, filters } = req.body;

    if (!title || !body) {
      return res.status(400).json({ message: "Title and body are required" });
    }

    // Build query based on filters
    const query = { expoPushToken: { $exists: true, $ne: null, $ne: "" } };

    // Apply platform filter
    if (
      filters?.platform &&
      ["ios", "android", "web"].includes(filters.platform)
    ) {
      query.platform = filters.platform;
    }

    // Apply user activity filter (users with or without bucket items)
    if (filters?.hasBucket !== undefined) {
      // Find users with/without bucket items
      const userQuery = {};
      if (filters.hasBucket === true) {
        userQuery.bucket = { $exists: true, $ne: [] };
      } else if (filters.hasBucket === false) {
        userQuery.bucket = { $exists: true, $size: 0 };
      }

      if (Object.keys(userQuery).length > 0) {
        const users = await UserModel.find(userQuery).select("_id");
        const userIds = users.map((user) => user._id);
        query.user = { $in: userIds };
      }
    }

    // Apply last active filter
    if (filters?.lastActiveDays) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - filters.lastActiveDays);
      query.lastActive = { $gte: daysAgo };
    }

    // Get filtered devices
    const devices = await Device.find(query);

    if (devices.length === 0) {
      return res
        .status(404)
        .json({ message: "No devices found matching the filters" });
    }

    // Prepare messages for each device
    const messages = devices.map((device) => ({
      to: device.expoPushToken,
      sound: "default",
      title,
      body,
      data: data || {},
    }));

    // Send notifications
    const result = await sendPushNotifications(messages);

    res.status(200).json({
      message: "Filtered notifications sent",
      stats: {
        total: devices.length,
        successful: result.successful,
        failed: result.failed.length,
      },
      details: result,
    });
  } catch (error) {
    console.error("Error sending filtered notifications:", error);
    res.status(500).json({ message: error.message });
  }
});

// Send notification to a specific user
route.post("/notifications/send-to-user", async (req, res) => {
  try {
    const { title, body, data, userId, email } = req.body;

    if (!title || !body) {
      return res.status(400).json({ message: "Title and body are required" });
    }

    if (!userId && !email) {
      return res
        .status(400)
        .json({ message: "Either userId or email is required" });
    }

    // Find the user
    let user;
    if (userId) {
      user = await UserModel.findById(userId);
    } else if (email) {
      user = await UserModel.findOne({ email });
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get user's devices with valid push tokens
    const devices = await Device.find({
      user: user._id,
      expoPushToken: { $exists: true, $ne: null, $ne: "" },
    });

    if (devices.length === 0) {
      return res.status(404).json({
        message: "No devices found for this user with valid push tokens",
      });
    }

    // Prepare messages for each device
    const messages = devices.map((device) => ({
      to: device.expoPushToken,
      sound: "default",
      title,
      body,
      data: data || {},
    }));

    // Send notifications
    const result = await sendPushNotifications(messages);

    res.status(200).json({
      message: "Notification sent to user",
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
      stats: {
        total: devices.length,
        successful: result.successful,
        failed: result.failed.length,
      },
      details: result,
    });
  } catch (error) {
    console.error("Error sending notification to user:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get notification statistics and device information
route.get("/notifications/stats", async (req, res) => {
  try {
    // Get device counts by platform
    const platformStats = await Device.aggregate([
      {
        $match: {
          expoPushToken: { $exists: true, $ne: null, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$platform",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get total devices with valid push tokens
    const totalDevicesWithTokens = await Device.countDocuments({
      expoPushToken: { $exists: true, $ne: null, $ne: "" },
    });

    // Get total devices
    const totalDevices = await Device.countDocuments();

    // Get active devices in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeDevices = await Device.countDocuments({
      lastActive: { $gte: thirtyDaysAgo },
    });

    // Get users with at least one device with a valid push token
    const usersWithTokens = await Device.distinct("user", {
      expoPushToken: { $exists: true, $ne: null, $ne: "" },
      user: { $exists: true, $ne: null },
    });

    // Format platform stats into a more readable format
    const platforms = {};
    platformStats.forEach((stat) => {
      platforms[stat._id] = stat.count;
    });

    res.status(200).json({
      devices: {
        total: totalDevices,
        withPushTokens: totalDevicesWithTokens,
        activeInLast30Days: activeDevices,
        byPlatform: platforms,
      },
      users: {
        withPushTokens: usersWithTokens.length,
      },
    });
  } catch (error) {
    console.error("Error getting notification stats:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = route;
