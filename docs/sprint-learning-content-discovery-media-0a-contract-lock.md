# Learning Content Discovery and Media 0A — Reality, Security, Product and Architecture Contract Lock

## 1. Decision and scope

- **Phase:** `LEARNING-CONTENT-DISCOVERY-AND-MEDIA-0A`
- **Mode:** READ-ONLY REALITY / SECURITY / PRODUCT CONTRACT LOCK
- **Baseline:** `136564fa9dea10f16b5364b4c8b8feadd983a066`
- **Branch:** `feat/learning-content-discovery-media-0a-contract-lock`
- **Result represented by this document:** COMPLETE — CONTRACT LOCKED; no runtime behavior is implemented here.

This is the authoritative contract for the future subject-scoped lesson discovery, lesson-content publication, direct learning-media upload, and relation-scoped secure playback program. It authorizes no runtime phase by itself. Phase 0B remains the next runtime phase and requires independent review and merge before phase 1A or any upload/playback work begins.

This phase changes only this document. It changes no controller, use case, presenter, schema, migration, seed, permission, role, database record, storage object, test, dependency, deployment file, or generated file.

### Evidence labels

- **CURRENT REALITY** — independently verified in the baseline implementation.
- **CONFIRMED SECURITY GAP** — an exploitable authorization weakness in the current contract.
- **LOCKED FUTURE CONTRACT** — mandatory behavior for a named future phase.
- **REJECTED ALTERNATIVE** — evaluated and prohibited for this program.
- **FUTURE TEST REQUIREMENT** — executable acceptance evidence required before merge.
- **DEFERRED DECISION** — allowed only for optional phase 1F and paired with an exact reopening trigger.

## 2. Preflight and source register

### Preflight evidence

| Check                    | Observed value                                                                                                                                                                           | Result |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Branch                   | `feat/learning-content-discovery-media-0a-contract-lock`                                                                                                                                 | PASS   |
| `HEAD`                   | `136564fa9dea10f16b5364b4c8b8feadd983a066`                                                                                                                                               | PASS   |
| `origin/main`            | `136564fa9dea10f16b5364b4c8b8feadd983a066`                                                                                                                                               | PASS   |
| Working tree before edit | clean                                                                                                                                                                                    | PASS   |
| Staged files before edit | 0                                                                                                                                                                                        | PASS   |
| Latest commit            | `136564fa Merge pull request #35 from Abdallah-Mohamed-Abdallah-AbdulRazzaq/feat/school-teacher-directory-1b-lifecycle-closeout` — `fix(teachers): complete lifecycle security closeout` | PASS   |

### Source-of-truth order used

1. Runtime code.
2. Prisma schema and active migrations.
3. Current tests.
4. Permission and system-role seeds.
5. Security, engineering, API, testing, error, Prisma, and migration rules.
6. Historical closeout documents.
7. Supplied feature reports.

The required project reading was completed in repository order. `DIRECTORY_STRUCTURE.md` does not exist at this baseline; `DIRECTORY_STRUCTURE_VISUAL.md` is the present repository equivalent and was used. All numbered ADRs were read in order.

The two user-supplied feature reports were available as conversation inputs, not repository files. They were treated as secondary product-analysis inputs and independently verified against runtime code. They are not repository artifacts.

The implementation inventory included the required app access, subject, lesson, message, curriculum, lesson-content, lesson-plan, allocation, file, communication, homework, guard/context/decorator, storage, schema, seed, migration, E2E, security, and relevant historical closeout areas. The request names `src/modules/academics/lesson-content/**`; at this baseline lesson content is implemented inside `src/modules/academics/curriculum/**`, not in a standalone module. Runtime location wins.

### Historical conflict resolved

Some older closeout documents state that app-facing lesson routes did not use `@RequiredPermissions`. Current controllers do use permission metadata. Current runtime and current tests are authoritative; the historical statement is obsolete.

## 3. Current security and tenancy foundation

### CURRENT REALITY — global enforcement

`AppModule` registers global guards in this order:

1. `JwtAuthGuard`
2. `ScopeResolverGuard`
3. `OrganizationScopeGuard`
4. `PermissionsGuard`

The scope resolver establishes the actor and the first active membership returned by the auth repository. Platform actors may be membershipless. App access services add actor-specific ownership proof; a permission alone never establishes Student, Parent, or Teacher ownership.

`@SchoolManagementOnly()` is enforced by `PermissionsGuard`. It admits only `ORGANIZATION_USER` and `SCHOOL_USER`; all other actor classes, including platform users and Student/Parent/Teacher app actors, receive the existing `auth.scope.missing` 403 contract before a resource lookup. An organization user still needs a selected active membership with `schoolId` for `requireAcademicsScope()` or `requireFilesScope()`.

The Prisma school-scope extension injects the active `schoolId` into school-scoped model access. It also injects `deletedAt: null` only for registered soft-delete models. `TeacherSubjectAllocation` has neither a lifecycle status nor a `deletedAt` field, so “active allocation” is not a current data concept.

### Permission recipients at the baseline

| Permission family                          | Seeded actor recipients relevant here                                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `academics.subjects.view`                  | School/organization management system roles; Student; Parent; any scoped custom role granted it; platform roles possess broad permission data but app/management actor gates still apply |
| `academics.lesson_plans.view`              | School/organization management system roles; Teacher; Student; Parent; scoped custom roles granted it; platform actor still fails app/management actor gates                             |
| `academics.curriculum.view`                | School/organization management system roles; Teacher; Parent; scoped custom roles granted it; Student is not seeded this permission                                                      |
| `academics.curriculum.manage`              | School/organization management system roles and scoped custom roles granted it; no Teacher/Student/Parent app authorization because dashboard controllers are school-management-only     |
| `teacher.lesson_preparation.view`          | Teacher plus management/custom roles where seeded/granted, but Teacher App access still requires a current Teacher actor and owned allocation                                            |
| `teacher.lesson_preparation.status.manage` | Teacher plus management/custom roles where seeded/granted, with the same Teacher ownership gate                                                                                          |
| `files.uploads.manage`                     | School/organization management system roles, Teacher, Student, and scoped custom roles granted it; Parent is not seeded it                                                               |
| `files.downloads.view`                     | School/organization management system roles, Student, and scoped custom roles granted it; Teacher and Parent are not seeded it                                                           |
| `communication.messages.view`              | Teacher and Parent app roles, among others; relation-scoped message attachment routes use this permission rather than generic file download permission                                   |

## 4. Exact current route inventory

All paths below include the framework-level `/api/v1` prefix. “Scoped Prisma” means the active membership school is injected and relevant soft-deleted records are hidden. The app presenters exclude tenant IDs, ownership IDs, storage keys/buckets, credentials, raw Prisma data, and signed URLs unless a route explicitly signs after relation authorization.

### Student Subjects

| Route                                     | Controller / use case                                      | Permission                | Ownership, Prisma, not-found, presenter                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/student/subjects`            | `StudentSubjectsController` / `ListStudentSubjectsUseCase` | `academics.subjects.view` | `StudentAppAccessService` proves current Student, active linked Student record, active enrollment, school/classroom/year/term. `StudentSubjectsReadAdapter` reads scoped `TeacherSubjectAllocation` with active/non-deleted Subject. `student-subjects.presenter` deduplicates cards by Subject and leaks no allocation/tenant/storage internals. |
| `GET /api/v1/student/subjects/:subjectId` | `StudentSubjectsController` / `GetStudentSubjectUseCase`   | `academics.subjects.view` | Same app access. Adapter selects the first matching allocation by current ordering; a missing/ineligible Subject becomes current generic domain 404. Presenter returns summary, grade statistics, and intentional empty placeholders; no curriculum/content query or storage data.                                                                |

### Student Lessons

| Route                                               | Controller / use case                                        | Permission                    | Ownership, Prisma, not-found, presenter                                                                                                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/student/lessons/today?date=YYYY-MM-DD` | `StudentLessonsController` / `GetStudentLessonsTodayUseCase` | `academics.lesson_plans.view` | Current Student plus active enrollment; `StudentLessonsReadAdapter` applies the complete visibility predicate in section 6. Date is one day. Presenter is app-safe and excludes Teacher notes, raw metadata, tenant/storage fields, and signed URLs.                  |
| `GET /api/v1/student/lessons/week?date=YYYY-MM-DD`  | `StudentLessonsController` / `GetStudentLessonsWeekUseCase`  | `academics.lesson_plans.view` | Same proof and visibility predicate over the computed week. Same presenter boundary.                                                                                                                                                                                  |
| `GET /api/v1/student/lessons/:lessonPlanItemId`     | `StudentLessonsController` / `GetStudentLessonDetailUseCase` | `academics.lesson_plans.view` | Same proof, exact item predicate, and safe `student_app.lessons.not_found` 404 with no foreign identifier disclosure. Student presenter may return safe content text/link/file metadata but no signed URL, storage internals, raw content metadata, or Teacher notes. |

### Parent Lessons

| Route                                                              | Controller / use case                                                | Permission                                                                             | Ownership, Prisma, not-found, presenter                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/parent/children/:studentId/lessons/today`             | `ParentChildLessonsController` / `GetParentChildLessonsTodayUseCase` | `academics.lesson_plans.view`, `academics.curriculum.view`                             | `ParentAppAccessService.getAccessibleChild()` proves current Parent, active school membership, active Guardian relation, exact linked Student, and active enrollment. Reads current school/year/term/classroom active plan/curriculum. Presenter excludes Teacher notes, raw metadata, tenant/storage fields, and signed URLs. |
| `GET /api/v1/parent/children/:studentId/lessons/week`              | `ParentChildLessonsController` / `GetParentChildLessonsWeekUseCase`  | `academics.lesson_plans.view`, `academics.curriculum.view`, `academics.timetable.view` | Same linked-child proof and visibility boundary over a week. Same presenter protection.                                                                                                                                                                                                                                        |
| `GET /api/v1/parent/children/:studentId/lessons/:lessonPlanItemId` | `ParentChildLessonsController` / `GetParentChildLessonDetailUseCase` | `academics.lesson_plans.view`, `academics.curriculum.view`                             | Exact linked-child item relation. Hidden/missing/unlinked/cross-school states collapse to `parent_app.lessons.not_found` 404. Safe content metadata only.                                                                                                                                                                      |

### Teacher Lesson Preparation

| Route                                                               | Controller / use case                                                            | Permission                                                       | Ownership, Prisma, not-found, presenter                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/teacher/lesson-preparation/today`                      | `TeacherLessonPreparationController` / `GetTeacherLessonPreparationTodayUseCase` | `teacher.lesson_preparation.view`, `academics.lesson_plans.view` | Current Teacher actor and membership; owned allocation IDs are resolved by exact `teacherUserId`. Adapter requires plan teacher/allocation ownership plus current school and non-archived/non-deleted relations. Teacher presenter may expose preparation notes and content metadata, never storage internals/signed URLs. |
| `GET /api/v1/teacher/lesson-preparation/week`                       | Same controller / `GetTeacherLessonPreparationWeekUseCase`                       | Same two permissions                                             | Same owned-allocation proof over week.                                                                                                                                                                                                                                                                                     |
| `GET /api/v1/teacher/lesson-preparation/:lessonPlanItemId`          | Same controller / `GetTeacherLessonPreparationDetailUseCase`                     | Prior two plus `academics.curriculum.view`                       | Exact owned item and exact allocation relation. Use case may load archived data internally but hides archived/deleted detail. Teacher-safe presenter.                                                                                                                                                                      |
| `PATCH /api/v1/teacher/lesson-preparation/:lessonPlanItemId/status` | Same controller / `UpdateTeacherLessonPreparationStatusUseCase`                  | `teacher.lesson_preparation.status.manage`                       | Exact owned item/allocation, active term, non-archived plan; expected status transition rules. Safe Teacher presenter and audited mutation.                                                                                                                                                                                |

