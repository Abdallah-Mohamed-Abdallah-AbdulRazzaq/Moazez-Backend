# Sprint 26D Student Task Submission Closeout

## 1. Executive Decision

| Item | Decision |
| --- | --- |
| Sprint 26D decision | PASS |
| Runtime summary | Added the Student App Reinforcement task-stage submission route. The route resolves the authenticated student's visible assignment from `taskId`, validates the `stageId`, validates optional proof text/file payloads, validates proof file ownership for current-student uploads, delegates submission to core Reinforcement, and returns the refreshed Student App-safe submission presenter. |
| Student Task Submission status after this sprint | STUDENT_TASK_SUBMISSION_READY |
| Recommended next sprint | Sprint 26E - Student Hero Actions |

No Parent App, Teacher App, Student Hero, Student Rewards, wallet, finance, marketplace, deployment, `package.json`, Prisma schema, migration, `src/main.ts`, realtime gateway, or ADR files were changed. No commit was made.

## 2. Files Changed

### Student Tasks

- `src/modules/student-app/student-app.module.ts`
- `src/modules/student-app/tasks/application/submit-student-task-stage.use-case.ts`
- `src/modules/student-app/tasks/controller/student-tasks.controller.ts`
- `src/modules/student-app/tasks/dto/student-tasks.dto.ts`
- `src/modules/student-app/tasks/infrastructure/student-tasks-read.adapter.ts`

### Reinforcement core if touched

- `src/modules/reinforcement/reviews/reviews.module.ts`

The only core touch was exporting the existing `SubmitReinforcementStageUseCase` so Student App can delegate to the source-of-truth submission flow.

### Files/proofs

- No Files module runtime files were changed.
- Student proof file validation uses the existing scoped Prisma model data through the Student task adapter and selects safe metadata only.

### Tests

- `src/modules/student-app/tasks/tests/student-tasks-read.adapter.spec.ts`
- `src/modules/student-app/tasks/tests/student-tasks.presenter.spec.ts`
- `src/modules/student-app/tasks/tests/student-tasks.use-case.spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`

### Docs

- `docs/sprint-26d-student-task-submission-closeout.md`

## 3. Route Inventory

Final Student Task routes:

- `GET /api/v1/student/tasks`
- `GET /api/v1/student/tasks/summary`
- `GET /api/v1/student/tasks/:taskId`
- `GET /api/v1/student/tasks/:taskId/submissions`
- `GET /api/v1/student/tasks/:taskId/submissions/:submissionId`
- `POST /api/v1/student/tasks/:taskId/stages/:stageId/submit`

## 4. Contract Decisions Verified

| Decision | Result | Evidence |
| --- | --- | --- |
| Student App delegates to Reinforcement core. | PASS | `SubmitStudentTaskStageUseCase` calls core `SubmitReinforcementStageUseCase`; Student App does not create an independent submission state machine. |
| Student App resolves assignment internally. | PASS | Route accepts `taskId` and `stageId` only; use-case resolves `assignment.id` through `StudentTasksReadAdapter.findTask` scoped to current student context. |
| Student cannot submit another student's task. | PASS | Read adapter scopes by `studentId`, `enrollmentId`, academic year, and term; unit and tenancy tests cover unowned task rejection. |
| Student cannot submit unassigned task. | PASS | Missing visible assignment returns safe `not_found` before core submission is called. |
| Student cannot submit cancelled task. | PASS | Student task reads exclude cancelled task/assignment state by default and the submit use-case has an explicit cancelled-state guard before delegation. |
| `proofText` / `proofFileId` are validated. | PASS | DTO trims and bounds `proofText`, validates `proofFileId` as UUID, rejects non-whitelisted identity/status fields through global validation, and requires `proofFileId` for file-backed core proof types. |
| Proof files are safe metadata only. | PASS | File validation selects id, original name, mime type, size, visibility, and createdAt only; presenter response exposes id/name/mime/size only. |
| No XP grant on submission. | PASS | Student submit use-case has no XP dependency; tenancy test asserts `xpLedger` count is unchanged after submission. |
| Behavior points are not XP. | PASS | Student task submission does not query or write `BehaviorPointLedger`; tests assert no behavior point ledger side effect. |
| No reward redemption on submission. | PASS | Student task submission does not touch Rewards; tenancy test asserts `rewardRedemption` count is unchanged after submission. |
| No internal fields leaked. | PASS | Presenter/security tests assert no tenant ids, actor ids, storage internals, signed URLs, or unsafe storage URL terms in Student task submission responses. |

