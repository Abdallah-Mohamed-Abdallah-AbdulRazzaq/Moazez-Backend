# DISMISSAL-FE-CONTRACT-1A - Final Frontend Contract Audit Closeout

## Sprint name

DISMISSAL-FE-CONTRACT-1A - Final Frontend Contract Audit

## Baseline commit

Expected baseline:

```text
f333c6ab feat: add dismissal history and escalation
```

Actual baseline at start:

```text
f333c6ab feat: add dismissal history and escalation
```

HEAD matched the expected baseline and the working tree was clean at preflight.

## Files changed

Expected final scope:

```text
docs/dismissal-fe-contract-v1.md
docs/dismissal-api-route-inventory-v1.md
docs/dismissal-frontend-implementation-guide-v1.md
docs/sprint-dismissal-fe-contract-1a-final-contract-audit-closeout.md
test/e2e/dismissal-fe-contract-snapshots.e2e-spec.ts
test/security/tenancy.dismissal-fe-contract.spec.ts
```

## Schema changes

None.

## Migration changes

None.

## Permission changes

None.

## Routes added

None.

## Routes changed

None.

## Docs created

- `docs/dismissal-api-route-inventory-v1.md`
- `docs/dismissal-fe-contract-v1.md`
- `docs/dismissal-frontend-implementation-guide-v1.md`
- `docs/sprint-dismissal-fe-contract-1a-final-contract-audit-closeout.md`

## Contract inventory summary

The route inventory documents all implemented Parent Smart Pickup and Dismissal Staff/Admin routes, guard chains, required permissions, DTO/presenter names, side effects, scope rules, safe-404 behavior, and intentionally absent root/future routes.

## Parent contract summary

Parent contract covers readiness, request creation, recent calls, cancellation, one-time raw pickup-code visibility, idempotency, ownership rules, and pickup-recipient/receiver hiding.

## Staff/admin contract summary

Staff/admin contract covers settings, gates, profile, staff assignments, active queue, active detail, lifecycle transitions, waiting students, pickup recipients, delivery, notifications, history, and escalation.

## History/escalation contract summary

History supports active/terminal request list/detail with filters, safe timeline, computed delay/urgent signals, and assignment visibility. Escalation creates a `REQUEST_ESCALATED` event plus audit only on first successful escalation, is idempotent, rejects terminal requests, and intentionally emits no notifications or realtime events.

## Notification/realtime contract summary

Dismissal notifications are in-app only and backed by Communication notification rows. Realtime uses the existing gateway and ten documented event names. Realtime is best-effort and must be treated as a refetch hint.

## Error matrix summary

The main contract document includes the implemented `parent.smart_pickup.*`, `dismissal.settings.*`, `dismissal.gate.*`, `dismissal.staff_assignment.*`, `dismissal.request.*`, `dismissal.waiting.*`, `dismissal.delivery.*`, `dismissal.notification.*`, `dismissal.history.*`, and `dismissal.escalation.*` error codes found in source.

## No-leak verification

The new e2e snapshot test performs recursive no-leak scans across representative Parent and Dismissal payloads. The security test verifies presenter/source boundaries for forbidden fields and documents the two approved special cases:

- raw pickup code only in first successful parent request creation response when required
- `pickupRecipientToken` only in pickup-recipient discovery response

## Security decisions

- No new permissions, seeds, schema, migrations, routes, or behavior changes.
- Contract tests verify guard and permission metadata for documented routes.
- Route inventory explicitly rejects forbidden root/future routes.
- Realtime event list is locked to implemented source names.

## Source fixes, if any

None expected. If later test execution exposes a true metadata/presenter mismatch, only minimal source fixes may be made and documented.

## Explicit non-goals preserved

No implementation was added for:

```text
expiry worker
push notifications
device-token changes
durable realtime outbox
reconnect replay
temporary external delegates
delegate OTP
delegate QR
pickup-code resend
pickup-code rotation
files
chat
staff-parent messaging
analytics dashboards
CSV export
PDF export
shift handover
new lifecycle states
new lifecycle transitions
new notification routes
new realtime event names
```

## Tests added

- `test/e2e/dismissal-fe-contract-snapshots.e2e-spec.ts`
- `test/security/tenancy.dismissal-fe-contract.spec.ts`

## Commands run

Preflight:

```text
git status --short --untracked-files=all
git log --oneline -12
npx prisma validate
```

Implementation verification:

```text
npx prisma validate
npx prisma generate
npm run seed
npm run build
```

Focused FE contract tests:

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-fe-contract-snapshots.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-fe-contract.spec.ts
```

Regression suites:

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-active-requests-queue.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-calls.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-request-lifecycle-transitions.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-transitions.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-waiting-students-arrival.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-waiting.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-delivery-handover.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-delivery.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-delivery-delegate-verification.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-delivery-delegates.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-history-delays-escalations.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-history-escalations.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-notifications-runtime.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-notifications.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-realtime-events.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-realtime.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-contract-polish.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-contract.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-readiness.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-request.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-recent-calls-cancel.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-cancel.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
```

All commands passed.

## Known follow-up completion sprints

- DISMISSAL-E2E-1A - Full Golden Path Smoke Suite
- DISMISSAL-EXPIRY-1A - Request Expiration Worker
- DISMISSAL-OPERATIONS-AUDIT-1A - Production Hardening Audit
- DISMISSAL-NOTIFICATIONS-1B - Push Delivery / Device Tokens
- DISMISSAL-REALTIME-1B - Durable Outbox / Reconnect Replay
- DISMISSAL-DELIVERY-1C - Temporary External Delegate Authorization
- DISMISSAL-COMMS-1A - Request-Scoped Staff-Parent Communication
- DISMISSAL-HISTORY-1B - Analytics / Export / SLA Dashboards
- DISMISSAL-SHIFTS-1A - Shifts / Duty Handover

## Final verdict

READY FOR REVIEW.
