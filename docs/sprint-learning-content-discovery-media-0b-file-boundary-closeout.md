# Learning Content Discovery and Media 0B — File Boundary Closeout

## Phase result

- Phase: `LEARNING-CONTENT-DISCOVERY-AND-MEDIA-0B`
- Result: COMPLETE
- Baseline: `5d2ad0d83d2acff92a3ae96bec245320bea88e37`
- Branch: `fix/learning-content-media-0b-file-boundary`
- Scope: generic File download authorization and generic multipart pre-buffer size enforcement only
- Commit, push, and pull request: not performed

The final independent-review correction changed one production line only after the newly required exact-boundary multipart test proved a real defect: the installed Multer/Busboy stack rejects a file when its byte count reaches the configured `fileSize` value. The correction therefore moved the transport trigger to the application maximum plus one byte while leaving the effective application maximum unchanged.

## Changed files

Production:

- `src/modules/files/uploads/controller/uploads.controller.ts`
- `src/modules/files/uploads/application/get-file-download-url.use-case.ts`
- `src/modules/files/uploads/filters/files-upload-multer-exception.filter.ts`

Tests:

- `src/modules/files/uploads/tests/uploads.controller.spec.ts`
- `src/modules/files/uploads/tests/files-upload-multer-exception.filter.spec.ts`
- `src/modules/files/uploads/tests/get-file-download-url.use-case.spec.ts`
- `test/security/tenancy.files-generic-download-boundary.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`

Evidence:

- `docs/sprint-learning-content-discovery-media-0b-file-boundary-closeout.md`

No common auth, permission, seed, Prisma schema, migration, package, storage-service, queue, or relation-route production file changed.

## Pre-fix reproduction

The focused tests were added before production changes and run against the baseline implementation:

```text
npx jest --runInBand --runTestsByPath src/modules/files/uploads/tests/uploads.controller.spec.ts src/modules/files/uploads/tests/get-file-download-url.use-case.spec.ts
```

Expected red outcome: 2 suites failed; 4 tests failed and 2 control tests passed. Aggregate-safe failures proved:

- generic download had no `SchoolManagementOnly` handler metadata;
- a maximum-plus-one multipart file reached the mocked upload use case and returned the normal success response;
- generic missing-File details contained the attempted File ID.

No token, request body, File ID, storage key, bucket, or signed URL was retained as evidence.

## Root cause

The generic download route required only `files.downloads.view`; its scoped repository lookup proved school and soft-delete scope but no domain relation. App-facing actors with that permission could therefore reach File lookup.

The generic multipart interceptor limited file count but not file bytes. The 10 MiB check existed only after Nest/Multer had materialized the in-memory Buffer.

The generic missing-File exception explicitly attached the attempted ID as details.

The installed Nest platform adapter converts Multer's `LIMIT_FILE_SIZE` error to a `PayloadTooLargeException` before route filters execute and drops the Multer code. A route-local interceptor now restores that code only for Nest's exact transformed file-size exception. Direct positive and negative observable tests prove that an unrelated 413, the domain size exception, and an unrelated error are rethrown unchanged. The route-local filter continues to map only `exception.code === 'LIMIT_FILE_SIZE'`; it rethrows every unrelated exception unchanged.

The independent-review exact-boundary test also proved that the installed Multer/Busboy path emits its size-limit condition when the stream reaches the configured `fileSize`, not only after it exceeds that value.

## Implemented correction

### Generic route

`GET /api/v1/files/:id/download` now carries method-only `SchoolManagementOnly` metadata and retains `files.downloads.view`. `POST /api/v1/files` has no management-only metadata and retains `files.uploads.manage`.

School and organization management actors still require a selected School membership plus permission. Student, Parent, Teacher, Applicant, Platform, and other app actor classes fail with 403 before `FilesRepository.findScopedFileById` is called. Management lookup of a missing, deleted, or cross-School File returns `files.not_found`/404 without details or the attempted ID.

Successful generic download behavior is unchanged: HTTP 307, attachment disposition based on the stored original name, scoped repository lookup, and a 300-second signed URL.

### Multipart interceptor boundary

The generic POST configures one file and sets Multer's exclusive transport trigger to `FILES_UPLOAD_MAX_SIZE_BYTES + 1`. The exact 10 MiB application maximum reaches `UploadFileUseCase.execute` once and returns HTTP 201. A maximum-plus-one request reaches the transport trigger, returns the stable `files.upload.size_exceeded`/413 envelope, and never reaches the use case. The envelope contains only `maxSizeBytes: 10485760` and a preserved or generated trace ID.

No actual size, original name, MIME type, Multer internals, stack, or request payload is included or logged by the route filter.

The independent in-memory size check in `UploadFileUseCase` remains unchanged as defense in depth and continues to prevent storage and metadata writes.

### Relation-scoped routes

