# STU-PERM-1E - Communication / Notifications / Profile Action Permissions Closeout

## Sprint Name

STU-PERM-1E - Communication / Notifications / Profile Action Permissions

## Baseline Commit

Expected baseline:

```text
e0d1ca61 feat: enforce student reinforcement action permissions
```

Actual starting HEAD matched the expected baseline:

```text
e0d1ca61 feat: enforce student reinforcement action permissions
```

## Files Changed

```text
src/modules/student-app/profile/controller/student-profile.controller.ts
src/modules/student-app/messages/controller/student-messages.controller.ts
src/modules/student-app/announcements/controller/student-announcements.controller.ts
src/modules/student-app/notifications/controller/student-notifications.controller.ts
test/security/tenancy.student-app.spec.ts
docs/sprint-stu-perm-1e-communication-notifications-profile-action-permissions-closeout.md
```

No permission seeds, Prisma schema, migrations, common guards/decorators, Student App access/shared/application/infrastructure/presenter files, IAM files, Files module files, package files, or environment files were changed.

## Controllers Updated

Updated only the Student App controllers in this sprint scope:

```text
src/modules/student-app/profile/controller/student-profile.controller.ts
src/modules/student-app/messages/controller/student-messages.controller.ts
src/modules/student-app/announcements/controller/student-announcements.controller.ts
src/modules/student-app/notifications/controller/student-notifications.controller.ts
```

The changes add route permission metadata only. Controller method bodies, DTOs, response contracts, ownership checks, use cases, file handling, and persistence behavior were not changed.

## Profile Action Permissions Added

```text
POST /api/v1/student/profile/avatar
handler: uploadAvatar
permission: student.profile.avatar.manage

DELETE /api/v1/student/profile/avatar
handler: deleteAvatar
permission: student.profile.avatar.manage

POST /api/v1/student/profile/correction-requests
handler: submitCorrectionRequest
permission: student.profile.correction_requests.create

POST /api/v1/student/profile/correction-requests/:requestId/cancel
handler: cancelCorrectionRequest
permission: student.profile.correction_requests.cancel
```

The sprint uses narrow app-facing `student.profile.*` permissions. It does not use `students.records.manage`, `students.documents.manage`, or `students.medical.manage`.

Read-only profile route decorators from STU-PERM-1B remain unchanged.

## Message / Conversation Action Permissions Added

```text
POST /api/v1/student/messages/conversations
handler: createConversation
permission: communication.conversations.create

POST /api/v1/student/messages/conversations/:conversationId/messages
handler: sendMessage
permission: communication.messages.send

POST /api/v1/student/messages/conversations/:conversationId/read
handler: markRead
permission: communication.conversations.read
```

The sprint keeps message send route-level authorization at `communication.messages.send`. It does not add broad/admin communication permissions and does not require attachment management unconditionally for text-only sends.

Read-only message route decorators and shared file upload/download permissions remain unchanged.

## Announcement Action Permission Added

```text
POST /api/v1/student/announcements/:announcementId/read
handler: markRead
permission: communication.announcements.read
```

This is only a student self-service read-marker action. It does not use `communication.announcements.manage`.

Read-only announcement route decorators from STU-PERM-1B remain unchanged.

## Notification / Preferences / Device-Token Action Permissions Added

```text
POST /api/v1/student/notifications/read-all
handler: markAllRead
permission: communication.notifications.read

PATCH /api/v1/student/notifications/preferences
handler: updatePreferences
permission: communication.notifications.preferences.manage

POST /api/v1/student/notifications/device-tokens
handler: registerDeviceToken
permission: app.device_tokens.manage

DELETE /api/v1/student/notifications/device-tokens/current
handler: unregisterCurrentDeviceToken
permission: app.device_tokens.manage

POST /api/v1/student/notifications/:notificationId/read
handler: markRead
permission: communication.notifications.read

POST /api/v1/student/notifications/:notificationId/archive
handler: archive
permission: communication.notifications.archive
```

The sprint uses narrow notification self-service permissions. It does not use `communication.notifications.manage`.

Read-only notification route decorators from STU-PERM-1B remain unchanged.

