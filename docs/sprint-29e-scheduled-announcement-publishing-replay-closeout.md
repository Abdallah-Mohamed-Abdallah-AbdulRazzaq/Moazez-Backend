# Sprint 29E - Scheduled Announcement Publishing and Replay Closeout

## Summary

Sprint 29E adds a narrow, tenant-scoped scheduled announcement publishing service path and a safe Communication admin replay endpoint for announcement notification generation.

The work preserves Track A app-facing announcement contracts, notification preference behavior, notification generation semantics, realtime behavior, and app notification filtering/grouping behavior.

Final verdict: `SCHEDULED_ANNOUNCEMENT_PUBLISHING_REPLAY_COMPLETE`

## Files changed

Runtime files changed:

- `src/modules/communication/application/communication-announcement.use-cases.ts`
- `src/modules/communication/controller/communication-admin.controller.ts`
- `src/modules/communication/communication.module.ts`
- `src/modules/communication/domain/communication-announcement-domain.ts`
- `src/modules/communication/infrastructure/communication-announcement.repository.ts`

Test files changed:

- `src/modules/communication/tests/communication-announcement-domain.spec.ts`
- `src/modules/communication/tests/communication-announcement.repository.spec.ts`
- `src/modules/communication/tests/communication-announcement.use-case.spec.ts`
- `test/security/tenancy.communication.spec.ts`

Closeout file changed:

- `docs/sprint-29e-scheduled-announcement-publishing-replay-closeout.md`

## Runtime scope

Runtime work was limited to Communication announcement scheduling/replay internals and one core/admin Communication route.

No Parent, Student, or Teacher app routes changed. No notification preference, notification filtering/grouping, realtime typing/presence, attachment presenter, message search, schema, migration, package, lockfile, or generated source changes were made.

## ScheduledAt and status audit findings

Current schema/domain support:

- `CommunicationAnnouncement.scheduledAt` exists.
- `CommunicationAnnouncementStatus` supports `DRAFT`, `SCHEDULED`, `PUBLISHED`, `ARCHIVED`, and `CANCELLED`.
- `CommunicationAnnouncement` has `publishedAt`, `archivedAt`, and `expiresAt`.
- `CommunicationAnnouncement` does not have `deletedAt`, so deleted announcement exclusion is not applicable to this model.
- Create/update validation already requires `scheduledAt` to be in the future for scheduled announcements.
- The existing publish path accepts draft or scheduled announcements, stamps `publishedAt`/`publishedById`, audits the mutation, and enqueues announcement notification generation.
- Announcement notification generation already existed through `CommunicationNotificationGenerationService`, `CommunicationNotificationQueueService`, and `CommunicationNotificationGenerationWorker`.
- Notification generation is already duplicate-safe through the existing repository advisory lock and existing notification/delivery checks.

Scheduler/worker audit:

- A BullMQ worker pattern exists for queued notification generation.
- A queue module exists through `BullmqService`.
- No general cron or scheduler framework was found for periodic jobs.
- No scheduled announcement publisher existed before Sprint 29E.

## What was implemented

Implemented:

- `CommunicationAnnouncementRepository.findDueScheduledCurrentSchoolAnnouncements(...)`
- `ProcessScheduledCommunicationAnnouncementsUseCase`
- `ReplayCommunicationAnnouncementNotificationsUseCase`
- `CommunicationAdminController`
- `POST /api/v1/communication/admin/announcements/:announcementId/replay-notifications`
- Domain guard `assertCanReplayAnnouncementNotifications(...)`
- Focused unit and security coverage for scheduling and replay behavior

Deferred:

- Runtime cron/scheduler binding for periodic scheduled publishing, because the repository does not currently have a safe general scheduler pattern.
- Broad retry dashboard, because exposing queue/job status safely would require a separate read model and security review.

## Scheduled publishing behavior

Eligible scheduled announcements:

- current school only through scoped Prisma and `requireCommunicationScope()`
- `status = SCHEDULED`
- `scheduledAt <= now`
- `publishedAt = null`
- `archivedAt = null`
- `expiresAt = null` or `expiresAt > now`

Ineligible announcements:

- draft
- future scheduled
- already published
- archived
- cancelled
- expired
- cross-school
- invalid records that fail the existing publish domain guard

Due condition:

- `scheduledAt <= now`

Batch behavior:

- default batch size: 50
- maximum batch size: 100
- stable ordering: `scheduledAt asc`, `createdAt asc`, `id asc`
- one failed announcement does not block the rest of the batch
- returned summary includes only `processedCount`, `publishedCount`, `skippedCount`, and `failedCount`

Idempotency behavior:

- Once a scheduled announcement is published, it is no longer selected by the due finder.
- Repeated sequential processing does not republish the same announcement.
- Notification row duplication remains blocked by the existing notification generation repository dedupe path.
- Publish continues to enqueue the existing notification generation job; if queue enqueue fails, the published announcement remains the source of truth and replay can regenerate notifications later.

Tenant and school scoping:

- The scheduled processing use case requires the current Communication scope.
- The due query uses `prisma.scoped`.
- No fake global context or bypass scope was introduced.

## Notification replay behavior

