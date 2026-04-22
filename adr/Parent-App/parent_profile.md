# profile

## Endpoints
- `GET /parent/profile`
- `PATCH /parent/profile/preferences`
- `GET /parent/profile/account-actions`

## Profile Response
```json
{
  "parent_name": "string",
  "role_label": "string",
  "parent_code": "string",
  "school_name": "string",
  "academic_year": "string",
  "phone": "string",
  "email": "string",
  "city": "string",
  "total_xp": 0,
  "unread_messages_count": 0,
  "active_notifications_count": 0,
  "pickup_delegates_count": 0,
  "last_sync_label": "string",
  "children": [
    {
      "id": "string",
      "name": "string",
      "image_url": "string",
      "grade": "string",
      "classroom": "string",
      "attendance_rate": "string",
      "season_xp": 0,
      "ranking": "string"
    }
  ],
  "preferences": [
    {
      "id": "string",
      "title": "string",
      "subtitle": "string",
      "icon": "string",
      "enabled": true
    }
  ],
  "account_actions": [
    {
      "id": "string",
      "title": "string",
      "subtitle": "string",
      "icon": "string",
      "route_name": "string"
    }
  ],
  "support_actions": [
    {
      "id": "string",
      "title": "string",
      "subtitle": "string",
      "icon": "string",
      "route_name": "string|null"
    }
  ]
}
```

## Update Preferences Request
```json
{
  "preferences": [
    { "id": "string", "enabled": true }
  ]
}
```