## 5. File / Proof Decision

| Item | Decision |
| --- | --- |
| `proofFileId` submission | Implemented. |
| Ownership validation model | The proof file must be scoped to the current organization and school, uploaded by the current student user, private, and not soft-deleted under the scoped Prisma client. If any check fails, Student App returns safe `not_found` before core submission. |
| Download/reference model | Student task submission responses return safe file metadata only. They do not return raw signed URLs or direct storage URLs. No new download reference field was added. Existing `/api/v1/files/:id/download` remains the Files module route for authorized downloads. |
| Deferred file ownership limitations | None for V1 submission. Shared/non-owner proof-file authorization is intentionally not supported here because there is no broader approved Files ownership policy for Student proof reuse. |

## 6. Security / No-Leak Review

| Forbidden field | Status |
| --- | --- |
| `schoolId` | Absent from Student task submission responses. |
| `organizationId` | Absent from Student task submission responses. |
| `membershipId` | Absent from Student task submission responses. |
| `roleId` | Absent from Student task submission responses. |
| `deletedAt` | Absent from Student task submission responses. |
| `submittedById` | Absent from Student task submission responses; used internally by core submission/audit only. |
| `reviewedById` | Absent from Student task submission responses. |
| `bucket` | Absent from Student proof file responses. |
| `objectKey` | Absent from Student proof file responses. |
| raw metadata | Absent from Student proof file responses. |
| `signedUrl` | Absent from Student proof file responses. |
| unsafe storage URL | Absent from Student proof file responses. |
| XP ledger internals | Absent; submission does not return or create XP ledger data. |
| BehaviorPointLedger-derived XP | Absent; Behavior points are not queried or converted to XP. |
| teacher/admin-only notes | Absent from Student submission responses. |

Existing Student task read cards still include the previously shipped app-facing `assignmentId` / `assignment_id` fields. Sprint 26D did not add assignment ownership fields to the new submission response.

## 7. Tests Run

| Command | Result |
| --- | --- |
| `npm test -- --runInBand student-tasks` | PASS - 3 suites, 14 tests. |
| `npm test -- --runInBand student-app` | PASS - 45 suites, 201 tests. |
| `npm test -- --runInBand reinforcement` | PASS - 35 suites, 270 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` | Initial run FAIL - test expectations still assumed one pending task and used an invalid DTO body for the new route in a generic non-student loop. Runtime route fix was not required. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` | PASS after test expectation correction - 1 suite, 21 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/reinforcement-foundation.e2e-spec.ts` | PASS - 1 suite, 1 test. |
| `npx prisma validate` | PASS - Prisma schema is valid. |
| `npx prisma generate` | PASS - Prisma Client v6.19.3 generated successfully. |
| `npm run build` | Initial 120s run timed out while still running; reruns with a longer timeout PASS - Nest build completed. |
| `git status --short --untracked-files=all` | PASS - expected Sprint 26D tracked changes plus untracked `docs/sprint-26d-student-task-submission-closeout.md` and `src/modules/student-app/tasks/application/submit-student-task-stage.use-case.ts`. Git emitted the pre-existing user config ignore permission warning. |
| `git diff --name-only` | PASS - tracked Sprint 26D runtime/test files only; untracked new files appear in `git status` until staged. |
| `git diff --stat` | PASS - tracked diff only: 10 files changed, 519 insertions, 5 deletions. Untracked new files are not included by `git diff` until staged. |
| `git diff --check` | PASS - exit code 0, no whitespace errors. Git emitted line-ending warnings for tracked files. |

## 8. Deferred Items

Only items outside this sprint remain:

- Student Hero actions
- Student rewards/redemptions
- Parent Hero/XP/Rewards reads
- Parent task mutations
- Dashboard final handoff
- Full frontend contract handoff
- Teacher manual XP bonus route, still deferred pending explicit Teacher App permission/product policy approval

## 9. Final Verdict

Sprint 26D: PASS if criteria are met.
Next: Sprint 26E — Student Hero Actions.
