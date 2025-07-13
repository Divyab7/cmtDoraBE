const { compare } = require("bcrypt");
const { UserModel } = require("../models/User");
const { createHederaAccount } = require("../utils/hederaUtil");
const jwt = require("jsonwebtoken");

async function loginController(req, res) {
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

    // check email
    const user = await UserModel.findOne({ email });

    if (!user) {
      return res
        .status(400)
        .json({ message: "email hasn't been registered", success: false });
    }

    // check password
    const checkPassword = await compare(password, user.password);
    if (!checkPassword)
      return res
        .status(400)
        .json({ message: "Password is wrong", success: false });

    if (!user.hedera) {
      await createHederaAccount(user);
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        username: user.username,
        phoneNumber: user.phoneNumber,
        email: user.email,
        verificationStatus: user.verificationStatus,
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
    console.log(error);
  }
}

module.exports = loginController;