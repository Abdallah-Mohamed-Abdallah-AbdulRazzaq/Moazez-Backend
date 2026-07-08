# Sprint Academics Subjects Catalog Allocation Contract 1A Closeout

## Sprint Name

ACADEMICS-SUBJECTS-CATALOG-ALLOCATION-CONTRACT-1A

## Baseline Commit

- Expected baseline: `e84b1615 test: finalize school support chat acceptance`
- Observed baseline before changes: `e84b1615 test: finalize school support chat acceptance`
- Initial working tree: clean

## Files Changed

- `src/modules/academics/subjects/dto/subject.dto.ts`
- `src/modules/academics/subjects/dto/subject-response.dto.ts`
- `src/modules/academics/subjects/presenters/subjects.presenter.ts`
- `src/modules/academics/subjects/tests/subjects.use-case.spec.ts`
- `src/modules/academics/subject-allocation/controller/subject-allocation.controller.ts`
- `test/e2e/academics-subject-allocations.e2e-spec.ts`
- `test/security/tenancy.academics-subject-allocations.spec.ts`
- `docs/sprint-22a-academics-remaining-gaps-contract-audit.md`
- `docs/sprint-academics-subjects-catalog-allocation-contract-1a-closeout.md`

## Schema Changes

None.

## Migration Changes

None.

## Seed Changes

None.

## Route Changes

None. Existing paths and methods are preserved:

- `GET /api/v1/academics/subjects`
- `POST /api/v1/academics/subjects`
- `PATCH /api/v1/academics/subjects/:id`
- `DELETE /api/v1/academics/subjects/:id`
- `GET /api/v1/academics/subject-allocations`
- `PUT /api/v1/academics/subject-allocations/bulk`

## Runtime Contract Changes

- `CreateSubjectDto` no longer accepts `termId`.
- `CreateSubjectDto` no longer accepts `stage`.
- `UpdateSubjectDto` inherits the corrected catalog-only shape.
- `SubjectResponseDto` no longer returns `termId`.
- `SubjectResponseDto` no longer returns `stage`.
- `presentSubject` no longer hardcodes `termId: null` or `stage: null`.
- `POST /api/v1/academics/subjects` rejects `termId` and `stage` as non-whitelisted fields.
- `PATCH /api/v1/academics/subjects/:id` rejects `termId` and `stage` as non-whitelisted fields.
- `GET /api/v1/academics/subjects?termId=...` remains catalog-only; it does not become an allocation read endpoint.
- `GET/PUT /api/v1/academics/subject-allocations` now use `academics.structure.view/manage`, matching the dashboard allocation matrix permission pattern used by teacher allocation. This prevents app roles with `academics.subjects.view` from reading the dashboard allocation matrix.

## Subject Catalog Behavior

- `/academics/subjects` is catalog-only.
- `Subject` does not represent a term subject.
- `Subject` does not store `termId`.
- `Subject` does not store `stage`.
- Subject catalog responses include only `id`, `name`, `nameAr`, `nameEn`, `code`, `color`, and `isActive`.
- Subject catalog responses must not expose `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, `createdAt`, `updatedAt`, or Prisma internals.

## Subject Allocation Behavior

- `/academics/subject-allocations` is the source of truth for term/grade subject assignment.
- `SubjectAllocation` stores `academicYearId`, `termId`, `gradeId`, `subjectId`, and `weeklyHours`.
- Reads use `GET /api/v1/academics/subject-allocations?termId=...&gradeId=...`.
- Writes use `PUT /api/v1/academics/subject-allocations/bulk`.
- `stage` is not an allocation key.
- `gradeId` is the allocation key.
- Timetable validation relies on allocation data, especially the subject-allocation weekly-hours row, not catalog-only `Subject`.

## Frontend Integration Guidance

Frontend should not send `termId` or `stage` to `/api/v1/academics/subjects`.

To assign a subject to a term/grade:

1. `POST /api/v1/academics/subjects`
2. `PUT /api/v1/academics/subject-allocations/bulk`
3. `GET /api/v1/academics/subject-allocations?termId=...&gradeId=...`

If the UI selects a stage, resolve that stage to its grades, then bulk allocate one row per `gradeId`.

Do not implement or call an `apply-to-stage` shortcut for this sprint.

## Important Frontend Contract Notes

- `/academics/subjects` is catalog-only.
- `Subject` does not represent a term subject.
- `/academics/subjects` does not accept `termId` or `stage`.
- `/academics/subjects` does not filter by `termId`.
- `/academics/subject-allocations` is the source of truth for term/grade subject assignment.
- `stage` is not an allocation key; `gradeId` is the allocation key.
- Safe whole-stage flow: `stageId -> list grades in the stage -> bulk allocate each gradeId`.

## Tests Added/Updated

- Updated subject use-case tests to assert catalog responses do not contain `termId`, `stage`, or internal fields.
- Updated subject-allocation e2e tests to cover:
  - `POST /academics/subjects` rejects `termId`.
  - `POST /academics/subjects` rejects `stage`.
  - `PATCH /academics/subjects/:id` rejects `termId`.
  - `PATCH /academics/subjects/:id` rejects `stage`.
  - Catalog subject create still works without `termId` or `stage`.
  - Catalog subject list remains catalog-only, even with `termId` query input.
  - Create subject -> bulk allocate -> read allocation flow.
  - No catalog response leakage of internal or allocation fields.
- Updated subject-allocation security tests to cover:
  - Catalog reads are school-scoped and catalog-only.
  - Soft-deleted and cross-school subjects are excluded.
  - Allocation matrix routes require dashboard structure permissions.
  - Teacher, student, and parent app roles do not receive allocation matrix permissions by default.

## Verification Commands

Passed:

- `git status --short --untracked-files=all` before changes: clean
- `git log --oneline -15` before changes: HEAD `e84b1615`
- `npx prisma validate` before changes
- `npx prisma validate` after changes
- `npx prisma generate`
- `npm run seed`
- `npm run build`
- `npx tsc -p tsconfig.build.json --noEmit`
- `npx jest --runInBand src/modules/academics/subjects/tests/subjects.use-case.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/academics-subject-allocations.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.academics-subject-allocations.spec.ts`

Additional regression attempted:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/academics-final-completion.e2e-spec.ts`

Result: failed on unrelated app-facing teacher routes returning `403` because `test/helpers/app-facing-calendar-test-utils.ts` creates custom fixture roles without assigning the permissions required by the guarded Teacher App routes. This was not changed in this sprint because fixing that shared helper would alter broader app/dashboard permission assumptions outside the subject catalog/allocation contract.

## Known Issues

- `test/e2e/academics-final-completion.e2e-spec.ts` currently fails outside this sprint's changed contract surface due the shared app-facing calendar fixture role lacking permissions for guarded Teacher App routes.
- No schema, migration, seed, package, route, timetable, or teacher-allocation model changes were made.

## Final Verdict

READY FOR REVIEW for the subject catalog/allocation contract cleanup.
