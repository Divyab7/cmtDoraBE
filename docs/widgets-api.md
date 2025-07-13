# Widgets API Documentation

This document provides information on how to use the travel-related widgets API endpoints.

## Available Widgets

Get a list of all available widgets:

```
GET /widgets
```

Response:
```json
{
  "success": true,
  "widgets": [
    {
      "id": "currency-converter",
      "name": "Currency Converter",
      "description": "Convert between different currencies for your trip"
    },
    {
      "id": "packing-calculator",
      "name": "Packing Calculator",
      "description": "Calculate what to pack based on destination and duration"
    },
    {
      "id": "flight-time-estimator",
      "name": "Flight Time Estimator",
      "description": "Estimate flight times between destinations"
    },
    {
      "id": "travel-budget",
      "name": "Travel Budget Planner",
      "description": "Plan your travel budget based on destination and preferences"
    },
    {
      "id": "emergency-contacts",
      "name": "Emergency Contacts",
      "description": "Find emergency contacts and services for your travel destination"
    },
    {
      "id": "travel-phrases",
      "name": "Travel Phrases",
      "description": "Learn common phrases and local slang with pronunciation guides"
    },
    {
      "id": "crowd-estimator", 
      "name": "Crowd Estimator", 
      "description": "Get crowd level predictions and tips for avoiding busy periods at tourist destinations"
    }
  ]
}
```

## Travel Budget Planner

Get a detailed budget estimate for a trip:

```
GET /widgets/travel-budget?destination={destination}&origin={origin}&passengers={number}&duration={days}&travelStyle={style}
```

### Parameters

| Parameter      | Type   | Required | Description                                      |
|----------------|--------|----------|--------------------------------------------------|
| destination    | string | Yes      | Destination city/country                         |
| origin         | string | No       | Origin city/country                              |
| passengers     | number | No       | Number of travelers (default: 1)                 |
| duration       | number | No       | Trip duration in days (default: 7)               |
| travelStyle    | string | No       | Budget/Mid-range/Luxury (default: Mid-range)     |
| accommodation  | string | No       | Preferred accommodation type                     |
| transportation | string | No       | Preferred transportation methods                 |
| activities     | string | No       | Planned activities                               |

### Example Request

```
GET /widgets/travel-budget?destination=Tokyo,%20Japan&origin=New%20York,%20USA&passengers=2&duration=10&travelStyle=Mid-range
```

### Example Response

```json
{
  "success": true,
  "query": {
    "origin": "New York, USA",
    "destination": "Tokyo, Japan",
    "passengers": 2,
    "duration": 10,
    "travelStyle": "Mid-range",
    "accommodation": "Not specified",
    "transportation": "Not specified",
    "activities": "Not specified"
  },
  "data": {
    "summary": {
      "totalEstimatedCost": 7820,
      "costPerPerson": 3910,
      "costPerDay": 782,
      "currency": "USD",
      "budgetLevel": "Mid-range"
    },
    "breakdown": {
      "accommodation": {
        "totalCost": 2000,
        "perNight": 200,
        "description": "Mid-range hotels and accommodations in Tokyo"
      },
      "transportation": {
        "international": {
          "totalCost": 2600,
          "perPerson": 1300,
          "description": "Round-trip flights from New York to Tokyo"
        },
        "local": {
          "totalCost": 500,
          "perPerson": 250,
          "description": "Subway, buses, and occasional taxis"
        }
      },
      "food": {
        "totalCost": 1400,
        "perDayPerPerson": 70,
        "description": "Mix of local restaurants, casual dining, and occasional upscale meals"
      },
      "activities": {
        "totalCost": 1000,
        "perPerson": 500,
        "description": "Tourist attractions, museums, and experiences",
        "suggestedActivities": [
          {
            "name": "Tokyo Skytree",
            "estimatedCost": 46,
            "description": "Observation deck with panoramic views"
          },
          {
            "name": "TeamLab Borderless Digital Art Museum",
            "estimatedCost": 30,
            "description": "Immersive digital art experience"
          },
          {
            "name": "Day trip to Mount Fuji",
            "estimatedCost": 150,
            "description": "Guided tour to Mount Fuji and surrounding areas"
          },
          {
            "name": "Tokyo Disneyland",
            "estimatedCost": 75,
            "description": "Theme park admission"
          }
        ]
      },
      "miscellaneous": {
        "totalCost": 320,
        "description": "Travel insurance, SIM cards, souvenirs, and unexpected expenses"
      }
    },
    "notes": [
      "Prices may vary based on season and availability",
      "Hotel prices in Tokyo can be higher during cherry blossom season",
      "Many attractions offer discounted tickets if purchased online in advance"
    ],
    "savingTips": [
      "Purchase a Tokyo Metro pass for unlimited subway rides",
      "Convenience stores (konbini) offer quality food at affordable prices",
      "Stay in accommodations outside the city center for lower rates",
      "Visit free attractions like Meiji Shrine and the Imperial Palace Gardens",
      "Look for lunch specials at restaurants for better value than dinner"
    ],
    "seasonalConsiderations": "Traveling during cherry blossom season (late March to early April) or autumn colors (November) will result in higher accommodation costs. Summer can be very hot and humid but may offer better deals."
  }
}
```

## Packing Calculator

Get a personalized packing list based on trip details:

```
GET /widgets/packing-calculator?destination={destination}&duration={duration}&gender={gender}&age={age}&activities={activities}&season={season}&style={style}&tripType={tripType}
```

### Parameters

| Parameter  | Type    | Required | Description                                                |
|------------|---------|----------|------------------------------------------------------------|
| destination| string  | Yes      | Travel destination (city, country, or region)              |
| duration   | integer | No       | Trip duration in days (default: 7)                         |
| gender     | string  | No       | Traveler's gender (male/female/neutral, default: neutral)  |
| age        | integer | No       | Traveler's age (default: adult)                            |
| activities | string  | No       | Planned activities (default: general sightseeing)          |
| season     | string  | No       | Travel season (spring/summer/fall/winter, default: current)|
| style      | string  | No       | Packing style (efficient/minimal/prepared, default: efficient) |
| tripType   | string  | No       | Type of trip (leisure/business/adventure/beach/winter, default: leisure) |

### Example Request

```
GET /widgets/packing-calculator?destination=Bali%2C%20Indonesia&duration=10&gender=female&age=30&activities=beach%2C%20hiking%2C%20snorkeling&season=summer&style=efficient&tripType=adventure
```

### Example Response

