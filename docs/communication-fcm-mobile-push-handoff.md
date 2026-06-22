# Communication FCM Mobile Push Handoff

## Summary

Communication Phase C adds Firebase Cloud Messaging as an app/mobile push transport for Communication notifications. The in-app notification center remains the source of truth: FCM payloads are small wake/deep-link hints, and clients must fetch details through authenticated app APIs after opening a push.

Backend baseline:

- Sprint 30A decision lock: complete.
- Sprint 30B device token registry: complete.
- Sprint 30C Firebase provider foundation: complete.
- Sprint 30D push worker integration: complete.
- Sprint 30E push preferences and app handoff: complete.

Communication push is FCM-only in this phase. SMS and email channels are not part of Communication push delivery.

## Environment Expectations

The server sends push through Firebase Admin SDK credentials.

Preferred production credential mode:

- `GOOGLE_APPLICATION_CREDENTIALS` points to a secure service-account JSON file outside the repository.

Optional environment credential mode:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Runtime flags:

- `FCM_ENABLED`
- `FCM_DRY_RUN`

Local and automated tests should normally use:

- `FCM_ENABLED=false`
- `FCM_DRY_RUN=true`

Node runtime note:

- The backend runtime must satisfy the installed Firebase Admin SDK requirement. Sprint 30C installed `firebase-admin@14`, which requires Node 22 or newer.

Never commit service account JSON, private keys, Firebase API keys, FCM registration tokens, or generated client Firebase configuration into the backend repository.

## Mobile Token Lifecycle

Mobile clients should manage FCM registration tokens as credentials bound to the authenticated app user.

On login:

- Obtain the current FCM registration token from the client SDK.
- Register it with the backend device-token endpoint for the current app surface.

On FCM token refresh:

- Call the register endpoint again with the new token.
- The backend deduplicates by token hash within current school, current user, and app surface.

On logout:

- Call the unregister endpoint for the current token.
- Token-based unregister is preferred because the FCM token is the credential being revoked.

On app reinstall or local data reset:

- Treat the token as potentially changed.
- Register the latest token after login.

Backend cleanup:

- Invalid or unregistered provider errors deactivate stale device tokens.
- Tokens are not deleted by default.

## Device Token Endpoints

Parent:

- `POST /api/v1/parent/notifications/device-tokens`
- `DELETE /api/v1/parent/notifications/device-tokens/current`

Student:

- `POST /api/v1/student/notifications/device-tokens`
- `DELETE /api/v1/student/notifications/device-tokens/current`

Teacher:

- `POST /api/v1/teacher/notifications/device-tokens`
- `DELETE /api/v1/teacher/notifications/device-tokens/current`

Register body:

```json
{
  "token": "fcm-registration-token",
  "platform": "android",
  "deviceId": "optional-client-device-id",
  "appVersion": "1.0.0",
  "locale": "en-US",
  "timezone": "Africa/Cairo"
}
```

Allowed `platform` values:

- `android`
- `ios`
- `web`

Unregister body:

```json
{
  "token": "fcm-registration-token",
  "deviceId": "optional-client-device-id"
}
```

At least one of `token` or `deviceId` is required. Token is preferred. If both are supplied, both must match the current actor, current school, and current app surface.

Device-token responses never return:

- raw token
- token hash
- token ciphertext
- schoolId
- userId
- membershipId
- roleId
- organizationId
- provider metadata

Parent and Student token responses keep dual camelCase and snake_case aliases. Teacher token responses are camelCase only.

## Preference Endpoints

Parent:

- `GET /api/v1/parent/notifications/preferences`
- `PATCH /api/v1/parent/notifications/preferences`

Student:

- `GET /api/v1/student/notifications/preferences`
- `PATCH /api/v1/student/notifications/preferences`

Teacher:

- `GET /api/v1/teacher/notifications/preferences`
- `PATCH /api/v1/teacher/notifications/preferences`

Supported categories:

- `message_received`
- `announcement`

Preference response behavior:

- Parent and Student include `inAppEnabled`, `in_app_enabled`, `pushEnabled`, and `push_enabled`.
- Teacher includes `inAppEnabled` and `pushEnabled` only.

Patch body:

```json
{
  "preferences": [
    {
      "category": "message_received",
      "inAppEnabled": true,
      "pushEnabled": false
    },
    {
      "category": "announcement",
      "in_app_enabled": true,
      "push_enabled": true
    }
  ]
}
```

Backward compatibility:

- Existing clients that only send `inAppEnabled` remain valid.
- Omitting `inAppEnabled` preserves the current value, or defaults to `true` for a new row.
- Omitting `pushEnabled` preserves the current value, or defaults to `true` for a new row.
- Missing preference rows behave as `inAppEnabled=true` and `pushEnabled=true`.

Behavior:

- `inAppEnabled=false` means no `CommunicationNotification` row is created and no push is sent.
- `pushEnabled=false` means the in-app notification is still created, realtime notification-created behavior remains, and Firebase push is skipped.
- For push-disabled recipients, the backend records a skipped internal PUSH delivery with safe code `push/preference-disabled`.

## Push Payload Contract

Display notification:

```json
{
  "title": "New message",
  "body": "Message preview"
}
```

Data payload may include:

- `notificationId`
- `type`
- `sourceModule`
- `deepLinkType`
- `conversationId` when applicable
- `messageId` when applicable
- `announcementId` when applicable

Data values are strings.

Payloads must not include:

- schoolId
- organizationId
- userId
- membershipId
- roleId
- recipientUserId
- actorUserId
- senderUserId
- participant ids
- guardianId
- studentGuardianId
- enrollmentId
- teacherAllocationId
- deviceTokenId
- FCM token
- tokenHash
- tokenCiphertext
- bucket
- objectKey
- storageKey
- signedUrl
- raw metadata
- provider metadata
- queue metadata
- stack traces
- internal errors

Client behavior:

- Treat push as a wake/deep-link hint.
- On tap/open, call authenticated app APIs to fetch notification, conversation, message, or announcement details.
- If optional deep-link fields are missing, open the notification center.
- Never expect signed URLs in JSON push payloads.

## Testing And Staging

Local and automated tests should not make real Firebase network calls.

Recommended local/test settings:

- `FCM_ENABLED=false`
- `FCM_DRY_RUN=true`

Real Firebase sending should be tested only in controlled staging with real credentials and test devices.

## Out Of Scope

Still separate from this Communication FCM contract:

- SMS delivery
- email delivery inside Communication
- browser service-worker implementation
- Google Maps
- delivery receipts or double-grey checks
- pin, mute, clear, or export conversation actions
- media transcoding, video previews, thumbnails, waveforms, or duration extraction
- mentions parser
- read-by grouping
- online status or exact lastSeen expansion
