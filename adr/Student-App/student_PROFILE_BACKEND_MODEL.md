# Profile Feature - Backend Data

## Main Profile Response

```json
{
  "student_profile": {
    "name": "string",
    "grade": "string",
    "school_name": "string",
    "student_code": "string",
    "level": 0,
    "current_xp": 0,
    "total_xp": 0,
    "next_level_xp": 0,
    "rank_title": "string",
    "rank_image_url": "string"
  },
  "recent_badges": [
    {
      "title": "string",
      "subtitle": "string",
      "image_url": "string",
      "season": "string",
      "rank_value": 0
    }
  ],
  "top_students": [
    {
      "rank": 0,
      "name": "string",
      "xp": 0,
      "note": "string",
      "is_current_student": false,
      "is_top_three": true
    }
  ],
  "leaderboard": []
}
```

## Achievements Response

```json
{
  "seasons": [
    "string"
  ],
  "selected_season": "string",
  "all_badges": [
    {
      "title": "string",
      "subtitle": "string",
      "image_url": "string",
      "season": "string",
      "rank_value": 0,
      "is_earned": false
    }
  ]
}
```

## Notes

- profile و achievements يمكن أن يكونا endpoint واحد أو اثنين
- `rank_value` يستخدم في ترتيب الشارات داخل الموسم
