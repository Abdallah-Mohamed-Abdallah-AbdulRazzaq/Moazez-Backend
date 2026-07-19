# SCHOOL-TEACHER-DIRECTORY-1B-4 — Employment Transitions and Transactional Session Revocation

## 1. Baseline and scope

- Branch: `feat/school-teacher-directory-1b-employment-transitions`
- Baseline and current HEAD: `06b36b6f3bc4468ffa98b584591171a079eb47c2`
- Predecessor: merged Teacher Directory list, detail, managed update, atomic provisioning, lifecycle Unit of Work, transactional audit/Session operations, and Academics allocation lifecycle reader.
- Runtime scope added in this subphase: one employment-status route and the narrow Settings Teacher account-status integration described below.
- Database rows written during implementation or validation: zero.
- Schema, migration, seed, permission, credential-writer, allocation-mutation, Teacher App, archive, rehire, demotion, and transfer changes: none.

## 2. Endpoint and permission

| Method  | Framework route                          | Public route                                    | Identifier          | Permission                | Scope                  |
| ------- | ---------------------------------------- | ----------------------------------------------- | ------------------- | ------------------------- | ---------------------- |
| `PATCH` | `/teachers/:teacherId/employment-status` | `/api/v1/teachers/:teacherId/employment-status` | `TeacherProfile.id` | `teachers.records.manage` | trusted current School |

The request accepts only `employmentStatus` (`ACTIVE`, `INACTIVE`, or `TERMINATED`) and optional exact ISO `effectiveAt`. Strict global DTO validation rejects account, Membership, Role, type, tenant, credential, assignment, avatar, deletion, and free-text reason fields. Calendar-invalid, normalized, or future timestamps are rejected. One resolved timestamp is reused throughout the request.

Missing, archived, inaccessible, and foreign-School Profile resolution uses the same safe `teachers.profile.not_found` HTTP 404 response. The caller cannot supply a School identifier.

## 3. Exact transition matrix

| Source     | Target       | Result                                                                              |
| ---------- | ------------ | ----------------------------------------------------------------------------------- |
| `ACTIVE`   | `INACTIVE`   | Profile `INACTIVE`; User `DISABLED`; Membership `SUSPENDED`; `endedAt=null`         |
| `ACTIVE`   | `TERMINATED` | Profile `TERMINATED`; User `DISABLED`; Membership `INACTIVE`; `endedAt=effectiveAt` |
| `INACTIVE` | `ACTIVE`     | Profile `ACTIVE`; User `ACTIVE`; Membership `ACTIVE`; `endedAt=null`                |
| `INACTIVE` | `TERMINATED` | Profile `TERMINATED`; User `DISABLED`; Membership `INACTIVE`; `endedAt=effectiveAt` |

Repeated targets and every transition out of `TERMINATED` are rejected with `teachers.lifecycle.invalid_transition` and fixed previous/next enums plus a stable reason code. A terminated employment episode can return only through the deferred 1B-5 rehire flow.

Conditional update predicates include the expected Profile employment status, expected User status, expected Membership status, expected Membership `endedAt`, trusted School, and non-deleted rows. A moved state or serializable transaction conflict fails closed as `teachers.lifecycle.invalid_transition` with `lifecycle_state_moved`; no partial transaction or success audit survives.

## 4. State separation and identity gates

`User.status`, `Membership.status`, and `TeacherProfile.employmentStatus` remain separate stored and presented dimensions. `TERMINATED` is not a Membership status; termination uses Membership `INACTIVE`.

The employment coordinator requires a live current-School Profile, non-deleted Teacher User, exact same-School Teacher Membership, Teacher Membership/User types, and a live global or same-School Role with key `teacher`. It neither repairs identity inconsistency nor creates a missing Profile or Membership. It never changes Role or User type.

Reactivation additionally requires the exact managed inactive state:

- complete Profile (`teacherCode`, Arabic and English first/last names, and gender);
- User `DISABLED`, non-deleted, and type `TEACHER`;
- Membership `SUSPENDED`, non-deleted, `endedAt=null`, and type `TEACHER`;
- exact live Teacher Role;
- credential repository projection `hasPassword=true` and status other than `missing`.

The coordinator consumes only the reduced credential projection. It does not receive a password hash and does not generate, hash, or update credentials.

## 5. Transaction and Session sequence

All lifecycle state and successful audit writes run through the existing serializable Teacher lifecycle Unit of Work and the exact same `Prisma.TransactionClient`:

