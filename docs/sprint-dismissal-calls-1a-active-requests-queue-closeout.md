# DISMISSAL-CALLS-1A - Active Requests Queue Closeout

## Sprint Name

DISMISSAL-CALLS-1A - Active Requests Queue

## Baseline Commit

Expected and actual baseline:

```text
33f240d feat: add parent pickup request creation
```

## Files Changed

- `src/modules/dismissal/dismissal.module.ts`
- `src/modules/dismissal/requests/**`
- `src/modules/dismissal/shared/dismissal.errors.ts`
- `src/modules/dismissal/shared/dismissal.types.ts`
- `test/e2e/dismissal-active-requests-queue.e2e-spec.ts`
- `test/security/tenancy.dismissal-calls.spec.ts`
- `test/security/tenancy.parent-smart-pickup-request.spec.ts`
- `docs/sprint-dismissal-calls-1a-active-requests-queue-closeout.md`

The parent smart-pickup request security spec was updated only to remove the stale assertion that `GET /api/v1/dismissal/requests/active` must be absent. Deferred mutation, cancel, recent-calls, pickup root, and waiting-students assertions remain.

## Schema Changes

None.

## Migration Changes

None.

## Permission Changes

None.

The new routes use the existing `dismissal.requests.view` permission.

## Routes Added

```text
GET /api/v1/dismissal/requests/active
GET /api/v1/dismissal/requests/:id
```

No status mutation, call, ready, deliver, escalate, waiting-students, parent recent-calls, parent cancel, pickup root, or waiting-students root routes were added.

## Queue Behavior

The active queue returns only requests in:

- `REQUESTED`
- `QUEUED`
- `CALLED`
- `MOVING`
- `AT_GATE`
- `READY`

Terminal statuses `HANDED_OVER`, `CANCELLED`, and `EXPIRED` are excluded. Soft-deleted and cross-school requests are hidden by scoped queries.

Supported filters:

- `status`
- `gateId`
- `stageId`
- `gradeId`
- `sectionId`
- `classroomId`
- `q`
- `page`
- `limit`
- `sort`

Sort supports `requested_at_asc`, `requested_at_desc`, and `urgency_desc`; default is urgency then oldest request first.

## Staff Assignment Visibility Behavior

`UserType.DISMISSAL_STAFF` visibility is assignment-scoped. Active assignments must match:

- current school
- staff user
- `isActive=true`
- not soft-deleted
- `startsAt` null or in the past
- `endsAt` null or in the future

Multiple assignments are ORed. Dimensions inside one assignment are ANDed across gate, stage, grade, section, and classroom. Staff with no active matching assignments receive an empty list and safe 404 for details.

## Admin Visibility Behavior

School-side actors with `dismissal.requests.view` who are not `DISMISSAL_STAFF` can view the current-school active queue. They do not receive platform-wide visibility.

## Computed Signal Behavior

Signals are computed at read time without mutating request status or creating events:

- `waitMinutes = floor((now - requestedAt) / 60000)`
- `delayed = waitMinutes >= delayThresholdMinutes`
- `urgent = waitMinutes >= urgentThresholdMinutes`

Thresholds come from `DismissalSettings`; fallback is 15/30 minutes.

## Timeline Behavior

Detail responses include safe request events only:

- public type `request_created`
- public status values
- timestamp
- safe note

Timeline responses do not expose event IDs, request IDs, actor user IDs, metadata, school IDs, or raw event objects.

## No-Leak Guarantees

Queue and detail presenters omit:

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
- `parentLatitude`
- `parentLongitude`
- `distanceMeters`
- `geofencePassed`
- `clientRequestId`
- `deletedAt`
- assignment IDs
- internal event IDs
- raw relations
- audit/storage internals

## Security Decisions

- Controllers use `JwtAuthGuard`, `ScopeResolverGuard`, and `PermissionsGuard`.
- Both routes require exact `dismissal.requests.view`.
- Controllers are thin and contain no Prisma/business logic.
- Repository queries use scoped Prisma.
- Staff assignment filtering is enforced before presenting any queue/detail record.
- Cross-school, terminal, deleted, and hidden-by-assignment details return safe 404.
- No new permissions, schema, migrations, or seeds were introduced.

## Explicit Non-Goals Preserved

Not implemented:

- lifecycle transitions
- status updates
- call/ready/deliver/escalate commands
- waiting students
- handover
- pickup code generation or verification
- cancellation
- recent calls
- notifications runtime
- realtime/socket events
- chat/communication integration
- files
- `AppDeviceTokenSurface.DISMISSAL_STAFF`
- `/api/v1/pickup`
- `/api/v1/waiting-students`

## Tests Added

- `test/e2e/dismissal-active-requests-queue.e2e-spec.ts`
- `test/security/tenancy.dismissal-calls.spec.ts`

## Commands Run

- `git status --short --untracked-files=all` - clean before implementation.
- `git log --oneline -10` - confirmed `33f240d feat: add parent pickup request creation`.
- `npx prisma validate` - passed before implementation.
- `npm run build` - passed after source implementation.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-active-requests-queue.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-calls.spec.ts` - passed.
- `npx prisma validate` - passed.
- `npx prisma generate` - passed.
- `npm run seed` - passed; seeded 221 permissions and 7 system roles.
- `npm run build` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-request.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-readiness.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` - passed.

## Known Follow-Ups

- DISMISSAL-CALLS-1B - Request Lifecycle Transitions
- DISMISSAL-WAITING-1A - Waiting Students + Arrival Confirmation
- DISMISSAL-DELIVERY-1A - Pickup Code Verification + Handover
- PARENT-DISMISSAL-1C - Recent Calls + Cancel Before Called
- DISMISSAL-NOTIFICATIONS-1A - Dismissal Notifications Runtime

## Final Verdict

READY FOR REVIEW
