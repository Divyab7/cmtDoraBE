const { getBestFlightDates, getNextWeekFlight } = require("../utils/getBestFlightsDates");
const { getFlightDetails } = require("../utils/getFlightDetails");

async function getFlightPackages(parsedConfig) {
    const preferredDatesAndPrice = await getBestFlightDates(
      parsedConfig.flight[0].origincity,
      parsedConfig.flight[0].destinationcity
    ); // Preferred dates for the first flight
  
    const fullPackage = await Promise.all(
      preferredDatesAndPrice.map(async (preferred) => {
        const firstFlight = {
          date: preferred.date,
          price: preferred.price,
          origincity: parsedConfig.flight[0].origincity,
          destinationcity: parsedConfig.flight[0].destinationcity,
        };
  
        let nextFlights = [];
        let currentDate = preferred.date;
  
        // Loop through all remaining flights
        for (let i = 1; i < parsedConfig.flight.length; i++) {
          const nextFlight = await getNextWeekFlight(
            parsedConfig.flight[i].origincity,
            parsedConfig.flight[i].destinationcity,
            currentDate // Start from the last flight's date
          );
          console.log(nextFlight)
  
          nextFlights.push({
            date: nextFlight.date,
            price: nextFlight.price,
            origincity: parsedConfig.flight[i].origincity,
            destinationcity: parsedConfig.flight[i].destinationcity,
          });
  
          // Update currentDate to the latest flight's date
          currentDate = nextFlight.date;
        }
  
        return {
          type: preferredDatesAndPrice.indexOf(preferred) === 0
            ? 'tomorrow'
            : preferredDatesAndPrice.indexOf(preferred) === 1
            ? '2weeks'
            : '3months',
          flights: [firstFlight, ...nextFlights],
        };
      })
    );
  
    return fullPackage;
  }
  
  
  // Example helper functions (mocked for testing)
  
//   async function getNextWeekFlight(origin, destination, startDate) {
//     // Parse DD/MM/YYYY format into a valid Date object
//     const [day, month, year] = startDate.split('/').map(Number);
//     const validDate = new Date(year, month - 1, day); // Month is zero-based in JS Date
  
//     if (isNaN(validDate.getTime())) {
//       throw new Error(`Invalid date: ${startDate}`);
//     }
  
//     // Add 1 day to the parsed date
//     validDate.setDate(validDate.getDate() + 1);
  
//     // Format the date back to DD/MM/YYYY
//     const formattedDate = validDate
//       .toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
//       .replace(/\//g, '/'); // Ensures the separator remains `/`
  
//     return {
//       date: formattedDate,
//       price: '₹14,000',
//     };
//   }
  
  
  async function fetchHotelsForInterval(hotels, flights) {
    const intervalStartDate = flights[0]?.date;
    const intervalEndDate = flights[flights.length - 1]?.date;
  
    return await Promise.all(
      hotels.map(async (hotel) => {
        const hotelDetails = await getHotelPrices(hotel, intervalStartDate, intervalEndDate);
        return { ...hotelDetails, name: hotel.name };
      })
    );
  }
  
  async function getHotelPrices(hotel, startDate, endDate) {
    return { name: hotel.name, price: '₹10,000', startDate, endDate };
  } 

  async function populateDetails(list) {
    list.map(listItem => {
      if(listItem?.flights?.length > 0) {
        listItem.flights.map(flight => {
          getFlightDetails(flight);
        })
      }
    })
  }

async function handleBookingResult(req, res) {
    const { config } = req.query;
    try {
        const parsedConfig = JSON.parse(JSON.parse(config));
        if(parsedConfig?.type === 'trip') {
            const packagesDates = await getFlightPackages(parsedConfig);
            console.log(packagesDates);

            res.status(200).json(packages);
        }
        if(parsedConfig?.type === 'flight') {

        }
        if(parsedConfig?.type === 'hotel') {

        }
    
      } catch (error) {
        console.log(error)
        return res.status(500).json({
          error: 'Internal Server Error 3',
        });
    
      }
}

module.exports = {
    handleBookingResult
};