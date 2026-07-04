# DISMISSAL-BLUEPRINT-0A Closeout

## Sprint Name

DISMISSAL-BLUEPRINT-0A - Dismissal Domain Blueprint + ADR Mapping

## Baseline Commit

Expected baseline:

```text
2c1a211 docs: define dismissal app architecture
```

Actual baseline:

```text
2c1a211 docs: define dismissal app architecture
```

HEAD matched the expected current stable baseline.

## Files Changed

```text
docs/dismissal-domain-blueprint.md
docs/sprint-dismissal-blueprint-0a-domain-blueprint-closeout.md
```

No source, schema, migration, seed, package, environment, test, or ADR files were modified.

## ADR Files Reviewed

Dismissal App ADRs:

```text
adr/Dismissal-App/calls.md
adr/Dismissal-App/gates_duties.md
adr/Dismissal-App/notifications.md
adr/Dismissal-App/profile.md
adr/Dismissal-App/waiting_students.md
```

Parent App Smart Pickup and closeout context:

```text
adr/Parent-App/parent_smart_pickup.md
docs/sprint-9a-parent-app-contract-audit.md
docs/sprint-parent-perm-1d-final-parent-permission-closeout-regression-audit.md
```

Numbered ADRs:

```text
adr/ADR-0001-multi-tenancy-enforcement.md
adr/ADR-0002-behavior-core-module-boundary.md
adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md
```

## Existing Backend Surfaces Reviewed

Governance:

```text
PROJECT_OVERVIEW.md
ARCHITECTURE_DECISION.md
SECURITY_MODEL.md
DOMAIN_GLOSSARY.md
DIRECTORY_STRUCTURE_VISUAL.md
MODULES.md
USER_TYPES.md
V1_SCOPE.md
PRISMA_CONVENTIONS.md
ENGINEERING_RULES.md
API_CONTRACT_RULES.md
ERROR_CATALOG.md
TESTING_STRATEGY.md
Moazez-Project-Structure.json
```

Note: the requested `DIRECTORY_STRUCTURE.md` file is not present in the repository. The available directory source is `DIRECTORY_STRUCTURE_VISUAL.md`, and `Moazez-Project-Structure.json` was also reviewed.

Schema and code surfaces:

```text
prisma/schema.prisma
src/modules/iam/auth/**
src/modules/iam/**
src/modules/communication/**
src/modules/students/**
src/modules/parent-app/**
src/modules/files/**
src/modules/app-device-tokens/**
src/common/context/**
src/common/decorators/**
src/common/guards/**
src/infrastructure/database/school-scope.extension.ts
```

Note: the requested `src/modules/auth/**` and `src/modules/parent/**` paths are not present. The actual paths are `src/modules/iam/auth/**` and `src/modules/parent-app/**`.

Search terms reviewed included:

```text
UserType
PICKUP_DELEGATE
PARENT
Guardian.userId
StudentGuardian
canPickup
canReceiveNotifications
Enrollment
SchoolProfile latitude longitude
CommunicationNotification
CommunicationNotificationDelivery
AppDeviceTokenSurface
communication.messages
RequiredPermissions
ScopeResolverGuard
PermissionsGuard
```

## Major Design Decisions

- Treat ADR files as frontend/product expectations, not literal backend implementation instructions.
- Use canonical backend domain/module name `dismissal`.
- Use canonical API namespace `/api/v1/dismissal`.
- Keep Parent App Smart Pickup under `/api/v1/parent/smart-pickup` because it is the parent app surface.
- Recommend `DISMISSAL_STAFF` as a new school-scoped user type.
- Keep `PICKUP_DELEGATE` separate from `DISMISSAL_STAFF`.
- Parent ownership must reuse `Guardian.userId -> StudentGuardian -> Student -> active Enrollment`.
- Use `Guardian.canPickup` before inventing external delegate models.
- Use `SchoolProfile` location as default input only; place operational policy in future `DismissalSettings`.
- Use REST-first request lifecycle before realtime.
- Treat `DELAYED` as a computed signal in V1, not a core terminal status.
- Reuse Communication notification/chat foundations rather than creating separate engines.

## UserType Recommendation

Recommended:

```text
DISMISSAL_STAFF
```

Reason:

`DISMISSAL_STAFF` is a school operational actor for the Dismissal App. It manages active requests, calls students, confirms arrival, verifies pickup, and completes handover. It must have an active school membership and dismissal-specific permissions.

It is not:

- `PICKUP_DELEGATE`, which is a pickup person/delegate.
- `PARENT`, which creates requests for owned children.
- `STUDENT`, which is the subject of the request.
- `SCHOOL_USER`, which configures and supervises dismissal from School Dashboard.

## Domain Naming Recommendation

Recommended:

```text
Domain/module: dismissal
Canonical API namespace: /api/v1/dismissal
```

`pickup` should remain a product-facing term or optional frontend alias, not the core backend module name.

## Reuse Strategy

IAM/auth/membership:

- Use existing users, memberships, roles, permissions, `/auth/me`, `JwtAuthGuard`, `ScopeResolverGuard`, and `PermissionsGuard`.
- Do not create a Dismissal-specific login system.
- `DISMISSAL_STAFF` should receive permissions through existing membership role mapping.

