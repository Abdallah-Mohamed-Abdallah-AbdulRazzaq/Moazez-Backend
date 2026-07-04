# ADM-DASH-STATE-1A - Admissions Dashboard Action State Closeout

## Sprint name

ADM-DASH-STATE-1A - Admissions Dashboard Action State

## Baseline commit

Expected baseline: `2fcf7384 feat: add admissions workflow policy`

Actual baseline confirmed before edits: `2fcf7384 feat: add admissions workflow policy`

Initial worktree: clean.

## Files changed

- `src/modules/admissions/applications/dto/application.dto.ts`
- `src/modules/admissions/applications/dto/application-dashboard-state.dto.ts`
- `src/modules/admissions/applications/presenters/application.presenter.ts`
- `src/modules/admissions/applications/presenters/application-dashboard-state.presenter.ts`
- `src/modules/admissions/applications/infrastructure/applications.repository.ts`
- `src/modules/admissions/applications/application/create-application.use-case.ts`
- `src/modules/admissions/applications/application/get-application.use-case.ts`
- `src/modules/admissions/applications/application/list-applications.use-case.ts`
- `src/modules/admissions/applications/application/submit-application.use-case.ts`
- `src/modules/admissions/applications/application/update-application.use-case.ts`
- `src/modules/admissions/applications/tests/application-dashboard-state.presenter.spec.ts`
- `src/modules/admissions/applications/tests/application.presenter.spec.ts`
- `src/modules/admissions/applications/tests/applications.use-case.spec.ts`
- `test/e2e/admissions-dashboard-state.e2e-spec.ts`
- `test/security/tenancy.admissions.spec.ts`
- `docs/sprint-adm-dash-state-1a-admissions-dashboard-action-state-closeout.md`

Create, update, and submit application use cases were updated because they return `ApplicationResponseDto` through the same presenter. Their responses now include the additive `dashboardState` field accurately under the current school's effective policy.

## Current dashboard gap confirmed

Admissions application responses already included `documentsSummary` and registration state, and workflow policy validation existed in decision/register validators. The dashboard still had no backend-computed action state for decision readiness, registration readiness, workflow readiness, document warning signals, or blocked-action reasons.

## dashboardState contract

School-side `ApplicationResponseDto` now includes:

```ts
dashboardState: {
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
    placementTests: { required: boolean; total: number; completed: number; satisfied: boolean };
    interviews: { required: boolean; total: number; completed: number; satisfied: boolean };
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
  blockers: Array<{ code: string; message: string }>;
}
```

The field is returned by `GET /api/v1/admissions/applications` and `GET /api/v1/admissions/applications/:id`. It is also returned by create/update/submit application responses because those paths share the same `ApplicationResponseDto` presenter.

## Decision readiness rules

`canProceedToDecision` equals `decisionState.canCreateDecision`.

Decision actions are computed per decision type:

- existing decision blocks all decision actions
- only `SUBMITTED` and `UNDER_REVIEW` applications are decidable
- workflow policy requirements are evaluated with the ADM-WORKFLOW-POLICY-1A evaluator
- missing required placement/interview workflow blocks ACCEPT, WAITLIST, and REJECT, matching the current validator
- `allowDirectAcceptance=false` blocks only no-test/no-interview ACCEPT when both workflow steps are optional
- WAITLIST and REJECT remain allowed in that direct-acceptance case, matching current backend semantics

Reason precedence:

1. `already_decided`
2. `application_status_not_decidable`
3. `direct_acceptance_not_allowed`
4. `workflow_policy_not_satisfied`
5. `ready`

## Registration state rules

Registration state is read-only and follows the requested precedence:

1. `registered` when the application already has a same-school linked Student via existing registration-state convention
2. `not_accepted` when `Application.status` is not `ACCEPTED`
3. `decision_not_accept` when accepted status exists but the admission decision is missing or not `ACCEPT`
4. `blocked_workflow_policy` when accepted + ACCEPT decision exists but required workflow is not satisfied
5. `ready_to_register` when accepted + ACCEPT decision + policy-satisfied + not already registered
6. `not_applicable` remains the fallback and is not expected in normal V1 states

`canRegister` is true only for `ready_to_register`.

## Workflow readiness source

The application repository selects minimal placement test and interview statuses on the same application query. The application use cases resolve the effective school workflow policy once per request through `ResolveAdmissionWorkflowPolicyService`. The dashboard presenter then evaluates readiness without mutating state.

## Document signals source

`documentSignals` is copied from the already-computed `documentsSummary` values. No additional document query was added for dashboard state.

## Repository/query strategy

The existing application record select was expanded with:

- decision type only
- placement test statuses only
- interview statuses only

List/detail already select document summary inputs and derived registration state inputs. The list path resolves policy once and maps all applications with that policy, avoiding per-application policy/test/interview queries.

## No-leak verification

`dashboardState` exposes only safe booleans, aggregate counts, safe states/reasons, policy booleans/source, and safe blocker codes/messages.

Tests verify no dashboard state leak of:

- application internal relation objects
- decision id
- policy id
- tenant ids
- membership/role/actor/user ids
- applicant ids
- student/guardian/registration ids
- placement test/interview/document/file ids
- storage fields or signed URLs
- audit internals
- raw Prisma enum names
- internal timestamps for workflow rows

## Tenancy/security verification

`test/security/tenancy.admissions.spec.ts` verifies:

- application list/detail remain accessible with `admissions.applications.view`
- applicant/parent/student users remain denied from school-side application detail
- cross-school application detail remains hidden with `404`
- dashboard state is present but contains no tenant/internal leaks
- School A workflow policy does not affect School B dashboard readiness

## Applicant Portal boundary verification

No Applicant Portal production files or DTOs were changed. Applicant accounts remain `UserType.APPLICANT`, membershipless before acceptance, and separate from Parent/Student operational identities. No Applicant Portal responses received `dashboardState`, and no applicant-to-parent conversion or operational Student/Guardian/Enrollment creation was added.

## Commands run

Before edits:

- `git status --short --untracked-files=all` - clean
- `git log --oneline -10` - confirmed `2fcf7384` at HEAD
- `npx prisma validate` - passed

After edits:

- `npm run build` - passed after clearing stale generated `dist` output
- `npx jest --runInBand src/modules/admissions/applications/tests/application-dashboard-state.presenter.spec.ts src/modules/admissions/applications/tests/application.presenter.spec.ts src/modules/admissions/applications/tests/applications.use-case.spec.ts` - passed, 14 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-dashboard-state.e2e-spec.ts` - passed, 7 tests
- `npx jest --runInBand src/modules/admissions/applications/tests` - passed, 6 suites / 40 tests
- `npx prisma validate` - passed
- `npm run build` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions.spec.ts` - passed, 43 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts` - passed, 7 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-workflow-policy.e2e-spec.ts` - passed, 7 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-application-document-summary.e2e-spec.ts` - passed, 6 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/applicant-portal-document-review.e2e-spec.ts` - passed, 6 tests

## Optional tests run/skipped

Skipped:

- `test/security/tenancy.students.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`
- `test/security/tenancy.student-app.spec.ts`

Those broader Student/Parent app suites were not directly affected by this additive school-side Admissions application response field.

## Known follow-ups

- Frontend should use `dashboardState` for Admissions application cards and details.
- Frontend should continue to call workflow-policy GET/PATCH for policy management screens.
- Future policy granularity may support grade/program-specific requirements.
- Legacy guardians route can be deprecated only after frontend migration.

## Final verdict

READY FOR REVIEW
