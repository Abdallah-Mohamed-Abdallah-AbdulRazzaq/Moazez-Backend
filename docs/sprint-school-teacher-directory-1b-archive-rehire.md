# SCHOOL-TEACHER-DIRECTORY-1B-5 — Same-School Archive, Rehire, and Teacher Role Demotion

## 1. Baseline and scope

- Branch: `feat/school-teacher-directory-1b-archive-rehire`
- Baseline and current HEAD: `806c9d6ff0dd8272a0879d7ef7f41dd70aebe4e6`
- Predecessor state: Teacher Directory reads, managed update, atomic provisioning, employment transitions, transactional Session revocation, and the shared lifecycle Unit of Work are merged.
- Added runtime surface: same-School archive and rehire only, plus delegation from the existing Settings role-update path to the Teacher demotion coordinator.
- Database rows written during implementation or validation: zero.
- Schema, migration, seed, permission, credential-writer, allocation-mutation, Teacher App, avatar, and cross-School transfer changes: none.

## 2. Endpoint contracts

| Method | Framework route               | Public route                         | Result           | Permission                | Identifier          | Scope                  |
| ------ | ----------------------------- | ------------------------------------ | ---------------- | ------------------------- | ------------------- | ---------------------- |
| DELETE | `/teachers/:teacherId`        | `/api/v1/teachers/:teacherId`        | `204 No Content` | `teachers.records.manage` | `TeacherProfile.id` | trusted current School |
| POST   | `/teachers/:teacherId/rehire` | `/api/v1/teachers/:teacherId/rehire` | `200 OK`         | `teachers.records.manage` | `TeacherProfile.id` | trusted current School |

Archive has no request body or free-text reason. Rehire accepts only the approved managed Profile fields and requires teacher code, Arabic and English first/last names, preferred display language, and gender. Strict DTO validation rejects employment/account/Membership state, login/contact identity, credentials, Role/type, tenant identifiers, assignments, avatar, and deletion fields.

Live Profile resolution for archive and archived Profile resolution for rehire always include the trusted School. Missing, wrong-state, inaccessible, and foreign-School identifiers produce the same `teachers.profile.not_found` HTTP 404 without resource-existence detail. The caller supplies no School, Organization, User, Membership, or Role identifier.

## 3. Atomic archive result

Archive executes through one serializable Teacher lifecycle transaction:

1. resolve the live Profile by trusted School and Profile id;
2. revalidate the non-deleted Teacher User and exact same-School Teacher Membership/Role footprint;
3. classify allocations inside that same transaction snapshot;
4. conditionally soft-delete the exact Profile;
5. conditionally set the User to `DISABLED`;
6. conditionally set the Teacher Membership to `INACTIVE` with the fixed archive timestamp as `endedAt`;
7. revoke every unrevoked Session with that same timestamp;
8. write `teachers.profile.archive` and `teachers.account.disable` through the same transaction client;
9. commit before returning 204.

The Profile row, School, User relation, employment status, all Profile data, User type, credentials, Membership row/type/Role, allocations, dependent academic history, and prior audit history are preserved. No hard-delete delegate is used. A repeated archive no longer resolves a live Profile and therefore returns the same safe 404.

## 4. Archive allocation gate

The gate uses the Academics-owned date-first classifier. The narrow transaction operation paginates `TeacherSubjectAllocation` reads deterministically by `id` with `take=500`, reuses the existing pure classifier, counts existing timetable/lesson-plan/homework dependencies in bounded page groups, and returns aggregates only.

| Allocation state                    | Archive result                                                  |
| ----------------------------------- | --------------------------------------------------------------- |
| `current_active` or `future`        | blocked by `teachers.lifecycle.active_assignments`              |
| `current_inactive`                  | fail closed with `teachers.lifecycle.archive_conflict`          |
| `inconsistent` or `invalid`         | fail closed with `teachers.lifecycle.archive_conflict`          |
| `historical` only or no allocations | allowed; all allocation and dependent history remains unchanged |

The archive-conflict reason is the fixed `allocation_state_unproven`. Active-assignment details contain only current/future aggregate counts and approved term-state labels. The Teachers use case has no allocation mutation delegate.

## 5. Exact same-School rehire result

