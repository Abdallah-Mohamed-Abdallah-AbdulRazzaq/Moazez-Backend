# LEARNING-CONTENT-DISCOVERY-AND-MEDIA-1B Closeout

## Scope

- Branch: `feat/learning-content-media-1b-publication-lifecycle`
- Baseline: `e3fec093a6737659c44c02bc0721e4fae37d3639`
- Phase: independent `LessonContentItem` publication lifecycle only
- Migration: `20260721224852_lesson_content_publication_lifecycle`
- Commit, push, pull request, phase 1C-P, and phase 1C work were not authorized.

The red contract was added before production implementation. Its initial run failed 6/6 assertions for the absent lifecycle schema/migration, routes, conditional mutations, app visibility gates, and safe conflict contract.

## Schema and migration

The schema now defines `LessonContentPublicationStatus` with `DRAFT`, `PUBLISHED`, and `ARCHIVED`. `LessonContentItem` has the five lifecycle fields, nullable publication/archive actor relations with `Restrict` deletion behavior, actor indexes, and the locked composite index `lesson_content_items_school_publication_lesson_order_idx` with the exact tuple `schoolId`, `publicationStatus`, `lessonId`, `sortOrder`.

The previous contract assertion referenced the obsolete pre-correction index name. The test was updated to assert the locked index name and exact field tuple, reject the obsolete name, and prove that `deletedAt` is absent from the locked index; no production schema rollback occurred.

The migration adds the enum and fields, performs the compatibility backfill, makes `publication_status` non-null with database default `DRAFT`, adds the actor foreign keys and indexes, and creates exactly one custom constraint:

`lesson_content_items_publication_state_check`

The logical predicate permits only:

- DRAFT with all publication and archive fields null;
- PUBLISHED with `deletedAt` null, the complete publication pair, and the null archive pair;
- ARCHIVED with non-null `archivedAt` and either a complete publication pair or a fully null publication pair.

The custom-SQL inventory records the constraint, explicitly documents the authorized compatibility DML, and retains the active-chain total of 34 PostgreSQL-specific objects: 15 partial unique indexes and 19 CHECK constraints.

### Supplemental correction rehearsal

A disposable PostgreSQL 18.1 environment passed the corrected five-to-six migration upgrade, fresh replay, normal seed, migration status, second-deploy no-op, and 17-case CHECK/default matrix. It was fully removed afterward. This is supplemental evidence and is not the final supported-version migration conclusion.

### Authoritative final migration rehearsal

A dedicated disposable PostgreSQL 16 container was deployed through the existing five-migration baseline. Three aggregate-safe synthetic legacy rows were inserted before applying `20260721224852_lesson_content_publication_lifecycle`: two non-deleted rows and one soft-deleted row. No storage object was created.

- Both live rows became PUBLISHED.
- Each live `publishedAt` exactly equaled its original `createdAt`.
- Each live `publishedByUserId` exactly equaled its original `createdByUserId`.
- Both live archive pairs remained null.
- The deleted row became ARCHIVED.
- Its `archivedAt` exactly equaled its original `deletedAt`.
- Its archive actor and publication pair remained null.
- Its original non-null `deletedAt` remained unchanged, so it stayed hidden.

A separate empty PostgreSQL 16 database replayed all six migrations successfully. The normal seed completed, `prisma migrate status` reported the schema up to date, and a second `prisma migrate deploy` reported no pending migrations.

The direct PostgreSQL 16 matrix passed all 17 cases: four valid lifecycle shapes, twelve invalid shapes rejected by the named CHECK (including a PUBLISHED row with non-null `deletedAt`), and an omitted publication status receiving database-default DRAFT. The disposable PostgreSQL 16 container was then fully removed. The final phase conclusion relies on this PostgreSQL 16 rehearsal.

## Runtime contract

The management response exposes lowercase publication status and nullable ISO lifecycle timestamps/actor IDs. Management list/get continue to show every non-deleted DRAFT, PUBLISHED, and ARCHIVED row.

The existing nested controller now exposes bodyless POST/200 actions for `publish`, `unpublish`, and `archive`. They inherit `SchoolManagementOnly`, require `academics.curriculum.manage`, and parse all four path IDs with UUID pipes. No permission was added.

The state machine is:

- DRAFT -> PUBLISHED through publish;
- PUBLISHED -> DRAFT through unpublish, clearing the publication pair;
- PUBLISHED -> ARCHIVED through archive, retaining the publication pair and setting the archive actor/time;
- ARCHIVED is terminal.

Every other transition returns `learning.content.publication_conflict` with HTTP 409 and the exact state-only details `{ from, to }`. Both values are uppercase Prisma publication enums. `from` is the state observed before the conditional attempt; `to` is the requested or required operation state. The keyset is exact and exposes no resource, tenant, actor, content, File, or timestamp value. PUBLISHED update/reorder/delete and every ARCHIVED mutation use this same bounded conflict.

