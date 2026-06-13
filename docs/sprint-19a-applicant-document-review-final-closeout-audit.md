# Sprint 19A - Applicant Admissions Document Review Final Closeout Audit

## 1. Purpose and Scope

This is the Sprint 19A finalization and closeout audit for the backend-native Applicant Admissions Document Review foundation.

This finalization task changes only:

- `package.json`
- `docs/sprint-19a-applicant-document-review-final-closeout-audit.md`

No runtime, schema, migration, test, deployment, generated Prisma client, source-code, CORS, server, `.env`, `README.md`, `Moazez-Project-Structure.json`, dependency, or devDependency changes are authorized by this audit.

## 2. Baseline

Current expected commit:

- `cb3b0c7 feat: add applicant document review workflow`

Previous Sprint 19A contract audit:

- `docs/sprint-19a-applicant-document-review-contract-audit.md`

Sprint 19A depends on the Sprint 18M and Sprint 18N Applicant Portal document bridge foundation:

- Sprint 18M bridged submitted Applicant Portal documents to school-scoped Admissions `ApplicationDocument` records as `PENDING_REVIEW`.
- Sprint 18N closed the Applicant Portal V1 foundation and documented that school users could see submitted applicant documents, but no school review workflow existed yet.

## 3. ADR Interpretation

ADR-0003 remains authoritative for the applicant boundary:

- Applicants remain `UserType.APPLICANT`.
- Applicants remain membershipless before acceptance.
- Applicant accounts are not Parent accounts.
- Applicant Portal access remains route-local through applicant-specific access checks.
- Existing school-created Parent and Guardian flows remain valid.
- Global guards were not weakened.
- Prisma `schoolScope` was not weakened.
- Applicant conversion remains deferred.

Sprint 19A did not change applicant identity, applicant membership, global guard behavior, `PermissionsGuard`, `ScopeResolverGuard`, Prisma `schoolScope`, or applicant-to-parent conversion rules.

## 4. Implemented Runtime Surface

Sprint 19A added three school-side review routes under the existing Admissions documents surface:

- `POST /api/v1/admissions/applications/:applicationId/documents/:documentId/accept`
- `POST /api/v1/admissions/applications/:applicationId/documents/:documentId/reject`
- `POST /api/v1/admissions/applications/:applicationId/documents/:documentId/request-replacement`

These routes live under the existing Admissions application documents controller and use the existing `admissions.documents.manage` permission.

No broad generic applicant upload route, generic school upload route, conversion route, notification route, physical purge route, or advanced Admissions workflow route was added.

## 5. Final Lifecycle Matrix

| Scenario | Final behavior | Schema impact |
| --- | --- | --- |
| Accept | `ApplicationDocument.PENDING_REVIEW -> COMPLETE`; linked applicant document `UPLOADED -> ACCEPTED`. | No new enum or schema required. |
| Reject | `ApplicationDocument.PENDING_REVIEW -> MISSING`; linked applicant document `UPLOADED -> REJECTED`. Replacement is not opened by reject alone. | No new enum or schema required. |
| Request replacement | `ApplicationDocument.PENDING_REVIEW -> MISSING`; linked applicant document `UPLOADED -> NEEDS_REPLACEMENT`; linked application is reopened to `DOCUMENTS_PENDING`. | No new enum or schema required. |
| Applicant replacement after request | Old applicant document `NEEDS_REPLACEMENT -> SUPERSEDED`; new applicant document is created as `UPLOADED`. | No new enum or schema required. |
| Replacement re-bridge | New applicant document is bridged to a new school `ApplicationDocument` with `PENDING_REVIEW`. | No new enum or schema required. |
| Repeated submit | Reuses the existing linked Admissions application and does not duplicate already bridged documents. | No new enum or schema required. |
| Admissions application creation | Replacement upload does not create a new Admissions `Application`. | No new enum or schema required. |

Existing statuses were sufficient:

- `AdmissionDocumentStatus.PENDING_REVIEW`
- `AdmissionDocumentStatus.COMPLETE`
- `AdmissionDocumentStatus.MISSING`
- `ApplicantAdmissionRequestDocumentStatus.UPLOADED`
- `ApplicantAdmissionRequestDocumentStatus.NEEDS_REPLACEMENT`
- `ApplicantAdmissionRequestDocumentStatus.ACCEPTED`
- `ApplicantAdmissionRequestDocumentStatus.REJECTED`
- `ApplicantAdmissionRequestDocumentStatus.SUPERSEDED`

## 6. Applicant Replacement After Request Behavior

Replacement after submission is allowed only after a school-side request replacement action.

Final rules:

- Authenticated applicant must own the request and document.
- Submitted and bridged applicant document replacement is allowed only when the applicant document status is `NEEDS_REPLACEMENT`.
- The linked application must be in document-collection-compatible state, specifically `DOCUMENTS_PENDING`.
- Arbitrary replacement of bridged `UPLOADED`, `ACCEPTED`, `REJECTED`, or `SUPERSEDED` documents remains denied.
- Replacement remains append-only.
- The old file and old school `ApplicationDocument` are retained.
- A new private file, new applicant document, and new school `ApplicationDocument` are created.
- Applicant-facing responses continue hiding internal bridge ids, including `applicationId` and `applicationDocumentId`.
- Applicant-facing responses continue hiding bucket, object key, and signed URLs outside authorized download redirects.

## 7. Application and Request Status Behavior

