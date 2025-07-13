const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteer = require('puppeteer-extra');

puppeteer.use(StealthPlugin());

async function getFlightDetails(origin, destination, startDate) {

}

module.exports = {
    getFlightDetails,
  };