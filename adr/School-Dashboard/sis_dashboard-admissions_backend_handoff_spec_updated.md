**Admissions Backend Handoff Spec**

*sis_dashboard admission module*

**Purpose**

> Define the data model, canonical enums, database tables, API
> endpoints, and request/response contracts required for the admissions
> frontend, including leads chat and multipart application creation.

| Prepared for        | Backend team                                                                                            |
|---------------------|---------------------------------------------------------------------------------------------------------|
| Scope               | Leads, lead chat, applications, documents, tests, interviews, decisions, enrollments, dashboard support |
| Canonical decisions | Lead statuses fixed; application statuses fixed; application create uses multipart/form-data            |
| Date                | April 12, 2026                                                                                          |

# 1. Scope and implementation decisions

This document translates the current admissions frontend into a backend
contract. It includes the canonical enum decisions that should be
applied server-side even where the current UI still contains temporary
inconsistencies.

- Lead statuses are canonicalized to: New, Contacted, Converted, Closed.

- Application statuses are canonicalized to: submitted,
  documents_pending, under_review, accepted, waitlisted, rejected.

- Application creation should use multipart/form-data so the backend
  receives the actual uploaded files together with student, guardians,
  and document metadata.

- Lead chat is part of the scope and requires message storage, unread
  counts, send/read actions, and list-level conversation summary fields.

# 2. Canonical enums

| **Enum**              | **Allowed values**                                                                   |
|-----------------------|--------------------------------------------------------------------------------------|
| LeadStatus            | New \| Contacted \| Converted \| Closed                                              |
| LeadChannel           | In-app \| Referral \| Walk-in \| Other                                               |
| ApplicationStatus     | submitted \| documents_pending \| under_review \| accepted \| waitlisted \| rejected |
| ApplicationSource     | in_app \| referral \| walk_in \| other                                               |
| DocumentStatus        | complete \| missing                                                                  |
| TestStatus            | scheduled \| completed \| failed \| cancelled \| rescheduled                         |
| InterviewStatus       | scheduled \| completed \| cancelled \| rescheduled                                   |
| DecisionType          | accept \| waitlist \| reject                                                         |
| LeadMessageSenderType | staff \| parent                                                                      |

**Temporary frontend mismatch —** Compatibility rule:

If the backend receives application status "pending" from the current
create stepper, map it to "submitted" before persistence.

# 3. Reference data endpoints

| **Method** | **Endpoint**                                                  | **Purpose**                                       | **Notes**                                  |
|------------|---------------------------------------------------------------|---------------------------------------------------|--------------------------------------------|
| GET        | /api/settings/admissions/document-requirements                | Return active admissions document requirements    | Used by application stepper                |
| GET        | /api/academics/structure-tree?yearId={yearId}&termId={termId} | Return stages, grades, and sections for selection | Used by application stepper and enrollment |

Suggested response — document requirements

> \[  
> {  
> "id": "birth_certificate",  
> "nameEn": "Birth Certificate",  
> "nameAr": "شهادة الميلاد",  
> "required": true,  
> "active": true,  
> "sortOrder": 1  
> }  
> \]

Suggested response — structure tree

> {  
> "stages": \[  
> {  
> "id": "stage-primary",  
> "name": "Primary",  
> "nameAr": "ابتدائي"  
> }  
> \],  
> "grades": \[  
> {  
> "id": "grade-4",  
> "stageId": "stage-primary",  
> "name": "Grade 4",  
> "nameAr": "الصف الرابع"  
> }  
> \],  
> "sections": \[  
> {  
> "id": "section-a",  
> "gradeId": "grade-4",  
> "name": "Section A",  
> "nameAr": "شعبة أ"  
> }  
> \]  
> }

# 4. Database tables

## 4.1 admission_leads

