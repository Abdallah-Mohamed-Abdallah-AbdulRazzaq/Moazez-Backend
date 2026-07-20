# School Teacher Directory 1B-6: Cross-School Transfer Implementation

## 1. Branch and baseline

- Branch: `feat/school-teacher-directory-1b-cross-school-transfer`
- Baseline and implementation HEAD: `ce75330e270e8a123eb02ea20d188dd77b90ce21`
- Authoritative contract: `docs/sprint-school-teacher-directory-1b-transfer-scope-contract-lock.md`
- Phase: 1B-6 only. Phase 1B-7 is not authorized or implemented.

## 2. Route, controller, and modules

The only new HTTP surface is `POST /api/v1/organization-admin/teachers/:teacherId/transfer`, returning `200 OK`. It is owned by `OrganizationTeacherTransfersController`, registered through `OrganizationTeacherTransfersModule` and `OrganizationAdminModule`, and tagged `organization-admin`. `teacherId` is the live source `TeacherProfile.id`.

No transfer route was added to the current-School Teachers, Settings, or Platform Admin controllers.

## 3. Organization guard and trusted context

`OrganizationManagementOnly` uses the locked `moazez:organization_management_only` metadata key. The global guard order is:

1. `JwtAuthGuard`
2. `ScopeResolverGuard`
3. `OrganizationScopeGuard`
4. `PermissionsGuard`

`OrganizationScopeGuard` runs only for marked routes. It establishes an immutable `OrganizationScope` containing only actor, exact Membership, Organization, and Role UUIDs. The transaction boundary accepts the branded `TrustedOrganizationScope`, not route or body scope input.

School, Teacher, Platform, custom-Role, stale, inactive, deleted, ended, ambiguous, School-level, and permission-deficient callers receive the existing safe `auth.scope.missing` response before transfer resource lookup.

## 4. Exact Membership and Role validation

The IAM projection is keyed only by the authenticated actor id, uses deterministic ordering, and takes at most two qualifying Memberships. It requires:

- an active, non-deleted `ORGANIZATION_USER`;
- exactly one active, non-ended, non-deleted Organization Membership with no School;
- an active, non-deleted Organization;
- the live global system `organization_admin` Role;
- `teachers.records.manage`;
- exact equality with the Membership already resolved by `ScopeResolverGuard`.

The guard also revalidates these fields defensively. Inside the serializable transaction, parameterized locked reads revalidate the actor User, Membership, Organization, Role, permission relationship, and exact trusted UUID tuple.

## 5. Permission decision

The route reuses only `teachers.records.manage`. No permission or Role seed changed. Permission possession does not substitute for the Organization actor, Membership, Organization, and Role gates.

## 6. Safe ownership resolver

The narrow transaction repository resolves and locks both the source Profile/School and destination School before classifying absence. Both Schools must be active, non-deleted, and owned by the exact trusted Organization. Missing, archived, inactive, deleted, foreign-Organization, cross-Organization, and guessed resources map to the indistinguishable `teachers.lifecycle.transfer_not_found` 404 with no details.

The implementation uses only parameterized tagged-template `$queryRaw` where row locking is required. It contains no `$queryRawUnsafe`, generic unscoped repository, scope bypass, or request-supplied Organization scope.

## 7. Source-state matrix

The domain selector accepts only the six locked coherent tuples across Profile employment, User account, and Membership state. The Membership must be the exact non-deleted, non-ended source-School Teacher Membership with a compatible live global or same-School Teacher Role. It rejects competing operational Memberships and ambiguous open source candidates.

A missing credential is allowed. An incomplete source Profile is allowed only for the exact `INACTIVE` Profile, `DISABLED` User, `SUSPENDED` Membership, `endedAt=null` state. Terminated, suspended-User, ended, transferred, inactive, wrong-type, wrong-Role, and unlisted states fail with a stable source conflict reason.

## 8. Destination-state matrix

Same-School transfer is rejected only after ownership is proven. Profile footprints enforce one live source Profile globally and choose either creation or restoration of the one archived destination-School Profile. Live or ambiguous destination Profile history fails closed.

Membership footprints choose either creation or restoration of one compatible non-deleted historical Teacher Membership. Deleted Memberships remain history and are not restored. Operational, incompatible-Role, or ambiguous destination Membership histories fail closed.

The destination Teacher Role is resolved internally with deterministic precedence: exactly one same-School live Teacher Role, otherwise exactly one live global system Teacher Role. Its scope and live state are revalidated while the Role row is locked.

## 9. Request DTO

