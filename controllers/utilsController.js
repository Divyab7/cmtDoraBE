const axios = require('axios');
const Location = require('../models/Location');

const searchLocation = async (req, res) => {
    try {
        const { query } = req.query;
        const response = await axios.post('https://places.googleapis.com/v1/places:autocomplete', {
            input: query,
        }, {
            headers: {
                'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY // Set the Authorization header with the API key
            }
        });
        const results = response?.data?.suggestions;
        for (const item of results) {
            const response = await axios.get(
                `https://places.googleapis.com/v1/places/${item?.placePrediction?.placeId}?fields=addressComponents&key=${process.env.GOOGLE_MAPS_API_KEY}`
              );

            const { addressComponents } = response.data;

            const locationData = {
                place: item?.placePrediction?.place,
                placeId: item?.placePrediction?.placeId,
                text: item?.placePrediction?.text,
                structuredFormat: item?.placePrediction?.structuredFormat,
                types: item?.placePrediction?.types,
                addressComponents: addressComponents
              };
            
              await Location.findOneAndUpdate(
                { placeId: locationData.placeId },
                locationData,
                { upsert: true, new: true }
              );
        }
        // const results = [{"placePrediction":{"place":"places/ChIJzbO8enN2sTgRtYgZT4QxwyU","placeId":"ChIJzbO8enN2sTgRtYgZT4QxwyU","text":{"text":"Tajikistan","matches":[{"endOffset":3}]},"structuredFormat":{"mainText":{"text":"Tajikistan","matches":[{"endOffset":3}]}},"types":["country","political","geocode"]}},{"placePrediction":{"place":"places/ChIJbf8C1yFxdDkR3n12P4DkKt0","placeId":"ChIJbf8C1yFxdDkR3n12P4DkKt0","text":{"text":"Taj Mahal, Dharmapuri, Forest Colony, Tajganj, Agra, Uttar Pradesh, India","matches":[{"endOffset":3}]},"structuredFormat":{"mainText":{"text":"Taj Mahal","matches":[{"endOffset":3}]},"secondaryText":{"text":"Dharmapuri, Forest Colony, Tajganj, Agra, Uttar Pradesh, India"}},"types":["establishment","historical_place","point_of_interest","tourist_attraction","monument"]}},{"placePrediction":{"place":"places/ChIJsU1CR_eNTTARAuhXB4gs154","placeId":"ChIJsU1CR_eNTTARAuhXB4gs154","text":{"text":"Tajlandia","matches":[{"endOffset":3}]},"structuredFormat":{"mainText":{"text":"Tajlandia","matches":[{"endOffset":3}]}},"types":["political","geocode","country"]}},{"placePrediction":{"place":"places/ChIJEaA-2MPiDDkR6C6xllFemnE","placeId":"ChIJEaA-2MPiDDkR6C6xllFemnE","text":{"text":"Taj Mahal, New Delhi, South Block, Man Singh Road Area, New Delhi, Delhi, India","matches":[{"endOffset":3}]},"structuredFormat":{"mainText":{"text":"Taj Mahal, New Delhi","matches":[{"endOffset":3}]},"secondaryText":{"text":"South Block, Man Singh Road Area, New Delhi, Delhi, India"}},"types":["establishment","point_of_interest","lodging","hotel"]}},{"placePrediction":{"place":"places/ChIJXWsF1W2c7TkR_rJWeEgRM64","placeId":"ChIJXWsF1W2c7TkR_rJWeEgRM64","text":{"text":"Tajpur, Bihar, India","matches":[{"endOffset":3}]},"structuredFormat":{"mainText":{"text":"Tajpur","matches":[{"endOffset":3}]},"secondaryText":{"text":"Bihar, India"}},"types":["locality","geocode","political"]}}]
        res.status(200).json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error searching for locations' });
    }
}

module.exports = {
    searchLocation
};