> {  
> "id": "lead-uuid",  
> "name": "Ahmed Ali",  
> "phone": "+201001112233",  
> "email": "parent@example.com",  
> "channel": "In-app",  
> "status": "New",  
> "createdAt": "2026-04-12T10:00:00Z",  
> "gradeInterest": "Grade 4",  
> "source": "Facebook campaign",  
> "notes": "Interested in transfer"  
> }

## 4.2 admission_lead_activities

> {  
> "id": "activity-uuid",  
> "leadId": "lead-uuid",  
> "type": "Call",  
> "message": "Called parent and explained process",  
> "createdAt": "2026-04-12T10:15:00Z",  
> "createdBy": "user-uuid"  
> }

## 4.3 admission_lead_notes

> {  
> "id": "note-uuid",  
> "leadId": "lead-uuid",  
> "body": "Parent prefers morning calls",  
> "createdAt": "2026-04-12T10:20:00Z",  
> "createdBy": "user-uuid"  
> }

## 4.4 admission_lead_messages

One conversation is effectively tied to one lead. A separate
conversations table is optional; unread count and last message can be
computed from messages.

> {  
> "id": "msg-uuid",  
> "leadId": "lead-uuid",  
> "senderId": "user-uuid-or-parent",  
> "senderName": "Sarah Johnson",  
> "senderType": "staff",  
> "message": "Thanks for your interest. Would you like to schedule a
> visit?",  
> "timestamp": "2026-04-12T12:00:00Z",  
> "read": true,  
> "attachments": \[\]  
> }

## 4.5 admission_application_guardians

> {  
> "id": "guardian-uuid",  
> "applicationId": "app-uuid",  
> "full_name": "Mohammed Hassan",  
> "relation": "father",  
> "phone_primary": "+201001112233",  
> "phone_secondary": "+201005556666",  
> "email": "father@example.com",  
> "national_id": "12345678901234",  
> "job_title": "Engineer",  
> "workplace": "Company X",  
> "is_primary": true,  
> "can_pickup": true,  
> "can_receive_notifications": true  
> }

## 4.6 admission_applications

> {  
> "id": "app-uuid",  
> "leadId": "lead-uuid",  
> "source": "in_app",  
> "status": "submitted",  
> "submittedDate": "2026-04-12T10:30:00Z",  
> "first_name_ar": "ليلى",  
> "father_name_ar": "محمد",  
> "grandfather_name_ar": "علي",  
> "family_name_ar": "حسن",  
> "first_name_en": "Layla",  
> "father_name_en": "Mohammed",  
> "grandfather_name_en": "Ali",  
> "family_name_en": "Hassan",  
> "full_name_ar": "ليلى محمد علي حسن",  
> "full_name_en": "Layla Mohammed Ali Hassan",  
> "gender": "female",  
> "date_of_birth": "2016-02-14",  
> "nationality": "Egypt",  
> "stage": "Primary",  
> "grade_requested": "Grade 4",  
> "section": "Section A",  
> "join_date": "2026-09-01",  
> "address_line": "Street 1",  
> "city": "Cairo",  
> "district": "Nasr City",  
> "student_phone": null,  
> "student_email": null,  
> "previous_school": "ABC School",  
> "medical_conditions": "Asthma",  
> "notes": "Needs support in English"  
> }

## 4.7 admission_application_documents

> {  
> "id": "doc-uuid",  
> "applicationId": "app-uuid",  
> "configId": "birth_certificate",  
> "type": "Birth Certificate",  
> "name": "birth-certificate.pdf",  
> "status": "complete",  
> "labelEn": "Birth Certificate",  
> "labelAr": "شهادة الميلاد",  
> "required": true,  
> "uploadedDate": "2026-04-12T10:35:00Z",  
> "url": "https://files.example.com/...",  
> "fileType": "pdf"  
> }

## 4.8 admission_tests

> {  
> "id": "test-uuid",  
> "applicationId": "app-uuid",  
> "type": "Placement",  
> "subject": "Math",  
> "date": "2026-04-20",  
> "time": "10:00",  
> "duration": "60",  
> "location": "Room 101",  
> "proctor": "Teacher Name",  
> "proctorPhone": "+201001112233",  
> "guardianName": "Mohammed Hassan",  
> "guardianPhone": "+201001112233",  
> "status": "scheduled",  
> "score": null,  
> "maxScore": 100,  
> "notes": null  
> }

