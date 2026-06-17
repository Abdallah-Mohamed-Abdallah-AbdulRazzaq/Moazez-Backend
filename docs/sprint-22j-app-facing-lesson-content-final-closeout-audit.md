# Sprint 22J — App-Facing Lesson Content Final Closeout Audit

## Status

- Result: PASS.
- Baseline: `c17abad feat: add parent child lesson content workflows`.
- Audit date: 2026-06-17.
- Audit type: docs-only final closeout audit.
- Runtime changes: none in Sprint 22J.
- Schema changes: none in Sprint 22J; no Prisma schema changes are required for the completed V1 app-facing lesson content chain.
- Migration changes: none in Sprint 22J.
- Package changes: none in Sprint 22J.

Sprint 22J Result: PASS.

App-facing lesson content / lesson preparation feature chain is complete for V1 scope.
Teacher, Student, and Parent app-facing boundaries are implemented, tested, and safe.

## Scope

This audit closes the app-facing lesson feature chain delivered by:

- Sprint 22F: app-facing lesson content / lesson preparation contract audit.
- Sprint 22G: Teacher App lesson-preparation read/status workflows.
- Sprint 22H: Student App lesson content read workflows.
- Sprint 22I: Parent App child lesson content read workflows.

In scope:

- Teacher App lesson preparation today/week/detail/status routes.
- Student App lesson content today/week/detail routes.
- Parent App linked-child lesson content today/week/detail routes.
- App-facing access boundaries, ownership rules, visibility rules, content safety, and test coverage.

Out of scope:

- School Dashboard lesson-plan runtime changes.
- Student/Parent lesson status mutation.
- File download/signed URL implementation.
- New `PREPARED` status or any Prisma enum/schema changes.
- Home composition changes.
- Timetable, homework, gradebook, calendar, or curriculum mutation changes.

## Baseline Commits Reviewed

| Commit | Purpose | Closeout relevance |
| --- | --- | --- |
| `b3c11a9 docs: audit app-facing lesson content preparation` | Sprint 22F contract audit. | Defined Teacher/Student/Parent app-facing lesson gaps and safe implementation split. |
| `32d5b11 feat: add teacher lesson preparation workflows` | Sprint 22G. | Added Teacher App lesson-preparation read/status boundary. |
| `aa89770 feat: add student lesson content workflows` | Sprint 22H. | Added Student App lesson content read boundary. |
| `c17abad feat: add parent child lesson content workflows` | Sprint 22I. | Added Parent App child-scoped lesson content read boundary. |

## Route Coverage Matrix

| Surface | Method | Route | Controller / source | Status |
| --- | --- | --- | --- | --- |
| Teacher App | GET | `/api/v1/teacher/lesson-preparation/today` | `src/modules/teacher-app/lesson-preparation/controller/teacher-lesson-preparation.controller.ts` | COMPLETE |
| Teacher App | GET | `/api/v1/teacher/lesson-preparation/week` | `src/modules/teacher-app/lesson-preparation/controller/teacher-lesson-preparation.controller.ts` | COMPLETE |
| Teacher App | GET | `/api/v1/teacher/lesson-preparation/:lessonPlanItemId` | `src/modules/teacher-app/lesson-preparation/controller/teacher-lesson-preparation.controller.ts` | COMPLETE |
| Teacher App | PATCH | `/api/v1/teacher/lesson-preparation/:lessonPlanItemId/status` | `src/modules/teacher-app/lesson-preparation/controller/teacher-lesson-preparation.controller.ts` | COMPLETE |
| Student App | GET | `/api/v1/student/lessons/today` | `src/modules/student-app/lessons/controller/student-lessons.controller.ts` | COMPLETE |
| Student App | GET | `/api/v1/student/lessons/week` | `src/modules/student-app/lessons/controller/student-lessons.controller.ts` | COMPLETE |
| Student App | GET | `/api/v1/student/lessons/:lessonPlanItemId` | `src/modules/student-app/lessons/controller/student-lessons.controller.ts` | COMPLETE |
| Parent App | GET | `/api/v1/parent/children/:studentId/lessons/today` | `src/modules/parent-app/lessons/controller/parent-child-lessons.controller.ts` | COMPLETE |
| Parent App | GET | `/api/v1/parent/children/:studentId/lessons/week` | `src/modules/parent-app/lessons/controller/parent-child-lessons.controller.ts` | COMPLETE |
| Parent App | GET | `/api/v1/parent/children/:studentId/lessons/:lessonPlanItemId` | `src/modules/parent-app/lessons/controller/parent-child-lessons.controller.ts` | COMPLETE |

