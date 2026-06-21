# Sprint 29G - Communication Enhancements Final Handoff

## 1. Summary

Phase B name: Communication Important Improvements.

Baseline commit: `04cd0f4 feat: add app conversation message search`.

Sprint 29G is a docs-only final audit and handoff lock. It does not implement runtime behavior.

Runtime files changed in Sprint 29G: none.

Schema, migration, package, lockfile, and generated files changed in Sprint 29G: none.

Final verdict: `COMMUNICATION_ENHANCEMENTS_PHASE_B_COMPLETE`.

## 2. Completed Sprint Ledger

| Sprint | Commit | Purpose | Actual outcome | High-level affected files/routes/contracts | Final status |
| --- | --- | --- | --- | --- | --- |
| 29A - Communication Enhancements Decision Lock | `ec2f8b1 docs: lock communication enhancement decisions` | Lock Phase B scope, contracts, security boundaries, tests, and sequencing before runtime work. | Created the Phase B decision lock and confirmed Track A remained closed. | `docs/sprint-29a-communication-enhancements-decision-lock.md`; no runtime routes. | Complete |
| 29B - App Notification Filtering & Grouping | `b0d754b feat: add app notification filtering and grouping` | Add safe app notification filters and grouping for Parent, Student, and Teacher. | Added date filters, unread shortcut, category/type mapping, sourceModule validation, and page-based groups while preserving list contracts. | `GET /api/v1/parent/notifications`, `GET /api/v1/student/notifications`, `GET /api/v1/teacher/notifications`; communication notification center, app notification DTOs/presenters/tests. | Complete |
| 29C - Realtime Typing/Presence Payload Enrichment | `f90d700 feat: enrich realtime typing and presence payloads` | Add safe actor cards to typing and narrow app-facing presence behavior. | Preserved typing/presence event names and client commands, added actor cards, removed exact lastSeen, and narrowed presence to conversation-room scoped publication. | Realtime gateway/services/event constants/tests; `communication.typing.started`, `communication.typing.stopped`, `communication.presence.user.updated`. | Complete |
| 29D - App-Safe Attachment Presenter Hardening | `bcb9358 fix: harden app attachment realtime payloads` | Audit and harden app-facing message attachment payloads. | Confirmed HTTP app message presenters were already app-safe and fixed the realtime attachment-linked leak path to use the app-safe presenter. | `communication.chat.attachment.linked` attachment payload; shared app attachment presenter/tests. | Complete |
| 29E - Scheduled Announcement Publishing & Replay Tooling | `110dcdd feat: add scheduled announcement publishing and replay` | Add tenant-safe scheduled announcement processing and admin/core replay tooling. | Added due scheduled announcement processing use-case, repository query, and admin replay route; deferred cron binding and retry dashboard. | `POST /api/v1/communication/admin/announcements/:announcementId/replay-notifications`; announcement use-cases/repository/controller/tests. | Complete |
| 29F - App Message Search | `04cd0f4 feat: add app conversation message search` | Add safe app-facing message search inside authorized conversations. | Added conversation-scoped search routes for Parent, Student, and Teacher with safe validation, authorization, app-safe presenters, and no full-text migration. | `GET /api/v1/parent/messages/conversations/:conversationId/search`, `GET /api/v1/student/messages/conversations/:conversationId/search`, `GET /api/v1/teacher/messages/conversations/:conversationId/search`; app message adapters/use-cases/controllers/DTOs/tests. | Complete |

Git log verification confirmed the expected Sprint 29A through 29F hashes above on top of the Sprint 28O/28F handoff chain.

## 3. Final Backend Contract Map

### A. App Notification Filtering and Grouping

Routes:

- `GET /api/v1/parent/notifications`
- `GET /api/v1/student/notifications`
- `GET /api/v1/teacher/notifications`

Supported query params:

- Existing list params: `status`, `priority`, `type`, `sourceModule`, `page`, `limit`
- Phase B params: `createdFrom`, `createdTo`, `unreadOnly`, `category`, `groupBy`

Date semantics:

- `createdFrom` must be an ISO datetime string and is inclusive: `createdAt >= createdFrom`.
- `createdTo` must be an ISO datetime string and is exclusive for app list routes: `createdAt < createdTo`.
- If both are provided, `createdFrom` must be earlier than `createdTo`.