## Routes Intentionally Left For 1F

No remaining Student App permission-decorator implementation routes are intentionally left for STU-PERM-1F. The follow-up sprint should be a final security closeout and regression audit.

Routes already covered by STU-PERM-1B, STU-PERM-1C, and STU-PERM-1D were not modified.

## Tests Added/Updated

Updated:

```text
test/security/tenancy.student-app.spec.ts
```

Added a static metadata inventory for all 14 STU-PERM-1E handlers:

```text
uploadAvatar -> student.profile.avatar.manage
deleteAvatar -> student.profile.avatar.manage
submitCorrectionRequest -> student.profile.correction_requests.create
cancelCorrectionRequest -> student.profile.correction_requests.cancel
createConversation -> communication.conversations.create
sendMessage -> communication.messages.send
StudentMessagesController.markRead -> communication.conversations.read
StudentAnnouncementsController.markRead -> communication.announcements.read
markAllRead -> communication.notifications.read
updatePreferences -> communication.notifications.preferences.manage
registerDeviceToken -> app.device_tokens.manage
unregisterCurrentDeviceToken -> app.device_tokens.manage
StudentNotificationsController.markRead -> communication.notifications.read
archive -> communication.notifications.archive
```

Added runtime missing-permission coverage using the existing no-permission student role fixture:

```text
student.profile.avatar.manage -> profile avatar delete returns 403 auth.scope.missing
student.profile.correction_requests.create -> correction request create returns 403 auth.scope.missing
student.profile.correction_requests.cancel -> correction request cancel returns 403 auth.scope.missing
communication.conversations.create -> conversation create returns 403 auth.scope.missing
communication.messages.send -> message send returns 403 auth.scope.missing
communication.conversations.read -> conversation mark-read returns 403 auth.scope.missing
communication.announcements.read -> announcement mark-read returns 403 auth.scope.missing
communication.notifications.read -> notification read-all returns 403 auth.scope.missing
communication.notifications.archive -> notification archive returns 403 auth.scope.missing
communication.notifications.preferences.manage -> notification preferences update returns 403 auth.scope.missing
app.device_tokens.manage -> device token register returns 403 auth.scope.missing
```

Existing Student App security/e2e coverage continues to prove normal seeded student happy paths and safe hidden-resource behavior for conversations, announcements, and device-token self-service flows.

## Verification Commands And Results

```text
git status --short --untracked-files=all
```

Initial result: clean working tree.

```text
git log --oneline -10
```

Initial HEAD matched `e0d1ca61 feat: enforce student reinforcement action permissions`.

```text
npx prisma validate
```

Result: passed. Prisma schema is valid.

```text
npm run build
```

Result: passed.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
```

Result: passed.

```text
Test Suites: 1 passed, 1 total
Tests:       32 passed, 32 total
Snapshots:   0 total
```

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts
```

Result: passed.

```text
Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
Snapshots:   0 total
```

Final git hygiene commands were run after this document was added.

## No-Leak / Behavior Preservation Notes

The sprint adds only `@RequiredPermissions()` metadata to profile, message/conversation, announcement, notification, preferences, and device-token action handlers.

Permission checks remain additive:

```text
JwtAuthGuard authenticates the actor.
ScopeResolverGuard resolves active school membership and membership permissions.
PermissionsGuard now enforces profile/communication/notification action permissions on decorated handlers.
StudentAppAccessService still resolves the linked student and active enrollment.
Use cases still enforce ownership, visibility, school scope, participant checks, audience checks, actor-local notification checks, device-token surface checks, and safe not-found behavior.
```

No presenters, DTOs, use cases, repositories, response contracts, file flows, or no-leak response shapes were changed. This sprint does not expose storage bucket names, object keys, raw signed URLs, actor internals, membership IDs, role IDs, deleted fields, password hashes, tenant internals, raw device-token material, notification routing internals, or message moderation/admin internals.

## Known Follow-Up Sprint

```text
STU-PERM-1F - Final Security Closeout + Regression Audit
```

## Final Verdict

```text
READY FOR REVIEW
```
