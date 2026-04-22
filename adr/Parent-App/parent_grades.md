# grades

## Endpoints
- `GET /children/{child_id}/grades/summary`
- `GET /children/{child_id}/grades/subjects`

## Summary Response
```json
{
  "academic_years": [
    { "id": "string", "label": "string" }
  ],
  "selected_year_id": "string",
  "terms": [
    { "id": "term_1", "label": "string" }
  ],
  "selected_term_id": "term_1",
  "total_earned": 0,
  "total_max": 0,
  "percentage": 0.0,
  "rating": "excellent|very_good|good|acceptable|needs_improvement",
  "motivational_message": "string"
}
```

## Subjects Response
```json
[
  {
    "id": "string",
    "subject_name": "string",
    "icon": "string",
    "color_hex": "#000000",
    "total_marks": 100,
    "earned_marks": 95,
    "percentage": 95,
    "rating": "excellent",
    "breakdown": [
      { "title": "string", "earned": 9, "total": 10 }
    ]
  }
]
```