```json
{
  "success": true,
  "query": {
    "destination": "Bali, Indonesia",
    "duration": 10,
    "gender": "female",
    "age": 30,
    "activities": "beach, hiking, snorkeling",
    "season": "summer",
    "style": "efficient",
    "tripType": "adventure"
  },
  "data": {
    "packingList": {
      "clothing": {
        "essentials": [
          {"item": "T-shirts/tank tops", "quantity": 6, "notes": "Quick-drying, moisture-wicking fabrics"},
          {"item": "Shorts", "quantity": 3, "notes": "Lightweight, quick-drying fabric"},
          {"item": "Lightweight long pants/hiking pants", "quantity": 2, "notes": "Convertible pants recommended for hiking"},
          {"item": "Dresses/sundresses", "quantity": 2, "notes": "For casual evenings out"},
          {"item": "Sleepwear", "quantity": 1, "notes": "Light and comfortable for warm nights"}
        ],
        "outerwear": [
          {"item": "Light rain jacket", "quantity": 1, "notes": "For unexpected rain showers"},
          {"item": "Light cardigan or shawl", "quantity": 1, "notes": "For cooler evenings or air-conditioned places"}
        ],
        "footwear": [
          {"item": "Hiking sandals", "quantity": 1, "notes": "Water-friendly with good grip"},
          {"item": "Flip flops", "quantity": 1, "notes": "For beach and casual wear"},
          {"item": "Comfortable walking shoes", "quantity": 1, "notes": "For longer walks and temple visits"}
        ],
        "accessories": [
          {"item": "Sun hat", "quantity": 1, "notes": "Wide-brimmed for sun protection"},
          {"item": "Sunglasses", "quantity": 1, "notes": "UV protection"},
          {"item": "Sarong/lightweight scarf", "quantity": 1, "notes": "Multipurpose: beach cover-up, temple visits, sun protection"},
          {"item": "Swimwear", "quantity": 2, "notes": "One to wear while the other dries"}
        ],
        "specialItems": [
          {"item": "Rashguard/swim shirt", "quantity": 1, "notes": "For sun protection while snorkeling"},
          {"item": "Waterproof bag/dry bag", "quantity": 1, "notes": "For beach days and water activities"}
        ]
      },
      "toiletries": [
        {"item": "Biodegradable sunscreen", "quantity": 1, "notes": "High SPF, reef-safe formula"},
        {"item": "After-sun lotion/aloe vera", "quantity": 1, "notes": "For sunburn relief"},
        {"item": "Insect repellent", "quantity": 1, "notes": "DEET or natural alternatives"},
        {"item": "Hand sanitizer", "quantity": 1, "notes": "Travel-sized"},
        {"item": "Basic toiletries", "quantity": 1, "notes": "Shampoo, conditioner, soap, toothpaste, etc."}
      ],
      "electronics": [
        {"item": "Phone and charger", "quantity": 1, "notes": "With travel adapter for Indonesia"},
        {"item": "Camera", "quantity": 1, "notes": "Waterproof or with waterproof case for snorkeling"},
        {"item": "Power bank", "quantity": 1, "notes": "For long days away from power sources"}
      ],
      "healthAndSafety": [
        {"item": "First aid kit", "quantity": 1, "notes": "Basic supplies including bandages, pain relievers, antihistamines"},
        {"item": "Prescription medications", "quantity": 1, "notes": "In original containers with extra supply"},
        {"item": "Rehydration salts", "quantity": 1, "notes": "For hydration in hot climate"},
        {"item": "Motion sickness remedies", "quantity": 1, "notes": "For boat trips to snorkeling sites"}
      ],
      "miscellaneous": [
        {"item": "Reusable water bottle", "quantity": 1, "notes": "To stay hydrated and reduce plastic waste"},
        {"item": "Snorkel mask and fins", "quantity": 1, "notes": "Optional - can be rented locally"},
        {"item": "Quick-dry towel", "quantity": 1, "notes": "For beach days and water activities"},
        {"item": "Travel locks", "quantity": 2, "notes": "For securing luggage and hostel lockers"}
      ]
    },
    "outfitPlanner": {
      "dailyOutfits": [
        {
          "day": 1,
          "daytime": {
            "outfit": "Tank top, shorts, hiking sandals, sun hat",
            "reason": "Lightweight, comfortable outfit for arrival and initial exploration"
          },
          "evening": {
            "outfit": "Sundress, light cardigan, comfortable walking shoes",
            "reason": "Comfortable yet slightly elevated for dinner or evening exploration"
          }
        },
        {
          "day": 2,
          "daytime": {
            "outfit": "Swimwear, rashguard, flip flops, sun hat",
            "reason": "Beach day and snorkeling activities"
          },
          "evening": {
            "outfit": "T-shirt, shorts, light cardigan, comfortable walking shoes",
            "reason": "Casual evening after a day at the beach"
          }
        },
        {
          "day": 3,
          "daytime": {
            "outfit": "Quick-dry T-shirt, convertible hiking pants, hiking sandals, sun hat",
            "reason": "Hiking day with moderate terrain and warm weather"
          },
          "evening": {
            "outfit": "Sundress or T-shirt with shorts, light cardigan, comfortable walking shoes",
            "reason": "Relaxed outfit for resting after hiking"
          }
        },
        {
          "day": 4,
          "daytime": {
            "outfit": "Swimwear, rashguard, sarong, flip flops",
            "reason": "Another beach and snorkeling day"
          },
          "evening": {
            "outfit": "Tank top, shorts, light cardigan, comfortable walking shoes",
            "reason": "Casual outfit for local restaurant or market visit"
          }
        },
        {
          "day": 5,
          "daytime": {
            "outfit": "T-shirt, shorts, hiking sandals, sun hat",
            "reason": "Exploring temples and cultural sites"
          },
          "evening": {
            "outfit": "Sundress, light cardigan, comfortable walking shoes",
            "reason": "Slightly more dressy for a nice dinner"
          }
        },
        {
          "day": 6,
          "daytime": {
            "outfit": "Quick-dry T-shirt, convertible hiking pants, hiking sandals",
            "reason": "Light hiking and waterfall visit"
          },
          "evening": {
            "outfit": "T-shirt, shorts, comfortable walking shoes",
            "reason": "Relaxed evening after active day"
          }
        },
        {
          "day": 7,
          "daytime": {
            "outfit": "Tank top, shorts, flip flops, sun hat",
            "reason": "Local market exploration or shopping day"
          },
          "evening": {
            "outfit": "Sundress, light cardigan, comfortable walking shoes",
            "reason": "Nice outfit for evening entertainment or dinner"
          }
        }
      ],
      "specialOccasions": [
        {
          "occasion": "Temple visits",
          "outfit": "Long pants or long skirt, T-shirt covering shoulders, comfortable walking shoes",
          "reason": "Modest attire required for entering Balinese temples"
        },
        {
          "occasion": "Nice restaurant dinner",
          "outfit": "Sundress or nicer outfit, light cardigan, comfortable but nicer shoes",
          "reason": "Slightly elevated outfit for special dining experiences"
        }
      ],
      "layeringTips": "Even in hot climates, carry a light layer for air-conditioned spaces, evening sea breezes, and higher elevation areas. A sarong is versatile for sun protection, beach cover-up, and impromptu temple visits.",
      "packingTips": [
        "Roll clothes rather than folding to save space and reduce wrinkles",
        "Use packing cubes to organize and compress clothing",
        "Pack quick-dry fabrics that can be hand-washed and will dry overnight",
        "Keep swimwear and active clothes separate from nicer outfits"
      ]
    },
    "destinationSpecifics": {
      "weatherSummary": "Bali has a tropical climate with year-round warm temperatures (average 26-30°C/79-86°F). Summer brings hot, sunny days with occasional afternoon rain showers. Humidity is high year-round.",
      "localConsiderations": [
        "Modest clothing is required for temple visits (covered shoulders and knees)",
        "Reef-safe sunscreen is essential to protect Bali's marine ecosystem",
        "Rain showers can occur even in dry season - a light rain jacket is useful",
        "Higher elevations (like volcano hikes) can be significantly cooler"
      ],
      "culturalNotes": [
        "Balinese culture values modesty, especially away from beach areas",
        "Remove shoes when entering temples and homes",
        "Cover tattoos when visiting religious sites if possible",
        "Sarongs are often required at temples (sometimes provided on-site)"
      ],
      "packingChallenges": [
        "High humidity can make clothes feel damp - quick-dry fabrics are essential",
        "Balancing beach gear with appropriate clothing for cultural sites",
        "Protecting electronics from water, sand, and humidity",
        "Packing light while being prepared for various activities"
      ]
    },
    "laundryStrategy": {
      "recommendation": "Hand wash quick-dry items every 2-3 days and utilize laundry services mid-trip",
      "options": [
        "Many accommodations offer affordable laundry services (typically 1-day turnaround)",
        "Hand washing quick-dry items in sink/shower with travel detergent",
        "Laundromats are available in tourist areas for self-service washing",
        "Plan to do a larger wash around day 5 to refresh your wardrobe for the second half of the trip"
      ]
    }
  }
}
```

