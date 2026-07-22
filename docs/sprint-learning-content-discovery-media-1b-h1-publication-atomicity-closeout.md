# Learning Content Discovery and Media 1B-H1 Closeout

## Scope and baseline

- Phase: `LEARNING-CONTENT-DISCOVERY-AND-MEDIA-1B-H1`
- Branch: `fix/learning-content-media-1b-publication-atomicity`
- Baseline and unchanged `HEAD`: `6ae8dfa3d42c9f2a5965b6594dc58b66d80080af`
- Purpose: harden the already-merged Lesson Content publication lifecycle. This phase did not implement `1C-P`, `1C`, media probing, upload sessions, or storage behavior.

The preflight found the required branch and baseline, a clean worktree, zero staged files, six existing migrations, and no prior modifications.

The correction-pass preflight then confirmed the unchanged branch and `HEAD`, exactly the same 14 intended phase files, zero staged files, and zero unauthorized files.

## Original gaps confirmed

The accepted implementation committed Lesson Content mutations before writing success audits through the root `AuthRepository`; checked Curriculum, Unit, and Lesson state before the mutation transaction; did not revalidate a DRAFT FILE item's File during publication; allowed nested identifiers in the two not-found error details; and had no focused Learning Content CI workflow.

## Selected transaction design

`LessonContentUnitOfWork` exposes a narrow application transaction context. Its Prisma implementation owns one PostgreSQL transaction, while use cases can access only the exact Lesson Content operations they require. It does not expose `PrismaClient` or `Prisma.TransactionClient` to application code.

Every create, update, reorder, soft delete, publish, unpublish, and archive operation now performs this order within one transaction:

1. lock and validate Curriculum;
2. lock and validate CurriculumUnit;
3. lock and validate CurriculumLesson;
4. lock and validate a referenced File only when required;
5. perform the LessonContentItem write with the existing status and `updatedAt` compare-and-swap where applicable;
6. insert the success AuditLog.

The exact nested path and active School bind every parent, File, content, and audit operation. The parent and File locks use parameterized `Prisma.sql` queries and `SELECT ... FOR UPDATE`; no UUID is concatenated into SQL.

## Atomic audit guarantee

Success audits are inserted only after a successful content write and before the same transaction commits. Two independent matrices use a deterministic AuditLog actor foreign-key violation:

- transaction-context-level rollback proof: 7/7 for create, update, reorder, soft delete, publish, unpublish, and archive;
- actual-use-case rollback proof: 7/7 through `CreateLessonContentUseCase`, `UpdateLessonContentUseCase`, `ReorderLessonContentUseCase`, `DeleteLessonContentUseCase`, `PublishLessonContentUseCase`, `UnpublishLessonContentUseCase`, and `ArchiveLessonContentUseCase`.

The actual-use-case matrix uses a test-only wrapper around the real `PrismaLessonContentUnitOfWork`. It preserves the real PostgreSQL transaction, parent/File locks, and content writes and overrides only `writeSuccessfulAudit` to replace the actor with a nonexistent UUID. Conditional losers and validation failures produce no success audit.

Audit summaries remain bounded lifecycle/mutation summaries and do not add title, body text, URL, File ID, filename, metadata, storage coordinates, secrets, or request tokens.

## Parent and File hardening

Independent review confirmed that the production Curriculum, Unit, and Lesson cascades still acquired descendant rows before their parents. That reverse order formed a real PostgreSQL deadlock with the Lesson Content root-first order, could miss a concurrent create, tried to soft-delete PUBLISHED rows in violation of the database `CHECK`, and mutated ARCHIVED rows.

The final Contract B implementation is: delete DRAFT, preserve ARCHIVED, and reject PUBLISHED. Curriculum, Unit, and Lesson deletion now use one compatible root-first order inside the repository transaction: Curriculum; target/all live Units ordered by ID; target/all live Lessons ordered by ID; all affected live LessonContentItems ordered by ID; publication validation; DRAFT-only content deletion; then structural deletion. Every raw lock is a parameterized `Prisma.sql` `SELECT ... FOR UPDATE` bound to the exact School and hierarchy. Unit and Lesson cascades return the existing Curriculum read-only contract when final locked Curriculum state is ARCHIVED.

The production state matrix proves all 18/18 combinations: each of Curriculum, Unit, and Lesson against DRAFT, PUBLISHED, ARCHIVED, DRAFT+PUBLISHED, DRAFT+ARCHIVED, and PUBLISHED+ARCHIVED. Any PUBLISHED row rejects the complete operation with exactly `{ from: PUBLISHED, to: DRAFT }`; no structural/content write or parent success audit remains. Successful cascades delete only DRAFT content, leave ARCHIVED content and its lifecycle timestamps/`updatedAt` unchanged, and write exactly one parent success audit.

