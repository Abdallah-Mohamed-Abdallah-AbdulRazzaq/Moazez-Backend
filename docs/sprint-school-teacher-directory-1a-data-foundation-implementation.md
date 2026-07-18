# SCHOOL-TEACHER-DIRECTORY-1A — Data Foundation Implementation

## Status and boundary

- Branch: `feat/school-teacher-directory-1a-data-foundation`
- Baseline and current implementation HEAD: `562f95cb57c4a08596e1d9179c8fbdc5aeac9038`
- Phase: 1A data foundation and integrity only
- Runtime HTTP routes/controllers added: none
- `AppModule` registration: none
- Permissions, role seeds, credentials, Teacher App, and allocation behavior changed: none
- Existing migrations modified: none

The accepted 0A contract remains authoritative. This implementation adds the
core Teacher Profile data boundary without implementing directory or lifecycle
workflows.

## Files changed

Modified:

- `MODULES.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `prisma/schema.prisma`
- `src/infrastructure/database/school-scope.extension.ts`
- `src/infrastructure/database/tests/school-scope.extension.spec.ts`
- `scripts/classify-teacher-directory-reality-0a.cjs`
- `scripts/tests/classify-teacher-directory-reality-0a.test.cjs`

Added:

- `prisma/migrations/20260718115332_teacher_directory_data_foundation/migration.sql`
- `src/modules/teachers/teachers.module.ts`
- `src/modules/teachers/profile/teacher-profile.module.ts`
- `src/modules/teachers/profile/domain/teacher-profile.types.ts`
- `src/modules/teachers/profile/domain/teacher-profile.integrity.ts`
- `src/modules/teachers/profile/domain/teacher-profile.integrity.spec.ts`
- `src/modules/teachers/profile/infrastructure/teacher-profile.repository.ts`
- `scripts/backfill-teacher-profiles-1a.cjs`
- `scripts/tests/backfill-teacher-profiles-1a.test.cjs`
- `test/security/tenancy.teacher-profiles.spec.ts`
- `docs/sprint-school-teacher-directory-1a-data-foundation-implementation.md`

Deleted: none.

## Core module governance

`MODULES.md` and `DIRECTORY_STRUCTURE_VISUAL.md` now identify `Teachers` as a
core source-of-truth domain with `profiles`, `directory`, and `lifecycle`
subdomains. Only `src/modules/teachers/profile/` is implemented in 1A. The
foundation module has no controller and `TeachersModule` is intentionally not
imported by `AppModule`.

## Prisma schema foundation

The following exact enums were added:

- `TeacherGender`: `MALE`, `FEMALE`
- `TeacherEmploymentStatus`: `ACTIVE`, `INACTIVE`, `TERMINATED`
- `TeacherEmploymentType`: `FULL_TIME`, `PART_TIME`, `CONTRACT`
- `TeacherWorkDay`: `SUNDAY`, `MONDAY`, `TUESDAY`, `WEDNESDAY`, `THURSDAY`,
  `FRIDAY`, `SATURDAY`

`TeacherProfile` is school-scoped, UUID-keyed, soft-deletable, and related to
`School`, global `User`, and an optional same-school private `File` reference.
No `organizationId` is stored because `School` is already the repository's
canonical organization boundary and every profile operation is school-scoped.

Required foundation fields are `id`, `schoolId`, `userId`,
`employmentStatus`, `workingDays`, `createdAt`, and `updatedAt`.
`employmentStatus` defaults fail-closed to `INACTIVE`, but provisioning and
backfill code must always write it explicitly. Backfill-sensitive/human-owned
fields remain nullable: teacher code, all four canonical bilingual name fields,
gender, department, specialization, employment type, experience, hire date,
working-time pair, bilingual notes, avatar file, and `deletedAt`.

`workingDays` is a required Prisma list with an empty-array default. Application
integrity code deduplicates and orders it canonically. The database column
`working_days` is `NOT NULL`, `[]` is the only unconfigured representation, and
PostgreSQL rejects explicit `NULL` inserts and updates. The database also caps
array cardinality at seven.

Inverse relations are:

- `School.teacherProfiles`
- `User.teacherProfiles`
- `File.teacherProfileAvatars` using `TeacherProfileAvatarFile`

The nullable Prisma compound unique `@@unique([schoolId, teacherCode])` is
retained. PostgreSQL permits multiple `NULL` values while enforcing uniqueness
for non-null codes within one school; the disposable constraint suite proves
both behaviors. Teacher code is not globally unique.

## Migration

Exactly one additive replacement migration was generated before application:

`prisma/migrations/20260718115332_teacher_directory_data_foundation/migration.sql`

SHA-256:
`5d856ce0c59237e52be624a34708866fafe35f46c17abe68b1751c00f0e7c2fa`

Prisma requires `workingDays` in the schema but did not generate PostgreSQL
`NOT NULL` integrity for this scalar-list column. The first uncommitted feature
migration was therefore removed and regenerated with a fresh timestamp, then
intentionally hardened before the replacement artifact's first application.
The previously used disposable evidence database was not reused after this
migration replacement.

Generated objects:

- four PostgreSQL enum types
- `teacher_profiles` table
- primary key, foreign keys, query indexes, `(id, school_id)` unique target,
  `(school_id, user_id)` unique constraint, and school-local nullable code unique
- `ON DELETE RESTRICT` foreign keys for School, User, and composite avatar File

Reviewed custom objects:

- partial unique index `teacher_profiles_one_live_per_user_idx` on `user_id`
  where `deleted_at IS NULL`
- `teacher_profiles_teacher_code_normalized_chk`
- `teacher_profiles_experience_years_range_chk`
- `teacher_profiles_work_time_pair_chk`
- `teacher_profiles_work_time_order_chk`
- `teacher_profiles_working_days_cardinality_chk`

The replacement table definition declares `working_days` as `NOT NULL` with an
empty-array default. Its named cardinality check evaluates only
`cardinality(working_days) <= 7` because column nullability is enforced directly
by PostgreSQL.

The migration contains no row backfill, trigger, stored procedure, view,
destructive statement, or mutation of User, Membership, allocation, session, or
credential data. The migration comments explain the Prisma expressiveness gap.

## Domain and repository foundation

Pure domain functions cover:

- teacher-code trim/whitespace removal/uppercase normalization
- normalized-code validation and the 20-character bound
- experience range validation from 0 through 60
- work-time pair and strict order validation
- work-day deduplication and canonical Sunday-through-Saturday ordering
- explicit profile completeness projection

Completeness uses only `teacherCode`, `firstNameAr`, `lastNameAr`,
`firstNameEn`, `lastNameEn`, and `gender`. It does not accept or infer values
from `User.firstName` or `User.lastName`.

`TeacherProfileRepository` exposes explicit selected domain records rather than
raw Prisma models:

- `findLiveByCurrentSchoolProfileId`
- `findLiveByCurrentSchoolUserId`
- `findCurrentSchoolByUserIdIncludingArchived`
- `countLiveProfilesForUserGloballyForIntegrity`
- `createIncompleteBackfillProfile`

Normal reads use scoped Prisma. The global count is narrowly named, read-only,
and exists solely to inspect the cross-school live-profile invariant; it is not
reachable through HTTP. The create method is explicitly for incomplete
backfill and writes only the locked fail-closed fields.

## School scope and soft delete

`TeacherProfile` is registered in both `SCHOOL_SCOPED_MODELS` and
`SOFT_DELETE_MODELS`; it is not scope-excluded. Behavior tests prove current
school injection for reads/update/delete, default `deletedAt = null`, explicit
archived inclusion, and School A versus School B isolation.

Final direct-operation evidence:

| Scoped Prisma behavior      | Result      |
| --------------------------- | ----------- |
| `findMany`                  | direct pass |
| `findUnique`                | direct pass |
| `count`                     | direct pass |
| `update`                    | direct pass |
| `updateMany`                | direct pass |
| `delete`                    | direct pass |
| `deleteMany`                | direct pass |
| Default soft-delete filter  | direct pass |
| Explicit archived inclusion | direct pass |

Every cross-school assertion is followed by a base-Prisma persistence check
showing that the School B Profile still exists with its tested values
unchanged. Same-school positive controls cover `findMany`, `findUnique`,
`count`, and `update`. The direct `delete` assertion verifies extension-level
school injection only; hard deletion is not an approved Teacher lifecycle
operation, and the future lifecycle remains soft-delete/archive based.

## Backfill tool

`scripts/backfill-teacher-profiles-1a.cjs` defaults to dry-run. Mutation requires
both `--apply` and `TEACHER_PROFILE_BACKFILL_APPLY=1`; production apply is
rejected. User reads use deterministic `id ASC` cursor pagination with `take`
at most 500. Membership and Profile joins are explicitly selected and capped.

An eligible User must be non-deleted and `TEACHER`, have exactly one operational
active/non-ended/non-deleted Membership with Teacher membership type, exact
`teacher` role (global system role or same-school role), and a school. The User
must have neither a Profile for that school nor another live Profile. The tool
creates only `schoolId`, `userId`, explicit `employmentStatus=INACTIVE`, and
`workingDays=[]`.

Ambiguous membership, role/type/school, live-profile, archived same-school
restore, cross-school, and concurrent unique-conflict states are classified but
never repaired. Output is JSON-safe and limited to counts, status keys, bounded
opaque UUID samples, batches, duration, and created/skipped totals. Raw errors
and personal, credential, note, or storage values are never emitted.

Disposable rehearsal evidence:

| Run          | Teacher Users | Eligible | Created | Existing live | Result                            |
| ------------ | ------------: | -------: | ------: | ------------: | --------------------------------- |
| Dry run      |             1 |        1 |       0 |             0 | no mutation                       |
| First apply  |             1 |        1 |       1 |             0 | one incomplete `INACTIVE` Profile |
| Second apply |             1 |        0 |       0 |             1 | idempotent no-op                  |

`SECOND BACKFILL CREATED: 0`.

## Classifier evolution

The 0A classifier remains read-only, PII-safe, JSON-safe, cursor-paginated, and
non-strict by default. It now classifies total/live/archived Profiles, missing
matching live Profiles, multiple-live and duplicate school/User footprints,
invalid User/Profile and Membership/Profile joins, transferred-source live
Profiles, destination Membership gaps, completeness, and backfill
eligible/ambiguous categories. Structural violations remain distinct from
expected completeness remediation.

Every Prisma entity read in the classifier uses `findMany` with an explicit
select. Full-table reads use deterministic, strictly monotonic UUID cursor
pagination with batches of at most 500; relationship lookups are likewise
deterministically ordered and explicitly bounded. The one exact operational
Teacher Membership predicate requires an active, unended, undeleted,
school-bound Teacher Membership with a live `teacher` Role. A global system
Teacher Role with a null school remains valid, while a non-null Role school must
match the Membership school. Profile matching, destination gap detection,
allocation membership validation, Teacher-page school selection, and classifier
backfill eligibility all use this same predicate; Role deletion invalidates each
of those paths.

Pre-change classifier evidence at `2026-07-18T12:00:00.000Z` was all-zero:
zero Teacher Users, memberships, allocations, and pre-profile anomalies. After
fresh replay/seed and before the dedicated fixture, all post-schema counts were
also zero. After the one-row rehearsal, the classifier reported one Teacher
User, one live Profile, zero structural profile anomalies, zero backfill gaps,
and one expected incomplete live Profile. The fixture also intentionally had
missing username, contact email, and password hash, proving those independent
remediation categories without exposing their values.

## Test inventory and evidence

- Domain unit tests: enums, code normalization/validation, experience bounds,
  work-time pair/order, weekday canonicalization, and no-inference completeness.
- Backfill pure tests: eligibility/ambiguity, dual apply gate, production
  rejection, multiple pages over 500, stable cursor/no duplicates, dry-run,
  first/second apply behavior, unique-race classification, bounded samples, and
  sanitized failures.
- Classifier pure tests: all date-first allocation states/boundaries, membership
  and credential classification, exact Role deletion/school compatibility,
  Profile/allocation/backfill predicate parity, bounded cursor behavior,
  findMany-only source enforcement, join correctness, profile
  structural/remediation categories, PII-safe reports, and strict exit.
- Repository/migration/tenancy test: direct scoped `findMany`, `findUnique`,
  `count`, `update`, `updateMany`, `delete`, and `deleteMany`; School A/B
  persistence isolation; default and explicit soft-delete behavior; both
  uniqueness rules; archived cross-school history; nullable and school-scoped
  code semantics; same-school avatar FK; all three Restrict relations; all
  named checks; enum/index metadata; `working_days.is_nullable = NO`; tagged
  raw-SQL `NULL` insert/update rejection; and no runtime route/AppModule
  registration.
- Migration governance: 39/39 structural tests pass; governance reports four
  active migrations and exactly one new migration.
- Disposable database constraint/security suite: 14/14 tests pass.
- Focused domain and scope registration suites: 14/14 tests pass.
- Backfill plus classifier Node suites: 25/25 tests pass.

## Fresh replay evidence

The full four-migration chain deployed from zero to the new disposable database
`moazez_teacher_directory_1a_working_days_replay_20260718wd01`. The old
disposable evidence database was not reused. Prisma then reported the schema up
to date. Prisma generation, the unchanged seed chain, build, focused constraint
tests, `working_days` null rejection, and School A/B isolation passed. A second
deployment reported exactly:

```text
No pending migrations to apply.
```

The replay backfill rehearsal classified one eligible Teacher in dry-run, the
first apply created one incomplete `INACTIVE` Profile with `workingDays=[]`, and
the second apply created zero Profiles.

No shared or Live database received the migration or backfill.

## Known remediation and deferred work

Expected remediation categories are incomplete bilingual names/code/gender,
independent credential readiness, archived same-school profiles requiring a
managed restore, and ambiguous or mismatched Teacher membership footprints.
The disposable rehearsal intentionally leaves its backfilled Profile incomplete
and `INACTIVE`.

Deferred to later phases are Teacher CRUD and lifecycle orchestration, generic
Settings bypass closure, role promotion/demotion, activation/termination,
same-school rehire, cross-school transfer, assignment facade/mutations, managed
avatar storage/delivery, permission/role seed updates, credentials, Teacher App
adoption, controllers, DTOs, presenters, and all HTTP contracts.
