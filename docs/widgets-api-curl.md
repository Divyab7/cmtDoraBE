# Widgets API Curl Commands

This document provides curl commands for testing the widgets API endpoints.

## Root Endpoint

Get API information including welcome message and version:

```bash
curl -X GET "http://localhost:3000" -H "Accept: application/json"
```

Example response:
```json
{
  "message": "Hello Traveler!",
  "version": "1.0.0"
}
```

## Travel Budget Estimator

```bash
curl -X GET "http://localhost:3000/widgets/travel-budget?destination=Tokyo%2C%20Japan&origin=New%20York%2C%20USA&passengers=2&duration=10&travelStyle=Mid-range" -H "Accept: application/json"
```

For a more detailed request:

```bash
curl -X GET "http://localhost:3000/widgets/travel-budget?destination=Paris%2C%20France&origin=London%2C%20UK&passengers=4&duration=5&travelStyle=Luxury&accommodation=5-star%20hotels&transportation=Private%20transfers&activities=Fine%20dining%20and%20museum%20tours" -H "Accept: application/json"
```

## Emergency Contacts

```bash
curl -X GET "http://localhost:3000/widgets/emergency-contacts?address=Tokyo%2C%20Japan" -H "Accept: application/json"
```

## Travel Phrases

Basic request:

```bash
curl -X GET "http://localhost:3000/widgets/travel-phrases?location=Barcelona%2C%20Spain" -H "Accept: application/json"
```

With a different source language:

```bash
curl -X GET "http://localhost:3000/widgets/travel-phrases?location=Rome%2C%20Italy&sourceLanguage=French" -H "Accept: application/json"
```

## Packing Calculator

Basic request:

```bash
curl -X GET "http://localhost:3000/widgets/packing-calculator?destination=Paris%2C%20France" -H "Accept: application/json"
```

Detailed request:

```bash
curl -X GET "http://localhost:3000/widgets/packing-calculator?destination=Bali%2C%20Indonesia&duration=10&gender=female&age=30&activities=beach%2C%20hiking%2C%20snorkeling&season=summer&style=efficient&tripType=adventure" -H "Accept: application/json"
```

Business trip:

```bash
curl -X GET "http://localhost:3000/widgets/packing-calculator?destination=Tokyo%2C%20Japan&duration=5&gender=male&activities=business%20meetings&tripType=business" -H "Accept: application/json"
```

## Crowd Estimator

Basic request for current season:

```bash
curl -X GET "http://localhost:3000/widgets/crowd-estimator?location=Eiffel%20Tower" -H "Accept: application/json"
```

With specific season:

```bash
curl -X GET "http://localhost:3000/widgets/crowd-estimator?location=Grand%20Canyon&season=summer" -H "Accept: application/json"
```

With specific date (DD-MM-YYYY format):

```bash
curl -X GET "http://localhost:3000/widgets/crowd-estimator?location=Venice%2C%20Italy&date=14-02-2024" -H "Accept: application/json"
```

## Travel Documents

Basic request:

```bash
curl -X GET "http://localhost:3000/widgets/travel-documents?destination=Japan" -H "Accept: application/json"
```

With nationality specified:

```bash
curl -X GET "http://localhost:3000/widgets/travel-documents?destination=Thailand&nationality=United%20Kingdom" -H "Accept: application/json"
```

Business trip:

```bash
curl -X GET "http://localhost:3000/widgets/travel-documents?destination=China&nationality=Canada&tripType=business" -H "Accept: application/json"
```

## Get All Widgets

```bash
curl -X GET "http://localhost:3000/widgets" -H "Accept: application/json"
```

## Production Environment

Replace `http://localhost:3000` with your production API URL, for example:

```bash
curl -X GET "https://api.clonemytrips.com/widgets/travel-phrases?location=Barcelona%2C%20Spain" -H "Accept: application/json"
```

## Currency Converter

### Basic conversion from USD to EUR
```bash
curl -X GET "http://localhost:3000/widgets/currency-converter?from=USD&to=EUR" -H "Accept: application/json"
```

### Convert a specific amount from JPY to USD
```bash
curl -X GET "http://localhost:3000/widgets/currency-converter?from=JPY&to=USD&amount=10000" -H "Accept: application/json"
```

### Historical conversion from GBP to AUD for a specific date
```bash
curl -X GET "http://localhost:3000/widgets/currency-converter?from=GBP&to=AUD&amount=500&date=2023-06-15" -H "Accept: application/json" 
```

## Country List for Holiday Calculator

Get a list of all available countries for the Holiday Calculator widget:

```bash
curl -X GET "http://localhost:3000/widgets/countries" -H "Accept: application/json"
```

Example response:
```json
{
  "success": true,
  "count": 195,
  "countries": [
    "Afghanistan",
    "Albania",
    "Algeria",
    "Andorra",
    "Angola",
    // ... more countries
    "Yemen",
    "Zambia",
    "Zimbabwe"
  ]
}
```

This endpoint returns a sorted list of country names that can be used with the Holiday Calculator widget. The response includes the total count of countries and the full alphabetical list.

## Holiday Calculator

Get holidays for a specific country:

