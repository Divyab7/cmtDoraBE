const { hash } = require("bcrypt");
const { UserModel } = require("../models/User");
const jwt = require("jsonwebtoken");
const { Client, PrivateKey, AccountCreateTransaction, Hbar } = require("@hashgraph/sdk");
require("dotenv").config();
const { createHederaAccount } = require("../utils/hederaUtil");

async function registerController(req, res) {
  try {
    // console.log("HELLO");
    const { name, email, password } = req.body;

    switch (true) {
      case !name:
        return res.status(400).json({ message: "Name is required" });
      case !email:
        return res.status(400).json({ message: "Email is required" });
      case !password:
        return res.status(400).json({ message: "Password is required" });
    }

    const alreadyExist = await UserModel.findOne({ email });
    if (alreadyExist) {
      return res.status(400).json({ message: "Email have been registered" });
    }

    const hashPass = await hash(password, 10);

    const user = await new UserModel({
      name,
      email,
      password: hashPass,
    }).save();

    // Create Hedera account for the user
    await createHederaAccount(user);

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        // username: user.username,
        email: user.email,
        verificationStatus: user.verificationStatus,
      },
      process.env.SECRET_TOKEN,
      {
        expiresIn: "30d",
      }
    );

    if (user) {
      res.status(200).json({
        message: "Create account is successful",
        success: true,
        user,
        token,
      });
    }
  } catch (error) {
    console.log(error);
  }
}

module.exports = registerController;
