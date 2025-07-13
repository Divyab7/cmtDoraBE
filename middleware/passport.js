const { UserModel } = require("../models/User");
const { hashSync } = require("bcrypt");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const InstagramStrategy = require("passport-instagram").Strategy;
const Jwt = require("jsonwebtoken");
const AppleStrategy = require('passport-apple');
const { createHederaAccount } = require("../utils/hederaUtil");

function configurePassport(passport) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.BACKEND_URL + "/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // console.log("hello configure");
          const user = await UserModel.findOne({ email: profile._json.email });
          if (user) {
            if (!user.hedera) {
              await createHederaAccount(user);
            }
            return done(null, user);
          }

          const hashPass = hashSync(profile._json.sub, 10);

          const newUser = await new UserModel({
            name: profile._json.name,
            googleId: profile._json.sub,
            email: profile._json.email,
            password: hashPass,
            verificationStatus: {
              email: true,
            },
          }).save();
          if (newUser) {
            await createHederaAccount(newUser);
          }
          return done(null, newUser);
        } catch (err) {
          return done(err, false);
        }
      }
    )
  );

  // Configure Instagram Strategy
  passport.use(
    new InstagramStrategy(
      {
        clientID: process.env.INSTAGRAM_CLIENT_ID,
        clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
        callbackURL: process.env.BACKEND_URL + "/auth/instagram/callback",
        passReqToCallback: true,
        // callbackURL: process.env.BACKEND_URL + "/auth/instagram/callback",
      },
      async (req, accessToken, refreshToken, profile, done) => {
        // Here you would typically find or create a user in your database
        // console.log("Access Token:", accessToken);
        // console.log("Refresh Token:", refreshToken);
        // console.log("Profile:", JSON.stringify(profile, null, 2));
        // console.log("Instagram Code:", req.instagramCode);
      }
    )
  );

  //Configure Apple Strategy
  passport.use(
    new AppleStrategy(
      {
        clientID: 'com.flyingwands.clonemytrips.sign', // Replace with your App ID
        teamID: 'CV2G7X67H9', // Replace with your Team ID
        keyID: '8KV3V5RAYZ', // Replace with your Key ID
        privateKeyString: `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgTK4WGTsAy3YA+VIZ
FxY5ikTeaGKbg/7YNTNTXLMfkwigCgYIKoZIzj0DAQehRANCAATt4MGdNfIqEIDM
waVsnlSmlRkHA/eWUUNEz0XaO4WLxiEpuQkOHdujpOTWOP4JFwd0H7jsXvgKQMv+
4nFCJRuG
-----END PRIVATE KEY-----`,
        callbackURL: "https://api.clonemytrips.com/auth/apple/callback",
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, idToken, profile, cb) => {

      
      // (accessToken, refreshToken, profile, done) => {
      //   console.log('Access Token:', accessToken);
      //   console.log('Refresh Token:', refreshToken);

      //   // Profile will contain user info
      //   console.log('Profile:', profile);
        return cb(null, profile);
      }
    )
  );

  passport.serializeUser((user, done) => {
    return done(null, user._id);
  });

  passport.deserializeUser(async (id, done) => {
    const userNoToken = await UserModel.findById(id);
    const token = Jwt.sign({ id }, process.env.SECRET_TOKEN, {
      expiresIn: "30d",
    });
    const user = {
      user: userNoToken,
      token,
    };

    return done(null, user);
  });
}

module.exports = configurePassport;