### Generic Files

| Route                            | Controller / use case                             | Permission             | Ownership, Prisma, not-found, presenter                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/v1/files`             | `UploadsController` / `UploadFileUseCase`         | `files.uploads.manage` | `requireFilesScope()` requires actor plus current school membership. Multipart bytes are buffered by Nest; use case enforces 10 MiB. Server generates object key, writes private object, then persists scoped `File`; it removes the object if metadata persistence fails. `file-record.presenter` excludes bucket/object key. |
| `GET /api/v1/files/:id/download` | `UploadsController` / `GetFileDownloadUrlUseCase` | `files.downloads.view` | `requireFilesScope()` and `FilesRepository.findScopedFileById()` prove only current school and non-deleted File. No uploader or domain relation is required. A 300-second attachment signed URL is returned via HTTP 307. Current not-found details include the requested File ID; future hardening removes that detail.       |

### Dashboard Curriculum, Units, Lessons, and Content

Every route is on `CurriculumController`, is `@SchoolManagementOnly()`, uses `requireAcademicsScope()` through its application/repository path, hides cross-school and soft-deleted nested resources as domain not-found, and responds through `curriculum.presenter` or `lesson-content.presenter`. View routes require `academics.curriculum.view`; mutation routes require `academics.curriculum.manage`. Presenters do not expose tenant/storage internals or raw Prisma records.

| Route                                                                                                             | Use case                         | Permission |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------- |
| `GET /api/v1/academics/curriculum`                                                                                | `ListCurriculaUseCase`           | view       |
| `POST /api/v1/academics/curriculum`                                                                               | `CreateCurriculumUseCase`        | manage     |
| `GET /api/v1/academics/curriculum/:curriculumId`                                                                  | `GetCurriculumUseCase`           | view       |
| `PATCH /api/v1/academics/curriculum/:curriculumId`                                                                | `UpdateCurriculumUseCase`        | manage     |
| `POST /api/v1/academics/curriculum/:curriculumId/activate`                                                        | `ActivateCurriculumUseCase`      | manage     |
| `POST /api/v1/academics/curriculum/:curriculumId/archive`                                                         | `ArchiveCurriculumUseCase`       | manage     |
| `DELETE /api/v1/academics/curriculum/:curriculumId`                                                               | `DeleteCurriculumUseCase`        | manage     |
| `POST /api/v1/academics/curriculum/:curriculumId/units`                                                           | `CreateCurriculumUnitUseCase`    | manage     |
| `PATCH /api/v1/academics/curriculum/:curriculumId/units/:unitId`                                                  | `UpdateCurriculumUnitUseCase`    | manage     |
| `PATCH /api/v1/academics/curriculum/:curriculumId/units/:unitId/reorder`                                          | `ReorderCurriculumUnitUseCase`   | manage     |
| `DELETE /api/v1/academics/curriculum/:curriculumId/units/:unitId`                                                 | `DeleteCurriculumUnitUseCase`    | manage     |
| `POST /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons`                                           | `CreateCurriculumLessonUseCase`  | manage     |
| `PATCH /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId`                                | `UpdateCurriculumLessonUseCase`  | manage     |
| `PATCH /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/reorder`                        | `ReorderCurriculumLessonUseCase` | manage     |
| `DELETE /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId`                               | `DeleteCurriculumLessonUseCase`  | manage     |
| `GET /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content`                          | `ListLessonContentUseCase`       | view       |
| `POST /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content`                         | `CreateLessonContentUseCase`     | manage     |
| `GET /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId`           | `GetLessonContentUseCase`        | view       |
| `PATCH /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId`         | `UpdateLessonContentUseCase`     | manage     |
| `PATCH /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId/reorder` | `ReorderLessonContentUseCase`    | manage     |
| `DELETE /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId`        | `DeleteLessonContentUseCase`     | manage     |

Nested repository lookups require the exact curriculum → unit → lesson → content relation. A FILE content create currently validates that the File can be found through the scoped Files repository, but does not prove a learning-content purpose, trusted MIME, processing status, or upload readiness.

### Dashboard Lesson Plans

Every route is on `LessonPlansController`, is `@SchoolManagementOnly()`, uses scoped repositories, hides cross-school/deleted nested resources through lesson-plan domain errors, and responds through `lesson-plans.presenter`. “view” is `academics.lesson_plans.view`; “manage” is `academics.lesson_plans.manage`.

| Route                                                            | Use case                        | Permission |
| ---------------------------------------------------------------- | ------------------------------- | ---------- |
| `GET /api/v1/academics/lesson-plans`                             | `ListLessonPlansUseCase`        | view       |
| `POST /api/v1/academics/lesson-plans`                            | `CreateLessonPlanUseCase`       | manage     |
| `GET /api/v1/academics/lesson-plans/weeks`                       | `ListLessonPlanWeeksUseCase`    | view       |
| `GET /api/v1/academics/lesson-plans/summary`                     | `GetLessonPlanSummaryUseCase`   | view       |
| `POST /api/v1/academics/lesson-plans/auto-plan`                  | `AutoPlanLessonPlanUseCase`     | manage     |
| `PATCH /api/v1/academics/lesson-plans/items/:itemId/move`        | `MoveLessonPlanItemUseCase`     | manage     |
| `GET /api/v1/academics/lesson-plans/validation`                  | `ValidateLessonPlansUseCase`    | view       |
| `GET /api/v1/academics/lesson-plans/:lessonPlanId`               | `GetLessonPlanUseCase`          | view       |
| `PATCH /api/v1/academics/lesson-plans/:lessonPlanId`             | `UpdateLessonPlanUseCase`       | manage     |
| `POST /api/v1/academics/lesson-plans/:id/activate`               | `ActivateLessonPlanUseCase`     | manage     |
| `POST /api/v1/academics/lesson-plans/:id/archive`                | `ArchiveLessonPlanUseCase`      | manage     |
| `DELETE /api/v1/academics/lesson-plans/:id`                      | `DeleteLessonPlanUseCase`       | manage     |
| `POST /api/v1/academics/lesson-plans/:id/items`                  | `CreateLessonPlanItemUseCase`   | manage     |
| `PATCH /api/v1/academics/lesson-plans/:id/items/:itemId`         | `UpdateLessonPlanItemUseCase`   | manage     |
| `PATCH /api/v1/academics/lesson-plans/:id/items/:itemId/reorder` | `ReorderLessonPlanItemUseCase`  | manage     |
| `POST /api/v1/academics/lesson-plans/:id/items/:itemId/start`    | `StartLessonPlanItemUseCase`    | manage     |
| `POST /api/v1/academics/lesson-plans/:id/items/:itemId/complete` | `CompleteLessonPlanItemUseCase` | manage     |
| `POST /api/v1/academics/lesson-plans/:id/items/:itemId/skip`     | `SkipLessonPlanItemUseCase`     | manage     |
| `POST /api/v1/academics/lesson-plans/:id/items/:itemId/cancel`   | `CancelLessonPlanItemUseCase`   | manage     |
| `DELETE /api/v1/academics/lesson-plans/:id/items/:itemId`        | `DeleteLessonPlanItemUseCase`   | manage     |

Creation resolves and cross-validates academic year, term, exact teacher allocation, classroom, Subject, Curriculum, grade, and date range. These are creation-time invariants; section 6 separately states what Student reads revalidate.

## 5. Student Subject current reality

### CURRENT REALITY — summary, not discovery

`GET /student/subjects/:subjectId` is a summary endpoint. Its adapter queries `TeacherSubjectAllocation` and Subject data; it does **not** query `Curriculum`, `LessonPlan`, or `LessonContentItem`. Its presenter intentionally returns `lessons: []`, `assignments: []`, and `attachments: []` with unsupported/zero-count summary semantics. Those placeholders do not prove absence of curriculum content.

Current summary-route eligibility is the conjunction of:

- authenticated current Student actor;
- active User and linked Student record;
- active enrollment in the current school;
- enrollment classroom, academic year, and term;
- active, non-deleted Subject;
- at least one `TeacherSubjectAllocation` for that exact classroom and term.

### LOCKED FUTURE CONTRACT — co-teaching

Subject lesson discovery first proves an active, non-deleted current-school Subject and then requires either (a) a matching `TeacherSubjectAllocation` for the exact enrollment classroom and term or (b) at least one currently visible ACTIVE LessonPlan for the exact Subject, classroom, academic year, and term. A valid current allocation makes the Subject eligible even when the result has no lessons. A visible active LessonPlan preserves eligibility after its originating allocation becomes unavailable; that branch requires no current Teacher allocation.

The discovery query never selects one teacher allocation and never returns `teacherSubjectAllocationId`. It lists all eligible active plans, including valid plans created by multiple co-teachers. Ordering is content ordering, not allocation creation ordering.

## 6. Student Lesson visibility and stale allocations

### CURRENT REALITY — read-time predicate

`StudentLessonsReadAdapter` revalidates all of the following on every list/detail read:

- current Student and active enrollment context;
- item current `schoolId` and `deletedAt IS NULL`;
- parent LessonPlan current school, exact enrollment academic year, exact term, exact classroom, `status = ACTIVE`, `deletedAt IS NULL`;
- LessonPlan term current school, exact academic year, and non-deleted; `Term.isActive` is not required for reads;
- LessonPlan Subject current school, active, and non-deleted;
- plan classroom, section, grade, and stage current school and non-deleted;
- LessonPlan Curriculum current school, exact academic year/term, `status = ACTIVE`, and non-deleted;
- item Curriculum with the same exact school/year/term, `ACTIVE`, and non-deleted requirements;
- item unit and lesson current school and non-deleted;
- date window for today/week lists; exact item ID for detail.

The adapter does not query, join, or revalidate `TeacherSubjectAllocation` at read time.

### Creation-time versus read-time distinction

Lesson-plan creation proves a then-valid allocation and validates its teacher, classroom, Subject, term/year, Curriculum, grade, and date relationships. It denormalizes `teacherUserId`, `classroomId`, and `subjectId` onto the plan. Activation requires a DRAFT plan with at least one item, but not lesson content. Read-time Student visibility uses the denormalized academic/content relationships above, not present-day allocation ownership.

### LOCKED FUTURE CONTRACT — stale Teacher allocation

A validly created and activated LessonPlan remains historical academic content when the originating teacher allocation later becomes transferred, deleted by an allowed workflow, or otherwise non-operational. For Subject eligibility, that currently visible ACTIVE plan satisfies the second eligibility branch without a current Teacher allocation. Lesson listing and playback must not add a present-day allocation predicate. Current Student school, enrollment classroom, academic year, term, Subject, Curriculum, active plan, item, unit, lesson, publication, and media predicates remain mandatory.

This behavior is also structurally consistent with the current schema: `TeacherSubjectAllocation` has no active/deleted status, and dependent plans restrict destructive allocation deletion. A future allocation lifecycle must not silently change this read contract.

## 7. Subject-scoped lesson discovery

### LOCKED FUTURE CONTRACT

| Decision       | Locked value                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Route          | `GET /api/v1/student/subjects/:subjectId/lessons`                                                                                                                                                                  |
| Controller     | new `StudentSubjectLessonsController` under `src/modules/student-app/subjects/controller`                                                                                                                          |
| Module         | existing `StudentAppModule`                                                                                                                                                                                        |
| Use case       | new `ListStudentSubjectLessonsUseCase` in the Student App composition/read-model layer                                                                                                                             |
| Adapter owner  | new `StudentSubjectLessonsReadAdapter` under `student-app/subjects/infrastructure`; core Academics remains source of truth                                                                                         |
| Permissions    | both `academics.subjects.view` and `academics.lesson_plans.view`                                                                                                                                                   |
| Actor          | current Student only, through existing Student access service                                                                                                                                                      |
| Subject proof  | active/non-deleted current-school Subject, plus either a matching allocation for the exact enrollment classroom/term or at least one currently visible ACTIVE LessonPlan for the exact Subject/classroom/year/term |
| Lesson proof   | section 6 read predicates; all active plans for Subject/classroom/year/term; no current teacher-allocation predicate                                                                                               |
| Term           | resolved only from active enrollment context; exact academic-year match and non-deleted term; historical/closed term remains readable; request cannot choose a term                                                |
| Date filters   | optional inclusive `from` and `to`, both `YYYY-MM-DD`; absent defaults to term start/end; supplied values must be inside the term and `from <= to`, otherwise validation 400                                       |
| Pagination     | opaque cursor, default 20, maximum 50                                                                                                                                                                              |
| Status filter  | optional single lowercase current LessonPlanItem status; absent means all statuses                                                                                                                                 |
| Ordering       | `plannedDate ASC`, timetable period index `ASC NULLS LAST`, item `sortOrder ASC`, item `id ASC`; exclude items with null `plannedDate`                                                                             |
| Empty state    | the allocation branch may establish eligibility without a plan; any eligible Subject with no matching items returns 200 and empty `items`, `nextCursor: null`, `hasNextPage: false`                                |
| Hidden Subject | foreign, inactive, deleted, other-classroom, wrong-term, or other-school Subject all return `learning.subject_lessons.not_found` 404 with no details                                                               |

The base64url cursor contains a version and the bound query identity: Subject ID, term ID, normalized from/to, planned date, nullable period index, sort order, and item ID. Malformed cursors and cursors whose Subject/term/date filters do not match the request return validation 400. Under a stable snapshot, retrying the same cursor returns the same page and the tuple prevents duplicates/skips. Concurrent data changes are eventually consistent; snapshot isolation across separate HTTP requests is not promised.

The endpoint returns only:

```json
{
  "items": [
    {
      "lessonPlanItemId": "uuid",
      "plannedDate": "YYYY-MM-DD",
      "status": "planned",
      "title": "Lesson title",
      "unit": { "id": "uuid", "title": "Unit title", "sortOrder": 0 },
      "lesson": { "id": "uuid", "title": "Lesson title", "sortOrder": 0 },
      "period": { "id": null, "label": null },
      "contentSummary": {
        "totalCount": 0,
        "requiredCount": 0,
        "videoCount": 0,
        "fileCount": 0,
        "hasPlayableVideo": false
      }
    }
  ],
  "pageInfo": { "nextCursor": null, "hasNextPage": false }
}
```

`contentSummary` counts only content eligible for the requesting app. In phase 1A, before publication/readiness exists, `hasPlayableVideo` is always false. After phase 1B, counts include PUBLISHED content only. After phase 1C, `hasPlayableVideo` is true only for a non-deleted FILE whose READY learning upload has trusted video MIME and no cleanup claim. `videoCount` includes playable FILE video and published `VIDEO_LINK`; `fileCount` includes published FILE items; `requiredCount` follows the existing content `isRequired` flag. The route never returns body text, URLs, signed URLs, storage/raw metadata, teacher notes, audits, actor IDs, tenant IDs, or allocation IDs.

## 8. Generic file-download boundary

### CONFIRMED SECURITY GAP

The Student role receives `files.downloads.view`. The generic GET checks that permission; `requireFilesScope()` proves only a school membership; `findScopedFileById()` proves only current school and `deletedAt IS NULL`; no uploader, message, homework, child, lesson, or other domain relation is required. A Student who learns another current-school File UUID can obtain its signed URL. This is a same-school object-authorization/IDOR gap.

### LOCKED FUTURE CONTRACT — phase 0B

`GET /api/v1/files/:id/download` keeps `@RequiredPermissions('files.downloads.view')` and adds `@SchoolManagementOnly()`. It becomes a school/organization management utility. Student, Parent, Teacher, Applicant, and other app actors are rejected at the actor gate before File lookup. School/organization management actors still require a selected school membership and permission. Platform users are rejected by the same management actor gate.

The Student role retains `files.downloads.view` because Student relation-scoped communication attachment download uses it. Teacher and Parent relation-scoped message attachments use `communication.messages.view` and already prove conversation/message/attachment/File relations; neither has a current role-seed gap for those routes. Parent child task/proof download uses its dedicated linked-child proof and `reinforcement.submissions.view`; Teacher/Parent do not need generic `files.downloads.view` for their current relation routes.

Wrong actor or insufficient permission returns existing `auth.scope.missing` 403 without the attempted ID. A management actor looking up a missing/deleted/cross-school File receives `files.not_found` 404 with no details. No seed or permission change is part of 0B.

## 9. Content type and publication lifecycle

### CURRENT REALITY

`LessonContentItemType` is `TEXT | FILE | VIDEO_LINK | EXTERNAL_LINK`. `LessonContentItem` has no publication state. ACTIVE Curriculum is mutable because mutation guards reject only ARCHIVED Curriculum. Adding non-deleted content to ACTIVE Curriculum can therefore become Student/Parent visible immediately. Curriculum activation requires at least one non-deleted unit and lesson, not a content item. LessonPlan activation requires at least one plan item, not lesson content.

### LOCKED FUTURE CONTRACT — FILE plus derived media kind

Do not add `VIDEO_FILE`. A FILE has derived `mediaKind = video | audio | image | document | other` from server-verified normalized MIME. A `VIDEO_FILE` enum would duplicate MIME semantics and create pressure for `AUDIO_FILE`, `IMAGE_FILE`, and `DOCUMENT_FILE`, splitting one storage relation across product enums.

| Verified MIME     | `mediaKind` | New learning-content acceptance                                                             |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `application/pdf` | document    | allowed                                                                                     |
| `text/plain`      | document    | allowed                                                                                     |
| `image/jpeg`      | image       | allowed                                                                                     |
| `image/png`       | image       | allowed                                                                                     |
| `audio/mpeg`      | audio       | allowed                                                                                     |
| `audio/mp4`       | audio       | allowed                                                                                     |
| `audio/webm`      | audio       | allowed                                                                                     |
| `video/mp4`       | video       | allowed                                                                                     |
| `video/webm`      | video       | allowed                                                                                     |
| any other type    | other       | rejected for new learning content; classification exists only for legacy/read compatibility |

A FILE content create must prove: exact non-deleted File; exact school and organization; a READY `FileUploadSession` with `cleanupClaimedAt IS NULL` and purpose `LESSON_CONTENT`; matching actor-issued ownership chain; allowed verified MIME; actual size/checksum verification complete; and video processing/probe checks complete. Same-school scope alone is insufficient. An unclaimed READY asset may be attached to multiple non-deleted content items in the same school; this reuses one File and is not a duplicate.

### LOCKED FUTURE CONTRACT — independent publication

Add `LessonContentPublicationStatus = DRAFT | PUBLISHED | ARCHIVED` and these `LessonContentItem` fields:

- `publicationStatus`, required, database default `DRAFT`;
- `publishedAt`, nullable;
- `publishedByUserId`, nullable FK to User;
- `archivedAt`, nullable;
- `archivedByUserId`, nullable FK to User.

The database default is authoritative for every insert path; application code also writes `DRAFT` explicitly for clarity. State and mutation rules:

| State     | Required/null fields                                                                                                                                                  | Visibility, mutations, and transitions                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DRAFT     | all publication/archive actor/time fields null                                                                                                                        | Dashboard management and exact owned Teacher preparation preview. Content field update, type-valid `bodyText`/`url`/`fileId` replacement, reorder, soft delete, and publish are allowed. Archive is rejected. |
| PUBLISHED | `publishedAt` and `publishedByUserId` non-null; archive fields null                                                                                                   | Student/Parent and exact Teacher reads. Content field update, body/link/File replacement, reorder, and soft delete are rejected. Unpublish to DRAFT and archive are allowed.                                  |
| ARCHIVED  | `archivedAt` non-null; `archivedByUserId` required for runtime actions but nullable for migration/system history; published pair is either both null or both non-null | Dashboard history only. Update, reorder, delete, publish, and unpublish are rejected. The state is terminal and immutable with no app visibility.                                                             |

`DRAFT -> ARCHIVED` is rejected. Archive after publication retains the published pair and adds the archive pair. Existing soft-deleted historical content may be ARCHIVED with a null archive actor. A changed published item must follow `PUBLISHED -> DRAFT -> update/reorder -> PUBLISHED`; no changed content becomes app-visible without a new publish transition.

The existing nested `PATCH .../content/:contentItemId`, `PATCH .../content/:contentItemId/reorder`, and `DELETE .../content/:contentItemId` routes become DRAFT-only in phase 1B. A PUBLISHED or ARCHIVED mutation uses an expected-state predicate, affects zero rows, and returns `learning.content.publication_conflict`/409 without deleting or modifying the row. Static database CHECK constraints enforce valid state/timestamp/actor combinations; application/repository conditional updates and affected-row checks enforce transition and mutation immutability because a CHECK constraint cannot compare the old row to the new row.

Migration compatibility is exact:

- existing non-deleted content → PUBLISHED, `publishedAt = createdAt`, `publishedByUserId = createdByUserId`;
- existing deleted content → ARCHIVED, `archivedAt = deletedAt` (migration timestamp only if legacy data violates that expectation), `archivedByUserId = NULL`; it never becomes live;
- new content → DRAFT.

Student and Parent see PUBLISHED only. Teacher may see PUBLISHED and may preview DRAFT only through an exact owned LessonPlanItem whose lesson exactly matches the content; Teacher never sees ARCHIVED. Dashboard view/manage permissions can list all three states.

Future nested actions on `CurriculumController` are:

- `POST .../content/:contentItemId/publish`
- `POST .../content/:contentItemId/unpublish`
- `POST .../content/:contentItemId/archive`

All three are `@SchoolManagementOnly()` and require `academics.curriculum.manage`; no new permission is added. They use expected-state predicates and return the existing safe content presenter extended with publication fields appropriate to management.

## 10. Direct upload architecture and persistence

### CURRENT REALITY

Generic multipart upload passes through Nest and is materialized as a Buffer. `FileInterceptor` limits file count to one but has no `fileSize` limit. `UploadFileUseCase` enforces 10 MiB and currently accepts, among other MIME types, `video/mp4` and `video/webm`. It trusts browser MIME as its type signal, writes the private object first, persists File metadata second, and attempts object cleanup when persistence fails. There is no upload intent, trusted signature/probe, readiness state, or direct-upload path.

Increasing the generic Buffer limit for learning videos is prohibited.

### Persistence alternatives

| Option                                             | Decision               | Project-specific reasoning                                                                                                                                                                             |
| -------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A — add lifecycle fields to `File`                 | REJECTED ALTERNATIVE   | A `File` is already discoverable finalized metadata used by many modules. Representing incomplete/untrusted objects as File would weaken every consumer and overload File purpose/readiness semantics. |
| B — `LearningMediaUpload`/asset model in Academics | REJECTED ALTERNATIVE   | It duplicates shared Files/storage lifecycle and prevents reuse by future non-Academics direct uploads. Academics should own content relations, not generic object finalization.                       |
| C — generic `FileUploadSession` in Files           | LOCKED FUTURE CONTRACT | Files owns bucket/key generation, verification, final File creation, retries, and cleanup. Academics supplies the scoped purpose and attaches the finalized File later.                                |

### Selected model

Add enums:

```text
FileUploadPurpose: LESSON_CONTENT
FileUploadSessionStatus: CREATED UPLOADING VERIFYING READY LEGACY FAILED CANCELLED EXPIRED PURGED
```

Release one exposes only `LESSON_CONTENT`; adding a later purpose requires its own domain authorization contract.

Add `FileUploadSession` with:

| Field                                            | Contract                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `id`                                             | server-generated UUID primary key                                                                           |
| `organizationId`, `schoolId`                     | required FKs, server scope only                                                                             |
| `createdByUserId`                                | required User FK from auth context                                                                          |
| `clientRequestId`                                | required client-generated UUID; participates in the scoped idempotency key                                  |
| `purpose`                                        | required enum                                                                                               |
| `originalName`                                   | required sanitized display name, maximum 255 Unicode characters; untrusted for media verification           |
| `expectedMimeType`                               | required normalized request claim; never authoritative                                                      |
| `expectedSizeBytes`                              | required positive BigInt                                                                                    |
| `bucket`, `objectKey`                            | server-generated, required; unique pair                                                                     |
| `status`                                         | required, default CREATED                                                                                   |
| `expiresAt`                                      | required; exactly 7,200 seconds after creation and never extended                                           |
| `completedAt`, `failedAt`, `cancelledAt`         | nullable lifecycle timestamps                                                                               |
| `cleanupEligibleAt`                              | nullable; set for terminal new-upload cleanup or to `completedAt + 7 days` for READY                        |
| `cleanupClaimedAt`                               | nullable conditional worker-claim timestamp                                                                 |
| `objectDeletedAt`                                | nullable; set only after storage-object deletion or confirmed absence                                       |
| `failureReasonCode`                              | nullable stable internal enum/string; never raw storage/probe output                                        |
| `verifiedMimeType`                               | nullable, set by server verification                                                                        |
| `actualSizeBytes`, `checksumSha256`              | nullable, set by verification                                                                               |
| `durationSeconds`, `widthPixels`, `heightPixels` | nullable verified media facts                                                                               |
| `verifiedAt`                                     | nullable                                                                                                    |
| `verificationVersion`                            | nullable; new verified uploads use the deployed verifier version, LEGACY backfills use `legacy_metadata_v1` |
| `fileId`                                         | nullable unique FK to finalized File                                                                        |
| `createdAt`, `updatedAt`                         | required timestamps                                                                                         |

There is no `deletedAt`. Sessions remain lifecycle history and are not automatically hard-deleted in V1. Cancellation uses `cancelledAt` and CANCELLED. `File` remains finalized-only and gains only the inverse session relation, not purpose/readiness columns.

State transitions are `CREATED -> UPLOADING -> VERIFYING -> READY | FAILED`, `CREATED | UPLOADING -> CANCELLED | EXPIRED`, `LEGACY -> VERIFYING -> READY | FAILED`, and cleanup-owned `READY -> PURGED`. FAILED, CANCELLED, and EXPIRED retain their status after cleanup; their `objectDeletedAt` provides cleanup evidence. PURGED is terminal, non-playable, non-attachable, and never restored. LEGACY requires an existing linked File and `verificationVersion = legacy_metadata_v1`, but no authoritative `verifiedAt`/probe facts. READY requires authoritative signature/stat/checksum/MIME and applicable ffprobe facts plus `verifiedAt` and the pinned verifier version.

### Create-intent input, filename, and idempotency

The create-intent DTO requires `clientRequestId` as a client-generated UUID and `originalName` as untrusted display metadata. It also carries the expected MIME and expected byte size; the endpoint fixes purpose to `LESSON_CONTENT`. The server normalizes the filename by treating both `\` and `/` as separators, taking only the final basename, removing every Unicode `Cc` control character, trimming surrounding Unicode whitespace, and then validating the result. Empty results are rejected. The maximum UTF-8-safe application length is 255 Unicode code points; overlength names are rejected rather than truncated, and validation never splits a UTF-8 sequence. The sanitized value is persisted at session creation.

The normalized idempotency payload is exactly purpose, sanitized `originalName`, normalized `expectedMimeType`, and `expectedSizeBytes`. A unique constraint on `(schoolId, createdByUserId, purpose, clientRequestId)` provides the claim:

- a new key creates one session, one server-generated object key, and one create audit;
- the same key with an identical normalized payload returns the existing safe session result;
- the same key with a different normalized payload returns `learning.media.upload_conflict`/409;
- concurrent identical creates converge on one row, bucket/object key, and create audit.

The client cannot supply bucket, object key, or final File ID. Original filename is never logged or audited and never influences trusted MIME, media kind, codec, size, checksum, or probe results. Complete does not accept or reread a filename: it creates the finalized File using only stored `FileUploadSession.originalName`.

### PUT TTL and renewal

Every presigned PUT is valid for exactly 3,600 seconds. Session `expiresAt` is fixed at creation plus 7,200 seconds. A same-payload retry with the same `clientRequestId` while the session is UPLOADING and unexpired may return a new 3,600-second PUT for the same session ID, bucket, and object key. Renewal creates no session, changes no expected metadata or object key, writes no additional create audit, and never extends `expiresAt`. Retry after session expiry returns `learning.media.upload_expired`. An identical retry in another non-expired state returns that state’s existing safe session result without creating a second intent.

### Direct flow and state machine

Upload application use cases depend on `StorageService`. Only `StorageService` and storage-infrastructure components call `MinioAdapter` directly; Academics and Files application use cases never inject the adapter.

1. Dashboard actor creates intent; server validates `clientRequestId`, sanitizes `originalName`, and validates purpose, expected MIME, exact byte bound, school, and permissions.
2. The idempotency claim creates one session with a 7,200-second fixed expiry and one server-selected bucket/object key/identity, or returns the existing matching session.
3. Server returns a 3,600-second presigned PUT contract for an unexpired uploadable session and moves a new CREATED session to UPLOADING before the successful response. Signing failure moves the new session to FAILED.
4. Browser uploads bytes directly to private object storage; Nest never buffers video.
5. Client calls complete.
6. A conditional UPLOADING → VERIFYING claim elects one verifier.
7. Server stats, identifies, probes, and checks the object.
8. One finalized File is persisted with the session’s stored sanitized `originalName`, linked by unique `fileId`/bucket-key constraints, and the session becomes READY with `cleanupEligibleAt = completedAt + 7 days`.
9. Failed/cancelled/expired objects become cleanup candidates. READY assets are attached to exact LessonContentItem later.

The client never chooses bucket, object key, school, organization, uploader, final File ID, purpose outside the endpoint contract, or processing state.

Completion is convergently idempotent: a repeat after READY returns the same safe completion result; a concurrent loser while VERIFYING receives `learning.media.upload_conflict` 409 with `retryable: true`; only the winner creates File metadata from the stored sanitized filename and writes one success audit. Complete cannot replace `originalName`. Complete after expiry is 410. Cancel can claim only CREATED/UPLOADING; VERIFYING, READY, LEGACY, and PURGED cannot be cancelled. Conditional updates plus affected-row checks resolve every race.

Existing Files referenced by LessonContentItem receive LEGACY sessions during phase 1C backfill, using their current school/organization/uploader, metadata, and `verificationVersion = legacy_metadata_v1`; no object is rewritten. LEGACY preserves existing metadata and content visibility, but it does not authorize playback and does not satisfy READY validation for a new FILE attachment. An explicit verification claim may transition `LEGACY -> VERIFYING -> READY | FAILED`. READY is granted only after authoritative server signature, object stat, streamed checksum, MIME normalization, and applicable probe verification.

## 11. Media verification contract

### LOCKED FUTURE CONTRACT

Client MIME and filename are untrusted. Object-store metadata is supporting evidence only. Server verification is authoritative.

Verification performs:

- object stat and exact actual-versus-declared size comparison;
- streamed SHA-256 calculation without loading the whole object into Nest memory;
- signature/magic-byte container identification and normalized MIME;
- `ffprobe` in a constrained subprocess for audio/video, with timeout, output-size limit, no network input, and stable failure mapping;
- duration and post-rotation dimensions checks;
- codec/container allowlist check;
- exact maximum byte, duration, and dimension checks;
- verified content-type persistence and signed-response override.

Release-one video is:

- `video/mp4` with H.264 video and AAC audio or no audio;
- `video/webm` with VP8/VP9 video and Opus/Vorbis audio or no audio.

The exact release-one maximum video size is **209,715,200 bytes (200 MiB)**. This bounds single-request recovery cost, verification I/O, private storage exposure, and mobile upload failure risk while using one direct presigned PUT. Uploads above 209,715,200 bytes are rejected before signing or finalization. The exact maximum duration remains **3,600 seconds**. Maximum effective dimensions after rotation are **1920 × 1080**. Oversized/duration/dimension violations fail verification and never create a File. A product need for larger or resumable upload reopens phase 1F for a separately locked multipart/resumable contract.

## 12. Signed URLs, Range, and playback

### CURRENT REALITY

`SignedUrlService` defaults its current signed GET to 900 seconds; this is not the future upload PUT TTL. Existing File and relation-scoped download callers explicitly use 300 seconds. Supplying `downloadFileName` adds attachment Content-Disposition. There is no explicit inline disposition input. Nest does not proxy video bytes; MinIO receives the signed GET. HLS, DASH, thumbnails, renditions, and transcoding do not exist. Repository tests do not prove HTTP Range behavior.

### LOCKED FUTURE CONTRACT — signing API

The signed GET input becomes explicit:

```ts
{
  disposition: 'attachment' | 'inline' | 'none';
  contentType?: string;
  expiresInSeconds: number;
}
```

Existing download callers pass `attachment` and preserve their filename behavior. Playback passes `inline`, the verified video MIME as response content type, and `expiresInSeconds: 300`. Playback response includes the calculated `expiresAt` and is renewable. Signed URLs are never persisted, audited, logged, placed in exception details, or cached past expiry.

### FUTURE TEST REQUIREMENT — Range entry gate

Phase 1D cannot expose playback until an integration test against the configured real MinIO uploads known bytes and issues `Range: bytes=0-1023` through the generated signed URL. It must observe 206, exact `Content-Range`, `Accept-Ranges: bytes`, the expected byte slice, verified content type, and inline disposition. The MinIO signed GET must use the response content-type override. Failure blocks route enablement.

Release one is direct object-storage MP4/WebM only. Phase 1F reopens only if at least one measured trigger occurs: p95 time-to-first-frame exceeds 3 seconds on the supported target mobile network; seek/Range success falls below 99%; the Range gate cannot pass in the deployment storage path; an approved requirement adds adaptive bitrate, offline playback, thumbnails, or a source format outside the release-one codec matrix; or product evidence requires uploads larger than 209,715,200 bytes or resumable/multipart recovery.

## 13. Relation-scoped playback routes

All app playback hidden states use `learning.content.playback_not_found` 404 with no details: nonexistent/foreign item, wrong actor/child/classroom/school/term, mismatched content relation, draft where forbidden, archived/deleted content, non-FILE, non-video, missing/deleted File, wrong-purpose session, cleanup-claimed session, LEGACY/PURGED or any other not-READY state, or unsupported MIME. Playback accepts unclaimed READY only. No route accepts `fileId`.

All successful responses are exactly:

```json
{
  "url": "short-lived signed URL",
  "expiresAt": "ISO-8601 timestamp",
  "mimeType": "video/mp4",
  "sizeBytes": "209715200",
  "disposition": "inline",
  "renewable": true
}
```

The response omits File/session IDs, bucket, object key, checksum, uploader, tenant IDs, processing internals, and credentials.

### Student

`GET /api/v1/student/lessons/:lessonPlanItemId/content/:contentItemId/playback`

- Permission: `academics.lesson_plans.view`; generic file permission is not required.
- Actor/ownership: authenticated Student, exact active Student membership/link, active enrollment, current school/classroom/year/term.
- Resource chain: section 6 visible active plan item → exact item lesson → exact PUBLISHED content whose `lessonId` matches → FILE → unclaimed READY `LESSON_CONTENT` session → verified video File, all current school/non-deleted.
- Stale teacher allocation: irrelevant after valid plan activation.

### Parent

`GET /api/v1/parent/children/:studentId/lessons/:lessonPlanItemId/content/:contentItemId/playback`

- Permissions: `academics.lesson_plans.view` and `academics.curriculum.view`, matching current detail.
- Actor/ownership: authenticated Parent with active membership; exact active Guardian-child relation; active child and enrollment.
- Resource chain: exact child-visible plan item and lesson → exact PUBLISHED video content → unclaimed READY same-school File/session.
- Generic file permission is not required.

### Teacher

`GET /api/v1/teacher/lesson-preparation/:lessonPlanItemId/content/:contentItemId/playback`

- Permissions: `teacher.lesson_preparation.view`, `academics.lesson_plans.view`, and `academics.curriculum.view`, matching current detail.
- Actor/ownership: current active Teacher and active membership; exact owned TeacherSubjectAllocation and plan item; exact same-school allocation/plan relationship.
- Resource chain: owned non-archived item → exact lesson → exact non-archived DRAFT or PUBLISHED content → FILE → unclaimed READY verified same-school video.
- DRAFT preview is allowed only through this exact Teacher preparation ownership chain. Student and Parent never see DRAFT. ARCHIVED is never previewable.

### Dashboard management/media routes

| Route                                                              | Gate and behavior                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/academics/learning-media/uploads`                    | `@SchoolManagementOnly`; both permissions; requires UUID `clientRequestId` and sanitizes/stores `originalName`; idempotently creates or returns one school/actor `LESSON_CONTENT` session; live UPLOADING retry may renew the 3,600-second PUT without extending the 7,200-second session |
| `POST /api/v1/academics/learning-media/uploads/:uploadId/complete` | same gates; exact issuing school/session; accepts no replacement filename; verifies and creates File from stored sanitized `originalName`                                                                                                                                                 |
| `POST /api/v1/academics/learning-media/uploads/:uploadId/cancel`   | same gates; exact issuing school/session; conditional cancellation                                                                                                                                                                                                                        |
| existing nested `POST .../lessons/:lessonId/content`               | `academics.curriculum.manage`; FILE create accepts only finalized `fileId` and revalidates READY purpose/school/MIME, `cleanupClaimedAt IS NULL`, and non-deleted File                                                                                                                    |
| existing nested `PATCH .../content/:contentItemId`                 | `academics.curriculum.manage`; DRAFT-only content/type-valid update; PUBLISHED/ARCHIVED conflict                                                                                                                                                                                          |
| existing nested `PATCH .../content/:contentItemId/reorder`         | `academics.curriculum.manage`; DRAFT-only reorder; PUBLISHED/ARCHIVED conflict                                                                                                                                                                                                            |
| existing nested `DELETE .../content/:contentItemId`                | `academics.curriculum.manage`; DRAFT-only soft delete; PUBLISHED/ARCHIVED conflict with no row mutation                                                                                                                                                                                   |
| `POST .../content/:contentItemId/publish`                          | `academics.curriculum.manage`; expected DRAFT state                                                                                                                                                                                                                                       |
| `POST .../content/:contentItemId/unpublish`                        | `academics.curriculum.manage`; expected PUBLISHED state                                                                                                                                                                                                                                   |
| `POST .../content/:contentItemId/archive`                          | `academics.curriculum.manage`; expected PUBLISHED state                                                                                                                                                                                                                                   |
| `GET .../content/:contentItemId/preview`                           | `@SchoolManagementOnly`; `academics.curriculum.view`; exact nested content relation and unclaimed READY video; 300-second inline URL                                                                                                                                                      |

