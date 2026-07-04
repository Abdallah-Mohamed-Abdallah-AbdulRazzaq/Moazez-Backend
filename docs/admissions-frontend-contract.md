# Admissions Frontend Contract

This document captures the school-side Admissions API contract the frontend should use for application dashboards, document review, workflow policy, and Guardians lookup routing.

## 1. Overview

All routes are served under `/api/v1`.

The Admissions dashboard should treat the backend response as the source of truth for:

- document counters and document action badges
- decision readiness
- registration readiness
- workflow policy state
- per-document review eligibility

Do not derive review buttons from `document.status === 'pending_review'` alone. Use `document.canReview` and `document.reviewEligibility`.

## 2. Required Frontend Route Changes

Use the canonical Guardians route for guardian search:

```http
GET /api/v1/students-guardians/guardians?search=fda
```

Do not use the legacy route for new code:

```http
GET /api/v1/students-guardians/students/guardians?search=fda
```

The legacy route remains available for backward compatibility, but the frontend should migrate to the canonical route.

## 3. Admissions Applications List/Detail Contract

Application list:

```http
GET /api/v1/admissions/applications
```

Application detail:

```http
GET /api/v1/admissions/applications/:id
```

Both routes return the school-side `ApplicationResponseDto` shape. The existing fields remain unchanged and the response includes:

```ts
type ApplicationResponse = {
  id: string;
  leadId: string | null;
  studentName: string;
  requestedAcademicYearId: string | null;
  requestedGradeId: string | null;
  source: 'in_app' | 'referral' | 'walk_in' | 'other';
  status:
    | 'submitted'
    | 'documents_pending'
    | 'under_review'
    | 'accepted'
    | 'waitlisted'
    | 'rejected';
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  registrationState: {
    registered: boolean;
    studentId: string | null;
    enrollmentId: string | null;
    enrollmentStatus: string | null;
    registeredVia: 'admissions_application' | null;
    registeredAt: string | null;
    source: 'derived_from_student_application_id';
  };
  documentsSummary: ApplicationDocumentsSummary;
  dashboardState: ApplicationDashboardState;
};
```

`documentsSummary` and `dashboardState` are returned on each list item and on detail responses.

## 4. documentsSummary Contract

```ts
type ApplicationDocumentsSummary = {
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
};
```

Counter definitions:

- `totalCount`: non-deleted school-side `ApplicationDocument` rows for the application.
- `completeCount`: documents with status `complete`.
- `missingCount`: documents with status `missing`.
- `pendingReviewCount`: documents with status `pending_review`.
- `reviewableCount`: documents that pass the backend review gates.
- `applicantPortalCount`: school-side documents linked to Applicant Portal documents.
- `staffUploadCount`: `totalCount - applicantPortalCount`.
- `needsReplacementCount`: non-deleted linked applicant documents with status `needs_replacement`.

Boolean definitions:

- `hasPendingReview = pendingReviewCount > 0`
- `hasReviewableDocuments = reviewableCount > 0`
- `hasMissingDocuments = missingCount > 0 || needsReplacementCount > 0`

Reviewable count uses the same truth as document review:

- application status is `submitted`, `documents_pending`, or `under_review`
- school-side document status is `pending_review`
- a linked Applicant Portal document exists
- linked Applicant Portal document status is `uploaded`

## 5. dashboardState Contract

```ts
type ApplicationDashboardState = {
  canProceedToDecision: boolean;
  canRegister: boolean;
  registrationState:
    | 'not_applicable'
    | 'not_accepted'
    | 'decision_not_accept'
    | 'blocked_workflow_policy'
    | 'ready_to_register'
    | 'registered';
  decisionState: {
    canCreateDecision: boolean;
    canAccept: boolean;
    canWaitlist: boolean;
    canReject: boolean;
    reason:
      | 'ready'
      | 'already_decided'
      | 'application_status_not_decidable'
      | 'workflow_policy_not_satisfied'
      | 'direct_acceptance_not_allowed';
  };
  workflowReadiness: {
    policy: {
      requiresPlacementTest: boolean;
      requiresInterview: boolean;
      allowDirectAcceptance: boolean;
      source: 'default' | 'school_override';
    };
    placementTests: WorkflowStepReadiness;
    interviews: WorkflowStepReadiness;
  };
  documentSignals: {
    hasPendingReview: boolean;
    hasReviewableDocuments: boolean;
    hasMissingDocuments: boolean;
    pendingReviewCount: number;
    reviewableCount: number;
    missingCount: number;
    needsReplacementCount: number;
  };
  blockers: Array<{
    code:
      | 'already_decided'
      | 'application_status_not_decidable'
      | 'workflow_policy_not_satisfied'
      | 'direct_acceptance_not_allowed'
      | 'not_accepted'
      | 'decision_not_accept'
      | 'already_registered';
    message: string;
  }>;
};

type WorkflowStepReadiness = {
  required: boolean;
  total: number;
  completed: number;
  satisfied: boolean;
};
```

