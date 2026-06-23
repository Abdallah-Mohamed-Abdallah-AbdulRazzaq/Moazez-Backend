# Sprint 23I - Grades Assessment Mixed Delivery Mode Contract Repair Closeout

## Baseline

- Baseline commit: `8eb2660`
- Baseline message: `feat: add communication push preferences`
- Sprint type: Bugfix / contract repair / tests / closeout documentation

## Bug Summary

The dashboard Grades assessment contract had drifted after question-based assessment support was completed for accepted V1 scope.

- `POST /api/v1/grades/assessments/question-based` could create `QUESTION_BASED` assessments.
- Question authoring, publish validation, submissions, review, approve, and sync were already supported.
- `GET /api/v1/grades/assessments/:assessmentId` still rejected `QUESTION_BASED`.
- `GET /api/v1/grades/assessments` still forced `deliveryMode: SCORE_ONLY`.
- Score-only guards could still emit stale Sprint 4B deferral wording.

## Confirmed Root Cause

- `GetGradeAssessmentUseCase` called `assertScoreOnlyAssessment` after loading the record.
- `GradesAssessmentsRepository.buildListWhere` hardcoded `deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY`.
- `assertAssessmentMutableForCrud` and `assertLockableAssessment` started with score-only assertions.
- `assertScoreOnlyDeliveryMode` used a Sprint 4B deferral message even though question-based assessment workflows are now supported through their dedicated routes.

## Files Changed

- `src/modules/grades/assessments/application/delete-grade-assessment.use-case.ts`
- `src/modules/grades/assessments/application/get-grade-assessment.use-case.ts`
- `src/modules/grades/assessments/application/grade-assessment-use-case.helpers.ts`
- `src/modules/grades/assessments/domain/grade-assessment-domain.ts`
- `src/modules/grades/assessments/domain/grade-item-entry-domain.ts`
- `src/modules/grades/assessments/dto/grade-assessment.dto.ts`
- `src/modules/grades/assessments/infrastructure/grades-assessments.repository.ts`
- `src/modules/grades/assessments/tests/grade-assessment-items.use-case.spec.ts`
- `src/modules/grades/assessments/tests/grade-assessments.use-case.spec.ts`
- `src/modules/grades/grades-context.ts`
- `src/modules/grades/shared/domain/grade-workflow.ts`
- `src/modules/grades/shared/tests/grade-workflow.spec.ts`
- `test/e2e/grades-question-based.e2e-spec.ts`
- `docs/sprint-23i-grades-assessment-mixed-delivery-mode-contract-repair-closeout.md`

## Schema, Migration, Package, Generated Changes

- Schema changes: none
- Migration changes: none
- Package changes: none
- Lockfile changes: none
- Generated code changes: none expected from source edits

## Implemented Policies

### GET Detail

- `GET /api/v1/grades/assessments/:assessmentId` now returns the existing `GradeAssessmentResponseDto` presenter shape for both `SCORE_ONLY` and `QUESTION_BASED`.
- Missing assessments still throw `NotFoundDomainException`.
- Detail response does not include questions, options, answer keys, correct answers, or submission internals.

### GET List Delivery Mode

- `ListGradeAssessmentsQueryDto` now accepts optional `deliveryMode`.
- Accepted values include `score_only`, `SCORE_ONLY`, `question_based`, and `QUESTION_BASED`.
- Default list no longer forces score-only and now includes both delivery modes according to existing scope and soft-delete filtering.
- `deliveryMode` is applied only when provided.

### PATCH

- Draft, unlocked, writable-term `SCORE_ONLY` and `QUESTION_BASED` assessments can be patched through the existing CRUD endpoint.
- `PUBLISHED`, `APPROVED`, locked, closed/inactive-term, and protected-change cases remain blocked.
- `UpdateGradeAssessmentDto` does not accept `deliveryMode`.
- Patch payloads never write `deliveryMode`, so conversion between score-only and question-based remains impossible.

### DELETE

- Draft, unlocked, writable-term `SCORE_ONLY` and `QUESTION_BASED` assessments can be soft-deleted when no grade items and no submissions exist.
- Delete remains blocked for `PUBLISHED`, `APPROVED`, locked, closed/inactive-term, grade-item, and submission cases.
- Question child-content policy: draft question-based assessment delete soft-deletes only the parent assessment. Existing child questions are not hard-deleted and become inaccessible through normal parent-loaded question routes.
- Deletion is blocked when submissions exist with `reason: submissions_exist`.

### LOCK

- Approved, unlocked, writable-term `SCORE_ONLY` and `QUESTION_BASED` assessments can be locked.
- `DRAFT`, `PUBLISHED`, already locked, and closed/inactive-term cases remain blocked.
- Audit behavior is preserved.