## Emergency Contacts

Get emergency contacts and services for a specific location:

```
GET /widgets/emergency-contacts?address={location}
```

### Parameters

| Parameter | Type   | Required | Description             |
|-----------|--------|----------|-------------------------|
| address   | string | Yes      | The destination address |

### Example Request

```
GET /widgets/emergency-contacts?address=Tokyo,%20Japan
```

### Example Response

```json
{
  "success": true,
  "address": "Tokyo, Japan",
  "data": {
    "emergencyNumbers": [
      {
        "service": "General Emergency",
        "number": "110",
        "description": "Police emergency number"
      },
      {
        "service": "Police",
        "number": "110",
        "description": "For crime reporting and emergencies"
      },
      {
        "service": "Ambulance",
        "number": "119",
        "description": "Medical emergencies and fire"
      },
      {
        "service": "Fire Department",
        "number": "119",
        "description": "Fire emergencies"
      }
    ],
    "medicalFacilities": [
      {
        "name": "Tokyo Medical University Hospital",
        "address": "6-7-1 Nishishinjuku, Shinjuku City, Tokyo 160-0023",
        "phone": "+81 3-3342-6111",
        "description": "Large university hospital with English-speaking staff",
        "emergencyHours": "24/7"
      },
      // More facilities...
    ],
    "embassiesConsulates": [
      {
        "country": "United States",
        "address": "1-10-5 Akasaka, Minato City, Tokyo 107-8420",
        "phone": "+81 3-3224-5000",
        "email": "tokyoacs@state.gov"
      },
      // More embassies...
    ],
    "touristPolice": {
      "available": true,
      "number": "+81 3-3501-0110",
      "locations": ["Shinjuku", "Shibuya", "Tokyo Station"]
    },
    "localHelplines": [
      {
        "service": "Japan Helpline",
        "number": "0570-000-911",
        "description": "24-hour English emergency assistance"
      },
      // More helplines...
    ],
    "travelAdvisories": {
      "source": "Various international agencies",
      "level": "Low risk",
      "summary": "Tokyo is generally considered safe for travelers"
    },
    "usefulPhrases": [
      {
        "phrase": "I need help",
        "localLanguage": "Tasukete kudasai",
        "pronunciation": "tah-sue-keh-teh koo-dah-sai"
      },
      // More phrases...
    ]
  }
}
```

## Travel Phrases

Get common phrases, slang and expressions with translations and pronunciations for travelers:

```
GET /widgets/travel-phrases?location={location}&sourceLanguage={language}
```

### Parameters

| Parameter       | Type   | Required | Description                                |
|-----------------|--------|----------|--------------------------------------------|
| location        | string | Yes      | The destination location                   |
| sourceLanguage  | string | No       | Source language (default: English)         |

### Example Request

```
GET /widgets/travel-phrases?location=Tokyo,%20Japan
```

### Example Response

