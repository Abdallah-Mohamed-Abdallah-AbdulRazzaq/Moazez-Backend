# Add Child Feature Backend Model

## 1. Schools Search

### Endpoint
- `GET /schools`
- query:
  - `search`
  - `city`
  - `grade`
  - `page`
  - `limit`

### Response Item
```json
{
  "id": "string",
  "name": "string",
  "address": "string",
  "logo_url": "string",
  "rating": 4.8,
  "student_count": 1250,
  "grades": ["string"]
}
```

## 2. Required Documents

### Endpoint
- `GET /schools/{school_id}/admission-required-documents`

### Response Item
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "is_mandatory": true,
  "file_type": "image|pdf",
  "max_files": 1
}
```

## 3. Temporary Applicant Account

### Endpoint
- `POST /applicants/temporary-account`

### Request
```json
{
  "full_name": "string",
  "phone_number": "string",
  "email": "string",
  "city": "string",
  "relationship": "father|mother|guardian|relative",
  "password": "string"
}
```

### Response
```json
{
  "id": "string",
  "full_name": "string",
  "phone_number": "string",
  "email": "string",
  "city": "string",
  "relationship": "string",
  "token": "string"
}
```

## 4. Admission Application

### Endpoint
- `POST /admission-applications`

### Request
```json
{
  "school_id": "string",
  "child": {
    "first_name": "string",
    "father_name": "string",
    "grandfather_name": "string",
    "family_name": "string",
    "full_name": "string",
    "date_of_birth": "YYYY-MM-DD",
    "gender": "male|female",
    "nationality": "string",
    "grade_id": "string",
    "previous_school": "string|null",
    "notes": "string|null"
  },
  "documents": [
    {
      "document_id": "string",
      "file_url": "string"
    }
  ]
}
```

### Response
```json
{
  "id": "string",
  "school_id": "string",
  "school_name": "string",
  "school_address": "string",
  "child_full_name": "string",
  "grade_label": "string",
  "submitted_at": "ISO8601",
  "status": "draft|submitted|under_review|accepted|needs_action|rejected",
  "status_label": "string",
  "status_description": "string",
  "progress_value": 0.55,
  "missing_items_count": 0
}
```

## 5. Applicant Portal Home

### Endpoint
- `GET /applicants/portal/home`

### Response
```json
{
  "applicant": {
    "full_name": "string",
    "email": "string",
    "phone_number": "string",
    "city": "string",
    "relationship": "string"
  },
  "notifications_count": 0,
  "latest_request": {
    "id": "string",
    "school_name": "string",
    "child_full_name": "string",
    "submitted_at": "ISO8601",
    "status": "string",
    "status_label": "string",
    "status_description": "string",
    "progress_value": 0.55
  },
  "stats": {
    "total_requests": 0,
    "under_review_requests": 0
  }
}
```

## 6. Applicant Portal Requests

### Endpoint
- `GET /applicants/portal/requests`

### Response
```json
[
  {
    "id": "string",
    "school_id": "string",
    "school_name": "string",
    "school_address": "string",
    "child_full_name": "string",
    "grade_label": "string",
    "submitted_at": "ISO8601",
    "status": "draft|submitted|under_review|accepted|needs_action|rejected",
    "status_label": "string",
    "status_description": "string",
    "progress_value": 0.55,
    "missing_items_count": 0
  }
]
```

## 7. Profile / Temporary Account Info

### Endpoint
- `GET /applicants/portal/profile`

### Response
```json
{
  "full_name": "string",
  "phone_number": "string",
  "email": "string",
  "city": "string",
  "relationship": "string",
  "has_accepted_request": false
}
```

## 8. Useful Notes

- `grade_id` أفضل من إرسال اسم الصف فقط.
- `status_label` و `status_description` يفضل أن يرجعا من الـ backend جاهزين للعرض.
- المستندات يفضل رفعها أولًا عبر:
  - `POST /uploads`
- ثم استخدام `file_url` أو `file_id` داخل `documents`.
- إذا كان الحساب المؤقت له session مستقلة:
  - نحتاج `token`
  - ونحتاج `POST /auth/logout`