The real production-path concurrency matrix proves 12/12 parent/delete cases. Actual parent delete first is proved for all three hierarchy scopes with PostgreSQL wait-chain evidence; the later publish sees the deleted hierarchy and writes no content audit. Actual Lesson Content first is proved for Curriculum publish, Unit update, and Lesson content-delete ordering. Actual create first is proved for all three scopes and the later cascade observes and deletes the committed DRAFT. Actual parent delete first before create is proved for all three scopes; no content row or create audit remains. There is no deadlock, timeout, orphan live content, or invalid PUBLISHED+`deletedAt` state.

Actual Curriculum archive ordering is proved in both directions: archive first makes the later content mutation read-only, while content first commits its mutation and audit before the later archive and its audit. Actual `FilesRepository.softDeleteFile` ordering is likewise proved in both directions.

FILE create, replacement/update, and publish lock a same-School, non-deleted File in the same transaction. Publication therefore revalidates a File that may have changed since the DRAFT was created. Tests prove already-deleted, replacement-deleted, create-deleted, racing File deletion, and foreign-School File behavior. A focused unit assertion proves non-FILE publication performs no File query.

For the FILE publish-first direction, publish commits while the File is live and the later File deletion is a separate serial operation. The publish does not commit against an already-deleted File, and existing app readers hide the subsequently deleted File. Globally preventing deletion of Files referenced by PUBLISHED content remains deferred to the later File/media lifecycle contract; this phase does not change Files production code.

Parent success-audit insertion remains outside the Curriculum repository cascade transaction. That is pre-existing broader Curriculum debt and is explicitly not represented as atomic by this phase. The cascade persistence writes themselves are atomic; Lesson Content mutation/audit atomicity remains fully transactional.

## Error precedence

Create now locks and validates the exact School-scoped Curriculum, Unit, and Lesson and checks Curriculum mutability before normalizing any title, body, URL, type payload, File reference, or sort order. Reorder resolves the path and read-only state before validating sort order. Focused tests prove missing/foreign paths win over unsafe URL or invalid content, ARCHIVED wins over unsafe URL or invalid reorder, owned mutable unsafe URLs still return `invalid_url`, and a valid owned reorder still succeeds. Existing publication-state conflict precedence is unchanged.

## Safe error contracts

`academics.lesson_content.not_found` and `academics.lesson_content.file_not_found` now omit details. HTTP E2E and cross-School security assertions reject the identifier keys `curriculumId`, `unitId`, `lessonId`, `contentItemId`, `fileId`, `schoolId`, `organizationId`, and `actorId`, and also reject the actual fixture identifier values.

`learning.content.publication_conflict` remains unchanged: details contain exactly `{ from, to }`, using bounded uppercase publication states and no identifiers or timestamps.

## Red-test evidence

Before production changes, the three smallest focused suites failed as intended: 3/3 suites failed, 6 tests failed, 48 tests passed, 54 tests total. The failures proved the missing unit-of-work contract, missing parent/File locking, identifier-bearing not-found constructors, missing FILE publish revalidation, and missing focused CI workflow. There were no syntax, import, fixture, or infrastructure failures.

Before the correction implementation, the two focused precedence/CI suites failed as intended: 2/2 suites failed, 6 tests failed, 21 tests passed, 27 tests total. Five failures showed `invalid_url` or `invalid_type_payload` incorrectly taking precedence over `not_found`/`read_only`; one showed the missing CI migration-governance steps. The expanded database evidence was validated independently at 34/34 before the production precedence correction.

For the final cascade correction, the focused red unit/contract run failed 7 tests and passed 15/22. The failures showed all three missing parent publication-conflict mappings, both missing final read-only mappings, the reverse production cascade contract, and the missing CI migration-base resolution. After applying the two existing pending migrations to the disposable six-migration test database, the valid PostgreSQL red run failed exactly 4 tests and passed 34/38: raw `CHECK` failure for a PUBLISHED cascade, ARCHIVED mutation, a missed create below a deleted Lesson, and a real `40P01` deadlock. An earlier run against a stale five-column database was infrastructure-invalid and is not counted as red evidence.

## Completed validation evidence

