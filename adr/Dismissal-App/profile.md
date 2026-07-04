# Profile Feature Backend Requirements

## Scope
تعرض بيانات مشرف النداء/الأمن، صلاحياته، مناوبته الحالية، وإحصائيات اليوم.

## Models

### StaffProfile
```json
{
  "name": "ماجد الحربي",
  "role": "مشرف النداء والبوابة",
  "employeeId": "EMP-0421",
  "schoolName": "مدارس معزز الأهلية",
  "primaryGate": "البوابة الرئيسية",
  "currentShift": "مناوبة خروج الطلاب • 12:00 م - 2:30 م",
  "phone": "050 880 1122",
  "email": "m.alharbi@moazez.school",
  "permissions": [
    "إدارة طلبات النداء",
    "تأكيد تسليم الطلاب",
    "تصعيد الطلبات المتأخرة",
    "مراسلة أولياء الأمور",
    "عرض سجل النداءات"
  ],
  "safetyChecks": [
    "مطابقة كود الاستلام قبل التسليم",
    "التحقق من ولي الأمر المعتمد",
    "إغلاق الطلب بعد التسليم مباشرة",
    "تصعيد الانتظار أعلى من 15 دقيقة"
  ],
  "todayStats": {
    "handledCalls": 24,
    "deliveredStudents": 18,
    "escalatedCalls": 3,
    "averageWaitMinutes": 8
  }
}
```

## Required Endpoints

### GET `/api/v1/me/profile`
Returns current staff profile.

Response:
```json
{
  "data": {
    "name": "ماجد الحربي",
    "role": "مشرف النداء والبوابة",
    "employeeId": "EMP-0421",
    "schoolName": "مدارس معزز الأهلية",
    "primaryGate": "البوابة الرئيسية",
    "currentShift": "مناوبة خروج الطلاب • 12:00 م - 2:30 م",
    "phone": "050 880 1122",
    "email": "m.alharbi@moazez.school",
    "permissions": [
      "إدارة طلبات النداء",
      "تأكيد تسليم الطلاب",
      "تصعيد الطلبات المتأخرة"
    ],
    "safetyChecks": [
      "مطابقة كود الاستلام قبل التسليم",
      "التحقق من ولي الأمر المعتمد"
    ],
    "todayStats": {
      "handledCalls": 24,
      "deliveredStudents": 18,
      "escalatedCalls": 3,
      "averageWaitMinutes": 8
    }
  }
}
```

### PATCH `/api/v1/me/profile`
Optional for editable fields.

Request:
```json
{
  "phone": "050 880 1122",
  "email": "m.alharbi@moazez.school"
}
```

### GET `/api/v1/me/permissions`
Returns machine-readable permissions.

Response:
```json
{
  "data": [
    "pickup.calls.manage",
    "pickup.calls.deliver",
    "pickup.calls.escalate",
    "communication.messages.view",
    "pickup.calls.history.view"
  ]
}
```

### GET `/api/v1/me/today-stats`
Can be separate if stats update frequently.

Response:
```json
{
  "data": {
    "handledCalls": 24,
    "deliveredStudents": 18,
    "escalatedCalls": 3,
    "averageWaitMinutes": 8
  }
}
```

## Backend Notes
- `permissions` المعروضة عربية، لكن يفضل إرسال `permissionKeys` أيضا للاستخدام البرمجي.
- `todayStats` يجب حسابها حسب اليوم والمدرسة والبوابة والمستخدم الحالي.
- `currentShift` يفضل أن يحتوي أيضا على `shiftId`, `startsAt`, `endsAt`.