Rehire restores the exact archived `(schoolId, userId)` Profile row; it never creates a Profile. Normalization and completeness validation reuse the existing Teacher Directory input/domain functions. `preferredDisplayLanguage` updates only the compatibility `User.firstName`/`lastName` projection and is not persisted separately.

Required committed result:

| Dimension      | Result                                                                                |
| -------------- | ------------------------------------------------------------------------------------- |
| TeacherProfile | same id/School/User; `deletedAt=null`; complete managed values; employment `INACTIVE` |
| User           | same id; non-deleted; type `TEACHER`; status `DISABLED`; credentials unchanged        |
| Membership     | exact compatible Teacher Role; `SUSPENDED`; `endedAt=null`; non-deleted; type Teacher |
| Sessions       | stale unrevoked rows revoked inside the transaction                                   |
| Audits         | `teachers.profile.restore` and `teachers.account.rehire`                              |

One deterministic, non-operational same-School Teacher Membership footprint is restored when available. A new suspended Teacher Membership is created only when no restorable same-School history and no operational Membership exists. Any operational Membership globally—including a non-Teacher Membership in another School—blocks rehire. Multiple restorable rows fail closed as ambiguous.

A non-deleted User that was previously demoted may return to Teacher type only after every operational Membership conflict is closed. The original Profile is still restored; no second Profile is created. The exact live Teacher Role is resolved internally with same-School precedence and a single global system Role fallback. The request cannot select it.

## 6. Rehire conflicts and credential behavior

| Condition                               | Stable result                                                      |
| --------------------------------------- | ------------------------------------------------------------------ |
| another live Profile                    | role transition conflict / `teacher_live_identity_exists`          |
| any operational Membership              | role transition conflict / `teacher_operational_membership_exists` |
| ambiguous same-School history           | role transition conflict / `teacher_membership_history_ambiguous`  |
| moved or incompatible lifecycle state   | role transition conflict / `teacher_rehire_state_conflict`         |
| missing compatible Teacher Role         | `teachers.account.teacher_role_required`                           |
| school teacher-code uniqueness conflict | `teachers.profile.code_conflict`                                   |
| incomplete final Profile                | `teachers.profile.incomplete` with fixed missing-field keys        |

Missing credentials do not block rehire. Such a result remains User `DISABLED`, Membership `SUSPENDED`, employment `INACTIVE`, and exposes the existing safe credential summary with `hasPassword=false` and status `missing`. Rehire neither receives password material nor calls a credential writer, generator, hashing service, delivery service, or activation coordinator.

## 7. Settings demotion delegation

The existing `PATCH /api/v1/settings/users/:id` remains the only HTTP entry for Teacher role demotion. Existing Settings actor authorization and target-Role assignability run first. A Teacher target and non-Teacher Role delegates to `TeacherRoleDemotionCoordinator`; generic Settings mutation and generic IAM audit are not executed.

The Settings read first uses the existing active scoped Membership lookup. Only when that yields no row does it use the existing scoped lifecycle/status lookup, and only a footprint marked by Teacher User type, Membership type, or Teacher Role is accepted. This enables reviewed demotion after an employment inactivation or termination without broadening inactive non-Teacher Settings updates.

Inside one lifecycle transaction the coordinator:

1. revalidates User, exact Teacher Membership/Role, live same-School Profile, target Role, and School history;
2. reclassifies allocations within the transaction;
3. archives the Profile without changing its School/User/employment data;
4. ends the Teacher Membership as `INACTIVE` with the fixed timestamp;
5. restores one deterministic compatible non-Teacher Membership or creates a new one without reusing the Teacher row;
6. conditionally updates `User.userType` to the target Role mapping while preserving User status and display projection;
7. revokes Sessions;
8. writes `teachers.profile.archive` and `teachers.role.demote` transactionally;
9. returns the existing safe Settings response.

The target Role is re-resolved inside the transaction and must be live, non-Teacher, assignable to the current School, and either same-School or an approved global system Role. Foreign-School and platform-only Roles are not eligible.

## 8. Demotion allocation gate and rejected audit

Demotion uses the same transaction-local allocation classification:

- `current_active` or `future`: `teachers.lifecycle.active_assignments`;
- `current_inactive`, `inconsistent`, or `invalid`: `teachers.account.role_transition_conflict` with `teacher_allocation_state_unproven`;
- historical only or no allocations: demotion is allowed and all academic history is preserved.

Blocked allocation transitions attempt `teachers.role_transition.rejected` through the existing standalone rejected-audit helper. Metadata contains a fixed reason code only. If rejected-audit delivery fails, the original public exception, status, details, and message survive unchanged. No rejected path writes User, Membership, Profile, Session, or allocation state.

## 9. Transaction, Session, audit, and concurrency safety

Archive, rehire, and demotion use the existing serializable lifecycle Unit of Work. Every lifecycle operation, allocation read, successful audit, and Session revocation receives the exact same hidden `Prisma.TransactionClient`. Writes use trusted School predicates and expected source-state predicates; Profile restore/archive, Membership state movement, and reviewed User type/status movement require exactly one affected row.

The allocation predicate is read inside the serializable transaction, so an allocation insert/state race cannot silently commit a stale allow decision: the transaction must observe a consistent snapshot or fail with a serialization conflict. Profile uniqueness is also protected by the existing same-School and one-live database constraints. Serialization, affected-row, Profile uniqueness, Membership history, and operational-Membership conflicts map to stable fail-closed lifecycle conflicts. No partial state or successful audit can survive a callback failure.

Session revocation targets only `revokedAt=null` rows for the trusted User, uses the one fixed lifecycle timestamp, and returns an aggregate count. Zero rows is success. Failure becomes `teachers.lifecycle.revocation_failed` (503, `retryable=true`, fixed reason) and rolls back state and successful audits. No Session ids, token hashes, refresh tokens, credentials, request bodies, or raw errors enter the response or lifecycle metadata.

Approved successful actions are limited to:

- archive: `teachers.profile.archive`, `teachers.account.disable`;
- rehire: `teachers.profile.restore`, `teachers.account.rehire`;
- demotion: `teachers.profile.archive`, `teachers.role.demote`.

## 10. Safe errors and tenant behavior

The implementation uses the merged stable errors plus the two required catalog additions:

- `teachers.profile.not_found`;
- `teachers.profile.code_conflict`;
- `teachers.profile.incomplete`;
- `teachers.account.teacher_role_required`;
- `teachers.account.role_transition_conflict`;
- `teachers.lifecycle.active_assignments`;
- `teachers.lifecycle.archive_conflict`;
- `teachers.lifecycle.revocation_failed`.

Errors contain fixed reason codes, approved fixed field keys, or aggregate allocation counts/labels only. They contain no personal values, attempted teacher code, tenant/resource identifiers, credential material, Session data, foreign identifiers, or raw database errors. Both routes retain `teachers.records.manage`; the Teacher system Role still has no management permission. No new permission or seed change was made.

## 11. Rollback and race matrix

| Failure or race                            | Fail-closed mechanism                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Profile archived/restored concurrently     | conditional `updateMany` affected-row check plus serializable transaction |
| another live Profile appears during rehire | transaction-local check plus database one-live constraint                 |
| Membership source state moves              | expected status/`endedAt` conditional write                               |
| another operational Membership appears     | transaction-local global operational read and reviewed write checks       |
| User type/status moves                     | expected-state conditional User writes                                    |
| allocation is created or state moves       | transaction-local predicate read in serializable transaction              |
| Session revocation fails                   | callback rejects; all lifecycle writes and audits roll back               |
| first or second successful audit fails     | callback rejects; all state and Session writes roll back                  |
| response composition fails                 | response is composed before callback completion                           |
| two concurrent rehire attempts             | one-live/exact-footprint constraints and moved-state checks fail closed   |

## 12. Changed files

