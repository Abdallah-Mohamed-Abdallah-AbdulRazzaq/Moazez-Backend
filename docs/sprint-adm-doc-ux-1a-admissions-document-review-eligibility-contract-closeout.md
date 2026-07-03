# ADM-DOC-UX-1A - Admissions Document Review Eligibility Contract Closeout

## Sprint name

ADM-DOC-UX-1A - Admissions Document Review Eligibility Contract.

## Baseline commit

- Expected baseline: `64f5c531 fix: remove teacher profile role id leak`
- Actual starting HEAD: `64f5c531 fix: remove teacher profile role id leak`
- Initial worktree: clean

## Files changed

- `src/modules/admissions/documents/dto/application-document.dto.ts`
- `src/modules/admissions/documents/presenters/application-document.presenter.ts`
- `src/modules/admissions/documents/infrastructure/application-documents.repository.ts`
- `src/modules/admissions/documents/application/create-application-document.use-case.ts`
- `src/modules/admissions/documents/application/review-application-document.use-case.ts`
- `src/modules/admissions/documents/tests/application-document-review.use-case.spec.ts`
- `test/e2e/applicant-portal-document-review.e2e-spec.ts`
- `test/security/tenancy.applicant-portal-document-review.spec.ts`
- `docs/sprint-adm-doc-ux-1a-admissions-document-review-eligibility-contract-closeout.md`

## Current bug confirmed

The existing school-side `ApplicationDocumentResponseDto` exposed only the document status and safe file metadata. It did not expose whether a `pending_review` document was actually reviewable under the backend review gates.

The review use-case already required all of these gates:

- application status is `SUBMITTED`, `DOCUMENTS_PENDING`, or `UNDER_REVIEW`
- `ApplicationDocument.status` is `PENDING_REVIEW`
- an active linked `ApplicantAdmissionRequestDocument` exists
- linked applicant document status is `UPLOADED`

## Contract fields added

`ApplicationDocumentResponseDto` now includes:

- `source: 'staff_upload' | 'applicant_portal'`
- `canReview: boolean`
- `reviewEligibility`
- `linkedApplicantDocument`

The presenter remains the single public mapper for these fields.

## Eligibility reason precedence

The presenter applies deterministic precedence:

1. `application_status_not_reviewable`
2. `document_not_pending_review`
3. `not_applicant_portal_document`
4. `applicant_document_not_uploaded`
5. `reviewable`

`canAccept`, `canReject`, and `canRequestReplacement` all equal `canReview` in this sprint.

## Staff-uploaded pending_review decision

`pending_review` is reserved for Applicant Portal bridged documents.

School-side `POST /api/v1/admissions/applications/:applicationId/documents` now rejects `status: 'pending_review'` with `ValidationDomainException` and details:

```json
{
  "field": "status",
  "reason": "pending_review_reserved_for_applicant_portal"
}
```

Omitted status still defaults to `complete`. `complete` and `missing` remain valid staff-created document statuses.

## Review response behavior

Review action responses now include enriched eligibility fields:

- Accept returns `status: 'complete'`, `source: 'applicant_portal'`, linked applicant document status `accepted`, `canReview: false`, and reason `document_not_pending_review`.
- Reject returns `status: 'missing'`, linked applicant document status `rejected`, `canReview: false`, and reason `document_not_pending_review`.
- Request replacement returns `status: 'missing'`, linked applicant document status `needs_replacement`, `canReview: false`, and reason `document_not_pending_review`.
- Pending bridged uploaded documents on reviewable applications return `canReview: true` and reason `reviewable`.
- If application status becomes non-reviewable, reason precedence returns `application_status_not_reviewable`.

## No-leak verification

School-side responses expose only the approved linked applicant document diagnostic fields:

- `linkedApplicantDocument.id`
- `linkedApplicantDocument.status`

Tests verify the new responses do not expose:

- `applicantUserId`
- `requestId`
- `requiredDocumentId`
- `schoolId`
- `organizationId`
- `bucket`
- `objectKey`
- `provider`
- signed URL fields
- raw Prisma enum names

## Applicant Portal boundary verification

ADR-0003 remains unchanged and binding:

- Applicant accounts remain `UserType.APPLICANT`.
- Applicant accounts remain membershipless before acceptance.
- Applicant accounts are not Parent accounts.
- Applicant Portal did not gain school-side Admissions routes.
- No global guard, permission, or Prisma school-scope behavior changed.
- No applicant-to-parent conversion, Student, Guardian, StudentGuardian, Enrollment, or membership creation was added.

Applicant Portal document response shape was not changed. Optional regression `test/e2e/applicant-portal-documents.e2e-spec.ts` passed.

## Tests run

- `git status --short --untracked-files=all` - passed, clean before edits
- `git log --oneline -10` - confirmed `64f5c531` at HEAD before edits
- `npx prisma validate` - passed before edits
- `npx prisma validate` - passed after edits
- `npm run build` - passed
- `npx jest --runInBand src/modules/admissions/documents/tests/application-document-review.use-case.spec.ts` - passed, 13 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/applicant-portal-document-review.e2e-spec.ts` - passed, 6 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.applicant-portal-document-review.spec.ts` - passed, 5 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts` - passed, 7 tests

## Optional tests run/skipped

Run:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/applicant-portal-documents.e2e-spec.ts` - passed, 7 tests

Skipped:

- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts`

## Known follow-ups

- STU-GUARD-ROUTE-1A canonical guardians route collision fix
- ADM-DOC-UX-1B application document counters / dashboard summary fields
- ADM-WORKFLOW-POLICY-1A optional tests/interviews workflow policy

## Final verdict

READY FOR REVIEW
