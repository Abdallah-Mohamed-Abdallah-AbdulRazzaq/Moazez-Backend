# Sprint 29A - Communication Enhancements Decision Lock

## 1. Executive summary

Communication Phase B is the improvement and hardening phase after the Track A app-facing Communication work. Its purpose is to lock the next runtime scope before implementation begins, especially around app notification filtering, realtime typing/presence privacy, attachment presenter safety, scheduled announcement publishing, replay tooling, and message search.

Current accepted baseline:

- Commit: `f65030a`
- Message: `docs: add communication track a final handoff`

Sprint 29A is documentation-only. It must not change runtime source code, Prisma schema, migrations, package files, lockfiles, generated files, routes, controllers, DTOs, presenters, repositories, workers, or tests.

Communication Track A is closed. Phase B is improvement and hardening work for already shipped Communication surfaces; it does not block core Communication work and must not reopen Track A as a broad rewrite.

## 2. Phase B principles

- Preserve all Track A app-facing contracts unless a later sprint explicitly fixes a documented issue.
- No global API prefix changes. All HTTP routes remain under `/api/v1/`.
- No route renames.
- No app clients passing arbitrary `userId`, `recipientUserId`, `schoolId`, `membershipId`, `roleId`, `actorUserId`, participant arrays, or raw ids unless already route-contracted.
- No leaking storage internals or provider internals.
- Prefer app-scoped routes and current actor derivation.
- Prefer no schema or migration unless a specific runtime sprint proves it is required.
- Prefer no package or lockfile changes.
- No push, FCM, APNs, or device-token work in Phase B unless a later separate track is opened.
- No email, SMS, or provider delivery work in Phase B.
- No commit from Codex.

## 3. Sprint sequence decision

Default Phase B execution order:

1. 29B - App Notification Filtering & Grouping
2. 29C - Realtime Typing/Presence Payload Enrichment
3. 29D - App-Safe Attachment Presenter Hardening
4. 29E - Scheduled Announcement Publishing & Replay Tooling
5. 29F - App Message Search
6. 29G - Communication Enhancements Final Handoff

The team may run 29D before 29B if security-hardening is prioritized. Otherwise, the default execution order above should stand unless the project lead changes it.

## 4. Sprint 29B decision - App Notification Filtering & Grouping

Target existing routes:

- `GET /api/v1/parent/notifications`
- `GET /api/v1/student/notifications`
- `GET /api/v1/teacher/notifications`

Preferred query params:

- `createdFrom`
- `createdTo`
- `unreadOnly`
- `category`
- `sourceModule`
- `groupBy`

Existing app notification list filters already include `status`, `priority`, `type`, `sourceModule`, `limit`, and `page`. Sprint 29B must be additive and must preserve those existing filters.

Decisions:

- `createdFrom` and `createdTo` must accept ISO datetime strings.
- `createdFrom` is inclusive.
- `createdTo` is exclusive. Use `< createdTo`, not `<= createdTo`, to avoid pagination/date-window overlap.
- `unreadOnly=true` is a shortcut for `status=unread`.
- If `unreadOnly=true` is combined with `status` other than `unread`, reject the request as invalid instead of guessing precedence.
- `unreadOnly=false` has no filtering effect.
- `type` remains the exact notification type filter.
- `category` is an app grouping/filter alias, not a new persistence enum.
- Initial `category` values are:
  - `message_received`
  - `announcement`
  - `announcement_published` as an accepted alias because the actual notification type is `announcement_published`.
- `message_mention` remains deferred until mention generation exists.
- The current generated Communication notification types are `message_received` and `announcement_published`.
- The actual preference categories are `message_received` and `announcement`.
- `sourceModule` for this Phase B scope supports the current Communication notification sources:
  - `communication` for message notifications.
  - `announcements` for announcement-published notifications.
- Do not expand app-facing Phase B filtering to attendance, grades, behavior, reinforcement, admissions, students, or system notification sources unless a later sprint explicitly approves those app contracts.
- `groupBy` supports only:
  - `category`
  - `sourceModule`
  - `day`