The upload is independent school media owned by the issuing actor until attachment. It is not created under a fake Curriculum/Lesson relation. Attachment happens only through the exact nested content endpoint. Unattached READY retention is bounded in section 17.

## 14. Error contract

Future implementation adds these codes to `ERROR_CATALOG.md` in the phase that introduces them:

| Code                                    | HTTP | Exposure contract                                                   |
| --------------------------------------- | ---- | ------------------------------------------------------------------- |
| `learning.subject_lessons.not_found`    | 404  | no details                                                          |
| `learning.content.playback_not_found`   | 404  | no details                                                          |
| `learning.media.not_ready`              | 409  | dashboard only; safe `{ status }`, no ID                            |
| `learning.media.unsupported_type`       | 415  | safe allowed media categories only; no raw client MIME/probe output |
| `learning.media.upload_expired`         | 410  | `{ retryable: false }`                                              |
| `learning.media.upload_conflict`        | 409  | stable `{ reasonCode, retryable }`                                  |
| `learning.media.size_exceeded`          | 413  | safe `{ maximumBytes, actualBytes }` aggregate values               |
| `learning.media.verification_failed`    | 422  | stable `{ reasonCode }` only                                        |
| `learning.content.publication_conflict` | 409  | safe `{ from, to }` state names                                     |

