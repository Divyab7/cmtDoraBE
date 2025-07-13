const Location = require('../models/Location');
const { UserModel, BucketListItem, Country, State } = require('../models/User');
const axios = require('axios');

const API_KEY = 'AIzaSyBqLZemtICHovL-DeZWJexVstGv91hjCwI';

async function updateLocation(req, res) {

    // const bucketListItems = await BucketListItem.find();

    // for (const item of bucketListItems) {
        const locations = await Location.find(); //findById(item.locationId);
        // console.log(location)
        for (const location of locations) {
        if (!location?.addressComponents || !location?.addressComponents?.length) {
            const response = await axios.get(
                `https://places.googleapis.com/v1/places/${location.placeId}?fields=addressComponents&key=${API_KEY}`
              );

            const { addressComponents } = response.data;

            // Update the location with addressComponents
            location.addressComponents = addressComponents;
            await location.save();
            console.log(location?.text?.text + ' updated');
        } else {
            console.log(location?.text?.text +' already has address components');
        }
    }
    // }
}

module.exports = {
    updateLocation,
};