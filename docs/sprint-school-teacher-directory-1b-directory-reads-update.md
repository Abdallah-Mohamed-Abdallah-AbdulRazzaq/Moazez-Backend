# SCHOOL-TEACHER-DIRECTORY-1B-2 — Directory Reads and Managed Record Update

## 1. Branch, baseline, and predecessor gate

- Branch: `feat/school-teacher-directory-1b-directory-reads-update`
- Baseline and current HEAD before changes:
  `846eb5caed227e01da2a33069b30e843378bbdd9`
- Predecessor evidence: the typed Teacher lifecycle Unit of Work,
  transaction-aware User/Membership/Profile/Audit/Session operations,
  allocation lifecycle reader, and credential projection were merged.
- Unsupported Teacher identity population at the predecessor gate: `0`.

No schema, migration, assignment mutation, credential writer, employment,
archive, rehire, transfer, assignment, avatar, or Teacher App behavior is part
of this change.

## 2. Endpoint contract

All paths are below the framework-owned `/api/v1` prefix.

| Method | Path                   | Permission                | Identifier and scope                                       |
| ------ | ---------------------- | ------------------------- | ---------------------------------------------------------- |
| GET    | `/teachers`            | `teachers.records.view`   | Current School from trusted request context                |
| GET    | `/teachers/:teacherId` | `teachers.records.view`   | `teacherId=TeacherProfile.id`; live current-school Profile |
| PATCH  | `/teachers/:teacherId` | `teachers.records.manage` | Same identifier; managed transactional record update       |

No POST, DELETE, employment-status, rehire, transfer, assignment, avatar, or
credential-write route was added.

Missing, archived, foreign-school, inaccessible, or unsafely composable detail
and update targets use the same `teachers.profile.not_found` 404 without
existence details.

## 3. Permission and system-role matrix

| Role                        | View | Manage | Source of grant                      |
| --------------------------- | ---- | ------ | ------------------------------------ |
| `platform_super_admin`      | Yes  | Yes    | Existing all-permissions composition |
| `organization_admin`        | Yes  | Yes    | Existing non-platform composition    |
| `school_admin`              | Yes  | Yes    | Existing school-level composition    |
| `teacher`                   | No   | No     | Explicit management exclusion        |
| New or existing custom role | No   | No     | No automatic custom-role grant       |

Only `teachers.records.view` and `teachers.records.manage` were added. No
assignment, credential, avatar, or self-service Teacher permission was added.
Seed construction remains upsert-based and deterministic. Seeds were exercised
with a mock Prisma client only; no configured database seed was run.

Permissions do not create tenancy scope. Organization and platform actors still
require a trusted active School context before directory code can execute.

## 4. Request ownership

IAM-owned PATCH fields are `loginEmail`, `username`, `contactEmail`, and
`phone`. TeacherProfile-owned fields are `teacherCode`, four canonical
bilingual name fields, `gender`, department/specialization, employment type,
experience, hire date, working days/times, and bilingual notes.

`preferredDisplayLanguage` is command policy only. When managed names change,
it is required and selects the approved Arabic or English first/last-name pair
used to update the required `User.firstName` and `User.lastName` compatibility
projection. No language is inferred and no preferred-language column is stored.

Password, credential state, account/Membership/employment status, Role/User
type, tenant ids, assignments, subjects/classes, avatar, and deletion fields
are rejected by the global strict DTO policy.

## 5. List, detail, and state separation

List uses the existing page/limit shape, maximum `100`, explicit selects,
stable bilingual-name ordering with `TeacherProfile.id` as the tie-breaker, and
a repeatable-read transaction for the page/count snapshot. Entity queries use
the school-scoped Prisma client. Search is bounded to approved Profile and
User directory identity fields.

Supported filters are search, account status, Membership status, employment
status, gender, and Profile completeness. No assignment/avatar/credential or
tenant-id filters exist.

Both list and detail present account, Membership, employment, Profile
completeness, and credential state independently. List omits notes and the full
schedule; detail adds the approved employment and notes fields. Neither shape
contains tenant/internal Membership/Role ids, assignments, avatar state,
Session rows, audit data, storage coordinates, or credential material.

## 6. Credential summary

The repository reduces `passwordHash` immediately to `hasPassword`. The
application and presenter receive only:

- `hasPassword`
- `status`
- `mustChangePassword`
- `passwordProvisionedAt`
- `passwordChangedAt`
- `credentialVersion`

Status derivation is `missing`, `temporary_or_must_change`, `must_change`, or
`set` according to the locked contract. No password hash or temporary
credential can cross the repository boundary.

## 7. Managed PATCH transaction

PATCH executes inside the merged serializable Teacher lifecycle Unit of Work.
It reads the live current-school Profile, exact User, and exact same-school
Teacher Membership; validates the live global-or-same-school Teacher Role;
checks IAM uniqueness; updates only owned User/Profile fields; updates display
projections when required; and writes one transactional
`teachers.profile.update` audit.

The lifecycle User boundary was extended narrowly with explicit identity-field
conflict and update operations. Both require the transaction client and expose
no generic User patch or Prisma delegate. Audit metadata contains trusted
resource UUIDs and sorted changed-field keys only. It never contains names,
contacts, notes, attempted values, credentials, Sessions, or storage values.
Audit failure rejects the Unit of Work; ordinary record edits do not revoke
Sessions.

