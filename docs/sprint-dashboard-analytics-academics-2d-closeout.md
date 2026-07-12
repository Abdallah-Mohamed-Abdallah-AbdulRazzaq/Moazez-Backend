# DASHBOARD-ANALYTICS-ACADEMICS-2D Closeout

## Sprint identity and start gate

- Sprint: `DASHBOARD-ANALYTICS-ACADEMICS-2D`
- Branch: `feat/dashboard-analytics-academics-2d`
- Baseline and unchanged pre-implementation HEAD: `166e3e44b8daaa2646cddb9711ec366be6095335`
- Scope: four read-only Academics Dashboard Analytics category charts, focused tests, and this closeout.

The start gate passed before any file was changed:

- branch matched the required branch;
- HEAD and merge base both matched the baseline;
- commits after the baseline were `0`;
- worktree and index were clean;
- `origin/main` matched the baseline;
- no remote `feat/dashboard-analytics-academics-2d` branch existed.

## Implemented and deferred charts

The `academics_v1` pack implements exactly:

1. `academics.teacher_allocation_coverage`
2. `academics.timetable_publication_status`
3. `academics.curriculum_activation`
4. `academics.lesson_plan_activation`

These remain `definition_only`, outside the pack, and retain their safe `200 not_implemented` response and legacy-derived time-query behavior:

- `academics.structure_readiness`: deferred because no authoritative readiness numerator, denominator, weights, thresholds, hierarchy-completeness rules, or empty-school rule exist.
- `academics.subject_allocation_coverage`: deferred because persisted allocations do not define the required-but-missing grade-subject population.

The catalog remains at 37 definitions. Computed definitions changed from 16 to 20, and definition-only charts changed from 21 to 17.

## Counting contracts

### Teacher allocation coverage

The denominator is `SUBJECT_ALLOCATION_X_CLASSROOM`: one nondeleted `SubjectAllocation` multiplied by each nondeleted `Classroom` whose nondeleted `Section` belongs to the allocation's nondeleted `Grade`. The trusted school, nondeleted `Term`, nondeleted `Subject`, and term-to-academic-year consistency are explicit in the aggregate query. `weeklyHours = 0` remains a requirement row and is not filtered out.

An expected unit is `allocated` when at least one same-school `TeacherSubjectAllocation` exists for the same term, subject, and classroom and its referenced `User` is nondeleted. An `EXISTS` predicate ensures multiple qualifying teacher allocations count the unit once. No Membership-status predicate was introduced. An expected unit with no qualifying allocation is `missing`.

Output order is `allocated`, then `missing`. The summary label is `Teacher allocation units`; `empty` is true only when the denominator is zero.

### Timetable publication status

The counting unit is one current `TimetableConfig`. `ACTIVE` maps to `published`, `DRAFT` maps to `draft`, and `ARCHIVED` is excluded. Publication revisions and timetable entries are not counted, so historical `PUBLISHED` or `SUPERSEDED` rows cannot inflate the current result. Output order is `published`, then `draft`; the summary label is `Current timetable configurations`.

### Curriculum activation

The counting unit is one current nondeleted `Curriculum` row. `ACTIVE` maps to `active`, `DRAFT` maps to `draft`, and `ARCHIVED` is excluded. `publishedAt`, `archivedAt`, units, lessons, and mutable timestamps do not affect the current category result. Output order is `active`, then `draft`; the summary label is `Current curricula`.

### Lesson plan activation

The counting unit is one current nondeleted `LessonPlan` row. `ACTIVE` maps to `active`, `DRAFT` maps to `draft`, and `ARCHIVED` is excluded. Lesson-plan item status, week dates, activation/archive timestamps, and mutable timestamps do not affect the current category result. Required nested Classroom, Section, and Grade paths are same-school and nondeleted. Output order is `active`, then `draft`; the summary label is `Current lesson plans`.

All four computations emit deterministic, zero-filled category points. A populated response uses `no_data` only when its represented total is zero.

## Hierarchy and time-filter contracts

| Chart | Academic year | Term | Grade | Section | Classroom |
| --- | --- | --- | --- | --- | --- |
| Teacher allocation coverage | `SubjectAllocation.academicYearId` plus Term consistency | `SubjectAllocation.termId` | allocation Grade plus Classroom's Section Grade | expected-matrix Section | expected-matrix Classroom |
| Timetable publication status | `TimetableConfig.academicYearId` | `TimetableConfig.termId` | unsupported | unsupported | unsupported |
| Curriculum activation | `Curriculum.academicYearId` | `Curriculum.termId` | `Curriculum.gradeId` | unsupported | unsupported |
| Lesson plan activation | `LessonPlan.academicYearId` | `LessonPlan.termId` | Classroom → Section → Grade | Classroom → Section | `LessonPlan.classroomId` |

Unsupported hierarchy filters return validation `400` before aggregate execution. Supported identifiers continue through the existing UUID, same-school, and hierarchy-consistency resolver; missing, inconsistent, or cross-school identifiers retain the generic safe `404` contract.

All four charts use `timeFilterMode: compatibility_defaults`:

- omitted or explicit `range=30d` is accepted but not applied;
- omitted or explicit `granularity=day` is accepted but not applied;
- any other explicit range, `week`, `month`, `dateFrom`, or `dateTo` returns `400`;
- `appliedFilters` contains supported resolved hierarchy filters only;
- `notApplicableFilters` contains `range` and `granularity`;
- the compatibility `resolvedWindow` is returned but is not passed to an Academics repository operation.

The public metadata names `requestedFilters`, `appliedFilters`, `notApplicableFilters`, and `resolvedWindow` are unchanged.

