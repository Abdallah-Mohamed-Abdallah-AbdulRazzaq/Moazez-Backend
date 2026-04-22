# progress

## Endpoint
- `GET /children/{child_id}/progress`

## Response
```json
{
  "child_id": "string",
  "overall_progress": 91,
  "progress_delta": "+12%",
  "current_level": "string",
  "next_level": "string",
  "level_progress": 0.74,
  "season_xp": 1250,
  "progress_formula": "string",
  "monthly_progress": [
    { "month": "string", "value": 0 }
  ],
  "breakdown": [
    { "label": "homeworks", "value": 0 },
    { "label": "exams", "value": 0 },
    { "label": "behavior", "value": 0 },
    { "label": "attendance", "value": 0 }
  ]
}
```
