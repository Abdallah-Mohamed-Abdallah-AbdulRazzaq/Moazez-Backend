# Learning Content Discovery and Media 1A — Student Subject Lessons Closeout

## Phase result

- Phase: `LEARNING-CONTENT-DISCOVERY-AND-MEDIA-1A`
- Result: COMPLETE
- Baseline: `e7807a3f54598a8e196798b667983eac77239c17`
- Branch: `feat/learning-content-media-1a-student-subject-lessons`
- Route: `GET /api/v1/student/subjects/:subjectId/lessons`
- Commit, push, and pull request: not performed

This phase implements only Student Subject lesson discovery. Existing Student
Subject detail and Student Lesson response contracts remain unchanged.

## Changed files

Production:

- `src/modules/student-app/student-app.module.ts`
- `src/modules/student-app/subjects/controller/student-subject-lessons.controller.ts`
- `src/modules/student-app/subjects/application/list-student-subject-lessons.use-case.ts`
- `src/modules/student-app/subjects/infrastructure/student-subject-lessons-read.adapter.ts`
- `src/modules/student-app/subjects/dto/student-subject-lessons.dto.ts`
- `src/modules/student-app/subjects/dto/student-subject-lessons-response.dto.ts`
- `src/modules/student-app/subjects/domain/student-subject-lessons.errors.ts`
- `src/modules/student-app/subjects/presenters/student-subject-lessons.presenter.ts`
- `ERROR_CATALOG.md`

Tests:

- `src/modules/student-app/subjects/tests/student-subject-lessons.contract.spec.ts`
- `src/modules/student-app/subjects/tests/student-subject-lessons.use-case.spec.ts`
- `src/modules/student-app/subjects/tests/student-subject-lessons-read.adapter.spec.ts`
- `src/modules/student-app/subjects/tests/student-subject-lessons.presenter.spec.ts`
- `test/e2e/student-app-lessons.e2e-spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/security/tenancy.student-subject-lessons.spec.ts`
- `test/security/tenancy.student-app.spec.ts`

Evidence:

- `docs/sprint-learning-content-discovery-media-1a-student-subject-lessons-closeout.md`

No Prisma schema, migration, seed, permission, package, common auth, existing
Student Subject controller, or existing Student Lesson adapter file changed.

## Pre-fix red evidence

The focused contract suite was added and run before production changes:

```text
npx jest --runInBand --runTestsByPath src/modules/student-app/subjects/tests/student-subject-lessons.contract.spec.ts
```

Expected baseline result: one suite failed; 0/5 tests passed. The five
aggregate-safe failures separately proved:

- the route was absent;
- the new handler metadata was absent;
- allocation-only empty discovery did not exist;
- visible-plan-only eligibility did not exist;
- subject-bound cursor pagination did not exist.

No real identifiers, tokens, tenant names, credentials, or cursor values were
retained.

## Route, permissions, and Student actor proof

The controller is mounted at `student/subjects` and exposes
`GET :subjectId/lessons` with UUID route parsing and the validated query DTO. It
requires both:

- `academics.subjects.view`
- `academics.lesson_plans.view`

It has no `SchoolManagementOnly` metadata. The use case begins with
`StudentAppAccessService.getCurrentStudentWithEnrollment()`. Security tests
prove that Parent, Teacher, School, Organization, Platform, Applicant, pickup,
dismissal, and service actors fail the exact Student boundary even when both
permission strings are present. Separate guard tests prove that a Student
missing either permission is rejected.

## Subject eligibility and stale allocation behavior

The scoped adapter first resolves the exact non-deleted enrollment Term and an
active, non-deleted same-School Subject. It then accepts either:

- a current allocation count for the exact Subject, classroom, Term, and
  School; or
- a visible ACTIVE LessonPlan for the exact School, Subject, classroom,
  academic year, and Term with the full Student Lesson plan visibility chain.

