# Home Feature - Backend Data

## Main Response

```json
{
  "student_summary": {
    "name": "string",
    "avatar_url": "string|null",
    "level": 0,
    "current_xp": 0,
    "next_level_xp": 0,
    "notifications_count": 0
  },
  "hero_journey_preview": {
    "title": "string",
    "image_url": "string|null"
  },
  "required_today": [
    {
      "id": "string",
      "type": "homework|lesson|meeting",
      "title": "string",
      "subtitle": "string",
      "time_label": "string",
      "xp": 0
    }
  ],
  "today_tasks": []
}
```

## today_tasks

- نفس موديل `tasks` list item

## Notes

- الهوم يحتاج summary فقط وليس تفاصيل كاملة
- لو `required_today` فارغة يظهر empty state
