# home

## Endpoint
- `GET /parent/home`

## Response
```json
{
  "parent": {
    "name": "string",
    "xp_points": 0
  },
  "behavior_summary": {
    "attendance_rate": "string",
    "positive_points": 0,
    "negative_points": 0
  },
  "smart_pickup": {
    "title": "string",
    "subtitle": "string",
    "button_text": "string",
    "status_text": "string",
    "available": true
  },
  "homeworks_summary": {
    "pending_count": 0,
    "completed_count": 0,
    "late_count": 0
  },
  "children": [
    {
      "id": "string",
      "name": "string",
      "grade": "string",
      "image_url": "string",
      "attendance": "string",
      "behavior": "string",
      "ranking": "string"
    }
  ],
  "upcoming_tasks": [
    "string"
  ],
  "latest_reports": [
    {
      "title": "string",
      "description": "string"
    }
  ],
  "tasks_summary": {
    "active_count": 0,
    "pending_approval_count": 0,
    "completed_count": 0
  }
}
```
