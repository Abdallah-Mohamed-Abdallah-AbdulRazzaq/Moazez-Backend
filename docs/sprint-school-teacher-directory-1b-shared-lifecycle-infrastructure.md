# SCHOOL-TEACHER-DIRECTORY-1B-1 — Shared Lifecycle Infrastructure

## 1. Scope, branch, and baseline

```text
Status: shared lifecycle infrastructure implemented
Branch: feat/school-teacher-directory-1b-shared-lifecycle-infrastructure
Baseline and current HEAD: 5c9347cb7c513b25eed9db80b4867fa47601eed9
Runtime controllers or routes: none
Schema changes: none
Migration changes: none
Seed or permission changes: none
Database writes executed: none
```

This subphase implements only the internal, typed lifecycle boundaries required
by later Teacher Directory coordinators. It does not implement a directory
endpoint, Teacher provisioning, lifecycle transition use case, Settings bypass
closure, allocation mutation, avatar behavior, or Teacher App adoption.

## 2. Predecessor evidence

The merged predecessor evidence remains the entry gate for this work:

- the 1A Teacher Profile migration is applied;
- migration history passed;
- unsupported Teacher identity population is zero;
- no Teacher Profile backfill is required; and
- 1B-1 was authorized independently.

No identity-remediation command, migration command, seed command, classifier,
or backfill was run in this subphase.

## 3. Files changed

### Teachers lifecycle and Profile infrastructure

- `src/modules/teachers/lifecycle/application/teacher-lifecycle-unit-of-work.ts`
- `src/modules/teachers/lifecycle/application/teacher-rejected-transition-audit.service.ts`
- `src/modules/teachers/lifecycle/domain/teacher-lifecycle-audit.ts`
- `src/modules/teachers/lifecycle/domain/teacher-membership-state.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle-transaction.operations.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle.unit-of-work.ts`
- `src/modules/teachers/lifecycle/infrastructure/teacher-lifecycle-audit.writer.ts`
- `src/modules/teachers/lifecycle/teacher-lifecycle.module.ts`
- `src/modules/teachers/lifecycle/tests/teacher-lifecycle-audit.spec.ts`
- `src/modules/teachers/lifecycle/tests/teacher-lifecycle-operations.spec.ts`
- `src/modules/teachers/lifecycle/tests/teacher-lifecycle-unit-of-work.spec.ts`
- `src/modules/teachers/profile/infrastructure/teacher-profile-lifecycle.operations.ts`
- `src/modules/teachers/teachers.module.ts`

### IAM and Settings integration

- `src/modules/iam/auth/infrastructure/teacher-lifecycle-session.operations.ts`
- `src/modules/settings/users/infrastructure/teacher-lifecycle-user.operations.ts`
- `src/modules/settings/users/infrastructure/teacher-lifecycle-membership.operations.ts`
- `src/modules/settings/users/credentials/application/teacher-lifecycle-credential-target.policy.ts`
- `src/modules/settings/users/credentials/tests/teacher-lifecycle-credential-target.policy.spec.ts`

### Academics integration

- `src/modules/academics/teacher-allocation/application/teacher-allocation-lifecycle-read.service.ts`
- `src/modules/academics/teacher-allocation/domain/teacher-allocation-lifecycle-state.ts`
- `src/modules/academics/teacher-allocation/infrastructure/teacher-allocation.repository.ts`
- `src/modules/academics/teacher-allocation/teacher-allocation.module.ts`
- `src/modules/academics/teacher-allocation/tests/teacher-allocation-lifecycle-state.spec.ts`

### Evidence

- `docs/sprint-school-teacher-directory-1b-shared-lifecycle-infrastructure.md`

## 4. Teacher lifecycle Unit of Work contract

`TeacherLifecycleUnitOfWork.execute` owns one Prisma interactive transaction at
`Serializable` isolation. It supplies a frozen
`TeacherLifecycleTransactionContext` containing only the approved User,
Membership, TeacherProfile, successful audit, and Session operations.