Students/guardians/enrollments:

- Use `Guardian.userId`, `StudentGuardian`, `Student`, and active `Enrollment`.
- Do not create a parallel parent-child ownership model.
- Do not trust frontend child IDs without ownership validation.

Pickup delegate:

- Use existing `Guardian.canPickup` in V1.
- Keep external delegate accounts deferred unless product approves.

Communication/chat:

- Use existing Communication conversations/messages/participants/policies in future.
- Do not create Dismissal chat tables in V1.
- Do not allow arbitrary parent search by dismissal staff.

Notifications:

- Use domain events and audit first.
- Use existing `CommunicationNotification` foundations for future in-app notification center if safe.
- Extend `AppDeviceTokenSurface` only when Dismissal push is actually required.

Files:

- Dismissal V1 does not need file upload/download.
- Future complaint/proof files should go through existing files module with resource-owned authorization.

Realtime:

- Defer until request persistence and status transitions are stable.
- Publish only from committed DB state.

## Security and No-Leak Decisions

Dismissal responses must not expose:

```text
schoolId
organizationId
membershipId
roleId
actorId
userId
guardian.userId
student.userId
student.applicationId
internal enrollment ids unless approved
internal decision/admission ids
storage bucket
objectKey
raw signed URLs
audit internals
passwordHash
deletedAt
raw Prisma enum names if not part of the public contract
pickup code hashes
geofence spoofing internals
```

Allowed public fields include:

```text
request display id
student display name
grade/section/stage labels
gate display name
waiting zone label
guardian/delegate display name
relation
masked or policy-controlled phone
authorized pickup code display where allowed
request status
timestamps
waiting minutes
safe notes
```

## Open Decisions

Open decisions documented in the blueprint:

1. Staff visibility fallback when no assignments exist.
2. Phone masking policy for staff queue and active handover.
3. Whether `clientRequestId` is required for idempotency.
4. Whether V1 needs separate `QUEUED`.
5. Waiting zone normalization timing.
6. Pickup code policy scope.
7. Multi-school parent pickup under current parent active-school scope.
8. Request-scoped staff-parent chat timing.
9. Communication enum extension versus separate dismissal notification table.
10. Retention policy for requests, events, location payloads, and verification traces.
11. Whether `PICKUP_DELEGATE` becomes a login surface.
12. Whether dismissal integrates with Attendance early-leave semantics.

## Sprint Breakdown

Recommended sequence:

```text
DISMISSAL-IAM-1A - DISMISSAL_STAFF UserType + Permission Seed
DISMISSAL-CORE-1A - Settings + Gates Foundation
DISMISSAL-STAFF-1A - Staff Gate/Classroom Assignments + Profile
PARENT-DISMISSAL-1A - Parent Smart Pickup Readiness
PARENT-DISMISSAL-1B - Parent Pickup Request Creation
DISMISSAL-CALLS-1A - Active Requests Queue
DISMISSAL-CALLS-1B - Request Lifecycle Transitions
DISMISSAL-WAITING-1A - Waiting Students + Arrival Confirmation
DISMISSAL-DELIVERY-1A - Pickup Code Verification + Handover
DISMISSAL-HISTORY-1A - History + Delays + Escalations
DISMISSAL-NOTIF-1A - Dismissal Notification Center
DISMISSAL-REALTIME-1A - Live Queue Events
DISMISSAL-FE-CONTRACT-1A - Frontend Contract Final Audit
```

Each sprint is expanded in `docs/dismissal-domain-blueprint.md` with goal, likely files, schema impact, tests, risk, and dependencies.

## Commands Run

Pre-write baseline:

```text
git status --short --untracked-files=all
PASS - no output, working tree clean

git log --oneline -10
2c1a211 docs: define dismissal app architecture
5fe6fb6 docs: add admissions frontend contract audit
73ebe9d feat: add admissions dashboard action state
2fcf738 feat: add admissions workflow policy
9b6ea2d feat: add admissions document summary counters
7ab0b70 feat: add canonical guardians routes
240552a feat: expose admissions document review eligibility
64f5c53 fix: remove teacher profile role id leak
4f9763e feat: enforce teacher communication action permissions
9d4316f feat: enforce teacher homework action permissions

npx prisma validate
PASS - schema is valid
```

Post-write verification:

```text
npx prisma validate
PASS - Prisma schema loaded from prisma\schema.prisma
PASS - The schema at prisma\schema.prisma is valid

git diff --name-only
docs/dismissal-domain-blueprint.md
docs/sprint-dismissal-blueprint-0a-domain-blueprint-closeout.md

git diff --stat
PASS - two documentation files changed
PASS - no source, schema, migration, seed, package, test, environment, or ADR files changed
Note - Git reported LF will be replaced by CRLF warnings for both new docs.

git diff --check
PASS - no whitespace errors
Note - Git reported LF will be replaced by CRLF warnings for both new docs.

git status --short --untracked-files=all
 A docs/dismissal-domain-blueprint.md
 A docs/sprint-dismissal-blueprint-0a-domain-blueprint-closeout.md
```

## Git Diff Result

```text
Only the two allowed documentation files are changed.
No schema, migration, seed, package, source, test, environment, or ADR files are changed.
```

## Final Verdict

```text
READY FOR REVIEW
```
