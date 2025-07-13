const VideoContent = require('../models/VideoContent');
const axios = require('axios');
const fs = require('fs').promises;

async function getEmbeddingLinks() {
    try {
      const filter = {
        contentType: "ytShorts",
        buckets: { $exists: true, $not: { $size: 0 } }
      };
  
      // Fetch only embeddingLink field
      const projection = { embeddingLink: 1, _id: 0 };
  
      const embeddingLinks = await VideoContent.find(filter, projection);
  
      // Extract the embeddingLink values
      const links = embeddingLinks.map(item => item.embeddingLink);
  
        const youtubeApiKey = 'AIzaSyBNx9nQY2nMg8GA9Q7K4xMcwpYQ68Gwc3A'; // Replace with your API key
        const fetchedItems = [];

        for (const link of links) {
        try {
            // Fetch data from YouTube API for each embeddingLink
            const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'snippet',
                id: link,
                key: youtubeApiKey,
            },
            });

            // Get the first item from the response
            const item = response.data.items?.[0];
            if (item) {
            fetchedItems.push(item);
            } else {
            console.warn(`No data found for embeddingLink: ${link}`);
            }
        } catch (apiError) {
            console.error(`Error fetching data for embeddingLink: ${link}`, apiError.message);
        }
        }

        // Save fetched items to a JSON file
        const outputFilePath = './youtubeData.json';
        await fs.writeFile(outputFilePath, JSON.stringify(fetchedItems, null, 2));
        console.log(`Data successfully saved to ${outputFilePath}`);



      return links;
    } catch (error) {
      console.error("Error fetching embedding links:", error);
      throw error;
    }
  }
  

  module.exports = {
    getEmbeddingLinks,
};