Request replacement reopens document collection by setting the linked Admissions application to `DOCUMENTS_PENDING`.

Existing Applicant Portal request presentation maps `DOCUMENTS_PENDING` to applicant-facing `needs_action`. Existing document presentation keeps applicant responses safe and hides internal bridge ids.

Sprint 19A does not trigger:

- Advanced Admissions decision workflow.
- Automatic acceptance.
- Applicant conversion.
- Student creation.
- Guardian creation.
- Enrollment creation.
- Parent App activation.
- Notifications, email, or SMS delivery.

## 8. Security and Tenancy Posture

Sprint 19A preserves the required security posture:

- School A cannot review School B documents.
- Review routes require active school scope.
- Review routes require `admissions.documents.manage`.
- Applicants cannot call school Admissions review routes.
- Parent, student, teacher, and view-only actors without manage permission are denied.
- School users cannot use Applicant Portal routes.
- Applicant replacement remains applicant-owned.
- Cross-applicant replacement guessing remains not found.
- Generic Files download remains unavailable to applicants.
- Non-download responses do not expose raw bucket, object key, or signed URL data.
- No platform bypass was added.
- No global guard weakening was introduced.
- No `schoolScope` weakening was introduced.
- No applicant school or organization membership is created.
- No conversion or operational identity side effects occur.

## 9. Audit Logging Posture

Sprint 19A added explicit school-side review audit actions:

- `admissions.document.accept`
- `admissions.document.reject`
- `admissions.document.request_replacement`

Audit metadata is id-based and status-based. Safe metadata includes:

- `applicationId`
- `applicationDocumentId`
- `applicantDocumentId`
- `fileId`
- `requiredDocumentId`
- previous and next school document statuses
- previous and next applicant document statuses
- application status before and after
- `reasonProvided`

Audit payloads do not log:

- note or reason text
- signed URLs
- buckets
- object keys
- raw file content
- passwords
- tokens
- excessive applicant or child PII

## 10. Test Coverage

Sprint 19A added or updated coverage in:

- `src/modules/admissions/documents/tests/application-document-review.use-case.spec.ts`
- `src/modules/applicant-portal/tests/applicant-portal-documents.spec.ts`
- `test/e2e/applicant-portal-document-review.e2e-spec.ts`
- `test/security/tenancy.applicant-portal-document-review.spec.ts`
- Existing Applicant Portal E2E route inventory specs

Observed verification before Sprint 19A finalization:

- `npm run test -- admissions --runInBand`: 8 suites / 26 tests passed.
- `npm run test -- applicant-portal --runInBand`: 5 suites / 66 tests passed.
- `test/e2e/applicant-portal-document-review.e2e-spec.ts`: 5 tests passed.
- `test/security/tenancy.applicant-portal-document-review.spec.ts`: 5 tests passed.
- `npm run verify:sprint18m`: passed.
- Full serial E2E: 51 suites / 203 tests passed.
- Full serial security: 38 suites / 729 tests passed.

## 11. Package Verification Scripts

Sprint 19A now has reusable verification scripts:

- `test:e2e:sprint19a`
- `verify:sprint19a`

`test:e2e:sprint19a` runs the Sprint 19A document review E2E spec:

```bash
jest --config ./test/jest-e2e.json --runInBand test/e2e/applicant-portal-document-review.e2e-spec.ts
```

`verify:sprint19a` builds on `verify:sprint18m` and then reruns the Sprint 19A-focused checks:

- Prisma validation.
- Prisma client generation.
- Build.
- Admissions module tests.
- Applicant Portal module tests.
- Sprint 19A review security spec.
- Sprint 19A review E2E spec.

## 12. Explicit Non-Goals and Remaining Deferred Work

Still deferred:

- Applicant-to-parent conversion.
- Student creation.
- Guardian creation.
- StudentGuardian creation.
- Enrollment creation.
- School membership creation.
- Organization membership creation.
- Parent App activation.
- Notifications, email, and SMS.
- Physical purge.
- Advanced Admissions workflow.
- Dashboard changes.
- Platform changes.
- Billing changes.
- Feature-enforcement changes.

These are future work items and are not blockers for Sprint 19A closeout.

## 13. Risks and Future Follow-Up

Known limitations and follow-up triggers:

- No reviewer metadata fields exist.
- No persistent rich review comments or review reasons model exists.
- Rejection or replacement reason text is not yet a communication or notification workflow.
- Applicant-visible review messaging needs a separate product/security contract if required.
- Future accepted applicant conversion requires a separate sprint and likely contract/ADR review.
- Future notifications need a separate notification/email sprint.
- Future physical purge or retention needs a separate storage policy sprint.
- Future current-vs-historical school document filtering may need explicit schema or presenter design if historical append-only documents become noisy for reviewers.

## 14. Final Closeout Decision

Sprint 19A is complete for the backend-native Applicant Admissions Document Review foundation.

It closes the Sprint 18M and Sprint 18N gap where applicant documents were visible to school Admissions as `pending_review` but were not reviewable.

The completed backend foundation supports:

- School-side accept.
- School-side reject.
- School-side request replacement.
- Applicant replacement after school-side request.
- Append-only replacement.
- Replacement re-bridge as a new `PENDING_REVIEW` school document.
- Safe audit logging.
- School-scoped and applicant-owned tenancy protections.

Conversion, notification, physical purge, and advanced workflow remain future work, not blockers for Sprint 19A closeout.