```json
{
  "success": true,
  "location": "Tokyo, Japan",
  "sourceLanguage": "English",
  "data": {
    "localLanguage": "Japanese",
    "sourceLanguage": "English",
    "languageInfo": {
      "name": "Japanese",
      "description": "Japanese is the official language of Japan. It uses three writing systems: hiragana, katakana, and kanji (Chinese characters).",
      "difficultyLevel": "High for English speakers due to its different grammar structure and writing system",
      "usefulTips": [
        "Japanese people appreciate when tourists try to speak their language, even if it's just basic phrases",
        "Politeness levels are important in Japanese; when in doubt, use the polite form",
        "Many Japanese people understand basic English, especially in Tokyo and tourist areas",
        "Using a translation app can be helpful for complex conversations"
      ]
    },
    "categories": [
      {
        "name": "Greetings",
        "phrases": [
          {
            "phrase": "Hello",
            "translation": "Konnichiwa",
            "pronunciation": "kohn-nee-chee-wah",
            "context": "General greeting during daytime"
          },
          {
            "phrase": "Good morning",
            "translation": "Ohayou gozaimasu",
            "pronunciation": "oh-hah-yoh goh-zah-ee-mahs",
            "context": "Morning greeting"
          },
          {
            "phrase": "Good evening",
            "translation": "Konbanwa",
            "pronunciation": "kohn-bahn-wah",
            "context": "Evening greeting"
          },
          {
            "phrase": "Thank you",
            "translation": "Arigatou gozaimasu",
            "pronunciation": "ah-ree-gah-toh goh-zah-ee-mahs",
            "context": "Formal thank you"
          },
          {
            "phrase": "Yes",
            "translation": "Hai",
            "pronunciation": "hai",
            "context": "Agreement or acknowledgment"
          },
          {
            "phrase": "No",
            "translation": "Iie",
            "pronunciation": "ee-eh",
            "context": "Negation or refusal"
          },
          {
            "phrase": "Excuse me/Sorry",
            "translation": "Sumimasen",
            "pronunciation": "soo-mee-mah-sen",
            "context": "Getting attention or apologizing"
          }
        ]
      },
      {
        "name": "Basics",
        "phrases": [
          {
            "phrase": "I don't understand",
            "translation": "Wakarimasen",
            "pronunciation": "wah-kah-ree-mah-sen",
            "context": "When you don't understand what someone is saying"
          },
          {
            "phrase": "Do you speak English?",
            "translation": "Eigo o hanasemasu ka?",
            "pronunciation": "ay-go oh hah-nah-seh-mahs kah",
            "context": "Asking if someone speaks English"
          },
          {
            "phrase": "Where is the bathroom?",
            "translation": "Toire wa doko desu ka?",
            "pronunciation": "toy-reh wah doh-koh dehs kah",
            "context": "Asking for bathroom location"
          },
          {
            "phrase": "How much is this?",
            "translation": "Kore wa ikura desu ka?",
            "pronunciation": "koh-reh wah ee-koo-rah dehs kah",
            "context": "Asking for price"
          },
          {
            "phrase": "Please",
            "translation": "Onegaishimasu",
            "pronunciation": "oh-neh-gai-shee-mahs",
            "context": "Making a request"
          }
        ]
      },
      {
        "name": "Emergencies",
        "phrases": [
          {
            "phrase": "Help!",
            "translation": "Tasukete!",
            "pronunciation": "tah-soo-keh-teh",
            "context": "Calling for help in emergency"
          },
          {
            "phrase": "I need a doctor",
            "translation": "Isha ga hitsuyou desu",
            "pronunciation": "ee-shah gah heet-soo-yoh dehs",
            "context": "Medical emergency"
          },
          {
            "phrase": "Call the police",
            "translation": "Keisatsu o yonde kudasai",
            "pronunciation": "kay-sah-tsoo oh yohn-deh koo-dah-sai",
            "context": "When police assistance is needed"
          },
          {
            "phrase": "I'm lost",
            "translation": "Michi ni mayoimashita",
            "pronunciation": "mee-chee nee mah-yoy-mash-tah",
            "context": "When you're lost and need directions"
          },
          {
            "phrase": "I'm allergic to...",
            "translation": "Watashi wa ... ni arerugii ga arimasu",
            "pronunciation": "wah-tah-shee wah ... nee ah-reh-roo-gee gah ah-ree-mahs",
            "context": "Explaining allergies, fill in the blank with allergen"
          }
        ]
      },
      {
        "name": "Food and Dining",
        "phrases": [
          {
            "phrase": "The bill, please",
            "translation": "Okaikei onegaishimasu",
            "pronunciation": "oh-kai-kay oh-neh-gai-shee-mahs",
            "context": "Asking for the bill at a restaurant"
          },
          {
            "phrase": "Delicious",
            "translation": "Oishii",
            "pronunciation": "oh-ee-shee",
            "context": "Complimenting food"
          },
          {
            "phrase": "I would like...",
            "translation": "... o kudasai",
            "pronunciation": "... oh koo-dah-sai",
            "context": "Ordering something, fill in with food item"
          },
          {
            "phrase": "Water, please",
            "translation": "Omizu o kudasai",
            "pronunciation": "oh-mee-zoo oh koo-dah-sai",
            "context": "Asking for water"
          },
          {
            "phrase": "Menu, please",
            "translation": "Menyuu o kudasai",
            "pronunciation": "men-yoo oh koo-dah-sai",
            "context": "Asking for a menu"
          },
          {
            "phrase": "I don't eat...",
            "translation": "Watashi wa ... o tabemasen",
            "pronunciation": "wah-tah-shee wah ... oh tah-beh-mah-sen",
            "context": "Dietary restrictions, fill in with food item"
          }
        ]
      },
      {
        "name": "Transportation",
        "phrases": [
          {
            "phrase": "Where is the train station?",
            "translation": "Eki wa doko desu ka?",
            "pronunciation": "eh-kee wah doh-koh dehs kah",
            "context": "Asking for train station location"
          },
          {
            "phrase": "How much is a ticket to...?",
            "translation": "... made no kippu wa ikura desu ka?",
            "pronunciation": "... mah-deh noh keep-poo wah ee-koo-rah dehs kah",
            "context": "Asking for ticket price"
          },
          {
            "phrase": "Which platform?",
            "translation": "Nan-banホーム desu ka?",
            "pronunciation": "nahn-bahn home dehs kah",
            "context": "Asking for platform number"
          },
          {
            "phrase": "Is this the right train for...?",
            "translation": "Kore wa ... yuki no densha desu ka?",
            "pronunciation": "koh-reh wah ... yoo-kee noh den-shah dehs kah",
            "context": "Confirming train destination"
          },
          {
            "phrase": "Taxi",
            "translation": "Takushii",
            "pronunciation": "tah-koo-shee",
            "context": "Asking for or referring to a taxi"
          }
        ]
      },
      {
        "name": "Shopping",
        "phrases": [
          {
            "phrase": "I'm just looking",
            "translation": "Mite iru dake desu",
            "pronunciation": "mee-teh ee-roo dah-keh dehs",
            "context": "When browsing in shops"
          },
          {
            "phrase": "Do you have...?",
            "translation": "... wa arimasu ka?",
            "pronunciation": "... wah ah-ree-mahs kah",
            "context": "Asking if a shop has a specific item"
          },
          {
            "phrase": "Too expensive",
            "translation": "Takai desu",
            "pronunciation": "tah-kai dehs",
            "context": "Commenting on high prices"
          },
          {
            "phrase": "Can I try this on?",
            "translation": "Kore o shichaku dekimasu ka?",
            "pronunciation": "koh-reh oh shee-chah-koo deh-kee-mahs kah",
            "context": "Asking to try on clothes"
          },
          {
            "phrase": "I'll take it",
            "translation": "Kore o kudasai",
            "pronunciation": "koh-reh oh koo-dah-sai",
            "context": "Deciding to purchase an item"
          }
        ]
      },
      {
        "name": "Local Slang",
        "phrases": [
          {
            "phrase": "Cool/Awesome",
            "translation": "Kakkoii",
            "pronunciation": "kah-koh-ee",
            "context": "Expressing admiration"
          },
          {
            "phrase": "Really?",
            "translation": "Hontou?",
            "pronunciation": "hohn-toh",
            "context": "Expressing surprise or disbelief"
          },
          {
            "phrase": "I understand",
            "translation": "Naruhodo",
            "pronunciation": "nah-roo-hoh-doh",
            "context": "Expressing comprehension"
          },
          {
            "phrase": "Let's go",
            "translation": "Ikuzo",
            "pronunciation": "ee-koo-zoh",
            "context": "Casual way to say 'let's go'"
          },
          {
            "phrase": "No way!",
            "translation": "Uso!",
            "pronunciation": "oo-soh",
            "context": "Expressing disbelief (literally 'lie')"
          },
          {
            "phrase": "It can't be helped",
            "translation": "Shouganai",
            "pronunciation": "shoh-gah-nai",
            "context": "Common expression for accepting a situation"
          },
          {
            "phrase": "Cheers!",
            "translation": "Kanpai!",
            "pronunciation": "kahn-pai",
            "context": "Toast when drinking"
          }
        ]
      }
    ],
    "culturalNotes": [
      {
        "title": "Bowing",
        "description": "Bowing (ojigi) is an important cultural practice in Japan. The deeper and longer the bow, the more respect is shown. A slight nod is casual, while a deep bow shows deep respect or apology."
      },
      {
        "title": "Removing Shoes",
        "description": "Always remove your shoes when entering a Japanese home, traditional ryokan, or certain restaurants with tatami mat floors. Look for shoe racks or slippers at the entrance."
      },
      {
        "title": "Chopstick Etiquette",
        "description": "Never stick chopsticks upright in rice (resembles funeral rituals) or pass food from chopstick to chopstick (reminiscent of bone passing at cremations)."
      },
      {
        "title": "Gift-giving",
        "description": "Gift-giving is common in Japan. When receiving a gift, accept with both hands and express gratitude. It's polite to initially refuse a gift once or twice before accepting."
      },
      {
        "title": "Business Card Exchange",
        "description": "Business cards (meishi) are exchanged with two hands, with the card facing toward the recipient. Take time to read it before carefully putting it away."
      }
    ]
  }
}
```

