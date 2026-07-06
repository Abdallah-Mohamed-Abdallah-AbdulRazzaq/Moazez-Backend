# Dismissal Production Readiness Audit V1

## Current Implemented Production Surfaces

Ready:
- Parent Smart Pickup readiness, request creation, recent calls, and cancel-before-called.
- Dismissal settings, gates, staff profile, and staff assignments.
- Active queue/detail, lifecycle transitions, waiting students/arrival, pickup recipient discovery, and delivery/handover.
- Notifications runtime and best-effort realtime queue/request/notification events.
- History/detail, escalation, full golden path smoke coverage, frontend contract snapshots, and automatic request expiration.

Not implemented by design:
- Push delivery/device tokens for `DISMISSAL_STAFF`.
- Durable realtime replay/outbox.
- External delegate OTP/QR invitation flow.
- Chat/files integration for dismissal.
- Analytics/export, shifts, pickup-code resend, and pickup-code rotation.

## Operational Dependencies

Ready:
- PostgreSQL stores normalized Dismissal, Communication Notification, Audit Log, and IAM state.
- Redis/BullMQ powers the dismissal request expiry queue.
- Socket.io realtime is best-effort and non-authoritative.
- The REST API remains the source of truth after reconnect or missed realtime events.

Known operational consideration:
- Background expiry requires Redis/BullMQ availability outside `NODE_ENV=test`.
- Realtime can fall back to no-op or in-memory behavior; clients must poll REST surfaces as documented.

## Database Migration Notes

Ready:
- Dismissal schema is migration-driven.
- Expiry threshold migration adds only `dismissal_settings.expiry_threshold_minutes` and the `DISMISSAL_REQUEST_EXPIRED` notification enum.
- This audit adds one hardening migration containing indexes only:
  `20260706153000_dismissal_operations_hardening_indexes`.

Known operational consideration:
- `npx prisma migrate dev --name dismissal_operations_hardening_indexes` was blocked locally by pre-existing shadow database replay drift on `20260706140000_dismissal_expiry_threshold`.
- No reset was performed. The migration SQL was applied with `npx prisma db execute` and marked applied with `npx prisma migrate resolve --applied 20260706153000_dismissal_operations_hardening_indexes`.

## Indexes Reviewed and Added

Hardened in this sprint:
- `dismissal_gates(school_id, is_active, deleted_at, sort_order)` supports active gate list filtering and stable sort.
- `dismissal_requests(school_id, status, requested_at)` supports active queue and waiting-students status scans.
- `dismissal_requests(school_id, requested_by_id, deleted_at, updated_at DESC)` supports Parent recent-calls ownership and sort.
- `dismissal_requests(school_id, created_at DESC)` supports history list default sort.
- `dismissal_requests(deleted_at, status, requested_at)` supports the global expiration worker scan.
- `communication_notifications(school_id, recipient_user_id, source_module, created_at DESC)` supports dismissal notification center reads.

Verified existing indexes:
- `DismissalRequestEvent(school_id, request_id, created_at)` supports request timelines.
- `DismissalStaffAssignment(school_id, staff_user_id, is_active, deleted_at)` supports staff assignment visibility.
- `DismissalRequest(school_id, requested_by_id, client_request_id)` supports parent idempotency.
- `CommunicationNotification(school_id, source_module, source_type, source_id)` supports source-event notification lookup.

## Worker Architecture and Cadence

Ready:
- `DismissalRequestExpiryWorker` registers an internal BullMQ repeat job every minute.
- `NODE_ENV=test` skips background worker registration.
- `ExpireDismissalRequestsUseCase.runOnce` is callable for controlled tests and operations.
- Batch size defaults to 100 and is capped at `MAX_DISMISSAL_EXPIRY_BATCH_SIZE` (500).

## Worker Failure Behavior

