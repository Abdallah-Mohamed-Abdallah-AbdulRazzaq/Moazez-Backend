# Notifications Feature Backend Requirements

## Scope
تعرض التنبيهات التشغيلية لمشرف النداء: النداءات العاجلة، تأخير التسليم، التسليمات، تغييرات البوابات، وتنبيهات النظام.

## Enums
```json
{
  "AppNotificationType": ["urgentCall", "delayedPickup", "delivered", "gate", "system"],
  "AppNotificationPriority": ["normal", "high", "critical"]
}
```

## Model
```json
{
  "id": "NTF-501",
  "title": "طلب نداء عاجل",
  "body": "ولي أمر سلمان أحمد ينتظر في المسار السريع منذ 16 دقيقة.",
  "time": "الآن",
  "createdAt": "2026-06-12T10:58:00+03:00",
  "type": "urgentCall",
  "priority": "critical",
  "isRead": false,
  "relatedStudent": "سلمان أحمد",
  "relatedRequestId": "REQ-1042",
  "gate": "البوابة الرئيسية",
  "actionLabel": "فتح الطلب",
  "actionRoute": "/pickup/requests/REQ-1042"
}
```

## Required Endpoints

### GET `/api/v1/notifications`
Query params:
- `type`: optional enum
- `unreadOnly`: optional boolean
- `priority`: optional enum
- `page`
- `limit`

Response:
```json
{
  "data": [
    {
      "id": "NTF-501",
      "title": "طلب نداء عاجل",
      "body": "ولي أمر سلمان أحمد ينتظر في المسار السريع منذ 16 دقيقة.",
      "time": "الآن",
      "createdAt": "2026-06-12T10:58:00+03:00",
      "type": "urgentCall",
      "priority": "critical",
      "isRead": false,
      "relatedStudent": "سلمان أحمد",
      "relatedRequestId": "REQ-1042",
      "gate": "البوابة الرئيسية",
      "actionLabel": "فتح الطلب",
      "actionRoute": "/pickup/requests/REQ-1042"
    }
  ],
  "summary": {
    "totalCount": 5,
    "unreadCount": 3,
    "criticalCount": 1
  }
}
```

### PATCH `/api/v1/notifications/{id}/read`
Marks one notification as read.

Response:
```json
{
  "data": {
    "id": "NTF-501",
    "isRead": true,
    "readAt": "2026-06-12T11:00:00+03:00"
  }
}
```

### PATCH `/api/v1/notifications/read-all`
Marks all notifications for current user as read.

### DELETE `/api/v1/notifications/{id}`
Optional. Removes notification from user inbox.

## Realtime
يفضل دعم WebSocket/Firebase topic للمشرف:
- `pickup.request.created`
- `pickup.request.delayed`
- `pickup.request.delivered`
- `gate.status.changed`
- `system.permission.updated`

Realtime payload should use the same notification model.

## Backend Notes
- `time` للعرض فقط، لكن `createdAt` مطلوب للترتيب.
- `actionRoute` أو `actionType/actionId` مطلوب لفتح الشاشة المناسبة.
- التنبيهات يجب أن تكون scoped حسب المدرسة والبوابة وصلاحيات المستخدم.