## Crowd Estimator

Get detailed crowd level estimations and analysis for tourist destinations:

```
GET /widgets/crowd-estimator?location={location}&date={date}&season={season}
```

### Parameters

| Parameter | Type   | Required | Description                                      |
|-----------|--------|----------|--------------------------------------------------|
| location  | string | Yes      | Tourist destination (city, attraction, etc.)     |
| date      | string | No       | Specific date for visit (DD-MM-YYYY format)      |
| season    | string | No       | Season of visit (spring/summer/fall/winter)      |

Note: If both `date` and `season` are omitted, the current season will be used. If both are provided, `season` takes precedence.

### Example Request

```
GET /widgets/crowd-estimator?location=Eiffel%20Tower&season=summer
```

### Example Response

```json
{
  "success": true,
  "query": {
    "location": "Eiffel Tower",
    "date": null,
    "season": "summer"
  },
  "data": {
    "location": {
      "name": "Eiffel Tower",
      "type": "Monument",
      "region": "Paris",
      "country": "France"
    },
    "overallCrowdLevel": {
      "level": "high",
      "description": "The Eiffel Tower is one of the most visited monuments in the world, receiving approximately 7 million visitors annually. During summer, crowd levels are particularly high with long wait times for elevators and viewing platforms."
    },
    "seasonalAnalysis": {
      "peakSeason": {
        "months": ["June", "July", "August"],
        "crowdLevel": "very high",
        "description": "Summer is peak tourist season in Paris, with the Eiffel Tower experiencing its highest visitor numbers. Wait times can exceed 2-3 hours during midday."
      },
      "shoulderSeason": {
        "months": ["April", "May", "September", "October"],
        "crowdLevel": "moderate",
        "description": "Spring and early fall offer pleasant weather with somewhat reduced crowds compared to summer."
      },
      "offSeason": {
        "months": ["November", "December", "January", "February", "March"],
        "crowdLevel": "low",
        "description": "Winter months (except for holiday periods) see the lowest visitor numbers, with shorter wait times and easier access."
      },
      "currentOrRequestedSeason": {
        "name": "summer",
        "crowdLevel": "very high",
        "description": "Summer is the busiest time at the Eiffel Tower with large crowds throughout the day, especially on weekends and holidays. Expect long queues for tickets and elevators."
      }
    },
    "weeklyPatterns": {
      "busiestDays": ["Saturday", "Sunday", "Friday"],
      "quietestDays": ["Tuesday", "Wednesday"],
      "description": "Weekends are significantly more crowded than weekdays. Mid-week days (Tuesday and Wednesday) typically have the lowest visitor numbers."
    },
    "dailyPatterns": {
      "peakHours": {
        "morning": "10:00 AM - 12:00 PM",
        "afternoon": "2:00 PM - 5:00 PM",
        "evening": "Sunset until closing"
      },
      "bestTimeToVisit": "Early morning (9:00 AM opening) or later evening (after 8:00 PM)",
      "description": "Crowds build throughout the morning, reaching peak levels around midday and early afternoon. Another surge occurs around sunset when visitors come for evening views and light shows."
    },
    "popularAttractions": [
      {
        "name": "Summit (Top Level)",
        "crowdLevel": "high",
        "bestTimeToVisit": "First thing in the morning or last elevator up",
        "tips": "Book summit access tickets online in advance. The summit is often less crowded than the second floor."
      },
      {
        "name": "Second Floor Viewing Deck",
        "crowdLevel": "very high",
        "bestTimeToVisit": "Before 10:00 AM or after 8:00 PM",
        "tips": "This is where most visitors spend their time as it offers excellent views. Consider using the stairs to reach the first and second floors to avoid elevator queues."
      },
      {
        "name": "Eiffel Tower Light Show",
        "crowdLevel": "moderate",
        "bestTimeToVisit": "Every hour after dark until 1:00 AM",
        "tips": "The light show can be viewed from many locations around Paris. Trocadéro Gardens offers excellent views with slightly fewer people than directly beneath the tower."
      },
      {
        "name": "Restaurants (58 Tour Eiffel and Jules Verne)",
        "crowdLevel": "moderate",
        "bestTimeToVisit": "Lunch service is typically less crowded than dinner",
        "tips": "Reservations are essential, especially for Jules Verne. Dining at the restaurants includes elevator access, allowing you to skip some queues."
      }
    ],
    "crowdAvoidanceTips": [
      {
        "tip": "Purchase tickets online in advance",
        "description": "Skip-the-line tickets can be purchased on the official website up to 60 days in advance, saving hours of waiting time."
      },
      {
        "tip": "Visit during the first or last hour of operation",
        "description": "Arriving at opening time (9:00 AM) or in the late evening (after 8:00 PM) will help you avoid the largest crowds."
      },
      {
        "tip": "Consider stair access for the first and second floors",
        "description": "The stairs often have shorter queues than elevators. Taking the stairs to the second floor and then using the elevator to the summit can save time."
      },
      {
        "tip": "Visit on a weekday rather than a weekend",
        "description": "Tuesday and Wednesday typically have the lowest visitor numbers, whereas weekends are extremely busy."
      },
      {
        "tip": "Book a guided tour or special experience",
        "description": "These often include priority access, allowing you to bypass the main queues."
      }
    ],
    "specialEvents": [
      {
        "name": "Bastille Day (July 14)",
        "dates": "July 14",
        "crowdImpact": "very high",
        "description": "The Eiffel Tower is central to Bastille Day celebrations with special fireworks. The area becomes extremely crowded and access is often restricted."
      },
      {
        "name": "New Year's Eve",
        "dates": "December 31",
        "crowdImpact": "very high",
        "description": "A popular celebration spot at midnight, with exceptional crowds and possible access restrictions."
      },
      {
        "name": "Paris Fashion Weeks",
        "dates": "Late February/early March and late September/early October",
        "crowdImpact": "high",
        "description": "Fashion weeks bring additional visitors to Paris, increasing crowd levels at major attractions."
      }
    ],
    "crowdLevelScale": {
      "veryLow": "Few tourists, no lines, easily accessible attractions",
      "low": "Some tourists, short wait times, easily navigable",
      "moderate": "Average number of tourists, moderate wait times at popular attractions",
      "high": "Many tourists, significant wait times, some difficulty navigating",
      "veryHigh": "Extremely crowded, long wait times, difficult to navigate and enjoy"
    }
  }
}
```