Student, Teacher, and Parent communication attachment downloads, Parent linked-child proof download, Applicant document download, homework assignment/submission attachment flows, and reinforcement proof/task flows remain on their existing relation and ownership paths. No relation controller, permission metadata, ownership check, signing behavior, or production route changed.

The Parent security regression assertion was updated only because generic download now fails at the actor-class gate instead of reporting a missing permission. Its dedicated linked-child route remains successful.

## Test and validation evidence

### Focused and defense-in-depth

```text
npx jest --runInBand --runTestsByPath src/modules/files/uploads/tests/uploads.controller.spec.ts src/modules/files/uploads/tests/files-upload-multer-exception.filter.spec.ts src/modules/files/uploads/tests/get-file-download-url.use-case.spec.ts
```

Result: 3 suites passed; 10/10 tests passed.

```text
npx jest --runInBand --runTestsByPath src/modules/files/uploads/tests/uploads.controller.spec.ts src/modules/files/uploads/tests/files-upload-multer-exception.filter.spec.ts src/modules/files/uploads/tests/get-file-download-url.use-case.spec.ts src/modules/files/uploads/tests/upload-file.use-case.spec.ts
```

The independent-review correction first ran these four suites with the new direct interceptor and exact-boundary tests against the prior implementation. The exact 10 MiB case failed with 413 while the other 22/23 tests passed, proving the transport-boundary defect before the one-line production correction.

Final correction result: 4 suites passed; 23/23 tests passed. This includes four direct interceptor positive/negative cases, exact 10 MiB acceptance, 10 MiB + 1 rejection before use-case execution, and the unchanged use-case maximum-size defense.

### Generic authorization security

```text
npx jest --config ./test/jest-e2e.json --runInBand --runTestsByPath test/security/tenancy.files-generic-download-boundary.spec.ts
```

Result: 1 suite passed; 7/7 tests passed. The test uses disposable database fixtures, mocks object signing, proves management convention success, proves all app/platform denials occur before File lookup, and proves safe cross-School/deleted/missing 404 responses.

The final independent-review correction did not rerun this database-backed suite. The previously approved disposable stack had already been removed with zero residue; the correction prohibited disposable database/Redis/MinIO setup, and the only configured local database was the persistent development database. The previously valid targeted result remains unchanged.

### Relation-focused unit regressions

```text
npx jest --runInBand --runTestsByPath src/modules/files/uploads/tests/upload-file.use-case.spec.ts src/modules/communication/tests/communication-message-attachment.use-case.spec.ts src/modules/student-app/messages/tests/student-messages.use-case.spec.ts src/modules/teacher-app/messages/tests/teacher-messages.use-case.spec.ts src/modules/parent-app/messages/tests/parent-messages.use-case.spec.ts src/modules/parent-app/files/tests/parent-files.use-case.spec.ts src/modules/parent-app/files/tests/parent-files-read.adapter.spec.ts src/modules/applicant-portal/tests/applicant-portal-documents.spec.ts src/modules/homework/tests/homework-questions-attachments.use-case.spec.ts src/modules/homework/tests/homework-answers-attachments.use-case.spec.ts src/modules/student-app/tasks/tests/student-tasks.use-case.spec.ts src/modules/student-app/tasks/tests/student-tasks-read.adapter.spec.ts src/modules/teacher-app/tasks/tests/teacher-tasks.presenter.spec.ts src/modules/parent-app/tasks/tests/parent-tasks.presenter.spec.ts
```

Result: 14 suites passed; 133/133 tests passed.

### Existing Files and School A/B regressions

```text
npx jest --config ./test/jest-e2e.json --runInBand --runTestsByPath test/e2e/files-upload-download.e2e-spec.ts test/e2e/files-attachments-preview.e2e-spec.ts test/security/tenancy.files.spec.ts
```

Result: 3 suites passed; 10/10 tests passed, including 8/8 School A/B security checks.

### Applicant relation download regressions

```text
npx jest --config ./test/jest-e2e.json --runInBand --runTestsByPath test/e2e/applicant-portal-document-download.e2e-spec.ts test/security/tenancy.applicant-portal-document-download.spec.ts
```

Result: 2 suites passed; 10/10 tests passed.

### App, homework, and reinforcement E2E regressions

```text
npx jest --config ./test/jest-e2e.json --runInBand --runTestsByPath test/e2e/student-app-final-closeout.e2e-spec.ts test/e2e/teacher-app-final-closeout.e2e-spec.ts test/e2e/parent-app-final-closeout.e2e-spec.ts test/e2e/homework-questions-attachments-foundation.e2e-spec.ts test/e2e/homework-answers-attachments-foundation.e2e-spec.ts test/e2e/reinforcement-foundation.e2e-spec.ts
```

Result: 6 suites passed; 48/48 tests passed.

### App, homework, and reinforcement security regressions

