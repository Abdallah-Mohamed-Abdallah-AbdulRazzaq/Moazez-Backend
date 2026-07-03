# ADM-WORKFLOW-POLICY-1A - Optional Tests / Interviews Workflow Policy Closeout

## Sprint name

ADM-WORKFLOW-POLICY-1A - Optional Tests / Interviews Workflow Policy

## Baseline commit

Expected baseline: `9b6ea2d4 feat: add admissions document summary counters`

Actual baseline confirmed before edits: `9b6ea2d4 feat: add admissions document summary counters`

Initial worktree: clean.

## Files changed

- `prisma/schema.prisma`
- `prisma/migrations/20260703120000_0050_admission_workflow_policy/migration.sql`
- `src/infrastructure/database/school-scope.extension.ts`
- `src/modules/admissions/admissions.module.ts`
- `src/modules/admissions/workflow-policy/**`
- `src/modules/admissions/decisions/application/create-admission-decision.use-case.ts`
- `src/modules/admissions/decisions/decisions.module.ts`
- `src/modules/admissions/decisions/validators/decision-workflow.validator.ts`
- `src/modules/admissions/decisions/tests/admission-decisions.use-case.spec.ts`
- `src/modules/admissions/applications/applications.module.ts`
- `src/modules/admissions/applications/validators/application-enrollment-handoff.validator.ts`
- `src/modules/admissions/applications/tests/application-registration-handoff.use-case.spec.ts`
- `src/modules/admissions/applications/tests/enroll-application-handoff.use-case.spec.ts`
- `src/modules/admissions/applications/tests/register-accepted-application.use-case.spec.ts`
- `src/modules/students/enrollments/enrollments.module.ts`
- `test/e2e/admissions-workflow-policy.e2e-spec.ts`
- `test/security/tenancy.admissions.spec.ts`
- `docs/sprint-adm-workflow-policy-1a-optional-tests-interviews-closeout.md`

`src/infrastructure/database/school-scope.extension.ts` was updated because the new persisted policy is school-scoped and must participate in Prisma school-scope enforcement. `src/modules/students/enrollments/enrollments.module.ts` was updated because that module already re-provides the Admissions handoff validator/use-case for enrollment-from-application paths and needed the same policy provider wiring.

## Current strict workflow confirmed

The pre-sprint behavior was hardcoded strict: decisions and accepted-application handoff required at least one placement test, all placement tests completed, at least one interview, and all interviews completed.

## Policy contract

Added school-side routes:

- `GET /api/v1/admissions/workflow-policy`
- `PATCH /api/v1/admissions/workflow-policy`

Response:

```ts
{
  requiresPlacementTest: boolean;
  requiresInterview: boolean;
  allowDirectAcceptance: boolean;
  source: 'default' | 'school_override';
  updatedAt: string | null;
}
```

PATCH accepts partial boolean updates and rejects an empty body with `validation.failed`.

## Policy persistence strategy

Added `AdmissionWorkflowPolicy` mapped to `admission_workflow_policies`.

One row per school is enforced by a unique `school_id`. No rows are backfilled; absence of a row means the default strict policy.

## Default strict behavior

Default effective policy:

```ts
{
  requiresPlacementTest: true,
  requiresInterview: true,
  allowDirectAcceptance: false
}
```

Unit tests confirm default strict decision and handoff behavior still blocks missing/incomplete required workflow steps and allows the existing completed strict path.

## Decision validation changes

`DecisionWorkflowValidator` now resolves the effective school policy and validates:

- existing decision still blocks
- application status must still be `SUBMITTED` or `UNDER_REVIEW`
- required placement tests/interviews must exist and be complete according to policy
- direct `ACCEPT` without tests/interviews is allowed only when both steps are optional and `allowDirectAcceptance=true`

The use-case now maps the requested decision before calling the validator.

## Registration handoff validation changes

`ApplicationEnrollmentHandoffValidator` now enforces accepted status and `ACCEPT` decision first, then validates required workflow steps using the same effective policy. Accepted applications with direct acceptance policy can prepare/register without tests/interviews, while `ApplicationNotAcceptedException` remains the gate for non-accepted applications.