## Travel Documents

Get comprehensive information on required travel documents, visas, health requirements, and travel advisories:

```
GET /widgets/travel-documents?destination={destination}&nationality={nationality}&tripType={tripType}
```

### Parameters

| Parameter   | Type   | Required | Description                                      |
|-------------|--------|----------|--------------------------------------------------|
| destination | string | Yes      | Travel destination country or region             |
| nationality | string | No       | Traveler's nationality (default: United States)  |
| tripType    | string | No       | Purpose of travel (default: tourism)             |

### Example Request

```
GET /widgets/travel-documents?destination=Japan&nationality=United%20States&tripType=tourism
```

### Example Response

```json
{
  "success": true,
  "query": {
    "destination": "Japan",
    "nationality": "United States",
    "tripType": "tourism"
  },
  "data": {
    "essentialDocuments": [
      {
        "documentType": "Passport",
        "required": true,
        "description": "A valid passport is required for all international travel to Japan",
        "howToObtain": "Apply through the U.S. Department of State website or at a passport agency/center",
        "processingTime": "4-6 weeks for regular processing, 2-3 weeks for expedited service",
        "validityRequirements": "Must be valid for the duration of stay and have at least one blank visa page",
        "estimatedCost": "$130-$175 for adults (depending on whether it's a first-time application or renewal)",
        "notes": "It's recommended to have at least 6 months validity beyond your planned departure date from Japan, though this is not strictly required for U.S. citizens"
      },
      {
        "documentType": "Return/Onward Ticket",
        "required": true,
        "description": "Proof of planned departure from Japan",
        "howToObtain": "Book through airline, travel agency, or online booking platform",
        "processingTime": "Immediate",
        "validityRequirements": "Must show travel out of Japan within 90 days of arrival",
        "estimatedCost": "Varies based on destination and season",
        "notes": "Immigration officials may ask to see proof of onward travel arrangements"
      }
    ],
    "visaRequirements": {
      "visaRequired": false,
      "visaType": "Visa exemption/waiver",
      "entryType": "Temporary visitor", 
      "stayDuration": "Up to 90 days",
      "applicationProcess": "Not applicable - visa waiver on arrival",
      "processingTime": "Not applicable",
      "cost": "Free",
      "documents": [
        {
          "name": "Passport",
          "details": "Valid for duration of stay"
        },
        {
          "name": "Disembarkation card",
          "details": "Usually distributed on flight or available at port of entry"
        }
      ],
      "specialRequirements": [
        "Purpose of visit must be tourism, business, visiting friends/relatives, etc. Working is not permitted without proper visa",
        "May need to show sufficient funds for stay and proof of accommodation"
      ],
      "notes": "U.S. citizens can stay in Japan for up to 90 days without a visa for tourism purposes. For longer stays or other purposes such as work or study, a proper visa must be obtained in advance."
    },
    "healthRequirements": {
      "vaccinationsMandatory": [
        {
          "name": "None currently required",
          "details": "No mandatory vaccinations for U.S. citizens traveling from the United States to Japan",
          "validityPeriod": "Not applicable"
        }
      ],
      "vaccinationsRecommended": [
        {
          "name": "Routine vaccines",
          "details": "MMR, diphtheria-tetanus-pertussis, varicella, polio, and yearly flu shot"
        },
        {
          "name": "Hepatitis A",
          "details": "Recommended for most travelers"
        },
        {
          "name": "Hepatitis B",
          "details": "Recommended for travelers with potential exposure to bodily fluids or those seeking medical treatment"
        }
      ],
      "medicationRestrictions": [
        {
          "medication": "Pseudoephedrine (found in some allergy and cold medications)",
          "restriction": "Strictly prohibited",
          "alternative": "Consult healthcare provider for legal alternatives"
        },
        {
          "medication": "Prescription medications containing narcotics or stimulants",
          "restriction": "Restricted - may require prior approval",
          "alternative": "Obtain a Yakkan Shoumei (Medical Import Certificate) before travel"
        }
      ],
      "healthInsuranceRequirements": "Not legally required but strongly recommended. Japanese medical care is excellent but can be expensive without insurance",
      "notes": "For stays exceeding 90 days, National Health Insurance enrollment becomes possible"
    },
    "governmentAdvisories": {
      "advisoryLevel": "Level 1: Exercise Normal Precautions",
      "advisoryText": "Exercise normal precautions in Japan",
      "securityConcerns": [
        "Low crime rate overall, though pickpocketing may occur in crowded tourist areas",
        "Be aware of occasional political demonstrations in urban centers"
      ],
      "healthConcerns": [
        "Excellent medical facilities and health standards",
        "Seasonal influenza during winter months"
      ],
      "naturalDisasterRisks": [
        "Earthquakes occur frequently throughout Japan",
        "Typhoon season runs from June to December",
        "Volcanic activity possible in some regions"
      ],
      "localLaws": [
        {
          "category": "Drugs",
          "description": "Very strict drug laws with severe penalties including lengthy imprisonment for possession of even small amounts"
        },
        {
          "category": "Identification",
          "description": "Foreign visitors must carry their passport at all times"
        },
        {
          "category": "Photography",
          "description": "Restricted at military installations and some government buildings"
        }
      ],
      "source": "U.S. Department of State Travel Advisory"
    },
    "customsAndImport": {
      "currencyRestrictions": {
        "entryLimit": "No restriction on bringing currency in, but amounts exceeding ¥1,000,000 (approx. $9,000 USD) must be declared",
        "exitLimit": "Amounts exceeding ¥1,000,000 must be declared when leaving Japan",
        "declarationRequirement": "Use the \"Declaration of Carrying of Means of Payment, etc.\" form available at customs"
      },
      "prohibitedItems": [
        "Narcotics and illegal drugs",
        "Firearms and explosives",
        "Counterfeit goods or currency",
        "Obscene materials",
        "Certain agricultural products including fresh fruits, vegetables, and meat products"
      ],
      "restrictedItems": [
        {
          "item": "Prescription medications",
          "restriction": "Medications containing stimulants or narcotics require a Yakkan Shoumei (Medical Import Certificate)"
        },
        {
          "item": "Alcohol",
          "restriction": "Duty-free allowance of 3 bottles (760ml each) per adult"
        }
      ],
      "dutyFreeAllowances": [
        {
          "category": "Tobacco",
          "allowance": "200 cigarettes or 50 cigars or 250g of tobacco per adult"
        },
        {
          "category": "Alcohol",
          "allowance": "3 bottles (760ml each) per adult"
        },
        {
          "category": "Perfume",
          "allowance": "2 ounces (60ml) per adult"
        },
        {
          "category": "Other items",
          "allowance": "Total value not exceeding ¥200,000 (approx. $1,800 USD)"
        }
      ]
    },
    "digitalRequirements": {
      "entryRegistration": {
        "required": false,
        "system": "Not currently required for U.S. citizens",
        "howToRegister": "Not applicable",
        "deadlines": "Not applicable",
        "cost": "Not applicable"
      },
      "apps": [
        {
          "name": "Japan Official Travel App",
          "purpose": "Travel information, disaster alerts, and transportation guides",
          "mandatoryStatus": false,
          "downloadLink": "Available on iOS and Android app stores"
        },
        {
          "name": "Safety tips (disaster alert app)",
          "purpose": "Push notifications for earthquake warnings, tsunami alerts, and other emergency information",
          "mandatoryStatus": false,
          "downloadLink": "Available on iOS and Android app stores"
        }
      ]
    },
    "bookingDocuments": [
      {
        "documentType": "Flight Itinerary",
        "format": "Digital or printed copy",
        "necessity": "Required for immigration",
        "tips": "Have both digital and printed copies; ensure it shows return/onward travel within 90 days"
      },
      {
        "documentType": "Hotel Reservation",
        "format": "Digital or printed confirmation",
        "necessity": "Recommended for immigration",
        "tips": "Include contact information and full address of accommodations"
      },
      {
        "documentType": "Travel Insurance Policy",
        "format": "Digital or printed policy document",
        "necessity": "Strongly recommended",
        "tips": "Ensure it includes medical coverage and repatriation"
      }
    ],
    "specialCategories": {
      "minors": {
        "additionalDocuments": [
          {
            "documentType": "Consent letter",
            "description": "If traveling with only one parent or with adults who are not legal guardians",
            "requirements": "Should be notarized and include contact information for absent parent(s)/guardian(s)"
          },
          {
            "documentType": "Birth certificate",
            "description": "To establish relationship between minor and parents/guardians",
            "requirements": "Original or certified copy"
          }
        ],
        "specialConsiderations": "Children 15 years and younger must be accompanied by an adult when entering Japan"
      },
      "businessTravelers": {
        "additionalDocuments": [
          {
            "documentType": "Business card",
            "description": "For business introductions",
            "requirements": "Have plenty available as they are frequently exchanged"
          },
          {
            "documentType": "Letter of invitation",
            "description": "From Japanese company or business contact",
            "requirements": "Should detail purpose and duration of business activities"
          }
        ]
      },
      "dualCitizens": {
        "considerations": "Japan generally does not recognize dual nationality for adults. Japanese citizens who also hold U.S. citizenship should enter and exit Japan using their Japanese passport."
      }
    },
    "contactInformation": {
      "embassyInDestination": {
        "name": "U.S. Embassy Tokyo",
        "address": "1-10-5 Akasaka, Minato-ku, Tokyo 107-8420",
        "phone": "+81-3-3224-5000",
        "email": "TokyoACS@state.gov",
        "website": "https://jp.usembassy.gov/"
      },
      "touristPolice": {
        "available": true,
        "contactInfo": "Tokyo: Koban (police boxes) located throughout the city, especially in tourist areas. Some have English-speaking officers."
      },
      "emergencyAssistance": "Police: 110, Ambulance/Fire: 119, Japan Helpline (24/7 English assistance): 0570-000-911"
    },
    "practicalTips": [
      {
        "category": "Document Storage",
        "tip": "Keep digital copies of all travel documents in a secure cloud storage and share access with a trusted person at home"
      },
      {
        "category": "Passport Security",
        "tip": "Always carry your passport with you as required by law, but consider leaving a photocopy at your hotel"
      },
      {
        "category": "Medication Documentation",
        "tip": "Carry medications in original packaging with a copy of your prescription and a letter from your doctor explaining their medical necessity"
      },
      {
        "category": "Border Control",
        "tip": "Be prepared to have your fingerprints taken and photo captured upon arrival as part of Japan's immigration procedures"
      },
      {
        "category": "Registration",
        "tip": "If staying with friends/family instead of a hotel, you may need to register your stay at the local ward office if staying longer than 90 days"
      }
    ]
  }
}
```

