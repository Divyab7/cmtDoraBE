const express = require("express");
require("dotenv").config();
const connectMongo = require("./config/database");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const verifyRoutes = require("./routes/verify");
const payRoutes = require("./routes/pay");
const reelRoutes = require("./routes/reel");
const proxyRoutes = require("./routes/proxy");
const bucketRoutes = require("./routes/bucket");
const doraAiRoutes = require("./routes/doraAI");
const homeRoutes = require('./routes/home');
const utilRoutes = require('./routes/utils');
const bookingRoutes = require('./routes/booking');
const oktoRoutes = require('./routes/okto');
const partnersRoutes = require('./routes/partners');
const dealsRoutes = require('./routes/deals');
const userRoutes = require('./routes/user');
const gamificationRoutes = require('./routes/gamification');
const partnerRoutes = require("./routes/partners");
const tripRoutes = require('./routes/trip');
const widgetsRoutes = require('./routes/widgets');
const whatsappRoutes = require('./routes/whatsapp');
const { updateLocation } = require('./scripts/updateLocation');
const { updateCountryAndState } = require('./scripts/updateCountryAndState');
const { getEmbeddingLinks } = require('./scripts/updateInitialReels');
const { updateVideoContentStatus } = require('./scripts/updateVideoContentStatus');
const { getKeysFromMnemonic } = require('./utils/getKeyFromMnemonics');

const {
  deviceInfo,
  requiredLogin,
  mustRequiredLogin,
} = require("./middleware/requiredLogin");

const { verifyAdminToken } = require("./middleware/adminAuth");

const cookieParser = require("cookie-parser");

const app = express();
app.use(cookieParser());

connectMongo();

//! middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For parsing Twilio webhook requests
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3001",
  "http://localhost:3000",
  "http://localhost:8081",
  "https://clonemytrips.com",
  "https://app.clonemytrips.com",
  "https://stage--clonemytripsapp.netlify.app",
  "https://partners.clonemytrips.com",
  "https://buckitapp.netlify.app",
  "https://dora-the-explorer.netlify.app",
  "https://sandbox-api.okto.tech",
];
app.use(
  cors({
    origin: allowedOrigins,
    methods: "GET,POST,PUT,DELETE,PATCH",
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-auth-cookie"],
  })
);

app.get('/', (req, res) => {
  res.json({
    message: 'Hello Traveler!',
    version: process.env.APP_VERSION || '1.0.0'
  });
});

app.use("/auth", authRoutes);

app.use("/partner", partnerRoutes);

app.use("/verify", requiredLogin, deviceInfo, verifyRoutes);

app.use("/pay", payRoutes);

app.use("/reels", reelRoutes);

app.use("/buckets", mustRequiredLogin, deviceInfo, bucketRoutes);

app.use("/dora-ai", requiredLogin, deviceInfo, doraAiRoutes);

app.use("/proxy", proxyRoutes);

app.use("/home", requiredLogin, deviceInfo, homeRoutes);

app.use("/utils", mustRequiredLogin, utilRoutes);

app.use("/bookings", mustRequiredLogin, deviceInfo, bookingRoutes);

app.use("/okto", oktoRoutes);

app.use("/partners", verifyAdminToken, partnersRoutes);

app.use("/deals", deviceInfo, dealsRoutes);

app.use("/user", mustRequiredLogin, deviceInfo, userRoutes);

app.use("/gamification", gamificationRoutes);

app.use('/trips', tripRoutes);

app.use('/widgets', widgetsRoutes);

// WhatsApp routes - No authentication needed for webhook endpoint
app.use('/whatsapp', whatsappRoutes);

// getKeysFromMnemonic();

// updateLocation();

// updateCountryAndState();

// getEmbeddingLinks();

// updateVideoContentStatus();

module.exports = app;
