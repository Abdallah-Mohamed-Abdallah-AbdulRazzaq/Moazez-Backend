# Settings Module Backend Handoff Spec

## Scope
This document converts the current `settings` frontend module into a backend-ready contract for database design and API endpoints.

The current settings module includes:
- overview dashboard
- school branding and profile
- users
- roles and permissions
- policies
- admissions document requirements
- notification templates
- integrations
- security and audit log
- backup, export, import, and migration history

## Source of truth from frontend
This spec is grounded in the current settings page structure, shared types, permission catalog, and service layer.

## 1) Canonical entities and enums

### Shared status enums
```json
{
  "userStatus": ["active", "invited", "inactive"],
  "templateStatus": ["active", "draft"],
  "integrationStatus": ["connected", "disconnected", "needs_attention"],
  "backupJobStatus": ["completed", "running", "failed"],
  "auditSeverity": ["info", "warning", "critical"],
  "notificationChannel": ["email", "sms", "in_app"],
  "integrationFieldType": ["text", "password", "url", "email", "select"],
  "backupJobType": ["backup", "export", "import", "migration"]
}
```

### Main settings entities
```json
{
  "schoolProfile": {
    "schoolName": "string",
    "shortName": "string",
    "timezone": "string",
    "addressLine": "string",
    "formattedAddress": "string",
    "city": "string",
    "country": "string",
    "footerSignature": "string",
    "logoUrl": "string|null",
    "latitude": "number|null",
    "longitude": "number|null",
    "mapPlaceLabel": "string|null"
  },
  "role": {
    "id": "string",
    "name": "string",
    "description": "string",
    "isSystem": true,
    "memberCount": 0,
    "permissions": ["settings.users.view"]
  },
  "user": {
    "id": "string",
    "fullName": "string",
    "email": "string",
    "roleId": "string",
    "status": "active",
    "lastActiveAt": "2026-04-12T12:00:00Z",
    "invitedAt": null,
    "lastInviteSentAt": null
  },
  "policySettings": {
    "attendance": {
      "absenceThreshold": 3,
      "lateThresholdMinutes": 10,
      "lockTime": "09:00",
      "guardianAlertEnabled": true,
      "portalAbsenceVisible": true
    },
    "grades": {
      "passingScore": 50,
      "publishApprovalRequired": true,
      "allowTeacherDrafts": true,
      "weightingLockedAfterPublish": true
    },
    "behavior": {
      "incidentThreshold": 4,
      "suspensionRequiresApproval": true,
      "guardianNotificationEnabled": true,
      "studentPortalVisibility": false
    }
  },
  "admissionsDocumentRequirement": {
    "id": "birth-certificate",
    "nameEn": "Birth Certificate",
    "nameAr": "شهادة الميلاد",
    "required": true,
    "active": true,
    "sortOrder": 1
  },
  "notificationTemplate": {
    "id": "template-attendance-alert",
    "key": "attendance_alert",
    "name": "Attendance Alert",
    "status": "active",
    "variables": ["student_name", "date", "status"],
    "channelStates": [
      { "channel": "email", "enabled": true },
      { "channel": "sms", "enabled": true },
      { "channel": "in_app", "enabled": true }
    ],
    "template": {
      "title": "Attendance alert",
      "titleAr": "تنبيه حضور",
      "message": "Attendance alert for {{student_name}} on {{date}}.",
      "messageAr": "...",
      "emailSubject": "Attendance alert",
      "emailSubjectAr": "...",
      "smsMessage": "{{student_name}} was marked {{status}} on {{date}}.",
      "smsMessageAr": "...",
      "channels": ["email", "sms", "in_app"],
      "priority": "high",
      "stage": "documents_pending"
    },
    "lastTestAt": "2026-04-12T11:00:00Z"
  },
  "integration": {
    "id": "integration-email",
    "provider": "Email SMTP",
    "category": "Email",
    "status": "connected",
    "description": "Transactional and bulk email delivery provider.",
    "lastCheckedAt": "2026-04-12T10:00:00Z",
    "lastTestAt": "2026-04-12T10:00:00Z",
    "lastSyncAt": "2026-04-12T09:55:00Z",
    "healthNote": "Healthy",
    "fields": [
      { "key": "host", "label": "SMTP Host", "type": "text", "required": true },
      { "key": "username", "label": "Username", "type": "email", "required": true },
      { "key": "password", "label": "Password", "type": "password", "required": true }
    ],
    "configuration": {
      "providerId": "integration-email",
      "values": {
        "host": "smtp.example.com",
        "username": "notifications@example.com",
        "password": "secret"
      },
      "updatedAt": "2026-04-12T09:50:00Z"
    }
  },
  "securitySettings": {
    "enforceTwoFactor": true,
    "ipAllowlistEnabled": false,
    "ipAllowlist": "",
    "sessionTimeoutMinutes": 30,
    "suspiciousLoginAlerts": true,
    "passwordMinLength": 10,
    "passwordRotationDays": 90
  },
  "auditLogEntry": {
    "id": "audit-1",
    "actor": "Ahmed Mostafa",
    "action": "Updated grading policy thresholds",
    "module": "Policies",
    "entity": "grades-policy",
    "timestamp": "2026-04-12T09:30:00Z",
    "severity": "warning",
    "ipAddress": "10.0.0.24"
  },
  "backupHistoryEntry": {
    "id": "backup-1",
    "type": "backup",
    "status": "completed",
    "fileName": "settings-backup-2026-04-12.json",
    "createdAt": "2026-04-12T04:00:00Z",
    "createdBy": "Ahmed Mostafa",
    "note": "Nightly settings snapshot"
  }
}
```