Generic file wrong-actor/permission denial remains `auth.scope.missing` 403 without identifiers. Hidden/deleted/cross-school management File is `files.not_found` 404 without details. Raw storage errors, object coordinates, attempted foreign IDs, checksums, URLs, probe output, and tenant identifiers are forbidden in errors.

## 15. Audit and observability

### Audit

Successful database AuditLog actions are:

- `learning.media.upload_intent.create`
- `learning.media.upload.complete`
- `learning.media.upload.cancel`
- existing/new `academics.lesson_content.create`
- `academics.lesson_content.publish`
- `academics.lesson_content.unpublish`
- `academics.lesson_content.archive`

Audit metadata is limited to trusted resource UUIDs, stable before/after states, safe media kind/MIME category, aggregate size/duration, and stable reason codes. The scoped create-intent idempotency key produces exactly one create audit even under concurrent identical requests or PUT renewal. Audit metadata excludes signed URL, key, bucket, untrusted `clientRequestId`, `originalName`, raw request, credentials, client title/body, and raw storage/probe output. Existing lesson-content audit summarization that includes user-entered title must be removed for these new sensitive actions.

Playback does not create a database AuditLog per URL. It emits a bounded metric/security event without the URL or resource IDs.

### Metrics

Required metrics use low-cardinality labels only (`actor_class`, `media_kind`, `mime_family`, `outcome`, stable `reason_code`, route family):

