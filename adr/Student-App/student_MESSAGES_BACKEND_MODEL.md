# Messages Feature - Backend Data

## Conversations List

```json
{
  "filters": [
    "all",
    "teachers",
    "students",
    "groups",
    "subjects"
  ],
  "conversations": [
    {
      "id": "string",
      "name": "string",
      "last_message": "string",
      "last_message_type": "text|audio",
      "date_label": "string",
      "avatar_url": "string|null",
      "unread_count": 0,
      "status": "sent|delivered|read|none",
      "is_group": false,
      "category": "teacher|student|group|subject"
    }
  ]
}
```

## Chat Details

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
      "date": "string",
      "time": "string",
      "is_read": false,
      "is_first_in_group": false
    }
  ]
}
```

## Notes

- `category` تستخدم مع الفلاتر
- لو الرسالة audio يمكن استخدام `audio_url` و`audio_duration`