## 2) Permission catalog backend should support
The frontend permission matrix and access guards use explicit permission keys. Backend should store and return these permission definitions and evaluate access with them.

### `GET /api/settings/permissions/catalog`
Response:
```json
[
  {
    "key": "settings.overview.view",
    "module": "overview",
    "action": "view",
    "label": "Settings overview",
    "description": "View settings health, invites, integrations, and audit summary."
  },
  {
    "key": "settings.branding.manage",
    "module": "branding",
    "action": "manage",
    "label": "Manage branding & profile",
    "description": "Edit school profile, logo, and footer branding."
  },
  {
    "key": "settings.users.manage",
    "module": "users",
    "action": "manage",
    "label": "Manage users",
    "description": "Create users, resend invites, change status, and assign roles."
  }
]
```

## 3) Suggested database tables

### `settings_school_profile`
Singleton row.
```json
{
  "id": "school-profile",
  "school_name": "Moazzez International School",
  "short_name": "MIS",
  "timezone": "Africa/Cairo",
  "address_line": "North 90 Street, New Cairo",
  "formatted_address": "North 90 Street, Fifth Settlement, New Cairo, Cairo Governorate, Egypt",
  "city": "Cairo",
  "country": "Egypt",
  "footer_signature": "Moazzez School Management Platform",
  "logo_url": "https://files.example.com/logo.png",
  "latitude": 30.0284,
  "longitude": 31.4913,
  "map_place_label": "Moazzez International School",
  "updated_at": "2026-04-12T12:00:00Z",
  "updated_by": "settings-user-1"
}
```

### `settings_roles`
```json
{
  "id": "role-admin",
  "name": "System Admin",
  "description": "Full administrative access across settings and operations.",
  "is_system": true,
  "created_at": "2026-04-01T09:00:00Z",
  "updated_at": "2026-04-12T11:00:00Z"
}
```

### `settings_role_permissions`
```json
{
  "role_id": "role-admin",
  "permission_key": "settings.users.manage"
}
```

### `settings_users`
```json
{
  "id": "settings-user-1",
  "full_name": "Ahmed Mostafa",
  "email": "ahmed@example.com",
  "role_id": "role-admin",
  "status": "active",
  "last_active_at": "2026-04-12T11:55:00Z",
  "invited_at": null,
  "last_invite_sent_at": null,
  "created_at": "2026-04-01T09:00:00Z",
  "updated_at": "2026-04-12T11:55:00Z"
}
```

### `settings_policies`
Singleton row or three normalized rows.
```json
{
  "id": "settings-policies",
  "attendance": {
    "absenceThreshold": 3,
    "lateThresholdMinutes": 10,
    "lockTime": "09:00",
    "guardianAlertEnabled": true,
    "portalAbsenceVisible": true
  },
  "grades": {
    "passingScore": 50,
    "publishApprovalRequired": true,
    "allowTeacherDrafts": true,
    "weightingLockedAfterPublish": true
  },
  "behavior": {
    "incidentThreshold": 4,
    "suspensionRequiresApproval": true,
    "guardianNotificationEnabled": true,
    "studentPortalVisibility": false
  },
  "updated_at": "2026-04-12T12:00:00Z",
  "updated_by": "settings-user-1"
}
```

### `settings_admissions_document_requirements`
```json
{
  "id": "birth-certificate",
  "name_en": "Birth Certificate",
  "name_ar": "شهادة الميلاد",
  "required": true,
  "active": true,
  "sort_order": 1,
  "updated_at": "2026-04-12T12:00:00Z"
}
```

### `settings_notification_templates`
```json
{
  "id": "template-attendance-alert",
  "key": "attendance_alert",
  "name": "Attendance Alert",
  "status": "active",
  "variables": ["student_name", "date", "status"],
  "title": "Attendance alert",
  "title_ar": "تنبيه حضور",
  "message": "Attendance alert for {{student_name}} on {{date}}.",
  "message_ar": "...",
  "email_subject": "Attendance alert",
  "email_subject_ar": "...",
  "sms_message": "{{student_name}} was marked {{status}} on {{date}}.",
  "sms_message_ar": "...",
  "channels": ["email", "sms", "in_app"],
  "stage": "documents_pending",
  "priority": "high",
  "last_test_at": "2026-04-12T11:00:00Z",
  "updated_at": "2026-04-12T11:30:00Z"
}
```