`dashboardState` is read-only for the frontend. It is computed from current application status, existing decision state, workflow policy, placement tests, interviews, registration derivation, and `documentsSummary`.

Use these fields for dashboard action buttons and badges instead of duplicating backend workflow logic in the frontend.

## 6. Admissions Document Review Contract

Document list:

```http
GET /api/v1/admissions/applications/:applicationId/documents
```

Create school-side document:

```http
POST /api/v1/admissions/applications/:applicationId/documents
```

Review actions:

```http
POST /api/v1/admissions/applications/:applicationId/documents/:documentId/accept
POST /api/v1/admissions/applications/:applicationId/documents/:documentId/reject
POST /api/v1/admissions/applications/:applicationId/documents/:documentId/request-replacement
```

Response shape:

```ts
type ApplicationDocumentResponse = {
  id: string;
  applicationId: string;
  fileId: string;
  documentType: string;
  status: 'complete' | 'missing' | 'pending_review';
  source: 'staff_upload' | 'applicant_portal';
  canReview: boolean;
  reviewEligibility: {
    canAccept: boolean;
    canReject: boolean;
    canRequestReplacement: boolean;
    reason:
      | 'reviewable'
      | 'application_status_not_reviewable'
      | 'document_not_pending_review'
      | 'not_applicant_portal_document'
      | 'applicant_document_not_uploaded';
  };
  linkedApplicantDocument: {
    id: string;
    status:
      | 'uploaded'
      | 'accepted'
      | 'rejected'
      | 'needs_replacement'
      | 'superseded';
  } | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: string;
    visibility: string;
  };
};
```

Review eligibility precedence:

1. `application_status_not_reviewable`
2. `document_not_pending_review`
3. `not_applicant_portal_document`
4. `applicant_document_not_uploaded`
5. `reviewable`

`canAccept`, `canReject`, and `canRequestReplacement` currently equal `canReview`.

Staff-created Admissions documents may use `complete`, `missing`, or omitted `status`. Omitted `status` defaults to `complete`. Staff-created documents must not set `pending_review`; the backend returns `validation.failed` with:

```json
{
  "field": "status",
  "reason": "pending_review_reserved_for_applicant_portal"
}
```

## 7. Admissions Workflow Policy Contract

Read effective school policy:

```http
GET /api/v1/admissions/workflow-policy
```

Update school policy override:

```http
PATCH /api/v1/admissions/workflow-policy
```

Response shape:

```ts
type AdmissionWorkflowPolicyResponse = {
  requiresPlacementTest: boolean;
  requiresInterview: boolean;
  allowDirectAcceptance: boolean;
  source: 'default' | 'school_override';
  updatedAt: string | null;
};
```

Default policy when no school override exists:

```json
{
  "requiresPlacementTest": true,
  "requiresInterview": true,
  "allowDirectAcceptance": false,
  "source": "default",
  "updatedAt": null
}
```

PATCH accepts at least one of:

```ts
{
  requiresPlacementTest?: boolean;
  requiresInterview?: boolean;
  allowDirectAcceptance?: boolean;
}
```

Changing policy affects subsequent `dashboardState.workflowReadiness` and decision readiness.

## 8. Guardians Canonical Search Route

Canonical route:

```http
GET /api/v1/students-guardians/guardians?search=fda
```

Legacy compatibility route:

```http
GET /api/v1/students-guardians/students/guardians?search=fda
```

