# Post-Rebaseline Regression Register

## Status and scope

- **Required baseline:** `3504c9c33e3539172c1ab70cfbb079cce81862b0`
- **Findings 1–5 repair:** MERGED / RESOLVED
- **Communication audit branch:** `fix/communication-security-contract`
- **Communication security-contract findings:** RESOLVED WITH TEST EVIDENCE
- **Broad Communication security:** 68/68 PASS
- **Current branch status:** READY FOR REVIEW
- **Migration recovery integrity:** PASS

Scope integrity:

- No Prisma schema change.
- No migration or migration-governance change.
- No permission or role seed change.
- No Live operation.
- Dashboard Todos stash untouched.

## 1. Homework stale route expectation

### Root cause

The Sprint 13F Homework route inventory retained an absence assertion for
`GET /api/v1/parent/smart-pickup` from before the Smart Pickup domain shipped.
The route itself is not a Homework route and is now an approved Parent App V1
route.

### Canonical contract evidence

- `V1_SCOPE.md` includes Parent App smart pickup basic.
- `MODULES.md` includes `parent-app/smart-pickup`.
- `docs/dismissal-api-route-inventory-v1.md` registers the exact GET route with
  `parent.smart_pickup.view`.
- `docs/dismissal-fe-contract-v1.md` and
  `docs/dismissal-final-acceptance-v1.md` publish the same route.
- `src/modules/parent-app/smart-pickup/controller/parent-smart-pickup.controller.ts`
  implements it without weakening its approved guards or permission metadata.

### Files changed

- `test/e2e/homework-final-closeout.e2e-spec.ts`

### Resolution

Removed only the obsolete Smart Pickup absence entry from the Homework
deferred-route list. No Smart Pickup runtime route or authorization was changed.

### Tests proving the resolution

- `test/e2e/homework-final-closeout.e2e-spec.ts`: 3/3 passed, including
  exact runtime route inventory and controller guard metadata.
- Parent/Smart Pickup security regression group: 4 suites, 31/31 passed.

### Final status

**RESOLVED**

## 2. Communication teardown ordering

### Root cause

Creating a communication message generates recipient
`CommunicationNotification` rows. The closeout cleanup removed message-owned
rows and memberships, then attempted to delete users without first deleting
notification push attempts, deliveries, notifications, preferences, and device
tokens. The canonical `communication_notifications_recipient_user_id_fkey` is
`ON DELETE RESTRICT`, so the user deletion correctly failed.

The test also performed database cleanup while the Nest application and its
workers were still open, leaving lifecycle providers active during teardown.

### Canonical contract evidence

- `PRISMA_CONVENTIONS.md` defines `onDelete: Restrict` as the default and permits
  cascade only for clearly owned children.
- `prisma/schema.prisma` models the notification recipient relation with
  `onDelete: Restrict`; deliveries and push attempts are dependent rows.
- Existing notification-aware test cleanup uses the same dependent-first order.
- Communication message creation intentionally generates recipient
  notifications through `CommunicationNotificationGenerationService`.

### Files changed

- `test/e2e/communication-core-chat.e2e-spec.ts`

### Resolution

The test now identifies its notification rows and deletes, in order, push
attempts, deliveries, notifications, preferences, and app device tokens before
deleting recipient users. It closes the Nest application before database
cleanup and guarantees both application closure and external Prisma disconnect
with nested `finally` blocks. The foreign key and cascade behavior are unchanged.

### Tests proving the resolution

- `test/e2e/communication-core-chat.e2e-spec.ts`: 1/1 passed independently in
  12.557 seconds.

### Final status

**RESOLVED**

## 3. Admissions response assertion

### Root cause

The Sprint 2A flow used exact equality against application and document response
shapes that predated the approved additive Admissions frontend contract. The
application assertions omitted `documentsSummary` and `dashboardState`; the
same flow also omitted the later approved document-review fields.

### Canonical contract evidence

- `docs/admissions-frontend-contract.md` requires `documentsSummary` and
  `dashboardState` on application create/list/detail responses and defines all
  fields exactly.
- `ApplicationResponseDto` declares both properties.
- `presentApplication()` computes both properties and derives
  `dashboardState.documentSignals` from `documentsSummary`.
- `docs/sprint-adm-fe-contract-1a-admissions-frontend-contract-final-audit-closeout.md`
  accepts these additions and the document-review response fields.
- Focused Admissions document-summary, dashboard-state, frontend-contract, and
  security tests already lock the same contract.

### Files changed

- `test/e2e/admissions-flow.e2e-spec.ts`

### Resolution