```bash
curl -X GET "http://localhost:3000/widgets/holidays?country=United%20States" -H "Accept: application/json"
```

Get holidays for a specific country and year:

```bash
curl -X GET "http://localhost:3000/widgets/holidays?country=Japan&year=2025" -H "Accept: application/json"
```

Get holidays for a specific country, year, and month:

```bash
curl -X GET "http://localhost:3000/widgets/holidays?country=France&year=2025&month=12" -H "Accept: application/json"
```

Example response:
```json
{
  "success": true,
  "query": {
    "country": "United States",
    "year": "2025",
    "month": null
  },
  "data": {
    "countryInfo": {
      "name": "United States"
    },
    "holidays": [
      {
        "date": "2025-01-01",
        "name": "New Year's Day",
        "day": "Wednesday",
        "type": "Public Holiday"
      },
      {
        "date": "2025-01-20",
        "name": "Martin Luther King Jr. Day",
        "day": "Monday",
        "type": "Public Holiday"
      },
      // More holidays...
    ],
    "summary": {
      "totalHolidays": 11,
      "holidaysByMonth": {
        "01": 2,
        "02": 1,
        "05": 1,
        "06": 1,
        "07": 1,
        "09": 1,
        "10": 1,
        "11": 2,
        "12": 1
      }
    },
    "holidaysByMonth": {
      "01": [
        {
          "date": "2025-01-01",
          "name": "New Year's Day",
          "day": "Wednesday",
          "type": "Public Holiday"
        },
        {
          "date": "2025-01-20",
          "name": "Martin Luther King Jr. Day",
          "day": "Monday",
          "type": "Public Holiday"
        }
      ],
      // More months...
    }
  }
}
```

## Holiday Calculator (Long Weekend Finder)

Calculate optimal long weekends and holiday combinations for a country:

```bash
curl -X GET "http://localhost:3000/widgets/holiday-calculator?country=United%20States&year=2025&maxLeaveDays=2" -H "Accept: application/json"
```

With just required parameters:

```bash
curl -X GET "http://localhost:3000/widgets/holiday-calculator?country=Japan" -H "Accept: application/json"
```

Find more extended combinations with more leave days:

```bash
curl -X GET "http://localhost:3000/widgets/holiday-calculator?country=France&year=2025&maxLeaveDays=4" -H "Accept: application/json"
```

Example response:
```json
{
  "success": true,
  "query": {
    "country": "United States",
    "year": 2025,
    "maxLeaveDays": 2
  },
  "data": {
    "countryInfo": {
      "name": "United States",
      "year": 2025,
      "totalHolidays": 11
    },
    "holidays": [
      {
        "date": "2025-01-01",
        "events": ["New Year's Day"],
        "dayOfWeek": "Wednesday"
      },
      {
        "date": "2025-01-20",
        "events": ["Martin Luther King Jr. Day"],
        "dayOfWeek": "Monday"
      },
      // More holidays...
    ],
    "longWeekendsByMonth": [
      {
        "month": "January",
        "combinations": [
          {
            "name": "Long Weekend: Saturday to Monday (3 days)",
            "dates": ["2025-01-18", "2025-01-19", "2025-01-20"],
            "daysOff": [
              {"date": "2025-01-18", "reason": "Weekend"},
              {"date": "2025-01-19", "reason": "Weekend"},
              {"date": "2025-01-20", "reason": "Martin Luther King Jr. Day"}
            ],
            "leaveDaysNeeded": 0,
            "totalDays": 3
          },
          {
            "name": "Extended Weekend: Saturday to Tuesday (4 days)",
            "dates": ["2025-01-18", "2025-01-19", "2025-01-20", "2025-01-21"],
            "daysOff": [
              {"date": "2025-01-18", "reason": "Weekend"},
              {"date": "2025-01-19", "reason": "Weekend"},
              {"date": "2025-01-20", "reason": "Martin Luther King Jr. Day"},
              {"date": "2025-01-21", "reason": "Leave Day"}
            ],
            "leaveDaysNeeded": 1,
            "totalDays": 4
          }
          // More combinations...
        ]
      },
      // More months...
    ],
    "totalCombinations": 25,
    "stats": {
      "noLeaveRequired": 7,
      "withLeave": {
        "1_day": 11,
        "2_days": 7,
        "3_days": 0,
        "4_days": 0,
        "5_days": 0
      }
    }
  }
}
```

## Excuse Generator (Work Leave)

Generate believable excuses specifically for requesting time off work:

### Basic request for a same-day short leave:

```bash
curl -X GET "http://localhost:3000/widgets/excuse-generator" -H "Accept: application/json"
```

### Request for planned family leave:

```bash
curl -X GET "http://localhost:3000/widgets/excuse-generator?leaveDuration=medium&noticeTime=planned&leaveType=family" -H "Accept: application/json"
```

### Emergency health-related leave:

```bash
curl -X GET "http://localhost:3000/widgets/excuse-generator?leaveDuration=short&noticeTime=same-day&leaveType=health&tone=apologetic" -H "Accept: application/json"
```

### Extended leave with detailed parameters:

