const express = require('express');
const route = express.Router();
const jwt = require('jsonwebtoken');

const { getJWTfromEmail } = require('../utils/JWTforOkto');
  
route.get('/', (req, res) => {
    res.send('Okto');
} );

// route.get('/:email', async (req, res) => {
//     const email = req.params.email;
//     const token = await getJWTfromEmail(email);
//     res.status(200).json({
//         "token": token
//     });
// });

route.get('/verify', (req, res) => {
    let token = req.headers.authorization || req.cookies["x-auth-cookie"];
    if(token?.includes('Bearer')) {
        token = token.split(' ')[1];
    }
    const decode = jwt.verify(
        token,
        process.env.SECRET_TOKEN
      );
  
      req.user = decode;

    const userId = req.user.id;
    console.log(req.user)
    res.status(200).json({
        "user_id": userId,    //<email-address of user, or any other unique identification of user>,
        "success": true          //BOOLEAN
      });

    
});
  
module.exports = route;