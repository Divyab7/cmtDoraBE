# Push Notification API Documentation

This document outlines the API endpoints for sending push notifications to users via Expo's push notification service.

## Prerequisites

- Users must have the Expo push token saved in their device record
- All endpoints require admin authentication

## API Endpoints

### Get Notification Statistics

```
GET /partners/notifications/stats
```

Returns statistics about devices and users with push notification capabilities.

**Response Example:**

```json
{
  "devices": {
    "total": 150,
    "withPushTokens": 120,
    "activeInLast30Days": 95,
    "byPlatform": {
      "ios": 80,
      "android": 35,
      "web": 5
    }
  },
  "users": {
    "withPushTokens": 100
  }
}
```

### Send Notification to All Users

```
POST /partners/notifications/send-all
```

Sends a push notification to all users with valid Expo push tokens.

**Request Body:**

```json
{
  "title": "Important Announcement",
  "body": "We have exciting news to share with you!",
  "data": {
    "type": "announcement",
    "id": "12345"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| title | String | The notification title (required) |
| body | String | The notification message (required) |
| data | Object | Optional data to include with the notification |

**Response Example:**

```json
{
  "message": "Notifications sent",
  "stats": {
    "total": 120,
    "successful": 115,
    "failed": 5
  },
  "details": {
    "successful": 115,
    "failed": [
      {
        "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
        "error": "DeviceNotRegistered",
        "message": { ... }
      }
    ],
    "receiptErrors": []
  }
}
```

### Send Notification to Filtered Users

```
POST /partners/notifications/send-filtered
```

Sends a push notification to users matching specific filters.

**Request Body:**

```json
{
  "title": "iOS Users Special",
  "body": "Check out this iOS-exclusive feature!",
  "data": {
    "type": "feature",
    "id": "ios-123"
  },
  "filters": {
    "platform": "ios",
    "hasBucket": true,
    "lastActiveDays": 7
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| title | String | The notification title (required) |
| body | String | The notification message (required) |
| data | Object | Optional data to include with the notification |
| filters | Object | Filters to apply when selecting users |
| filters.platform | String | Filter by device platform ('ios', 'android', 'web') |
| filters.hasBucket | Boolean | Filter users with bucket items (true) or without (false) |
| filters.lastActiveDays | Number | Filter users active within the last X days |

**Response Example:**

```json
{
  "message": "Filtered notifications sent",
  "stats": {
    "total": 50,
    "successful": 48,
    "failed": 2
  },
  "details": { ... }
}
```

### Send Notification to a Specific User

```
POST /partners/notifications/send-to-user
```

Sends a push notification to a specific user identified by userId or email.

**Request Body:**

```json
{
  "title": "Personal Notification",
  "body": "This message is just for you!",
  "data": {
    "type": "personal",
    "id": "personal-123"
  },
  "userId": "60d21b4667d0d8992e610c85"
  // OR
  "email": "user@example.com"
}
```

| Field | Type | Description |
|-------|------|-------------|
| title | String | The notification title (required) |
| body | String | The notification message (required) |
| data | Object | Optional data to include with the notification |
| userId | String | The MongoDB ID of the user (required if email not provided) |
| email | String | The email of the user (required if userId not provided) |

**Response Example:**

```json
{
  "message": "Notification sent to user",
  "user": {
    "id": "60d21b4667d0d8992e610c85",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "stats": {
    "total": 2,
    "successful": 2,
    "failed": 0
  },
  "details": { ... }
}
```

## Error Responses

All endpoints may return the following error responses:

- `400 Bad Request`: Missing required fields or invalid parameters
- `404 Not Found`: No devices found matching the criteria
- `500 Internal Server Error`: Server-side error

## Notes for Frontend Integration

When integrating with the admin panel frontend:

1. Use the stats endpoint to display notification capabilities
2. Create a form for composing notifications with title and body fields
3. Add filter options for targeted notifications
4. Provide user search functionality for sending to specific users
5. Display success/failure statistics after sending 