Updated the exact assertions with precise empty and one-staff-document summary
values, default-policy dashboard states, and the approved staff-upload review
fields. No presenter or response property was removed.

### Tests proving the resolution

- `test/e2e/admissions-flow.e2e-spec.ts`: 3/3 passed.
- Admissions frontend contract plus security regressions: 2 suites, 49/49
  passed.

### Final status

**RESOLVED**

## 4. Homework authorization mismatch

### Security decision

The HTTP 201 was an authorization vulnerability. The authenticated actor was a
correctly provisioned `UserType.TEACHER` with an active Teacher system-role
membership. Later Teacher App permission work intentionally granted
`homework.assignments.manage` so teachers can use the ownership-checked
`/teacher/homeworks/**` adapter. The School Dashboard/core
`POST /homework/assignments` route uses the same permission, but its core use
case is school-scoped rather than teacher-allocation-owned. Permission metadata
alone therefore admitted a Teacher App actor to the broader core surface.

The test actor and expected 403 were correct. The route permission string and
Teacher role permission are both needed by their respective approved contracts;
the missing control was the user-type boundary on the core HTTP surface.

### Canonical contract evidence

- `SECURITY_MODEL.md` requires authorization by user type, role, membership,
  scope, permission, and ownership—not permission alone.
- `docs/sprint-13a-homework-core-contract-audit.md` defines `/homework/**` as
  Dashboard/core and `/teacher/homeworks/**` as the teacher-owned adapter.
- `docs/sprint-23f-homework-grades-assessments-security-closeout.md` explicitly
  states that teacher, student, and parent actors cannot use Dashboard Homework
  core routes.
- `docs/sprint-23h-homework-grades-assessments-final-closeout-audit.md` preserves
  the same route and ownership split.
- `prisma/seeds/02-system-roles.seed.ts` intentionally grants Teacher the
  Homework capabilities needed by Teacher App routes.
- Global guard registration remains unchanged in the required order:
  `JwtAuthGuard`, `ScopeResolverGuard`, `PermissionsGuard`.

### Files changed

- `src/modules/homework/guards/homework-core-access.guard.ts`
- `src/modules/homework/guards/homework-core-access.guard.spec.ts`
- all six `src/modules/homework/controller/homework-*.controller.ts` core
  controllers
- `src/modules/homework/homework.module.ts`
- `test/e2e/homework-final-closeout.e2e-spec.ts`
- `test/security/tenancy.homework.spec.ts`

### Resolution

Added a route-local `HomeworkCoreAccessGuard` to every `/homework/**` core
controller. It permits `ORGANIZATION_USER` and `SCHOOL_USER` dashboard actors
after the unchanged global auth/scope/permission guards, while rejecting
Teacher, Student, Parent, and other app actors. Teacher App use cases and their
allocation ownership checks are untouched.

The guard reads only the AsyncLocalStorage request actor written by the global
authentication path. It accepts no execution context and therefore cannot read
actor type from headers, query parameters, route parameters, or request bodies.
Missing or malformed actor identity fails with the canonical invalid-token
contract; missing, unknown, or disallowed user type fails with the canonical
forbidden `auth.scope.missing` contract without policy details. The guard has no
injected dependency, repository access, mutation, or authorization side effect.

The route closeout now asserts the exact 37-route `/api/v1/homework/**` runtime
inventory and reads Nest controller path/guard metadata. All six core controller
classes have `HomeworkCoreAccessGuard`; the Teacher, Student, and Parent
homework adapter controller classes explicitly do not.

The security regression now also proves that a teacher cannot patch another
teacher's core homework assignment, preventing a fix limited only to creation.

### Tests proving the resolution

- Guard unit regression: 1 suite, 7/7 passed.
- Exact `test/security/tenancy.homework.spec.ts`: 27/27 passed.
- Other Homework security regressions: 4 suites, 22/22 passed.
- Teacher App security regression: 55/55 passed.
- Parent App security regression: 30/30 passed.
- Smart Pickup security regression: 4 suites, 31/31 passed.
- Admissions frontend/security regression: 2 suites, 49/49 passed.
- IAM/tenancy regressions: 2 suites, 11/11 passed.

Latest Gate 1D canonical regression:
- Unit: 438/438 suites
- Unit tests: 2,548/2,548
- Security: 83/83 suites, 1,082/1,082 tests
- E2E: 100/100 suites, 478/478 tests
- Root: 1/1 suite, 1/1 test
- Wall time: approximately 1,344.2 seconds / 22.4 minutes

### Final status

**RESOLVED — PRODUCTION AUTHORIZATION FIX**

## 5. Asynchronous handles

### Root cause

