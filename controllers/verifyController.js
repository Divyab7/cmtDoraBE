const { UserModel } = require('../models/User');
const otpModel = require('../models/otp');
const { sendEmail } = require('../utils/sendMailUtil');
const otpGenerator = require('otp-generator');
const jwt = require('jsonwebtoken');

async function storeOTP(email) {
  const otp = otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
  });

  const existingOtp = await otpModel.findOne({
    'accountType.name': 'email',
    'accountType.value': email,
  });

  // console.log(existingOtp);

  if (existingOtp && existingOtp !== null) {
    const timeElapsed = Date.now() - new Date(existingOtp.createdAt).getTime();
    const remainingTime = 5 * 60 * 1000 - timeElapsed; // 5 minutes in milliseconds

    if (remainingTime >= 60 * 1000) {
      // More than 1 minute left
      return existingOtp.otp;
    } else {
      // If less than 1 minute left, delete the existing OTP to replace it with a new one
      await otpModel.deleteOne({ _id: existingOtp._id });
    }
  }

  await new otpModel({
    accountType: {
      name: 'email',
      value: email,
    },
    otp: otp,
  }).save();

  return otp;
}

async function sendEmailOTP(req, res) {
  try {
    const url = 'api.zeptomail.in/';
    const token = process.env.ZEPTOMAIL_API_KEY;
    const { email, name } = req.user;
    const OTP = await storeOTP(req?.user?.email);
    const messagebody = `<div><b> Your OTP is ${OTP}. It will expire in 5 minutes</b></div>`;
    const subject = 'Verify Email';

    sendEmail(url, token, email, name, subject, messagebody).then((resp) => {
      return res.status(200).json({
        success: true,
        message: 'Mail Sent',
      });
    });
  } catch (error) {
    console.error(error);
    return res.json({ error: 'Internal Server Error' });
  }
}

async function checkEmailOTP(req, res) {
  try {
    const { email } = req.user;
    const { otp } = req.body;

    const storedOtp = await otpModel
      .findOne({ accountType: { name: 'email', value: email } })
      .select('otp');
    if (!storedOtp) {
      return res.status(404).json({ message: 'No OTP Sent' });
    }
    if (storedOtp.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    const oldToken = jwt.verify(
      req.headers.authorization || req.cookies['x-auth-cookie'],
      process.env.SECRET_TOKEN
    );
    const newTokenPayload = {
      ...oldToken,
      verificationStatus: { email: true },
    };
    const newToken = jwt.sign(newTokenPayload, process.env.SECRET_TOKEN);
    res.setHeader('Authorization', newToken);

    // Update user's emailVerified status
    await UserModel.updateOne(
      { email },
      { verificationStatus: { email: true } }
    );

    return res.json({
      status: 'success',
      jwtToken: newToken,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = {
  sendEmailOTP,
  checkEmailOTP,
};
