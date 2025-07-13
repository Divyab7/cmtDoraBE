const express = require("express");
const registerController = require("../controllers/registerController.js");
const loginController = require("../controllers/loginController.js");
const { adminLoginController } = require("../controllers/adminController.js");
const axios = require("axios");
const route = express.Router();
const jwt = require("jsonwebtoken");
const qs = require("qs");
const { UserModel } = require("../models/User");
const { hashSync } = require("bcrypt");
const Partner = require("../models/Partner");
const { createHederaAccount } = require("../utils/hederaUtil");
// const ADMIN_EMAILS = [
//   "aakashkumaar074@gmail.com",
//   "bandadivya61@gmail.com",
//   "gopuaakash751@gmail.com",
//   "Groot@gmail.com",
// ];
//! ==== register
route.post("/register", registerController);

//! ==== login
route.post("/login", loginController);

//! ==== admin login
route.post("/adminlogin", adminLoginController);

//!================================
// !========= Google login

const passport = require("passport");
const cookieParser = require("cookie-parser");
const configurePassport = require("../middleware/passport.js");
const session = require("express-session");
const { ADMIN_EMAILS } = require("../middleware/adminAuth.js");

configurePassport(passport);

// Inisialisation Passport
route.use(
  session({
    secret: process.env.SECRET_TOKEN, //"key00", // Replace with a more complex secret key for production
    resave: false,
    saveUninitialized: false,
  })
);

route.use(passport.initialize());
route.use(passport.session());
route.use(cookieParser());

route.get(
  "/google",
  (req, res, next) => {
    // Extract the clientType query parameter from the request
    const clientType = req.query.client;

    // Save the clientType to the session or some temporary storage
    req.session.clientType = clientType;

    // Continue to the Google authentication
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

route.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/",
    session: false,
  }),
  async (req, res) => {
    const token = jwt.sign(
      {
        id: req.user._id.toString(),
        name: req.user.name,
        email: req.user.email,
        googleId: req.user.googleId,
        verificationStatus: req.user.verificationStatus,
      },
      process.env.SECRET_TOKEN,
      {
        expiresIn: "30d",
      }
    );
    res.cookie("x-auth-cookie", token, {
      httpOnly: true,
      secure: true, // if use HTTPS
      sameSite: "strict",
    });
    const clientType = req.session.clientType; //|| 'web';

    // If the request is coming from a mobile app
    // console.log(req.session);
    if (clientType === "partner") {
      const redirectUrl = `https://partners.clonemytrips.com/register?token=${token}`;
      res.redirect(redirectUrl);
      return;
    } else if (clientType === "partnerLogin") {
      if (ADMIN_EMAILS.includes(req.user.email)) {
        const partnerToken = jwt.sign(
          {
            id: req.user._id.toString(),
            name: req.user.name,
            email: req.user.email,
            googleId: req.user.googleId,
            role: "admin",
          },
          process.env.SECRET_TOKEN,
          {
            expiresIn: "30d",
          }
        );
        const redirectUrl = `https://partners.clonemytrips.com/dashboard?token=${partnerToken}`;
        res.redirect(redirectUrl);
        return;
      }
      const partner = await Partner.findOne({ "poc.email": req.user.email });
      if (!partner) {
        const email = req.user.email;
        const partnerRegistrationToken = jwt.sign(
          {
            id: req.user._id.toString(),
            name: req.user.name,
            email: req.user.email,
            googleId: req.user.googleId,
          },
          process.env.SECRET_TOKEN,
          {
            expiresIn: "30d",
          }
        );
        const redirectUrl = `https://partners.clonemytrips.com/register?needsPartnerRegistration=true&email=${email}&token=${partnerRegistrationToken}`;
        return res.redirect(redirectUrl);
      }
      if (partner.status !== "active") {
        const email = req.user.email;
        const pendingToken = jwt.sign(
          {
            id: req.user._id.toString(),
            name: req.user.name,
            email: req.user.email,
            googleId: req.user.googleId,
            status: "pending"
          },
          process.env.SECRET_TOKEN,
          {
            expiresIn: "30d",
          }
        );
        const redirectUrl = `https://partners.clonemytrips.com/register?status=pending&email=${email}&token=${pendingToken}`;
        return res.redirect(redirectUrl);
      }
      const partnerToken = jwt.sign(
        {
          id: req.user._id.toString(),
          name: req.user.name,
          email: req.user.email,
          googleId: req.user.googleId,
          role: "partner",
          partner,
          status: partner.status,
        },
        process.env.SECRET_TOKEN,
        {
          expiresIn: "30d",
        }
      );

      const redirectUrl = `https://partners.clonemytrips.com/dashboard?token=${partnerToken}`;
      res.redirect(redirectUrl);
      // res.json({token: partnerToken})
    } else {
      const redirectUrl = `clonemytrips://login?token=${token}`;
      res.redirect(redirectUrl);
    }
  }
);

