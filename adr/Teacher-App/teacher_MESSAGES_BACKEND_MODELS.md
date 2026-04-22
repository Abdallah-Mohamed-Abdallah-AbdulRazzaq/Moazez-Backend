# Messages Backend Models

## 1. Contacts List Response

```json
{
  "contacts": []
}
```

## 2. Chat Contact

```json
{
  "id": "string",
  "name": "string",
  "message": "string",
  "dateLabel": "string",
  "imagePath": "string | null",
  "unreadCount": 3,
  "status": "sent | delivered | read | none",
  "isGroup": false
}
```

## 3. Conversation Response

```json
{
  "conversationId": "string",
  "peerId": "string",
  "peerName": "string",
  "peerAvatarUrl": "string | null",
  "messages": []
}
```

## 4. Chat Message

```json
{
  "id": "string",
  "text": "string",
  "type": "text | audio",
  "sender": "me | other",
  "date": "2026-04-01",
  "time": "09:35 AM",
  "isRead": true,
  "isFirstInGroup": false
}
```

## 5. Send Message Request

```json
{
  "conversationId": "string",
  "type": "text | audio",
  "text": "string",
  "audioUrl": "string | null"
}
```

## 6. Preferred Endpoints

```text
GET  /teacher/messages/contacts
GET  /teacher/messages/conversations/{conversationId}
POST /teacher/messages/conversations/{conversationId}/send
POST /teacher/messages/conversations/{conversationId}/mark-read
```

## 7. Notes

- `message` في contact هي آخر رسالة preview.
- `dateLabel` في contacts مختصر للعرض فقط.
- لو في group: يفضل وجود `isGroup` واسم الجهة أو الفصل.
