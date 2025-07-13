const express = require("express");
const route = express.Router();
const axios = require("axios");

function getExtensionFromMimeType(mimeType) {
    const extensions = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp'
    };
    return extensions[mimeType] || '.jpg';
}

// route.get("/sendMailOTP", sendEmailOTP);
route.post("/", async (req, res) => {
    const response = await axios.get(req?.body?.url, { responseType: 'arraybuffer' });
    const contentType = response.headers['content-type'];
    const imageBuffer = Buffer.from(response.data);

        // Set appropriate headers
        // res.set({
        //     'Content-Type': contentType,
        //     'Content-Disposition': 'attachment; filename="image"' + getExtensionFromMimeType(contentType)
        // });

        // Send the image data
        res.json({imageBuffer, contentType});
});

module.exports = route;