Route inventory tests also preserve the final app-facing route set:

- Teacher route inventory: `test/e2e/teacher-app-lesson-preparation.e2e-spec.ts`, `test/e2e/teacher-app-final-closeout.e2e-spec.ts`.
- Student route inventory: `test/e2e/student-app-lessons.e2e-spec.ts`, `test/e2e/student-app-final-closeout.e2e-spec.ts`.
- Parent route inventory: `test/e2e/parent-app-child-lessons.e2e-spec.ts`, `test/e2e/parent-app-final-closeout.e2e-spec.ts`.

## Role and Ownership Boundary Matrix

| Surface | Boundary implementation | Ownership rule | Dashboard permissions? | Status |
| --- | --- | --- | --- | --- |
| Teacher App | `TeacherAppAccessService.assertCurrentTeacher()` and `listOwnedTeacherAllocationIds()` in `src/modules/teacher-app/lesson-preparation/application/*`. | Item must belong to a teacher-owned `TeacherSubjectAllocation`; adapter filters by `teacherUserId`, `schoolId`, and owned allocation ids. | None. `rg RequiredPermissions src/modules/teacher-app/lesson-preparation` returns no matches. | COMPLETE |
| Student App | `StudentAppAccessService.getCurrentStudentWithEnrollment()` in `src/modules/student-app/lessons/application/*`. | Item must match the current active student enrollment classroom, academic year, term, and school. | None. `rg RequiredPermissions src/modules/student-app/lessons` returns no matches. | COMPLETE |
| Parent App | `ParentAppAccessService.getAccessibleChild(studentId)` in `src/modules/parent-app/lessons/application/*`. | Parent must own the requested child through active guardian-child and enrollment context; item must match the child classroom, academic year, and term. | None. `rg RequiredPermissions src/modules/parent-app/lessons` returns no matches. | COMPLETE |

Security test evidence:

- Teacher non-teacher denial and owned-allocation isolation: `test/security/tenancy.teacher-app-lesson-preparation.spec.ts`.
- Student non-student denial and current-classroom isolation: `test/security/tenancy.student-app-lessons.spec.ts`.
- Parent non-parent denial and linked-child isolation: `test/security/tenancy.parent-app-child-lessons.spec.ts`.

## Visibility Rules Matrix

| Surface | Visibility rule | Evidence | Status |
| --- | --- | --- | --- |
| Teacher App read | Teacher can read only lesson-plan items where `lessonPlan.teacherUserId` and `lessonPlan.teacherSubjectAllocationId` match the current teacher-owned allocation ids. Deleted rows, archived plans, archived curriculum, inactive subjects, and deleted classroom hierarchy rows are excluded for reads. | `TeacherLessonPreparationReadAdapter.teacherOwnedItemWhere()` in `src/modules/teacher-app/lesson-preparation/infrastructure/teacher-lesson-preparation-read.adapter.ts`. | COMPLETE |
| Teacher App status mutation | Mutation first resolves the same owned item with archived-plan visibility for safe read-only error handling, then denies closed terms and archived/read-only plans before updating status/notes. | `UpdateTeacherLessonPreparationStatusUseCase` in `src/modules/teacher-app/lesson-preparation/application/update-teacher-lesson-preparation-status.use-case.ts`. | COMPLETE |
| Student App read | Student can read only active lesson-plan items for the current enrollment classroom, academic year, term, and school; list routes constrain by requested date/week windows. | `StudentLessonsReadAdapter.visibleStudentLessonWhere()` in `src/modules/student-app/lessons/infrastructure/student-lessons-read.adapter.ts`. | COMPLETE |
| Parent App read | Parent can read only active lesson-plan items for a linked child's active enrollment classroom, academic year, and term; list routes constrain by requested date/week windows. | `ParentChildLessonsReadAdapter.visibleParentChildLessonWhere()` in `src/modules/parent-app/lessons/infrastructure/parent-child-lessons-read.adapter.ts`. | COMPLETE |
| Cross-scope detail behavior | Hidden, other-classroom, cross-school, archived, or deleted items resolve through safe app-facing not-found/forbidden behavior. | Unit tests under `src/modules/*/lessons*/tests/**`; security tests under `test/security/tenancy.*lessons*.spec.ts`. | COMPLETE |

