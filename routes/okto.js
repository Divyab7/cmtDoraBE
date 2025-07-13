const express = require('express');
const route = express.Router();
const jwt = require('jsonwebtoken');

  
route.get('/', (req, res) => {
    res.send('Okto');
} );


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