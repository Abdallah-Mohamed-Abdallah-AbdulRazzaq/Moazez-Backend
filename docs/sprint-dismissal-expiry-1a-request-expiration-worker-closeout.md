# DISMISSAL-EXPIRY-1A — Request Expiration Worker Closeout

## Sprint Name

DISMISSAL-EXPIRY-1A — Request Expiration Worker

## Baseline Commit

`452c7e72 test: add dismissal golden path smoke suite`

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260706140000_dismissal_expiry_threshold/migration.sql`
- `src/modules/dismissal/dismissal.module.ts`
- `src/modules/dismissal/requests/application/expire-dismissal-requests.use-case.ts`
- `src/modules/dismissal/requests/infrastructure/dismissal-requests-expiry.repository.ts`
- `src/modules/dismissal/requests/worker/dismissal-request-expiry.worker.ts`
- `src/modules/dismissal/settings/**`
- `src/modules/dismissal/notifications/**`
- `src/modules/dismissal/realtime/dismissal-realtime-events.service.ts`
- `src/modules/communication/domain/communication-notification-domain.ts`
- `src/modules/parent-app/smart-pickup/dto/parent-smart-pickup-recent-calls.dto.ts`
- `src/modules/parent-app/smart-pickup/presenter/parent-smart-pickup-recent-calls.presenter.ts`
- `test/e2e/dismissal-request-expiry-worker.e2e-spec.ts`
- `test/security/tenancy.dismissal-expiry-worker.spec.ts`
- `test/e2e/dismissal-core-settings-gates.e2e-spec.ts`
- `docs/dismissal-api-route-inventory-v1.md`
- `docs/dismissal-fe-contract-v1.md`
- `docs/dismissal-frontend-implementation-guide-v1.md`
- `docs/sprint-dismissal-expiry-1a-request-expiration-worker-closeout.md`

## Schema Changes

- Added `DismissalSettings.expiryThresholdMinutes Int @default(180) @map("expiry_threshold_minutes")`.
- Added `CommunicationNotificationType.DISMISSAL_REQUEST_EXPIRED`.
- No new request status was added. Existing `EXPIRED` status is used.
- No new tables were added.

## Migration Changes

- Added migration `20260706140000_dismissal_expiry_threshold`.
- `npx prisma migrate dev --name dismissal_expiry_threshold` was attempted and blocked by pre-existing local drift in earlier dismissal migrations.
- No reset was performed.
- Applied the migration manually with `npx prisma db execute --file prisma/migrations/20260706140000_dismissal_expiry_threshold/migration.sql --schema prisma/schema.prisma`.
- Marked it applied with `npx prisma migrate resolve --applied 20260706140000_dismissal_expiry_threshold`.

## Permission Changes

None. No seed files were changed.

## Routes Added

None.

## Routes Changed

None.

## Runtime Source Changes

- Added `ExpireDismissalRequestsUseCase.runOnce(options?: { now?: Date; batchSize?: number; dryRun?: boolean })`.
- Added `DismissalRequestsExpiryRepository` for candidate selection and guarded expiry writes.
- Added `DismissalRequestExpiryWorker`, a BullMQ repeatable worker using `* * * * *` cadence outside `NODE_ENV=test`.
- Registered `QueueModule`, repository, use case, and worker in `DismissalModule`.

## Expiry Policy / Source

- Uses `DismissalSettings.expiryThresholdMinutes` per school.
- Defaults to 180 minutes when no settings row exists.
- Settings PATCH validates expiry as greater than urgent threshold and no more than 1440 minutes.
- Settings GET exposes `thresholds.expiryMinutes`.

## Worker Architecture / Cadence / Batch

- Queue name: `dismissal-request-expiry`.
- Job name: `expire-stale-dismissal-requests`.
- Repeat cadence: every minute.
- Default batch size: 100.
- Maximum batch size: 500.
- Test mode does not auto-register the repeat job; tests call `runOnce` directly.

## Event Behavior

- Each changed request gets exactly one `REQUEST_STATUS_CHANGED` event to `EXPIRED`.
- `actorUserId` is `null`.
- Metadata is safe: `expiredBy`, `expiryThresholdMinutes`, `waitMinutes`, and `worker`.

## Audit Behavior

- Each changed request creates `dismissal.request.expired`.
- Audit actor is `null` with `UserType.SERVICE_ACCOUNT`.
- Audit before/after includes status, threshold, and wait minutes only.

## Notification Behavior

- Added safe in-app notification type `DISMISSAL_REQUEST_EXPIRED` with public filter/presenter type `request_expired`.
- Expiration creates parent-facing notification rows for requesting parents and staff-facing rows for assignment-matching dismissal staff.
- No push/device-token work was added.

## Realtime Behavior

- No new realtime event names were added.
- After commit, expiration publishes existing `dismissal.request.status_changed`, `dismissal.queue.changed`, `parent.smart_pickup.request.changed`, and staff `dismissal.notification.created` events.

## Parent Recent-Calls Behavior

- Expired requests remain visible to the owning parent in recent calls.
- Recent calls now includes `expiredAt`.
- Raw pickup codes and internal pickup-code fields remain hidden.

## Active Queue / Waiting / Detail Behavior

- Expired requests are excluded from active queue, waiting students, active detail, lifecycle PATCH, waiting arrival, and delivery.

## History Behavior

- Expired requests remain visible in history list/detail.
- Timeline includes the safe status-change event to `expired`.

## Concurrency / Idempotency Behavior

- Candidate selection is school-aware.
- Each write locks the request row with `SELECT ... FOR UPDATE` and rechecks active status, `deletedAt`, and cutoff before updating.
- Concurrent runs produce one expiry event/audit/notification set for a request.
- Re-running after expiry returns no duplicate side effects.

## No-Leak Verification

Presenters and tests verify responses/realtime payloads do not expose school, org, membership, guardian, enrollment, requestedBy, actor/staff, parent location, geofence, client idempotency, pickup-code, assignment, metadata, deleted, or raw relation internals.

## Security Decisions

- No public expiration trigger route.
- No new permissions.
- No seed changes.
- No durable realtime outbox.
- No device-token/push work.
- Manual migration path used because local drift blocked `migrate dev`.

## Explicit Non-Goals Preserved

- No new lifecycle statuses.
- No public routes.
- No request mutation endpoint for expiration.
- No push/device-token work.
- No durable realtime outbox.
- No external delegate work.
- No analytics/export/chat/shifts.

## Tests Added

- `test/e2e/dismissal-request-expiry-worker.e2e-spec.ts`
- `test/security/tenancy.dismissal-expiry-worker.spec.ts`

## Commands Run

- `git status --short --untracked-files=all`
- `git log --oneline -10`
- `npx prisma validate`
- `npx prisma migrate dev --name dismissal_expiry_threshold` (blocked by pre-existing drift; no reset)
- `npx prisma db execute --file prisma/migrations/20260706140000_dismissal_expiry_threshold/migration.sql --schema prisma/schema.prisma`
- `npx prisma migrate resolve --applied 20260706140000_dismissal_expiry_threshold`
- `npx prisma generate`
- `npm run seed`
- `npm run build`
- All focused and requested regression Jest commands listed in the sprint.

## Regressions Run

Focused expiry, golden path, FE contract, settings/core, parent smart pickup, active queue, lifecycle, waiting students, delivery, delegates, history/escalations, notifications, realtime, staff, IAM, parent-app, teacher-app, and student-app regressions all passed.

## Known Issues

- Local database migration history has pre-existing drift unrelated to this sprint. This sprint avoided reset and used manual migration application plus `migrate resolve`.

## Next Required Completion Sprint

- DISMISSAL-CALLS-1B follow-ups remain lifecycle evolution only if new product behavior is requested.
- DISMISSAL-NOTIFICATIONS-1B could add push/device-token behavior if approved later.
- Durable realtime replay/outbox remains future scope.

## Final Verdict

READY FOR REVIEW
