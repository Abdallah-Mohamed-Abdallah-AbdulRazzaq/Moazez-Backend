# children

## Endpoints
- `GET /parent/children`
- `GET /children/{child_id}/profile`
- `GET /children/{child_id}/achievements`

## Children List Response
```json
[
  {
    "id": "string",
    "name": "string",
    "image_url": "string",
    "grade": "string",
    "attendance_rate": "98%",
    "behavior_label": "string",
    "ranking": "string"
  }
]
```

## Child Profile Response
```json
{
  "id": "string",
  "name": "string",
  "image_url": "string",
  "grade": "string",
  "classroom": "string",
  "section": "string",
  "academic_year": "string",
  "attendance_rate": "string",
  "season_xp": 0,
  "ranking": "string",
  "behavior_label": "string",
  "current_level": "string",
  "next_level": "string",
  "level_progress": 0.74,
  "total_academic_progress": 91,
  "progress_delta": "+12%",
  "progress_formula": "string",
  "monthly_progress": [
    { "month": "string", "value": 0 }
  ],
  "performance_breakdown": [
    { "label": "string", "value": 0, "color_hex": "#000000" }
  ],
  "recent_activities": [
    {
      "type": "homework|exam",
      "title": "string",
      "subject": "string",
      "score_label": "string",
      "submitted_at": "ISO8601"
    }
  ],
  "achievements": [
    { "title": "string", "image_url": "string", "earned_date": "string" }
  ],
  "weekly_schedule": {
    "days": ["string"],
    "periods": [
      { "index": 1, "label": "string", "time_range": "string" }
    ],
    "lessons": [
      {
        "day_name": "string",
        "period_index": 1,
        "subject": "string",
        "teacher_name": "string",
        "room_name": "string",
        "color_hex": "#000000"
      }
    ]
  }
}
```

## Achievements Response
```json
{
  "current_level": 0,
  "current_xp": 0,
  "remaining_xp": 0,
  "total_xp": 0,
  "progress": 0.0,
  "earned_count": 0,
  "total_count": 0,
  "seasons": [
    {
      "name": "string",
      "badges": [
        {
          "title": "string",
          "subtitle": "string",
          "image_url": "string",
          "rank_value": 1
        }
      ]
    }
  ]
}
```
