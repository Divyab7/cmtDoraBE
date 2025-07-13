const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteer = require('puppeteer-extra');

puppeteer.use(StealthPlugin());

const parsePrice = price => parseInt(price?.replace(/[₹​,]/g, ''), 10);

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100; // Scroll distance
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}

async function scrapeDates(origin, destination, month) {
  try {
    const datesURL = `https://www.skyscanner.co.in/transport/flights/${origin}/${destination}/?adultsv2=1&cabinclass=economy&childrenv2=&ref=home&rtn=0&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false&oym=${month}&selectedoday=01`
    // Launch Puppeteer
    const browser = await puppeteer.launch({ headless: true, args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ] });
    const page = await browser.newPage();

    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });
      await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9',
      });

    // page.setDefaultTimeout(60000);

    // Navigate to the URL
    await page.goto(datesURL, { waitUntil: 'load' });

    // Scroll down to load dynamic content
    // await autoScroll(page);

    // Wait for innermost element to load
    await page.waitForSelector('.month-view-calendar__cell');

    const scrapedData = await page.evaluate((month) => {
        const data = [];
        const cells = document.querySelectorAll('.month-view-calendar__cell');
        
        cells.forEach(cell => {
          const date = cell.querySelector('.date-revamp') ? cell.querySelector('.date-revamp').textContent.trim() : null;
          const price = cell.querySelector('.price-revamp') ? cell.querySelector('.price-revamp').textContent.trim() : null;
          
          if (date && price) {
            data.push({ date: new Date(String(`${String(month).slice(2, 4)}/${date}/${String(month).slice(0, 2)}`)).toLocaleDateString('en-GB'), price });
          }
        });
    
        return data;
      }, month);
    
    // Close the browser
    await browser.close();

    return scrapedData;
  } catch (error) {
    console.log(error);
  }
}

async function getBestFlightDates(origin, destination) {

      const tomorrow = new Date(new Date().setDate(new Date().getDate() + 1)).toLocaleDateString('en-GB'); 
      // const sevenDaysLaterDate = new Date(new Date().setDate(new Date().getDate() + 7)).toLocaleDateString('en-GB'); 
      const [year, month] = [(new Date()).getFullYear(), String((new Date()).getMonth() + 1).padStart(2, '0')]; 
      const [number1, number2, number3] = [
        `${String(year).slice(-2)}${String(month).padStart(2, '0')}`,
        `${String(year + Math.floor((parseInt(month) + 1) / 13)).slice(-2)}${String((parseInt(month) % 12) + 1).padStart(2, '0')}`,
        `${String(year + Math.floor((parseInt(month) + 2) / 13)).slice(-2)}${String(((parseInt(month) + 1) % 12) + 1).padStart(2, '0')}`
      ];
      const months = [number1, number2, number3]

      try {
        const dateList = await Promise.all(
          months?.map(async (month) => {
            const result = await scrapeDates(origin, destination, month);
            return result;
          })
        ).then(results => results.flat());
                
        const { 
          date: tomorrowDate, 
          price: tomorrowPrice,
          cheapestNext7Date, 
          cheapestNext7Price,
          cheapestOverallDate, 
          cheapestOverallPrice 
        } = {
          ...(dateList?.find(item => item?.date === tomorrow) || {}),
          ...{
            cheapestNext7Date: dateList?.slice(0, 7).reduce((min, curr) => 
              Number(curr?.price?.replace(/[₹,\u200B]/g, '')) < Number(min?.price?.replace(/[₹,\u200B]/g, '')) 
                ? curr 
                : min, 
              dateList[0]
            )?.date,
            cheapestNext7Price: dateList?.slice(0, 7).reduce((min, curr) => 
              Number(curr?.price?.replace(/[₹,\u200B]/g, '')) < Number(min?.price?.replace(/[₹,\u200B]/g, '')) 
                ? curr 
                : min, 
              dateList[0]
            )?.price
          },
          ...{
            cheapestOverallDate: dateList?.reduce((min, curr) => 
              Number(curr?.price?.replace(/[₹,\u200B]/g, '')) < Number(min?.price?.replace(/[₹,\u200B]/g, '')) 
                ? curr 
                : min, 
              dateList[0]
            )?.date,
            cheapestOverallPrice: dateList?.reduce((min, curr) => 
              Number(curr?.price?.replace(/[₹,\u200B]/g, '')) < Number(min?.price?.replace(/[₹,\u200B]/g, '')) 
                ? curr 
                : min, 
              dateList[0]
            )?.price
          }
        };
        
        // console.log(
        //   `Tomorrow: ${tomorrowDate} - ${tomorrowPrice}`,
        //   `\nCheapest in next 7 days: ${cheapestNext7Date} - ${cheapestNext7Price}`,
        //   `\nCheapest overall: ${cheapestOverallDate} - ${cheapestOverallPrice}`
        // );

        const preferredDatesAndPrice = [{date: tomorrowDate, price: tomorrowPrice}, {date: cheapestNext7Date, price: cheapestNext7Price}, {date: cheapestOverallDate, price: cheapestOverallPrice}];

        return preferredDatesAndPrice;
      } catch (error) {
      console.error(error);
    }
  }

  async function getNextWeekFlight(origin, destination, startDate) {
    // Parse DD/MM/YYYY format
    const [day, month, year] = startDate.split('/').map(Number);
    const baseDate = new Date(year, month - 1, day); // month - 1 because JS months are 0-based
    
    // Get the current and next month in case we need to cross month boundary
    function getMonthFormat(date) {
        return `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    // Get all the dates we need to check
    const targetDates = [];
    const monthsToCheck = new Set(); // Use Set to avoid duplicate months
    
    for (let i = 3; i <= 7; i++) {
        const checkDate = new Date(baseDate);
        checkDate.setDate(baseDate.getDate() + i);
        targetDates.push({
            date: checkDate.toLocaleDateString('en-GB'), // This will give DD/MM/YYYY format
            month: getMonthFormat(checkDate)
        });
        monthsToCheck.add(getMonthFormat(checkDate));
    }
    
    try {
        // Fetch data for all required months
        const allFlights = await Promise.all(
            Array.from(monthsToCheck).map(month => 
                scrapeDates(origin, destination, month)
            )
        ).then(results => results.flat());
        
        // Filter dates to only include our target range
        const flightsInRange = allFlights.filter(flight => 
            targetDates.some(target => target.date === flight.date)
        );
        
        if (flightsInRange.length === 0) {
            return null; // Or handle empty case as needed
        }
        
        // Find the cheapest flight in our filtered range
        const cheapestFlight = flightsInRange.reduce((min, curr) => {
            const currentPrice = Number(curr.price.replace(/[₹,\u200B]/g, ''));
            const minPrice = Number(min.price.replace(/[₹,\u200B]/g, ''));
            return currentPrice < minPrice ? curr : min;
        }, flightsInRange[0]);
        
        return cheapestFlight;
        
    } catch (error) {
        console.error('Error finding cheapest flight in range:', error);
        throw error;
    }
}
  
  module.exports = {
    getBestFlightDates,
    getNextWeekFlight
  };