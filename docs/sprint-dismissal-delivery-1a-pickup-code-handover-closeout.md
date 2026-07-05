# DISMISSAL-DELIVERY-1A - Pickup Code Verification + Handover Closeout

## Sprint name

DISMISSAL-DELIVERY-1A - Pickup Code Verification + Handover

## Baseline commit

`98e21c77 feat: add dismissal waiting students arrival`

HEAD matched the expected baseline at sprint start.

## Files changed

- `prisma/schema.prisma`
- `prisma/migrations/20260705170000_dismissal_delivery_handover/migration.sql`
- `src/modules/dismissal/dismissal.module.ts`
- `src/modules/dismissal/requests/application/deliver-dismissal-request.use-case.ts`
- `src/modules/dismissal/requests/application/list-active-dismissal-requests.use-case.ts`
- `src/modules/dismissal/requests/controller/dismissal-requests.controller.ts`
- `src/modules/dismissal/requests/dto/deliver-dismissal-request.dto.ts`
- `src/modules/dismissal/requests/infrastructure/dismissal-requests-delivery.repository.ts`
- `src/modules/dismissal/requests/presenter/dismissal-request-queue.presenter.ts`
- `src/modules/dismissal/shared/dismissal.errors.ts`
- `src/modules/dismissal/shared/pickup-code.service.ts`
- `src/modules/parent-app/smart-pickup/application/create-parent-smart-pickup-request.use-case.ts`
- `src/modules/parent-app/smart-pickup/dto/parent-smart-pickup-request.dto.ts`
- `src/modules/parent-app/smart-pickup/infrastructure/parent-smart-pickup-request.repository.ts`
- `src/modules/parent-app/smart-pickup/presenter/parent-smart-pickup-request.presenter.ts`
- `test/e2e/dismissal-delivery-handover.e2e-spec.ts`
- `test/security/tenancy.dismissal-delivery.spec.ts`
- `test/security/tenancy.dismissal-calls.spec.ts`
- `test/security/tenancy.dismissal-transitions.spec.ts`
- `test/security/tenancy.dismissal-waiting.spec.ts`
- `docs/sprint-dismissal-delivery-1a-pickup-code-handover-closeout.md`

The existing calls, transitions, and waiting security specs were updated only to remove stale forbidden-route assertions for the newly added delivery route. Deferred call, ready, escalate, waiting-student delivery, parent recent-calls, parent cancel, pickup root, and waiting-students root assertions remain.

## Schema changes

Delivery fields were added to `DismissalRequest` only:

- pickup code hash, salt, issued timestamp, and verified timestamp
- handover timestamp, handover actor relation, receiver display fields, and handover note
- indexes for `handedOverById` and `schoolId + handedOverAt`

The `User` model received the inverse `DismissalRequestHandedOverBy` relation.

No new tables, enums, request lifecycle models, notification models, file models, device-token fields, or user types were added.

## Migration changes

Added migration:

- `20260705170000_dismissal_delivery_handover`

The migration only alters `dismissal_requests` with the pickup-code and handover columns, adds the handover indexes, and adds the nullable handover actor foreign key.

`npx prisma migrate dev --name dismissal_delivery_handover` was attempted first, but local database drift blocked it and Prisma requested a reset. No reset was performed. The migration file was created manually and applied locally with `npx prisma db execute --file prisma/migrations/20260705170000_dismissal_delivery_handover/migration.sql --schema prisma/schema.prisma`.

## Permission changes

None.

The new route uses the existing permission:

- `POST /api/v1/dismissal/requests/:id/deliver` -> `dismissal.requests.deliver`

No seed files were changed.

## Routes added

- `POST /api/v1/dismissal/requests/:id/deliver`

No parent recent-calls, parent cancel, dismissal call, dismissal ready, dismissal escalate, waiting-student ready, waiting-student deliver, pickup root, or waiting-students root routes were added.

## Pickup code issue behavior

Parent request creation now issues a random numeric pickup code only when effective `DismissalSettings.requirePickupCode=true`.

On first successful request creation:

- the parent response includes pickup metadata
- the raw pickup code is returned once
- only a hash, salt, and issue timestamp are stored

When `requirePickupCode=false`, no pickup code is generated or returned and the stored pickup-code fields remain null.

Idempotent retries with the same parent `clientRequestId` return pickup metadata without revealing the raw pickup code again.

## Pickup code verification behavior

Delivery verifies pickup codes with Node built-in crypto:

- normalize by trimming and requiring exactly six digits
- hash with `scryptSync`
- compare with `timingSafeEqual`

When `requirePickupCode=true`, delivery rejects missing, malformed, incorrect, or not-issued pickup codes with stable delivery error codes. The implementation does not reveal whether a stored hash exists or why comparison failed beyond the sprint-approved machine codes.

When `requirePickupCode=false`, delivery does not require or verify a pickup code.

## Delivery/handover behavior

The delivery endpoint allows only:

- `READY -> HANDED_OVER`

Successful delivery:

- sets `status = HANDED_OVER`
- sets `handedOverAt`
- sets `handedOverById` from the current actor
- sets `pickupCodeVerifiedAt` when a required code was verified
- stores sanitized optional receiver name, receiver relation, and note
- returns a safe delivery presenter

Rejected states:

- `REQUESTED`
- `QUEUED`
- `CALLED`
- `MOVING`
- `AT_GATE`
- `CANCELLED`
- `EXPIRED`
- deleted requests
- cross-school requests
- assignment-hidden requests

Already delivered same-school visible requests return `dismissal.delivery.already_delivered`; non-visible delivered requests remain safe 404.

Generic `PATCH /api/v1/dismissal/requests/:id/status` still cannot perform `READY -> HANDED_OVER`.

## Assignment-scoped delivery behavior