## 4.9 admission_interviews

> {  
> "id": "interview-uuid",  
> "applicationId": "app-uuid",  
> "date": "2026-04-21",  
> "time": "11:00",  
> "duration": "30",  
> "interviewer": "Admissions Officer",  
> "interviewerPhone": "+201001112233",  
> "guardianName": "Mohammed Hassan",  
> "guardianPhone": "+201001112233",  
> "location": "Office A",  
> "status": "scheduled",  
> "notes": null,  
> "rating": null  
> }

## 4.10 admission_decisions

> {  
> "id": "decision-uuid",  
> "applicationId": "app-uuid",  
> "decision": "accept",  
> "reason": "Passed assessment",  
> "decisionDate": "2026-04-25",  
> "decidedBy": "user-uuid"  
> }

## 4.11 admission_enrollments

> {  
> "id": "enrollment-uuid",  
> "applicationId": "app-uuid",  
> "academicYear": "2026/2027",  
> "grade": "Grade 4",  
> "section": "Section A",  
> "classroom": "4A-01",  
> "gradeId": "grade-4",  
> "sectionId": "section-a",  
> "classroomId": "class-4a-01",  
> "startDate": "2026-09-01",  
> "enrolledDate": "2026-04-25T12:00:00Z"  
> }

# 5. API endpoints

## 5.1 Leads and lead chat

| **Method** | **Endpoint**                                 | **Purpose**                                       | **Notes**                                                   |
|------------|----------------------------------------------|---------------------------------------------------|-------------------------------------------------------------|
| GET        | /api/admissions/leads                        | List leads with search, filters, and chat summary | Include unreadCount and lastMessage preview                 |
| POST       | /api/admissions/leads                        | Create lead                                       | Default status = New                                        |
| GET        | /api/admissions/leads/:id                    | Get lead detail                                   | Return lead, activities, notes, optional linked application |
| PATCH      | /api/admissions/leads/:id                    | Update lead fields or status                      | Status changes use canonical enum                           |
| POST       | /api/admissions/leads/:id/activities         | Add activity log entry                            |                                                             |
| POST       | /api/admissions/leads/:id/notes              | Add note                                          |                                                             |
| POST       | /api/admissions/leads/:id/convert            | Convert lead to application                       | Can create initial application in one call                  |
| GET        | /api/admissions/leads/:id/messages           | Get lead chat thread                              | Return unreadCount and lastMessage                          |
| POST       | /api/admissions/leads/:id/messages           | Send staff message                                | Supports optional attachments                               |
| POST       | /api/admissions/leads/:id/messages/mark-read | Mark parent messages as read                      | Called when chat tab opens                                  |

GET /api/admissions/leads — response item shape

> {  
> "id": "lead-uuid",  
> "name": "Mohammed Ali",  
> "phone": "+201001112233",  
> "email": "mohammed@example.com",  
> "channel": "Referral",  
> "status": "Contacted",  
> "createdAt": "2026-04-12T09:00:00Z",  
> "gradeInterest": "Grade 7",  
> "chat": {  
> "unreadCount": 2,  
> "lastMessageAt": "2026-04-12T11:30:00Z",  
> "lastMessagePreview": "What are the tuition fees?"  
> }  
> }

POST /api/admissions/leads — request

> {  
> "name": "Ahmed Ali",  
> "phone": "+201001112233",  
> "email": "parent@example.com",  
> "channel": "In-app",  
> "gradeInterest": "Grade 4",  
> "source": "Facebook",  
> "notes": "Interested in transfer"  
> }

POST /api/admissions/leads/:id/activities — request

> {  
> "type": "Call",  
> "message": "Called parent and shared next steps"  
> }

POST /api/admissions/leads/:id/notes — request