`TransferTeacherToSchoolDto` requires the destination School UUID, normalized teacher code, four managed bilingual names, preferred display language, and gender. It supports only the locked nullable destination employment fields. Omitted working days become `[]`; every other omitted optional destination field becomes `null`.

Existing Teacher Directory domain functions perform trimming, teacher-code normalization, calendar-valid date parsing, time-pair/order checks, weekday uniqueness/canonical ordering, completeness, and display projection. The strict global DTO policy rejects tenant, source, account, Membership, Role, credential, allocation, avatar, and deletion fields.

## 10. Transaction operations and lock order

`TransferTeacherBetweenSchoolsCoordinator` uses the existing Teacher lifecycle Unit of Work at `Serializable` isolation and captures one `lifecycleAt` before entering it. The same hidden Prisma transaction reaches Organization transfer reads/locks, source Membership mutation, source Profile archive, destination Profile and Membership creation/restoration, User changes, allocation classification, Session revocation, and all successful audits.

The transaction context exposes only `OrganizationTeacherTransferTransactionOperations`; it does not expose Prisma or generic delegates to the controller or coordinator. Expected-state predicates, affected-row checks, uniqueness constraints, row locks, and serialization-conflict mapping fail closed without an internal retry.

## 11. Source persisted result

The source Profile keeps its id, source School, User, employment state, managed fields, and avatar relation; only `deletedAt=lifecycleAt` changes. The source Membership keeps its id, source School, Organization, User type, Role, and non-deleted state; it becomes `TRANSFERRED` with `endedAt=lifecycleAt`. No row is hard-deleted and the source Profile School is never mutated.

## 12. Destination persisted result

The destination Profile is created or its exact archived School/User row is restored with only destination command fields. It is complete, live, and explicitly `INACTIVE`. The destination Membership is created or its exact compatible non-deleted history is restored with the selected Teacher Role, `TEACHER` type, `SUSPENDED` status, and `endedAt=null`.

The global User remains `TEACHER`, retains identity and credentials, receives only the approved destination display-name projection, and is forced `DISABLED`. The committed aggregate therefore has one live destination Profile, no operational Teacher Membership, and no active account access.

## 13. Allocation and academic-history preservation

The coordinator uses the Academics-owned transaction lifecycle classifier. Allocation state never blocks transfer. Current-active/future counts set `reassignmentRequired`; current-inactive/inconsistent/invalid counts set `integrityReviewRequired`; historical rows remain preserved and non-blocking.

No allocation, timetable, lesson-plan, or homework mutation or copy operation was added. Only aggregate-safe allocation counts and the stable integrity reason enter the response/audit contract.

## 14. Credential preservation

No credential writer, password hasher/generator, delivery operation, or credential endpoint changed. The existing credential projection is read only for the safe destination response and bounded audit booleans/version. Password hashes and credential material never cross the repository boundary.

## 15. Session revocation

The existing transaction-aware Session operation revokes only unrevoked rows for the trusted User at the fixed `lifecycleAt`, returning an aggregate count. Zero active Sessions succeeds. Failure maps to `teachers.lifecycle.revocation_failed` with retryable sanitized details and rolls back the complete transfer.

## 16. Audit matrix

All successful audit rows share the lifecycle transaction:

| Resource                     | Action                         |
| ---------------------------- | ------------------------------ |
| Source Profile               | `teachers.profile.archive`     |
| Source Membership            | `teachers.membership.transfer` |
| New destination Profile      | `teachers.profile.create`      |
| Restored destination Profile | `teachers.profile.restore`     |
| Destination Membership       | `teachers.membership.transfer` |
| Global User                  | `teachers.account.transfer`    |

Metadata is restricted to trusted UUIDs, fixed changed-field keys, previous/next enums, allocation aggregates/labels, stable reasons, and credential booleans/version. It excludes names, teacher-code values, contacts, notes, request bodies, Session/allocation identifiers, credential material, and raw errors. Failure at any audit position aborts the transaction.

## 17. Response contract

The dedicated Organization transfer presenter returns the safe persisted Teacher Directory detail plus source archive confirmation, fixed effective timestamp, revoked Session count, reassignment/integrity flags, and aggregate-only allocation summary. It returns no Organization/School/Membership/Role/Session/allocation identifiers, source Profile data, audit metadata, or credential material.

## 18. Errors and reasons

`ERROR_CATALOG.md` now records:

- `teachers.lifecycle.transfer_not_found` — HTTP 404, no details;
- `teachers.lifecycle.transfer_conflict` — HTTP 409, stable `reasonCode` only.

The implementation locks all twelve approved transfer reasons and reuses existing code-conflict, incomplete-profile, Teacher-Role-required, and revocation-failed exceptions. Concurrency and moved state map to stable bounded reasons without identifiers or raw database details.

