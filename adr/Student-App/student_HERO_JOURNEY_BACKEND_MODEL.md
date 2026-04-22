# Hero Journey Feature - Backend Data

## Journey Screen

```json
{
  "stats": {
    "hero_name": "string",
    "hero_rank_title": "string",
    "level": 0,
    "current_xp": 0,
    "required_xp": 0,
    "badges_collected": 0,
    "streak_days": 0
  },
  "levels": [
    {
      "id": "string",
      "title": "string",
      "status": "locked|active|completed",
      "position_x": 0.0,
      "position_y": 0.0
    }
  ]
}
```

## Level Details

```json
{
  "id": "string",
  "title": "string",
  "status": "locked|active|completed",
  "required_level": 0,
  "cover_image_url": "string|null",
  "mission_brief": "string",
  "objectives": [
    {
      "id": "string",
      "title": "string",
      "subtitle": "string",
      "type": "lesson|quiz",
      "is_completed": false
    }
  ],
  "rewards": {
    "xp": 0,
    "next_rank_title": "string"
  }
}
```

## Notes

- `position_x` و`position_y` قيم من `0.0` إلى `1.0`
- map image نفسها يمكن أن تظل static في الفرونت