> {  
> "body": "Parent requested Arabic communication"  
> }

GET /api/admissions/leads/:id/messages — response

> {  
> "leadId": "lead-uuid",  
> "unreadCount": 2,  
> "lastMessage": {  
> "id": "msg-002",  
> "leadId": "lead-uuid",  
> "senderId": "parent",  
> "senderName": "Mohammed Ali",  
> "senderType": "parent",  
> "message": "What are the tuition fees?",  
> "timestamp": "2026-04-12T11:30:00Z",  
> "read": false  
> },  
> "messages": \[  
> {  
> "id": "msg-001",  
> "leadId": "lead-uuid",  
> "senderId": "staff-1",  
> "senderName": "Sarah Johnson",  
> "senderType": "staff",  
> "message": "Welcome! How can I help?",  
> "timestamp": "2026-04-12T10:00:00Z",  
> "read": true,  
> "attachments": \[\]  
> },  
> {  
> "id": "msg-002",  
> "leadId": "lead-uuid",  
> "senderId": "parent",  
> "senderName": "Mohammed Ali",  
> "senderType": "parent",  
> "message": "What are the tuition fees?",  
> "timestamp": "2026-04-12T11:30:00Z",  
> "read": false,  
> "attachments": \[\]  
> }  
> \]  
> }

POST /api/admissions/leads/:id/messages — request

> {  
> "message": "We offer payment plans as well.",  
> "senderType": "staff",  
> "attachments": \[\]  
> }

POST /api/admissions/leads/:id/messages/mark-read — request

> {  
> "senderType": "parent"  
> }

## 5.2 Applications

| **Method** | **Endpoint**                                 | **Purpose**                                   | **Notes**                                                |
|------------|----------------------------------------------|-----------------------------------------------|----------------------------------------------------------|
| GET        | /api/admissions/applications                 | List applications with filters and pagination | Search by studentName, guardianName, guardianEmail, id   |
| POST       | /api/admissions/applications                 | Create application with files                 | multipart/form-data                                      |
| GET        | /api/admissions/applications/:id             | Get full application detail                   | Return guardians, documents, tests, interviews, decision |
| PATCH      | /api/admissions/applications/:id             | Update core application fields                |                                                          |
| POST       | /api/admissions/applications/:id/documents   | Attach or update a document record            | Useful for later uploads or completion                   |
| POST       | /api/admissions/applications/:id/tests       | Schedule a test                               |                                                          |
| PATCH      | /api/admissions/tests/:id                    | Update test result or reschedule              |                                                          |
| POST       | /api/admissions/applications/:id/interviews  | Schedule interview                            |                                                          |
| PATCH      | /api/admissions/interviews/:id               | Update interview result or reschedule         |                                                          |
| POST       | /api/admissions/applications/:id/decision    | Record decision                               | Update application status accordingly                    |
| POST       | /api/admissions/applications/:id/enrollments | Enroll accepted applicant                     | Only for accepted applications                           |

GET /api/admissions/applications — response item shape

> {  
> "id": "app-uuid",  
> "leadId": "lead-uuid",  
> "source": "in_app",  
> "status": "submitted",  
> "submittedDate": "2026-04-12T10:30:00Z",  
> "full_name_ar": "ليلى محمد علي حسن",  
> "full_name_en": "Layla Mohammed Ali Hassan",  
> "studentName": "Layla Mohammed Ali Hassan",  
> "gender": "female",  
> "date_of_birth": "2016-02-14",  
> "dateOfBirth": "2016-02-14",  
> "nationality": "Egypt",  
> "stage": "Primary",  
> "grade_requested": "Grade 4",  
> "gradeRequested": "Grade 4",  
> "section": "Section A",  
> "guardianName": "Mohammed Hassan",  
> "guardianPhone": "+201001112233",  
> "guardianEmail": "father@example.com",  
> "documents": \[\],  
> "tests": \[\],  
> "interviews": \[\],  
> "decision": null  
> }

