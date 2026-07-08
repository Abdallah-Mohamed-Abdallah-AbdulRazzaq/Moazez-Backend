# Dismissal / Smart Pickup V1 Final Acceptance

Status: accepted backend V1 release baseline.

## Release Baseline Commit

Expected and actual final accepted baseline:

```text
adcf4b34 fix: expose dismissal staff role in settings
```

This final accepted backend baseline includes the post-acceptance Settings IAM bridge fix for Dismissal Staff.

## Accepted Product Surfaces

Parent Smart Pickup:

- Readiness: `GET /api/v1/parent/smart-pickup`.
- Request creation: `POST /api/v1/parent/smart-pickup/requests`.
- Recent calls and tracker read model: `GET /api/v1/parent/smart-pickup/recent-calls`.
- Cancel before called: `POST /api/v1/parent/smart-pickup/requests/:id/cancel`.

Dismissal school-side operations:

- Settings and gates.
- Dismissal Staff profile and assignments.
- Active request queue and active detail.
- Lifecycle status transitions.
- Waiting students and arrival confirmation.
- Pickup recipient discovery and pickup-code handover.
- In-app notifications, notification read/read-all, Dismissal Staff device-token registration.
- History list/detail and manual escalation.
- Automatic request expiration worker.
- Best-effort realtime events and best-effort push delivery.

## Actor Acceptance Matrix

| Actor | User type | Accepted access |
| --- | --- | --- |
| Parent | `PARENT` | Own linked children, own requests, readiness, creation, recent calls, cancellation, Parent app device-token support. |
| Dismissal Staff | `DISMISSAL_STAFF` | Own profile, assignment-matching queue/detail/history/waiting/delivery/escalation, Dismissal Staff notification center and device tokens. |
| School admin / permitted school user | `SCHOOL_USER` | Current-school settings, gates, staff assignments, queue/history/waiting/delivery according to role permissions. |
| Teacher | `TEACHER` | No Dismissal operational or Parent Smart Pickup permissions. |
| Student | `STUDENT` | No Dismissal operational or Parent Smart Pickup permissions. |
| Pickup delegate | `PICKUP_DELEGATE` | No login surface in V1; pickup-recipient verification is token based and request scoped. |
| Service account | `SERVICE_ACCOUNT` | Internal expiration worker/audit actor only; no public REST actor surface. |

Dismissal Staff is visible and assignable from Settings Roles/Users through the existing `dismissal_staff` system role. Settings-created Dismissal Staff users persist `UserType.DISMISSAL_STAFF`.

## Route Acceptance Matrix

| Surface | Routes |
| --- | --- |
| Parent Smart Pickup | `GET /parent/smart-pickup`, `POST /parent/smart-pickup/requests`, `GET /parent/smart-pickup/recent-calls`, `POST /parent/smart-pickup/requests/:id/cancel` |
| Settings | `GET /dismissal/settings`, `PATCH /dismissal/settings` |
| Gates | `GET /dismissal/gates`, `POST /dismissal/gates`, `GET /dismissal/gates/:id`, `PATCH /dismissal/gates/:id` |
| Staff profile/assignments | `GET /dismissal/profile`, `GET /dismissal/staff-assignments`, `POST /dismissal/staff-assignments`, `GET /dismissal/staff-assignments/:id`, `PATCH /dismissal/staff-assignments/:id`, `DELETE /dismissal/staff-assignments/:id` |
| Requests | `GET /dismissal/requests/active`, `GET /dismissal/requests/:id`, `PATCH /dismissal/requests/:id/status`, `GET /dismissal/requests/:id/pickup-recipients`, `POST /dismissal/requests/:id/deliver`, `POST /dismissal/requests/:id/escalate` |
| Waiting students | `GET /dismissal/waiting-students`, `POST /dismissal/waiting-students/:id/arrival` |
| Notifications | `GET /dismissal/notifications`, `POST /dismissal/notifications/device-tokens`, `DELETE /dismissal/notifications/device-tokens/current`, `PATCH /dismissal/notifications/:id/read`, `PATCH /dismissal/notifications/read-all` |
| History | `GET /dismissal/requests/history`, `GET /dismissal/requests/history/:id` |

All paths are served with the framework global `/api/v1` prefix.

## Permission Acceptance Matrix

