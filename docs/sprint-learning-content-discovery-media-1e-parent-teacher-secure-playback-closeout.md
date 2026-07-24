# LEARNING-CONTENT-DISCOVERY-AND-MEDIA-1E Closeout

## Status

`LEARNING-CONTENT-DISCOVERY-AND-MEDIA-1E — Parent and Teacher Secure Playback`
is complete in the unstaged worktree on
`feat/learning-content-media-1e-parent-teacher-playback`.

Baseline:

```text
885f41b985870af60724334d94e216850a1a4aa6
```

No commit, push, pull request, schema change, migration, package change,
permission change, seed change, playback audit write, or persisted playback
capability was introduced.

## HTTP contracts

Parent:

```text
GET /api/v1/parent/children/:studentId/lessons/:lessonPlanItemId/content/:contentItemId/playback

permissions:
academics.lesson_plans.view
academics.curriculum.view
```

Teacher:

```text
GET /api/v1/teacher/lesson-preparation/:lessonPlanItemId/content/:contentItemId/playback

permissions:
teacher.lesson_preparation.view
academics.lesson_plans.view
academics.curriculum.view
```

Both routes use the existing app-only guard, selected-School context, UUID
validation, and one safe absence contract:

```text
HTTP 404
learning.content.playback_not_found
details absent
```

The exact success response contains only:

```text
url
expiresAt
mimeType
sizeBytes
disposition
renewable
```

Each capability is a renewable, inline, 300-second presigned GET. Storage
coordinates, File/session IDs, checksums, names, tenant IDs, actor IDs, and
authorization-path facts are not returned.

## Shared application boundary

The Academics Curriculum app-facing playback boundary owns the common
candidate query, transactional media locks, final candidate revalidation,
verified-video checks, signing, presentation, and safe not-found error.
Student, Parent, and Teacher adapters supply actor-specific visibility and
transactional authorization locks.

The Student route was refactored onto the same coordinator without changing its
path, permissions, response, TTL, or visibility policy.

## Visibility policies

Parent playback requires:

- the authenticated active Parent user and active scoped membership;
- an active Guardian row and exact live StudentGuardian link;
- the exact active child Student and active current enrollment;
- the exact School/year/Term/classroom hierarchy and active Subject;
- an ACTIVE, live LessonPlan in the enrolled context;
- the exact live LessonPlanItem and curriculum path;
- PUBLISHED Lesson Content; and
- one live READY verified video File/session with matching authoritative facts.

Teacher playback requires:

- the authenticated active Teacher user and active scoped membership;
- the exact owned live TeacherSubjectAllocation;
- the exact School/year/Term/classroom/Subject hierarchy;
- a live, non-ARCHIVED LessonPlan owned by the Teacher and allocation;
- the exact live LessonPlanItem and curriculum path;
- a non-ARCHIVED Curriculum;
- DRAFT or PUBLISHED Lesson Content; and
- one live READY verified video File/session with matching authoritative facts.

ARCHIVED Lesson Content is denied to both actors. Parent playback also denies
DRAFT content. Teacher playback intentionally permits DRAFT and PUBLISHED
content for preparation.

## Transactional serialization

The coordinator performs a preliminary scoped candidate read, then opens one
PostgreSQL transaction. Inside it:

1. the actor-specific authorization graph is locked and revalidated;
2. the exact LessonPlanItem and LessonPlan are protected in writer-compatible
   order;
3. Curriculum, Unit, and Lesson are locked and revalidated;
4. FileUploadSession, File, and LessonContentItem are locked and revalidated;
5. the complete final candidate is reread under the same transaction; and
6. the storage signer is called while those protections remain held.

All raw lock statements use parameterized `Prisma.sql`; multirow Guardian,
StudentGuardian, and allocation locks use deterministic `ORDER BY id ASC`.
No identifier is concatenated into SQL.