Unread shortcut:

- `unreadOnly=true` is equivalent to `status=unread`.
- `unreadOnly=false` has no filtering effect.
- `unreadOnly=true` with any non-`unread` status is rejected.

Category/type mapping:

- `category=message_received` maps to actual notification type `MESSAGE_RECEIVED`.
- `category=announcement` maps to actual notification type `ANNOUNCEMENT_PUBLISHED`.
- `category=announcement_published` maps to actual notification type `ANNOUNCEMENT_PUBLISHED`.
- If `category` and `type` are both supplied, they must resolve to the same actual notification type.
- Preference categories remain `message_received` and `announcement`; stored notification types remain unchanged.

Source module behavior:

- The existing source module normalizer remains in place.
- Current supported sourceModule values are `communication`, `announcements`, `attendance`, `grades`, `behavior`, `reinforcement`, `admissions`, `students`, and `system`.
- Phase B communication-generated notification sources are `communication` and `announcements`; unsupported values are rejected safely.

Grouping:

- `groupBy` supports `category`, `sourceModule`, and `day`.
- Grouping is current-page based, not a full-filter aggregate.
- If `groupBy` is absent, the list envelope remains the existing shape.
- If `groupBy` is present, the response adds a safe `groups` array with `key`, `label`, `count`, and `unreadCount`.
- Parent and Student group rows also include `unread_count` to preserve the dual alias style.
- Teacher group rows stay camelCase only.
- `groupBy=category` returns `message_received` for message notifications and `announcement` for `ANNOUNCEMENT_PUBLISHED`.
- `groupBy=sourceModule` returns safe lower-case source module keys and labels.
- `groupBy=day` uses UTC day keys such as `2026-06-21`.

No-leak guarantees:

- Filtering and grouping run only inside the current actor/current school scope.
- Groups do not include recipient ids, delivery ids, queue ids, source ids beyond existing safe links, or school ids.
- Invalid date/category/sourceModule/groupBy values fail safely.

### B. Realtime Typing and Presence Enrichment

Preserved server event names:

- `communication.typing.started`
- `communication.typing.stopped`
- `communication.presence.user.updated`

Preserved client command names:

- `communication.typing.start`
- `communication.typing.stop`

Typing started payload:

```json
{
  "conversationId": "conversation-id",
  "userId": "existing-user-id",
  "actor": {
    "displayName": "Name",
    "userType": "teacher",
    "avatarUrl": null
  },
  "startedAt": "2026-06-21T10:00:00.000Z",
  "expiresAt": "2026-06-21T10:00:08.000Z"
}
```

Typing stopped payload:

```json
{
  "conversationId": "conversation-id",
  "userId": "existing-user-id",
  "actor": {
    "displayName": "Name",
    "userType": "teacher",
    "avatarUrl": null
  },
  "stoppedAt": "2026-06-21T10:00:04.000Z"
}
```

Presence payload:

```json
{
  "userId": "existing-user-id",
  "status": "online",
  "online": true,
  "updatedAt": "2026-06-21T10:00:00.000Z",
  "actor": {
    "displayName": "Name",
    "userType": "teacher",
    "avatarUrl": null
  }
}
```

Presence behavior:

- Exact `lastSeen` is omitted from app-facing presence payloads.
- No global presence directory was added.
- School-wide app-facing presence publication was narrowed; presence updates are published to authorized conversation rooms, not as a broad school-room blast.
- Presence visibility is based on active/muted participation in active, non-deleted conversations.
- No HTTP routes were added or changed.

### C. App-Safe Attachment Presenter Hardening

The realtime `communication.chat.attachment.linked` event now uses the app-safe attachment presenter. The fixed leak path was that `communication.chat.attachment.linked` previously used the core attachment presenter and could expose `uploadedById`.

Final safe app attachment fields:

- `attachmentId`
- `fileId`
- `displayName`
- `mimeType`
- `sizeBytes`
- `mediaKind`
- `caption`
- `sortOrder`
- `createdAt`
- `downloadPath`
- `authorizedDownloadPath` when app route context exists
- `previewPath` when app route context exists
- Teacher app-safe `originalName` and `visibility` where already present in Teacher message contracts

