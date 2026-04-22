# behavior

## Endpoints
- `GET /children/{child_id}/behavior/summary`
- `GET /children/{child_id}/behavior/records`

## Summary Response
```json
{
  "term": "string",
  "month_range": "string",
  "attendance_count": 0,
  "absence_count": 0,
  "lateness_count": 0
}
```

## Records Response
```json
[
  {
    "id": "string",
    "type": "attendance|absence|lateness|positive|negative",
    "title": "string",
    "date": "ISO8601",
    "points": 0,
    "note": "string|null"
  }
]
```

## Query
- `term`
- `month`
- `type`