Create explicitly persists DRAFT with null lifecycle fields. Existing update, reorder, and soft delete are DRAFT-only. Lifecycle-sensitive writes use a generated-Prisma conditional update with trusted School, exact Curriculum/unit/lesson/content path, non-deleted state, expected publication status, and expected row version. A zero-row result maps to the same deterministic `{ from, to }` conflict using the request's previously observed state and operation target; it performs no race-sensitive reread and exposes no Prisma error.

Transition audits use `academics.lesson_content.publish`, `academics.lesson_content.unpublish`, and `academics.lesson_content.archive`. Successful transitions write exactly one audit. Conflicts write none. Transition before/after data contains only `publicationStatus`, `publishedAt`, and `archivedAt`; the denylist excludes content, File, metadata, filename, tenant, storage, and content actor fields.

## Visibility and concurrency evidence

- Student Lesson detail: PUBLISHED visible; DRAFT and ARCHIVED hidden.
- Parent linked-child Lesson detail: PUBLISHED visible; DRAFT and ARCHIVED hidden.
- Teacher exact-owned preparation detail: DRAFT and PUBLISHED visible; ARCHIVED hidden.
- A different Teacher cannot cross the existing LessonPlan ownership boundary to preview DRAFT content.
- Student Subject `contentSummary` counts PUBLISHED content only.
- An ACTIVE Curriculum accepts a new DRAFT. Publishing makes it app-visible; unpublishing hides it; editing the DRAFT does not restore visibility; republishing is required.
- All six changed soft-deleted runtime fixtures use the valid `DRAFT + deletedAt` shape with null publication/archive pairs. The changed runtime fixtures contain zero `PUBLISHED + deletedAt` rows, while every hidden-deleted-content assertion remains intact.

Five deterministic concurrent repository conditional writes against PostgreSQL proved:

- update versus publish: one updated and one conflict; final state is updated DRAFT or original-content PUBLISHED, never updated PUBLISHED;
- delete versus publish: one updated and one conflict; final state is deleted DRAFT or live PUBLISHED, never deleted PUBLISHED;
- publish race: one updated, one conflict, final PUBLISHED;
- archive race: one updated, one conflict, final ARCHIVED;
- publish versus archive starts PUBLISHED: the publish attempt conflicts, archive updates, and the final state is ARCHIVED.

The HTTP lifecycle E2E retains the audit-facing races: publish is one 200, one 409, and one publish audit; archive is one 200, one 409, and one archive audit; publish versus archive starts PUBLISHED, returns a state-only `PUBLISHED -> PUBLISHED` conflict for publish, archives successfully, ends ARCHIVED, and writes exactly one new transition audit. The earlier HTTP-scheduling proofs for update versus publish and delete versus publish were removed because those invariants are now owned by the deterministic PostgreSQL repository integration test.

## Security evidence

Publication transition tests proved access for School management, Organization management with a School membership, and custom School/Organization management roles carrying `academics.curriculum.manage`. A same-School viewer missing that permission received 403. Teacher, Student, Parent, Applicant, and Platform actors received the existing 403 management boundary. Cross-School and wrong nested paths remained safe lesson-content not-found responses and were never reclassified as publication conflicts.

## Validation results

| Validation                                                          | Result                                       |
| ------------------------------------------------------------------- | -------------------------------------------- |
| Initial red publication contract                                    | 0/6 passed as expected before implementation |
| Corrected publication schema contract                               | 6/6 passed                                   |
| Complete changed-file unit group                                    | 10/10 suites; 144/144 tests passed           |
| Final fixture/error correction focused publication unit             | 2/2 suites; 37/37 tests passed               |
| Focused lifecycle unit/controller/adapter contract                  | 67/67 passed                                 |
| Complete relevant Curriculum/Student/Parent/Teacher unit regression | 173/173 passed                               |
| Direct PostgreSQL 16 CHECK/default matrix                           | 17/17 passed                                 |
| PostgreSQL 16 conditional repository concurrency                    | 5/5 passed                                   |
| Combined PostgreSQL 16 publication integration                      | 22/22 passed                                 |
| Academics lifecycle, audit, and concurrency E2E                     | 2/2 passed                                   |
| Student/Parent/Teacher app E2E                                      | 26/26 passed                                 |
| Publication security actor/tenancy matrix                           | 5/5 passed                                   |
| Student/Parent/Teacher app security                                 | 15/15 passed                                 |
| Final Academics security inventory                                  | 6/6 passed                                   |
| Migration governance unit tests                                     | 39/39 passed                                 |
| Migration structure                                                 | PASS: active 6, new 1, historical edits 0    |
| PostgreSQL 16 upgrade from five migrations                          | PASS                                         |
| PostgreSQL 16 fresh six-migration replay and normal seed            | PASS                                         |
| PostgreSQL 16 migration status                                      | UP TO DATE                                   |
| PostgreSQL 16 second deploy                                         | NO-OP                                        |
| PostgreSQL 18.1 supplemental rehearsal                              | PASS: environment removed                    |
| Prisma format                                                       | PASS                                         |
| Prisma validate                                                     | PASS                                         |
| Prisma generate                                                     | PASS                                         |
| Build                                                               | PASS                                         |
| Production and new/focused-test ESLint                              | PASS                                         |
| Legacy E2E/security ESLint comparison                               | PASS: no new errors or warnings              |
| Scoped Prettier write/check                                         | PASS                                         |
| Disposable PostgreSQL 16 cleanup                                    | PASS: phase container removed                |