- counters for upload intents, idempotent intent replays, PUT renewals, completions, expirations, verification failures by reason, cleanup claims, cleanup object-delete retries, successful PURGED transitions, playback URL requests, authorization denials, `generic_file_app_actor_denials`, Range verification failures, and orphan cleanup outcomes;
- histograms for upload verification/processing latency and signed-URL generation latency;
- gauges for sessions by non-terminal status and cleanup backlog.

`generic_file_app_actor_denials` is emitted at the generic route’s actor-class gate without looking up the requested File. Its only labels are `actor_class`, `route_family`, `outcome`, and stable `reason_code`. Labels must never contain user/student/File/content/session IDs, object keys, URLs, or filenames.

## 16. Concurrency contract

| Race                                | Locked outcome                                                                                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| concurrent identical create intents | unique scoped `clientRequestId` claim produces one row, bucket/object key, and create audit; both requests return the same session; a live UPLOADING replay may receive a renewed URL for that same object |
| same create key, different payload  | normalized payload comparison fails with `learning.media.upload_conflict`/409; existing session and expected metadata are unchanged                                                                        |
| two complete requests               | one UPLOADING→VERIFYING winner; one File and one success audit; READY retries return identical safe result; in-progress loser gets retryable 409                                                           |
| complete vs cancel                  | conditional status update elects one; cancel winner prevents verify and schedules cleanup; verify winner prevents cancel                                                                                   |
| complete after expiry               | conditional claim fails; session becomes/is EXPIRED; 410, no File                                                                                                                                          |
| DRAFT update vs publish             | both use expected DRAFT predicates; one operation wins, the loser conflicts; PUBLISHED content never contains an unreviewed concurrent update                                                              |
| DRAFT delete vs publish             | both use expected DRAFT predicates; one operation wins, the loser conflicts; no row can become both deleted and PUBLISHED                                                                                  |
| publish vs archive                  | only transition from expected source state; one affected row; loser gets publication conflict; no double audit                                                                                             |
| playback vs archive                 | authorization/publication is rechecked immediately before signing in a consistent transaction/version check; archive winner means no URL; signing winner may leave a URL valid for at most 300 seconds     |
| File deletion vs playback           | non-deleted/READY state is rechecked immediately before signing; deletion winner blocks new URL; an already issued URL can remain valid for its remaining ≤300 seconds                                     |
| two content items attach same asset | allowed within exact school only while session is READY, `cleanupClaimedAt IS NULL`, and File is non-deleted; both reference one File and do not duplicate metadata                                        |
| READY attach vs cleanup claim       | conditional attachment rechecks no claim/non-deleted File while cleanup conditionally claims only expired zero-reference READY; exactly one wins; after claim no attachment succeeds                       |
| cleanup vs finalization             | terminal new-upload cleanup and READY orphan cleanup use conditional claims; cleanup cannot claim VERIFYING or LEGACY; finalization/legacy verification cannot claim cleanup-owned/expired state           |
| duplicate subject cursors           | full ordering tuple and query binding give deterministic pages under stable data; malformed/mismatched cursor is 400; no duplicate/skip under stable snapshot                                              |