The lifecycle providers themselves already implement cleanup: Nest application
closure invokes Prisma, BullMQ queue/worker, realtime Redis, Socket.io, and
presence-timer teardown. The actual leak path was the Communication test's
`afterAll`: a foreign-key exception occurred before `prisma.$disconnect()` and
`app.close()`, so those existing lifecycle hooks never ran. Cleanup also ran
before the app/workers were stopped.

### Canonical contract evidence

- `PrismaService`, `BullmqService`, notification workers, realtime gateway/state
  services, and presence service implement `OnModuleDestroy` cleanup.
- `RealtimePresenceService` clears its interval on module destruction.
- The pre-repair Communication run timed out after the teardown failure; the
  repaired independent and combined runs terminate normally.

### Files changed

- `test/e2e/communication-core-chat.e2e-spec.ts`

### Resolution

Reordered teardown to stop the Nest application and its owned infrastructure
before external database cleanup, and used `finally` blocks so both Nest closure
and Prisma disconnect execute even if cleanup fails. No `--forceExit` was added.

### Tests proving the resolution

- Communication Core Chat exits naturally: 1/1 passed independently in 12.557
  seconds.
- Every focused and affected group listed in this closeout exited naturally.
- No post-repair command used `--forceExit`; no Jest open-handle warning was
  emitted.

### Final status

**RESOLVED**

## Additional contract-backed regression repair

`test/security/tenancy.teacher-app.spec.ts` still locked the pre-Dismissal
global permission-catalog size at 222. The migration rebaseline closeout records
the current canonical seed as 232 permissions, and the seed contains the later
approved Dismissal/Smart Pickup permissions. The exact global count was updated
to 232 without changing the Teacher role's exact 54-permission assertion. The
suite then passed 55/55.

## Historical pre-audit Communication findings

Before `COMMUNICATION-SECURITY-CONTRACT-AUDIT-1A`, the unchanged broad
`test/security/tenancy.communication.spec.ts` run exited naturally at
**60/68**, with the following eight failures. At that historical checkpoint,
they were unresolved security-contract findings and were not caused by the
focused teardown or Homework authorization repairs. The table preserves the
original pre-audit evidence and risk assessment; the authoritative current
resolution follows it.

| # | Test name | Actual result | Expected result | Probable classification | Canonical evidence still needed | Security risk if runtime is wrong |
| - | --- | --- | --- | --- | --- | --- |
| 1 | `teacher cannot manage policy and parent/student cannot access dashboard communication routes` | The first app actor, `PARENT`, received 200 from `GET /api/v1/communication/conversations`; the loop stopped before `STUDENT` was observed. | 403 for Parent and Student across the core policy/admin/conversation routes. | Probable runtime core/app user-type-boundary gap. The Parent app permission needed for its participant-scoped adapter also admits the school-wide core list. | An accepted rule/ADR naming the user types allowed on core `/communication/**` reads and deciding whether core view permissions need a distinct permission or route-local guard. | A Parent or Student could enumerate same-school conversations beyond the actor-participant inbox contract. |
| 2 | `teacher access follows seeded conversation permissions` | Teacher list returned 200 and create returned 201, but core conversation PATCH returned 403. | PATCH 200 after creation. | Probable stale permission-only expectation. The accepted Teacher role omits `communication.conversations.manage`, and Sprint 28F marks core PATCH management-only. | Formal confirmation that Teacher has no core conversation-metadata mutation contract and must remain on participant-scoped Teacher App routes. | Granting the expected access without a new ownership contract could let teachers mutate school-management conversation metadata. |
| 3 | `teacher access follows seeded message permissions for participant messages` | Teacher send returned 201 and list returned 200, but core message PATCH returned 403; DELETE was not reached. | PATCH 200 and DELETE 200. | Probable stale expectation. The accepted Teacher role has message view/send but omits edit/delete, and the Teacher App route matrix has no edit/delete routes. | A product decision on whether teachers may edit/delete their own messages; if approved, define adapter paths, permission codes, ownership, time/state limits, and audit behavior. | Loosening the core permission could enable message tampering outside the intended participant/ownership boundary. |
| 4 | `parent and student cannot access dashboard participant management routes` | The first actor, `PARENT`, received 200 from the core participant list; later assertions and `STUDENT` were not reached. | 403 for Parent and Student on participant, invite, and join-request management surfaces. | Probable runtime core/app boundary gap caused by reusing `communication.conversations.view` on a core management participant list. | An explicit user-type and ownership rule for core participant-list visibility, separate from app conversation-detail participant cards. | Same-school participant identities and communication relationship graphs may be disclosed to unrelated app actors. |
| 5 | `teacher access follows seeded participant permissions` | Teacher received 403 from the core participant list; the invite-list assertion was not reached. | 200 for both participant and invite lists. | Probable stale permission-only expectation. Teacher is not a participant in the fixture conversation, lacks participant management permission, and accepted app routes are participant scoped. | A decision on whether teachers may use core participant/invite lists at all and, if so, the required participant/allocation/management boundary. | Returning 200 without that boundary could disclose member and invitation information from unrelated conversations. |
| 6 | `publishing a school announcement enqueues and generates current-school in-app notifications only` | Runtime emitted deterministic hyphenated job ID `communication-announcement-notifications-<schoolId>-<announcementId>`. | Colon-delimited job ID `communication-announcement-notifications:<schoolId>:<announcementId>`. | Definitively stale assertion after the accepted BullMQ production repair. | None: `COMM-PUSH-1A` documents that BullMQ rejects `:`; focused domain/queue tests lock the hyphenated form. | Restoring the expected colon form would make BullMQ reject the custom ID and leave notification work unqueued/pending. |
| 7 | `parent student and teacher default boundaries deny dashboard announcement routes` | The first actor, `PARENT`, received 200 from the core announcement list; later assertions and actors were not reached. | 403 for Parent, Student, and Teacher on core announcement/admin replay routes. | Probable runtime core/app boundary gap. App roles need `communication.announcements.view` for audience-filtered adapters, while the core list is school-scoped management output. | An explicit core-announcement user-type allowlist or a distinct core permission, including a decision for Teacher now that app-facing Teacher announcements exist. | App actors may see draft, unpublished, or non-audience announcements outside their app visibility rules. |
| 8 | `parent student and teacher default boundaries deny notification center routes` | The first actor, `PARENT`, received 200 from the core notification list; the delivery-list assertion and later actors were not reached. | 403 for Parent, Student, and Teacher on core notification and delivery routes. | Probable runtime core/app boundary gap. App roles need notification view for recipient-owned adapters, while core presenters include management fields. | A decision on allowed core notification user types plus proof of recipient filtering and safe field exposure for every core read. | App actors may enumerate other recipients' notification records or receive core-only recipient/actor/delivery metadata. |