### `settings_notification_template_channel_states`
Optional if you want normalized per-channel flags.
```json
{
  "template_id": "template-attendance-alert",
  "channel": "email",
  "enabled": true
}
```

### `settings_integrations`
```json
{
  "id": "integration-email",
  "provider": "Email SMTP",
  "category": "Email",
  "status": "connected",
  "description": "Transactional and bulk email delivery provider.",
  "last_checked_at": "2026-04-12T10:00:00Z",
  "last_test_at": "2026-04-12T10:00:00Z",
  "last_sync_at": "2026-04-12T09:55:00Z",
  "health_note": "Healthy",
  "updated_at": "2026-04-12T09:50:00Z"
}
```

### `settings_integration_fields`
```json
{
  "integration_id": "integration-email",
  "key": "password",
  "label": "Password",
  "type": "password",
  "required": true,
  "placeholder": ""
}
```

### `settings_integration_configurations`
```json
{
  "integration_id": "integration-email",
  "values": {
    "host": "smtp.example.com",
    "username": "notifications@example.com",
    "password": "secret"
  },
  "updated_at": "2026-04-12T09:50:00Z"
}
```

### `settings_security_controls`
Singleton row.
```json
{
  "id": "security-settings",
  "enforce_two_factor": true,
  "ip_allowlist_enabled": false,
  "ip_allowlist": "",
  "session_timeout_minutes": 30,
  "suspicious_login_alerts": true,
  "password_min_length": 10,
  "password_rotation_days": 90,
  "updated_at": "2026-04-12T12:00:00Z",
  "updated_by": "settings-user-1"
}
```

### `settings_audit_logs`
```json
{
  "id": "audit-1",
  "actor": "Ahmed Mostafa",
  "action": "Updated grading policy thresholds",
  "module": "Policies",
  "entity": "grades-policy",
  "severity": "warning",
  "ip_address": "10.0.0.24",
  "timestamp": "2026-04-12T09:30:00Z"
}
```

### `settings_backup_jobs`
```json
{
  "id": "backup-1",
  "type": "backup",
  "status": "completed",
  "file_name": "settings-backup-2026-04-12.json",
  "created_at": "2026-04-12T04:00:00Z",
  "created_by": "Ahmed Mostafa",
  "note": "Nightly settings snapshot"
}
```


## 4) Overview endpoints
The overview page reads metrics, a compact integrations list, and the most recent audit entries.

### `GET /api/settings/overview/metrics`
Response:
```json
{
  "profileCompleteness": 88,
  "activeIntegrations": 3,
  "activeUsers": 12,
  "pendingInvites": 2,
  "recentAuditEvents": 7,
  "templateHealth": 75
}
```

### `GET /api/settings/overview`
Optional aggregate endpoint.
```json
{
  "metrics": {
    "profileCompleteness": 88,
    "activeIntegrations": 3,
    "activeUsers": 12,
    "pendingInvites": 2,
    "recentAuditEvents": 7,
    "templateHealth": 75
  },
  "integrations": [
    {
      "id": "integration-email",
      "provider": "Email SMTP",
      "category": "Email",
      "status": "connected",
      "description": "Transactional and bulk email delivery provider."
    }
  ],
  "auditEntries": [
    {
      "id": "audit-1",
      "actor": "Ahmed Mostafa",
      "action": "Updated grading policy thresholds",
      "module": "Policies",
      "timestamp": "2026-04-12T09:30:00Z",
      "severity": "warning",
      "ipAddress": "10.0.0.24"
    }
  ]
}
```

### Metric rules backend should apply
- `profileCompleteness`: percentage of non-empty required school profile values
- `activeIntegrations`: count of integrations with status `connected`
- `activeUsers`: count of users with status `active`
- `pendingInvites`: count of users with status `invited`
- `recentAuditEvents`: count of recent audit log rows shown in overview
- `templateHealth`: percentage of templates with status `active`

## 5) Authenticated current-user endpoint
Settings access should come from the real authenticated product user, not a settings-specific switched session. Backend should resolve the active user, their role, and their effective permissions from the real auth/session layer.

### `GET /api/auth/me`
If your platform already has a canonical current-user endpoint, reuse it. The settings module needs at least this shape:

Response:
```json
{
  "id": "settings-user-1",
  "name": "Ahmed Mostafa",
  "email": "ahmed@example.com",
  "roleId": "role-admin",
  "permissions": [
    "settings.overview.view",
    "settings.users.view",
    "settings.users.manage",
    "settings.roles.view",
    "settings.roles.manage"
  ]
}
```

Notes:
- this endpoint should reflect the real authenticated user
- permissions should be resolved from the assigned role plus any direct overrides if your auth model supports them
- audit logs should record this actual authenticated actor

## 6) Users endpoints
The Users page needs search, role filter, status filter, create, invite, edit, resend invite, password reset, and activate/deactivate.