Affected-row checks and unique constraints on `(bucket, objectKey)`, session `fileId`, and `(schoolId, createdByUserId, purpose, clientRequestId)` are mandatory. Storage cleanup is retryable and must not report a successful delete until object deletion or absence is confirmed.

## 17. Cleanup and retention

| State/resource                 | Exact retention and owner                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| uncompleted intent             | session expires exactly 7,200 seconds after creation; expiration sets EXPIRED and `cleanupEligibleAt`                                                                                    |
| CANCELLED object               | cancellation sets `cleanupEligibleAt`; scheduled cleanup SLO ≤1 hour                                                                                                                     |
| FAILED verification object     | new-upload failure sets `cleanupEligibleAt`; a referenced File from a LEGACY verification failure is retained and receives no cleanup/object-deleted timestamps                          |
| EXPIRED object                 | expiration sets `cleanupEligibleAt`; scheduled cleanup SLO ≤1 hour                                                                                                                       |
| READY unattached media         | finalization sets `cleanupEligibleAt = completedAt + 7 days`; claim requires due time, no claim, no live LessonContentItem reference, and non-deleted File                               |
| LEGACY-origin referenced media | retained indefinitely while referenced, including after FAILED verification; never claimed by orphan cleanup; explicit verification may move LEGACY through VERIFYING to READY or FAILED |
| PURGED media                   | terminal, non-playable, non-attachable, never restored; File metadata remains soft-deleted and session/object-deletion evidence remains                                                  |
| File used by archived content  | retained indefinitely; archived content remains a reference and no automatic object deletion occurs                                                                                      |
| soft-deleted File metadata     | retained indefinitely; no automatic hard delete                                                                                                                                          |
| upload-session rows            | retained indefinitely in V1 for lifecycle/audit evidence                                                                                                                                 |

For FAILED, CANCELLED, and EXPIRED new uploads, `cleanupEligibleAt` is set when cleanup becomes legal. The worker conditionally sets `cleanupClaimedAt`, deletes or confirms absence of the object, then sets `objectDeletedAt`; status remains FAILED, CANCELLED, or EXPIRED. Confirmation of absence counts as successful object cleanup. No success is reported before `objectDeletedAt` is persisted.

READY attachment validation requires `status = READY`, `cleanupClaimedAt IS NULL`, and `File.deletedAt IS NULL`. The cleanup worker may claim READY only when `cleanupEligibleAt <= now`, `cleanupClaimedAt IS NULL`, no live (`deletedAt IS NULL`) LessonContentItem reference exists, and the File is still non-deleted. The claim and the final attachment predicates are conditional database writes, so a cleanup claim and attachment cannot both succeed.

After a READY claim, no new attachment can succeed. The worker soft-deletes the File, deletes or confirms absence of the storage object, sets `objectDeletedAt`, and moves the session to PURGED. If object deletion or evidence persistence fails, status is not reported as PURGED; the claim remains visible for retry/recovery, and a soft-deleted File remains non-attachable. Cleanup uses at most five exponential-backoff job attempts. A reconciliation job may conditionally reclaim a claim older than 15 minutes only when `objectDeletedAt IS NULL`; exhausted retries retain evidence for manual remediation.

Referenced LEGACY media is never claimed by orphan cleanup. A failed LEGACY verification retains its referenced File/object and stable verification failure, with `cleanupEligibleAt`, `cleanupClaimedAt`, and `objectDeletedAt` all null.

A scheduled BullMQ discovery job runs every 15 minutes. HTTP cancel/finalize performs only the transactional state transition and does not block on object deletion. No hard deletion of referenced or historical metadata is authorized. A future hard-delete policy requires explicit legal/history requirements and a reference-counted contract.

## 18. Schema and migration plan

### Exact expected schema changes

1. `LessonContentPublicationStatus` enum.
2. Five `LessonContentItem` publication fields and User relations described in section 9.
3. index `(schoolId, publicationStatus, lessonId, sortOrder)` plus indexes for publication/archive actor FKs.
4. CHECK constraints for publication state/timestamp/actor pairs and `PUBLISHED -> deletedAt IS NULL`; DRAFT-only update/reorder/delete and transition immutability remain conditional repository-write invariants.
5. `FileUploadPurpose` and `FileUploadSessionStatus` enums.
6. `FileUploadSession` and all fields/relations in section 10, including required UUID `clientRequestId`, required sanitized `originalName` with database length 255, and nullable `cleanupEligibleAt`, `cleanupClaimedAt`, and `objectDeletedAt`.
7. unique `(bucket, objectKey)`, unique nullable `fileId`, and unique `(schoolId, createdByUserId, purpose, clientRequestId)`; indexes `(schoolId, status, expiresAt)`, `(schoolId, purpose, status)`, `createdByUserId`, and cleanup discovery `(schoolId, status, cleanupEligibleAt, cleanupClaimedAt)`.
8. CHECK constraints for positive expected/actual size, positive duration/dimensions when present, 255-character non-empty `originalName`, and lifecycle consistency: LEGACY requires an existing File with no cleanup/authoritative verification; READY requires File/verified facts and `cleanupEligibleAt = completedAt + 7 days`; a legacy-origin FAILED row retains its File and null cleanup fields; new-upload FAILED/CANCELLED/EXPIRED rows require `cleanupEligibleAt`; any `objectDeletedAt` requires a claim; PURGED requires `cleanupClaimedAt` and `objectDeletedAt`.
9. inverse User/Organization/School/File relations required by Prisma.
10. `FileUploadSession` registration in `SCHOOL_SCOPED_MODELS`; it is not a soft-delete model.

`File` gets no purpose or readiness column. `LessonContentItem.fileId` remains non-unique. No schema change is needed for subject discovery, generic file hardening, or playback routes.

### Migration order

1. Phase 1B additive publication migration: create enum/nullable fields/FKs; backfill non-deleted to PUBLISHED and deleted to ARCHIVED; validate; add constraints/indexes/default/not-null in a safe order.
2. Phase 1C additive upload migration: create enums/table/relations/indexes/constraints including PURGED, filename/idempotency, and cleanup fields. Backfill LEGACY sessions for Files referenced by lesson content with `clientRequestId = File.id`, the same sanitized-basename normalization applied to existing `File.originalName`, fixed null cleanup fields, and no object mutation. A pre-migration classifier is a hard gate: a legacy name that normalizes empty or exceeds 255 characters requires separately approved data remediation rather than truncation or an invented name. Every new PostgreSQL CHECK constraint is inventoried in `docs/database/migration-custom-sql-inventory.md` in the same phase.
3. Deploy application code only after upgrade rehearsal validates both backfills. Playback phases add no schema unless a separately approved finding proves otherwise.

Committed migrations are immutable. No baseline edits, `db push`, direct production SQL, destructive backfill, or SQL object-store mutation is permitted. Each migration must pass fresh replay, upgrade from a realistic pre-change snapshot, data assertions preserving existing visible content/Files, `prisma migrate deploy`, and a second deploy no-op. Drift, checksum mismatch, failed migration, reset request, or P3009 is a hard stop under migration governance.

## 19. Permission and actor matrix

Denial notation: **403 actor** = actor-class/scope/permission rejection without resource lookup; **404 hidden** = ownership/resource relation collapsed to safe not-found.

| Future route family                           | Permissions                                    | Actor gate              | Ownership/relation gate                                                                             | Admin/Organization                                                            | Teacher   | Student   | Parent    | Platform  | Custom school/org role                                                     |
| --------------------------------------------- | ---------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- | --------- | --------- | --------- | -------------------------------------------------------------------------- |
| generic File GET                              | `files.downloads.view`                         | `@SchoolManagementOnly` | selected school; scoped non-deleted File                                                            | School Admin yes; Organization Admin yes only with selected school membership | 403 actor | 403 actor | 403 actor | 403 actor | School-scoped management actor with permission yes; org-only/no-school 403 |
| Student subject lessons                       | subjects view + plan view                      | exact Student           | active enrollment; eligible Subject via allocation or visible ACTIVE plan; exact academic relations | 403 actor                                                                     | 403 actor | yes       | 403 actor | 403 actor | 403 actor regardless permission                                            |
| Student playback                              | plan view                                      | exact Student           | exact visible item/content/unclaimed READY video                                                    | 403 actor                                                                     | 403 actor | yes       | 403 actor | 403 actor | 403 actor                                                                  |
| Parent playback                               | plan view + curriculum view                    | exact Parent            | active Guardian-child/enrollment and exact content                                                  | 403 actor                                                                     | 403 actor | 403 actor | yes       | 403 actor | 403 actor                                                                  |
| Teacher playback                              | preparation view + plan view + curriculum view | exact Teacher           | exact owned allocation/item/content                                                                 | 403 actor                                                                     | yes       | 403 actor | 403 actor | 403 actor | 403 actor                                                                  |
| upload create/complete/cancel                 | curriculum manage + uploads manage             | `@SchoolManagementOnly` | selected school, issuing actor/session, purpose                                                     | School Admin yes; Organization Admin only with selected school                | 403 actor | 403 actor | 403 actor | 403 actor | scoped management actor only if both permissions                           |
| FILE content create/publish/unpublish/archive | curriculum manage                              | `@SchoolManagementOnly` | exact nested Curriculum/unit/lesson/content and READY media                                         | same management convention                                                    | 403 actor | 403 actor | 403 actor | 403 actor | scoped management actor with permission                                    |
| dashboard content preview                     | curriculum view                                | `@SchoolManagementOnly` | exact nested content/unclaimed READY video                                                          | same management convention                                                    | 403 actor | 403 actor | 403 actor | 403 actor | scoped management actor with permission                                    |

No new permission code is needed. A platform role holding all permission codes still fails app actor gates and `@SchoolManagementOnly()` by design.

## 20. Executable future test matrix

### Student subject discovery

- current allocation branch success with an empty lesson list; visible ACTIVE-plan branch success after the originating allocation becomes unavailable; no-allocation/no-visible-plan denial; multiple Teacher allocations with plans from both teachers and no arbitrary selection;
- foreign/inactive/deleted Subject; other classroom; other school; wrong term/year; archived Curriculum; draft/archived/deleted plan; active plan;
- historical allocation deletion/transfer does not hide valid active plan;
- inclusive/default date filters and invalid/out-of-term ranges; every status value; default/max/over-max limit;
- null period ordering, stable tie-breaking, cursor replay/mismatch/malformed cursor, empty page, and safe response field denylist.

### Generic file hardening

- School Admin allowed; Organization Admin allowed only under current selected-school convention; custom scoped management role allowed only with permission;
- Student, Parent, Teacher, Platform, org-only/no-school actors denied before lookup;
- same-school unrelated File no longer accessible to app actor; cross-school/deleted File hidden from management;
- Student message attachment, Teacher message attachment, Parent message attachment, Parent linked-child proof, and homework attachment flows continue through relation routes;
- oversized multipart is rejected before controller use-case execution; no oversized Buffer reaches `UploadFileUseCase`; error is stable `files.upload.size_exceeded`/413; existing uploads at or below 10 MiB remain unchanged;
- permission metadata reflection tests assert both decorators and no seed mutation.

### Publication

