# Sprint 27A — Parent-authorized File Download Contract Closeout

## 1. Executive Decision

- Sprint 27A decision: PASS
- Status: PARENT_AUTHORIZED_FILE_DOWNLOAD_READY
- Baseline: b0d8cd9 docs: lock learning flow backlog for file downloads
- Runtime summary: Implemented a narrow Parent App download contract for linked-parent access to child reinforcement task proof files. Parent task proof metadata now exposes a backend-only `downloadPath`.
- Schema/migration needed: No.
- Recommended next phase: Phase 2 — Learning Flow Remaining Deferred Decision Doc.

## 2. Reality Audit

- Existing Files module/download route found: `GET /api/v1/files/:id/download`.
- Existing generic route behavior: `UploadsController` redirects with HTTP 307 to a short-lived signed URL through `GetFileDownloadUrlUseCase`.
- Existing storage service behavior: `StorageService.createDownloadUrl` delegates to signed URL generation for S3-compatible object storage. Existing download use cases use a 5 minute expiry.
- Existing file authorization pattern: generic Files download requires `files.downloads.view` and scoped file lookup. It does not prove Parent App child ownership or learning-surface attachment.
- Existing app-specific download pattern found: Applicant Portal document download uses a narrow app route with ownership checks before redirecting.
- Chosen implementation strategy: Added a narrow Parent App route rather than broadening the generic Files route.
- E2E storage strategy: Parent App e2e/security fixtures create real test objects with `StorageService.saveObject` for manually inserted file rows, matching existing Files module test patterns and ensuring MinIO buckets exist before signed redirects are asserted.
- Why it is safe: The route first validates an active Parent App actor and linked current-school child through `ParentAppAccessService`, then verifies the requested file is the proof file of a visible reinforcement submission for that same child and enrollment. Arbitrary file IDs and wrong-child proof files never reach storage signing.

## 3. Final Route / Contract

- Route: `GET /api/v1/parent/children/:studentId/files/:fileId/download`
- Required params: `studentId`, `fileId`.
- Who can call: authenticated Parent App actors with an active current-school linked child relationship.
- Authorization checks:
  - Parent actor must be valid for Parent App.
  - Requested child must be owned by the parent in current school context.
  - File must be referenced by a reinforcement submission for that child.
  - Submission must belong to the child enrollment and an active, non-cancelled assignment/task.
  - File must not be soft-deleted.
- Success behavior: HTTP 307 redirect to a short-lived storage download URL.
- Error/hidden behavior: non-parent actors receive 403 through Parent App actor checks; unlinked/cross-school children receive safe 404 semantics; arbitrary or wrong-child file IDs receive `files.not_found`.
- `downloadPath` added to Parent task proof metadata: Yes.
- `downloadPath` proof: it is `/api/v1/parent/children/:studentId/files/:fileId/download`, a backend route path only. No storage host, bucket, object key, or signed URL is returned in task JSON.

## 4. Authorization Matrix

| Scenario | Expected result | Evidence |
| --- | --- | --- |
| linked parent + own child + child proof file | 307 redirect | Unit tests, `test/security/tenancy.parent-app.spec.ts`, and `test/e2e/parent-app-final-closeout.e2e-spec.ts` passed |
| linked parent + same-school unlinked child | 404 | Unit tests, security e2e, and parent final closeout e2e passed |
| linked parent + cross-school child | 404 | Unit tests, security e2e, and parent final closeout e2e passed |
| linked parent + arbitrary fileId | 404 `files.not_found` | `parent-files.use-case.spec.ts` passed |
| linked parent + other child's file | 404 `files.not_found` | Unit tests, security e2e, and parent final closeout e2e passed |
| non-parent actor | 403 | Unit tests, security e2e, and parent final closeout e2e passed |
| student actor trying Parent route | 403 | security e2e and parent final closeout e2e passed |
| teacher/admin actor trying Parent route | 403 | security e2e and parent final closeout e2e passed |
| deleted/inactive/unsupported file | 404 | `parent-files-read.adapter.spec.ts` passed for deleted proof file |
| storage internals leak check | No leak in app JSON | `parent-tasks.presenter.spec.ts`, `parent-app`, and `parent-tasks` passed |

## 5. Response Safety

- No `signedUrl` in JSON responses.
- No `objectKey`.
- No `bucket`.
- No `storageKey`.
- No raw metadata.
- No `uploaderId`, `submittedById`, or `reviewedById`.
- No tenant ids.
- Safe metadata only:
  - `fileId`
  - `filename` / `originalName`
  - `mimeType`
  - `size` / `sizeBytes`
  - `visibility`
  - `createdAt`
  - `downloadPath`

## 6. Files Changed

- Files/storage module:
  - No generic Files route changes.
  - No storage service changes.
- Parent App runtime:
  - `src/modules/parent-app/files/controller/parent-files.controller.ts`
  - `src/modules/parent-app/files/application/get-parent-child-file-download-url.use-case.ts`
  - `src/modules/parent-app/files/infrastructure/parent-files-read.adapter.ts`
  - `src/modules/parent-app/parent-app.module.ts`
  - `src/modules/parent-app/tasks/dto/parent-tasks.dto.ts`
  - `src/modules/parent-app/tasks/presenters/parent-tasks.presenter.ts`
- Parent App tests:
  - `src/modules/parent-app/files/tests/parent-files.use-case.spec.ts`
  - `src/modules/parent-app/files/tests/parent-files-read.adapter.spec.ts`
  - `src/modules/parent-app/tasks/tests/parent-tasks.presenter.spec.ts`
- Security/e2e tests:
  - `test/security/tenancy.parent-app.spec.ts`
  - `test/e2e/parent-app-final-closeout.e2e-spec.ts`
- Docs:
  - `docs/sprint-27a-parent-authorized-file-download-contract-closeout.md`
- Schema/migration:
  - None.

## 7. Deferred Items

- Parent download for non-task proof surfaces remains deferred.
- Parent upload remains forbidden.
- Parent task/homework submit remains deferred.
- Parent reward/Hero/XP mutations remain deferred.
- OpenAPI/Swagger alignment remains deferred to end of project.
- Frontend SDK/client generation remains deferred.

## 8. Tests Run

| Command | Result |
| --- | --- |
| `npm test -- --runInBand parent-files` | PASS — 2 suites, 9 tests |
| `npm test -- --runInBand parent-tasks` | PASS — 3 suites, 7 tests |
| `npx prisma validate` | PASS |
| `npx prisma generate` | PASS |
| `npm run build` | PASS |
| `npm test -- --runInBand parent-app` | PASS — 48 suites, 180 tests |
| `npm test -- --runInBand files` | PASS — 8 suites, 22 tests |
| `npm test -- --runInBand student-app` | PASS — 48 suites, 218 tests |
| `npm test -- --runInBand student-tasks` | PASS — 3 suites, 14 tests |
| `npm test -- --runInBand reinforcement` | PASS — 35 suites, 270 tests |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` | PASS — 1 suite, 21 tests |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` | PASS — 1 suite, 23 tests |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-final-closeout.e2e-spec.ts` | PASS — 1 suite, 18 tests |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts` | PASS — 1 suite, 17 tests |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/reinforcement-foundation.e2e-spec.ts` | PASS — 1 suite, 1 test |

## 9. Final Verdict

Sprint 27A: PASS if criteria are met.
Next: Phase 2 — Learning Flow Remaining Deferred Decision Doc.
