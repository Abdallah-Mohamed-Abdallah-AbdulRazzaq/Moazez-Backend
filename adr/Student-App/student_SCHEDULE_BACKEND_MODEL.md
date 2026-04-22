# Schedule Feature - Backend Data

## Main Response

```json
{
  "periods": [
    {
      "index": 1,
      "label": "string",
      "time_range": "string",
      "start_time": "08:00",
      "end_time": "08:45"
    }
  ],
  "lessons": [
    {
      "day_name": "string",
      "period_index": 1,
      "subject": "string",
      "teacher_name": "string",
      "room_name": "string"
    }
  ]
}
```

## Needed Fields

- `periods`
- `lessons`

## Notes

- اليوم الحالي والحصة الحالية يتم حسابهما في الفرونت من الوقت
- اللون يمكن ربطه بالمادة في الفرونت
