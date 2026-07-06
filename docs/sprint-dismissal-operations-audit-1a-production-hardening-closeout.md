# DISMISSAL-OPERATIONS-AUDIT-1A - Production Hardening Audit Closeout

## Sprint Name

DISMISSAL-OPERATIONS-AUDIT-1A - Production Hardening Audit

## Baseline Commit

Expected and actual baseline:

```text
c85ce3b4 feat: expire stale dismissal requests
```

## Files Changed

```text
ERROR_CATALOG.md
docs/dismissal-production-readiness-audit-v1.md
docs/dismissal-api-route-inventory-v1.md
docs/sprint-dismissal-operations-audit-1a-production-hardening-closeout.md
prisma/schema.prisma
prisma/migrations/20260706153000_dismissal_operations_hardening_indexes/migration.sql
src/infrastructure/realtime/realtime-publisher.service.ts
src/infrastructure/realtime/realtime.gateway.ts
test/e2e/dismissal-production-hardening.e2e-spec.ts
test/security/tenancy.dismissal-production-hardening.spec.ts
```

## Schema Changes

Added targeted indexes only. No tables, columns, enums, models, lifecycle statuses, user types, or relation behavior were added.

## Migration Changes

Created:

```text
20260706153000_dismissal_operations_hardening_indexes
```

`npx prisma migrate dev --name dismissal_operations_hardening_indexes` was blocked by pre-existing shadow database replay drift on `20260706140000_dismissal_expiry_threshold`; no reset was performed. The migration was applied manually with `npx prisma db execute` and marked applied with `npx prisma migrate resolve`.

## Permission Changes

None.

No permission seed files were changed.

## Routes Added

None.

## Routes Changed

None.

## Runtime Source Changes

Minimal safe logging hardening:

- `RealtimePublisherService` no longer logs full Socket.io room names on publish failure.
- `RealtimeGateway` no longer logs socket ids when rejecting a socket connection.

No business flow behavior was changed.

## Index Audit Result

Reviewed Dismissal and Smart Pickup hot paths:

- Parent readiness child lookup.
- Parent request creation duplicate-active/idempotency lookup.
- Parent recent calls.
- Dismissal active queue and detail.
- Waiting students.
- Pickup recipient discovery.
- Delivery guarded update.
- History list/detail.
- Escalation event lookup.
- Expiration worker candidate scan.
- Notification list/read/read-all.
- Staff assignment matching.
- Realtime recipient resolution.

Existing indexes covered many paths, but several high-traffic list/worker paths lacked compound indexes matching filters plus sort order.

## Indexes Added

```text
dismissal_gates(school_id, is_active, deleted_at, sort_order)
dismissal_requests(school_id, status, requested_at)
dismissal_requests(school_id, requested_by_id, deleted_at, updated_at DESC)
dismissal_requests(school_id, created_at DESC)
dismissal_requests(deleted_at, status, requested_at)
communication_notifications(school_id, recipient_user_id, source_module, created_at DESC)
```

## Pagination / Sort Audit Result

Public list DTOs enforce `limit <= 100`; focused tests now assert rejection at `limit=101`.

The queue, waiting, history, recent-calls, gates, staff assignments, and notifications surfaces use deterministic ordering. Some assignment-scoped/computed list flows still perform application-level filtering and sorting after scoped candidate reads; this is documented as a known operational consideration, with the new indexes reducing candidate scan cost.

## Worker Safety Audit Result

Verified:

- Test mode skips background registration.
- Repeat job uses a stable id.
- Batch size is capped at 500.
- Dry run does not mutate.
- Concurrent runs are idempotent.
- Re-run does not duplicate events or notifications.
- Realtime publish failure does not roll back committed expiry.

## Migration Integrity Result

Reviewed recent Dismissal migrations. The audit migration contains only `CREATE INDEX IF NOT EXISTS` statements. No reset guidance was added.

Known local drift remains limited to shadow database replay behavior from the expiry migration; it is documented in the readiness doc and this closeout.

## Guard / Permission Route Metadata Result

Verified by source-backed security tests:

- Dismissal and Parent Smart Pickup controllers use `JwtAuthGuard`, `ScopeResolverGuard`, and `PermissionsGuard`.
- Parent routes use `parent.smart_pickup.*`.
- Dismissal routes use `dismissal.*`.
- No public expiry trigger route exists.
- No shortcut `/api/v1/pickup` or root `/api/v1/waiting-students` route exists.
- History and notification route ordering remains safe.

## Error Catalog Alignment Result

Updated `ERROR_CATALOG.md` to document existing `parent.smart_pickup.*` and `dismissal.*` runtime codes. No new runtime codes were introduced.

## Observability / Logging Result

Hardened realtime logs to avoid room names and socket ids. Expiry worker logs remain count-focused and safe for operational use.

## No-Leak Result

Focused tests assert representative responses and presenter sources do not expose school, organization, membership, role, guardian, enrollment, actor, staff, assignment, event, parent location, geofence, client request, deleted, metadata, pickup-code hash/salt, or pickup-recipient token internals.

## Notification / Realtime Hardening Result

Verified:

- Expiry creates `request_expired` notifications.
- Expiry re-run does not duplicate notifications.
- Realtime failure does not roll back persisted expiry, events, audit, or notifications.
- Realtime logging no longer emits room names or socket ids.

## Production Readiness Doc Summary

Created `docs/dismissal-production-readiness-audit-v1.md` with production surfaces, dependencies, migration/drift notes, index audit, worker architecture, failure behavior, notification/realtime posture, security/no-leak posture, pagination/sort bounds, audit/logging posture, non-goals, and final readiness verdict.

## Tests Added

```text
test/e2e/dismissal-production-hardening.e2e-spec.ts
test/security/tenancy.dismissal-production-hardening.spec.ts
```

## Commands Run

```powershell
git status --short --untracked-files=all
git log --oneline -12
npx prisma validate
npx prisma migrate dev --name dismissal_operations_hardening_indexes
npx prisma db execute --file prisma\migrations\20260706153000_dismissal_operations_hardening_indexes\migration.sql --schema prisma\schema.prisma
npx prisma migrate resolve --applied 20260706153000_dismissal_operations_hardening_indexes
npx prisma generate
npm run seed
npm run build
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-production-hardening.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-production-hardening.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand <required dismissal/parent/security regression files>
```

## Regressions Run

Passed in this working session:

- Production hardening focused tests.
- Expiry/golden/contract tests.
- Settings/parent regressions.
- Core dismissal regressions.
- Delivery/history regressions.
- Notification/realtime regressions.
- Parent and role regressions.

## Known Issues

`npx prisma migrate dev` is blocked locally by pre-existing shadow database replay drift on `20260706140000_dismissal_expiry_threshold`. The migration was applied and resolved manually without resetting the database.

## Next Required Completion Sprint

```text
DISMISSAL-NOTIFICATIONS-1B - Push Delivery / Device Tokens
```

## Final Verdict

READY FOR REVIEW