At the pre-audit checkpoint, canonical evidence already pointed to an important
split: Sprint 28F says app clients must use actor-scoped Parent, Student, and
Teacher route families, while core Communication remains a permissioned
school-management surface. The subsequent audit resolved the remaining
user-type allowlist gap without weakening participant, audience, recipient, or
tenant ownership.

## COMMUNICATION-SECURITY-CONTRACT-AUDIT-1A resolution

The separate audit ran from clean branch
`fix/communication-security-contract` at `4bb61977`. Its initial independent
reproduction matched this register exactly: 60 passed, 8 failed, 68 total.
Its final result was 68 passed, 0 failed, 68 total. All eight findings are
**RESOLVED**.

The accepted Communication handoffs provide enough combined authority to close
the previously noted allowlist gap:

- `PROJECT_OVERVIEW.md` makes the School Dashboard the Communication
  operational source of truth and the apps consumers of core truth.
- `SECURITY_MODEL.md` requires user type before permission and resource
  ownership after permission.
- Sprint 28C explicitly calls the core conversation list a school-scoped
  management surface and app inboxes participant-scoped.
- Sprint 28F says core routes are for admin/core UI and app clients use their
  app families; it also records core notification/announcement response
  sensitivity.
- Sprint 28O repeats that every `/communication/**` family is core/management
  and not app-facing.
- Sprint 28M gives Teacher its approved allocation/ownership-scoped
  announcement adapter.
- The system-role seed intentionally gives Teacher/Parent/Student app
  view/send/read permissions but not core management, participant management,
  or Teacher message edit/delete permissions.

Resolution:

- Added a controller-local `CommunicationCoreAccessGuard` with the exact
  `ORGANIZATION_USER`/`SCHOOL_USER` allowlist to all nine core Communication
  controllers and nowhere else.
- Kept the global JWT, scope, and permission guard order unchanged.
- Kept Parent, Student, and Teacher adapters unchanged and ownership-filtered.
- Corrected the three stale Teacher expectations to deny core access and prove
  Teacher message adapter availability.
- Corrected the obsolete BullMQ assertion to the accepted hyphenated
  deterministic job ID.
- Corrected latent queue lifecycle fixtures to wait for the Sprint 30D
  no-active-token `SKIPPED` state instead of racing on `PENDING`.
- Added exhaustive guard tests and an exact 74-route registered runtime/
  controller-metadata inventory.

Final status for the original eight:

| # | Final classification | Status |
| - | --- | --- |
| 1 | Runtime authorization vulnerability | Fixed |
| 2 | Stale test expectation plus exposed core boundary | Fixed |
| 3 | Stale test expectation plus exposed core boundary | Fixed |
| 4 | Runtime authorization vulnerability | Fixed |
| 5 | Stale test expectation | Fixed |
| 6 | Queue contract regression in test assertion | Fixed |
| 7 | Runtime authorization vulnerability | Fixed |
| 8 | Runtime authorization vulnerability | Fixed |

Evidence at closeout:

- Broad Communication security: 68/68, natural exit.
- Core route inventory/metadata: 3/3.
- Guard unit tests: 8/8.
- Communication Core Chat: 1/1.
- Realtime/Announcements/Notifications: 1/1.
- Communication units: 61 suites / 334 tests.
- Parent, Student, and Teacher app security: 30/30, 33/33, and 55/55.
- Focused Teacher Communication: 48/48.
- Push, Firebase, and device-token slices: 31/31, 23/23, and 12/12.

Full route inventory, per-finding evidence, guard behavior, and non-impact
details are in
`docs/sprint-comm-security-contract-audit-1a-closeout.md`.

## Remaining unrelated regression debt

A broader Teacher App test pattern reported two Teacher Profile assertions
expecting `roleId`, while the current safe presenter intentionally omits that
field.

- **Future task:** `TEACHER-PROFILE-ROLE-CONTRACT-AUDIT-1A`
- **Status:** RESOLVED

Full Project Regression Gate 1A confirmed the accepted no-leak contract: the
safe role display name remains present and `roleId` is absent recursively.
Focused profile coverage (3 suites / 10 tests), Teacher/Parent/Student/general
security (5 suites / 133 tests), and the final canonical complete regression
pass: unit 438 suites / 2,548 tests, security 83 suites / 1,082 tests, E2E 100
suites / 478 tests, and root 1 suite / 1 test. The verified split union covers all 184
configured files with natural process exits. See
`docs/full-project-regression-gate-1a-closeout.md`.


## REPOSITORY-QUALITY-BASELINE-1A

- **Status:** OPEN — SEPARATE MAINTENANCE TASK
- Repository-wide ESLint and Prettier findings are pre-existing quality debt.
- Gate 1B found zero diagnostics in new TypeScript files and zero diagnostics
  on introduced/modified lines after scoped correction.
- New TypeScript files pass Prettier; untouched legacy debt remains out of
  scope and does not block the regression gate.

## TEST-RUNNER-PERFORMANCE-1A

- **Status:** OPEN — SEPARATE NON-BLOCKING OPTIMIZATION TASK
- The canonical `npm run test:regression` runner is functionally complete and
  release-correctness PASS, covering all 184 configured files through fresh
  unit, security, E2E-directory, and root Jest processes with natural exits.
- Process isolation resolved the historical cross-tree memory accumulation.
- Future work should evaluate safe CI sharding or parallelization without
  sharing mutable database state, Redis state, BullMQ jobs, or test identities.
- No test may be removed, skipped, retried, or weakened to improve duration.
- This performance debt does not block the current correctness/security gate.
- Gate 1C reference run: 1,188.6 seconds / 19.8 minutes.
- Final Gate 1D accepted run: 1,344.2 seconds / 22.4 minutes.
- Both exceed the ten-minute optimization threshold.

The remaining debts are exactly:

- `REPOSITORY-QUALITY-BASELINE-1A`
- `TEST-RUNNER-PERFORMANCE-1A`

Authoritative verdict: `FULL-PROJECT-REGRESSION-GATE-1A: READY FOR REVIEW`.

This finding is unrelated to Communication and does not block the
Communication security-contract closeout. Teacher Profile runtime code and
tests were not changed by this audit or documentation normalization.

## Verification summary

- `npx prisma validate`: PASS
- `npx prisma migrate status`: PASS; database schema up to date
- `npm run build`: PASS
- `npx tsc -p tsconfig.build.json --noEmit`: PASS
- `npm run test:migration-governance`: PASS; 39/39
- `npm run db:migrations:check`: PASS; active migration count 1, new count 0
- Required focused suites: PASS independently
- Affected Communication E2E/security: 191/191 PASS
- Affected Communication unit: 496/496 PASS
- Initial broad Communication result: 60/68
- Final broad Communication result: 68/68
- All eight Communication findings: RESOLVED
- Findings 1–5 repair: MERGED / RESOLVED
- Current branch status: READY FOR REVIEW

## Migration incident disposition

No schema or migration change is necessary for Findings 1–5. The canonical
migration recovery remains valid and unchanged. The Dashboard Todos stash
remains intact.
