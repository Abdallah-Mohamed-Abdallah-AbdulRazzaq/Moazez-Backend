# DISMISSAL-E2E-1A - Full Golden Path Smoke Suite Closeout

## Sprint name

DISMISSAL-E2E-1A - Full Golden Path Smoke Suite

## Baseline commit

Expected baseline:

```text
81d37cbf docs: finalize dismissal frontend contract
```

Actual baseline at start:

```text
81d37cbf docs: finalize dismissal frontend contract
```

HEAD matched the expected baseline and the working tree was clean at preflight.

## Files changed

```text
test/e2e/dismissal-full-golden-path.e2e-spec.ts
test/security/tenancy.dismissal-full-golden-path.spec.ts
docs/sprint-dismissal-e2e-1a-full-golden-path-smoke-suite-closeout.md
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

## Runtime source changes

None.

## Golden path covered

The new e2e smoke suite runs the integrated Parent Smart Pickup to Dismissal handover flow through real REST routes:

- Parent readiness.
- Parent request creation with pickup-code issue.
- Idempotent parent creation retry without re-exposing raw pickup code.
- Assignment-matching staff active queue visibility.
- Staff request detail with safe timeline.
- `requested -> called -> moving`.
- Waiting students inclusion while moving.
- Arrival confirmation to `at_gate`.
- Ready transition.
- Parent recent calls update while ready.
- Pickup recipient discovery with short-lived recipient token.
- Verified handover through delivery with pickup code and recipient token.
- Active queue, waiting list, and active detail exclusion after terminal handover.
- Parent recent calls after handover.
- History list/detail after handover.
- Staff notification route side effects.
- Realtime publisher side effects.

## Secondary cancel path covered

The suite also creates a separate parent request and verifies:

- Parent cancel while `requested`.
- Parent recent calls show `cancelled`.
- Staff active queue excludes the cancelled request.
- History detail shows the terminal cancelled request.
- Cancel retry is idempotent and does not publish realtime events.

## Escalation smoke covered

The suite creates a separate active request and verifies:

- First escalation returns `changed=true`.
- Request status remains `requested`.
- History detail includes `request_escalated`.
- Retry returns `changed=false`.
- Exactly one escalation event/audit row is created.
- Escalation does not create notifications or realtime publishes.

## Notification assertions

The e2e suite verifies:

- Request creation creates a staff `DISMISSAL_REQUEST_CREATED` notification.
- Called, ready, and handed-over states create parent-facing notification rows through the current notification model.
- Parent cancellation creates a staff `DISMISSAL_REQUEST_CANCELLED` notification.
- Staff notification center returns safe public notification payloads.

## Realtime assertions

The e2e suite spies on `RealtimePublisherService.publishToUser` and verifies representative implemented events:

- `dismissal.request.created`
- `dismissal.queue.changed`
- `parent.smart_pickup.request.changed`
- `dismissal.request.status_changed`
- `dismissal.request.arrival_confirmed`
- `dismissal.request.delivered`
- `dismissal.request.cancelled`
- `dismissal.notification.created`

Realtime assertions do not require socket delivery, durable replay, or reconnect behavior.

## No-leak verification

The new golden path suite recursively scans every major REST response:

- readiness
- creation
- idempotent retry
- queue
- detail
- lifecycle transitions
- waiting
- arrival
- ready
- pickup recipients
- delivery
- recent calls
- history list/detail
- escalation
- cancel
- notifications

Special cases are enforced:

- raw pickup code is allowed only in the first successful parent creation response
- `pickupRecipientToken` is allowed only in pickup recipient discovery

Realtime payloads are checked for sensitive internal fields and raw pickup codes. The implemented realtime payloads include a best-effort event id; this is treated as a realtime transport detail and not as a REST response field.

## Security smoke coverage

The new security smoke verifies:

- no `/api/v1/pickup` shortcut route
- no root `/api/v1/waiting-students` route
- no root `/api/v1/notifications` route
- no Smart Pickup-specific parent notification route
- Parent cannot access dismissal queue/history/delivery surfaces
- Dismissal Staff cannot use parent request creation/cancel routes
- Teacher and Student cannot access golden-path dismissal routes
- Staff without matching assignment cannot read or mutate the request
- Parent cannot cancel after `called`, `ready`, or `handed_over`
- generic status PATCH cannot set terminal statuses
- delivery and pickup recipient discovery cannot happen before `ready`
- escalation cannot be used on terminal handed-over request

Note: `/api/v1/parent/notifications` is a pre-existing broader Parent App communication notification surface. This sprint did not add or modify it, and the security smoke asserts absence of a Smart Pickup-specific parent notification route instead.

## Tests added

```text
test/e2e/dismissal-full-golden-path.e2e-spec.ts
test/security/tenancy.dismissal-full-golden-path.spec.ts
```

## Commands run

Preflight:

```text
git status --short --untracked-files=all
git log --oneline -12
npx prisma validate
```

Focused tests during implementation:

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-full-golden-path.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-full-golden-path.spec.ts
```

Post-test verification:

```text
npx prisma validate
npx prisma generate
npm run seed
npm run build
```

Focused tests after build:

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-full-golden-path.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-full-golden-path.spec.ts
```

Contract tests:

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-fe-contract-snapshots.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-fe-contract.spec.ts
```

Regression matrix:

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

## Regressions run

All required contract, core Dismissal, delivery/history, notification/realtime, Parent Smart Pickup, core/staff/IAM, and role/app regressions passed.

## Known issues

None in runtime source. The security smoke explicitly scopes "no parent notification route" to Smart Pickup/Dismissal because the repository already contains a broader Parent App communication notification surface.

## Next required completion sprint

DISMISSAL-EXPIRY-1A - Request Expiration Worker

## Final verdict

READY FOR REVIEW.
