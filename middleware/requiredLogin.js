const jwt = require("jsonwebtoken");
const { UserModel } = require("../models/User");
const GamificationService = require('../services/gamificationService');
const deviceInfo = require('./deviceInfo');

const requiredLogin = async (req, res, next) => {
  try {
    if(process.env.AUTH_CHECK === "true") {
      const decode = jwt.verify(
        req.headers.authorization || req.cookies["x-auth-cookie"],
        process.env.SECRET_TOKEN
      );
      req.user = decode;
      try {
        // Trigger login event with Google source
        await GamificationService.processEvent(req.user.id.toString(), 'user_login', {
          timestamp: new Date(),
        });
      } catch (gamificationError) {
        console.error('Gamification error:', gamificationError);
      }

      next();
    } else {
      next();
    }
  } catch (error) {
    console.log(error);
    res.status(401).json({ error: "Invalid auth token" });
  }
};

const mustRequiredLogin = async (req, res, next) => {
  try {
    const decode = jwt.verify(
      req.headers.authorization || req.cookies["x-auth-cookie"],
      process.env.SECRET_TOKEN
    );

    req.user = decode;

    next();
  } catch (error) {
    console.log(error);
    res.status(401).json({ error: "Invalid auth token" });
  }
};

const adminRequiredLogin = async (req, res, next) => {
  try {
    const decode = jwt.verify(
      req.headers.authorization || req.cookies["x-auth-cookie"],
      process.env.SECRET_TOKEN
    );


    req.user = decode;
    const user = await UserModel.findOne({ email: decode.email });
    if (user.role && (user.role === 'admin' || user.role === 'moderator')) {
      next();
    } else {
      throw new Error("Forbidden");
    }

  } catch (error) {
    console.log(error);
    res.status(401).json({ error: "Invalid auth token" });
  }
};

module.exports = {
  requiredLogin,
  adminRequiredLogin,
  mustRequiredLogin,
  deviceInfo
};
