const Partner = require("../models/Partner");
const jwt = require("jsonwebtoken");
const { compare } = require("bcrypt");
const { UserModel } = require("../models/User");
// JsonWebTokenError

const ADMIN_EMAILS = [
  "aakashkumaar074@gmail.com",
  "bandadivya61@gmail.com",
  "gopuaakash751@gmail.com",
  "Groot@gmail.com",
];

const partnerCreate = async (req, res) => {
  try {
    if (!ADMIN_EMAILS.includes(req.user.email)) {
      const { name, phoneNumber, type } = req.body;

      const poc = req.user;
      const partner = await Partner.findOne({ name });
      if (partner) {
        return res
          .status(400)
          .json({ message: "Partner already exists", success: false });
      }
      if (!name || !type) {
        return res
          .status(400)
          .json({ message: "Name and type are required", success: false });
      }

      const newPartner = new Partner({
        name,
        poc: {
          name: poc.name,
          email: poc.email,
          phone: phoneNumber,
        },
        type,
      });
      const savedPartner = await newPartner.save();
      const token = jwt.sign(
        {
          id: savedPartner._id,
          email: poc.email,
          role: "partner",
          status: savedPartner.status,
        },
        process.env.SECRET_TOKEN,
        { expiresIn: "30d" }
      );
      res.status(201).json({
        message: "Partner created successfully",
        success: true,
        savedPartner,
        token,
      });
    } else {
      const { name, phoneNumber, type, poc } = req.body;

      const partner = await Partner.findOne({ name });
      if (partner) {
        return res
          .status(400)
          .json({ message: "Partner already exists", success: false });
      }

      if (!name || !type || !poc.email || !poc.name || !poc.phone) {
        return res.status(400).json({
          message: "Name, type and POC details are required",
          success: false,
        });
      }

      const newPartner = new Partner({
        name,
        poc: {
          name: poc.name,
          email: poc.email,
          phone: poc.phone,
        },
        type,
        verificationStatus: true,
      });

      const savedPartner = await newPartner.save();
      const token = jwt.sign(
        {
          id: savedPartner._id,
          email: poc.email,
          role: "partner",
          status: savedPartner.status,
        },
        process.env.SECRET_TOKEN,
        { expiresIn: "30d" }
      );

      res.status(201).json({
        message: "Partner created successfully",
        success: true,
        savedPartner,
        token,
      });
    }
  } catch (error) {
    res.status(400).json({
      message: "Partner creation failed",
      success: false,
      error: error.message,
    });
  }
};

const partnerLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email)
      return res
        .status(400)
        .json({ message: "email is required", success: false });
    if (!password)
      return res
        .status(400)
        .json({ message: "password is required", success: false });
    const user = await UserModel.findOne({ email });
    // console.log(user);
    if (!user) {
      return res
        .status(400)
        .json({ message: "email hasn't been registered", success: false });
    }

    const checkPassword = await compare(password, user.password);
    if (!checkPassword)
      return res
        .status(400)
        .json({ message: "Password is wrong", success: false });
    // console.log(email);
    // console.log(ADMIN_EMAILS.includes(email));
    if (ADMIN_EMAILS.includes(email)) {
      const token = jwt.sign(
        { id: user._id, role: "admin", email },
        process.env.SECRET_TOKEN,
        { expiresIn: "30d" }
      );
      return res
        .status(200)
        .json({ message: "Login is successful", token, success: true });
    }
    // check password
    const partner = await Partner.findOne({ "poc.email": email });
    if (!partner) {
      return res.status(200).json({
        success: false,
        needsPartnerRegistration: true,
        email: email,
        token: jwt.sign(
          { id: user._id, email: email },
          process.env.SECRET_TOKEN,
          { expiresIn: "30d" }
        ),
        message: "Partner registration required"
      });
    }
    if (partner.status !== "active") {
      const pendingToken = jwt.sign(
        { 
          id: user._id, 
          email: email,
          status: "pending"
        },
        process.env.SECRET_TOKEN,
        { expiresIn: "30d" }
      );
      return res.status(200).json({
        success: false,
        status: "pending",
        email: email,
        token: pendingToken,
        message: "Partner is not approved by admin or deactivated",
      });
    }
    const token = jwt.sign(
      {
        email: email,
        role: "partner",
        partner,
        status: partner.status,
      },
      process.env.SECRET_TOKEN,
      {
        expiresIn: "30d",
      }
    );

    if (token) {
      res.status(200).json({
        success: true,
        message: "Login is successful",
        user,
        token,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Cannot get the token, something is wrong",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  partnerCreate,
  partnerLogin,
};