## Policy route permission matrix

- `GET /api/v1/admissions/workflow-policy`: `admissions.applications.view`
- `PATCH /api/v1/admissions/workflow-policy`: `admissions.applications.manage`

No permissions or role seeds were added or changed.

## Audit logging

PATCH writes `admissions.workflow_policy.update` audit records with:

- `module: admissions`
- `resourceType: admission_workflow_policy`
- `resourceId: policy.id`
- safe before/after policy fields
- `outcome: SUCCESS`

The API response does not expose audit internals.

## No-leak verification

Policy responses expose only the approved fields. E2E/security tests verify no policy id, school id, organization id, actor id, membership id, role id, audit internals, user ids, credential fields, deleted timestamps, or raw Prisma enum names are exposed.

Decision/registration workflow errors now include safe aggregate policy/count details only.

## Tenancy/security verification

The focused E2E and `test/security/tenancy.admissions.spec.ts` verify:

- auth is required
- GET requires view permission
- PATCH requires manage permission
- applicant/parent/student actors cannot access policy routes
- School A and School B policy rows remain independent
- School A direct-acceptance policy does not allow access to School B applications
- the new model is included in the Prisma school-scope registry

## Applicant Portal boundary verification

No Applicant Portal production code or response DTOs were changed. Applicant accounts remain `UserType.APPLICANT`, membershipless before acceptance, and separate from Parent/Student operational identities. No applicant-to-parent conversion, Student/Guardian/Enrollment creation side effect, guard weakening, or Prisma scope weakening was introduced.

## Migration details

Added migration:

- `20260703120000_0050_admission_workflow_policy`

Migration command run:

- `npm run db:migrate` - applied the new migration successfully

Prisma Client command run:

- `npx prisma generate` - regenerated client for the new model

## Commands run

Before edits:

- `git status --short --untracked-files=all` - clean
- `git log --oneline -10` - confirmed `9b6ea2d4` at HEAD
- `npx prisma validate` - passed

After edits:

- `npx prisma validate` - passed
- `npm run db:migrate` - passed, applied `20260703120000_0050_admission_workflow_policy`
- `npx prisma generate` - passed
- `npm run build` - passed
- `npx jest --runInBand src/modules/admissions/decisions/tests/admission-decisions.use-case.spec.ts` - passed, 10 tests
- `npx jest --runInBand src/modules/admissions/applications/tests/application-registration-handoff.use-case.spec.ts src/modules/admissions/applications/tests/register-accepted-application.use-case.spec.ts src/modules/admissions/applications/tests/enroll-application-handoff.use-case.spec.ts` - passed, 26 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-workflow-policy.e2e-spec.ts` - passed, 7 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions.spec.ts` - passed, 42 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts` - passed, 7 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-application-document-summary.e2e-spec.ts` - passed, 6 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/applicant-portal-document-review.e2e-spec.ts` - passed, 6 tests
- `npx jest --runInBand src/modules/students/enrollments/tests/enrollments.use-case.spec.ts` - passed, 5 tests
- final `npx prisma validate` - passed
- final `npm run build` - passed

## Optional tests run/skipped

Run:

- `src/modules/students/enrollments/tests/enrollments.use-case.spec.ts` because the Students enrollments module needed policy-module DI wiring for its existing Admissions handoff provider.

Skipped:

- `test/security/tenancy.students.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`
- `test/security/tenancy.student-app.spec.ts`

Those broader app/security suites are not directly affected by the school-side Admissions policy contract.

## Known follow-ups

- Frontend can expose Admissions workflow policy controls to authorized school users.
- Admissions dashboard can add `canProceedToDecision` / `canRegister` / `registrationState` after product confirms exact copy and UX.
- Future policy granularity may support grade/program-specific requirements.
- Legacy guardians route can be deprecated only after frontend migration.

## Final verdict

READY FOR REVIEW
