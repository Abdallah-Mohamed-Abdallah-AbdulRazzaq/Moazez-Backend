# Subject Details Feature - Backend Data

## Main Response

```json
{
  "subject": {
    "id": "string",
    "name": "string",
    "lessons_count": 0,
    "total_hours": 0,
    "progress": 0.0
  },
  "lessons": [
    {
      "id": "string",
      "title": "string",
      "duration_minutes": 0,
      "type_label": "video",
      "watch_xp": 0
    }
  ],
  "assignments": [
    {
      "id": "string",
      "title": "string",
      "status": "pending|completed",
      "due_label": "string",
      "xp": 0
    }
  ],
  "attachments": [
    {
      "id": "string",
      "title": "string",
      "type": "pdf|doc|image|video|audio|link",
      "size_label": "string",
      "file_url": "string"
    }
  ]
}
```

## Notes

- subject header يحتاج `lessons_count`, `total_hours`, `progress`
- `watch_xp` للدروس و`xp` للواجبات ظاهرين في التصميم الحالي