- new DRAFT hidden from Student/Parent; PUBLISHED visible; ARCHIVED hidden; Teacher exact-owned DRAFT preview and other-teacher denial;
- existing non-deleted backfilled PUBLISHED; deleted backfilled ARCHIVED; pair/check constraints and default DRAFT;
- DRAFT content update, type-valid body/link/File replacement, reorder, and soft delete PASS; DRAFT archive conflicts;
- PUBLISHED update/body/link/File replacement/reorder/delete conflict without row mutation; PUBLISHED unpublish then update/reorder PASS; unpublish then republish is required before app visibility;
- every ARCHIVED update/reorder/delete/publish/unpublish conflicts and the row remains immutable;
- concurrent DRAFT update versus publish and delete versus publish each produce one valid outcome, one conflict, no unreviewed published mutation, and no deleted published row;
- publish/unpublish/archive valid and invalid transitions; publish race; archive race; publish-vs-archive race; one audit; no unsafe audit title/body;
- active Curriculum remains structurally mutable but app visibility is publication-controlled.

### Upload and verification

- server-generated bucket/key/ID; client attempts to supply them are rejected/ignored by DTO whitelist; correct direct upload success;
- filename normalization covers a normal filename, Windows and POSIX path stripping, control-character stripping, blank normalized-name rejection, and over-255-character rejection; complete cannot replace `originalName`, and File receives the stored sanitized value;
- required UUID `clientRequestId`; new-key create; lost create response then identical retry; concurrent identical creates converge on one row/object key/audit; same key with a different normalized payload conflicts;
- every PUT TTL is 3,600 seconds; expired PUT with a live UPLOADING session renews the URL for the same session/object key; renewal leaves session `expiresAt` unchanged; retry after the fixed 7,200-second session expiry returns upload-expired;
- declared MIME spoof, wrong magic, unsupported codec/container, size mismatch, 209,715,200-byte boundary and oversize, 3600-second boundary and excess, dimension excess;
- expired intent; double complete; complete/cancel, complete/expiry, cleanup/finalize races; verification failure and stable error; one File/one audit;
- existing referenced File backfills to LEGACY; LEGACY content metadata remains visible but playback/new attachment validation fails; `LEGACY -> VERIFYING -> READY | FAILED` is verified; READY requires authoritative verification;
- READY attachment before retention; READY attach-versus-cleanup-claim race; zero-reference READY cleanup; live-reference READY exclusion; no attachment after claim; PURGED terminal/non-playable behavior;
- FAILED/CANCELLED/EXPIRED cleanup evidence retains status and sets object-deletion evidence; object-delete retry leaves the claim visible; LEGACY and failed LEGACY verification are excluded from cleanup;
- unattached orphan after seven days and referenced LEGACY/READY asset preservation; no video Buffer passes through Nest; no storage coordinate/credential leak or filename logging/audit.

### Playback

- Student own READY item success; other classroom/school; arbitrary same-school File; content from another lesson; DRAFT/ARCHIVED/deleted content; deleted File; wrong purpose; non-video; LEGACY and every other not-READY state denied;
- exact inline disposition, verified content type, 300-second expiry tolerance, renewal, no URL persistence/log/audit, response denylist;
- real MinIO Range bytes test returns 206, correct headers/type/bytes;
- playback/archive and playback/File-delete concurrency outcomes.

### Parent and Teacher

- linked child success; unlinked child, inactive Guardian relation, other school/child/item denial;
- owned Teacher allocation success; other Teacher/inactive Teacher denial; exact lesson relation; DRAFT preview success only for owner; PUBLISHED success; ARCHIVED denial; historical allocation behavior.

### Regression and execution environments

- current unit suites for Student Subjects/Lessons, Parent Lessons, Teacher preparation, Curriculum, Lesson Content, Lesson Plans, Files, Student/Parent/Teacher attachments, permission metadata;
- E2E route/presenter flows and School A/B security suites for the same areas;
- migration fresh replay/upgrade/no-op on PostgreSQL; direct upload, cleanup, signed GET, Range, and expiry against configured MinIO; BullMQ/Redis cleanup integration;
- full canonical regression before phase 1G closeout.

## 21. Locked future implementation phases

Only files listed in each **production-file allowlist** may change in that phase. Tests, the phase closeout document, and the explicitly named migration are additionally allowed; package/deployment changes are forbidden unless explicitly listed.

### 0B — Generic File Authorization and Multipart Memory Boundary Hardening (next)

- **Goal/routes:** on `GET /api/v1/files/:id/download`, add `@SchoolManagementOnly()`, retain `files.downloads.view`, and remove the requested File ID from safe not-found details. On `POST /api/v1/files`, set Multer `fileSize` to `FILES_UPLOAD_MAX_SIZE_BYTES`, retain the use-case size check as defense in depth, and translate Multer `LIMIT_FILE_SIZE` to `files.upload.size_exceeded`/413.
- **Schema/storage:** none; no database/storage writes beyond existing authorized request behavior.
- **Production-file allowlist:** `src/modules/files/uploads/controller/uploads.controller.ts`; `src/modules/files/uploads/application/get-file-download-url.use-case.ts`; new `src/modules/files/uploads/filters/files-upload-multer-exception.filter.ts`; `src/modules/files/uploads/domain/file-upload.exceptions.ts`; `src/modules/files/uploads/domain/file-upload.constraints.ts`. The existing cataloged error code is reused; `ERROR_CATALOG.md` does not change.
- **Tests/environment:** controller/filter tests prove an oversized upload is rejected before controller use-case execution, no oversized Buffer reaches `UploadFileUseCase`, `files.upload.size_exceeded`/413 is stable, and an upload at or below 10 MiB is unchanged. Also run unit metadata/use-case, Files E2E/security, Student/Parent/Teacher relation attachment, and School A/B regressions against the current PostgreSQL/MinIO test stack.
- **Forbidden:** seed/permission/schema/migration changes; app relation route changes; upload/playback work.
- **Entry:** this corrected contract independently approved; clean baseline; current generic IDOR and oversized-Buffer path reproduced by tests.
- **Exit:** management actors work, all app actors fail before File lookup, oversized multipart is rejected at Multer, use-case defense remains, relation downloads and <=10 MiB upload regress green, no seed/schema drift, merged independently.

### 1A — Student Subject Lesson Discovery

- **Goal/route:** implement only `GET /api/v1/student/subjects/:subjectId/lessons` with section 7 contract.
- **Schema/storage:** none.
- **Production-file allowlist:** `src/modules/student-app/student-app.module.ts`; new `src/modules/student-app/subjects/controller/student-subject-lessons.controller.ts`, `application/list-student-subject-lessons.use-case.ts`, `infrastructure/student-subject-lessons-read.adapter.ts`, `dto/student-subject-lessons.dto.ts`, `dto/student-subject-lessons-response.dto.ts`, `domain/student-subject-lessons.errors.ts`, `presenters/student-subject-lessons.presenter.ts`; `ERROR_CATALOG.md`.
- **Tests/environment:** new unit/E2E/security cases in section 20 plus current Student Subjects/Lessons; PostgreSQL with representative co-teaching data; no MinIO writes.
- **Forbidden:** alter existing Subject detail response, publication/upload/playback, a mandatory current-allocation dependency when the visible-plan eligibility branch succeeds, schema/migration.
- **Entry:** 0B merged; baseline clean; fixtures cover both eligibility branches: current matching allocation and currently visible ACTIVE plan without an available originating allocation.
- **Exit:** exact cursor/response/visibility and co-teaching matrices green; allocation-only eligibility returns an empty list; visible-plan eligibility survives unavailable allocation; no-allocation/no-visible-plan is hidden; no current regression.

### 1B — Lesson Content Publication Lifecycle

- **Goal/routes:** publication fields/read filters; nested publish/unpublish/archive actions; and DRAFT-only enforcement for existing content update, reorder, and delete routes.
- **Schema:** publication enum/fields/FKs/indexes/CHECK constraints and compatibility backfill from section 18; expected-state conditional writes enforce PUBLISHED/ARCHIVED immutability.
- **Production-file allowlist:** `prisma/schema.prisma`; one new immutable phase migration; `docs/database/migration-custom-sql-inventory.md`; `src/modules/academics/curriculum/curriculum.module.ts`, `controller/curriculum.controller.ts`, `application/lesson-content.use-cases.ts`, `infrastructure/lesson-content.repository.ts`, `dto/lesson-content.dto.ts`, `dto/lesson-content-response.dto.ts`, `domain/lesson-content.exceptions.ts`, `presenters/lesson-content.presenter.ts`; `src/modules/student-app/lessons/infrastructure/student-lessons-read.adapter.ts`; `src/modules/parent-app/lessons/infrastructure/parent-child-lessons-read.adapter.ts`; `src/modules/teacher-app/lesson-preparation/infrastructure/teacher-lesson-preparation-read.adapter.ts`; `src/modules/student-app/subjects/infrastructure/student-subject-lessons-read.adapter.ts`; `ERROR_CATALOG.md`. Every new PostgreSQL CHECK constraint is inventoried in the custom-SQL inventory.
- **Tests/environment:** publication unit/E2E/security and migration replay/upgrade/no-op on PostgreSQL.
- **Forbidden:** upload sessions, signed playback, generic file/permission changes, object mutation.
- **Entry:** 1A merged; migration governance clean; legacy-data rehearsal fixture prepared.
- **Exit:** backfill preserves visible content, deleted content stays hidden, and new content defaults DRAFT; DRAFT update/reorder/delete passes; PUBLISHED update/reorder/delete conflicts until unpublish; ARCHIVED is immutable; update-vs-publish and delete-vs-publish each produce one valid outcome with no unreviewed/deleted published row; actor visibility and audits are green.

### 1C-P — Media Verification Runtime Prerequisite

- **Goal/routes:** identify and document the repository/deployment runtime image mechanism; pin one exact `ffprobe` version; prove that exact binary in local test, CI, and target runtime; lock subprocess timeout, maximum output bytes, network denial, and stable failure mapping. No HTTP route is added.
- **Schema/storage:** none; no database or object mutation.
- **Production-file allowlist:** no application production file. Changes are restricted to the repository/deployment runtime-image mechanism identified by the phase, its CI verification configuration, and a new phase closeout document. Before editing any deployment file, the 1C-P preflight must record its exact path and independently approved allowlist.
- **Tests/environment:** `ffprobe -version` and constrained-subprocess contract tests in local test, CI, and target runtime; the same pinned version must be reported in all three.
- **Forbidden:** schema, migration, upload, playback, learning-content behavior, Files/Academics application code, and unpinned package installation.
- **Entry:** 1B merged; current repository/deployment mechanism inventory completed read-only.
- **Exit:** `ffprobe -version` PASS in local test, CI, and target runtime; exact version and subprocess timeout/output/network/failure contracts recorded; 1C remains unauthorized until 1C-P is merged.

### 1C — Direct Video Upload Foundation

