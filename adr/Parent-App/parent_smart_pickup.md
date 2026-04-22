# smart_pickup

## Endpoints
- `GET /smart-pickup`
- `POST /smart-pickup/request`
- `GET /smart-pickup/recent-calls`

## Main Response
```json
{
  "school_zone": {
    "school_name": "string",
    "gate_name": "string",
    "address": "string",
    "center": {
      "latitude": 0.0,
      "longitude": 0.0
    },
    "allowed_radius_meters": 100
  },
  "parent_location": {
    "latitude": 0.0,
    "longitude": 0.0
  },
  "children": [
    {
      "id": "string",
      "name": "string",
      "grade": "string",
      "image_url": "string"
    }
  ],
  "recent_calls": [
    {
      "child_name": "string",
      "requested_at": "ISO8601",
      "status": "string",
      "gate": "string",
      "eta": "string"
    }
  ],
  "notice": "string",
  "support_window": "string",
  "active_queue_count": 0,
  "is_inside_school_zone": true,
  "distance_meters": 0
}
```

## Create Request
```json
{
  "child_id": "string",
  "parent_latitude": 0.0,
  "parent_longitude": 0.0
}
```