- Focused Curriculum and Lesson Content unit/contract/controller: 5/5 suites, 81/81 tests.
- PostgreSQL constraint/atomicity/read-adapter integration: 3/3 suites, 85/85 tests. The atomicity suite contributes 60/60: seven transaction-context rollback cases, seven actual-use-case rollback cases, four low-level conditional-write races, 18 production cascade state cases, four focused cascade regression cases, 12 real parent/content/create serialization cases, two actual Curriculum archive cases, two actual File deletion cases, and four additional File validity cases.
- The unchanged publication `CHECK`/database-default matrix remains 17/17, including rejection of PUBLISHED with non-null `deletedAt`; the five conditional-write concurrency cases remain 5/5.
- Academics plus Student/Parent/Teacher visibility E2E: 4/4 suites, 28/28 tests.
- Academics plus Student/Parent/Teacher security: 5/5 suites, 26/26 tests.
- Directly affected Student Lesson, Student Subject Lesson, Parent Child Lesson, and Teacher Lesson Preparation unit regression: 7/7 suites, 97/97 tests.
- Build: pass.
- Migration governance: pass with 6 active migrations, 0 new migrations, and rebaseline off.
- Prisma validate: pass.
- Prisma generate: pass.
- Migration status against the disposable database: up to date.
- Prisma schema format check: the unchanged baseline schema reports pre-existing formatting drift. The schema was not formatted or modified because it is outside this phase's edit allowlist.
- ESLint: the 12 changed non-legacy production/contract/unit/integration TypeScript files pass with zero findings. The newly touched legacy Curriculum unit harness retains exactly its baseline 12 errors and 6 warnings, with no new finding. The two changed legacy HTTP suites retain no new debt: Academics E2E remains at the baseline 25 unsafe Supertest findings, and Academics security remains improved from the baseline 12 to 9. No broad suppression or unrelated legacy refactor was added.
- Prettier: all 17 changed supported files pass the scoped check.

## Focused CI

`.github/workflows/learning-content-integrity.yml` is a dedicated workflow for pull requests, pushes to `main`, and manual dispatch. Checkout now uses full history. The workflow explicitly fetches origin history/tags, resolves pull-request base SHA, nonzero push-before SHA (or `HEAD^` fallback), or the fetched default branch for manual dispatch, verifies the commit, and exports its exact SHA as `MIGRATION_BASE_REF`. It uses read-only repository permissions, concurrency cancellation, Node 20, `npm ci`, PostgreSQL 16, Redis 7, migration-governance validation before Prisma validation, the six existing migrations, post-deploy migration-status confirmation, normal seeding, Prisma validation/generation, and build. GitHub Actions runs the focused Curriculum parent-cascade use-case suite in addition to the Lesson Content unit, contract, and controller suites, followed by the focused integration, E2E, visibility, and security suites.

It does not modify the migration-integrity workflow, install packages outside `npm ci`, use `latest` service images, build or deploy an application image, or install ffprobe.

## Repository and cleanup evidence

The phase changes seventeen allowlisted files:

- `.github/workflows/learning-content-integrity.yml`
- `docs/sprint-learning-content-discovery-media-1b-h1-publication-atomicity-closeout.md`
- `src/modules/academics/curriculum/application/lesson-content.unit-of-work.ts`
- `src/modules/academics/curriculum/application/lesson-content.use-cases.ts`
- `src/modules/academics/curriculum/application/curriculum.use-cases.ts`
- `src/modules/academics/curriculum/curriculum.module.ts`
- `src/modules/academics/curriculum/domain/lesson-content.exceptions.ts`
- `src/modules/academics/curriculum/infrastructure/lesson-content.repository.ts`
- `src/modules/academics/curriculum/infrastructure/prisma-lesson-content.unit-of-work.ts`
- `src/modules/academics/curriculum/infrastructure/curriculum.repository.ts`
- `src/modules/academics/curriculum/tests/lesson-content-publication.contract.spec.ts`
- `src/modules/academics/curriculum/tests/lesson-content-publication.use-case.spec.ts`
- `src/modules/academics/curriculum/tests/lesson-content.use-case.spec.ts`
- `src/modules/academics/curriculum/tests/curriculum.use-case.spec.ts`
- `test/e2e/academics-lesson-content-foundation.e2e-spec.ts`
- `test/integration/lesson-content-publication-atomicity.integration.spec.ts`
- `test/security/tenancy.academics-lesson-content.spec.ts`

There are zero unauthorized files and zero staged files. Prisma schema, migrations, packages, lockfile, seeds, permissions, controllers, DTOs, presenters, app read adapters, storage, Redis behavior, and deployment configuration are unchanged.

Validation used an isolated database in the already-existing local PostgreSQL 16 container and the already-existing Redis 7 container. Test fixtures use exact IDs/unique markers and ordered cleanup. The disposable database is removed after final residue checks, both containers are returned to their original stopped state, MinIO remains stopped, and no image, container, volume, Redis key, or storage object is created by this phase.

## Deferred work

`1C-P`, `1C`, `1D`, ffprobe/FFmpeg, media verification, upload-session work, direct upload URLs, File READY/LEGACY lifecycle, storage cleanup, and deployment/runtime-image work remain deferred and unauthorized.