- **Goal/routes:** idempotent create/PUT-renewal, complete, and cancel upload routes; sanitized filename finalization; READY-only FILE attachment; and executable terminal/READY cleanup. No app playback.
- **Schema:** FileUpload enums/model/relations/indexes/checks including PURGED, required `clientRequestId`/`originalName`, cleanup evidence fields, scoped idempotency uniqueness, cleanup-discovery index, and LEGACY backfill from section 18. `FileUploadSession` is added to `SCHOOL_SCOPED_MODELS` and is not added to soft-delete models.
- **Production-file allowlist:** `prisma/schema.prisma`; one new immutable phase migration; `PRISMA_CONVENTIONS.md`; `docs/database/migration-custom-sql-inventory.md`; `src/infrastructure/database/school-scope.extension.ts`; `src/modules/files/files.module.ts`; `src/modules/files/uploads/uploads.module.ts`; new `src/modules/files/uploads/application/create-file-upload-intent.use-case.ts`, `application/complete-file-upload.use-case.ts`, `application/cancel-file-upload.use-case.ts`, `application/process-file-upload-cleanup.use-case.ts`, `application/file-upload-cleanup-queue.service.ts`, `domain/file-upload-session.constants.ts`, `domain/file-upload-session.errors.ts`, `domain/file-upload-session-inputs.ts`, `domain/file-upload-session.types.ts`, `dto/learning-media-upload.dto.ts`, `dto/learning-media-upload-response.dto.ts`, `infrastructure/file-upload-sessions.repository.ts`, `infrastructure/media-verification.service.ts`, `infrastructure/file-upload-cleanup.worker.ts`, `presenters/file-upload-session.presenter.ts`; `src/modules/academics/curriculum/curriculum.module.ts`, new `controller/learning-media-uploads.controller.ts`, `application/lesson-content.use-cases.ts`, `infrastructure/lesson-content.repository.ts`; `src/infrastructure/storage/storage.service.ts`; `src/infrastructure/storage/minio.adapter.ts`; `ERROR_CATALOG.md`. `PRISMA_CONVENTIONS.md` records the scoped model in the same phase, and every new PostgreSQL CHECK constraint is recorded in the custom-SQL inventory. Upload application use cases depend on `StorageService`; only `StorageService` and storage infrastructure may call `MinioAdapter` directly.
- **Tests/environment:** direct MinIO PUT/stat/verify/cleanup, Redis/BullMQ, PostgreSQL migrations, filename/idempotency/renewal tests, race tests, LEGACY backfill/verification transitions, READY attach/cleanup/PURGED checks, terminal cleanup evidence/retry, and no-Buffer assertion.
- **Forbidden:** Student/Parent/Teacher playback, generic size-limit increase, arbitrary media library/list route, HLS/transcoding.
- **Entry:** 1C-P merged; its pinned ffprobe contract passes in dev/test/deploy; private MinIO CORS permits the exact PUT origin/method/headers; pre-migration filename classification proves every legacy referenced File can populate valid sanitized session `originalName` or stops for approved remediation.
- **Exit:** one scoped idempotent session/object key/create audit per `clientRequestId` and normalized payload; identical retries/3,600-second renewal converge without extending the 7,200-second session; different payload conflicts; File uses stored sanitized `originalName`; one READY File per new upload; referenced legacy Files are LEGACY rather than READY; `LEGACY -> VERIFYING -> READY | FAILED` works; only unclaimed, non-deleted, authoritatively verified READY attaches; READY cleanup reaches PURGED only with evidence; terminal cleanup/retry and attach-versus-claim races pass; full verification, schema, migration, and no-leak gates are green.

### 1D — Student Secure Playback

- **Goal/route:** Student playback route only plus signing/Range support.
- **Schema:** none.
- **Production-file allowlist:** `src/modules/student-app/student-app.module.ts`; new `src/modules/student-app/lessons/controller/student-lesson-playback.controller.ts`, `application/get-student-lesson-playback.use-case.ts`, `domain/student-lesson-playback.errors.ts`, `dto/student-lesson-playback-response.dto.ts`, `presenters/student-lesson-playback.presenter.ts`; `src/modules/student-app/lessons/infrastructure/student-lessons-read.adapter.ts`; `src/infrastructure/storage/signed-url.service.ts`, `storage.service.ts`, `minio.adapter.ts`; existing attachment/download callers `src/modules/files/uploads/application/get-file-download-url.use-case.ts`, `src/modules/communication/application/communication-message-attachment-download.use-case.ts`, `src/modules/parent-app/files/application/get-parent-child-file-download-url.use-case.ts`, `src/modules/applicant-portal/application/get-applicant-document-download-url.use-case.ts`; `ERROR_CATALOG.md`. Those four callers may change only to pass explicit `attachment` disposition while preserving their current TTL, filename, relation authorization, response, and audit behavior.
- **Tests/environment:** Student authorization matrix, renewal/concurrency/no-leak; real PostgreSQL/MinIO Range integration.
- **Forbidden:** Parent/Teacher playback, proxy streaming, HLS/transcoding, generic file permission.
- **Entry:** 1C merged and Range test passes in target storage environment.
- **Exit:** exact 300-second inline response and all hidden states safe; Range gate and regressions green.

### 1E — Parent and Teacher Playback

- **Goal/routes:** exact Parent and Teacher routes in section 13.
- **Schema:** none.
- **Production-file allowlist:** `src/modules/parent-app/parent-app.module.ts`; new `src/modules/parent-app/lessons/controller/parent-child-lesson-playback.controller.ts`, `application/get-parent-child-lesson-playback.use-case.ts`, `domain/parent-child-lesson-playback.errors.ts`, `dto/parent-child-lesson-playback-response.dto.ts`, `presenters/parent-child-lesson-playback.presenter.ts`; `src/modules/parent-app/lessons/infrastructure/parent-child-lessons-read.adapter.ts`; `src/modules/teacher-app/teacher-app.module.ts`; new `src/modules/teacher-app/lesson-preparation/controller/teacher-lesson-playback.controller.ts`, `application/get-teacher-lesson-playback.use-case.ts`, `domain/teacher-lesson-playback.errors.ts`, `dto/teacher-lesson-playback-response.dto.ts`, `presenters/teacher-lesson-playback.presenter.ts`; `src/modules/teacher-app/lesson-preparation/infrastructure/teacher-lesson-preparation-read.adapter.ts`; `ERROR_CATALOG.md`.
- **Tests/environment:** linked-child/Teacher-owned matrices and current lesson/message/file regressions on PostgreSQL/MinIO.
- **Forbidden:** parent/teacher generic File permission, Student behavior changes, Dashboard upload changes, archived preview.
- **Entry:** 1D merged and signing/Range contract stable.
- **Exit:** exact ownership, Teacher DRAFT preview, response/TTL/no-leak, and School A/B matrices green.

### 1F — Advanced Media Processing, if required

- **DEFERRED DECISION:** no production-file allowlist or implementation authorization exists until a section 12 quantitative/product trigger is met and a new contract phase selects HLS/DASH/renditions/thumbnails, worker topology, retention, costs, or a multipart/resumable upload contract.
- **Forbidden now:** transcoding, thumbnails, alternate renditions, adaptive streaming, new source formats, uploads above 209,715,200 bytes, or multipart/resumable upload.

### 1G — Full Security, Storage, and Performance Closeout

- **Goal:** no planned new behavior; execute the complete section 20 matrix, canonical regression, migration/storage rehearsal, authorization/no-leak audit, load/latency measurements, cleanup recovery test, and final evidence document.
- **Schema/routes:** none. Any discovered fix requires separately approved scope before code changes.
- **Production-file allowlist:** none for the audit; only a new closeout document. Separately approved fixes must declare their own allowlist.
- **Tests/environment:** production-equivalent PostgreSQL, Redis/BullMQ, and MinIO; full canonical suite and p95 playback/upload measurements.
- **Forbidden:** scope expansion or optional 1F work without its trigger/contract.
- **Entry:** 1E merged; environment mirrors deployed storage/proxy/CORS path.
- **Exit:** all tests green, no critical security/storage/performance finding, metrics/cleanup verified, operational runbook accepted.

## 22. Non-negotiable program gates

- 0B is the next runtime phase.
- No 1A-or-later work starts until 0B is independently reviewed and merged.
- The phase order is exactly 0B → 1A → 1B → 1C-P → 1C → 1D → 1E → 1F when triggered → 1G.
- No upload/playback work starts until publication and its preceding phases are merged in order; 1C specifically remains unauthorized until 1C-P is merged.
- All routes remain under the framework `/api/v1` prefix.
- Core Academics/Files models remain sources of truth; app modules remain composition/read-model layers.
- Controllers contain no business logic and never use Prisma directly.
- No phase may stage, commit, push, or open a pull request unless that phase’s user authorization explicitly permits it.

## 23. Phase 0A validation evidence

| Validation                          | Exact outcome                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused module-local regression     | PASS — 29/29 suites, 229/229 tests. Covered permission guard; Student Subjects/Lessons; Parent Lessons/files/messages; Teacher preparation/messages; Curriculum; Lesson Content; Lesson Plans; Files upload/presenter; communication attachment domain/presenter/use case; Student messages; and homework question/answer attachments. |
| Database-backed E2E/security suites | NOT EXECUTED — PostgreSQL at `localhost:5433` was unavailable, and this docs-only phase prohibited database setup, migration, seeding, and mutation. No application assertion executed or failed.                                                                                                                                      |
| Application assertion failures      | 0.                                                                                                                                                                                                                                                                                                                                     |
| `npm run test:migration-governance` | PASS — 39/39 tests.                                                                                                                                                                                                                                                                                                                    |
| `npm run db:migrations:check`       | PASS — base `origin/main` at `136564fa9dea`, 5 active migrations, 0 new, rebaseline off.                                                                                                                                                                                                                                               |
| `npx prisma validate`               | PASS — schema valid.                                                                                                                                                                                                                                                                                                                   |
| `npx prisma generate`               | PASS — Prisma Client 6.19.3 generated in `node_modules`; no tracked repository file changed.                                                                                                                                                                                                                                           |
| `npm run build`                     | PASS — Nest build completed.                                                                                                                                                                                                                                                                                                           |
| Prettier                            | PASS — run only on this document.                                                                                                                                                                                                                                                                                                      |

The contract artifact and docs-only validation are **COMPLETE**. Unavailable PostgreSQL does not block this zero-database-write phase. No database or storage service was started, migrated, seeded, or mutated, and there were zero application assertion failures.

## 24. Corrected final status

```text
LEARNING-CONTENT-DISCOVERY-AND-MEDIA-0A:
COMPLETE

FOCUSED EXISTING TESTS:
229/229

DATABASE-BACKED TESTS:
NOT EXECUTED — ZERO-DATABASE-WRITE PHASE

APPLICATION ASSERTION FAILURES:
0

BUILD:
PASS

MIGRATION GOVERNANCE:
PASS

MIGRATION STRUCTURE:
PASS

PRISMA VALIDATE:
PASS

PRISMA GENERATE:
PASS

DATABASE MUTATION:
0

STORAGE MUTATION:
0

RUNTIME FILES CHANGED:
0

SCHEMA CHANGED:
0

MIGRATIONS CHANGED:
0

SEEDS CHANGED:
0

CHANGED FILES:
docs/sprint-learning-content-discovery-media-0a-contract-lock.md

STAGED FILES:
0

COMMIT AUTHORIZED:
NO

PUSH AUTHORIZED:
NO

NEXT PHASE:
0B GENERIC FILE AUTHORIZATION AND MULTIPART MEMORY BOUNDARY HARDENING

1A AND LATER:
NOT AUTHORIZED
```