## Pack, computations, and response metadata

The new pack is `academics_v1` with these typed computation identities:

- `academics_teacher_allocation_coverage`
- `academics_current_timetable_publication_status`
- `academics_current_curriculum_activation_status`
- `academics_current_lesson_plan_activation_status`

Responses use `dataAvailability: computed_category`, `freshness.dataMode: request_time_snapshot`, no cache, and no realtime. Existing `operational_snapshot_v1`, `attendance_v1`, and `admissions_students_v1` behavior is unchanged.

## Repository and dispatch architecture

`DashboardAcademicsAnalyticsRepository` provides four aggregate-only methods:

- `countTeacherAllocationCoverage()`
- `countCurrentTimetablePublicationStatus()`
- `countCurrentCurriculumActivationStatus()`
- `countCurrentLessonPlanActivationStatus()`

Teacher coverage uses a bounded tagged `$queryRaw`/`Prisma.sql` aggregate with trusted bound values and static optional predicates. The other methods use scoped Prisma grouping. No individual SubjectAllocation, allocation, Classroom, config, Curriculum, LessonPlan, teacher, or User row reaches the application layer.

Dispatch remains explicit: unknown chart → computed snapshot → Attendance pack → Admissions/Students pack → Academics pack → definition-only fallback. Each Academics chart calls only its own repository method. Deferred Academics charts call no Academics repository method. Dashboard Summary and Academics Overview fanout are not reused.

## Module Page and security

The Academics Module Page exposes the four available definitions and the two planned definitions, but `analytics.availableData` remains empty. Standalone data is loaded only from `GET /api/v1/dashboard/analytics/charts/:chartKey/data`; no Module Page analytics fanout was added.

The existing `dashboard.analytics.view` permission, route, authenticated Dashboard school scope, no-tenant-override DTO surface, same-school hierarchy resolver, generic safe `404`, and unsupported-filter `400` remain unchanged. Unit, E2E, and School A/B security coverage verifies that responses contain no academic source identifiers, teacher/User identifiers, names, Membership data, tenant identifiers, raw rows, SQL, Prisma details, table names, or existence details.

## Exact files changed

- `src/modules/dashboard/application/get-dashboard-analytics-chart-data.use-case.ts`
- `src/modules/dashboard/dashboard.module.ts`
- `src/modules/dashboard/domain/dashboard-academics-analytics.ts`
- `src/modules/dashboard/domain/dashboard-analytics-catalog.ts`
- `src/modules/dashboard/domain/dashboard-analytics-data-pack.ts`
- `src/modules/dashboard/dto/dashboard-analytics-data.dto.ts`
- `src/modules/dashboard/infrastructure/dashboard-academics-analytics.repository.ts`
- `src/modules/dashboard/presenters/dashboard-analytics-data.presenter.ts`
- `src/modules/dashboard/tests/dashboard-academics-analytics.repository.spec.ts`
- `src/modules/dashboard/tests/dashboard-academics-analytics.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-data.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-data.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-query-context.service.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-modules.presenter.spec.ts`
- `test/e2e/dashboard-analytics-catalog-foundation.e2e-spec.ts`
- `test/e2e/dashboard-analytics-data-pack-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-analytics-data.spec.ts`
- `docs/sprint-dashboard-analytics-academics-2d-closeout.md`

## Verification evidence

- Focused catalog, capability, repository, computation, presenter, use-case, and Module Page unit command: 7 suites, 96 tests passed.
- Full Dashboard unit regression (`npx jest src/modules/dashboard/tests --runInBand`): 33 suites, 245 tests passed.
- Complete Dashboard E2E surface: 10 suites, 73 tests passed.
- Complete Dashboard tenancy/security surface: 10 suites, 46 tests passed.
- Relevant Academics tenancy regression (subject allocations, teacher allocation workflows, timetable/dashboard workflows, curriculum, lesson plans, and lesson-plan workflows): 6 suites, 34 tests passed.
- `npx prisma validate`: passed; the schema is valid.
- `npx prisma generate`: passed; Prisma Client 6.19.3 generated successfully.
- `npm run build`: passed on the independent final run.
- `npx tsc -p tsconfig.build.json --noEmit`: passed on the independent final run.
- `git diff --check`: passed.

An initial E2E fixture run exposed the repository's existing curriculum-scope uniqueness constraint. The deterministic fixture was corrected to use three valid subject scopes, stale rows from the aborted test setup were removed by the test-data marker, and the complete final E2E and security runs passed. A combined Prisma/build/TypeScript shell wrapper later timed out while waiting for `nest build`; the build and TypeScript commands were rerun independently and both exited successfully.

## No-change declarations and controlled limitations

- Prisma schema: unchanged.
- Migrations: unchanged.
- Seeds and permissions: unchanged.
- Dependencies and lockfiles: unchanged.
- Routes: unchanged.
- Workflows, configuration, and environment files: unchanged.
- Staging, commits, pushes, merges, branches, and pull requests: none.

Controlled limitations:

- Teacher coverage measures persisted allocation coverage, not workforce availability; Membership status is intentionally outside this sprint.
- All four charts are request-time current categories, not historical series.
- Structure readiness still requires a product-owned formula.
- Subject allocation coverage still requires an authoritative expected-requirement model.
- The teacher-coverage SQL must remain aligned with the Academics allocation-validation denominator as that domain evolves.

Next sprint: `DASHBOARD-ANALYTICS-GRADES-HOMEWORK-2E`.

DASHBOARD-ANALYTICS-ACADEMICS-2D: READY FOR CODE AUDIT