The application-facing context does not expose `PrismaService`, the base Prisma
client, a generic transaction client, arbitrary delegates, or request-facing
data access. Every write closure captures the exact transaction object created
for that execution. The implementation has no optional transaction argument and
no base-client fallback.

The transaction boundary is therefore:

```text
User + Membership + TeacherProfile + successful AuditLog + required Session revocation
= one Prisma.TransactionClient
```

Callback success commits once. A thrown User, Membership, Profile, successful
audit, or Session error rejects the interactive transaction, propagates the
original failure, and prevents a lifecycle success result.

## 5. Transaction-aware operation matrix

| Boundary       | Reads                                                                                    | Writes                                                                                                               | Safety boundary                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| User           | Explicit target state and reduced credential projection                                  | Compatibility display names, account status, reviewed User type                                                      | No generic patch; password hash becomes `hasPassword` inside the boundary and is never returned                                            |
| Membership     | Exact current-school state and deterministic live/historical Teacher footprints          | Exact Teacher create, reviewed role/type, `ACTIVE`, `SUSPENDED`, `INACTIVE`, `TRANSFERRED`, explicit end/soft-delete | Explicit transaction required; school id is in every mutation predicate; no `TERMINATED` Membership status                                 |
| TeacherProfile | Current-school live, archived, trusted-id, exact school/User, and global live footprints | Create, managed-field update, same-school restore, employment status, archive                                        | Profile school and User ids are not mutable; same-school history is restored; second live and duplicate school/User footprints fail closed |
| AuditLog       | None                                                                                     | Successful lifecycle audit                                                                                           | Uses the same transaction client; audit failure rejects the lifecycle transaction                                                          |
| Session        | Aggregate unrevoked rows for a trusted User id                                           | `revokedAt` only                                                                                                     | Uses `updateMany` with `revokedAt: null`; returns count only; no Session id, token, or hash                                                |

The exact Teacher Membership predicate requires a non-deleted Membership with a
school, `Membership.userType=TEACHER`, a non-deleted related User with
`User.userType=TEACHER`, and a live `teacher` Role whose school is global or the
same Membership school. The operational predicate additionally requires
`status=ACTIVE` and `endedAt=null`.

The credential projection is limited to:

```text
hasPassword
status
mustChangePassword
passwordProvisionedAt
passwordChangedAt
credentialVersion
```

No operation returns `passwordHash` or other credential material.

## 6. Successful audit contract

The writer accepts only these actions:

```text
teachers.account.provision
teachers.account.activate
teachers.account.disable
teachers.account.rehire
teachers.account.transfer
teachers.membership.suspend
teachers.membership.transfer
teachers.profile.create
teachers.profile.update
teachers.profile.restore
teachers.profile.archive
teachers.employment_status.change
teachers.role.promote
teachers.role.demote
teachers.role_transition.rejected
```

The only resource types are `user`, `membership`, and `teacher_profile`.
Runtime validation rejects unknown actions, resource types, metadata keys,
malformed trusted UUIDs, unlisted enum values, unlisted changed-field keys,
unlisted reason codes, invalid dependency counts, and invalid term-state labels.

Allowed metadata is deterministic and restricted to trusted resource UUIDs,
fixed changed-field keys, previous/next enum values, allocation/dependency
counts, term-state labels, stable reason codes, credential booleans, and
credential version. Changed fields are deduplicated and sorted; term-state
labels use canonical order.

Names, emails, phone numbers, notes, passwords or hashes, temporary passwords,
tokens, Session ids, filenames, storage coordinates, free-text reasons, raw
errors, and arbitrary request bodies cannot pass the metadata builder.

## 7. Rejected-transition audit behavior

`TeacherRejectedTransitionAuditService.auditAndThrow` receives an already
constructed public `DomainException`, attempts a standalone sanitized
`teachers.role_transition.rejected` audit, and always throws the exact original
exception object. Audit delivery failure cannot replace its code, HTTP status,
safe details, or public message.