Forbidden attachment/internal fields:

- `uploadedById`
- `createdById`
- `ownerId`
- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `bucket`
- `objectKey`
- `storageKey`
- `signedUrl`
- raw metadata
- `providerMetadata`
- virus scan internals
- `deletedAt`

Download/preview model:

- `fileId` and `attachmentId` remain route-safe app ids where already contracted.
- Authenticated download/preview routes remain the model for app media access.
- No tokenized unauthenticated download links were added.
- No signed URLs are returned in JSON payloads.

### D. Scheduled Announcement Publishing and Replay

ScheduledAt/status audit findings:

- `CommunicationAnnouncement.scheduledAt` existed before Sprint 29E.
- Announcement statuses existed before Sprint 29E: `DRAFT`, `SCHEDULED`, `PUBLISHED`, `ARCHIVED`, `CANCELLED`.
- `CommunicationAnnouncement` has `publishedAt`, `archivedAt`, and `expiresAt`.
- `CommunicationAnnouncement` has no announcement-level `deletedAt`.
- No approved general scheduler/cron binding existed before Sprint 29E.

Implemented in Sprint 29E:

- `ProcessScheduledCommunicationAnnouncementsUseCase`
- `CommunicationAnnouncementRepository.findDueScheduledCurrentSchoolAnnouncements(...)`
- `ReplayCommunicationAnnouncementNotificationsUseCase`
- `CommunicationAdminController`
- Admin replay route: `POST /api/v1/communication/admin/announcements/:announcementId/replay-notifications`

Deferred in Sprint 29E:

- Periodic scheduler/cron binding, because no approved general scheduler/cron pattern exists.
- Broad retry dashboard, because safe job status persistence/dashboard contracts were not in scope.

Scheduled publishing eligibility:

- Current school scope only.
- `status = SCHEDULED`.
- `scheduledAt <= now`.
- `publishedAt = null`.
- `archivedAt = null`.
- `expiresAt = null` or `expiresAt > now`.
- Default batch size is `50`.
- Maximum batch size is `100`.
- Ordering is `scheduledAt asc`, `createdAt asc`, `id asc`.

Scheduled publishing behavior:

- Processing reuses the core publish path.
- Running the processor repeatedly is idempotent because already-published announcements no longer match the due query and existing notification generation is duplicate-safe.
- One failed announcement increments `failedCount` and does not block the rest of the batch.
- The internal summary contains only safe counts: `processedCount`, `publishedCount`, `skippedCount`, and `failedCount`.

Replay route:

- `POST /api/v1/communication/admin/announcements/:announcementId/replay-notifications`

Required permissions:

- `communication.admin.view`
- `communication.notifications.manage`

Replay eligibility:

- Announcement exists in the current school scope.
- `status = PUBLISHED`.
- `archivedAt` is null.
- Announcement is not expired.

Replay rejection behavior:

- Missing or cross-school announcement: safe 404.
- Draft, scheduled, cancelled, archived, expired, or otherwise not-published announcement: 409 state error.

Replay behavior:

- Reuses the existing announcement notification generation flow.
- Duplicate-safe generation prevents duplicate notification rows for recipients who already have the announcement notification.
- Existing notification preference behavior is respected.
- Safe response summary only: `announcementId`, `replayed`, `generatedCount`, `skippedExistingCount`, `failedCount`, and `skippedReason`.
- No app-facing replay route exists.

### E. App Message Search

Routes:

- `GET /api/v1/parent/messages/conversations/:conversationId/search`
- `GET /api/v1/student/messages/conversations/:conversationId/search`
- `GET /api/v1/teacher/messages/conversations/:conversationId/search`

Query params:

- `q` is required, trimmed, minimum length `2`, maximum length `100`.
- `page` is optional, integer, minimum `1`, maximum `10000`.
- `limit` is optional, integer, minimum `1`, maximum `100`.

Search behavior:

- Searched field: message `body` only.
- Matching is case-insensitive `contains`.
- Ordering is `createdAt desc`, then `id desc`.
- Default pagination follows the existing app message list adapter default: page `1`, limit `50`.
- Search excludes system messages.
- Search includes only `SENT` messages.
- Search excludes messages with `hiddenAt` or `deletedAt`.
- Search excludes deleted conversations.
- Search requires the current actor to be an active or muted participant.
- No highlighting/snippets were added.