The order is compatible with the reviewed mutation paths: actor eligibility
writers serialize on their exact rows; plan/item mutation serializes before
the shared media chain; publication and File/session cleanup serialize on the
same protected media rows. The tests prove both serial directions and did not
observe a deadlock, transaction timeout, or connection-pool starvation.

## Concurrency evidence

Parent PostgreSQL coverage includes both mutation-first and playback-first
serialization for:

- Guardian-link removal;
- Parent membership deactivation;
- Parent user deactivation;
- child enrollment withdrawal;
- child Student deactivation;
- LessonPlan archive;
- content unpublish; and
- File soft deletion.

Teacher PostgreSQL coverage includes both directions for:

- Teacher membership deactivation;
- Teacher user deactivation;
- allocation ownership reassignment;
- LessonPlan Teacher/allocation reassignment;
- LessonPlan archive;
- content archive; and
- final cleanup claim.

Mutation-first results return no capability and call the signer zero times.
Playback-first tests use a controlled signer boundary, prove the conflicting
writer is blocked with `pg_stat_activity`/`pg_blocking_pids`, release signing,
return one capability, then prove the subsequent playback is denied after the
writer completes.

The critical Student + Parent + Teacher PostgreSQL group passed three
independent executions:

```text
run 1: 3 suites / 68 tests
run 2: 3 suites / 68 tests
run 3: 3 suites / 68 tests
```

Individual totals:

```text
Student playback integration: 1 suite / 33 tests
Parent playback integration: 1 suite / 18 tests
Teacher playback integration: 1 suite / 17 tests
```

## Read-only behavior

Successful playback performs no application database write. E2E and
integration assertions prove:

- AuditLog counts do not change;
- FileUploadSession `updatedAt` does not change;
- no playback state or capability is persisted; and
- a second request returns a newly signed capability under the same contract.

## Security and regression evidence

Final executed results:

```text
Focused shared/Student/Parent/Teacher playback:
9 suites / 53 tests — PASS

Affected download callers:
4 suites / 44 tests — PASS

Parent and Teacher E2E/security:
4 suites / 27 tests — PASS

Student E2E/security regression:
2 suites / 26 tests — PASS

Generic File actor boundary:
1 suite / 7 tests — PASS

Lesson Content read-adapter integration:
1 suite / 3 tests — PASS

MinIO Range:
1 suite / 1 test — PASS

Complete security inventory:
89 suites / 1154 tests — PASS
```

The first complete security run exposed stale Parent and Teacher global route
inventories. The inventories now contain the two playback handlers with their
exact permission arrays and updated exact counts. The affected inventory
suites passed 85/85 before the final complete security run.

An initial generic security attempt could not initialize because local Redis
was stopped, and an initial Student regression attempt could not initialize
because local MinIO was stopped. Both were infrastructure-only failures before
route assertions; the same commands passed after the existing local services
were started.

## Database, build, and static evidence

```text
Migration governance:
PASS — base origin/main, 7 active, 0 new

Migration deploy:
PASS — 7 migrations, no pending migration

Migration status:
PASS — schema up to date

Prisma validate:
PASS

Prisma generate:
PASS

Normal seed:
PASS — canonical `npm run seed`

Build:
PASS
```

Supported ESLint passed for every changed production TypeScript file and every
new Phase 1E TypeScript test. Differential lint over modified legacy tests
found zero findings inside Phase 1E hunks. It found 388 pre-existing findings
outside those hunks in nine legacy files; unrelated historical debt was not
rewritten.

Supported Phase 1E Prettier paths and `git diff --check` pass. The narrow
global Parent inventory diff preserves its baseline formatting and contains
only the playback entry and exact count changes.

## CI

`.github/workflows/learning-media-integrity.yml` now explicitly runs:

- shared playback coordinator and contract tests;
- Student, Parent, and Teacher playback unit tests;
- Student, Parent, and Teacher PostgreSQL playback integration; and
- the retained Parent/Teacher E2E and security files.

The workflow was not run by GitHub Actions in this unstaged, uncommitted phase,
so no remote-green claim is made.