## 8. Normalization and validation

- Teacher code is trimmed, whitespace-free, uppercase, non-empty, maximum 20,
  and school-unique. Conflict output is `field=teacherCode` only.
- Existing IAM username/login-domain and email normalization is reused.
  Generated username login email must match any explicit override.
- Managed text is trimmed without cross-language inference.
- Gender and employment type use the existing Prisma enums.
- Experience is an integer from 0 through 60.
- Hire date is parsed as an exact calendar-valid date-only value.
- Working days reject duplicates and normalize Sunday through Saturday.
- Work times are a nullable pair and require end later than start.
- Notes are nullable, bounded to 500, and excluded from audit values.

## 9. Security evidence

Focused tests prove current-school arguments, exact identity relation filters,
school-bound Profile resolution, stable safe 404 behavior, permission metadata,
Teacher/custom-role default exclusion, and the inability of platform permission
possession to manufacture School scope. Mutation failures propagate through the
already-proven single transaction boundary.

Database-writing tenancy tests were intentionally not run because the available
configured database is persistent development and this phase authorizes zero
database rows written. The existing non-database school-scope extension suite
was run. A future authorized disposable database run remains required for the
database-backed School A/School B E2E suite.

## 10. Files changed

- `ERROR_CATALOG.md`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `src/app.module.ts`
- `src/modules/settings/users/infrastructure/teacher-lifecycle-user.operations.ts`
- `src/modules/teachers/directory/application/get-teacher.use-case.ts`
- `src/modules/teachers/directory/application/list-teachers.use-case.ts`
- `src/modules/teachers/directory/application/update-teacher.use-case.ts`
- `src/modules/teachers/directory/controller/teachers.controller.ts`
- `src/modules/teachers/directory/domain/teacher-directory-input.ts`
- `src/modules/teachers/directory/domain/teacher-directory.errors.ts`
- `src/modules/teachers/directory/domain/teacher-directory.types.ts`
- `src/modules/teachers/directory/dto/teacher-directory.dto.ts`
- `src/modules/teachers/directory/infrastructure/teacher-directory.repository.ts`
- `src/modules/teachers/directory/presenters/teacher-directory.presenter.ts`
- `src/modules/teachers/directory/teacher-directory.context.ts`
- `src/modules/teachers/directory/teacher-directory.module.ts`
- `src/modules/teachers/directory/tests/teacher-directory-contract.spec.ts`
- `src/modules/teachers/directory/tests/teacher-directory-input.spec.ts`
- `src/modules/teachers/directory/tests/teacher-directory.repository.spec.ts`
- `src/modules/teachers/directory/tests/update-teacher.use-case.spec.ts`
- `src/modules/teachers/lifecycle/application/teacher-lifecycle-unit-of-work.ts`
- `src/modules/teachers/lifecycle/domain/teacher-lifecycle-audit.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle-transaction.operations.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle.unit-of-work.ts`
- `src/modules/teachers/lifecycle/tests/teacher-lifecycle-operations.spec.ts`
- `src/modules/teachers/lifecycle/tests/teacher-lifecycle-unit-of-work.spec.ts`
- `src/modules/teachers/teachers.module.ts`
- `docs/sprint-school-teacher-directory-1b-directory-reads-update.md`

## 11. Validation evidence

- New Teacher Directory suites: `72/72` passed.
- Additional lifecycle assertions added by this phase: `2/2` passed.
- Total new tests: `74/74` passed.
- Relevant pre-existing lifecycle/IAM/Profile/scope regressions: `102/102` passed.
- Academics Teacher allocation regressions: `29/29` passed.
- Total relevant regression tests: `131/131` passed.
- Migration governance: `39/39` passed.
- Migration structure: passed (`active=4`, `new=0`, rebaseline off).
- Prisma validate: passed.
- Prisma generate: passed.
- Production TypeScript ESLint, without `--fix`: passed.
- Prettier check for changed runtime/test files and this evidence document:
  passed. The required catalog and two seed files retain repository-wide
  pre-existing Prettier debt; their baseline versions also fail standalone
  Prettier checks, and this scoped phase did not mechanically reformat those
  unrelated files.
- Build: passed.
- No seed, migration deploy, backfill, remediation, or other database mutation
  command was executed.

## 12. Deferred work and authorization gate

1B-3 retains ownership of Teacher provisioning and generic Settings Teacher
bypass closure. Employment transitions, archive/rehire/transfer, assignments,
avatar, and Teacher App adoption remain assigned to their locked later phases.

Final gate for this implementation artifact:

```text
SCHOOL-TEACHER-DIRECTORY-1B-2: COMPLETE
DATABASE MUTATION: 0
POST ROUTES ADDED: 0
EMPLOYMENT ROUTES ADDED: 0
ARCHIVE / REHIRE / TRANSFER ROUTES ADDED: 0
SCHEMA CHANGED: 0
MIGRATIONS ADDED: 0
EXISTING MIGRATIONS MODIFIED: 0
STAGED FILES: 0
COMMIT AUTHORIZED: NO
PUSH AUTHORIZED: NO
PULL REQUEST: USER-OWNED
1B-3 AUTHORIZED: NO
```