Verified by tests:
- Dry run scans candidates without mutating requests or creating notifications.
- Concurrent runs use `SELECT ... FOR UPDATE` and conditional updates to avoid duplicate status events and notifications.
- Realtime publish failures do not roll back committed expiration, audit, events, or notifications.
- A failed candidate is caught and does not poison the whole batch.

## Worker Idempotency and Concurrency Guarantees

Ready:
- Only active statuses are eligible for expiry.
- The mutation re-checks active status and requested-at cutoff inside the transaction.
- Re-running after expiry produces no duplicate expiration notifications or status events.

## Notification and Realtime Behavior

Ready:
- Dismissal notifications are persisted for parent and matching staff recipients.
- Expiration creates `request_expired` notification rows.
- Realtime is published after commit and is best-effort.
- Realtime event payloads use presenters and do not expose REST-forbidden fields.

Hardened in this sprint:
- Realtime failure logs no longer include socket room names or socket ids.

## Security and No-Leak Posture

Ready:
- Dismissal controllers use `JwtAuthGuard`, `ScopeResolverGuard`, `PermissionsGuard`, and exact `@RequiredPermissions` metadata.
- Parent Smart Pickup routes use only `parent.smart_pickup.*` permissions.
- Dismissal routes use only `dismissal.*` permissions.
- Parent, teacher, and student roles do not receive dismissal permissions.
- Dismissal staff visibility remains assignment-scoped for queue/detail/history/delivery flows.

Verified by tests:
- Representative REST responses do not expose school, organization, membership, guardian, enrollment, actor, assignment, parent location, geofence, pickup-code hash/salt, pickup-recipient token, deleted, metadata, or raw relation internals.

## Pagination and Sort Bounds

Ready:
- Public list DTOs enforce `limit <= 100`.
- Queue, waiting-students, history, recent-calls, gates, staff assignments, and notifications use deterministic ordering with id/date tie-breakers where needed.
- Active queue and waiting-students intentionally apply assignment visibility and computed urgency after retrieving the current-school candidate set.

Known operational consideration:
- Some Dismissal list use cases perform in-memory filtering/sorting after scoped candidate fetches because staff assignment visibility and computed urgency are application-level rules. The added indexes reduce candidate scan cost, but future high-volume schools may need cursor pagination or SQL-level assignment predicates.

## Guard and Permission Posture

Ready:
- No public expiry trigger route exists.
- No `/api/v1/pickup` shortcut exists.
- No root `/api/v1/waiting-students` route exists.
- Dismissal request history routes are registered before `:id`.
- Notification `read-all` is registered before `:id/read`.

## Error Catalog Alignment

Hardened in this sprint:
- Existing runtime error codes for `parent.smart_pickup.*` and `dismissal.*` are documented in `ERROR_CATALOG.md`.
- No new runtime error codes were introduced.
- `dismissal.settings.invalid_thresholds` now explicitly covers expiry threshold validation.

## Audit Log Posture

Ready:
- Settings, gates, staff assignments, request creation/cancel/status/arrival/delivery/escalation, and automatic expiry write explicit audit rows for sensitive mutations.
- Automatic expiry records `UserType.SERVICE_ACCOUNT` with no actor id.
- Audit payloads store status/threshold facts, not pickup codes, parent coordinates, or raw relation objects.

## Observability and Logging Posture

Hardened in this sprint:
- Realtime publish failure logs include the event name and error class/message only, not room names.
- Realtime rejected-socket logs no longer include socket ids.

Known operational consideration:
- Expiry worker logs start/end counts at the application log layer. Metrics and dashboards remain an operational deployment concern for V1.

## Remaining Approved Completion Sprint

Not implemented by design:
- `DISMISSAL-NOTIFICATIONS-1B — Push Delivery / Device Tokens`

## Final Production-Readiness Verdict

Ready:
- The Dismissal / Smart Pickup V1 backend is production-ready for REST-backed operation with best-effort realtime and in-app notifications.
- The remaining major operational gap is push delivery/device token support, which is explicitly deferred to the next approved sprint.