- `groupBy=day` groups by notification `createdAt` day in a documented server timezone or UTC. Prefer UTC unless product selects a school-local timezone rule.
- Grouping must not expose `recipientUserId`, unsafe `sourceId` internals beyond existing safe deep links, delivery ids, queue ids, raw recipient rows, or `schoolId`.
- Prefer adding `groupBy` to the existing list route if the response can remain backward-compatible.
- If grouping would make the existing list response disruptive, defer grouped responses to:
  - `GET /api/v1/{app}/notifications/groups`

Security:

- Filters must apply only inside current actor and current school scope.
- Parent, Student, and Teacher actors must not see another user's notifications.
- App routes must continue deriving `recipientUserId` from the current app actor.
- Invalid date, category, sourceModule, and groupBy values must be rejected safely.

Testing expectation:

- App unit tests for filter parsing and precedence.
- Communication notification center tests for repository/service filtering.
- Security tests for cross-user and cross-school filtering.
- Grouping no-leak tests.
- No existing notification center regressions.

## 5. Sprint 29C decision - Realtime Typing/Presence Payload Enrichment

Typing decisions:

- Existing event names remain unchanged:
  - `communication.typing.started`
  - `communication.typing.stopped`
- Existing client command names remain unchanged:
  - `communication.typing.start`
  - `communication.typing.stop`
- The current payload includes `conversationId`, `userId`, and timestamps.
- 29C may preserve `userId` only for backward compatibility with the existing event contract and client reconciliation.
- Do not add any new raw identity ids.
- Add a safe actor card:

```json
{
  "actor": {
    "displayName": "Name",
    "userType": "teacher",
    "avatarUrl": null
  }
}
```

- App-safe `userType` values should be display categories such as `teacher`, `student`, `parent`, and `admin`.
- `guardian` may appear only as an app-facing relationship label where an existing app contract intentionally treats a parent/guardian contact that way. It must not be treated as an official `UserType`.
- If a non-raw identifier is needed later, prefer `actorKey` or an already route-safe `participantId` only after a separate security review. Otherwise defer.
- Do not expose `membershipId`, `roleId`, `schoolId`, `organizationId`, raw `guardianId`, `studentGuardianId`, `enrollmentId`, or `teacherAllocationId`.

Presence decisions:

- No global presence directory.
- The current implementation publishes `communication.presence.user.updated` with `userId`, `status`, `online`, and `updatedAt`.
- 29C must not expand that model. It should narrow app-facing presence visibility to relationship/conversation-scoped recipients.
- Presence visibility must be conversation-scoped or relationship-scoped, never school-directory scoped.
- No cross-school presence visibility.
- No visibility for blocked, inactive, deleted, removed, left, or otherwise unauthorized users.
- Exact `lastSeen` must be omitted from app payloads by default.
- If product later requires `lastSeen`, it must be coarsened or shown only to authorized conversation participants after explicit approval.
- Online/offline may be exact only for authorized current conversation participants. Outside that scope, omit presence state rather than returning false.
- Prefer reusing the existing event name with a safer target room only if backward compatibility is acceptable. If not, add a narrowly documented app-facing presence event in 29C and mark the old school-room behavior as not an app contract.

Testing expectation:

- Realtime payload tests for the enriched typing actor card.
- Realtime access tests for conversation-scoped typing/presence.
- App message tests if typing payload derives app actor display fields.
- Security tests proving no presence or user enumeration.
- No cross-school, inactive, blocked, deleted, or non-participant presence visibility.

## 6. Sprint 29D decision - App-Safe Attachment Presenter Hardening

Important distinction:

- `fileId` and `attachmentId` are route-safe in Track A because authorized download and preview routes need them.
- Do not remove route-safe ids if that would break frontend integration.
- The hardening target is removal and prevention of unsafe internals.

Allowed app-safe attachment fields:

- `attachmentId`
- `fileId`
- `displayName`
- `originalName` if already used safely
- `mimeType`
- `sizeBytes`
- `mediaKind`
- `visibility` only if already app-safe
- `caption`
- `sortOrder`
- `createdAt`
- `downloadPath` if already present
- `authorizedDownloadPath`
- `previewPath`

Forbidden fields:

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
- `signedUrl` in JSON payloads
- raw metadata
- provider metadata
- virus scan internals
- `deletedAt`