## 19. Concurrency proof

Actor/Organization/School/Role/source rows and User Profile/Membership footprints are locked inside one serializable transaction. Source Membership status/end state, User status, Profile live/archive state, and destination restoration predicates use affected-row checks. Unique code/profile races and Prisma serialization conflicts translate to stable conflict reasons. Session, audit, response-composition, or any write failure prevents commit, so no partial source/destination state or duplicate success audit survives.

## 20. Exact changed files

- `ERROR_CATALOG.md`
- `src/app.module.ts`
- `src/common/context/request-context.ts`
- `src/common/decorators/organization-management-only.decorator.ts`
- `src/common/guards/organization-scope.guard.spec.ts`
- `src/common/guards/organization-scope.guard.ts`
- `src/modules/iam/auth/infrastructure/auth.repository.ts`
- `src/modules/iam/auth/tests/organization-management-scope.repository.spec.ts`
- `src/modules/organization-admin/organization-admin.module.ts`
- `src/modules/organization-admin/teacher-transfers/application/transfer-teacher-between-schools.coordinator.ts`
- `src/modules/organization-admin/teacher-transfers/controller/organization-teacher-transfers.controller.ts`
- `src/modules/organization-admin/teacher-transfers/domain/organization-teacher-transfer.errors.ts`
- `src/modules/organization-admin/teacher-transfers/domain/organization-teacher-transfer-state.ts`
- `src/modules/organization-admin/teacher-transfers/dto/transfer-teacher-to-school.dto.ts`
- `src/modules/organization-admin/teacher-transfers/infrastructure/organization-teacher-transfer-transaction.operations.ts`
- `src/modules/organization-admin/teacher-transfers/organization-teacher-transfers.module.ts`
- `src/modules/organization-admin/teacher-transfers/presenters/organization-teacher-transfer.presenter.ts`
- `src/modules/organization-admin/teacher-transfers/tests/organization-teacher-transfer-contract.spec.ts`
- `src/modules/organization-admin/teacher-transfers/tests/organization-teacher-transfer-state.spec.ts`
- `src/modules/organization-admin/teacher-transfers/tests/transfer-teacher-between-schools.coordinator.spec.ts`
- `src/modules/settings/users/infrastructure/teacher-lifecycle-membership.operations.ts`
- `src/modules/teachers/directory/domain/teacher-directory.errors.ts`
- `src/modules/teachers/lifecycle/application/teacher-lifecycle-unit-of-work.ts`
- `src/modules/teachers/lifecycle/domain/teacher-lifecycle-audit.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle-transaction.operations.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle.unit-of-work.ts`
- `src/modules/teachers/lifecycle/teacher-lifecycle.module.ts`
- `src/modules/teachers/lifecycle/tests/teacher-lifecycle-unit-of-work.spec.ts`
- `docs/sprint-school-teacher-directory-1b-cross-school-transfer.md`

## 21. Tests and validation

- New focused suites: 5/5 suites, 148/148 tests passed.
- Relevant regression suites: 30/30 suites, 380/380 tests passed.
- Migration governance: 39/39 passed.
- Migration structure: passed (`active=4`, `new=0`, `rebaseline=off`).
- Prisma validation: passed.
- Prisma Client generation: passed (6.19.3).
- Nest build: passed.
- ESLint on changed production TypeScript: passed with no findings.
- Prettier and Git whitespace checks: passed on the exact changed-file set.

The focused tests cover actor and exact Membership scope, source/destination state matrices, safe error details, strict DTO ownership, deterministic role/membership selection, transaction identity, write/audit/session failures, serialization conflict mapping, allocation aggregation, response leakage, route/guard order, and forbidden mutation/static boundaries.

## 22. Database environment statement

No explicitly authorized disposable database was configured for this execution. Database-backed fixture, security, and true concurrent-transaction suites were therefore not run against the configured persistent development database. All executed tests are pure, mocked repository/coordinator, or source-contract tests. Database rows written: 0.

## 23. Deferred 1B-7 work

1B-7 closeout, expanded disposable-database Organization A/B and concurrency E2E evidence, and any later Teacher Directory phase remain deferred. This implementation does not authorize or begin 1B-7.

## 24. Final authorization gate

- 1B-6 runtime scope: implemented and subject to the final validation results recorded above.
- Schema/migrations/seeds/permissions: unchanged.
- Platform bypass/current-School transfer route/hard delete: absent.
- Staging, commit, push, and pull-request creation: not authorized and not performed.
- 1B-7: not authorized.