### Direct Item Entry

- Direct GradeItem entry remains score-only only.
- `PUT /api/v1/grades/assessments/:assessmentId/items/:studentId` rejects `QUESTION_BASED`.
- `PUT /api/v1/grades/assessments/:assessmentId/items` rejects `QUESTION_BASED`.
- Error message is now `Direct grade item entry is only supported for score-only assessments`.
- Error details include `deliveryMode` and `reason: question_based_uses_submissions_review_sync`.

### General Create Route

- `POST /api/v1/grades/assessments` remains score-only.
- Omitting `deliveryMode` still creates `SCORE_ONLY`.
- Providing `SCORE_ONLY` still creates `SCORE_ONLY`.
- Providing `QUESTION_BASED` rejects with `Use the question-based assessment creation endpoint for question-based assessments`.
- Error details include `field: deliveryMode`, `deliveryMode`, and `expectedEndpoint: /api/v1/grades/assessments/question-based`.
- `POST /api/v1/grades/assessments/question-based` remains the only question-based creation route.

### Publish And Approve Regression

- Score-only publish remains on the existing validation path.
- Question-based publish continues to use question validation and question summary audit metadata.
- Question-based approve remains supported.
- No answer-key or correct-answer exposure was added.

## Stale Sprint 4B Message Cleanup

- Removed the stale Sprint 4B deferral wording from runtime score-only guards.
- Score-only assertion helpers now accept context-specific messages and details.
- Remaining score-only-only reachable paths have current messages for general create and direct GradeItem entry.

## Tests Added Or Updated

- `grade-assessments.use-case.spec.ts`
  - Score-only create with omitted and explicit delivery mode.
  - Question-based create rejection message/details on the general create route.
  - List default includes both delivery modes.
  - List filters normalize `score_only` and `question_based`.
  - Detail returns score-only and question-based assessment presenter shapes.
  - Missing detail returns not found.
  - Draft question-based PATCH succeeds and preserves delivery mode.
  - Published/approved/locked question-based PATCH fails.
  - Approved question-based LOCK succeeds.
  - Draft/published/already locked question-based LOCK fails.
  - Draft question-based DELETE succeeds under the chosen child-content policy.
  - Question-based DELETE with submissions fails.
  - Published/approved/locked question-based DELETE fails.
- `grade-assessment-items.use-case.spec.ts`
  - Single and bulk direct GradeItem writes reject question-based assessments with current message/details.
- `grade-workflow.spec.ts`
  - Shared score-only assertion now validates the current generic fallback message.
- `grades-question-based.e2e-spec.ts`
  - Question-based dashboard detail route works.
  - Default dashboard list includes question-based assessment.
  - `deliveryMode=question_based` includes it.
  - `deliveryMode=score_only` excludes it.
  - Detail response does not include question/answer-key fields.

## Verification Results

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS - expected modified grades files and untracked closeout doc |
| `git diff --name-only` | PASS - tracked diff limited to grades assessment runtime/tests and question-based E2E |
| `git diff --stat` | PASS - tracked diff was 13 files, 573 insertions, 22 deletions before this untracked doc was added |
| `git diff --check` | PASS - no whitespace errors; Windows line-ending warnings only |
| `npx prisma validate` | PASS - schema is valid |
| `npx prisma generate` | PASS - Prisma Client v6.19.3 generated to `node_modules/@prisma/client` |
| `npm run build` | PASS after cleanup - initial 120s command timeout left stale build processes; first rerun failed with `ENOTEMPTY` while cleaning `dist`; stopped the stale `npm run build` / `nest build` processes, removed workspace `dist`, and reran successfully |
| `npm run test -- grade-assessments --runInBand` | PASS - 1 suite, 65 tests |
| `npm run test -- grade-assessment-items --runInBand` | PASS - 1 suite, 20 tests |
| `npm run test -- grades --runInBand` | PASS - 32 suites, 267 tests |
| `npm run test -- student-app --runInBand` | PASS - 50 suites, 243 tests |
| `npm run test -- parent-app --runInBand` | PASS - 50 suites, 206 tests |
| `npm run test -- teacher-app --runInBand` | PASS - 47 suites, 273 tests |
| `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/grades-question-based.e2e-spec.ts` | PASS - 1 suite, 1 test |
| `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.grades.spec.ts test/security/tenancy.student-app.spec.ts test/security/tenancy.parent-app.spec.ts test/security/tenancy.teacher-app.spec.ts` | PASS - 4 suites, 199 tests |
| `npm run test:security -- --runInBand` | PASS - 49 suites, 807 tests |

## Final Verdict

`GRADES_ASSESSMENT_MIXED_DELIVERY_MODE_REPAIR_COMPLETE`