1. resolve and revalidate the scoped Profile/User/Membership/Role state inside the transaction;
2. read the aggregate allocation lifecycle classification through the Academics-owned read port;
3. conditionally update Profile employment status;
4. conditionally update User account status;
5. conditionally update Membership status and `endedAt`;
6. revoke every currently unrevoked PostgreSQL Session for the trusted User with the same fixed timestamp;
7. write the approved successful audit records;
8. compose the safe response before the transaction callback completes.

Zero active Sessions is success. Session revocation accepts no token or Session identifier and returns only an affected count. Any Session operation failure becomes `teachers.lifecycle.revocation_failed` (HTTP 503, `retryable=true`, stable reason only) and rolls back lifecycle state and transaction-local audits.

## 6. Audit actions

The employment coordinator uses only:

- `teachers.employment_status.change`;
- `teachers.account.activate` or `teachers.account.disable`;
- `teachers.membership.suspend` only for the `INACTIVE` target.

Termination intentionally creates no invented Membership-inactivation audit action. The employment audit carries the approved previous/next enums and aggregate allocation counts. Metadata contains trusted UUIDs, fixed changed-field keys, fixed enum values, aggregate counts, and term-state labels only. It contains no names, contact values, notes, credentials, Session data, request body, or raw errors.

Generic Settings Teacher activation rejection attempts the standalone sanitized `teachers.role_transition.rejected` audit with reason `teacher_activation_requires_lifecycle`. Audit-delivery failure preserves the original public `teachers.lifecycle.invalid_transition` exception exactly.

## 7. Allocation and reassignment result

The Teachers coordinator depends only on the Academics-owned `TEACHER_ALLOCATION_LIFECYCLE_READER`; it has no allocation delegate and performs no allocation mutation.

`INACTIVE` and `TERMINATED` are never blocked by allocations. `current_active` or `future` makes `reassignmentRequired=true`. `historical` is retained and non-blocking. `current_inactive`, `inconsistent`, and `invalid` are surfaced as integrity-risk aggregate counts but do not block the employment transition.

The response includes only `currentActiveCount`, `futureCount`, `historicalCount`, `currentInactiveCount`, `inconsistentCount`, `invalidCount`, `integrityRiskCount`, and the stable integrity reason. It includes no allocation, term, subject, classroom, or tenant identifiers.

## 8. Settings account-status integration

The existing Settings status endpoint detects a Teacher footprint before a generic write.

| Request  | Teacher behavior                                                                      | Unchanged dimensions                                              |
| -------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Disable  | delegates to `TeacherAccountDisableCoordinator`                                       | employment, Membership, Role, User type, allocations, credentials |
| Activate | rejects before state or Session mutation with `teacher_activation_requires_lifecycle` | all state                                                         |

The disable coordinator uses the lifecycle Unit of Work to update only `User.status=DISABLED`, revoke unrevoked Sessions, and write `teachers.account.disable`. It does not query allocation state or Profile completeness. Current-School Teacher Memberships in `ACTIVE`, `SUSPENDED`, or `INACTIVE` state with `endedAt=null` are valid security-disable footprints; transferred or ended footprints are not. Non-Teacher Settings activation and disable retain their existing repository, Session, and IAM audit behavior.

## 9. Safe response and errors

The route returns the existing safe Teacher Directory detail presentation plus:

- previous and next employment status;
- separate account and Membership status;
- Membership end timestamp;
- fixed effective timestamp;
- revoked Session aggregate count;
- reassignment flag;
- aggregate-only allocation summary.

The `teacher` object remains the exact previously accepted Directory detail shape. The new `transition` and allocation-summary layers add no User, Membership, Role, School, Organization, Session, allocation, term, subject, or classroom identifier. Credential and Session material is absent.

The stable errors used are:

- `teachers.profile.not_found` (404);
- `teachers.profile.incomplete` (409; fixed missing-field keys);
- `teachers.account.role_transition_conflict` (409; stable identity reason);
- `teachers.lifecycle.invalid_transition` (409; fixed previous/next enums and stable reason);
- `teachers.lifecycle.revocation_failed` (503; retryable flag and stable reason).

The two lifecycle codes were added to `ERROR_CATALOG.md`; the global exception filter was not changed and runtime localization is not claimed.

## 10. Rollback matrix

| Failure point                       | Required result                                            | Evidence                                                |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Profile conditional write           | transaction rejects; no successful response                | focused use-case test                                   |
| User conditional write              | all prior transaction state rolls back                     | focused use-case and Unit-of-Work tests                 |
| Membership conditional write        | Profile/User changes roll back                             | focused use-case and Unit-of-Work tests                 |
| Session revocation                  | all state and audit work rolls back; safe 503              | coordinator/use-case tests                              |
| employment/account/Membership audit | state and Session revocation roll back                     | focused use-case and existing transactional audit tests |
| callback/response composition       | transaction cannot commit before callback success          | existing Unit-of-Work callback-failure test             |
| moved source state                  | conditional write or serializable transaction fails closed | focused moved-state test                                |