```bash
curl -X GET "http://localhost:3000/widgets/excuse-generator?leaveDuration=long&noticeTime=short-notice&leaveType=personal&deliveryMethod=email&relationship=manager&believability=high&tone=professional" -H "Accept: application/json"
```

Example response:
```json
{
  "success": true,
  "query": {
    "leaveDuration": "medium",
    "noticeTime": "short-notice",
    "leaveType": "family",
    "deliveryMethod": "email",
    "relationship": "manager",
    "believability": "high",
    "tone": "professional"
  },
  "data": {
    "excuseSummary": {
      "title": "Urgent Family Matter Requiring My Attention",
      "believabilityScore": 85,
      "reuseRisk": "medium",
      "suitableFor": ["remote work", "office environment", "flexible schedule jobs"],
      "suggestedLeaveType": "Family Responsibility Leave"
    },
    "excuseContent": {
      "shortVersion": "I need to request leave for the next 3 days (Wed-Fri) due to an unexpected family situation that requires my immediate attention. I'll complete all pending tasks before leaving and be available via email for urgent matters.",
      "fullContent": {
        "greeting": "Dear [Manager's Name],",
        "introduction": "I'm writing to request leave for the next three days (Wednesday through Friday) due to an urgent family matter that has arisen unexpectedly.",
        "mainExcuse": "I just received news that my elderly parent has had a fall at home and requires assistance with medical appointments and temporary care arrangements. As the family member living closest to them, I need to attend to this situation personally.",
        "supportingDetails": [
          "They need to attend several medical appointments over the next few days",
          "I need to arrange for temporary home care services",
          "Their home requires some immediate safety modifications before they can return safely",
          "Other family members will be able to take over after the weekend"
        ],
        "impactOnWork": "I understand this is short notice and want to assure you that I've developed a plan to minimize any disruption to our workflow.",
        "proposedArrangements": "I will complete all pending tasks before I leave today, and I've already spoken with [Colleague] who has agreed to cover any urgent matters in my absence. I've prepared a status update for all my projects, which I'll share with the team before I leave. I will also be checking my emails in the evenings and can be available for any urgent calls if absolutely necessary.",
        "returnPlan": "I plan to return to the office on Monday, by which time alternative care arrangements should be in place. I'll provide a comprehensive update on all my responsibilities upon my return.",
        "closing": "I appreciate your understanding in this matter. Please let me know if you need any additional information or if there are specific tasks you would like me to prioritize before I leave.",
        "signature": "Best regards,\n[Your Name]"
      },
      "callScript": {
        "openingLine": "Hi [Manager's Name], I'm calling because I need to request leave for the next three days due to an urgent family situation that's just come up.",
        "keyPoints": [
          "My elderly parent has had a fall and needs immediate assistance",
          "I need to take them to medical appointments and organize care",
          "I've already prepared handover notes for my current projects",
          "I'll be checking emails each evening and available for urgent matters",
          "I plan to return on Monday"
        ],
        "anticipatedQuestions": [
          {
            "question": "Can someone else in your family handle this?",
            "response": "I'm the closest family member geographically, and other relatives can only arrive by the weekend. I need to manage the immediate situation until then."
          },
          {
            "question": "What about the client presentation scheduled for Thursday?",
            "response": "I've already updated all the materials and briefed [Colleague] who can present in my place. I'll make sure to review everything with them before I leave today."
          },
          {
            "question": "How can we reach you if something urgent comes up?",
            "response": "I'll be checking my emails regularly each evening, and you can reach me on my cell phone for anything truly urgent. I'll try to be as responsive as possible considering the circumstances."
          }
        ]
      }
    },
    "requiredDocumentation": {
      "needed": true,
      "types": ["Doctor's letter regarding parent's condition", "Hospital/clinic appointment confirmations"],
      "tips": "Most companies don't require documentation for short family emergency leave, but having some form of medical appointment verification can be helpful if requested. Focus on documentation that doesn't violate your family member's privacy."
    },
    "alternatives": [
      {
        "title": "Family Health Emergency",
        "shortVersion": "I need to request leave for the next three days as a close family member has been hospitalized unexpectedly and requires my support with medical decisions and initial care arrangements.",
        "bestFor": "When the situation involves a more serious health scenario"
      },
      {
        "title": "Family Emergency Requiring Travel",
        "shortVersion": "I need to request leave for the next three days as I must travel immediately to assist a close family member who is facing an emergency situation. I'll have limited connectivity while traveling but will check messages daily.",
        "bestFor": "When geographical distance is involved"
      }
    ],
    "doAndDontTips": {
      "do": [
        "Provide a clear timeframe for your absence",
        "Offer a concrete plan for handling your responsibilities",
        "Express willingness to be available for truly urgent matters",
        "Follow up with a written email if requesting leave verbally",
        "Thank your manager for their understanding"
      ],
      "dont": [
        "Provide unnecessary or excessive personal details about the family situation",
        "Make promises about availability that you may not be able to keep",
        "Leave important tasks unaddressed without a coverage plan",
        "Forget to update your email auto-responder and calendar",
        "Change your return date without communication"
      ]
    }
  }
} 