The adapter never selects a preferred Teacher, allocation, or plan. An
allocation-only Subject returns HTTP 200 with an empty page. A visible-plan-only
Subject remains eligible after its originating allocation is transferred using
the current schema's supported update path. That test restores the original
allocation in a `finally` block. The co-teaching test independently uses the
existing Teacher-1 allocation plus one new Teacher-2 allocation; each test also
passes when selected alone. Neither branch returns the stable details-free
`learning.subject_lessons.not_found`/404 contract.

The final PostgreSQL matrix additionally proves details-free 404 responses for
a foreign-School, inactive, or deleted Subject and for plan-only eligibility
hidden by another classroom, Term, academic year, DRAFT/ARCHIVED/deleted plan,
or DRAFT/ARCHIVED/deleted Curriculum. A separate plan-only eligible Subject
proves item omission for deleted units, lessons, and items and for null planned
dates.

## Date, status, ordering, and cursor contract

Missing date boundaries normalize to the enrollment Term start/end. Supplied
dates are exact calendar dates, inclusive, ordered, and contained by that Term.
Historical Terms are readable because `Term.isActive` is intentionally not a
read predicate. All six Student Lesson statuses map through the existing status
presenter. Limit defaults to 20, accepts 1 through 50, and fetches one extra row.

The opaque base64url JSON cursor is version 1 and binds Subject, Term,
normalized dates, normalized status, planned date, nullable period index,
sortOrder, and item ID. Every field and the exact key set are type-checked
before identity checks. Malformed, unsupported, or mismatched cursors return
`validation.failed`/400 with only `{ field: "cursor" }`.

Cursor creation uses the raw database ordering value
`item.timetableEntry?.period.periodIndex ?? null`. Response presentation remains
separate and context-safe: a timetable entry from another enrollment classroom,
year, or Term produces `{ id: null, label: null }` without changing the cursor
ordering key.

Both numeric cursor fields, `periodIndex` and `sortOrder`, are restricted to
safe signed Prisma/PostgreSQL Int32 values from `-2147483648` through
`2147483647`. Overflow, underflow, and larger safe integers return the safe
`validation.failed`/400 contract with only `{ field: "cursor" }`; no invalid
numeric cursor reaches `StudentSubjectLessonsReadAdapter.listVisibleItems`.

Database ordering is:

1. `plannedDate ASC`;
2. timetable period index `ASC NULLS LAST`;
3. item `sortOrder ASC`;
4. item `id ASC`.

The PostgreSQL pagination test found and corrected a composite-relation null
edge during implementation: Prisma relation-level `is: null` required the
non-null School component to be null. Null-period continuation uses the nullable
`timetableEntryId` scalar.

An isolated six-row PostgreSQL fixture proves planned-date order, periods 1 then
2, sort-order ties, deterministic UUID ties, same-date null period last, and a
later date. A four-row first page ends on the period-2 tuple; its decoded cursor
contains period index 2 and the next page begins with the same-date null-period
row. A separate limit-2 traversal covers three pages with exact expected order,
zero duplicates, zero skips, and stable replay. Another isolated item uses a
same-School timetable entry from another classroom: its response period is null,
its cursor contains the related period index, and continuation reaches the
following null-period item without duplication or omission.

The greater-than-50-row case remains a scale and last-page test. It proves stable
replay, zero duplicates/skips, and null-planned-date exclusion, but the isolated
six-row fixture is the proof of the complete ordering tuple.

## Content summary and safe response

The adapter reproduces the current Student Lesson content predicate and selects
only content type and `isRequired`. The presenter returns only the locked item
and page fields. In phase 1A:

- `totalCount` counts all currently eligible content;
- `requiredCount` follows `isRequired`;
- `videoCount` counts `VIDEO_LINK` only;
- `fileCount` counts `FILE`;
- `hasPlayableVideo` is always false.

Structural denylist assertions cover tenant, enrollment, classroom, plan,
curriculum, Teacher/allocation, content body/URL, File/storage, metadata, notes,
and audit fields. No signed URL or storage operation exists in this phase.

## Test evidence

