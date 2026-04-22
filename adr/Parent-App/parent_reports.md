# reports

## Endpoint
- `GET /children/{child_id}/reports/performance`

## Response
```json
{
  "child": {
    "id": "string",
    "name": "string",
    "grade": "string",
    "level": 12,
    "stars": 85
  },
  "term_label": "string",
  "subjects": [
    {
      "subject": "string",
      "score": 90,
      "note": "string"
    }
  ],
  "behavior": {
    "score": 94,
    "max_score": 100,
    "highlights": [
      {
        "text": "string",
        "type": "positive|warning|negative"
      }
    ]
  },
  "attendance": {
    "month_label": "string",
    "present_count": 20,
    "absence_count": 1,
    "late_count": 2,
    "discipline_percentage": 96
  }
}
```
