# applicant_portal

## Endpoints
- `GET /applicant-portal/home`
- `GET /applicant-portal/requests`
- `GET /applicant-portal/profile`
- `POST /applicant-portal/logout`

## Home Response
```json
{
  "applicant": {
    "id": "string",
    "full_name": "string",
    "phone_number": "string",
    "email": "string",
    "city": "string",
    "relationship": "string"
  },
  "notifications_count": 0,
  "latest_request": {
    "id": "string",
    "school_id": "string",
    "school_name": "string",
    "school_address": "string",
    "child_full_name": "string",
    "grade_label": "string",
    "submitted_at": "ISO8601",
    "status": "draft|submitted|under_review|accepted|needs_action|rejected",
    "status_label": "string",
    "status_description": "string",
    "progress_value": 0.55,
    "missing_items_count": 0
  },
  "stats": {
    "total_requests": 0,
    "under_review_requests": 0
  }
}
```

## Requests Response
```json
[
  {
    "id": "string",
    "school_id": "string",
    "school_name": "string",
    "school_address": "string",
    "child_full_name": "string",
    "grade_label": "string",
    "submitted_at": "ISO8601",
    "status": "draft|submitted|under_review|accepted|needs_action|rejected",
    "status_label": "string",
    "status_description": "string",
    "progress_value": 0.55,
    "missing_items_count": 0
  }
]
```

## Profile Response
```json
{
  "full_name": "string",
  "phone_number": "string",
  "email": "string",
  "city": "string",
  "relationship": "string",
  "has_accepted_request": false
}
```
