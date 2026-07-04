# Waiting Students Feature Backend Requirements

## Scope
تعرض الطلاب الذين تم استدعاؤهم ولم يتم تسليمهم بعد، مع معلومات الانتظار، البوابة، منطقة الانتظار، ولي الأمر، والكود.

## Enums
```json
{
  "WaitingStudentStatus": ["called", "moving", "atGate", "delayed"],
  "WaitingStudentPriority": ["normal", "urgent"]
}
```

## Model
```json
{
  "id": "WAIT-207",
  "requestId": "REQ-1042",
  "studentName": "سلمان أحمد",
  "guardianName": "أحمد محمد",
  "guardianRelation": "الأب",
  "grade": "الصف الرابع",
  "section": "أ",
  "stage": "ابتدائي",
  "campus": "مبنى البنين",
  "gate": "البوابة الرئيسية",
  "waitingZone": "المسار السريع",
  "calledAt": "10:42 ص",
  "calledAtIso": "2026-06-12T10:42:00+03:00",
  "waitingMinutes": 16,
  "pickupCode": "4821",
  "guardianPhone": "050 123 4499",
  "assignedTo": "مشرف الدور الأول",
  "status": "delayed",
  "priority": "urgent",
  "note": "ولي الأمر ينتظر قرب المسار السريع ويحتاج تصعيد."
}
```

## Required Endpoints

### GET `/api/v1/waiting-students`
Query params:
- `stage`: optional
- `gate`: optional
- `waitingZone`: optional
- `status`: optional enum
- `priority`: optional enum

Response:
```json
{
  "data": [
    {
      "id": "WAIT-207",
      "requestId": "REQ-1042",
      "studentName": "سلمان أحمد",
      "guardianName": "أحمد محمد",
      "guardianRelation": "الأب",
      "grade": "الصف الرابع",
      "section": "أ",
      "stage": "ابتدائي",
      "campus": "مبنى البنين",
      "gate": "البوابة الرئيسية",
      "waitingZone": "المسار السريع",
      "calledAt": "10:42 ص",
      "calledAtIso": "2026-06-12T10:42:00+03:00",
      "waitingMinutes": 16,
      "pickupCode": "4821",
      "guardianPhone": "050 123 4499",
      "assignedTo": "مشرف الدور الأول",
      "status": "delayed",
      "priority": "urgent",
      "note": "ولي الأمر ينتظر قرب المسار السريع ويحتاج تصعيد."
    }
  ],
  "summary": {
    "totalCount": 5,
    "delayedCount": 1,
    "atGateCount": 2
  },
  "filters": {
    "stages": ["حضانة", "تمهيدي", "ابتدائي", "متوسط"],
    "gates": ["البوابة الرئيسية", "بوابة الحضانة", "بوابة البنات", "بوابة الروضة", "بوابة رقم 2"],
    "waitingZones": ["منطقة الانتظار أ", "منطقة الانتظار ب", "مظلة الحضانة", "المسار السريع"]
  }
}
```

### PATCH `/api/v1/waiting-students/{id}/status`
Updates current waiting state.

Request:
```json
{
  "status": "atGate",
  "note": "وصل الطالب للبوابة"
}
```

### POST `/api/v1/waiting-students/{id}/confirm-arrival`
Shortcut endpoint for "تأكيد الوصول".

Response:
```json
{
  "data": {
    "id": "WAIT-207",
    "status": "atGate",
    "updatedAt": "2026-06-12T10:58:00+03:00"
  }
}
```

### POST `/api/v1/waiting-students/{id}/escalate`
Escalates urgent/delayed student.

Request:
```json
{
  "reason": "guardian_waiting_too_long",
  "message": "ولي الأمر ينتظر قرب المسار السريع"
}
```

## Backend Notes
- هذه القائمة يجب ألا تحتوي على الطلاب الذين تم تسليمهم.
- `waitingMinutes` يجب أن يتحدث باستمرار بناء على `calledAtIso`.
- `requestId` مهم لفتح طلب النداء الأصلي.
- يجب احترام صلاحيات المستخدم والبوابة الحالية.