On delivery failure, the existing Nest logging mechanism receives only:

```text
event: teachers.role_transition.rejected.audit_delivery_failed
traceId: sanitized bounded trace id or unavailable
```

The helper never logs the attempted input, target identity, personal data, or a
raw database error.

## 8. Session revocation contract

`revokeTeacherLifecycleUserSessionsInTransaction` requires the lifecycle
transaction client, a trusted User id, and one caller-selected timestamp. It
updates only rows matching `userId` and `revokedAt=null`, sets `revokedAt` once,
and returns the aggregate affected count.

This is database-atomic with lifecycle writes only when invoked through the
same Unit of Work. It does not accept refresh tokens, duplicate JWT logic,
change logout/refresh behavior, or add an external retry queue.

## 9. Allocation lifecycle classifier and gate

Academics owns the read service and exports only the narrow
`TEACHER_ALLOCATION_LIFECYCLE_READER` port. The service requires the current
school scope, reads `TeacherSubjectAllocation` with explicit selected Term and
AcademicYear fields, and reuses the existing dependency-count repository logic.
It never mutates, deletes, clears, or reassigns an allocation.

The pure classifier uses the locked date-first states:

| State              | Meaning                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `future`           | Valid future window and inactive Term                                                             |
| `historical`       | Valid past window and inactive Term                                                               |
| `current_active`   | Current inclusive window with a live active Term and AcademicYear                                 |
| `current_inactive` | Current inclusive valid window without both active flags                                          |
| `inconsistent`     | Reversed window, active future/historical Term, or active Term with deleted/inactive AcademicYear |
| `invalid`          | Missing relation, missing date, invalid Date, or invalid `asOf`                                   |

Equality at start and end remains current. Tests cover fixed leap/date
boundaries.

The aggregate-only result contains all six counts, blocking and integrity-risk
counts, reassignment requirement, one stable integrity reason, and safe
TimetableEntry/LessonPlan/HomeworkAssignment dependency counts. It contains no
allocation, Teacher, School, Term, classroom, subject, or other foreign id.

Lifecycle meanings are locked as follows:

| Operation                             | Allocation result                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Account disable                       | Never blocked; no reassignment flag                                                                                               |
| Membership suspension                 | Never blocked; no reassignment flag                                                                                               |
| Employment `INACTIVE` or `TERMINATED` | Never blocked; retain allocations; report reassignment for current-active/future counts                                           |
| Role demotion or Profile archive      | Block current-active/future; fail closed for current-inactive/inconsistent/invalid; historical only is non-blocking and preserved |

## 10. Lifecycle credential-target exception

The existing credential endpoints, hashing, generation, persistence, and
ordinary target policy remain unchanged. The new pure policy grants no write;
it only decides whether a later reviewed rehire coordinator may pass the exact
target to the existing credential writer.

Authorization requires explicit `TEACHER_REHIRE` mode and all of:

- live `TEACHER` User with `DISABLED` account status;
- same-school live Teacher Membership with `SUSPENDED`, `endedAt=null`, exact
  live global-or-same-school Teacher Role;
- same-school live complete TeacherProfile with employment `INACTIVE`; and
- actor school equal to both Membership and Profile schools.

Missing mode, missing/incomplete Profile, any other User or Membership state,
ended/deleted Membership, Role/type mismatch, deleted Role, cross-school Role,
or foreign-school actor is denied. The policy does not activate state, create or
restore records, infer a school, hash/generate a password, write credentials, or
revoke Sessions.

## 11. Module wiring

- `TeacherLifecycleModule` owns the Unit of Work, transaction operation adapter,
  audit writer, rejected-audit helper, and sanitized logger adapter.
- `TeachersModule` imports and exports the lifecycle and Profile foundations.
- `TeacherAllocationModule` owns the allocation reader and exports only its
  application port token.
- IAM Session, Settings User/Membership, and TeacherProfile operations are
  transaction-required internal functions consumed by the Teachers adapter.