Authorization behavior:

- Parent search uses `ParentAppAccessService.assertCurrentParent()`, verifies the conversation through the existing parent conversation visibility path, then searches only with the current parent participant scope.
- Student search uses `StudentAppAccessService.getCurrentStudentWithEnrollment()`, verifies the conversation through the existing student conversation visibility path, then searches only with the current student participant scope.
- Teacher search uses `TeacherAppAccessService.assertCurrentTeacher()`, verifies the conversation through the existing teacher conversation visibility path, then searches only with the current teacher participant scope.
- Guessed, unauthorized, or cross-school conversation ids resolve through the existing safe not-found behavior before search.

Result payload shape:

Parent and Student:

```json
{
  "conversationId": "conversation-id",
  "conversation_id": "conversation-id",
  "messages": [],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 0
  },
  "query": "trimmed query"
}
```

Teacher:

```json
{
  "conversationId": "conversation-id",
  "messages": [],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 0
  },
  "query": "trimmed query"
}
```

Presenter and attachment decisions:

- Search reuses existing app message presenters.
- Parent and Student preserve dual alias style where already used.
- Teacher remains camelCase only.
- Attachments are included only through the app-safe attachment cards from Sprint 29D.
- No global app-wide search was added.
- No admin/core search was added.
- No attachment filename/content/OCR/storage metadata search was added.
- No full-text search index or migration was added.

## 4. No-Leak Contract

Phase B app-facing payloads must not expose these fields unless a field is explicitly route-safe and already contracted:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `passwordHash`
- `recipientUserId`
- `actorUserId`
- `uploadedById`
- `createdById`
- `publishedById`
- `archivedById`
- `hiddenById`
- `deletedById`
- `guardianId`
- `studentGuardianId`
- `enrollmentId`
- `teacherAllocationId`
- participant internals
- `bucket`
- `objectKey`
- `storageKey`
- `signedUrl`
- raw metadata
- provider metadata
- queue metadata
- delivery ids
- notification queue ids
- raw BullMQ metadata
- stack traces
- `deletedAt`

Route-safe app ids that remain allowed where already contracted:

- `conversationId`
- `messageId`
- `attachmentId`
- `fileId`
- `announcementId`
- `notificationId`
- `contactId`

## 5. Frontend Integration Guidance

Notification list filters:

- Use the existing notification list routes for Parent, Student, and Teacher.
- Use `createdFrom` and `createdTo` as ISO datetimes; treat `createdTo` as exclusive.
- Use `unreadOnly=true` as the unread shortcut instead of combining incompatible statuses.
- Use `category=message_received` for message notifications.
- Use `category=announcement` for app-facing announcement filters; `announcement_published` remains accepted as an alias.
- Use `sourceModule=communication` and `sourceModule=announcements` for Phase B Communication notifications.
- Use `groupBy=category`, `groupBy=sourceModule`, or `groupBy=day` when the UI needs group totals for the current page.
- Treat group counts as current-page counts.

Typing and presence:

- Continue listening for `communication.typing.started`, `communication.typing.stopped`, and `communication.presence.user.updated`.
- Continue sending `communication.typing.start` and `communication.typing.stop`.
- Use `actor.displayName`, `actor.userType`, and `actor.avatarUrl` for display.
- Keep using the existing `userId` only for backward-compatible client reconciliation.
- Do not expect exact `lastSeen`; it is intentionally omitted.
- Do not build a global online directory from presence events; presence is conversation-scoped.

Attachments:

- Use `authorizedDownloadPath` and `previewPath` when present on app message attachment cards.
- Use `downloadPath` only where already supported by the existing app flow.
- Never expect `signedUrl` in JSON; signed URLs are not returned.
- Continue treating `attachmentId` and `fileId` as route-safe ids for authorized download/preview paths.

Announcements:

- Announcement replay is an admin/core operation only.
- Parent, Student, and Teacher apps should not call replay tooling and should not display it as an app feature.

Message search examples:

- Parent: `GET /api/v1/parent/messages/conversations/{conversationId}/search?q=exam&page=1&limit=20`
- Student: `GET /api/v1/student/messages/conversations/{conversationId}/search?q=science&page=1&limit=20`
- Teacher: `GET /api/v1/teacher/messages/conversations/{conversationId}/search?q=homework&page=1&limit=20`

Message search client behavior:

- Trim `q` before sending or be prepared for the backend to trim it.
- Enforce `q` length from 2 to 100 characters in the UI.
- Use `page >= 1` and `limit` from 1 to 100.
- Handle empty search results as a normal response with an empty `messages` array.
- Treat safe not-found responses for guessed/cross-school/unauthorized conversations as non-disclosing; do not show whether the id exists elsewhere.
- Parent and Student responses include dual `conversationId` and `conversation_id` aliases.
- Teacher responses are camelCase only.

## 6. Admin/Core Guidance

Replay route:

- `POST /api/v1/communication/admin/announcements/:announcementId/replay-notifications`

Required permissions:

- `communication.admin.view`
- `communication.notifications.manage`

Scheduled publishing:

- A scheduled publishing service/use-case exists.
- No cron/scheduler binding exists yet.
- Any future scheduler binding must run with explicit scoped/tenant context.
- Future scheduler binding must not use a fake global bypass context.
- Future scheduler binding must remain idempotent.
- Future scheduler binding must keep batch limits bounded.

Retry dashboard:

- The retry dashboard remains deferred.
- Do not expose raw queue metadata, provider payloads, recipient lists, stack traces, or internal errors in a future dashboard.

## 7. Verification and Regression State

Closeout verification history:

- Sprint 29B full app/security verification passed per `docs/sprint-29b-app-notification-filtering-grouping-closeout.md`.
- Sprint 29C full app/security verification passed per `docs/sprint-29c-realtime-typing-presence-enrichment-closeout.md`.
- Sprint 29D full app/security verification passed per `docs/sprint-29d-app-safe-attachment-presenter-hardening-closeout.md`.
- Sprint 29E full app/security verification passed per `docs/sprint-29e-scheduled-announcement-publishing-replay-closeout.md`.
- Sprint 29F full app/security verification passed per `docs/sprint-29f-app-message-search-closeout.md`.

Sprint 29G verification:

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS - output: `?? docs/sprint-29g-communication-enhancements-final-handoff.md` |
| `git diff --name-only` | PASS - no output |
| `git diff --stat` | PASS - no output |
| `git diff --check` | PASS - no output |
| `npx prisma validate` | PASS - `The schema at prisma\schema.prisma is valid` |
| `npm run build` | PASS - `nest build` completed |
| `npm run test -- communication --runInBand` | PASS - 55 suites passed, 305 tests passed |
| `npm run test -- parent-app --runInBand` | PASS - 50 suites passed, 205 tests passed |
| `npm run test -- student-app --runInBand` | PASS - 50 suites passed, 242 tests passed |
| `npm run test -- teacher-app --runInBand` | PASS - 47 suites passed, 272 tests passed |
| `npm run test -- realtime --runInBand` | PASS - 9 suites passed, 51 tests passed |
| `npm run test -- files --runInBand` | PASS - 8 suites passed, 27 tests passed |
| `npm run test:security -- --runInBand` | PASS - 49 suites passed, 804 tests passed |

`npx prisma generate` was not run for Sprint 29G because this sprint is docs-only and the project workflow did not require generated client refresh. No tracked generated changes exist.

## 8. Deferred Roadmap

The following remain deferred after Phase B unless explicitly opened in a later sprint:

- group conversations
- mentions
- delivery receipts
- push/FCM/APNs/device token delivery
- email/SMS/provider delivery
- admin notification retry dashboard
- scheduler/cron binding for due announcements
- global app-wide message search
- full-text indexing
- attachment filename/content/OCR search
- thumbnails/transcoding/waveforms/duration extraction
- tokenized unauthenticated download links
- pin/mute/clear/export conversation actions
- support channels
- DB-level unordered direct pair uniqueness
- notification categories beyond current scope
- admin preference management

## 9. Final Verdict

COMMUNICATION_ENHANCEMENTS_PHASE_B_COMPLETE