```text
npx jest --config ./test/jest-e2e.json --runInBand --runTestsByPath test/security/tenancy.student-app.spec.ts test/security/tenancy.teacher-app.spec.ts test/security/tenancy.parent-app.spec.ts test/security/tenancy.homework-questions-attachments.spec.ts test/security/tenancy.homework-answers-attachments.spec.ts test/security/tenancy.reinforcement.spec.ts
```

Initial result after the runtime correction: 179/180 passed; the sole failure was the stale Parent generic-route missing-permission-details assertion. After updating it to the actor-gate contract, the exact rerun passed 6 suites and 180/180 tests.

Final post-format targeted security rerun:

```text
npx jest --config ./test/jest-e2e.json --runInBand --runTestsByPath test/security/tenancy.files-generic-download-boundary.spec.ts test/security/tenancy.parent-app.spec.ts
```

Result: 2 suites passed; 37/37 tests passed.

During final independent review, `test/security/tenancy.parent-app.spec.ts` was restored from the baseline and only the generic-download actor-gate assertion was reapplied. Its final diff has exactly one semantic hunk and zero unrelated formatting changes. The 37/37 targeted result above remains the valid result; it was not rerun because no authorized disposable database environment remained.

### Migration, Prisma, and build

```text
npm run test:migration-governance
```

Result: PASS, 39/39 tests.

```text
npm run db:migrations:check
```

Result: PASS; base remained `origin/main`, five active migrations, zero new migrations, and rebaseline off.

```text
npx prisma validate
npx prisma generate
```

Result: PASS and PASS. The Prisma schema is unchanged.

```text
npm run build
```

The first build identified one TypeScript narrowing signature in the new route-local adapter. After converting the guard to an explicit type predicate, the exact rerun passed.

### ESLint and formatting

Standard ESLint on the seven new/production-focused TypeScript files passed with zero errors and zero warnings. A targeted baseline comparison for `test/security/tenancy.parent-app.spec.ts`, excluding only its pre-existing whole-file Prettier drift, reports 125 errors and 3 warnings for the narrow corrected file versus 127 errors and 3 warnings at baseline. The assertion introduces no lint debt and reduces the baseline error count by two; no lint suppression or unrelated unsafe-code rewrite was added.

```text
npx prettier --write src/modules/files/uploads/application/get-file-download-url.use-case.ts src/modules/files/uploads/controller/uploads.controller.ts src/modules/files/uploads/filters/files-upload-multer-exception.filter.ts src/modules/files/uploads/tests/files-upload-multer-exception.filter.spec.ts src/modules/files/uploads/tests/get-file-download-url.use-case.spec.ts src/modules/files/uploads/tests/uploads.controller.spec.ts test/security/tenancy.files-generic-download-boundary.spec.ts docs/sprint-learning-content-discovery-media-0b-file-boundary-closeout.md
npx prettier --check src/modules/files/uploads/application/get-file-download-url.use-case.ts src/modules/files/uploads/controller/uploads.controller.ts src/modules/files/uploads/filters/files-upload-multer-exception.filter.ts src/modules/files/uploads/tests/files-upload-multer-exception.filter.spec.ts src/modules/files/uploads/tests/get-file-download-url.use-case.spec.ts src/modules/files/uploads/tests/uploads.controller.spec.ts test/security/tenancy.files-generic-download-boundary.spec.ts docs/sprint-learning-content-discovery-media-0b-file-boundary-closeout.md
```

Result: PASS for all eight scoped files. Prettier write was intentionally not run on `test/security/tenancy.parent-app.spec.ts` because the baseline file contains pre-existing whole-file formatting drift; avoiding that write keeps its final diff to the single required semantic hunk.

```text
git diff --check
git status --short
git diff --cached --name-only
```

Result: PASS; nine changed files, zero staged files, and no cached diff. Git reported only the repository's line-ending conversion notices, not a whitespace error.

## Disposable database and storage evidence

A dedicated ephemeral PostgreSQL container/database, Redis container, and MinIO container were created only for this phase. All five current migrations were deployed and the normal seed was applied inside that disposable database before database-backed tests.

Tests used only synthetic temporary users, memberships, schools, organizations, roles, Files, and isolated object storage. The generic authorization security test mocked signing and made no storage call. The existing storage-backed suites used only the disposable MinIO instance.

After all suites and final reruns:

- aggregate temporary database residue query: 0;
- aggregate stored-object residue query: 0;
- disposable PostgreSQL, Redis, and MinIO containers: removed;
- database residue after teardown: 0;
- storage residue after teardown: 0.

No persistent development database or shared/live object storage was mutated.

## Scope exclusions and next phase

This phase did not implement or change lesson discovery, publication, upload sessions, direct object-store upload, media probing, playback, video limits, permissions, Role seeds, Prisma models, migrations, relation-scoped attachment contracts, storage-service behavior, or queues.

Phase 1A remains unauthorized until this 0B phase receives independent review and merge. Phase 1B and later remain unauthorized.