// Route to start authentication
route.get("/apple", passport.authenticate("apple"));

// Callback route after Apple redirects back
route.post(
  "/apple/callback",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const { body } = req;
    const privateKey = `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgTK4WGTsAy3YA+VIZ
FxY5ikTeaGKbg/7YNTNTXLMfkwigCgYIKoZIzj0DAQehRANCAATt4MGdNfIqEIDM
waVsnlSmlRkHA/eWUUNEz0XaO4WLxiEpuQkOHdujpOTWOP4JFwd0H7jsXvgKQMv+
4nFCJRuG
-----END PRIVATE KEY-----`;
    const clientSecret = jwt.sign(
      {
        iss: "CV2G7X67H9", // Your Apple Developer Team ID
        iat: Math.floor(Date.now() / 1000), // Issued at time
        exp: Math.floor(Date.now() / 1000) + 3600, // Expiration time (can be set to 6 months)
        aud: "https://appleid.apple.com", // Audience
        sub: "com.flyingwands.clonemytrips.sign", // Your Service ID
      },
      privateKey,
      {
        algorithm: "ES256",
        keyid: "8KV3V5RAYZ", // Your Key ID
      }
    );
    // {
    //   state: '2c15edf9a4',
    //   code: 'c75a65f2fa0d74d12b5413377eacd3f81.0.ryys.KiYaRcrzTmzK3DTGTauezQ',
    //   user: '{"name":{"firstName":"Follow","lastName":"Plan"},"email":"follownplan@gmail.com"}'
    // }
    const response = await axios.post(
      "https://appleid.apple.com/auth/token",
      null,
      {
        params: {
          grant_type: "authorization_code",
          code: body?.code,
          client_id: "com.flyingwands.clonemytrips.sign",
          client_secret: clientSecret,
          redirect_uri: "https://api.clonemytrips.com/auth/apple/callback",
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const idToken = response?.data?.id_token;

    try {
      const decodedToken = jwt.decode(idToken, { json: true });

      // ONLY on the first auth each user makes, `req.query.user` gets set - after that it will no longer be sent in subsequent logins.
      // In that case `req.query.user` is a JSON encoded string, which has the properties `firstName` and `lastName`.
      // Note: If you need to test first auth again, you can remove the app from "Sign in with Apple" here: https://appleid.apple.com/account/manage
      const firstTimeUser =
        typeof body["user"] === "string" ? JSON.parse(body["user"]) : undefined;

      // JWT token should contain email if authenticated
      const { sub, email, email_verified } = decodedToken;
      const user = await UserModel.findOne({ email: email });
      if (user && !firstTimeUser) {
        const token = jwt.sign(
          {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            appleId: user.appleId,
            verificationStatus: user.verificationStatus,
          },
          process.env.SECRET_TOKEN,
          {
            expiresIn: "30d",
          }
        );
        res.cookie("x-auth-cookie", token, {
          httpOnly: true,
          secure: true, // if use HTTPS
          sameSite: "strict",
        });

        const redirectUrl = `clonemytrips://login?token=${token}`;
        res.redirect(redirectUrl);
      }

      const hashPass = hashSync(sub, 10);

      // TODO implement your own function check for whether `sub` exists in your database (or create a new user if it does not)
      // const dbUser = await upsertUser({ sub, email, email_verified, firstTimeUser });

      const newUser = await new UserModel({
        name:
          firstTimeUser?.name?.firstName + " " + firstTimeUser?.name?.lastName,
        appleId: sub,
        email: email,
        password: hashPass,
        verificationStatus: {
          email: true,
        },
      }).save();

      await createHederaAccount(newUser);

      const token = jwt.sign(
        {
          id: newUser._id.toString(),
          name: newUser.name,
          email: newUser.email,
          appleId: newUser.appleId,
          verificationStatus: newUser.verificationStatus,
        },
        process.env.SECRET_TOKEN,
        {
          expiresIn: "30d",
        }
      );
      res.cookie("x-auth-cookie", token, {
        httpOnly: true,
        secure: true, // if use HTTPS
        sameSite: "strict",
      });

      const redirectUrl = `clonemytrips://login?token=${token}`;
      res.redirect(redirectUrl);
    } catch (err) {}

    // const sp = new URLSearchParams();
    // Object.entries(body).forEach(([key, value]) => sp.set(key, String(value)));
    // res.redirect(`/auth/apple/callback?${sp.toString()}`);
  }
  // passport.authenticate('apple', {
  //   failureRedirect: "/",
  //   session: false,
  // }),
  // (req, res) => {
  //   console.log(req)
  //   // Successful authentication
  //   // const token = jwt.sign(
  //   //   {
  //   //     id: req.user._id.toString(),
  //   //     name: req.user.name,
  //   //     email: req.user.email,
  //   //     googleId: req.user.googleId,
  //   //     verificationStatus: req.user.verificationStatus,
  //   //   },
  //   //   process.env.SECRET_TOKEN,
  //   //   {
  //   //     expiresIn: "30d",
  //   //   }
  //   // );
  //   // res.cookie("x-auth-cookie", token, {
  //   //   httpOnly: true,
  //   //   secure: true, // if use HTTPS
  //   //   sameSite: "strict",
  //   // });

  //   // // If the request is coming from a mobile app
  //   // if (clientType === "web") {
  //     // const redirectUrl = `https://app.clonemytrips.com/login?token=${token}`;
  //     res.redirect("/");
  //   // } else {
  //   //   const redirectUrl = `clonemytrips://login?token=${token}`;
  //   //   res.redirect(redirectUrl);
  //   // }
  // }
);

// const failureRedirect = '/';

// route.get('/apple/callback', passport.authenticate('apple', {
//   successReturnToOrRedirect: '/',
//   failureRedirect,
// }), (err, _req, res, _next) => {
//   // for some reason, `failureRedirect` doesn't receive certain errors, so we need an error handler here.
//   if (err instanceof Error && (err.name === 'AuthorizationError' || err.name === 'TokenError')) {
//     // Common errors:
//     // - AuthorizationError { code: 'user_cancelled_authorize' } - When the user cancels the operation
//     // - TokenError { code: 'invalid_grant' } - The code has already been used
//     const sp = new URLSearchParams({ error: err.name });
//     if ('code' in err && typeof err.code === 'string') sp.set('code', err.code);
//     res.redirect(`${failureRedirect}?${sp.toString()}`);
//     return;
//   }

//   // unknown err object
//   res.redirect(failureRedirect);
// });

route.get(
  "/instagram",
  (req, res, next) => {
    // Extract the clientType query parameter from the request
    const clientType = req.query.client;

    // Save the clientType to the session or some temporary storage
    req.session.clientType = clientType;

    // Continue to the Google authentication
    next();
  },
  passport.authenticate("instagram", { scope: ["user_profile", "user_media"] })
);

route.get(
  "/instagram/callback",
  (req, res, next) => {
    const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const url = new URL(fullUrl);
    let code = url.searchParams.get("code");

    if (code && code.endsWith("#_")) {
      code = code.slice(0, -2);
    }

    req.instagramCode = code;
    next();
  },
  async (req, res, next) => {
    // passport.authenticate("instagram", async (err, user, info) => {
    try {
      // Use the code to fetch the long-lived access token
      const tokenResponse = await axios.post(
        "https://api.instagram.com/oauth/access_token",
        qs.stringify({
          client_id: process.env.INSTAGRAM_CLIENT_ID,
          client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
          grant_type: "authorization_code",
          redirect_uri: process.env.BACKEND_URL + "/auth/instagram/callback",
          code: req.instagramCode,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      const longLivedToken = tokenResponse.data.access_token;
      // Use the long-lived token to fetch user details
      const userResponse = await axios.get("https://graph.instagram.com/me", {
        params: {
          fields: "id,username,account_type,media_count",
          access_token: longLivedToken,
        },
      });
      const userDetails = userResponse.data;
      // Combine the profile info with the user details
      const combinedProfile = {
        // ...profile,
        ...userDetails,
        accessToken: longLivedToken,
      };
      let userProfile;
      const user = await UserModel.findOne({
        "instagram.id": combinedProfile.id,
      });
      if (user) {
        userProfile = user;
      } else {
        const hashPass = hashSync(combinedProfile?.accessToken, 10);

        const newUser = await new UserModel({
          // name: profile._json.name,
          instagram: {
            id: combinedProfile?.id,
            username: combinedProfile?.username,
            accountType: combinedProfile?.account_type,
            accessToken: combinedProfile?.accessToken,
          },
          password: hashPass,
          verificationStatus: {
            instagram: true,
          },
        }).save();
        if (newUser) {
          userProfile = newUser;
        }
      }

      const token = jwt.sign(
        {
          id: userProfile._id.toString(),
          // name: req.user.name,
          // email: req.user.email,
          // googleId: req.user.googleId,
          instagram: {
            id: userProfile?.instagram?.id,
            username: userProfile?.instagram?.username,
            accountType: userProfile?.instagram?.account_type,
            accessToken: userProfile?.instagram?.accessToken,
          },
          verificationStatus: userProfile.verificationStatus,
        },
        process.env.SECRET_TOKEN,
        {
          expiresIn: "30d",
        }
      );
      res.cookie("x-auth-cookie", token, {
        httpOnly: true,
        secure: true, // if use HTTPS
        sameSite: "strict",
      });
      const clientType = req.session.clientType; //|| 'web';

      // If the request is coming from a mobile app
      // if (clientType === "web") {
      const redirectUrl = `https://app.clonemytrips.com/login/${token}`;
      res.redirect(redirectUrl);
      // } else {
      // const redirectUrl = `clonemytrips://login/${token}`;
      // res.redirect(redirectUrl);
      // }

      // return done(null, combinedProfile);
    } catch (err) {
      console.log(err);
      // return done(err, false);
    }
    //   return res.redirect("https://localhost:3002/");
    //   // });
    // })(req, res, next);
  }
);

route.get("/login/token", (req, res) => {
  const token = req.cookies["x-auth-cookie"];
  res.json({ token });
});

route.get("/check", (req, res) => {
  if (process.env.AUTH_CHECK === "true") {
    res.status(200).json({ success: true });
  } else {
    res.status(400).json({ success: false });
  }
});

route.get("/logout", (req, res) => {
  res.clearCookie("x-auth-cookie");
  res.status(200).json({
    success: true,
    message: "logout is successful",
  });
});

module.exports = route;