Decision on download token/link endpoint:

- Defer tokenized download links unless the frontend explicitly needs unauthenticated short-lived links.
- Continue using authenticated `authorizedDownloadPath` and `previewPath`.
- Continue keeping signed storage URLs out of JSON payloads.
- If a future token endpoint is needed, it must be a separate security-reviewed sprint.

Testing expectation:

- Presenter no-leak tests for Parent, Student, Teacher, realtime, and shared Communication app presenters.
- App message attachment tests.
- Files tests for download behavior.
- Security files and Communication tests for guessed ids, mismatched message/attachment ids, and cross-school files.

## 7. Sprint 29E decision - Scheduled Announcement Publishing & Replay Tooling

Scheduled publishing decisions:

- First audit existing `scheduledAt` and status behavior.
- Current schema/domain support `scheduledAt` and `SCHEDULED` announcements.
- Current inspected worker support is notification generation after publish; no scheduled publishing worker is locked as an app contract yet.
- If a scheduled publishing worker exists by the time 29E starts, harden and test it.
- If no worker exists, implement a narrow scheduled publishing worker in 29E only because the schema/domain already supports `scheduledAt`.
- The worker must be idempotent.
- The worker must be tenant-safe and run with an explicit request context.
- The worker must not publish archived, cancelled, already-published, deleted, expired, or invalid announcements.
- The worker must not duplicate announcement notifications.
- The worker should reuse the core publish path or a core-equivalent service path so audit logging, status validation, and notification generation stay centralized.

Replay tooling decisions:

- Replay is admin/core only, not app-facing.
- Preferred first use case: replay announcement notification generation for a specific announcement after a failure.
- Candidate route, only if consistent with existing core/admin route style:
  - `POST /api/v1/communication/admin/announcements/:announcementId/replay-notifications`
- If job/queue records support it safely, a second route may be considered:
  - `POST /api/v1/communication/admin/notifications/jobs/:jobId/retry`
- If queue/job records are not app-safe or not mature enough, defer dashboard/job retry and implement only narrow announcement replay by source id.

Retry dashboard decisions:

- Prefer documentation and audit first.
- Implement a read-only dashboard only if existing persistence has safe job status data.
- Do not expose raw BullMQ metadata, provider payloads, recipient user id lists, raw recipient rows, queue ids, stack traces with secrets, or internal error payloads.
- Any dashboard must be core/admin only and permission guarded.

Testing expectation:

- Scheduled worker tests.
- Idempotency tests.
- No duplicate notification tests.
- Admin authorization/security tests.
- Announcement publish regression tests.
- Replay tests for missing, already generated, disabled preference, and cross-school announcement cases.

## 8. Sprint 29F decision - App Message Search

Recommended incremental scope:

- Start with conversation-scoped message search.
- Do not start with global app-wide search.

Preferred routes:

- `GET /api/v1/parent/messages/conversations/:conversationId/messages/search`
- `GET /api/v1/student/messages/conversations/:conversationId/messages/search`
- `GET /api/v1/teacher/messages/conversations/:conversationId/messages/search`

Optional later route:

- `GET /api/v1/{app}/messages/search`

Only add global app-wide search if conversation-scoped search is stable and the frontend has a clear need.

Conversation list search:

- Existing conversation list routes currently support `search`.
- 29F may add `q` as the preferred alias while preserving `search`:
  - `GET /api/v1/parent/messages/conversations?q=...`
  - `GET /api/v1/student/messages/conversations?q=...`
  - `GET /api/v1/teacher/messages/conversations?q=...`
- If both `q` and `search` are provided and differ, reject the request as invalid.
- Conversation search must remain inside the already-authorized conversation set and must not become email/phone/global user lookup.

Message search query params:

- `q`
- `type`
- `createdFrom`
- `createdTo`
- `sender`
- `page`
- `limit`

Type values:

- `text`
- `image`
- `video`
- `file`
- `audio`
- `voice`

`voice` is an app alias and should map to the internal audio kind. Do not expose or search `system` messages in app search unless a later sprint explicitly approves system-message search behavior.

Sender filter:

- `me`
- `others`