## Safe Content Exposure Review

Shared safe response fields:

- Curriculum: `id`, `title`.
- Unit: `id`, `title`, `sortOrder`.
- Lesson: `id`, `title`, `sortOrder`, `objectives`.
- Content item: `contentItemId`, `type`, `title`, `bodyText`, `url`, `sortOrder`, `isRequired`, `estimatedMinutes`.
- File metadata only: `fileId`, `filename`, `mimeType`, `sizeBytes`.

Safety findings:

- Student App and Parent App adapters do not select `LessonPlanItem.notes`, content `metadata`, storage `bucket`, storage `objectKey`, uploader ids, created/updated actor ids, or raw file internals.
- Teacher App may return teacher-facing `LessonPlanItem.notes` and content `metadata` in `TeacherLessonPreparationPresenter`; this is limited to the teacher-owned preparation surface and is not exposed to Student or Parent apps.
- No app-facing lesson module returns signed URLs or file download URLs.
- File content responses return only safe metadata from `file.id`, `file.originalName`, `file.mimeType`, and `file.sizeBytes`.
- Unit, E2E, and security tests assert absence of tenant/internal/storage fields including `schoolId`, `organizationId`, `membershipId`, `roleId`, `email`, `passwordHash`, `deletedAt`, `bucket`, `objectKey`, `uploaderId`, `createdByUserId`, `updatedByUserId`, and `notes` where notes are not teacher-facing.

Relevant presenters:

- Teacher: `src/modules/teacher-app/lesson-preparation/presenters/teacher-lesson-preparation.presenter.ts`.
- Student: `src/modules/student-app/lessons/presenters/student-lessons.presenter.ts`.
- Parent: `src/modules/parent-app/lessons/presenters/parent-child-lessons.presenter.ts`.

## Teacher Notes / Internal Field Exposure Review

| Field / concern | Teacher App | Student App | Parent App | Evidence |
| --- | --- | --- | --- | --- |
| `LessonPlanItem.notes` | Allowed as teacher-facing preparation/status notes. | Not selected or returned. | Not selected or returned. | Teacher presenter includes `notes`; Student/Parent adapters omit `notes`. |
| Teacher-only note leak tests | Teacher status/notes update covered. | Explicit no-leak checks. | Explicit no-leak checks. | `test/e2e/student-app-lessons.e2e-spec.ts`, `test/e2e/parent-app-child-lessons.e2e-spec.ts`, `test/security/tenancy.student-app-lessons.spec.ts`, `test/security/tenancy.parent-app-child-lessons.spec.ts`. |
| Tenant/internal ids | Not returned by presenters. | Not returned by presenters. | Not returned by presenters. | Unit and security no-leak assertions. |
| File storage internals | Not returned. | Not returned. | Not returned. | Presenter file shapes and security tests. |

Conclusion: Teacher notes remain teacher-facing only. Student and Parent lesson content responses do not expose preparation notes or raw internal fields.

## Status Model Review

Teacher App status update accepts only:

- `planned`
- `in_progress`
- `done`
- `skipped`

Evidence:

- `TeacherLessonPreparationStatusDto` in `src/modules/teacher-app/lesson-preparation/dto/teacher-lesson-preparation.dto.ts`.
- `mapTeacherLessonPreparationStatus()` in `src/modules/teacher-app/lesson-preparation/domain/teacher-lesson-preparation-status.ts`.
- Unit and E2E tests reject `prepared`; unit tests also reject `cancelled`.

Status model conclusions:

- No `PREPARED` enum/status was added.
- No Prisma enum changed.
- No schema migration was introduced.
- Teacher App does not weaken dashboard lesson-plan item transition rules; invalid transitions are rejected.
- Student and Parent apps expose existing public labels only: `planned`, `in_progress`, `done`, `skipped`, `rescheduled`, `cancelled`.
- Student and Parent apps do not mutate lesson status.