### `GET /api/settings/users`
Query params:
- `search`
- `roleId`
- `status`
- `page`
- `limit`

Response:
```json
{
  "items": [
    {
      "id": "settings-user-1",
      "fullName": "Ahmed Mostafa",
      "email": "ahmed@example.com",
      "roleId": "role-admin",
      "roleName": "System Admin",
      "status": "active",
      "lastActiveAt": "2026-04-12T11:55:00Z",
      "invitedAt": null,
      "lastInviteSentAt": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

### `POST /api/settings/users`
Create an active user.
Request:
```json
{
  "fullName": "Nour Hassan",
  "email": "nour@example.com",
  "roleId": "role-coordinator"
}
```
Response:
```json
{
  "id": "settings-user-4",
  "fullName": "Nour Hassan",
  "email": "nour@example.com",
  "roleId": "role-coordinator",
  "status": "active",
  "lastActiveAt": "2026-04-12T12:00:00Z"
}
```

### `POST /api/settings/users/invitations`
Invite a user without activating them yet.
Request:
```json
{
  "fullName": "Nour Hassan",
  "email": "nour@example.com",
  "roleId": "role-coordinator"
}
```
Response:
```json
{
  "id": "settings-user-5",
  "fullName": "Nour Hassan",
  "email": "nour@example.com",
  "roleId": "role-coordinator",
  "status": "invited",
  "invitedAt": "2026-04-12T12:00:00Z",
  "lastInviteSentAt": "2026-04-12T12:00:00Z"
}
```

### `PATCH /api/settings/users/:id`
Request:
```json
{
  "fullName": "Ahmed Mostafa",
  "roleId": "role-it"
}
```
Response:
```json
{
  "id": "settings-user-1",
  "fullName": "Ahmed Mostafa",
  "email": "ahmed@example.com",
  "roleId": "role-it",
  "status": "active",
  "lastActiveAt": "2026-04-12T11:55:00Z"
}
```

### `POST /api/settings/users/:id/resend-invite`
Response:
```json
{
  "id": "settings-user-5",
  "status": "invited",
  "lastInviteSentAt": "2026-04-12T12:10:00Z"
}
```

### `POST /api/settings/users/:id/password-reset`
Response:
```json
{
  "id": "settings-user-1",
  "status": "queued",
  "message": "Password reset initiated."
}
```

### `PATCH /api/settings/users/:id/status`
Request:
```json
{
  "status": "inactive"
}
```
Response:
```json
{
  "id": "settings-user-1",
  "status": "inactive"
}
```

## 7) Roles and permissions endpoints
The Roles page needs role list, create, clone, edit, delete, permission catalog, and save permission matrix.

### `GET /api/settings/roles`
Response:
```json
[
  {
    "id": "role-admin",
    "name": "System Admin",
    "description": "Full administrative access across settings and operations.",
    "isSystem": true,
    "memberCount": 2,
    "permissions": [
      "settings.users.view",
      "settings.users.manage",
      "settings.roles.view",
      "settings.roles.manage"
    ]
  }
]
```

### `POST /api/settings/roles`
Request:
```json
{
  "name": "Admissions Coordinator",
  "description": "Handles admissions-related settings."
}
```
Response:
```json
{
  "id": "role-1744460000",
  "name": "Admissions Coordinator",
  "description": "Handles admissions-related settings.",
  "isSystem": false,
  "memberCount": 0,
  "permissions": []
}
```

### `POST /api/settings/roles/:id/clone`
Request:
```json
{
  "name": "Operations Coordinator Copy"
}
```
Response:
```json
{
  "id": "role-1744460100",
  "name": "Operations Coordinator Copy",
  "description": "Manages policies, templates, and profile-level settings.",
  "isSystem": false,
  "memberCount": 0,
  "permissions": [
    "settings.overview.view",
    "settings.branding.view"
  ]
}
```

### `PATCH /api/settings/roles/:id`
Request:
```json
{
  "name": "Operations Coordinator",
  "description": "Updated description"
}
```
Response:
```json
{
  "id": "role-coordinator",
  "name": "Operations Coordinator",
  "description": "Updated description",
  "isSystem": true,
  "memberCount": 3,
  "permissions": ["settings.overview.view"]
}
```

### `PUT /api/settings/roles/:id/permissions`
Request:
```json
{
  "permissions": [
    "settings.overview.view",
    "settings.branding.view",
    "settings.branding.manage"
  ]
}
```
Response:
```json
{
  "id": "role-coordinator",
  "permissions": [
    "settings.overview.view",
    "settings.branding.view",
    "settings.branding.manage"
  ]
}
```

### `DELETE /api/settings/roles/:id`
Rules:
- cannot delete `isSystem=true` roles
- cannot delete role if any user is assigned to it

Success response:
```json
{
  "ok": true
}
```

Error example:
```json
{
  "code": "role_in_use",
  "message": "Role cannot be deleted because users are assigned to it."
}
```

## 8) Branding and school profile endpoints
The Branding page edits the school profile, logo, timezone, and map-backed location.

### `GET /api/settings/school-profile`
Response:
```json
{
  "schoolName": "Moazzez International School",
  "shortName": "MIS",
  "timezone": "Africa/Cairo",
  "addressLine": "North 90 Street, New Cairo",
  "formattedAddress": "North 90 Street, Fifth Settlement, New Cairo, Cairo Governorate, Egypt",
  "city": "Cairo",
  "country": "Egypt",
  "footerSignature": "Moazzez School Management Platform",
  "logoUrl": "https://files.example.com/logo.png",
  "latitude": 30.0284,
  "longitude": 31.4913,
  "mapPlaceLabel": "Moazzez International School"
}
```

### `PUT /api/settings/school-profile`
Request:
```json
{
  "schoolName": "Moazzez International School",
  "shortName": "MIS",
  "timezone": "Africa/Cairo",
  "addressLine": "North 90 Street, New Cairo",
  "formattedAddress": "North 90 Street, Fifth Settlement, New Cairo, Cairo Governorate, Egypt",
  "city": "Cairo",
  "country": "Egypt",
  "footerSignature": "Moazzez School Management Platform",
  "logoUrl": "https://files.example.com/logo.png",
  "latitude": 30.0284,
  "longitude": 31.4913,
  "mapPlaceLabel": "Moazzez International School"
}
```
Response:
```json
{
  "schoolName": "Moazzez International School",
  "shortName": "MIS",
  "timezone": "Africa/Cairo",
  "addressLine": "North 90 Street, New Cairo",
  "formattedAddress": "North 90 Street, Fifth Settlement, New Cairo, Cairo Governorate, Egypt",
  "city": "Cairo",
  "country": "Egypt",
  "footerSignature": "Moazzez School Management Platform",
  "logoUrl": "https://files.example.com/logo.png",
  "latitude": 30.0284,
  "longitude": 31.4913,
  "mapPlaceLabel": "Moazzez International School"
}
```

### `POST /api/settings/school-profile/logo`
Recommended if backend owns file storage.
`Content-Type: multipart/form-data`

Form field:
- `file`

Response:
```json
{
  "logoUrl": "https://files.example.com/settings/logo-2026-04-12.png"
}
```

### `GET /api/settings/location/search?query=...`
Response:
```json
[
  {
    "id": "loc-new-cairo-90",
    "label": "North 90 Street, New Cairo",
    "formattedAddress": "North 90 Street, Fifth Settlement, New Cairo, Cairo Governorate, Egypt",
    "city": "Cairo",
    "country": "Egypt",
    "latitude": 30.0284,
    "longitude": 31.4913
  }
]
```

### `GET /api/settings/location/reverse?latitude=30.0284&longitude=31.4913`
Response:
```json
{
  "label": "North 90 Street, New Cairo",
  "formattedAddress": "North 90 Street, Fifth Settlement, New Cairo, Cairo Governorate, Egypt",
  "addressLine": "North 90 Street, Fifth Settlement",
  "city": "Cairo",
  "country": "Egypt",
  "latitude": 30.0284,
  "longitude": 31.4913
}
```

## 9) Policies endpoints
The Policies page saves attendance, grades, and behavior policies as one document.

### `GET /api/settings/policies`
Response:
```json
{
  "attendance": {
    "absenceThreshold": 3,
    "lateThresholdMinutes": 10,
    "lockTime": "09:00",
    "guardianAlertEnabled": true,
    "portalAbsenceVisible": true
  },
  "grades": {
    "passingScore": 50,
    "publishApprovalRequired": true,
    "allowTeacherDrafts": true,
    "weightingLockedAfterPublish": true
  },
  "behavior": {
    "incidentThreshold": 4,
    "suspensionRequiresApproval": true,
    "guardianNotificationEnabled": true,
    "studentPortalVisibility": false
  }
}
```

### `PUT /api/settings/policies`
Request:
```json
{
  "attendance": {
    "absenceThreshold": 3,
    "lateThresholdMinutes": 10,
    "lockTime": "09:00",
    "guardianAlertEnabled": true,
    "portalAbsenceVisible": true
  },
  "grades": {
    "passingScore": 50,
    "publishApprovalRequired": true,
    "allowTeacherDrafts": true,
    "weightingLockedAfterPublish": true
  },
  "behavior": {
    "incidentThreshold": 4,
    "suspensionRequiresApproval": true,
    "guardianNotificationEnabled": true,
    "studentPortalVisibility": false
  }
}
```
Response:
```json
{
  "attendance": {
    "absenceThreshold": 3,
    "lateThresholdMinutes": 10,
    "lockTime": "09:00",
    "guardianAlertEnabled": true,
    "portalAbsenceVisible": true
  },
  "grades": {
    "passingScore": 50,
    "publishApprovalRequired": true,
    "allowTeacherDrafts": true,
    "weightingLockedAfterPublish": true
  },
  "behavior": {
    "incidentThreshold": 4,
    "suspensionRequiresApproval": true,
    "guardianNotificationEnabled": true,
    "studentPortalVisibility": false
  }
}
```

Validation rules:
- attendance numbers cannot be negative
- `passingScore` must be between 0 and 100

## 10) Admissions document settings endpoints
This page manages the global admissions required document list used by admissions application creation.

### `GET /api/settings/admissions/document-requirements`
Response:
```json
[
  {
    "id": "birth-certificate",
    "nameEn": "Birth Certificate",
    "nameAr": "شهادة الميلاد",
    "required": true,
    "active": true,
    "sortOrder": 1
  }
]
```

### `PUT /api/settings/admissions/document-requirements`
The current UI edits the entire ordered collection at once, not single rows independently.

Request:
```json
[
  {
    "id": "birth-certificate",
    "nameEn": "Birth Certificate",
    "nameAr": "شهادة الميلاد",
    "required": true,
    "active": true,
    "sortOrder": 1
  },
  {
    "id": "passport-copy",
    "nameEn": "Passport Copy",
    "nameAr": "نسخة جواز السفر",
    "required": true,
    "active": true,
    "sortOrder": 2
  }
]
```
Response:
```json
[
  {
    "id": "birth-certificate",
    "nameEn": "Birth Certificate",
    "nameAr": "شهادة الميلاد",
    "required": true,
    "active": true,
    "sortOrder": 1
  },
  {
    "id": "passport-copy",
    "nameEn": "Passport Copy",
    "nameAr": "نسخة جواز السفر",
    "required": true,
    "active": true,
    "sortOrder": 2
  }
]
```

Validation rules:
- `nameEn` and `nameAr` cannot be blank
- among `active=true` rows, English names must be unique case-insensitively
- among `active=true` rows, Arabic names must be unique case-insensitively
- backend should normalize `sortOrder` based on final array order

## 11) Notification templates endpoints
The Templates page reads templates, edits a template, and runs a test send.

### `GET /api/settings/templates`
Response:
```json
[
  {
    "id": "template-attendance-alert",
    "key": "attendance_alert",
    "name": "Attendance Alert",
    "status": "active",
    "variables": ["student_name", "date", "status"],
    "channelStates": [
      { "channel": "email", "enabled": true },
      { "channel": "sms", "enabled": true },
      { "channel": "in_app", "enabled": true }
    ],
    "template": {
      "title": "Attendance alert",
      "titleAr": "تنبيه حضور",
      "message": "Attendance alert for {{student_name}} on {{date}}.",
      "messageAr": "...",
      "emailSubject": "Attendance alert",
      "emailSubjectAr": "...",
      "smsMessage": "{{student_name}} was marked {{status}} on {{date}}.",
      "smsMessageAr": "...",
      "channels": ["email", "sms", "in_app"],
      "priority": "high",
      "stage": "documents_pending"
    },
    "lastTestAt": "2026-04-12T11:00:00Z"
  }
]
```

### `GET /api/settings/templates/:id`
Return one template with the same shape.

### `PUT /api/settings/templates/:id`
Request:
```json
{
  "id": "template-attendance-alert",
  "key": "attendance_alert",
  "name": "Attendance Alert",
  "status": "active",
  "variables": ["student_name", "date", "status"],
  "channelStates": [
    { "channel": "email", "enabled": true },
    { "channel": "sms", "enabled": true },
    { "channel": "in_app", "enabled": false }
  ],
  "template": {
    "title": "Attendance alert",
    "titleAr": "تنبيه حضور",
    "message": "Attendance alert for {{student_name}} on {{date}}.",
    "messageAr": "...",
    "emailSubject": "Attendance alert",
    "emailSubjectAr": "...",
    "smsMessage": "{{student_name}} was marked {{status}} on {{date}}.",
    "smsMessageAr": "...",
    "channels": ["email", "sms"],
    "priority": "high",
    "stage": "documents_pending"
  }
}
```
Response:
```json
{
  "id": "template-attendance-alert",
  "status": "active",
  "lastTestAt": "2026-04-12T11:00:00Z"
}
```

### `POST /api/settings/templates/:id/test`
Request:
```json
{
  "testRecipient": "ahmed@example.com"
}
```
Response:
```json
{
  "id": "template-attendance-alert",
  "lastTestAt": "2026-04-12T12:15:00Z",
  "status": "queued"
}
```

## 12) Integrations endpoints
The Integrations page lists providers, opens one integration for configuration, saves config, and runs connection tests.

### `GET /api/settings/integrations`
List response should avoid exposing raw secrets. Password-type values should be masked.

Response:
```json
[
  {
    "id": "integration-email",
    "provider": "Email SMTP",
    "category": "Email",
    "status": "connected",
    "description": "Transactional and bulk email delivery provider.",
    "lastCheckedAt": "2026-04-12T10:00:00Z",
    "lastTestAt": "2026-04-12T10:00:00Z",
    "lastSyncAt": "2026-04-12T09:55:00Z",
    "healthNote": "Healthy",
    "fields": [
      { "key": "host", "label": "SMTP Host", "type": "text", "required": true },
      { "key": "username", "label": "Username", "type": "email", "required": true },
      { "key": "password", "label": "Password", "type": "password", "required": true }
    ],
    "configuration": {
      "providerId": "integration-email",
      "values": {
        "host": "smtp.example.com",
        "username": "notifications@example.com",
        "password": "********word"
      },
      "updatedAt": "2026-04-12T09:50:00Z"
    }
  }
]
```

### `GET /api/settings/integrations/:id`
This endpoint is used to populate the configuration modal. Backend may return real values, or masked values plus secret-preservation rules.

Response:
```json
{
  "id": "integration-email",
  "provider": "Email SMTP",
  "category": "Email",
  "status": "connected",
  "description": "Transactional and bulk email delivery provider.",
  "lastCheckedAt": "2026-04-12T10:00:00Z",
  "lastTestAt": "2026-04-12T10:00:00Z",
  "lastSyncAt": "2026-04-12T09:55:00Z",
  "healthNote": "Healthy",
  "fields": [
    { "key": "host", "label": "SMTP Host", "type": "text", "required": true },
    { "key": "username", "label": "Username", "type": "email", "required": true },
    { "key": "password", "label": "Password", "type": "password", "required": true }
  ],
  "configuration": {
    "providerId": "integration-email",
    "values": {
      "host": "smtp.example.com",
      "username": "notifications@example.com",
      "password": "super-secret-password"
    },
    "updatedAt": "2026-04-12T09:50:00Z"
  }
}
```

### `PUT /api/settings/integrations/:id/configuration`
Request:
```json
{
  "values": {
    "host": "smtp.example.com",
    "username": "notifications@example.com",
    "password": "super-secret-password"
  }
}
```
Response:
```json
{
  "id": "integration-email",
  "status": "connected",
  "lastCheckedAt": "2026-04-12T12:20:00Z",
  "configuration": {
    "providerId": "integration-email",
    "values": {
      "host": "smtp.example.com",
      "username": "notifications@example.com",
      "password": "********word"
    },
    "updatedAt": "2026-04-12T12:20:00Z"
  }
}
```

### `POST /api/settings/integrations/:id/test`
Response:
```json
{
  "id": "integration-email",
  "status": "connected",
  "lastCheckedAt": "2026-04-12T12:22:00Z",
  "lastTestAt": "2026-04-12T12:22:00Z",
  "healthNote": "Connection test succeeded."
}
```

## 13) Security and audit endpoints
The Security page edits security controls and lists audit entries with search and severity filters.

### `GET /api/settings/security`
Response:
```json
{
  "enforceTwoFactor": true,
  "ipAllowlistEnabled": false,
  "ipAllowlist": "",
  "sessionTimeoutMinutes": 30,
  "suspiciousLoginAlerts": true,
  "passwordMinLength": 10,
  "passwordRotationDays": 90
}
```

### `PUT /api/settings/security`
Request:
```json
{
  "enforceTwoFactor": true,
  "ipAllowlistEnabled": true,
  "ipAllowlist": "10.0.0.0/24,192.168.1.10",
  "sessionTimeoutMinutes": 30,
  "suspiciousLoginAlerts": true,
  "passwordMinLength": 10,
  "passwordRotationDays": 90
}
```
Response:
```json
{
  "enforceTwoFactor": true,
  "ipAllowlistEnabled": true,
  "ipAllowlist": "10.0.0.0/24,192.168.1.10",
  "sessionTimeoutMinutes": 30,
  "suspiciousLoginAlerts": true,
  "passwordMinLength": 10,
  "passwordRotationDays": 90
}
```

### `GET /api/settings/audit-logs`
Query params:
- `search`
- `severity`
- `limit`
- `page`

Response:
```json
{
  "items": [
    {
      "id": "audit-1",
      "actor": "Ahmed Mostafa",
      "action": "Updated grading policy thresholds",
      "module": "Policies",
      "entity": "grades-policy",
      "timestamp": "2026-04-12T09:30:00Z",
      "severity": "warning",
      "ipAddress": "10.0.0.24"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

## 14) Backup, export, import, migration endpoints
The Backup page lists history and triggers actions for backup, export, import, and migration.

### `GET /api/settings/backups/history`
Response:
```json
{
  "items": [
    {
      "id": "backup-1",
      "type": "backup",
      "status": "completed",
      "fileName": "settings-backup-2026-04-12.json",
      "createdAt": "2026-04-12T04:00:00Z",
      "createdBy": "Ahmed Mostafa",
      "note": "Nightly settings snapshot"
    }
  ]
}
```

### `POST /api/settings/backups`
Request:
```json
{
  "type": "backup",
  "note": "Manual backup from settings center"
}
```
Response:
```json
{
  "id": "backup-1744460400",
  "type": "backup",
  "status": "running",
  "fileName": "backup-2026-04-12.json",
  "createdAt": "2026-04-12T12:30:00Z",
  "createdBy": "Ahmed Mostafa",
  "note": "Manual backup from settings center"
}
```

### `POST /api/settings/backups/export`
Request:
```json
{
  "note": "Exported settings snapshot"
}
```
Response:
```json
{
  "id": "backup-1744460500",
  "type": "export",
  "status": "running",
  "fileName": "settings-export-2026-04-12.json",
  "createdAt": "2026-04-12T12:35:00Z",
  "createdBy": "Ahmed Mostafa",
  "note": "Exported settings snapshot"
}
```

### `POST /api/settings/backups/import`
Request:
```json
{
  "note": "Imported settings snapshot",
  "fileId": "uploaded-file-id"
}
```
Response:
```json
{
  "id": "backup-1744460600",
  "type": "import",
  "status": "running",
  "fileName": "settings-import-2026-04-12.json",
  "createdAt": "2026-04-12T12:40:00Z",
  "createdBy": "Ahmed Mostafa",
  "note": "Imported settings snapshot"
}
```

### `POST /api/settings/backups/migration`
Request:
```json
{
  "note": "Migration dry-run prepared"
}
```
Response:
```json
{
  "id": "backup-1744460700",
  "type": "migration",
  "status": "running",
  "fileName": "migration-2026-04-12.json",
  "createdAt": "2026-04-12T12:45:00Z",
  "createdBy": "Ahmed Mostafa",
  "note": "Migration dry-run prepared"
}
```

## 15) Recommended audit logging behavior
Every mutating endpoint should write a `settings_audit_logs` row with:
- actor
- action
- module
- entity
- severity
- ipAddress
- timestamp

Suggested severity defaults:
- `info`: view-safe operational updates, invites resent, template tests
- `warning`: settings changes, role edits, integration updates, backup jobs
- `critical`: security control changes or high-risk security actions

## 16) Important implementation notes

### A. Session switcher is out of scope
The current frontend contains a local helper for permission testing, but it is not a real product feature. Backend should not implement settings-specific user switching or impersonation for this module handoff. Use the real authenticated user and role context instead.

### B. Integrations should not leak secrets in list responses
The current frontend masks password fields in integration list responses but requests one integration in detail when opening the config modal. Backend should either:
- return masked values in list responses and real values in detail responses, or
- return masked values everywhere and support keep-existing-secret semantics when a password field is omitted or unchanged

### C. Admissions document settings are saved as a full ordered collection
The UI does not currently save one document row at a time. It edits the whole list, reorders it, and then saves the normalized array. A collection-level `PUT` is the cleanest backend contract.

### D. Branding logo handling should be server-owned
The current frontend currently reads logo files locally and can store them as data URLs in mock state. Backend should prefer a real file upload flow and return a stable `logoUrl`.

### E. Location search can be backend-proxied or external
The current frontend uses a location provider adapter. Backend can either provide:
- a proxy search and reverse-geocode API, or
- signed frontend access to a map provider

The branding page needs both search suggestions and reverse geocoding of selected coordinates.

### F. Exports are currently client-side
The current frontend exports visible data from already-loaded records. Backend does not need separate export endpoints for parity. The data endpoints above are enough.

## 17) Suggested implementation order
1. permissions catalog and authenticated current-user endpoint
2. users and roles endpoints
3. school profile and location endpoints
4. policy settings
5. admissions document requirements
6. templates
7. integrations
8. security and audit log
9. backup and migration history
10. overview metrics

## 18) Minimum backend contract if you want the fastest usable version
If backend wants a minimal first release, implement these first:
- `GET /api/auth/me`
- `GET /api/settings/permissions/catalog`
- `GET /api/settings/users`
- `POST /api/settings/users`
- `POST /api/settings/users/invitations`
- `PATCH /api/settings/users/:id`
- `PATCH /api/settings/users/:id/status`
- `GET /api/settings/roles`
- `POST /api/settings/roles`
- `PATCH /api/settings/roles/:id`
- `PUT /api/settings/roles/:id/permissions`
- `GET /api/settings/school-profile`
- `PUT /api/settings/school-profile`
- `GET /api/settings/policies`
- `PUT /api/settings/policies`
- `GET /api/settings/admissions/document-requirements`
- `PUT /api/settings/admissions/document-requirements`
- `GET /api/settings/templates`
- `PUT /api/settings/templates/:id`
- `POST /api/settings/templates/:id/test`
- `GET /api/settings/integrations`
- `GET /api/settings/integrations/:id`
- `PUT /api/settings/integrations/:id/configuration`
- `POST /api/settings/integrations/:id/test`
- `GET /api/settings/security`
- `PUT /api/settings/security`
- `GET /api/settings/audit-logs`
- `GET /api/settings/backups/history`
- `POST /api/settings/backups`
- `POST /api/settings/backups/export`
- `POST /api/settings/backups/import`
- `POST /api/settings/backups/migration`
- `GET /api/settings/overview/metrics`