- `ERROR_CATALOG.md`
- `src/modules/academics/teacher-allocation/domain/teacher-allocation-lifecycle-state.ts`
- `src/modules/academics/teacher-allocation/infrastructure/teacher-allocation-lifecycle-transaction.operations.ts`
- `src/modules/academics/teacher-allocation/tests/teacher-allocation-lifecycle-transaction.spec.ts`
- `src/modules/settings/users/application/update-user.use-case.ts`
- `src/modules/settings/users/infrastructure/teacher-lifecycle-membership.operations.ts`
- `src/modules/settings/users/infrastructure/teacher-lifecycle-user.operations.ts`
- `src/modules/settings/users/tests/teacher-settings-bypass.spec.ts`
- `src/modules/teachers/directory/application/archive-teacher.use-case.ts`
- `src/modules/teachers/directory/application/rehire-teacher.use-case.ts`
- `src/modules/teachers/directory/controller/teachers.controller.ts`
- `src/modules/teachers/directory/domain/teacher-directory.errors.ts`
- `src/modules/teachers/directory/dto/teacher-directory.dto.ts`
- `src/modules/teachers/directory/teacher-directory.module.ts`
- `src/modules/teachers/directory/tests/archive-teacher.use-case.spec.ts`
- `src/modules/teachers/directory/tests/rehire-teacher.use-case.spec.ts`
- `src/modules/teachers/directory/tests/teacher-directory-contract.spec.ts`
- `src/modules/teachers/directory/tests/teacher-directory-input.spec.ts`
- `src/modules/teachers/lifecycle/application/teacher-lifecycle-transaction-error.ts`
- `src/modules/teachers/lifecycle/application/teacher-lifecycle-unit-of-work.ts`
- `src/modules/teachers/lifecycle/application/teacher-role-demotion.coordinator.ts`
- `src/modules/teachers/lifecycle/domain/teacher-lifecycle-audit.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle-transaction.operations.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle.unit-of-work.ts`
- `src/modules/teachers/lifecycle/teacher-lifecycle.module.ts`
- `src/modules/teachers/lifecycle/tests/teacher-lifecycle-operations.spec.ts`
- `src/modules/teachers/lifecycle/tests/teacher-lifecycle-unit-of-work.spec.ts`
- `src/modules/teachers/lifecycle/tests/teacher-role-demotion.coordinator.spec.ts`
- `src/modules/teachers/profile/infrastructure/teacher-profile-lifecycle.operations.ts`
- `docs/sprint-school-teacher-directory-1b-archive-rehire.md`

## 13. Validation evidence

- New archive, rehire, demotion, and transaction-local allocation suites: 4 suites, 43/43 passed after final formatting.
- Relevant Teacher, Settings Users, credential policy/writer, IAM Auth, and Academics allocation unit regressions: 28 suites, 369/369 passed after final formatting (43 new-file tests and 326 remaining focused/regression tests).
- `npm run test:migration-governance`: 39/39 passed.
- `npm run db:migrations:check`: passed; active migrations 4, new migrations 0, rebaseline off.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed with Prisma Client 6.19.3.
- `npm run build`: passed with a 4096 MiB Node heap allowance; no source workaround was required.
- Changed production TypeScript ESLint passed without a write/fix flag.
- Prettier check passed for every changed source, test, and document file after the authorized changed-file-only write.
- Final `npm run build` passed with a 4096 MiB Node heap allowance; no source workaround was required.
- Final Git, staged-file, and forbidden-scope outcomes are recorded by the final execution report.

Database-backed fixture-writing security/E2E suites were not run because the configured database is persistent development and no explicitly authorized disposable database was provided. No test was pointed at that database. All executed tests were mocked or pure and wrote zero database rows.

## 14. Deferred work

1B-6 remains responsible for the dedicated organization-authorized cross-School transfer coordinator and route convention. This subphase neither mutates an archived Profile's School nor discovers, transfers, or provisions a foreign-School identity. Assignment mutation, avatar management, credential writing, and Teacher App adoption remain deferred to their accepted phases.

## 15. Final authorization gate

```text
SCHOOL-TEACHER-DIRECTORY-1B-5: COMPLETE
DATABASE MUTATION: 0
HARD DELETES: 0
PROFILE SCHOOL MUTATIONS: 0
ALLOCATION MUTATIONS: 0
CREDENTIAL LOGIC CHANGED: 0
CROSS-SCHOOL TRANSFER: 0
SCHEMA CHANGED: 0
MIGRATIONS CHANGED: 0
SEEDS CHANGED: 0
STAGED FILES: 0
COMMIT AUTHORIZED: NO
PUSH AUTHORIZED: NO
PULL REQUEST: USER-OWNED
1B-6 AUTHORIZED: NO
```
