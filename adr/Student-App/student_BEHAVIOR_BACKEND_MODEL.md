# Behavior Feature - Backend Data

## Main Response

```json
{
  "summary": {
    "attendance_count": 0,
    "absence_count": 0,
    "lateness_count": 0,
    "date_text": "string"
  },
  "records": [
    {
      "id": "string",
      "type": "attendance|absence|lateness|positive|negative",
      "title": "string",
      "date": "string",
      "points": 0,
      "note": "string|null"
    }
  ]
}
```

## Needed Fields

- `summary.attendance_count`
- `summary.absence_count`
- `summary.lateness_count`
- `summary.date_text`
- `records`

## Record Item

- `id`
- `type`
- `title`
- `date`
- `points`
- `note`

## Notes

- الفلاتر الحالية تعتمد على `type`
- `points` قد يكون موجب أو سالب