The canonical route returns the normal Guardians list response and avoids the historic route collision with:

```http
GET /api/v1/students-guardians/students/:studentId
```

The dynamic student route still validates `:studentId` as a UUID.

## 9. Recommended Frontend Usage

Application cards/lists:

- Use `documentsSummary` for document count badges.
- Use `dashboardState.canProceedToDecision` and `dashboardState.decisionState` for decision buttons.
- Use `dashboardState.canRegister` and `dashboardState.registrationState` for registration actions.
- Use `dashboardState.documentSignals` for compact warning badges.

Application detail:

- Use `documentsSummary` for summary panels.
- Fetch documents only when rendering the document table or review drawer.
- Use each document's `canReview` to show or hide `Accept`, `Reject`, and `Request replacement`.
- Display `reviewEligibility.reason` when explaining why a review action is unavailable.

Workflow settings:

- Use `GET /admissions/workflow-policy` to load current policy.
- Use `PATCH /admissions/workflow-policy` to update policy.
- Refetch affected application list/detail responses after policy updates.

Guardians:

- Use `GET /students-guardians/guardians?search=...` for search and selection UIs.
- Keep legacy route support only for compatibility with older clients.

## 10. No-Leak Guarantees

The Admissions dashboard responses intentionally do not expose raw tenant, actor, storage, or audit internals through the new fields.

`documentsSummary` exposes only aggregate numbers and booleans. It does not expose document IDs, applicant document IDs, request IDs, tenant IDs, file IDs, storage keys, signed URLs, raw Prisma enum names, or audit internals.

`dashboardState` exposes only safe booleans, states, reasons, blocker codes/messages, policy booleans/source, workflow counts, and document signal counts.

School-side document responses may expose `linkedApplicantDocument.id` and `linkedApplicantDocument.status` for Admissions Dashboard diagnostics and UX. They do not expose applicant user IDs, request IDs, required document IDs, tenant IDs, storage keys, provider internals, or signed URLs.

Applicant Portal responses are unchanged and do not expose school-side bridge internals.

## 11. Permission Expectations

Admissions applications:

- `GET /api/v1/admissions/applications`: `admissions.applications.view`
- `GET /api/v1/admissions/applications/:id`: `admissions.applications.view`

Admissions documents:

- `GET /api/v1/admissions/applications/:applicationId/documents`: `admissions.documents.view`
- `POST /api/v1/admissions/applications/:applicationId/documents`: `admissions.documents.manage`
- review action routes: `admissions.documents.manage`

Workflow policy:

- `GET /api/v1/admissions/workflow-policy`: `admissions.applications.view`
- `PATCH /api/v1/admissions/workflow-policy`: `admissions.applications.manage`

Guardians:

- `GET /api/v1/students-guardians/guardians`: `students.guardians.view`
- `POST /api/v1/students-guardians/guardians`: `students.guardians.manage`
- `GET /api/v1/students-guardians/guardians/:guardianId`: `students.guardians.view`
- `PATCH /api/v1/students-guardians/guardians/:guardianId`: `students.guardians.manage`
- `GET /api/v1/students-guardians/guardians/:guardianId/students`: `students.guardians.view`
- `POST /api/v1/students-guardians/guardians/:guardianId/account`: `students.guardians.manage`

## 12. Known Compatibility Notes

- `documentsSummary` and `dashboardState` are additive fields on school-side Admissions application responses.
- `ApplicationDocumentResponse` review eligibility fields are additive.
- `pending_review` remains valid as a document response status for Applicant Portal bridged documents.
- Staff-created `pending_review` documents are rejected.
- Workflow policy is school-scoped. A school with no override receives the default strict policy.
- The legacy Guardians route remains available, but new frontend code should use the canonical route.
- No Applicant Portal response shapes changed.

## 13. Future Deprecations and Follow-ups

- Frontend should migrate Guardians search to `GET /api/v1/students-guardians/guardians`.
- Legacy `/students-guardians/students/guardians` can be deprecated in a future API version only after frontend migration.
- Admissions dashboard can later add richer `canProceedToDecision`, `canRegister`, or `registrationState` explanations if product confirms additional semantics.
- Optional tests/interviews workflow policy can be extended later if new workflow step types are added.
