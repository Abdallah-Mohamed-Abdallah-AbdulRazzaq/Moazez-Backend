# ADM-DOC-UX-1B - Application Document Counters / Dashboard Summary Fields

## Sprint name

ADM-DOC-UX-1B - Application Document Counters / Dashboard Summary Fields

## Baseline commit

Expected baseline: `7ab0b706 feat: add canonical guardians routes`

Actual baseline confirmed before edits: `7ab0b706 feat: add canonical guardians routes`

Initial worktree: clean

## Files changed

- `src/modules/admissions/applications/dto/application.dto.ts`
- `src/modules/admissions/applications/presenters/application.presenter.ts`
- `src/modules/admissions/applications/infrastructure/applications.repository.ts`
- `test/e2e/admissions-application-document-summary.e2e-spec.ts`
- `docs/sprint-adm-doc-ux-1b-application-document-counters-closeout.md`

No Admissions documents production files were modified.

## Current dashboard gap confirmed

ADM-DOC-UX-1A added per-document review eligibility, but school-side Admissions application list/detail responses did not include aggregate document counters. The dashboard therefore had to fetch documents separately or duplicate backend reviewability logic client-side.

## documentsSummary contract

`ApplicationResponseDto` now includes:

```ts
documentsSummary: {
  totalCount: number;
  completeCount: number;
  missingCount: number;
  pendingReviewCount: number;
  reviewableCount: number;
  applicantPortalCount: number;
  staffUploadCount: number;
  needsReplacementCount: number;
  hasPendingReview: boolean;
  hasReviewableDocuments: boolean;
  hasMissingDocuments: boolean;
}
```

The field is returned by:

- `GET /api/v1/admissions/applications`
- `GET /api/v1/admissions/applications/:id`

Create/update/submit responses use the same presenter and therefore also include the additive field.

## Counter definitions

- `totalCount`: count of school-side `ApplicationDocument` rows for the application.
- `completeCount`: `ApplicationDocument.status = COMPLETE`.
- `missingCount`: `ApplicationDocument.status = MISSING`.
- `pendingReviewCount`: `ApplicationDocument.status = PENDING_REVIEW`.
- `applicantPortalCount`: document rows with at least one non-deleted linked `ApplicantAdmissionRequestDocument`.
- `staffUploadCount`: `totalCount - applicantPortalCount`.
- `needsReplacementCount`: non-deleted linked applicant document rows with status `NEEDS_REPLACEMENT`.
- `hasPendingReview`: `pendingReviewCount > 0`.
- `hasReviewableDocuments`: `reviewableCount > 0`.
- `hasMissingDocuments`: `missingCount > 0 || needsReplacementCount > 0`.

`ApplicationDocument` has no `deletedAt`, so existing rows are counted. Linked applicant document rows are filtered to `deletedAt = null`.

## Reviewable count logic

`reviewableCount` mirrors ADM-DOC-UX-1A eligibility gates:

- application status is `SUBMITTED`, `DOCUMENTS_PENDING`, or `UNDER_REVIEW`
- school-side document status is `PENDING_REVIEW`
- a non-deleted linked applicant document exists
- the linked applicant document status is `UPLOADED`

Staff-uploaded documents are never counted as reviewable. Applicant documents with `ACCEPTED`, `REJECTED`, `NEEDS_REPLACEMENT`, or `SUPERSEDED` are not counted as reviewable.

For V1, summary reviewability uses the same active-link convention as ADM-DOC-UX-1A: non-deleted linked applicant records ordered by creation and id, with the first matching linked record used for reviewability. `needsReplacementCount` follows the sprint decision and counts all non-deleted linked applicant rows whose status is `NEEDS_REPLACEMENT`.

## Repository/query strategy

The application repository expands the existing `ApplicationRecord` select with minimal document summary data:

- application document `id`
- application document `applicationId`
- application document `status`
- linked non-deleted applicant document `id`
- linked applicant document `applicationDocumentId`
- linked applicant document `status`

This avoids a per-application query loop for list responses. The presenter computes and shapes the public `documentsSummary`; raw selected fields remain internal and are not exposed.

## No-leak verification

`documentsSummary` exposes only aggregate numbers and booleans. The focused E2E asserts no summary leak of:

- document ids
- application document ids
- applicant document ids
- applicant user ids
- request ids
- required document ids
- school or organization ids
- deleted timestamps
- file ids
- storage bucket/object key/provider/signed URL fields
- audit actor ids
- membership/role ids
- password hashes
- raw Prisma enum names

Application responses also do not expose a `documents` array.

## Tenancy/security verification

Focused E2E coverage verifies:

- application list requires `admissions.applications.view`
- application detail requires `admissions.applications.view`
- Applicant users cannot access school-side Admissions application responses
- School A list does not include School B application counters
- School A detail access to School B application remains `404`
- School B can see its own counters

Existing `test/security/tenancy.admissions.spec.ts` was also run and passed.

## Applicant Portal boundary verification

No Applicant Portal production code or response DTOs were changed. Applicant accounts remain `UserType.APPLICANT`, membershipless before acceptance, and separate from Parent/Student operational identities. This sprint does not implement applicant-to-parent conversion, does not add Student/Guardian/Enrollment creation, and does not weaken global guards or Prisma school scope.

Applicant document review regressions passed:

- `test/e2e/applicant-portal-document-review.e2e-spec.ts`
- `test/security/tenancy.applicant-portal-document-review.spec.ts`

## Commands run

Before edits:

- `git status --short --untracked-files=all` - clean
- `git log --oneline -10` - confirmed `7ab0b706` at HEAD
- `npx prisma validate` - passed

After edits:

- `npm run build` - passed after application code changes
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-application-document-summary.e2e-spec.ts` - passed, 6 tests
- `npx prisma validate` - passed
- `npm run build` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts` - passed, 7 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/applicant-portal-document-review.e2e-spec.ts` - passed, 6 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.applicant-portal-document-review.spec.ts` - passed, 5 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions.spec.ts` - passed, 36 tests

## Optional tests run/skipped

Run:

- `test/security/tenancy.admissions.spec.ts` because this sprint touches Admissions application list/detail responses.

Skipped:

- `test/e2e/applicant-portal-documents.e2e-spec.ts`
- `test/security/tenancy.students.spec.ts`

Those optional suites are not directly affected by an additive school-side Admissions application summary field.

## Known follow-ups

- Frontend should use `documentsSummary` for Admissions application cards/lists.
- Legacy guardians route can be deprecated only after frontend migration.
- ADM-WORKFLOW-POLICY-1A optional tests/interviews workflow policy.
- Admissions dashboard can later add `canProceedToDecision` / `canRegister` / `registrationState` expansion if product confirms semantics.

## Final verdict

READY FOR REVIEW