## Currency Converter Widget

The Currency Converter widget provides comprehensive currency conversion information for travelers, including current exchange rates, historical trends, common denominations, practical information for using local currency, and common expenses in the destination.

**Endpoint:**
```
GET /widgets/currency-converter?from={fromCurrency}&to={toCurrency}&amount={amount}&date={date}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| from | string | Yes | Source currency code in ISO 4217 format (e.g., USD, EUR, JPY) |
| to | string | Yes | Target currency code in ISO 4217 format (e.g., USD, EUR, JPY) |
| amount | number | No | Amount to convert (default: 1) |
| date | string | No | Date for historical rates in YYYY-MM-DD format (default: current date) |

**Example Request:**
```
GET /widgets/currency-converter?from=USD&to=EUR&amount=100&date=2023-08-15
```

**Example Response:**
```json
{
  "success": true,
  "query": {
    "from": "USD",
    "to": "EUR",
    "amount": 100,
    "date": "2023-08-15"
  },
  "data": {
    "conversion": {
      "fromCurrency": {
        "code": "USD",
        "name": "United States Dollar",
        "symbol": "$",
        "flag": "🇺🇸",
        "amount": 100
      },
      "toCurrency": {
        "code": "EUR",
        "name": "Euro",
        "symbol": "€",
        "flag": "🇪🇺",
        "amount": 91.82
      },
      "rate": 0.9182,
      "date": "2023-08-15",
      "inverse": 1.0891
    },
    "denominations": {
      "bills": [
        {"value": 5, "equivalent": 5.45, "notes": "Smallest euro banknote"},
        {"value": 10, "equivalent": 10.89, "notes": "Common for small purchases"},
        {"value": 20, "equivalent": 21.78, "notes": "Most common from ATMs"},
        {"value": 50, "equivalent": 54.45, "notes": "Widely accepted but may be difficult to break in small shops"},
        {"value": 100, "equivalent": 108.91, "notes": "Less common, may be refused by small businesses"},
        {"value": 200, "equivalent": 217.82, "notes": "Rare in circulation"},
        {"value": 500, "equivalent": 544.54, "notes": "No longer issued but still legal tender"}
      ],
      "coins": [
        {"value": 0.01, "equivalent": 0.01, "notes": "1 cent coin"},
        {"value": 0.02, "equivalent": 0.02, "notes": "2 cent coin"},
        {"value": 0.05, "equivalent": 0.05, "notes": "5 cent coin"},
        {"value": 0.1, "equivalent": 0.11, "notes": "10 cent coin"},
        {"value": 0.2, "equivalent": 0.22, "notes": "20 cent coin"},
        {"value": 0.5, "equivalent": 0.54, "notes": "50 cent coin"},
        {"value": 1, "equivalent": 1.09, "notes": "1 euro coin"},
        {"value": 2, "equivalent": 2.18, "notes": "2 euro coin, highest value coin"}
      ]
    },
    "practicalInfo": {
      "tipping": "Tipping is not mandatory in most European countries using the Euro, but 5-10% is appreciated for good service in restaurants. In some countries like Germany, it's customary to round up the bill.",
      "cashVsCard": "Credit and debit cards are widely accepted throughout the Eurozone, especially Visa and Mastercard. However, some small establishments, markets, and rural areas might be cash-only.",
      "atms": {
        "availability": "ATMs are plentiful in cities and towns across the Eurozone",
        "fees": "Bank ATMs typically charge €2-5 for foreign cards. Some banks like Deutsche Bank and BNP Paribas have partnerships with international banks for reduced fees",
        "recommendations": "Use bank ATMs rather than independent ones, which often charge higher fees",
        "locations": "Generally found at bank branches, shopping centers, train stations, and airports"
      },
      "moneyChangers": {
        "availability": "Available in tourist areas, airports, and major city centers",
        "bestLocations": "Banks typically offer better rates than airport or hotel exchange counters",
        "typicalRates": "Expect 2-5% worse than the mid-market rate, with banks offering better rates than dedicated exchange offices",
        "avoidLocations": "Avoid airport and hotel exchange counters, which typically offer the worst rates"
      },
      "bankHours": "Typical banking hours are Monday to Friday, 9:00 AM to 4:00 PM, with early closing on some days. Many banks are closed on weekends.",
      "currencyFacts": [
        {"fact": "The euro is the second most traded currency in the world after the US dollar", "relevance": "Widely accepted internationally"},
        {"fact": "The euro is used by 19 of the 27 EU member states", "relevance": "You can use the same currency across multiple countries"},
        {"fact": "Euro coins have a common side and a national side that varies by country", "relevance": "You may collect different coin designs during your travels"}
      ],
      "counterfeit": {
        "risk": "medium",
        "commonDenominations": ["€20", "€50"],
        "securityFeatures": ["Hologram stripe", "Color-changing number", "Watermark", "Security thread"],
        "warningSign": ["Missing hologram", "Paper feels unusual", "Blurry printing", "No color change in numbers when tilted"]
      },
      "bestPractices": [
        "Inform your bank of your travel plans to avoid card blocks",
        "Carry a mix of cash and cards",
        "Always have some small denominations for small purchases and tips",
        "Be aware of dynamic currency conversion at POS terminals and choose to pay in local currency",
        "Consider getting a travel-focused card with no foreign transaction fees"
      ]
    },
    "commonExpenses": [
      {
        "item": "Coffee (café)",
        "localPrice": 3.50,
        "convertedPrice": 3.81,
        "category": "Food & Drink"
      },
      {
        "item": "Restaurant meal (mid-range)",
        "localPrice": 20.00,
        "convertedPrice": 21.78,
        "category": "Food & Drink"
      },
      {
        "item": "Fast food combo meal",
        "localPrice": 9.00,
        "convertedPrice": 9.80,
        "category": "Food & Drink"
      },
      {
        "item": "Local public transport (one-way)",
        "localPrice": 2.00,
        "convertedPrice": 2.18,
        "category": "Transportation"
      },
      {
        "item": "Taxi (per km)",
        "localPrice": 2.20,
        "convertedPrice": 2.40,
        "category": "Transportation"
      },
      {
        "item": "Museum entrance",
        "localPrice": 15.00,
        "convertedPrice": 16.34,
        "category": "Entertainment"
      },
      {
        "item": "Mid-range hotel (per night)",
        "localPrice": 120.00,
        "convertedPrice": 130.69,
        "category": "Accommodation"
      },
      {
        "item": "Bottled water (0.5L)",
        "localPrice": 1.50,
        "convertedPrice": 1.63,
        "category": "Food & Drink"
      }
    ],
    "additionalInfo": {
      "travelTips": [
        {"category": "Safety", "tip": "Keep small bills in an accessible pocket for quick purchases, store larger bills separately"},
        {"category": "Budgeting", "tip": "Most museums in Europe offer free admission on specific days each month"},
        {"category": "Payment", "tip": "Use contactless payment for public transport in major European cities"}
      ],
      "currencyAvailability": {
        "atmWithdrawalLimits": "Typically €200-500 per transaction depending on the bank, with daily limits around €500-2000",
        "currencyExchangeAvailability": "Widely available in all major cities and tourist areas",
        "cardAcceptance": "Visa and Mastercard are widely accepted; American Express has more limited acceptance. Contactless is common in urban areas"
      },
      "localPaymentMethods": [
        {"method": "Contactless cards", "description": "Tap-to-pay cards are widely used", "popularity": "Very high", "touristFriendliness": "Very high"},
        {"method": "Mobile payments", "description": "Apple Pay, Google Pay, etc.", "popularity": "High in urban areas", "touristFriendliness": "High if your phone is set up"},
        {"method": "Girocard (Germany)", "description": "Local debit card system", "popularity": "Very high in Germany", "touristFriendliness": "Low, tourists can't obtain one"}
      ],
      "budgetGuide": {
        "budget": {"dailyCost": 60, "description": "Hostels, public transport, budget restaurants, free/cheap attractions"},
        "midRange": {"dailyCost": 150, "description": "3-star hotels, occasional taxis, mix of restaurants, paid attractions"},
        "luxury": {"dailyCost": 350, "description": "4-5 star hotels, taxis/car rentals, fine dining, premium experiences"}
      }
    },
    "quickConversions": [
      { "from": 1, "to": 0.9182 },
      { "from": 5, "to": 4.591 },
      { "from": 10, "to": 9.182 },
      { "from": 20, "to": 18.364 },
      { "from": 50, "to": 45.91 },
      { "from": 100, "to": 91.82 },
      { "from": 500, "to": 459.1 },
      { "from": 1000, "to": 918.2 }
    ]
  }
}
```

**Note:**
- The widget provides comprehensive information useful for travelers, including exchange rates, denominations, and practical advice for using currency at the destination.
- The `denominations` section shows bills and coins with equivalent values in the traveler's home currency.
- The `practicalInfo` section includes detailed guidance on using money effectively, including ATM locations, fees, money changers, and counterfeit detection.
- Common expenses help travelers budget by showing typical costs in the destination country.
- The `additionalInfo` section provides a daily budget guide for different travel styles, information on local payment methods, and practical travel tips.
- Quick conversions provide ready reference for common amounts.

## Other Widgets

The following widgets are also available but are currently under development:

- Currency Converter (`/widgets/currency-converter`)
- Packing Calculator (`/widgets/packing-calculator`)
- Flight Time Estimator (`/widgets/flight-time-estimator`) 