Route implemented:

- `POST /api/v1/communication/admin/announcements/:announcementId/replay-notifications`

Use-case behavior:

- Loads the announcement through the current-school Communication announcement repository.
- Requires the announcement to be eligible for replay.
- Invokes the existing `CommunicationNotificationGenerationService.generateForPublishedAnnouncement(...)`.
- Returns only safe summary counts.

Replay eligibility rules:

- announcement must exist in the current school scope
- status must be `PUBLISHED`
- `archivedAt` must be null
- `expiresAt` must be null or in the future

Replay rejection rules:

- missing or cross-school announcement: `404`
- draft, scheduled, cancelled, archived, expired, or otherwise not published: `409`

Duplicate safety:

- Replay uses the existing notification generation service.
- Existing announcement notification rows are counted as skipped existing rows.
- Existing in-app delivery rows are not duplicated.
- Only missing announcement notification rows/delivery rows are created.

Preference handling:

- Replay continues to respect `CommunicationNotificationPreferenceService.filterInAppEnabledRecipientUserIds(...)`.
- If all recipients disabled announcement notifications, replay returns a safe skipped summary instead of exposing recipient details.

Safe response summary:

```json
{
  "announcementId": "announcement-id",
  "replayed": true,
  "generatedCount": 1,
  "skippedExistingCount": 2,
  "failedCount": 0,
  "skippedReason": null
}
```

The response does not expose recipient rows, `recipientUserId`, delivery ids, queue ids, provider metadata, raw errors, stack traces, or `schoolId`.

## Retry dashboard decision

Retry dashboard remains deferred.

Reason:

- Existing BullMQ behavior is available for execution, but there is no mature, app-safe persisted retry dashboard read model in this sprint.
- A dashboard would risk exposing raw queue metadata, provider payloads, stack traces, or recipient internals without a separate security-reviewed design.

## Admin/core authorization behavior

The replay endpoint is core/admin only.

Required permissions:

- `communication.admin.view`
- `communication.notifications.manage`

Parent, Student, Teacher, no-access, view-only, and cross-school actors are rejected by existing auth, permission, and scoped repository behavior.

## Security/no-leak confirmation

Sprint 29E does not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `recipientUserId`
- `actorUserId`
- `publishedById`
- `archivedById`
- `createdById`
- raw recipient rows
- notification delivery ids
- notification queue ids
- provider metadata
- queue metadata
- raw BullMQ metadata
- stack traces
- `deletedAt`
- `passwordHash`

The only replay identifier returned is the route-safe `announcementId`.

## Explicitly not included

This sprint did not include:

- app-facing Parent, Student, or Teacher routes
- push, FCM, APNs, or device token support
- email, SMS, or provider delivery support
- notification preference changes
- notification filtering/grouping changes
- realtime typing/presence changes
- attachment presenter changes
- message search
- schema or migration changes
- package or lockfile changes
- generated source file changes
- broad queue dashboard
- raw queue/job retry route
- global API prefix changes
- route renames

## Tests run and results

Focused verification:

- `npm run test -- communication-announcement --runInBand` - PASS, 6 suites, 30 tests.
- `npm run build` - first attempt timed out after 124036 ms with no compile error output.
- `npm run build` - PASS with a larger timeout.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.communication.spec.ts` - PASS, 1 suite, 68 tests.

Final verification:

- `git status --short --untracked-files=all` - PASS. Only intended Sprint 29E runtime/test/doc files are modified or untracked.
- `git diff --name-only` - PASS. Shows tracked runtime/test files; untracked controller/repository-spec/closeout files are listed by `git status`.
- `git diff --stat` - PASS. 7 tracked files changed, 690 insertions, 1 deletion; untracked files are not included in Git diff stat.
- `git diff --check` - PASS. No whitespace errors; Git reported line-ending conversion warnings only.
- `npx prisma validate` - PASS. Schema valid.
- `npx prisma generate` - PASS. Prisma Client v6.19.3 generated to `node_modules/@prisma/client`.
- `npm run build` - PASS.
- `npm run test -- communication --runInBand` - PASS, 55 suites, 305 tests.
- `npm run test -- parent-app --runInBand` - PASS, 49 suites, 200 tests.
- `npm run test -- student-app --runInBand` - PASS, 49 suites, 237 tests.
- `npm run test -- teacher-app --runInBand` - PASS, 46 suites, 267 tests.
- `npm run test -- realtime --runInBand` - PASS, 9 suites, 51 tests.
- `npm run test -- files --runInBand` - PASS, 8 suites, 27 tests.
- `npm run test:security -- --runInBand` - PASS, 49 suites, 804 tests.

The full security suite completed successfully, so the focused fallback security command was not needed.

## Known follow-ups for 29F and later

- Sprint 29F: app message search.
- Add a real periodic scheduler binding only after the project has an approved scheduler/cron pattern.
- Consider a safe notification job dashboard only after a dedicated read model and no-leak contract are designed.
- Keep provider delivery, device tokens, push notifications, and broad queue metadata deferred to separate tracks.

## Final verdict

`SCHEDULED_ANNOUNCEMENT_PUBLISHING_REPLAY_COMPLETE`