- The credential exception remains a pure Settings credential policy.

`AppModule` was not changed and `TeachersModule` was not registered for HTTP.
No Teacher controller, route provider, route DTO, or presenter was added.

## 12. Tests and validation evidence

### New focused tests

```text
Suites: 5 passed / 5 total
Tests: 73 passed / 73 total
```

The tests cover one transaction identity and rollback at every write stage,
strict audit action/resource/metadata behavior, original-error preservation,
User/Membership/Profile/Session boundaries, all six allocation states and gates,
aggregate-only allocation output, and the complete credential exception matrix.

### Existing non-database regression tests

```text
Suites: 11 passed / 11 total
Tests: 53 passed / 53 total
```

Covered existing Settings User use cases/resolver, credential use cases and
password policy, IAM login/change-password behavior, TeacherProfile integrity,
Academics Teacher allocation behavior, and school-scope extension behavior.

The database-backed TeacherProfile tenancy suite was not run against the
configured persistent development database because that suite creates and
deletes fixtures and this phase forbids database writes. Its source and all
existing tenancy/runtime files are unchanged; the accepted merged predecessor
evidence remains the database tenancy evidence for this subphase.

### Structural validation

```text
Migration governance tests: 39 passed / 39 total
Migration structure: PASS (active=4, new=0, rebaseline=off)
Prisma validate: PASS
Prisma generate: PASS
Nest build: PASS
Changed-file Prettier check: PASS
git diff --check: PASS
```

No migration deploy/dev/reset/resolve, database push, seed, remediation,
backfill, or database-writing test command was executed.

## 13. Route, schema, migration, and seed audit

The final diff contains:

```text
Controllers added or modified: 0
Routes added or modified: 0
Request/response DTOs or presenters added: 0
AppModule changes: 0
Prisma schema changes: 0
Migrations added: 0
Existing migrations modified: 0
Permission seed changes: 0
Role seed changes: 0
Assignment mutation behavior changes: 0
Database rows written: 0
```

The existing Academics allocation mutation paths are unchanged; the only
Academics behavior added is a scoped read and aggregate classifier.

## 14. Deferred work

This implementation does not authorize or start 1B-2. Deferred work includes:

- 1B-2 directory list/detail and managed record update;
- 1B-3 atomic provisioning and Settings Teacher bypass closure;
- 1B-4 employment transitions and route-level session revocation behavior;
- 1B-5 same-school rehire and archive coordinators;
- 1B-6 organization-authorized transfer;
- 1B-7 lifecycle closeout and complete HTTP security matrix;
- 1C assignment facade/mutations, 1D avatar, and 1E Teacher App adoption.

## 15. Final authorization gate

```text
SCHOOL-TEACHER-DIRECTORY-1B-1: COMPLETE
UNIT OF WORK: PASS
ONE TRANSACTION CLIENT: PASS
TRANSACTION-AWARE USER OPERATIONS: PASS
TRANSACTION-AWARE MEMBERSHIP OPERATIONS: PASS
TRANSACTION-AWARE PROFILE OPERATIONS: PASS
TRANSACTIONAL SUCCESS AUDIT: PASS
REJECTED AUDIT PRESERVES PUBLIC ERROR: PASS
TRANSACTIONAL SESSION REVOCATION: PASS
ALLOCATION LIFECYCLE SERVICE: PASS
CREDENTIAL REHIRE TARGET POLICY: PASS
DATABASE MUTATION: 0
CONTROLLERS CHANGED: 0
ROUTES CHANGED: 0
SCHEMA CHANGED: 0
MIGRATIONS ADDED: 0
EXISTING MIGRATIONS MODIFIED: 0
PERMISSION SEEDS CHANGED: 0
ROLE SEEDS CHANGED: 0
COMMIT AUTHORIZED: NO
PUSH AUTHORIZED: NO
PULL REQUEST: USER-OWNED
1B-2 AUTHORIZED: NO
```
