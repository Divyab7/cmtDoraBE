const jwt = require("jsonwebtoken");

// List of admin emails with access to partner routes
const ADMIN_EMAILS = [
  "aakashkumaar074@gmail.com",
  "bandadivya61@gmail.com",
  "gopuaakash751@gmail.com",
  "Groot@gmail.com",
];

const verifyAdminToken = (req, res, next) => {
  try {
    // Get token from header

    // console.log(req.headers.authorization);
    const token = req.headers.authorization;
    // console.log("token", token);
    if (!token) {
      return res.status(401).json({
        message: "Access denied. No token provided.",
        hasAccess: false,
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.SECRET_TOKEN);
    console.log(decoded);
    // Check if email is in admin list
    if (
      decoded.role &&
      decoded.role == "admin" &&
      !ADMIN_EMAILS.includes(decoded.email)
    ) {
      //decoded.role === "admin" &&
      return res.status(403).json({
        message: "Access denied. Not authorized.",
        hasAccess: false,
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      message: "Invalid token.",
      hasAccess: false,
      error: error.message,
    });
  }
};

// Function to check access without blocking the request
const checkAdminAccess = (token) => {
  try {
    if (!token) {
      return {
        hasAccess: false,
        message: "No token provided",
      };
    }

    const decoded = jwt.verify(token, process.env.SECRET_TOKEN);
    const hasAccess = ADMIN_EMAILS.includes(decoded.email);

    return {
      hasAccess,
      user: decoded,
      message: hasAccess ? "Access granted" : "Access denied",
    };
  } catch (error) {
    console.log(error);
    return {
      hasAccess: false,
      message: "Invalid token",
      error: error.message,
    };
  }
};

module.exports = {
  verifyAdminToken,
  checkAdminAccess,
  ADMIN_EMAILS,
};