## Scope and deferred work

No Parent upload route, Teacher upload route, storage mutation, playback
session, playback audit, schema field, migration, Redis feature, or playback
queue was added. Global prevention of later File deletion while referenced by
published content remains owned by the later File/media lifecycle contract.

## Changed paths

The final worktree contains 41 Phase 1E paths: 25 tracked modifications, 16
untracked additions, and zero deletions.

```text
.github/workflows/learning-media-integrity.yml
docs/sprint-learning-content-discovery-media-1e-parent-teacher-secure-playback-closeout.md
src/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.coordinator.ts
src/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.errors.ts
src/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.module.ts
src/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.presenter.ts
src/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.types.ts
src/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback-response.dto.ts
src/modules/academics/curriculum/app-facing/lesson-content-playback/tests/lesson-content-playback.contract.spec.ts
src/modules/academics/curriculum/app-facing/lesson-content-playback/tests/lesson-content-playback.coordinator.spec.ts
src/modules/parent-app/lessons/application/get-parent-child-lesson-playback.use-case.ts
src/modules/parent-app/lessons/controller/parent-child-lessons.controller.ts
src/modules/parent-app/lessons/infrastructure/parent-child-lessons-read.adapter.ts
src/modules/parent-app/lessons/tests/parent-child-lesson-playback.use-case.spec.ts
src/modules/parent-app/lessons/tests/parent-child-lessons.use-case.spec.ts
src/modules/parent-app/parent-app.module.ts
src/modules/student-app/lessons/application/get-student-lesson-playback.use-case.ts
src/modules/student-app/lessons/domain/student-lesson-playback.errors.ts
src/modules/student-app/lessons/dto/student-lesson-playback-response.dto.ts
src/modules/student-app/lessons/infrastructure/student-lessons-read.adapter.ts
src/modules/student-app/lessons/presenters/student-lesson-playback.presenter.ts
src/modules/student-app/lessons/tests/student-lesson-playback.use-case.spec.ts
src/modules/student-app/lessons/tests/student-lessons.use-case.spec.ts
src/modules/student-app/student-app.module.ts
src/modules/teacher-app/lesson-preparation/application/get-teacher-lesson-playback.use-case.ts
src/modules/teacher-app/lesson-preparation/controller/teacher-lesson-preparation.controller.ts
src/modules/teacher-app/lesson-preparation/infrastructure/teacher-lesson-preparation-read.adapter.ts
src/modules/teacher-app/lesson-preparation/tests/teacher-lesson-playback.use-case.spec.ts
src/modules/teacher-app/lesson-preparation/tests/teacher-lesson-preparation.use-case.spec.ts
src/modules/teacher-app/teacher-app.module.ts
test/e2e/parent-app-child-lessons.e2e-spec.ts
test/e2e/teacher-app-lesson-preparation.e2e-spec.ts
test/integration/lesson-content-publication-read-adapters.spec.ts
test/integration/parent-child-lesson-playback.integration.spec.ts
test/integration/student-lesson-playback.integration.spec.ts
test/integration/support/lesson-playback-fixture.ts
test/integration/teacher-lesson-playback.integration.spec.ts
test/security/tenancy.parent-app.spec.ts
test/security/tenancy.parent-app-child-lessons.spec.ts
test/security/tenancy.teacher-app.spec.ts
test/security/tenancy.teacher-app-lesson-preparation.spec.ts
```

The two global route-inventory files and the integration support helper are
additional necessary Phase 1E paths: the inventories keep the complete RBAC
handler sets explicit, and the helper owns isolated PostgreSQL fixtures and
deterministic lock observation shared by the two new integration suites.

## Cleanup

All Phase 1E fixture families and test AuditLogs were removed by their suites.
The implementation created no Redis keys, temporary media files, storage
objects, buckets, containers, volumes, images, archive, commit, push, or pull
request. Existing local PostgreSQL, Redis, and MinIO containers were used only
for validation and restored to their original stopped state after the final
checks.
