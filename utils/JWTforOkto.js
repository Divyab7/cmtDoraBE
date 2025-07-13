const { UserModel } = require('../models/User');
const jwt = require('jsonwebtoken');

async function getJWTfromEmail(email) {
    const user = await UserModel.findOne({ email });
    const token = jwt.sign(
        {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
        },
        process.env.SECRET_TOKEN,
        {
          expiresIn: "1y",
        }
      );

    return token;
}

module.exports = {
    getJWTfromEmail
}