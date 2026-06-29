# ADM-REG-1H - Post-Registration Admissions Closure Audit / Decision Lock

## 1. Executive Decision

ADM-REG-1H locks a derived closure policy for V1:

```text
Post-registration Admissions closure is derived from Student.applicationId + schoolId.
Application.status is not mutated after source-bound registration.
Application.status remains the Admissions workflow / decision state.
Operational registration truth belongs to Students and Enrollments.
```

The selected policy is Option A - Derived Closure Only.

Rationale:

- `AdmissionApplicationStatus` currently has `SUBMITTED`, `DOCUMENTS_PENDING`, `UNDER_REVIEW`, `ACCEPTED`, `WAITLISTED`, and `REJECTED`; there is no `REGISTERED`, `ENROLLED`, or `CLOSED` application status.
- ADM-REG-1G already made `Student.applicationId + schoolId` the source-bound idempotency anchor.
- The existing accepted handoff/register validator requires `Application.status = ACCEPTED` and latest decision `ACCEPT`. Mutating `Application.status` to a new closure state would break or require broad validator redesign.
- The `admissions.application.register` audit event is a historical event marker, but should not be the primary query source for current registered state.

Final decision:

- Keep `Application.status = accepted` after source-bound registration.
- Treat `Student.applicationId + schoolId` as the canonical source-bound registration marker.
- Expose registration closure later as a derived `registrationState`, not a status rewrite.
- Do not add a Prisma enum value, `registeredAt`, `closedAt`, or closure endpoint in ADM-REG-1H.

## 2. Source Evidence Reviewed

Governance and scope documents reviewed:

- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `DOMAIN_GLOSSARY.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `ERROR_CATALOG.md`
- `TESTING_STRATEGY.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`

Note: `DIRECTORY_STRUCTURE.md` is listed by repository instructions but is not present in the workspace. `DIRECTORY_STRUCTURE_VISUAL.md` was reviewed instead.

ADM-REG and Applicant Portal evidence reviewed:

- `docs/sprint-adm-reg-1a-registration-reality-audit.md`
- `docs/sprint-adm-reg-1b-registration-contract-decision-lock.md`
- `docs/sprint-adm-reg-1c-student-guardian-profile-persistence-repair-closeout.md`
- `docs/sprint-adm-reg-1d-school-registration-wizard-foundation-closeout.md`
- `docs/sprint-adm-reg-1e-accepted-applicant-conversion-audit-handoff-expansion.md`
- `docs/sprint-adm-reg-1f-accepted-application-handoff-to-wizard-implementation-closeout.md`
- `docs/sprint-adm-reg-1g-accepted-application-source-bound-registration-submit-closeout.md`
- `docs/sprint-18n-applicant-portal-final-closeout-audit.md`
- `docs/sprint-19a-applicant-document-review-final-closeout-audit.md`

Runtime evidence inspected without modification:

- `prisma/schema.prisma`
- `src/modules/admissions/applications/application/register-accepted-application.use-case.ts`
- `src/modules/admissions/applications/application/get-application-registration-handoff.use-case.ts`
- `src/modules/admissions/applications/validators/application-enrollment-handoff.validator.ts`
- `src/modules/admissions/applications/presenters/application.presenter.ts`
- `src/modules/admissions/applications/presenters/application-registration-handoff.presenter.ts`
- `src/modules/admissions/applications/presenters/application-registration-submit.presenter.ts`
- `src/modules/admissions/applications/infrastructure/applications.repository.ts`
- `src/modules/admissions/decisions/application/create-admission-decision.use-case.ts`
- `src/modules/admissions/decisions/validators/decision-workflow.validator.ts`
- `src/modules/admissions/decisions/infrastructure/admission-decisions.repository.ts`
- `src/modules/admissions/documents/application/review-application-document.use-case.ts`
- `src/modules/admissions/tests/application/create-placement-test.use-case.ts`
- `src/modules/admissions/tests/application/update-placement-test.use-case.ts`
- `src/modules/admissions/interviews/application/create-interview.use-case.ts`
- `src/modules/admissions/interviews/application/update-interview.use-case.ts`
- `src/modules/students/registration/application/create-school-registration.use-case.ts`
- `test/e2e/admissions-registration-submit.e2e-spec.ts`
- `test/security/tenancy.admissions-registration-submit.spec.ts`
- related Admissions and school-registration e2e/security specs found under `test/e2e/**` and `test/security/**`

## 3. Current Application Lifecycle Reality

Current Prisma enum:

```text
AdmissionApplicationStatus:
SUBMITTED
DOCUMENTS_PENDING
UNDER_REVIEW
ACCEPTED
WAITLISTED
REJECTED
```

Evidence: `prisma/schema.prisma` defines `AdmissionApplicationStatus` with only those six values.

There is currently no Application status for:

- `REGISTERED`
- `ENROLLED`
- `CLOSED`

`Application.status` is used as a combined Admissions workflow / decision result state:

- Application creation sets `DOCUMENTS_PENDING` in `CreateApplicationUseCase`.
- Application submit moves `DOCUMENTS_PENDING -> SUBMITTED` in `SubmitApplicationUseCase`.
- Admission decision maps `ACCEPT`, `WAITLIST`, `REJECT` to `ACCEPTED`, `WAITLISTED`, `REJECTED` in `mapDecisionToApplicationStatus`.
- `AdmissionDecisionsRepository.createDecisionAndUpdateApplicationStatus` creates the decision and updates `Application.status` in one transaction.
- Handoff/register eligibility requires accepted decision state through `ApplicationEnrollmentHandoffValidator`.

`Application.status` is not currently updated by ADM-REG-1G registration submit. The source-bound registration marker is `Student.applicationId`, persisted through `CreateSchoolRegistrationUseCase` when called with an internal Admissions source context.

`Student.applicationId` evidence:

- `Student.applicationId String? @map("application_id") @db.Uuid`
- `Student.application` relation points to `Application` by `[applicationId, schoolId]`.
- `@@unique([applicationId, schoolId])` makes it the school-scoped idempotency anchor.

## 4. Current Post-Registration Behavior

After successful:

```text
POST /api/v1/admissions/applications/:id/register
```

current behavior is:

- `Application.status` remains `ACCEPTED`.
- `Student.applicationId` is set to the route application id by the internal wizard source context.
- `admissions.application.register` audit event is written with safe summary data.
- Repeat submit returns `alreadyRegistered: true`.
- `GET /api/v1/admissions/applications/:id/registration-handoff` returns `alreadyRegistered: true`, `wizardDraft: null`, and safe registered Student/enrollment summary when `Application.student` exists.
- Application list/detail still return only the normal `ApplicationResponseDto` with `status`; they do not expose a derived registered state today.

Current classification:

```text
derived_closure
```

It is not explicit closure, because no Application status, timestamp, or closure column is mutated. It is not audit-only, because the current registered state can be queried through the `Application -> Student` relation using `Student.applicationId + schoolId`.

Current behavior matrix:

| Behavior | Current evidence | Risk | Decision |
| --- | --- | --- | --- |
| Application remains accepted after registration | `RegisterAcceptedApplicationUseCase` delegates to the wizard and writes audit; it does not call `updateApplication`. | Status alone does not show registered closure. | Keep accepted status; expose derived state later. |
| Student is linked to Application | `CreateSchoolRegistrationUseCase` writes `applicationId: options.sourceApplicationId ?? null`. | Public wizard must not expose or accept source ids. | Keep source id internal only. |
| Repeated submit is idempotent | `RegisterAcceptedApplicationUseCase` returns `presentAlreadyRegisteredApplicationRegistration` when `application.student` exists and handles `P2002` by re-reading. | Optional account failures are not retried on repeat submit. | Keep idempotent response; defer account recovery. |
| Handoff preview detects registration | `presentApplicationRegistrationHandoff` sets `alreadyRegistered = Boolean(input.application.student)`. | Application detail/list lack same signal. | Add derived registrationState in ADM-REG-1I. |
| Application list/detail show status only | `presentApplication` returns id, leadId, studentName, requested ids, source, status, submittedAt, createdAt, updatedAt. | Frontend may not know accepted application is registered. | Add derived state to detail first. |
| Decision creation after normal registration | Normal accepted application already has a decision, and `DecisionWorkflowValidator` rejects existing decisions and only allows SUBMITTED/UNDER_REVIEW. | Data drift could allow decision creation if Student exists but status/decision state is inconsistent. | Future guard may check derived registration state. |
| Document review after registration | `ReviewApplicationDocumentUseCase` allows only SUBMITTED, DOCUMENTS_PENDING, UNDER_REVIEW. ACCEPTED is not reviewable. | Evidence cleanup after acceptance/registration is blocked today unless status is reopened by request-replacement before acceptance. | Do not change now; product may revisit evidence cleanup. |
| Placement/interview create/update after registration | Create/update placement/interview use cases validate scoped application or record existence but do not check registered Student. | Staff can make historical corrections after registration; could also make confusing changes. | Treat as historical correction for now; decide guard later. |

## 5. Closure Policy Options

Closure options matrix:

| Option | Description | Pros | Cons | Decision |
| --- | --- | --- | --- | --- |
| Option A - Derived Closure Only | Keep `Application.status = ACCEPTED`; derive registered state from `Student.applicationId + schoolId`; use audit as historical event evidence. | No migration; no enum churn; aligns with ADM-REG-1G idempotency; avoids breaking accepted validators; keeps operational truth in Students/Enrollments. | Status alone does not show closure; list/detail need derived state; future mutation guards need explicit checks. | Locked for V1. |
| Option B - Mutate Existing Status If Suitable | Use an existing Application status after registration if it already means enrolled/registered/closed. | Would make lists simple if such a status existed. | No current status has that meaning; `ACCEPTED` is required by handoff/register validators; reusing `REJECTED`/`WAITLISTED` would be wrong. | Rejected. |
| Option C - Add New Status / Schema Later | Add `REGISTERED`, `ENROLLED`, or `CLOSED` later. | Explicit lifecycle state and easy reporting. | Requires Prisma migration, enum mappings, transition rules, presenter updates, validator redesign, and product naming decision. | Deferred; not V1 default. |
| Option D - Add Closure Timestamp / Marker Later | Add `registeredAt`, `closedAt`, `registeredBy`, or source metadata later. | Better reporting/audit; can preserve `ACCEPTED`. | Requires migration and careful dedupe with `Student.applicationId` plus audit event. | Deferred until reporting need is proven. |

## 6. Locked Closure Decision

ADM-REG-1H locks:

```text
Application.status remains ACCEPTED after successful source-bound registration.
Student.applicationId + schoolId is the canonical source-bound registered marker.
admissions.application.register is the historical event marker.
Application.status remains Admissions workflow / decision state.
Operational registration state belongs to Students / Enrollments.
Future APIs may expose registered/closed state as derived registrationState.
```

This is intentionally conservative. It avoids schema churn and keeps the Admissions decision lifecycle separate from the operational registration lifecycle.

Important implications:

- Do not mutate `Application.status` in ADM-REG-1I.
- Do not add a new `AdmissionApplicationStatus` value in ADM-REG-1I.
- Do not infer Parent App or Student App activation from Application status.
- Do not treat audit logs as the primary query source for current registered state.

## 7. Future Derived Registration State Contract

Future derived state should be presented as a response-level computed object.

Recommended shape:

```ts
{
  "status": "accepted",
  "registrationState": {
    "registered": true,
    "studentId": "safe-student-id",
    "enrollmentId": "safe-enrollment-id-or-null",
    "registeredVia": "admissions_application",
    "registeredAt": null,
    "source": "derived_from_student_application_id"
  }
}
```

Because there is no durable `registeredAt` field today, `registeredAt` should be `null` or omitted unless a later schema decision adds a trusted source.

Recommended exposure order:

1. Application detail response.
2. Registration handoff response, if the existing `alreadyRegistered` and `registered` summary are not enough for the frontend.
3. Register response, if a unified contract is wanted across list/detail/handoff/register.
4. Application list only after frontend list needs are locked.
5. Admissions dashboard counters only after reporting requirements are clear.

Future derived state contract matrix:

| Field | Source | May expose? | Reason | Implementation sprint |
| --- | --- | --- | --- | --- |
| `registrationState.registered` | `Boolean(Application.student)` or Student lookup by `applicationId + schoolId` | Yes | Safe derived boolean; reveals operational registration completion to school staff. | ADM-REG-1I |
| `registrationState.studentId` | `Student.id` from same-school `Application.student` relation | Yes | Student id is already exposed by safe Student presenter after registration. | ADM-REG-1I |
| `registrationState.enrollmentId` | Active Enrollment for the linked Student, if present | Yes | Enrollment id is already exposed by safe Enrollment presenter. | ADM-REG-1I |
| `registrationState.registeredVia` | Derived from presence of `Student.applicationId` | Yes | The source-bound route is the only current path setting this link. | ADM-REG-1I |
| `registrationState.registeredAt` | No current durable field | Null or omit | Audit event exists but should not be the primary query source. | Deferred |
| `registrationState.source` | Constant derived marker | Yes | Explains why the state is present without implying status mutation. | ADM-REG-1I |
| `Application.status` | `Application.status` | Yes, unchanged | Remains `accepted`; not a closure marker. | Existing |
| `applicantUserId` / `applicantProfileId` | Applicant-owned source records | No | Not needed for closure; preserves ADR-0003 boundary. | Never in app-facing closure state |
| `schoolId` / `organizationId` | Internal tenant columns | No | Existing no-leak rules. | Never in app-facing closure state |

## 8. Post-Registration Mutability Policy

Post-registration mutability matrix:

| Operation | Allowed today? | Future decision | Reason | Implementation sprint |
| --- | --- | --- | --- | --- |
| Repeat source-bound registration submit | Yes, idempotent | Keep idempotent only | Prevent duplicates while giving staff a stable response. | Existing ADM-REG-1G |
| Create a new AdmissionDecision after normal registration | No in normal flow | Keep blocked | Existing decision and accepted status already block it. | Existing |
| Change ACCEPT to REJECT after registration | No direct update route for decision/status | Add explicit guard if decision mutation/edit endpoint is ever introduced | Contradicting operational Student/Enrollment state is unsafe. | ADM-REG-1J if needed |
| Review documents after accepted registration | No, because reviewable statuses exclude ACCEPTED | Product decision needed for evidence cleanup | Current accepted state blocks review; registration does not add a separate block. | Deferred |
| Create placement test after registration | Yes if no conflicting scheduled test and application is in scope | Consider historical-correction policy | Create placement test checks application existence, not registration state. | ADM-REG-1J or later |
| Update placement test after registration | Yes | Consider historical-correction policy | Update checks test existence, not registration state. | ADM-REG-1J or later |
| Create interview after registration | Yes | Consider historical-correction policy | Create interview checks application existence and interviewer only. | ADM-REG-1J or later |
| Update interview after registration | Yes | Consider historical-correction policy | Update checks interview existence and interviewer when supplied. | ADM-REG-1J or later |
| Delete/cancel Student or Enrollment then re-register | Not handled by Admissions | Do not make Admissions auto-repair | Student/Enrollment lifecycle owns cancellation/withdrawal/transfer. | Students lifecycle sprint |
| Optional Parent/Student account recovery | No retry through register once already registered | Defer recovery workflow | ADM-REG-1G returns alreadyRegistered and does not rerun optional account steps. | Future account recovery sprint |

Locked policy:

- Repeat registration submit remains idempotent and safe.
- Future contradictory decision mutations should be blocked once derived registered state is true.
- Document review is not opened by ADM-REG-1H; evidence cleanup needs product/security decision.
- Placement/interview edits after registration should be treated as historical corrections until a later guard policy is locked.
- Student/Enrollment cancellation, withdrawal, transfer, and repair belong to Students/Enrollments lifecycle, not Admissions closure.

## 9. Reporting and Dashboard Implications

Reporting matrix:

| Metric | Definition | Source | Decision |
| --- | --- | --- | --- |
| `accepted_count` | Applications with `Application.status = ACCEPTED` | Application status | Registered applications remain included unless product defines mutually exclusive funnel stages. |
| `registered_count` | Accepted applications with a same-school Student where `Student.applicationId = Application.id` | Derived Student relation | Add as separate derived count later. |
| `accepted_unregistered_count` | Accepted applications without linked Student | `ACCEPTED` minus derived registered | Useful queue metric for Admissions follow-up. |
| `registered_without_active_enrollment_count` | Linked Student exists but no active Enrollment | Student relation plus active Enrollment lookup | Warning/ops cleanup metric; not auto-repair. |
| `documents_pending_after_registration_count` | Registered applications with pending document summaries, if source exists | ApplicationDocument status plus derived registered state | Deferred; product must decide whether this matters after acceptance. |

Locked reporting decision:

```text
Registered is a derived subset of accepted, not a replacement for accepted.
```

Do not remove registered applications from accepted counts unless product explicitly defines Admissions funnel stages as mutually exclusive. Future reports should expose accepted and registered counts separately to avoid silent double-counting assumptions.

## 10. Audit and Observability Decision

ADM-REG-1G emits:

```text
admissions.application.register
```

Evidence: `RegisterAcceptedApplicationUseCase` writes an audit event with:

- `applicationId`
- `studentId`
- `enrollmentId`
- `guardianCount`
- `createdVia: admissions_application_register`

The wizard also emits:

```text
students.registration.create
```

with a safe summary and source metadata when called from Admissions:

- `source: admissions_application`
- `sourceApplicationId`
- Student/guardian/enrollment counts and optional account counts

Decision:

```text
Use audit as historical evidence, not as the primary query source.
Use Student.applicationId + schoolId as the primary registered-state query source.
```

Reason:

- Audit logs are append-only event history and good for traceability.
- Querying current state from audit logs is fragile and expensive.
- The Student relation is the normalized operational state and already has a school-scoped uniqueness constraint.

## 11. Data Integrity, Race, and Repair Policy

Current source-bound integrity behavior:

- `Student.applicationId + schoolId` prevents duplicate source-bound Student rows.
- `RegisterAcceptedApplicationUseCase` checks `application.student` before creation.
- If a unique conflict occurs during concurrent creation, the use case re-reads the application and returns alreadyRegistered when a Student is now present.
- If Student exists but no active Enrollment exists, register/handoff returns a warning and does not attempt repair.
- Optional Parent/Student account steps are outside the core registration transaction and may fail with warnings after Student/Guardian/Enrollment are durable.

Locked repair policy:

- Do not auto-repair in Admissions closure.
- Already-registered remains the safe response.
- Student-without-active-enrollment remains a warning, not an automatic Enrollment create.
- Optional account recovery is deferred.
- Data drift such as linked Student with non-accepted Application status should be handled by manual/admin remediation or a future scoped repair sprint, not by automatic Admissions closure logic.

## 12. Explicit Non-Goals

ADM-REG-1H does not implement:

- Application status mutation.
- New Application status enum.
- Prisma migration.
- `registeredAt`, `closedAt`, `enrolledAt`, `registeredBy`, or closure fields.
- Admissions closure endpoint.
- Admissions list/detail presenter changes.
- Handoff/register route changes.
- Decision workflow blocking.
- Document workflow blocking.
- Placement/interview workflow blocking.
- Applicant identity changes.
- Applicant membership creation.
- Parent App behavior changes.
- Student App behavior changes.
- Global guard changes.
- `schoolScope` changes.
- New tests.

## 13. Deferred Backlog

- Derived `registrationState` exposure on Application detail.
- Optional `registrationState` consistency across handoff/register responses.
- Application list registered flag, if the frontend needs it.
- Admissions dashboard counters for accepted, registered, accepted-unregistered, and registered-without-active-enrollment.
- Post-registration decision mutation guard if future decision edit/reopen features are added.
- Placement/interview historical-correction policy after registration.
- Document evidence cleanup policy after acceptance/registration.
- Optional account recovery for already-registered source-bound applications.
- Admin repair tooling for data drift.
- Schema-backed closure timestamp only if reporting/audit product requirements justify it.

## 14. Future ADM-REG-1I Implementation Plan

Recommended next sprint:

```text
ADM-REG-1I - Admissions Registered State Exposure
```

Type:

```text
Focused implementation sprint.
```

Goal:

Expose safe derived registration state to school staff without mutating `Application.status` or adding schema.

Scope:

- Add `registrationState` to Application detail response.
- Use the current school-scoped Application -> Student relation or `Student.applicationId + schoolId`.
- Include safe `studentId` and active `enrollmentId` when present.
- Keep `registeredAt` null/omitted because no durable field exists.
- Keep `Application.status` unchanged.
- Keep Applicant identity boundaries unchanged.
- Add focused unit/e2e/security tests.
- Add closeout.

Explicit non-goals:

- No Prisma schema or migration.
- No new Application enum value.
- No status mutation.
- No document review policy change.
- No decision mutation guard.
- No dashboard counters unless specifically scoped.
- No Applicant conversion or membership.

Possible later sprint:

```text
ADM-REG-1J - Post-Registration Decision Mutation Guard
```

Potential scope:

- Prevent future contradictory Admissions decision mutations after operational registration.
- Preserve document review behavior unless separately changed.
- Decide placement/interview historical correction rules.
- Add tests.

## 15. Final Verdict

```text
ADM_REG_1H_POST_REGISTRATION_CLOSURE_DECISION_LOCKED
```

Evidence is sufficient to lock derived post-registration closure for V1. The current data model supports a safe school-scoped registered state through `Student.applicationId + schoolId`; Application status mutation is unnecessary and would create avoidable validator and workflow churn.