## 11. Changed files

- `ERROR_CATALOG.md`
- `src/modules/settings/users/application/teacher-settings-bypass.service.ts`
- `src/modules/settings/users/application/update-user-status.use-case.ts`
- `src/modules/settings/users/infrastructure/teacher-lifecycle-membership.operations.ts`
- `src/modules/settings/users/infrastructure/teacher-lifecycle-user.operations.ts`
- `src/modules/settings/users/infrastructure/users.repository.ts`
- `src/modules/settings/users/tests/teacher-settings-bypass.spec.ts`
- `src/modules/settings/users/tests/update-user-status.use-case.spec.ts`
- `src/modules/teachers/directory/application/change-teacher-employment-status.use-case.ts`
- `src/modules/teachers/directory/controller/teachers.controller.ts`
- `src/modules/teachers/directory/dto/teacher-directory.dto.ts`
- `src/modules/teachers/directory/teacher-directory.module.ts`
- `src/modules/teachers/directory/tests/change-teacher-employment-status.use-case.spec.ts`
- `src/modules/teachers/directory/tests/teacher-directory-contract.spec.ts`
- `src/modules/teachers/directory/tests/teacher-directory-input.spec.ts`
- `src/modules/teachers/lifecycle/application/teacher-account-disable.coordinator.ts`
- `src/modules/teachers/lifecycle/application/teacher-lifecycle-transaction-error.ts`
- `src/modules/teachers/lifecycle/application/teacher-lifecycle-unit-of-work.ts`
- `src/modules/teachers/lifecycle/domain/teacher-employment-transition.ts`
- `src/modules/teachers/lifecycle/domain/teacher-lifecycle.errors.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle-transaction.operations.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle.unit-of-work.ts`
- `src/modules/teachers/lifecycle/teacher-lifecycle.module.ts`
- `src/modules/teachers/lifecycle/tests/teacher-account-disable.coordinator.spec.ts`
- `src/modules/teachers/lifecycle/tests/teacher-employment-transition.spec.ts`
- `src/modules/teachers/lifecycle/tests/teacher-lifecycle-operations.spec.ts`
- `src/modules/teachers/lifecycle/tests/teacher-lifecycle-unit-of-work.spec.ts`
- `src/modules/teachers/profile/infrastructure/teacher-profile-lifecycle.operations.ts`
- `docs/sprint-school-teacher-directory-1b-employment-transitions.md`

## 12. Validation evidence

- New employment/Settings-status focused suites: 4 suites, 65/65 tests passed.
- Relevant Directory, provisioning, lifecycle, Settings, credential, IAM, and Academics regression suites: 20 suites, 254/254 tests passed.
- Changed production TypeScript ESLint: passed with no write/fix flag.
- `npm run test:migration-governance`: 39/39 passed.
- `npm run db:migrations:check`: passed; active migrations 4, new migrations 0, rebaseline off.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed with Prisma Client 6.19.3.
- `npm run build`: passed with a 4096 MiB Node heap allowance; no source workaround was required.
- Prettier check passed for every changed source/test/document file and the changed Teacher Directory range in the pre-existing broadly unformatted `ERROR_CATALOG.md`; `git diff --check`, final Git status, staged-file check, and forbidden-scope scans are recorded by the final execution report after this document is finalized.

Database-backed fixture-writing security/E2E suites were not run because no explicitly authorized disposable test database was supplied. No test was pointed at the configured persistent development database. All executed suites were mocked/pure and wrote zero database rows.

## 13. Deferred work

1B-5 remains responsible for same-School rehire and archive. This subphase adds no archive, rehire, demotion, or transfer route and does not authorize 1B-5. Teacher App adoption remains deferred; the immediate access bridge is User disablement, Membership suspension/inactivation, and transactional Session revocation.

## 14. Final authorization gate

```text
SCHOOL-TEACHER-DIRECTORY-1B-4: COMPLETE
DATABASE MUTATION: 0
ALLOCATION MUTATION: 0
CREDENTIAL LOGIC CHANGED: 0
TEACHER APP FILES CHANGED: 0
SCHEMA CHANGED: 0
MIGRATIONS CHANGED: 0
SEEDS CHANGED: 0
STAGED FILES: 0
COMMIT AUTHORIZED: NO
PUSH AUTHORIZED: NO
PULL REQUEST: USER-OWNED
1B-5 AUTHORIZED: NO
```
