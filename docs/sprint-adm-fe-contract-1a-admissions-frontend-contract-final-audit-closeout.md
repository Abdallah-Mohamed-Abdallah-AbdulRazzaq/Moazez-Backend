# ADM-FE-CONTRACT-1A Admissions Frontend Contract Final Audit Closeout

## Sprint name

ADM-FE-CONTRACT-1A - Admissions Frontend Contract Final Audit

## Baseline commit

Baseline confirmed at:

```text
73ebe9d8 feat: add admissions dashboard action state
```

Pre-edit checks:

- `git status --short --untracked-files=all`: clean
- `git log --oneline -10`: HEAD matched expected baseline
- `npx prisma validate`: passed

## Files changed

- `docs/admissions-frontend-contract.md`
- `docs/sprint-adm-fe-contract-1a-admissions-frontend-contract-final-audit-closeout.md`
- `test/e2e/admissions-frontend-contract.e2e-spec.ts`
- `src/modules/admissions/applications/dto/application.dto.ts`
- `src/modules/admissions/applications/dto/application-dashboard-state.dto.ts`
- `src/modules/admissions/documents/dto/application-document.dto.ts`
- `src/modules/admissions/workflow-policy/dto/admission-workflow-policy.dto.ts`

The production DTO file changes are Swagger/OpenAPI metadata only. No route, permission, presenter, use-case, repository, schema, seed, or Applicant Portal production behavior was changed.

## Contracts audited

Audited frontend-facing contracts:

- `GET /api/v1/admissions/applications`
- `GET /api/v1/admissions/applications/:id`
- `GET /api/v1/admissions/applications/:applicationId/documents`
- `POST /api/v1/admissions/applications/:applicationId/documents`
- document review action responses
- `GET /api/v1/admissions/workflow-policy`
- `PATCH /api/v1/admissions/workflow-policy`
- `GET /api/v1/students-guardians/guardians?search=...`
- legacy `GET /api/v1/students-guardians/students/guardians?search=...`

## Frontend handoff document path

Created:

```text
docs/admissions-frontend-contract.md
```

The handoff document includes exact frontend route changes, TypeScript-style response shapes, permission expectations, no-leak notes, compatibility notes, and future deprecation guidance.

## Application list/detail contract result

`GET /api/v1/admissions/applications` and `GET /api/v1/admissions/applications/:id` return the school-side `ApplicationResponseDto` with:

- existing application fields preserved
- `registrationState`
- `documentsSummary`
- `dashboardState`

The focused E2E verifies list and detail both expose the summary/action fields and that tenant B applications are hidden from tenant A.

## documentsSummary result

Verified contract fields:

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

The focused E2E verifies:

- no-document applications return all zero counts and false booleans
- mixed staff/applicant documents count correctly
- `dashboardState.documentSignals` mirrors `documentsSummary`

Regression `test/e2e/admissions-application-document-summary.e2e-spec.ts` also passed.

## dashboardState result

Verified contract fields:

- `canProceedToDecision`
- `canRegister`
- `registrationState`
- `decisionState`
- `workflowReadiness`
- `documentSignals`
- `blockers`

The focused E2E verifies default strict policy readiness, patched optional policy readiness, and document signal mirroring.

Regression `test/e2e/admissions-dashboard-state.e2e-spec.ts` also passed.

## Document review contract result

Verified school-side document responses include:

- `source`
- `canReview`
- `reviewEligibility`
- `linkedApplicantDocument`

The focused E2E verifies a staff-uploaded complete document is `source=staff_upload` and non-reviewable, while an Applicant Portal bridged `pending_review` uploaded document is `source=applicant_portal` and reviewable.

The test also verifies staff upload with `status=pending_review` returns `validation.failed` with:

```json
{
  "field": "status",
  "reason": "pending_review_reserved_for_applicant_portal"
}
```

Regression `test/e2e/applicant-portal-document-review.e2e-spec.ts` also passed.

## Workflow policy contract result

Verified workflow policy response shape:

```ts
{
  requiresPlacementTest: boolean;
  requiresInterview: boolean;
  allowDirectAcceptance: boolean;
  source: 'default' | 'school_override';
  updatedAt: string | null;
}
```

The focused E2E verifies the default strict policy and a school override created by PATCH. The patched policy is reflected in subsequent application `dashboardState.workflowReadiness`.

Regression `test/e2e/admissions-workflow-policy.e2e-spec.ts` also passed.