```text
New focused unit:
4 suites, 58/58 tests PASS

New focused security:
1 suite, 13/13 tests PASS

Student Subject and Student Lesson unit regression:
4 suites, 20/20 tests PASS

Student discovery and existing Student Lesson HTTP E2E:
1 suite, 15/15 tests PASS

Stale-allocation test selected alone:
1/1 PASS

Co-teaching test selected alone:
1/1 PASS

Existing Student App and Student Lesson security:
2 suites, 38/38 tests PASS

Student App final closeout:
1 suite, 17/17 tests PASS

Academics LessonPlan E2E/security:
2 suites, 6/6 tests PASS
```

Final independent-review correction totals:

```text
Hostile-cursor focused use-case unit: 40/40 PASS
Corrected PostgreSQL Student lesson E2E: 15/15 PASS
Hidden Subject/plan/Curriculum matrix: 12/12 PASS
Invalid item omission matrix: 4/4 PASS
Affected security/inventory: 63/63 PASS (13 + 33 + 17)
Build: PASS
```

The hostile-cursor correction performed no database, Redis, MinIO, schema,
migration, seed, permission, or storage work.

Only the use case and presenter production files changed during the final cursor
correction. The final-closeout E2E now uses the same test-only BullMQ double as
the focused Student lesson E2E so the authorized validation needs PostgreSQL
only. The legacy Student App security suite passed 33/33 with an equivalent
temporary test-harness override; that override was removed immediately after
the run so its final diff remains the six requested semantic hunks.

The initial build found one nullable relation type-indexing issue in the new
presenter. After narrowing that compile-time type with `NonNullable`, the exact
build rerun passed.

```text
npm run build: PASS
npm run test:migration-governance: PASS — 39/39
npm run db:migrations:check: PASS — 5 active, 0 new
npx prisma validate: PASS
npx prisma generate: PASS
```

The first Prisma generation attempt encountered a Windows lock held by an
orphaned Jest process from an earlier timed-out harness run. Only those exact
workspace Jest processes were stopped; the generation retry passed.

Formatting and lint validation covered the final change set with the required
legacy-file exception:

```text
Prettier write/check: PASS — 17/17 scoped changed files
test/security/tenancy.student-app.spec.ts Prettier write: NOT RUN
ESLint new TypeScript files: PASS — 12/12 files
ESLint legacy-file baseline delta: 0 errors, 0 warnings
```

The exact 16-file TypeScript ESLint command still exits nonzero because three
allowed pre-existing regression files retain their baseline debt. A comparison
with formatting-only findings excluded produced identical before/after counts:

```text
test/e2e/student-app-final-closeout.e2e-spec.ts: 68 errors, 0 warnings
test/e2e/student-app-lessons.e2e-spec.ts: 17 errors, 0 warnings
test/security/tenancy.student-app.spec.ts: 128 errors, 5 warnings
```

No baseline lint cleanup or file-wide suppression was introduced. New Supertest
response assertions carry a narrow local exception because Supertest types
`response.body` as `any`. The legacy Student App security diff contains only the
controller import, permission entry, controller inventory entry, two count
updates, and the no-permission path; its unrelated formatter churn is zero.

## Disposable database and cleanup

A dedicated disposable PostgreSQL 16 container received all five current
migrations and the normal seed. Tests created only synthetic phase fixtures.
Queue infrastructure was replaced by an in-test double for the focused E2E and
final-closeout E2E, so no Redis resource or write was used. No MinIO resource
was started and no object-storage call was made.

After the final clean rerun:

```text
synthetic database fixture residue: 0
disposable PostgreSQL container: removed
persistent database mutation: 0
Redis mutation: 0
storage mutation: 0
```

## Scope exclusions and next phase

This phase did not change Subject detail, Student Lesson responses,
publication, LessonContentItem schema, FileUploadSession, direct upload, media
verification, playback, generic File boundaries, permissions, seeds,
migrations, storage, Redis/BullMQ production behavior, Parent lesson routes, or
Teacher preparation routes.

Phase 1B is not authorized until 1A receives independent review and is merged.
No phase after 1A was started.