| Permission | Accepted route family |
| --- | --- |
| `parent.smart_pickup.view` | Parent readiness and recent calls |
| `parent.smart_pickup.request` | Parent request creation |
| `parent.smart_pickup.cancel` | Parent cancel before called |
| `dismissal.profile.view` | Staff profile |
| `dismissal.settings.view` | Settings read |
| `dismissal.settings.manage` | Settings update |
| `dismissal.gates.view` | Gate list/detail |
| `dismissal.gates.manage` | Gate create/update |
| `dismissal.staff.view` | Staff assignment list/detail |
| `dismissal.staff.manage` | Staff assignment create/update/delete |
| `dismissal.requests.view` | Queue, active detail, waiting students |
| `dismissal.requests.manage` | Status transitions and arrival confirmation |
| `dismissal.requests.deliver` | Pickup recipients and delivery |
| `dismissal.requests.escalate` | Escalation |
| `dismissal.requests.history.view` | History list/detail |
| `dismissal.notifications.view` | Dismissal notification center |
| `dismissal.notifications.manage` | Mark read/read-all |
| `app.device_tokens.manage` | Current actor device-token registration/unregistration |

Parent receives `parent.smart_pickup.*` plus shared app-device-token management only. Parent receives no `dismissal.*` permission. Dismissal Staff receives operational dismissal permissions plus `app.device_tokens.manage`; it does not receive settings or staff-assignment management. Teacher and Student do not receive Dismissal operational access.

Settings Roles exposes the existing `dismissal_staff` system role, and Settings Users create/invite/update can assign it without adding new permissions or routes.

## Lifecycle Acceptance Matrix

| Flow | Accepted behavior |
| --- | --- |
| Creation | Parent creates `REQUESTED` request after ownership, school, geofence, window, settings, gate, and duplicate-active checks. |
| Active queue | Staff/admin reads only active `requested`, `queued`, `called`, `moving`, `at_gate`, and `ready` requests. |
| Transitions | Generic PATCH supports only approved active transitions through `queued`, `called`, `moving`, `at_gate`, and `ready`. |
| Waiting | Waiting list includes called/moving/at-gate/ready; arrival moves called/moving to at_gate and no-ops at at_gate/ready. |
| Delivery | Only ready requests can be handed over; pickup code and pickup recipient token are verified when required. |
| Parent cancellation | Parent can cancel requested/queued requests; retries against cancelled owned requests are idempotent. |
| Expiration | Internal worker expires stale active requests using settings threshold or fallback. |
| History | Active and terminal history views expose safe timelines, computed delayed/urgent/escalated signals, and no raw internals. |
| Escalation | Escalation creates one event and audit record only; it does not change status and emits no notification/realtime/push. |

## Notification, Realtime, and Push Acceptance

- In-app Dismissal notifications are persisted through the Communication notification model.
- Supported notification types are request created, cancelled, called, ready, handed over, and expired.
- Notification read/read-all are recipient scoped and idempotent.
- Realtime uses the existing Socket.IO gateway and is best-effort. REST remains the source of truth.
- Realtime events are emitted after committed state changes and are safe refetch hints.
- Push delivery is best-effort through the existing communication push queue/provider.
- Dismissal Staff registers tokens through `POST /api/v1/dismissal/notifications/device-tokens`.
- Dismissal Staff unregisters tokens through `DELETE /api/v1/dismissal/notifications/device-tokens/current`.
- Push payloads use safe navigation fields only and never include pickup codes, pickup-recipient tokens, parent coordinates, raw metadata, token material, socket room names, or socket ids.

## Security and No-Leak Acceptance

Accepted no-leak posture:

- Public REST, realtime, push, and notification payloads exclude school ids, organization ids, membership ids, role ids, guardian ids, user ids, enrollment ids, requested-by ids, actor ids, staff ids, handover actor ids, assignment ids, internal event ids, parent coordinates, distance/geofence internals, client request ids, deleted timestamps, raw event metadata, raw relation objects, audit internals, storage internals, socket internals, raw device tokens, token hashes, and token ciphertext.
- Raw pickup code is exposed only in the first successful parent request creation response when code policy requires it.
- `pickupRecipientToken` is exposed only by `GET /api/v1/dismissal/requests/:id/pickup-recipients`.
- Raw device token is never returned after registration.
- Cross-school, unowned, terminal, deleted, and assignment-hidden resources use safe 404 where appropriate.
- Controllers are thin and use `JwtAuthGuard`, `ScopeResolverGuard`, `PermissionsGuard`, and exact `@RequiredPermissions` metadata.