## Timetable / Week Visibility Review

Final visibility decision:

- Student/Parent lesson-content visibility does not require a new schema flag or timetable publication gate.
- Student/Parent visibility is based on active lesson-plan items tied to the current active enrollment classroom and requested date/week window.
- Student week calculation uses `StudentScheduleReadAdapter.findPublishedScheduleSettings()` when available, with the Student schedule default as fallback.
- Parent week calculation uses `ParentScheduleReadAdapter.findPublishedScheduleSettings()` when available, with the Parent schedule default as fallback.
- Teacher week calculation follows the Teacher schedule week helper default and does not require timetable publication for lesson preparation.
- No signed/download timetable dependency was added.

Evidence:

- `src/modules/student-app/lessons/application/get-student-lessons-week.use-case.ts`.
- `src/modules/parent-app/lessons/application/get-parent-child-lessons-week.use-case.ts`.
- `src/modules/teacher-app/lesson-preparation/application/get-teacher-lesson-preparation-week.use-case.ts`.

## Tests and Verification Coverage

### Unit coverage

| Surface | Test file | Covered behavior |
| --- | --- | --- |
| Teacher App | `src/modules/teacher-app/lesson-preparation/tests/teacher-lesson-preparation.use-case.spec.ts` | Today/week/detail reads, owned allocation filtering, status update, notes update, rejected `prepared`/`cancelled`, closed term denial, archived/read-only denial, transition validation, presenter no-leak checks. |
| Student App | `src/modules/student-app/lessons/tests/student-lessons.use-case.spec.ts` | Today/week/detail reads, current-enrollment scope, empty list behavior, safe content, safe not-found, presenter no-leak checks, scoped adapter query. |
| Parent App | `src/modules/parent-app/lessons/tests/parent-child-lessons.use-case.spec.ts` | Today/week/detail reads, linked-child scope, empty list behavior, safe content, safe not-found, presenter no-leak checks, scoped adapter query. |

### E2E coverage

| Surface | Test file | Covered behavior |
| --- | --- | --- |
| Teacher App | `test/e2e/teacher-app-lesson-preparation.e2e-spec.ts` | Route inventory, today/week reads, detail with safe content, status/notes mutation, rejected `prepared`, closed-term denial, existing Teacher routes preserved. |
| Student App | `test/e2e/student-app-lessons.e2e-spec.ts` | Route inventory, today/week reads, detail with safe content, teacher notes hidden, other classroom and archived content hidden, existing Student routes preserved. |
| Parent App | `test/e2e/parent-app-child-lessons.e2e-spec.ts` | Route inventory, linked-child today/week reads, detail with safe content, teacher notes hidden, unlinked classroom and archived content hidden, existing Parent routes preserved. |

### Security coverage

| Surface | Test file | Covered behavior |
| --- | --- | --- |
| Teacher App | `test/security/tenancy.teacher-app-lesson-preparation.spec.ts` | Non-teacher denial, other-teacher denial, cross-school hiding, hidden id non-leakage, safe response fields, closed-term mutation denial, archived/read-only denial. |
| Student App | `test/security/tenancy.student-app-lessons.spec.ts` | Non-student denial, other-classroom/cross-school/archived hiding, hidden id non-leakage, safe response fields, Parent route inventory presence. |
| Parent App | `test/security/tenancy.parent-app-child-lessons.spec.ts` | Non-parent denial, unlinked/cross-school/archived hiding, hidden id non-leakage, safe response fields, Parent route inventory presence. |

### 22J verification suite