Avoid raw `senderUserId` from app clients.

Search rules:

- Search only inside authorized conversations.
- The route must first prove the actor can access the conversation through the same app access path used by message list/detail.
- Do not search or return hidden/deleted raw content.
- Do not search storage metadata.
- Do not expose internal sender user ids beyond existing route-safe app sender fields.
- Do not leak cross-school or cross-user results.
- Do not create global user directory behavior through search.
- Pagination must be stable. Use deterministic ordering such as `sentAt desc, id asc` or a documented cursor strategy.
- `createdFrom` should be inclusive.
- `createdTo` should be exclusive for the same reason as notification filters.

Schema/index decision:

- No full-text schema or index migration in the first search sprint unless existing performance is clearly unacceptable.
- Start with safe DB queries on existing fields.
- If full-text indexing is needed, defer it to a later performance sprint with a migration and explicit test/EXPLAIN evidence.

Testing expectation:

- App message search tests for Parent, Student, and Teacher.
- Conversation access tests.
- Hidden/deleted masking tests.
- Type/date/sender filter tests.
- `voice` alias to audio tests.
- Security tests for guessed conversation ids and cross-school leakage.
- Regression tests confirming existing message list and conversation list behavior is unchanged.

## 9. Cross-sprint no-leak contract

Phase B app-facing payloads and realtime app payloads must not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `passwordHash`
- `deletedAt`
- `recipientUserId`
- `actorUserId`
- `uploadedById`
- `createdById`
- `hiddenById`
- `deletedById`
- `publishedById`
- `archivedById`
- `guardianId` unless explicitly encoded in route-safe `contactId`
- `studentGuardianId`
- `enrollmentId` unless an existing app contract explicitly allows it
- `teacherAllocationId`
- `assignmentId`
- `bucket`
- `objectKey`
- `storageKey`
- `signedUrl` in JSON payloads
- raw metadata
- provider metadata
- queue metadata
- notification delivery ids/rows
- notification queue ids
- raw recipient rows
- finance/payment/marketplace fields

Allowed app-safe ids where already route-contracted:

- `conversationId`
- `messageId`
- `notificationId`
- `announcementId`
- `fileId`
- `attachmentId`
- `contactId`
- `studentId` where Teacher App contact contract uses `student:<studentId>`
- `classId` or `classroomId` where Teacher App class/announcement contracts already use them
- `childId` where Parent App already uses it

## 10. Verification policy for Phase B runtime sprints

Every runtime sprint must run:

```powershell
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
npm run test -- files --runInBand

npm run test:security -- --runInBand
```

Fallback security if full suite times out:

```powershell
npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.communication.spec.ts test/security/tenancy.parent-app.spec.ts test/security/tenancy.student-app.spec.ts test/security/tenancy.teacher-app.spec.ts test/security/tenancy.files.spec.ts
```

For docs-only Sprint 29A, run at minimum:

```powershell
git status --short --untracked-files=all
git diff --name-only
git diff --stat
git diff --check
```

Optional but preferred if quick:

```powershell
npm run build
```

Because 29A is documentation-only, avoid optional build if it would churn generated output or stale `dist` files.

## 11. Closeout rules for Phase B

Every Phase B sprint must produce a closeout document or update the sprint decision/handoff document.

For 29A specifically, this decision document is the closeout.

Final verdict for 29A:

`COMMUNICATION_ENHANCEMENTS_DECISION_LOCK_COMPLETE`

Use `COMMUNICATION_ENHANCEMENTS_DECISION_LOCK_BLOCKED` only if the document cannot be created or verification exposes an unresolved contradiction that must be fixed before runtime planning can proceed.

## 12. Known deferred items after Phase B planning

The following remain deferred unless explicitly implemented later:

- push/FCM/APNs/device tokens
- email/SMS/provider delivery
- support channels
- group conversations
- message mentions
- delivery receipts/double-grey checks
- pin/mute/clear/export user actions
- teacher announcement attachments unless 29D or 29E changes scope explicitly
- global app-wide search if 29F starts conversation-scoped only
- full-text search indexing
- media transcoding/thumbnails/waveforms
- database-level unordered direct pair uniqueness unless explicitly scheduled
