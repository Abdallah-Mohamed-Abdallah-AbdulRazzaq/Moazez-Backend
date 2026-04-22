# messages

## Endpoints
- `GET /messages/contacts`
- `GET /messages/conversations/{conversation_id}`
- `POST /messages/conversations/{conversation_id}/send`
- `POST /messages/conversations/{conversation_id}/mark-read`

## Contacts Response
```json
[
  {
    "id": "string",
    "name": "string",
    "last_message": "string",
    "last_message_date": "ISO8601",
    "image_url": "string|null",
    "unread_count": 0,
    "status": "sent|delivered|read|none",
    "is_group": false,
    "category": "teacher|student|group|subject"
  }
]
```

## Conversation Response
```json
{
  "conversation_id": "string",
  "peer_name": "string",
  "peer_avatar_url": "string|null",
  "is_online": true,
  "messages": [
    {
      "id": "string",
      "type": "text|audio",
      "sender": "me|other",
      "text": "string",
      "audio_url": "string|null",
      "audio_duration": "string|null",
      "date": "ISO8601",
      "time_label": "string",
      "is_read": true,
      "is_first_in_group": false
    }
  ]
}
```

## Send Message Request
```json
{
  "type": "text|audio",
  "text": "string|null",
  "audio_file_url": "string|null"
}
```