# 6. Multipart application creation contract

The create endpoint should accept multipart/form-data so the backend
receives the real uploaded files rather than only document metadata.

Recommended form parts:

- student → JSON string

- guardians → JSON string array

- documentsMeta → JSON string array

- documents\[birth_certificate\] → binary file

- documents\[parent_id\] → binary file

- documents\[report_card\] → binary file

Logical request payload represented as JSON

> {  
> "student": {  
> "first_name_ar": "ليلى",  
> "father_name_ar": "محمد",  
> "grandfather_name_ar": "علي",  
> "family_name_ar": "حسن",  
> "first_name_en": "Layla",  
> "father_name_en": "Mohammed",  
> "grandfather_name_en": "Ali",  
> "family_name_en": "Hassan",  
> "gender": "female",  
> "date_of_birth": "2016-02-14",  
> "nationality": "Egypt",  
> "stage": "Primary",  
> "grade_requested": "Grade 4",  
> "section": "Section A",  
> "address_line": "Street 1",  
> "city": "Cairo",  
> "district": "Nasr City",  
> "status": "submitted",  
> "join_date": "2026-09-01",  
> "notes": "",  
> "previous_school": "ABC School",  
> "medical_conditions": ""  
> },  
> "guardians": \[  
> {  
> "full_name": "Mohammed Hassan",  
> "relation": "father",  
> "phone_primary": "+201001112233",  
> "phone_secondary": "",  
> "email": "father@example.com",  
> "national_id": "12345678901234",  
> "job_title": "Engineer",  
> "workplace": "Company X",  
> "is_primary": true,  
> "can_pickup": true,  
> "can_receive_notifications": true  
> }  
> \],  
> "documentsMeta": \[  
> {  
> "configId": "birth_certificate",  
> "labelEn": "Birth Certificate",  
> "labelAr": "شهادة الميلاد",  
> "required": true  
> }  
> \]  
> }

POST /api/admissions/applications — success response

> {  
> "id": "app-uuid",  
> "status": "submitted",  
> "submittedDate": "2026-04-12T12:30:00Z",  
> "documents": \[  
> {  
> "id": "doc-uuid",  
> "configId": "birth_certificate",  
> "name": "birth-certificate.pdf",  
> "status": "complete",  
> "url": "https://files.example.com/..."  
> }  
> \]  
> }

**Creation result —** Required status rule:

If one or more required files are missing, the backend may still create
the application but must set status to documents_pending. Otherwise
create as submitted.

# 7. Action endpoints and payloads

## 7.1 Tests

POST /api/admissions/applications/:id/tests — request

> {  
> "type": "Placement",  
> "subject": "Math",  
> "date": "2026-04-20",  
> "time": "10:00",  
> "duration": "60",  
> "location": "Room 101",  
> "proctor": "Teacher Name",  
> "proctorPhone": "+201001112233",  
> "guardianName": "Mohammed Hassan",  
> "guardianPhone": "+201001112233",  
> "status": "scheduled",  
> "maxScore": 100,  
> "notes": ""  
> }

PATCH /api/admissions/tests/:id — request

> {  
> "status": "completed",  
> "score": 85,  
> "notes": "Good performance"  
> }

## 7.2 Interviews

POST /api/admissions/applications/:id/interviews — request

> {  
> "date": "2026-04-21",  
> "time": "11:00",  
> "duration": "30",  
> "interviewer": "Admissions Officer",  
> "interviewerPhone": "+201001112233",  
> "guardianName": "Mohammed Hassan",  
> "guardianPhone": "+201001112233",  
> "location": "Office A",  
> "status": "scheduled",  
> "notes": ""  
> }

PATCH /api/admissions/interviews/:id — request

> {  
> "status": "completed",  
> "rating": 4,  
> "notes": "Good communication"  
> }

## 7.3 Decisions

POST /api/admissions/applications/:id/decision — request

> {  
> "decision": "accept",  
> "reason": "Passed all checks",  
> "decisionDate": "2026-04-25"  
> }

