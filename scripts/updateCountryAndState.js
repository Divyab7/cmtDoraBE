const Location = require('../models/Location');
const { UserModel, BucketListItem, Country, State } = require('../models/User');

async function updateCountryAndState(req, res) {
    const bucketListItems = await BucketListItem.find().populate('locationId');
    for (const item of bucketListItems) {
        const location = await Location.findById(item.locationId);
        if (!location || !location.addressComponents) continue;

        const stateComponent = location.addressComponents.find(component =>
            component.types.includes('administrative_area_level_1')
        );
        const countryComponent = location.addressComponents.find(component =>
            component.types.includes('country')
        );

        if (!countryComponent) continue;

        const countryName = countryComponent.longText;

        let country = await Country.findOne({ name: countryName });

        if (!country) {
            country = new Country({ name: countryName, states: [], bucketList: [] });
            await country.save();
        }

        if (stateComponent) {
            const stateName = stateComponent.longText;
            let state = await State.findOne({ name: stateName, countryId: country._id });

            if (!state) {
                state = new State({ name: stateName, countryId: country._id, bucketList: [] });
                await state.save();
      
                // Add state to country
                country.states.push(state._id);
                await country.save();
            }

            item.stateId = state._id;
            state.bucketList.push(item._id);
            await state.save();
        } else {
            country.bucketList.push(item._id);
            await country.save();
        }

        item.countryId = country._id;
        await item.save();
    
    }
    console.log("done");
}

module.exports = {
    updateCountryAndState,
};