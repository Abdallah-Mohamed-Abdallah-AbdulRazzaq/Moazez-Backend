# schedule

## Endpoints
- `GET /children/{child_id}/schedule/today`
- `GET /children/{child_id}/schedule/weekly`

## Today Schedule Response
```json
{
  "child_id": "string",
  "day_name": "string",
  "items": [
    {
      "subject": "string",
      "time": "08:00 - 08:45",
      "teacher": "string",
      "note": "string",
      "icon": "string"
    }
  ],
  "parent_note": "string"
}
```

## Weekly Schedule Response
```json
{
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
```