Response

> {  
> "id": "decision-uuid",  
> "applicationId": "app-uuid",  
> "decision": "accept",  
> "reason": "Passed all checks",  
> "decisionDate": "2026-04-25",  
> "decidedBy": "user-uuid",  
> "applicationStatus": "accepted"  
> }

## 7.4 Enrollment

POST /api/admissions/applications/:id/enrollments — request

> {  
> "academicYear": "2026/2027",  
> "grade": "Grade 4",  
> "section": "Section A",  
> "classroom": "4A-01",  
> "gradeId": "grade-4",  
> "sectionId": "section-a",  
> "classroomId": "class-4a-01",  
> "startDate": "2026-09-01"  
> }

## 7.5 Read endpoints for tests, interviews, decisions, and enrollments

These read endpoints are required because the frontend consumes the
related data in two patterns: nested inside the application detail page
and in standalone module pages for tests, interviews, decisions, and
enrollments.

## 7.5.1 Nested read in application detail

GET /api/admissions/applications/:id — include nested tests, interviews,
decision, and enrollment

> {  
> "id": "APP-001",  
> "studentName": "Layla Hassan",  
> "full_name_ar": "ليلى حسن",  
> "full_name_en": "Layla Hassan",  
> "status": "under_review",  
> "gradeRequested": "Grade 4",  
> "guardianName": "Mohammed Hassan",  
> "guardianPhone": "+201001112233",  
> "guardianEmail": "father@example.com",  
> "submittedDate": "2026-04-12T10:30:00Z",  
> "tests": \[  
> {  
> "id": "TEST-001",  
> "applicationId": "APP-001",  
> "type": "Placement",  
> "subject": "Math",  
> "date": "2026-04-20",  
> "time": "10:00",  
> "duration": "60",  
> "location": "Room 101",  
> "proctor": "Teacher Name",  
> "proctorPhone": "+201001112233",  
> "guardianName": "Mohammed Hassan",  
> "guardianPhone": "+201001112233",  
> "status": "scheduled",  
> "score": null,  
> "maxScore": 100,  
> "notes": ""  
> }  
> \],  
> "interviews": \[  
> {  
> "id": "INT-001",  
> "applicationId": "APP-001",  
> "date": "2026-04-21",  
> "time": "11:00",  
> "duration": "30",  
> "interviewer": "Admissions Officer",  
> "interviewerPhone": "+201001112233",  
> "guardianName": "Mohammed Hassan",  
> "guardianPhone": "+201001112233",  
> "location": "Office A",  
> "status": "scheduled",  
> "notes": "",  
> "rating": null  
> }  
> \],  
> "decision": {  
> "id": "DEC-001",  
> "applicationId": "APP-001",  
> "decision": "waitlist",  
> "reason": "Need one more review",  
> "decisionDate": "2026-04-25",  
> "decidedBy": "Admissions Manager"  
> },  
> "enrollment": null  
> }

## 7.5.2 Tests

GET /api/admissions/tests — query params: search, status, type,
dateFrom, dateTo, page, limit

> {  
> "items": \[  
> {  
> "id": "TEST-001",  
> "applicationId": "APP-001",  
> "studentName": "Layla Hassan",  
> "gradeRequested": "Grade 4",  
> "type": "Placement",  
> "subject": "Math",  
> "date": "2026-04-20",  
> "time": "10:00",  
> "duration": "60",  
> "location": "Room 101",  
> "proctor": "Teacher Name",  
> "proctorPhone": "+201001112233",  
> "guardianName": "Mohammed Hassan",  
> "guardianPhone": "+201001112233",  
> "status": "scheduled",  
> "score": null,  
> "maxScore": 100,  
> "notes": ""  
> }  
> \],  
> "pagination": {  
> "page": 1,  
> "limit": 20,  
> "total": 1  
> }  
> }

GET /api/admissions/tests/:id — return one test record with the same
shape.

## 7.5.3 Interviews