## Guardians route contract result

Verified canonical route:

```http
GET /api/v1/students-guardians/guardians?search=fda
```

Verified legacy compatibility route:

```http
GET /api/v1/students-guardians/students/guardians?search=fda
```

The focused E2E verifies both return Guardians list responses and the legacy route does not return `validation.failed` from `students/:studentId` UUID parsing.

Regression `test/e2e/students-guardians-guardians-routes.e2e-spec.ts` also passed.

## Swagger/OpenAPI audit result

Runtime Swagger generation initially produced empty schemas for the audited response DTOs:

- `ApplicationResponseDto`
- `ApplicationDocumentResponseDto`
- `AdmissionWorkflowPolicyResponseDto`

This sprint added Swagger decorators to the allowed DTO files only:

- `src/modules/admissions/applications/dto/application.dto.ts`
- `src/modules/admissions/applications/dto/application-dashboard-state.dto.ts`
- `src/modules/admissions/documents/dto/application-document.dto.ts`
- `src/modules/admissions/workflow-policy/dto/admission-workflow-policy.dto.ts`

The focused E2E now asserts generated Swagger schemas include the additive fields:

- `ApplicationResponseDto.documentsSummary`
- `ApplicationResponseDto.dashboardState`
- `ApplicationDocumentResponseDto.source`
- `ApplicationDocumentResponseDto.canReview`
- `ApplicationDocumentResponseDto.reviewEligibility`
- `ApplicationDocumentResponseDto.linkedApplicantDocument`
- `AdmissionWorkflowPolicyResponseDto` policy fields

No business logic changed.

## No-leak verification

The focused E2E asserts the audited response areas do not leak:

- `schoolId`
- `organizationId`
- `applicantUserId`
- `requestId`
- `requiredDocumentId`
- `deletedAt`
- storage bucket/object/provider/signed URL fields
- password/role/membership internals
- raw Prisma enum names

Existing regressions for document review, document summary, dashboard state, workflow policy, admissions tenancy, and applicant document review security also passed.

Allowed existing public fields remain unchanged, including `ApplicationDocumentResponse.fileId` and `linkedApplicantDocument.id`.

## Tenancy/security verification

The focused E2E verifies:

- school A cannot see school B application list/detail records
- applicant users cannot access school-side admissions application routes
- applicant users cannot access school-side admissions document routes

Security regressions passed:

- `test/security/tenancy.admissions.spec.ts`
- `test/security/tenancy.applicant-portal-document-review.spec.ts`
- `test/security/tenancy.spec.ts`

## Applicant Portal boundary verification

No Applicant Portal production files were changed.

Applicant Portal architecture remains unchanged:

- Applicant accounts remain `UserType.APPLICANT`
- Applicant accounts remain membershipless before acceptance
- Applicant accounts are not Parent accounts
- Applicant Portal responses do not expose school-side document bridge internals
- No applicant-to-parent conversion was added
- No Student, Guardian, StudentGuardian, or Enrollment creation path was added through Applicant Portal

## Commands run

Pre-edit:

```powershell
git status --short --untracked-files=all
git log --oneline -10
npx prisma validate
```

Post-edit:

```powershell
npx prisma validate
npm run build
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-frontend-contract.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-dashboard-state.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-workflow-policy.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-application-document-summary.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/applicant-portal-document-review.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/students-guardians-guardians-routes.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.applicant-portal-document-review.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts
```

All listed post-edit commands passed.

Build note: one initial `npm run build` attempt timed out, leaving stale `npm run build` / `nest build` Node processes and a partially cleaned `dist` directory. Those stale processes were stopped, generated `dist` output was removed after verifying it resolved inside the workspace, and `npm run build` passed on rerun.

## Optional tests run/skipped

No broader optional parent/student app regressions were run in this audit. The required focused, Admissions, Applicant Portal document review, Guardians route, and baseline tenancy regressions passed.

## Known follow-ups

- Frontend should adopt `docs/admissions-frontend-contract.md` as the Admissions Dashboard handoff reference.
- Frontend should migrate Guardians search to `GET /api/v1/students-guardians/guardians`.
- Legacy `/students-guardians/students/guardians` can be deprecated in a future API version only after frontend migration.
- Admissions dashboard can later add richer action explanations if product confirms additional semantics.
- Optional tests/interviews workflow policy can be extended later if new workflow step types are added.

## Final verdict

READY FOR REVIEW
