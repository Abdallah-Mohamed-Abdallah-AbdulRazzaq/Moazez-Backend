# Calls Feature Backend Requirements

## Scope
هذه الفيوتشر تغطي لوحة النداءات الحية وسجل النداءات. المستخدم المستهدف هو مشرف البوابة/الأمن الذي يستقبل طلبات خروج الطلاب من أولياء الأمور ويتابع الاستدعاء حتى التسليم.

## Enums
```json
{
  "PickupStatus": ["newRequest", "preparing", "ready", "delivered", "delayed"],
  "PickupPriority": ["normal", "urgent"]
}
```

## Models

### PickupRequest
```json
{
  "id": "REQ-1042",
  "studentName": "سلمان أحمد",
  "guardianName": "أحمد محمد",
  "guardianRelation": "الأب",
  "grade": "الصف الرابع",
  "section": "أ",
  "stage": "ابتدائي",
  "campus": "مبنى البنين",
  "gate": "البوابة الرئيسية",
  "requestedAt": "10:42 ص",
  "requestedAtIso": "2026-06-12T10:42:00+03:00",
  "status": "newRequest",
  "priority": "urgent",
  "waitingMinutes": 2,
  "guardianPhone": "050 123 4499",
  "pickupCode": "4821",
  "note": "ولي الأمر ينتظر في المسار السريع.",
  "assignedTo": "مشرف الدور الأول"
}
```

### CallsHistoryRecord
```json
{
  "date": "2026-06-12",
  "durationLabel": "تم خلال 7 د",
  "durationMinutes": 7,
  "request": {
    "id": "REQ-1038",
    "studentName": "فهد ناصر",
    "guardianName": "ناصر صالح",
    "guardianRelation": "الأب",
    "grade": "الصف الأول متوسط",
    "section": "د",
    "stage": "متوسط",
    "campus": "المبنى المتوسط",
    "gate": "بوابة رقم 2",
    "requestedAt": "10:18 ص",
    "requestedAtIso": "2026-06-12T10:18:00+03:00",
    "status": "delivered",
    "priority": "normal",
    "waitingMinutes": 7,
    "guardianPhone": "054 300 1010",
    "pickupCode": "7712",
    "note": "تم التسليم بعد مطابقة الكود.",
    "assignedTo": "أمن البوابة 2"
  }
}
```

## Required Endpoints

### GET `/api/v1/pickup/requests/active`
Returns active pickup requests for the calls dashboard.

Query params:
- `stage`: optional, e.g. `ابتدائي`
- `status`: optional enum
- `q`: optional search by student, guardian, pickup code, class
- `gate`: optional

Response:
```json
{
  "data": [
    {
      "id": "REQ-1042",
      "studentName": "سلمان أحمد",
      "guardianName": "أحمد محمد",
      "guardianRelation": "الأب",
      "grade": "الصف الرابع",
      "section": "أ",
      "stage": "ابتدائي",
      "campus": "مبنى البنين",
      "gate": "البوابة الرئيسية",
      "requestedAt": "10:42 ص",
      "requestedAtIso": "2026-06-12T10:42:00+03:00",
      "status": "newRequest",
      "priority": "urgent",
      "waitingMinutes": 2,
      "guardianPhone": "050 123 4499",
      "pickupCode": "4821",
      "note": "ولي الأمر ينتظر في المسار السريع.",
      "assignedTo": "مشرف الدور الأول"
    }
  ],
  "summary": {
    "activeCount": 4,
    "urgentCount": 2,
    "newCount": 1,
    "preparingCount": 1,
    "readyCount": 1,
    "delayedCount": 1
  }
}
```

### PATCH `/api/v1/pickup/requests/{id}/status`
Updates request lifecycle.

Request:
```json
{
  "status": "preparing",
  "assignedTo": "مشرف الدور الأول",
  "note": "تم استدعاء الطالب"
}
```

Response:
```json
{
  "data": {
    "id": "REQ-1042",
    "status": "preparing",
    "updatedAt": "2026-06-12T10:44:00+03:00"
  }
}
```

### GET `/api/v1/pickup/requests/history`
Returns historical calls with filters.

Query params:
- `date`: `YYYY-MM-DD`
- `stage`
- `grade`
- `section`
- `gate`
- `status`
- `q`
- `page`
- `limit`

Response:
```json
{
  "data": [
    {
      "date": "2026-06-12",
      "durationLabel": "تم خلال 7 د",
      "durationMinutes": 7,
      "request": {
        "id": "REQ-1038",
        "studentName": "فهد ناصر",
        "guardianName": "ناصر صالح",
        "guardianRelation": "الأب",
        "grade": "الصف الأول متوسط",
        "section": "د",
        "stage": "متوسط",
        "campus": "المبنى المتوسط",
        "gate": "بوابة رقم 2",
        "requestedAt": "10:18 ص",
        "requestedAtIso": "2026-06-12T10:18:00+03:00",
        "status": "delivered",
        "priority": "normal",
        "waitingMinutes": 7,
        "guardianPhone": "054 300 1010",
        "pickupCode": "7712",
        "note": "تم التسليم بعد مطابقة الكود.",
        "assignedTo": "أمن البوابة 2"
      }
    }
  ],
  "summary": {
    "totalCount": 6,
    "deliveredCount": 4,
    "delayedCount": 2
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 6
  }
}
```

### POST `/api/v1/pickup/requests/{id}/escalate`
Escalates delayed requests.

Request:
```json
{
  "reason": "waiting_time_exceeded",
  "message": "الطالب تجاوز 15 دقيقة انتظار"
}
```

## Backend Notes
- `requestedAtIso` مطلوب للترتيب والحسابات، حتى لو الواجهة تعرض `requestedAt`.
- `waitingMinutes` يفضل حسابه من السيرفر أو إرساله مع كل refresh.
- حالات `delivered` لا تظهر في active endpoint إلا لو الفلتر يطلب ذلك.
- يجب إخفاء بيانات ولي الأمر الحساسة حسب صلاحيات المستخدم مستقبلا.