GET /api/admissions/interviews — query params: search, status, dateFrom,
dateTo, page, limit

> {  
> "items": \[  
> {  
> "id": "INT-001",  
> "applicationId": "APP-001",  
> "studentName": "Layla Hassan",  
> "gradeRequested": "Grade 4",  
> "date": "2026-04-21",  
> "time": "11:00",  
> "duration": "30",  
> "interviewer": "Admissions Officer",  
> "interviewerPhone": "+201001112233",  
> "guardianName": "Mohammed Hassan",  
> "guardianPhone": "+201001112233",  
> "location": "Office A",  
> "status": "scheduled",  
> "notes": "",  
> "rating": null  
> }  
> \],  
> "pagination": {  
> "page": 1,  
> "limit": 20,  
> "total": 1  
> }  
> }

GET /api/admissions/interviews/:id — return one interview record.

## 7.5.4 Decisions

GET /api/admissions/decisions — query params: search, decision,
dateFrom, dateTo, page, limit

> {  
> "items": \[  
> {  
> "id": "DEC-001",  
> "applicationId": "APP-001",  
> "studentName": "Layla Hassan",  
> "grade": "Grade 4",  
> "decision": "accept",  
> "reason": "Passed assessment and interview",  
> "decisionDate": "2026-04-25",  
> "decidedBy": "Admissions Manager"  
> }  
> \],  
> "pagination": {  
> "page": 1,  
> "limit": 20,  
> "total": 1  
> }  
> }

GET /api/admissions/decisions/:id — return one decision record.

## 7.5.5 Enrollments

GET /api/admissions/enrollments — query params: search, grade,
academicYear, dateFrom, dateTo, page, limit

> {  
> "items": \[  
> {  
> "id": "ENR-001",  
> "applicationId": "APP-001",  
> "studentId": "STU-001",  
> "studentName": "Layla Hassan",  
> "guardianName": "Mohammed Hassan",  
> "guardianPhone": "+201001112233",  
> "academicYear": "2026/2027",  
> "grade": "Grade 4",  
> "section": "A",  
> "classroom": "4A-01",  
> "gradeId": "grade-4",  
> "sectionId": "section-a",  
> "classroomId": "class-4a-01",  
> "startDate": "2026-09-01",  
> "enrolledDate": "2026-04-25"  
> }  
> \],  
> "pagination": {  
> "page": 1,  
> "limit": 20,  
> "total": 1  
> }  
> }

GET /api/admissions/enrollments/:id — return one enrollment record.

## 7.5.6 Structure recommendation

Keep the nested related data inside GET /api/admissions/applications/:id
and also expose standalone collection endpoints for tests, interviews,
decisions, and enrollments. This matches the current frontend, which has
both application detail views and dedicated module pages.

# 8. Dashboard support

| **Method** | **Endpoint**                                        | **Purpose**                  | **Notes**                                           |
|------------|-----------------------------------------------------|------------------------------|-----------------------------------------------------|
| GET        | /api/admissions/dashboard/summary?dateFrom=&dateTo= | Return dashboard KPI summary | Optional if frontend computes from application list |

> {  
> "newInPeriod": 12,  
> "newToday": 2,  
> "newThisWeek": 5,  
> "pendingReview": 4,  
> "missingDocuments": 3,  
> "approved": 2,  
> "rejected": 1,  
> "avgProcessingDisplay": "3.5 days"  
> }

# 9. Backend implementation order

- Reference endpoints

- Leads CRUD

- Lead chat

- Applications list, detail, and multipart create

- Documents follow-up endpoint

- Tests and interviews

- Decision and enrollment

- Dashboard summary

# 10. Final notes

- The backend should persist only the canonical enums defined in this
  document.

- The backend should include compatibility handling for temporary
  frontend inputs such as pending -\> submitted.

- The leads list should include chat summary fields to avoid extra
  network calls for unread badges.

- The applications list should include both canonical snake_case fields
  and current frontend-friendly aliases where needed during transition.
