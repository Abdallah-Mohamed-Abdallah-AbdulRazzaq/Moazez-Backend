# Settings Backend Models

## 1. User Settings Response

```json
{
  "pushNotifications": true,
  "assignmentAlerts": true,
  "attendanceAlerts": true,
  "messagePreview": false,
  "compactCards": true,
  "autoSync": true,
  "language": "ar",
  "calendarView": "daily | weekly"
}
```

## 2. Privacy Settings Response

```json
{
  "biometricEnabled": false,
  "hideMessagePreview": true,
  "allowDownloadOnMobile": true
}
```

## 3. Legal Document

```json
{
  "key": "privacy_policy | terms_conditions",
  "title": "string",
  "subtitle": "string",
  "lastUpdated": "2026-03-01",
  "sections": [
    {
      "title": "string",
      "points": ["string"]
    }
  ]
}
```

## 4. FAQ Category

```json
{
  "title": "string",
  "subtitle": "string",
  "iconKey": "string",
  "points": ["string"]
}
```

## 5. Support Channel

```json
{
  "type": "email | phone | ticket",
  "title": "string",
  "subtitle": "string",
  "value": "string"
}
```

## 6. App Info

```json
{
  "appName": "معزز",
  "appType": "تطبيق المعلم",
  "version": "1.0.0",
  "teamName": "فريق معزز",
  "description": "string",
  "supportEmail": "support@moazez.sa",
  "supportPhone": "9200 000 00"
}
```

## 7. App Rating Request

```json
{
  "rating": 4,
  "topic": "سهولة الاستخدام",
  "note": "string | null"
}
```

## 8. Preferred Endpoints

```text
GET  /teacher/settings
PUT  /teacher/settings
GET  /teacher/settings/privacy
PUT  /teacher/settings/privacy
GET  /teacher/settings/legal/privacy-policy
GET  /teacher/settings/legal/terms-conditions
GET  /teacher/settings/help-center
GET  /teacher/settings/contact
GET  /teacher/settings/about
POST /teacher/settings/app-rating
POST /teacher/settings/support-ticket
```

## 9. Notes

- Feature `settings` هنا يغطي أيضًا: الخصوصية، المساعدة، الدعم، التواصل، عن التطبيق، والتقييم.
- الصفحات القانونية والمساعدة يفضل أن تكون CMS-driven من الباك اند.