`DISMISSAL_STAFF` delivery reuses the active assignment rules from queue, lifecycle, and waiting-students work:

- current school match
- current staff user match
- active assignment
- not soft-deleted
- starts/ends time window valid
- multiple assignments ORed together
- gate and academic dimensions inside one assignment ANDed together

Staff without a matching assignment receive safe 404 and do not learn whether the request exists.

## Admin delivery behavior

School-side non-`DISMISSAL_STAFF` actors with `dismissal.requests.deliver` can deliver current-school `READY` requests.

The route never accepts school, student, guardian, gate, requested-by, actor, handover actor, or status fields from the request body.

## Event behavior

Successful delivery creates one `DismissalRequestEvent`:

- `type = REQUEST_STATUS_CHANGED`
- `statusFrom = READY`
- `statusTo = HANDED_OVER`
- `actorUserId = current actor`
- optional sanitized note
- no sensitive metadata

Failed delivery validations do not mutate the request and do not create events.

Delivery timeline presentation exposes only safe event type, public status values, timestamp, and note.

## Audit behavior

Successful delivery writes a safe audit entry:

- `module = dismissal`
- `action = dismissal.request.delivered`
- `resourceType = dismissal_request`
- before/after status
- pickup-code requirement/verification booleans only
- receiver/note presence only

The audit payload does not include raw pickup code, pickup hash, pickup salt, parent location, guardian identifiers, assignment identifiers, or raw event metadata.

Failed delivery validations do not write audit records.

## Queue/waiting/detail regression behavior

Delivered requests are terminal and therefore:

- excluded from `GET /api/v1/dismissal/requests/active`
- excluded from `GET /api/v1/dismissal/waiting-students`
- hidden by `GET /api/v1/dismissal/requests/:id`, which remains active-only
- rejected by arrival confirmation with safe 404
- rejected by generic lifecycle PATCH

Existing active queue, lifecycle transition, waiting-students, parent request creation, readiness, dismissal core, dismissal staff, parent app, teacher app, and student app regressions passed.

## No-leak guarantees

Parent responses expose the raw pickup code only on the first successful request creation when pickup code is required.

Staff/admin delivery responses never expose:

- raw pickup code
- pickup code hash or salt
- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `guardianId`
- `guardian.userId`
- `student.userId`
- `student.applicationId`
- `enrollmentId`
- `requestedById`
- `actorUserId`
- `staffUserId`
- `handedOverById`
- parent location or geofence fields
- `clientRequestId`
- `deletedAt`
- assignment IDs
- internal event IDs
- raw event metadata
- raw relation objects
- audit/storage internals

Allowed public fields are limited to public request ID, child display labels, safe academic labels, safe gate fields, safe status values, handover timestamp, receiver display fields, pickup-code verification boolean, and safe timeline entries.

## Security decisions

- The delivery route uses `JwtAuthGuard`, `ScopeResolverGuard`, and `PermissionsGuard`.
- The route has exact `@RequiredPermissions('dismissal.requests.deliver')` metadata.
- Controllers remain thin and contain no Prisma/business logic.
- Delivery is scoped to the active school.
- `DISMISSAL_STAFF` delivery is assignment-scoped.
- School admins do not receive platform-wide delivery visibility.
- No permission, seed, user type, app-device-token, notification, realtime, chat, file, or parent cancel/recent-calls work was added.

## Explicit non-goals preserved

No implementation was added for:

- parent recent calls
- parent cancellation
- dismissal call action route
- dismissal ready action route
- dismissal escalation route
- waiting-student ready route
- waiting-student delivery route
- pickup-code resend
- pickup-code rotation
- pickup-code notification delivery
- pickup-code QR rendering
- external pickup delegate account flow
- delayed request escalation
- notifications runtime
- realtime/socket events
- communication/chat integration
- files
- app device token changes
- root `/api/v1/pickup`
- root `/api/v1/waiting-students`

## Tests added

- `test/e2e/dismissal-delivery-handover.e2e-spec.ts`
- `test/security/tenancy.dismissal-delivery.spec.ts`

Existing security regressions updated only for stale delivery-route absence assertions:

- `test/security/tenancy.dismissal-calls.spec.ts`
- `test/security/tenancy.dismissal-transitions.spec.ts`
- `test/security/tenancy.dismissal-waiting.spec.ts`

## Commands run

Preflight:

- `git status --short --untracked-files=all`
- `git log --oneline -10`
- `npx prisma validate`

Migration:

- `npx prisma migrate dev --name dismissal_delivery_handover`
- `npx prisma db execute --file prisma/migrations/20260705170000_dismissal_delivery_handover/migration.sql --schema prisma/schema.prisma`

Implementation verification:

- `npx prisma generate`
- `npm run build`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-delivery-handover.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-delivery.spec.ts`
- `npx prisma validate`
- `npx prisma generate`
- `npm run seed`
- `npm run build`

Regression verification:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-active-requests-queue.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-calls.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-request-lifecycle-transitions.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-transitions.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-waiting-students-arrival.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-waiting.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-request.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-readiness.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts`

Git hygiene:

- `git diff --name-only`
- `git diff --stat`
- `git diff --check`
- `git status --short --untracked-files=all`

`git diff --check` completed with exit code 0. On Windows, Git printed LF-to-CRLF working-copy warnings only; no whitespace errors were reported.

## Known follow-ups

- PARENT-DISMISSAL-1C - Recent Calls + Cancel Before Called
- DISMISSAL-NOTIFICATIONS-1A - Dismissal Notifications Runtime
- DISMISSAL-REALTIME-1A - Queue Realtime Events
- DISMISSAL-DELIVERY-1B - Pickup Delegate Verification Enhancements

## Final verdict

READY FOR REVIEW
