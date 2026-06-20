# Sprint 28D — App-facing Notification Center + notification.created realtime Closeout

## Executive Summary

Sprint 28D adds the V1 app-facing Communication Notification Center for Parent, Student, and Teacher apps and closes the realtime `communication.notification.created` gap for queue-backed announcement notification generation.

The implementation keeps core `/api/v1/communication/notifications` behavior backward-compatible, adds actor-scoped app routes, and emits realtime notification-created events only after notification rows are persisted.

## Baseline

- Baseline commit: `58bd034`
- Baseline message: `feat: enrich communication conversation lists`
- Phase: Phase 3 — Communication Feature Family
- Sprint: Sprint 28D — App-facing Notification Center + notification.created realtime
- Schema/migration: none
- Route prefix changes: none
- Commit: none

## Runtime Files Changed

- Core notification/realtime:
  - `src/modules/communication/application/communication-app-notification-center.service.ts`
  - `src/modules/communication/application/communication-notification-generation.service.ts`
  - `src/modules/communication/application/communication-realtime-events.service.ts`
  - `src/modules/communication/infrastructure/communication-notification-generation.repository.ts`
  - `src/modules/communication/infrastructure/communication-notification.repository.ts`
  - `src/modules/communication/presenters/communication-app-notification.presenter.ts`
  - `src/modules/communication/communication.module.ts`
- Parent app notifications:
  - `src/modules/parent-app/notifications/**`
  - `src/modules/parent-app/parent-app.module.ts`
- Student app notifications:
  - `src/modules/student-app/notifications/**`
  - `src/modules/student-app/student-app.module.ts`
- Teacher app notifications:
  - `src/modules/teacher-app/notifications/**`
  - `src/modules/teacher-app/teacher-app.module.ts`
- Security expectations updated for the now-intentional app notification routes and realtime emission:
  - `test/security/tenancy.communication.spec.ts`
  - `test/security/tenancy.parent-app.spec.ts`
  - `test/security/tenancy.student-app.spec.ts`
  - `test/security/tenancy.academics.spec.ts`

## Tests Added/Updated

- Added app-safe notification presenter tests.
- Added app notification center service tests.
- Added realtime notification-created event tests.
- Updated announcement notification generation service/repository tests for persisted notification records and realtime emission.
- Added Parent, Student, and Teacher notification use-case tests.
- Updated security specs that previously treated app notification routes/realtime notification-created as out of scope.

## App-facing Notification Routes

Parent routes:

- `GET /api/v1/parent/notifications`
- `GET /api/v1/parent/notifications/summary`
- `GET /api/v1/parent/notifications/:notificationId`
- `POST /api/v1/parent/notifications/:notificationId/read`
- `POST /api/v1/parent/notifications/read-all`
- `POST /api/v1/parent/notifications/:notificationId/archive`

Student routes:

- `GET /api/v1/student/notifications`
- `GET /api/v1/student/notifications/summary`
- `GET /api/v1/student/notifications/:notificationId`
- `POST /api/v1/student/notifications/:notificationId/read`
- `POST /api/v1/student/notifications/read-all`
- `POST /api/v1/student/notifications/:notificationId/archive`

Teacher routes:

- `GET /api/v1/teacher/notifications`
- `GET /api/v1/teacher/notifications/summary`
- `GET /api/v1/teacher/notifications/:notificationId`
- `POST /api/v1/teacher/notifications/:notificationId/read`
- `POST /api/v1/teacher/notifications/read-all`
- `POST /api/v1/teacher/notifications/:notificationId/archive`

App-facing routes never accept `recipientUserId`; recipient ownership is derived only from the authenticated app actor.

## Notification List Contract

Parent and Student list responses use camelCase plus snake_case aliases:

- `notifications`
- `pagination`
- `summary.unreadCount`
- `summary.unread_count`

Each notification card includes safe app fields only: notification id, type, source module/id, title, body, priority, status, read/archive timestamps, created timestamp, and a sanitized deep link.

Teacher list responses use the existing Teacher app camelCase style.

## Notification Summary Contract

The V1 summary is intentionally small:

- `unreadCount`
- `unread_count` for Parent and Student only

The count is actor-owned and current-school scoped.

## Notification Detail Contract

Detail responses reuse the same safe notification presenter as list responses. They do not expose delivery rows, recipient user ids, school ids, membership ids, role ids, queue metadata, or raw metadata.

## Mark Read / Read All / Archive Contract

App-facing actions are actor-owned:

- Mark one read requires the notification to belong to the current app actor.
- Mark all read applies only to the current app actor.
- Archive applies only to the current app actor.
- Same-school other-user and cross-school guessed ids are rejected through the same ownership path.

## Realtime notification.created Contract

Announcement notification generation now emits `communication.notification.created` after notification rows are persisted.

Emission rules:

- Emits only to the recipient user room.
- Does not emit to the school room.
- Emits one event per newly created notification row.
- Does not emit for existing notification rows on queue retry.
- Uses the safe app notification presenter payload.

Payload shape:

```json
{
  "notification": {
    "notificationId": "uuid",
    "type": "announcement_published",
    "sourceModule": "announcements",
    "sourceId": "uuid",
    "title": "string",
    "body": "string-or-null",
    "priority": "normal",
    "status": "unread",
    "readAt": null,
    "archivedAt": null,
    "createdAt": "ISO",
    "deepLink": {
      "type": "announcement",
      "announcementId": "uuid"
    }
  },
  "eventAt": "ISO"
}
```

## Deep Link Contract

Announcement notifications expose only:

- `type: "announcement"`
- `announcementId`

Deep links do not expose `schoolId`, `organizationId`, `recipientUserId`, delivery ids, queue job ids, object storage fields, signed URLs, or raw metadata.

## Security/Tenancy Notes

- Core notification routes remain permission-guarded and backward-compatible.
- App-facing notification routes are Parent/Student/Teacher actor-scoped.
- App-facing routes never accept `recipientUserId`.
- Payloads are safe and do not expose internal fields.
- Realtime `communication.notification.created` emits only to recipient user room.
- Current-school scoping remains delegated through the existing scoped Prisma/repository path.
- No schema or migration was added.

## Explicitly Not Included

- Push/FCM provider integration.
- Device-token registration or notification preferences.
- Delivery receipts / double-grey checks.
- Message readers endpoint; Sprint 28E owns that.
- Conversation list enrichment; Sprint 28C owns/closed that.
- Read receipt changes; Sprint 28B owns/closed that.
- Audio messages, thumbnails, media transcoding.
- Message search.
- Server-side pin/mute/clear/export.
- Contact discovery or new conversation creation.
- Global route prefix changes or route renames.

## Verification Commands

Required Sprint 28D verification command set:

```bash
git status --short --untracked-files=all
git diff --name-only
git diff --stat
git diff --check
npx prisma validate
npx prisma generate
npm run build
npm run test -- communication --runInBand
npm run test -- parent-app --runInBand
npm run test -- student-app --runInBand
npm run test -- teacher-app --runInBand
npm run test -- realtime --runInBand
npm run test:security -- --runInBand
```

If full security verification times out, run focused communication/app security suites and report the timeout.

## Final Verdict

Sprint 28D status:
APP_FACING_NOTIFICATION_CENTER_AND_REALTIME_CREATED_LOCKED

Runtime changes:
Implemented.

Schema/migration:
None.

Next:
Sprint 28E — Message Readers / WhatsApp-like Message Info.