## Migration and Seed Acceptance

- Dismissal schema is migration-driven.
- Dismissal settings/gates, staff assignment, request/event, lifecycle enum, delivery, notifications, expiry, indexes, and Dismissal Staff device-token surface migrations are documented.
- Index hardening migration is indexes-only.
- Device-token surface migration is enum-only.
- Manual local `migrate resolve` history for known shadow database drift is documented.
- `schema.prisma` matches the implemented V1 behavior.
- Seeds expose the intended roles and permissions; no final-acceptance seed change was needed.

## Operational Dependency Acceptance

- PostgreSQL is the persistence source of truth.
- Redis/BullMQ is required for the request-expiration worker and push queue processing.
- Socket.IO realtime is best-effort and non-authoritative.
- Firebase/FCM push depends on existing provider deployment credentials and the existing communication push provider setup.
- REST is canonical after reconnect, missed realtime events, skipped push, or provider failure.
- Push/realtime failures do not roll back request state, notifications, audit, or history.
- No durable Dismissal-specific realtime replay/outbox or push outbox exists in V1 by design.
- No secret, `.env`, package, provider credential, or deployment dependency was added by final acceptance.

## Frontend Handoff Acceptance

The frontend handoff is accepted through:

- `docs/dismissal-api-route-inventory-v1.md`
- `docs/dismissal-fe-contract-v1.md`
- `docs/dismissal-frontend-implementation-guide-v1.md`
- `docs/dismissal-production-readiness-audit-v1.md`

These documents cover route inventory, actor matrix, permission matrix, status model, state machine, realtime fallback, push behavior, device-token registration, polling fallback, error code matrix, no-leak checklist, known unavailable features, and operational notes.

## Known Unavailable Features

- No `/api/v1/pickup`.
- No `/api/v1/history`.
- No `/api/v1/requests/history`.
- No root `/api/v1/waiting-students`.
- No root `/api/v1/notifications`.
- No public request-expiration trigger route.
- No Smart Pickup-specific parent notification route such as `/api/v1/parent/smart-pickup/notifications`.
- No pickup-code resend or rotation.
- No delegate OTP, delegate QR, or external delegate invitation.
- No request-scoped chat or files.
- No analytics/export dashboards.
- No shifts or duty handover.
- No durable realtime replay/outbox.
- No durable Dismissal-specific push outbox.

## Known Operational Considerations

- Local `migrate dev` has documented shadow database replay drift in previous Dismissal migrations. No reset instruction is part of this acceptance.
- Some staff-assignment and computed-priority list flows filter/sort in application code after scoped candidate reads; index hardening reduces scan cost, and SQL-level assignment predicates may be a future scaling improvement.
- Expiry and push queue workers require Redis/BullMQ availability outside `NODE_ENV=test`.
- Push provider disabled/dry-run deployments should rely on REST and in-app notifications as the source of truth.
- `npm run lint` is currently not a clean release gate: the default run hit Node heap exhaustion, and a temporary 8GB heap run reported broad pre-existing TypeScript lint violations outside this final acceptance docs change.
- AGENTS.md references `DIRECTORY_STRUCTURE.md`, but this repository contains `DIRECTORY_STRUCTURE_VISUAL.md`; the missing filename is a repository documentation mismatch outside Dismissal runtime scope.

## Regression Evidence Summary

Acceptance relies on the existing focused and regression suites:

- Golden path smoke.
- FE contract snapshots and contract security.
- Production hardening.
- Push notifications.
- Expiry worker.
- Notifications runtime.
- Realtime events.
- Parent Smart Pickup readiness, request creation, recent calls/cancel, and contract polish.
- Dismissal core settings/gates, staff assignments/profile, active queue, lifecycle transitions, waiting students, delivery/handover, delegate verification, history/escalation.
- Parent, Teacher, Student, Dismissal IAM, and Dismissal security regressions.
- Communication push delivery and payload builder unit tests.
- Settings Dismissal Staff role integration tests verify role visibility, permissions listing, create/invite/update assignment, persisted user/membership type, Dismissal profile access, and denial of Settings management by default.

## Final V1 Acceptance Verdict

READY FOR REVIEW.

The Dismissal / Smart Pickup V1 backend is accepted as a coherent REST-first product baseline with best-effort realtime and push delivery, no new final-acceptance runtime behavior, and documented operational limits.