`test/security/tenancy.academics-final-completion.spec.ts` retains its pre-existing whole-file formatting rather than adding unrelated formatting churn; its final diff contains only the publication fixture and no-Redis test-harness changes. All other changed TypeScript and Markdown files pass the scoped Prettier write/check. The final diff and staged-file checks are recorded in the command closeout.

## Changed files

Production/schema/migration/documentation:

- `ERROR_CATALOG.md`
- `docs/database/migration-custom-sql-inventory.md`
- `docs/sprint-learning-content-discovery-media-1b-publication-lifecycle-closeout.md`
- `prisma/schema.prisma`
- `prisma/migrations/20260721224852_lesson_content_publication_lifecycle/migration.sql`
- `src/modules/academics/curriculum/application/lesson-content.use-cases.ts`
- `src/modules/academics/curriculum/controller/curriculum.controller.ts`
- `src/modules/academics/curriculum/curriculum.module.ts`
- `src/modules/academics/curriculum/domain/lesson-content.exceptions.ts`
- `src/modules/academics/curriculum/dto/lesson-content-response.dto.ts`
- `src/modules/academics/curriculum/infrastructure/lesson-content.repository.ts`
- `src/modules/academics/curriculum/presenters/lesson-content.presenter.ts`
- `src/modules/parent-app/lessons/infrastructure/parent-child-lessons-read.adapter.ts`
- `src/modules/student-app/lessons/infrastructure/student-lessons-read.adapter.ts`
- `src/modules/student-app/subjects/infrastructure/student-subject-lessons-read.adapter.ts`
- `src/modules/teacher-app/lesson-preparation/infrastructure/teacher-lesson-preparation-read.adapter.ts`

Tests:

- `src/modules/academics/curriculum/tests/lesson-content.use-case.spec.ts`
- `src/modules/academics/curriculum/tests/lesson-content-publication.contract.spec.ts`
- `src/modules/academics/curriculum/tests/lesson-content-publication.controller.spec.ts`
- `src/modules/academics/curriculum/tests/lesson-content-publication.use-case.spec.ts`
- `src/modules/student-app/subjects/tests/student-subject-lessons-read.adapter.spec.ts`
- `test/e2e/academics-lesson-content-foundation.e2e-spec.ts`
- `test/e2e/parent-app-child-lessons.e2e-spec.ts`
- `test/e2e/student-app-lessons.e2e-spec.ts`
- `test/e2e/teacher-app-lesson-preparation.e2e-spec.ts`
- `test/integration/lesson-content-publication-constraint.integration.spec.ts`
- `test/integration/lesson-content-publication-read-adapters.spec.ts`
- `test/security/tenancy.academics-final-completion.spec.ts`
- `test/security/tenancy.academics-lesson-content.spec.ts`
- `test/security/tenancy.parent-app-child-lessons.spec.ts`
- `test/security/tenancy.student-app-lessons.spec.ts`
- `test/security/tenancy.teacher-app-lesson-preparation.spec.ts`

## Infrastructure and exclusions

The authoritative final database rehearsal used a dedicated disposable PostgreSQL 16 container. The earlier PostgreSQL 18.1 correction rehearsal remains supplemental evidence only. Both disposable environments were fully removed. No persistent/shared database was mutated. No Redis or MinIO server was started. No Redis data or storage object was created or changed. The foundation File assertion used database-only synthetic File metadata.

This final fixture/error/concurrency correction cloned the stopped, already-migrated PostgreSQL 16 rehearsal state into a new disposable volume, ran only the authorized integration, E2E, and security suites, verified zero correction-fixture residue, and removed the correction container and volume. It did not rerun migration deployment, migration replay, seed, migration governance/structure, or Prisma commands.

No File upload/session, media verification, probing, signed playback, cleanup worker, Redis/BullMQ implementation, permission, Role seed, demo seed source, package, deployment, or CI work was performed.

The next prerequisite is phase 1C-P media verification runtime, but it is not authorized until 1B receives independent review and is merged.