Executed on 2026-06-17 with only `docs/sprint-22j-app-facing-lesson-content-final-closeout-audit.md` changed.

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS; only the new Sprint 22J Markdown audit file is untracked. |
| `git diff --name-only` | PASS; no tracked file diffs. |
| `git diff --stat` | PASS; no tracked file diffs. |
| `git diff --check` | PASS; no whitespace errors. |
| `npx prisma validate` | PASS; Prisma schema is valid. |
| `npx prisma generate` | PASS; Prisma Client generated successfully. |
| `npx prisma migrate status` | PASS; database schema is up to date with 39 migrations. |
| `npm run build` | PASS. |
| `npm run test -- teacher-app --runInBand` | PASS; 42 suites, 231 tests. |
| `npm run test -- student-app --runInBand` | PASS; 42 suites, 172 tests. |
| `npm run test -- parent-app --runInBand` | PASS; 39 suites, 147 tests. |
| `npm run test -- lesson-preparation --runInBand` | PASS; 1 suite, 12 tests. |
| `npm run test -- student-lessons --runInBand` | PASS; 1 suite, 9 tests. |
| `npm run test -- parent-child-lessons --runInBand` | PASS; 1 suite, 9 tests. |
| `npm run test -- lesson-plans --runInBand` | PASS; 1 suite, 18 tests. |
| `npm run test -- curriculum --runInBand` | PASS; 2 suites, 19 tests. |
| `npm run test -- timetable --runInBand` | PASS; 1 suite, 32 tests. |
| `npm run test -- academics --runInBand` | PASS; 19 suites, 124 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/teacher-app-lesson-preparation.e2e-spec.ts` | PASS; 1 suite, 5 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-lessons.e2e-spec.ts` | PASS; 1 suite, 5 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-child-lessons.e2e-spec.ts` | PASS; 1 suite, 5 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app-lesson-preparation.spec.ts` | PASS; 1 suite, 5 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app-lessons.spec.ts` | PASS; 1 suite, 5 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app-child-lessons.spec.ts` | PASS; 1 suite, 5 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/teacher-app-final-closeout.e2e-spec.ts` | PASS; 1 suite, 5 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts` | PASS; 1 suite, 17 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-final-closeout.e2e-spec.ts` | PASS; 1 suite, 18 tests. |

## Regression Impact Review

- No School Dashboard lesson-plan runtime changed after the app-facing 22G/22H/22I chain.
- No Prisma schema changes are needed for the final app-facing lesson-content V1 contract.
- No migrations are needed.
- No seed changes are needed.
- No package script changes are needed.
- No README, deployment, server, CORS, generated, `.env`, or project-structure changes are needed.
- Teacher, Student, and Parent app modules register the final route set through their existing app modules:
  - `src/modules/teacher-app/teacher-app.module.ts`
  - `src/modules/student-app/student-app.module.ts`
  - `src/modules/parent-app/parent-app.module.ts`

## Files Reviewed

Primary audit and rules:

- `docs/sprint-22f-app-facing-lesson-content-preparation-contract-audit.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `V1_SCOPE.md`
- `SECURITY_MODEL.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `TESTING_STRATEGY.md`
- `ERROR_CATALOG.md`
- `OBSERVABILITY.md`
- `MODULES.md`
- `DOMAIN_GLOSSARY.md`
- `USER_TYPES.md`

Teacher App:

- `src/modules/teacher-app/teacher-app.module.ts`
- `src/modules/teacher-app/access/teacher-app-access.service.ts`
- `src/modules/teacher-app/lesson-preparation/controller/teacher-lesson-preparation.controller.ts`
- `src/modules/teacher-app/lesson-preparation/application/get-teacher-lesson-preparation-today.use-case.ts`
- `src/modules/teacher-app/lesson-preparation/application/get-teacher-lesson-preparation-week.use-case.ts`
- `src/modules/teacher-app/lesson-preparation/application/get-teacher-lesson-preparation-detail.use-case.ts`
- `src/modules/teacher-app/lesson-preparation/application/update-teacher-lesson-preparation-status.use-case.ts`
- `src/modules/teacher-app/lesson-preparation/dto/teacher-lesson-preparation.dto.ts`
- `src/modules/teacher-app/lesson-preparation/dto/teacher-lesson-preparation-response.dto.ts`
- `src/modules/teacher-app/lesson-preparation/domain/teacher-lesson-preparation-status.ts`
- `src/modules/teacher-app/lesson-preparation/infrastructure/teacher-lesson-preparation-read.adapter.ts`
- `src/modules/teacher-app/lesson-preparation/presenters/teacher-lesson-preparation.presenter.ts`

Student App:

- `src/modules/student-app/student-app.module.ts`
- `src/modules/student-app/access/student-app-access.service.ts`
- `src/modules/student-app/lessons/controller/student-lessons.controller.ts`
- `src/modules/student-app/lessons/application/get-student-lessons-today.use-case.ts`
- `src/modules/student-app/lessons/application/get-student-lessons-week.use-case.ts`
- `src/modules/student-app/lessons/application/get-student-lesson-detail.use-case.ts`
- `src/modules/student-app/lessons/infrastructure/student-lessons-read.adapter.ts`
- `src/modules/student-app/lessons/presenters/student-lessons.presenter.ts`

Parent App:

- `src/modules/parent-app/parent-app.module.ts`
- `src/modules/parent-app/access/parent-app-access.service.ts`
- `src/modules/parent-app/lessons/controller/parent-child-lessons.controller.ts`
- `src/modules/parent-app/lessons/application/get-parent-child-lessons-today.use-case.ts`
- `src/modules/parent-app/lessons/application/get-parent-child-lessons-week.use-case.ts`
- `src/modules/parent-app/lessons/application/get-parent-child-lesson-detail.use-case.ts`
- `src/modules/parent-app/lessons/infrastructure/parent-child-lessons-read.adapter.ts`
- `src/modules/parent-app/lessons/presenters/parent-child-lessons.presenter.ts`

Related academics/schedule:

- `src/modules/academics/lesson-plans/**`
- `src/modules/academics/curriculum/**`
- `src/modules/academics/timetable/**`
- `src/modules/teacher-app/schedule/**`
- `src/modules/student-app/schedule/**`
- `src/modules/parent-app/schedule/**`
- `prisma/schema.prisma`

Tests:

- `src/modules/teacher-app/lesson-preparation/tests/teacher-lesson-preparation.use-case.spec.ts`
- `src/modules/student-app/lessons/tests/student-lessons.use-case.spec.ts`
- `src/modules/parent-app/lessons/tests/parent-child-lessons.use-case.spec.ts`
- `test/e2e/teacher-app-lesson-preparation.e2e-spec.ts`
- `test/e2e/student-app-lessons.e2e-spec.ts`
- `test/e2e/parent-app-child-lessons.e2e-spec.ts`
- `test/security/tenancy.teacher-app-lesson-preparation.spec.ts`
- `test/security/tenancy.student-app-lessons.spec.ts`
- `test/security/tenancy.parent-app-child-lessons.spec.ts`
- `test/e2e/teacher-app-final-closeout.e2e-spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/e2e/parent-app-final-closeout.e2e-spec.ts`

## Findings

### Critical Blockers

None.

### Security Blockers

None.

### Contract Blockers

None.

### Non-blocking Observations

- Teacher App lesson preparation intentionally returns teacher-facing `notes`; Student and Parent lesson content do not select or return notes.
- Teacher App content responses include `LessonContentItem.metadata` for teacher-owned preparation context. Student and Parent responses omit content metadata. No file storage internals or signed URLs are exposed.
- Student and Parent lesson visibility is based on active lesson-plan content in the requested today/week window, not timetable publication. This matches the 22H/22I conservative V1 decision and avoids adding schema/product flags.

## Known Non-Goals

- No signed URLs or file download endpoints.
- No direct object-storage URLs.
- No lesson completion tracking for Student App.
- No Parent/Student status mutation.
- No `PREPARED` status or enum change.
- No new dashboard permissions.
- No schema or migration changes.
- No app home composition changes.
- No dashboard lesson-plan workflow changes.
- No timetable publication gate for app-facing lesson content.

## Final Acceptance Decision

Sprint 22J Result: PASS.

The app-facing lesson content / lesson preparation feature chain is complete for V1 scope:

- Teacher App can read owned lesson-preparation items for today/week/detail and update allowed statuses with teacher-facing notes.
- Student App can read current-enrollment lesson content for today/week/detail without teacher notes or unsafe file/storage fields.
- Parent App can read linked-child lesson content for today/week/detail without teacher notes or unsafe file/storage fields.
- App-facing routes use user-type and ownership boundaries, not dashboard permissions.
- Cross-school, other-teacher, other-classroom, unlinked-child, archived, deleted, and closed-term mutation cases are covered by tests.
- No runtime/schema/migration/package/generated/deployment/project-structure changes are needed in this closeout sprint.
