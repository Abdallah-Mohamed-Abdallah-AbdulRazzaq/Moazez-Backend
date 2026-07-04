# Gates Duties Feature Backend Requirements

## Scope
تعرض هذه الفيوتشر حالة البوابات، الضغط الحالي، المشرفين، المناوبة الحالية والقادمة، وتعليمات التشغيل.

## Enums
```json
{
  "GateOperationalStatus": ["open", "busy", "closed", "maintenance"],
  "ShiftType": ["morning", "dismissal", "evening"]
}
```

## Models

### GateDuty
```json
{
  "id": "G-01",
  "name": "البوابة الرئيسية",
  "campus": "مبنى البنين",
  "status": "busy",
  "activeRequests": 7,
  "averageWaitMinutes": 9,
  "supervisor": "أ. ماجد الحربي",
  "securityOfficer": "خالد اليوسف",
  "radioChannel": "CH-1",
  "allowedStages": ["ابتدائي", "متوسط"],
  "currentShift": {
    "title": "مناوبة خروج الطلاب",
    "type": "dismissal",
    "timeRange": "12:00 م - 2:30 م",
    "startsAt": "2026-06-12T12:00:00+03:00",
    "endsAt": "2026-06-12T14:30:00+03:00",
    "leadName": "أ. ماجد الحربي",
    "team": ["خالد اليوسف", "سامي العبدالله", "مشرف الدور الأول"],
    "zone": "المسار السريع والانتظار الخارجي",
    "tasks": [
      "مطابقة كود الاستلام قبل خروج الطالب",
      "توجيه المركبات للمسار السريع عند وجود طلب عاجل",
      "تصعيد أي انتظار أعلى من 15 دقيقة للمشرف العام"
    ]
  },
  "nextShift": {
    "title": "مناوبة متابعة متأخرين",
    "type": "evening",
    "timeRange": "2:30 م - 3:15 م",
    "startsAt": "2026-06-12T14:30:00+03:00",
    "endsAt": "2026-06-12T15:15:00+03:00",
    "leadName": "أمن البوابة 1",
    "team": ["خالد اليوسف", "مشرف النشاط"],
    "zone": "منطقة الانتظار",
    "tasks": ["حصر الطلاب المتبقين", "التواصل مع أولياء الأمور المتأخرين"]
  },
  "notes": [
    "ضغط مرتفع بسبب نهاية اليوم الدراسي.",
    "يفضل تحويل طلبات الحضانة إلى بوابة الحضانة مباشرة."
  ]
}
```

## Required Endpoints

### GET `/api/v1/gates`
Returns gate operational status and shifts.

Query params:
- `date`: optional `YYYY-MM-DD`
- `campus`: optional
- `status`: optional enum

Response:
```json
{
  "data": [
    {
      "id": "G-01",
      "name": "البوابة الرئيسية",
      "campus": "مبنى البنين",
      "status": "busy",
      "activeRequests": 7,
      "averageWaitMinutes": 9,
      "supervisor": "أ. ماجد الحربي",
      "securityOfficer": "خالد اليوسف",
      "radioChannel": "CH-1",
      "allowedStages": ["ابتدائي", "متوسط"],
      "currentShift": {
        "title": "مناوبة خروج الطلاب",
        "type": "dismissal",
        "timeRange": "12:00 م - 2:30 م",
        "startsAt": "2026-06-12T12:00:00+03:00",
        "endsAt": "2026-06-12T14:30:00+03:00",
        "leadName": "أ. ماجد الحربي",
        "team": ["خالد اليوسف", "سامي العبدالله", "مشرف الدور الأول"],
        "zone": "المسار السريع والانتظار الخارجي",
        "tasks": ["مطابقة كود الاستلام قبل خروج الطالب"]
      },
      "nextShift": {
        "title": "مناوبة متابعة متأخرين",
        "type": "evening",
        "timeRange": "2:30 م - 3:15 م",
        "startsAt": "2026-06-12T14:30:00+03:00",
        "endsAt": "2026-06-12T15:15:00+03:00",
        "leadName": "أمن البوابة 1",
        "team": ["خالد اليوسف", "مشرف النشاط"],
        "zone": "منطقة الانتظار",
        "tasks": ["حصر الطلاب المتبقين"]
      },
      "notes": ["ضغط مرتفع بسبب نهاية اليوم الدراسي."]
    }
  ],
  "summary": {
    "openCount": 2,
    "busyCount": 1,
    "activeRequests": 14
  }
}
```

### PATCH `/api/v1/gates/{id}/status`
Updates a gate status.

Request:
```json
{
  "status": "maintenance",
  "note": "تحويل الطلبات مؤقتا للبوابة الرئيسية"
}
```

### GET `/api/v1/gates/{id}/shifts`
Returns shift plan for one gate.

### POST `/api/v1/gates/{id}/handover`
Used when a shift is handed over.

Request:
```json
{
  "fromStaffId": "EMP-0421",
  "toStaffId": "EMP-0440",
  "openRequestsCount": 3,
  "notes": "تم تسليم المتأخرين لمشرف المناوبة التالية"
}
```

## Backend Notes
- `activeRequests` و`averageWaitMinutes` يفضل حسابهما من طلبات النداء الحية.
- `currentShift` و`nextShift` يجب أن يتم حسابهما حسب الوقت الحالي والمنطقة الزمنية `Africa/Cairo`.
- يجب دعم حالة الصيانة وتحويل الطلبات لبوابة بديلة مستقبلا.
