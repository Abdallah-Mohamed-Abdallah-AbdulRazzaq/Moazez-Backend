# DISMISSAL-FINAL-ACCEPTANCE-1A - End-to-End Product Acceptance Closeout

## Sprint Name

DISMISSAL-FINAL-ACCEPTANCE-1A - End-to-End Product Acceptance.

## Baseline Commit

Expected and actual baseline:

```text
78192a0a feat: add dismissal push notifications
```

## Files Changed

Expected final acceptance scope:

```text
docs/dismissal-final-acceptance-v1.md
docs/sprint-dismissal-final-acceptance-1a-e2e-product-acceptance-closeout.md
docs/dismissal-production-readiness-audit-v1.md
```

The production readiness audit was updated only to mark final acceptance as completed rather than remaining.

## Schema Changes

None.

## Migration Changes

None.

## Permission Changes

None.

## Seed Changes

None.

## Routes Added

None.

## Routes Changed

None.

## Runtime Source Changes

None.

## Docs Created

- `docs/dismissal-final-acceptance-v1.md`
- `docs/sprint-dismissal-final-acceptance-1a-e2e-product-acceptance-closeout.md`

## Docs Updated

- `docs/dismissal-production-readiness-audit-v1.md`

## Tests Added

None. Existing E2E, security, contract, production-hardening, push, expiry, notification, realtime, and role regressions already cover the final acceptance surface without duplicating large setup.

## Acceptance Areas Reviewed

- Product flow acceptance.
- Contract consistency acceptance.
- Permission and role acceptance.
- Security, tenancy, and no-leak acceptance.
- Operational acceptance.
- Migration acceptance.
- Frontend handoff acceptance.

## Product Flow Acceptance Result

Accepted. The implemented V1 flow is represented by existing e2e/security/closeout evidence:

- School/admin configures settings and gates.
- School/admin assigns Dismissal Staff.
- Parent loads readiness.
- Parent creates a pickup request.
- Staff sees assignment-matching active queue.
- Staff opens request detail and transitions status.
- Waiting students reflects called/moving/at_gate/ready.
- Staff confirms arrival.
- Staff discovers pickup recipients.
- Staff delivers with recipient token and pickup code when required.
- Parent recent calls reflects terminal state.
- History list/detail reflects the safe timeline.
- Notifications, realtime hints, push delivery, expiration, and escalation behavior are covered by focused suites.

## Contract Consistency Result

Accepted. Route inventory, frontend contract, implementation guide, production readiness audit, `ERROR_CATALOG.md`, and `OBSERVABILITY.md` agree on:

- Routes and intentionally absent routes.
- Actors and permissions.
- Status model and lifecycle boundaries.
- Notification, realtime, push, and device-token behavior.
- Expiration worker behavior.
- History and escalation behavior.
- No-leak rules and special cases.
- Safe retry/idempotency rules.

## Permission / Role Acceptance Result

Accepted. Parent, Dismissal Staff, Teacher, Student, school-user, and system-role boundaries are asserted by existing seed/security regressions.

## Security / No-Leak Acceptance Result

Accepted. Representative REST, realtime, notification, and push payloads are covered by no-leak tests. Special cases remain:

- Raw pickup code only on first successful parent request creation response when required.
- `pickupRecipientToken` only from pickup-recipient discovery.
- Raw device token never returned after registration.

## Operational Acceptance Result

Accepted. PostgreSQL, Redis/BullMQ, Socket.IO, and Firebase/FCM dependency expectations are documented. REST remains source of truth. Realtime/push failures do not roll back committed domain state.

## Migration Acceptance Result

Accepted. `npx prisma validate`, `npx prisma generate`, and `npm run seed` remain required verification gates. Known local migration shadow drift and manual `migrate resolve` history are documented without reset guidance.

## Frontend Handoff Acceptance Result

Accepted. Frontend handoff documents include route inventory, contract, state model, actor/permission matrix, realtime/push fallback guidance, device-token registration, polling strategy, error matrix, no-leak checklist, and unavailable features.

## Commands Run

Preflight:

```powershell
git status --short --untracked-files=all
git log --oneline -15
npx prisma validate
```

Post-doc verification and regression commands are recorded in the final Codex response for this sprint.

Verification outcomes:

- `npx prisma validate` passed.
- `npx prisma generate` passed.
- `npm run seed` passed with 222 permissions and 7 system roles.
- `npm run build` passed.
- `npm run lint` was run. The default run timed out after hitting Node heap pressure, and a temporary `NODE_OPTIONS=--max-old-space-size=8192` rerun completed but failed on broad pre-existing lint issues outside this docs-only final acceptance change.
- Mandatory high-value regressions passed.
- Core flow regressions passed.
- Role/security regressions passed.
- Communication push unit tests passed.

## Regressions Run

Required final acceptance regressions:

- Golden path e2e/security.
- FE contract snapshots/security.
- Production hardening e2e/security.
- Push notifications e2e/security.
- Expiry worker e2e/security.
- Notifications runtime e2e/security.
- Realtime events e2e/security.
- Parent Smart Pickup core flows.
- Dismissal core flows.
- Role/security regressions.
- Communication push unit tests.

## Known Issues

- Local `migrate dev` shadow database replay drift remains documented from previous Dismissal migrations. No reset was performed or recommended.
- `npm run lint` remains a repo-wide static-analysis debt item; it is not caused by the final acceptance docs and was not fixed in this docs-only sprint.
- `DIRECTORY_STRUCTURE.md` is referenced by AGENTS.md but is absent; `DIRECTORY_STRUCTURE_VISUAL.md` exists. This is a documentation naming mismatch outside Dismissal runtime scope.
- Durable realtime replay/outbox, durable Dismissal-specific push outbox, external delegates, chat/files, analytics/export, shifts, and duty handover remain future scope by design.

## Final Verdict

READY FOR REVIEW.
