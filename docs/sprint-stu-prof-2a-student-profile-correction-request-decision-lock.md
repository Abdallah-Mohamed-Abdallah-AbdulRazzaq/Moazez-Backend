# STU-PROF-2A - Student Profile Correction Request Decision Lock

## 1. Executive Summary

STU-PROF-2A locks the V1 backend/product contract for official Student profile correction requests.

The locked decision is:

```text
Students may submit profile correction requests from Student App.
Correction request submission does not mutate Student records.
School staff reviews, approves, rejects, or applies requests through Students/Guardians admin routes.
Approval applies allowed Student field changes transactionally.
Rejection leaves Student unchanged.
Direct Student App official profile field editing remains prohibited.
```

This follows the STU-PROF-1B decision that official Student profile fields are school records and should not be directly self-edited. Avatar remains handled by the already implemented avatar routes. StudentDocument remains staff-only. Medical profile, guardian/emergency contact changes, Parent/Guardian request submission, attachments, notifications, and direct preferences edits are deferred.

Recommended next sprint:

```text
STU-PROF-2B - Student Profile Correction Request Foundation
```

Final verdict:

```text
STU_PROF_2A_PROFILE_CORRECTION_REQUEST_DECISION_LOCKED
```

## 2. Source Evidence Reviewed

Decision and closeout documents reviewed:

- `docs/sprint-stu-prof-1a-student-profile-avatar-self-service-audit.md`
- `docs/sprint-stu-prof-1b-student-profile-avatar-self-service-decision-lock.md`
- `docs/sprint-stu-prof-1c-student-avatar-upload-foundation-closeout.md`
- `docs/sprint-stu-prof-1d-student-avatar-final-closeout-profile-contract-audit.md`
- `docs/sprint-adm-reg-1j-admissions-registration-flow-final-closeout-audit.md`
- `docs/sprint-adm-reg-doc-1c-admissions-document-import-final-closeout-audit.md`

Governance references reviewed:

- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `ERROR_CATALOG.md`
- `TESTING_STRATEGY.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `DOMAIN_GLOSSARY.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `AGENTS.md`

Runtime evidence inspected without modification:

- `prisma/schema.prisma`
- `src/modules/student-app/profile/**`
- `src/modules/student-app/access/**`
- `src/modules/student-app/**`
- `src/modules/students/students/**`
- `src/modules/students/registration/**`
- `src/modules/students/guardians/**`
- `src/modules/students/enrollments/**`
- `src/modules/students/medical/**`
- `src/modules/students/documents/**`
- `src/modules/parent-app/**`
- `src/modules/files/**`
- `src/infrastructure/audit/**`
- `src/infrastructure/prisma/**`
- `src/modules/student-app/profile/tests/**`
- `test/e2e/student-avatar-upload.e2e-spec.ts`
- `test/security/tenancy.student-avatar.spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/security/tenancy.student-app.spec.ts`

## 3. Current Runtime Constraints

Current Student profile runtime facts:

- `Student` is the durable school-managed profile record.
- `Student` stores English name parts, Arabic name parts, birth date, gender, nationality, address/city/district, Student contact phone/email, status, avatar file link, and internal operational links.
- `Student.userId`, `Student.applicationId`, `schoolId`, and `organizationId` are internal operational fields.
- Staff can create and update Student records through `POST /api/v1/students-guardians/students` and `PATCH /api/v1/students-guardians/students/:studentId`.
- Staff Student updates use `students.records.manage`.
- Student App profile is readable through `GET /api/v1/student/profile`.
- Student App avatar upload/replace/delete is implemented through `POST /api/v1/student/profile/avatar` and `DELETE /api/v1/student/profile/avatar`.
- `student.userId` has been removed from Student App profile response.
- No `PATCH /api/v1/student/profile` route exists.
- No Student profile correction request model exists.
- No Student profile correction request routes exist.
- No profile correction request status enum exists.
- No direct Student App mutation exists for official profile fields.
- Student App access resolves through `StudentAppAccessService`, linked active `Student.userId`, active Student, active user, active membership, and active Enrollment.
- Medical profile is a separate staff-managed subresource under `students.medical.view/manage`.
- Guardian/emergency contact data is managed through Guardians/StudentGuardian routes, not Student App profile.
- StudentDocument remains staff-managed under Students documents routes.
- Homework/task attachments remain academic workflow files and are not profile correction evidence.

These constraints support a future correction request workflow without requiring direct Student App profile mutation, Applicant identity changes, StudentDocument visibility changes, or global guard/schoolScope changes.

## 4. Decision Area 1 - Correction Request Existence

Options evaluated:

- Option A: no profile correction requests in V1.
- Option B: Student App correction requests.
- Option C: Parent/Guardian correction requests.
- Option D: combined Student and Parent correction requests.

Locked V1 decision:

```text
Option B - Student App Correction Requests
```

Students may submit correction requests for allowed official Student profile fields. Staff reviews those requests and approves or rejects them. Approval applies allowed changes to the Student record through a school-staff-controlled workflow.

Rationale:

- Student App is the active STU-PROF self-service surface.
- Direct Student mutation of official fields is unsafe.
- Request submission is auditable and does not change the source-of-truth record.
- Parent/Guardian request submission has separate consent and ownership questions and is deferred.
- Staff review preserves school control over official Student records.

## 5. Decision Area 2 - Requestable Field Policy

Official fields remain non-directly-editable by Students. A Student can only request correction of a controlled subset of Student profile fields.

Requestable through V1 correction workflow:

- legal English name fields:
  - `firstName`
  - `fatherNameEn`
  - `grandfatherNameEn`
  - `lastName`
- Arabic name fields:
  - `firstNameAr`
  - `fatherNameAr`
  - `grandfatherNameAr`
  - `familyNameAr`
- `gender`
- `birthDate`
- `nationality`
- `studentPhone`
- `studentEmail`
- `addressLine`
- `city`
- `district`

Not requestable in the first implementation:

- avatar/profile image
- medical profile
- guardian/emergency contact data
- StudentDocument
- homework/task files
- Student App preferences
- preferred/display name until a durable field exists
- `Student.userId`
- `Student.applicationId`
- `schoolId`
- `organizationId`
- membership/role/account fields

Rationale:

- Avatar already has its own implemented routes.
- Medical profile and guardian/emergency contact data have different sensitivity and ownership.
- StudentDocument is a staff-managed document record, not profile correction data.
- Internal ids and tenant fields must never be requestable.
- Preferred/display name is not currently a durable Student field and should not be accepted until a source-of-truth field is designed.

## 6. Decision Area 3 - Student App Submit/List/Read/Cancel Contract

Future Student App routes:

```text
POST /api/v1/student/profile/correction-requests
GET /api/v1/student/profile/correction-requests
GET /api/v1/student/profile/correction-requests/:requestId
POST /api/v1/student/profile/correction-requests/:requestId/cancel
```

Submit request shape:

```json
{
  "changes": {
    "firstName": "New",
    "lastName": "Name",
    "firstNameAr": "Arabic first name",
    "familyNameAr": "Arabic family name",
    "birthDate": "2010-01-01",
    "gender": "MALE",
    "nationality": "Egyptian",
    "studentPhone": "+201000000000",
    "studentEmail": "student@example.com",
    "addressLine": "Street 1",
    "city": "Cairo",
    "district": "Nasr City"
  },
  "reason": "Please correct my profile information."
}
```

Submit rules:

- `studentId` comes from authenticated Student App context.
- Request body must not accept `studentId`, `userId`, `applicationId`, `schoolId`, or `organizationId`.
- `changes` is required.
- Empty `changes` must be rejected.
- Unknown or disallowed fields must be rejected.
- Values must be normalized and validated before persistence.
- Submission stores requested changes separately from current Student state.
- Submission does not mutate the Student record.
- A safe `currentSnapshot` may be stored for staff review and audit context.
- Multiple pending requests are allowed only if future implementation defines a clear product policy. Default V1 recommendation is to allow multiple requests but reject exact duplicate pending payloads if practical.

Student App list/read response shape:

```json
{
  "id": "uuid",
  "status": "PENDING",
  "requestedChanges": {},
  "reason": "string",
  "reviewerNote": null,
  "submittedAt": "2026-06-30T00:00:00.000Z",
  "resolvedAt": null
}
```

Student cancellation:

- Student may cancel only own `PENDING` requests.
- Cancelling sets status to `CANCELLED`.
- Cancelling does not mutate Student.
- Cancelling approved/rejected requests must be rejected as a conflict.

## 7. Decision Area 4 - Staff Review/Approve/Reject Contract

Future staff routes:

```text
GET /api/v1/students-guardians/profile-correction-requests
GET /api/v1/students-guardians/profile-correction-requests/:requestId
POST /api/v1/students-guardians/profile-correction-requests/:requestId/approve
POST /api/v1/students-guardians/profile-correction-requests/:requestId/reject
```

Expected permissions:

```text
students.records.view
students.records.manage
```

Recommended permission mapping:

- staff list/read: `students.records.view`
- staff approve/reject: `students.records.manage`

Approval behavior:

- Staff can approve only same-school `PENDING` requests.
- Approval validates the request is still applicable to the same active Student.
- Approval applies only allowed changes to Student.
- Approval and Student update must happen in one transaction.
- Request status becomes `APPROVED`.
- `approvedAt` and `approvedBy` are stored.
- An audit event is written.
- Response returns a safe request summary and safe updated Student summary.

Rejection behavior:

- Staff can reject only same-school `PENDING` requests.
- Rejection does not mutate Student.
- Request status becomes `REJECTED`.
- `rejectedAt` and `rejectedBy` are stored.
- Optional `reviewerNote` may be stored.
- An audit event is written.
- Response returns a safe request summary.

Staff responses may include:

- request id
- safe student id
- safe student display summary
- requested changes
- current snapshot
- reason
- reviewer note
- status and timestamps

Staff responses must not expose:

- `schoolId`
- `organizationId`
- membership ids
- role ids
- `Student.userId`
- `Student.applicationId`
- raw internal actor ids unless a future staff audit contract explicitly requires them
- audit internals
- unrelated medical/guardian sensitive details

## 8. Decision Area 5 - Status Lifecycle

Locked V1 statuses:

```text
PENDING
APPROVED
REJECTED
CANCELLED
```

Status semantics:

- `PENDING`: submitted by Student and awaiting staff review.
- `APPROVED`: reviewed by staff and applied to Student record.
- `REJECTED`: reviewed by staff and not applied.
- `CANCELLED`: cancelled by the requesting Student before staff decision.

Terminal statuses:

- `APPROVED`
- `REJECTED`
- `CANCELLED`

Allowed transitions:

```text
PENDING -> APPROVED
PENDING -> REJECTED
PENDING -> CANCELLED
```

No transitions are allowed out of terminal statuses in V1. Reopen/revise behavior is deferred.

## 9. Decision Area 6 - Future Schema Model

Future implementation should add a new Students-owned model:

```prisma
model StudentProfileCorrectionRequest {
  id             String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String @map("organization_id") @db.Uuid
  schoolId       String @map("school_id") @db.Uuid
  studentId      String @map("student_id") @db.Uuid

  requestedByUserId String? @map("requested_by_user_id") @db.Uuid
  requestedByType   String  @map("requested_by_type")

  status           StudentProfileCorrectionRequestStatus @default(PENDING)
  requestedChanges Json @map("requested_changes")
  currentSnapshot  Json? @map("current_snapshot")
  reason           String?
  reviewerNote     String? @map("reviewer_note")

  approvedAt DateTime? @map("approved_at")
  approvedBy String?   @map("approved_by") @db.Uuid
  rejectedAt DateTime? @map("rejected_at")
  rejectedBy String?   @map("rejected_by") @db.Uuid
  cancelledAt DateTime? @map("cancelled_at")
  cancelledBy String?   @map("cancelled_by") @db.Uuid

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  @@index([schoolId, studentId, status, createdAt])
  @@index([schoolId, status, createdAt])
  @@index([requestedByUserId])
  @@map("student_profile_correction_requests")
}

enum StudentProfileCorrectionRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}
```

Schema decisions:

- Use JSON for `requestedChanges` in V1 to avoid over-modeling every field.
- Store a `currentSnapshot` for staff review/audit context.
- Store requester/reviewer actor ids for internal auditability.
- Do not expose actor ids in Student App responses.
- Keep `schoolId` and `organizationId` internal.
- Use soft delete only if consistent with Students model conventions.
- Add indexes for school/status/student hot paths.
- Keep the model in Students ownership, not Student App ownership.

Approval apply rules:

- Future implementation may reuse Student domain normalization helpers where possible.
- Approval must not blindly write arbitrary JSON keys to `Student`.
- Approval must map only allowed fields to the existing Student update surface.
- Approval must preserve no-leak Student presenter behavior.

## 10. Decision Area 7 - Audit and Observability

Future audit actions:

```text
student.profile.correction.requested
student.profile.correction.cancelled
students.profile.correction.approved
students.profile.correction.rejected
```

Safe audit payload may include:

- `requestId`
- `studentId`
- `status`
- `changedFieldNames`
- `source: student_app`
- `source: school_staff`

Audit payload must not include:

- passwords
- tokens
- `Student.applicationId`
- full sensitive before/after values unless the project audit policy explicitly permits it
- raw actor internals
- storage internals
- medical details
- guardian sensitive details

Audit logs are historical evidence only. Current state comes from `StudentProfileCorrectionRequest` and `Student`, not from audit logs.

## 11. Decision Area 8 - Security, Tenancy, and No-Leak Rules

Locked security behavior:

- Student can create/list/read/cancel only own correction requests.
- Student cannot approve or reject requests.
- Parent cannot use Student App correction routes.
- Applicant cannot use Student App correction routes.
- Staff can review only same-school correction requests.
- Staff approval/rejection requires Students records permissions.
- Cross-school ids return safe not-found behavior.
- Request submission does not mutate Student.
- Approval is transactional.
- Controllers remain thin.
- Controllers do not use Prisma directly.
- No global guard changes are required.
- No schoolScope changes are required.

Student App correction request responses must not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `requestedByUserId`
- `approvedBy`
- `rejectedBy`
- `cancelledBy`
- `Student.userId`
- `Student.applicationId`
- audit internals

Staff responses must also avoid unrelated sensitive data and storage internals. Staff may see safe requested changes and current snapshot because review requires field-level context.

## 12. Locked V1 Contract

1. Students may submit profile correction requests from Student App.
2. Request submission does not mutate Student records.
3. Staff reviews correction requests from Students/Guardians admin routes.
4. Approval applies allowed changes to Student in one transaction.
5. Rejection does not mutate Student.
6. Students can list/read their own requests.
7. Students may cancel their own `PENDING` requests.
8. Direct profile field editing remains prohibited.
9. Avatar remains handled by avatar routes and is not part of correction requests.
10. StudentDocument remains staff-only and is not part of correction requests.
11. Medical profile corrections are deferred.
12. Guardian/emergency contact corrections are deferred.
13. Parent/Guardian correction request submission is deferred.
14. Student App responses do not expose actor ids, tenant ids, `Student.userId`, `Student.applicationId`, or audit internals.
15. Staff responses may include safe student summary and request details, but not storage internals or sensitive unrelated data.

## 13. Future Implementation Contract

Recommended next sprint:

```text
STU-PROF-2B - Student Profile Correction Request Foundation
```

Allowed future STU-PROF-2B scope:

- Prisma model and migration.
- Correction request status enum.
- Student App submit/list/read/cancel routes.
- Staff list/read/approve/reject routes.
- Request validation and allowed-field filtering.
- Current snapshot capture.
- Transactional approval apply.
- Safe presenters for Student App and staff responses.
- Audit events.
- Unit tests.
- Focused e2e tests.
- Focused security tests.
- Closeout document.

Explicitly out of STU-PROF-2B scope:

- direct `PATCH /api/v1/student/profile`.
- avatar changes.
- StudentDocument Student App visibility.
- StudentDocument Parent App visibility.
- Parent App correction submission.
- medical profile correction workflow.
- guardian/emergency contact correction workflow.
- Applicant behavior changes.
- Admissions behavior changes.
- ADM-REG-DOC behavior changes.
- homework/task behavior changes.

## 14. Future Test Strategy

Future implementation must include:

- unit tests for allowed-field validation.
- unit tests for disallowed-field rejection.
- use-case tests for Student submit/list/read/cancel ownership.
- use-case tests for staff approve/reject status transitions.
- transactional approval test that applies Student changes and status update together.
- presenter no-leak tests for Student App responses.
- staff presenter tests for safe requested/current values.
- e2e tests for submit, list, cancel, approve, and reject.
- security tests for parent/applicant/wrong student/cross-school boundaries.
- audit tests for requested/cancelled/approved/rejected safe payloads.
- regression tests proving `PATCH /api/v1/student/profile` remains absent.
- regression tests proving avatar routes remain separate.
- regression tests proving StudentDocument remains staff-only.

## 15. Deferred Backlog

| Backlog item | Why deferred | Recommended owner sprint | Priority | Risk |
| --- | --- | --- | --- | --- |
| Parent/guardian correction request flow | Parent/Guardian ownership, consent, and field policy differ from Student self-service. | Parent Profile Correction Decision | Medium | High if mixed into Student App flow. |
| Medical profile correction workflow | Medical data is sensitive and currently staff-managed through a separate subresource. | STU-MED App Visibility/Correction Decision | Medium | High privacy and safety risk. |
| Guardian/emergency contact correction workflow | Guardian data is not solely Student-owned and may require guardian verification. | Guardian Contact Correction Decision | Medium | High ownership risk. |
| Direct non-official preferences edit | Preferences need separate fields and source-of-truth policy. | STU-PROF Preferences Decision | Low | Medium contract risk. |
| Student contact source-of-truth cleanup | Student contact fields and User account contact fields can diverge. | Student Contact Source Audit | High | Medium consistency risk. |
| Profile correction attachments/evidence | File evidence adds storage, visibility, and retention policy. | Profile Correction Evidence Decision | Medium | Medium/High file privacy risk. |
| Notification to staff on new request | Notification triggers need event and recipient policy. | Notification Workflow Sprint | Medium | Low/Medium operational risk. |
| Notification to student on decision | Student notification requires template and delivery policy. | Notification Workflow Sprint | Medium | Low/Medium operational risk. |
| Bulk/admin repair tools | Separate admin/data quality concern. | Admin Data Repair Sprint | Low | Medium if done casually. |

## 16. Recommended Next Sprint

Recommended next sprint:

```text
STU-PROF-2B - Student Profile Correction Request Foundation
```

Why this is the safest next sprint:

- STU-PROF avatar foundation is complete.
- Direct official profile self-edit is explicitly rejected.
- Current staff Student update routes already define the source-of-truth fields.
- Student App can safely submit requests without immediate mutation.
- Staff approval preserves school control over official Student records.
- A new request model provides auditability, status lifecycle, and no-leak response contracts.

Do not proceed directly to profile field mutation without the request model and staff review workflow.

## 17. Explicit Do-Not-Do List

- Do not implement correction request runtime behavior in STU-PROF-2A.
- Do not add a Prisma model in STU-PROF-2A.
- Do not add a migration in STU-PROF-2A.
- Do not add tests in STU-PROF-2A.
- Do not add `PATCH /api/v1/student/profile`.
- Do not allow direct Student App edits to official Student fields.
- Do not include avatar in correction requests.
- Do not change avatar routes.
- Do not expose StudentDocument to Student App.
- Do not expose StudentDocument to Parent App.
- Do not include StudentDocument in correction requests.
- Do not add Parent/Guardian correction submission in the first implementation.
- Do not include medical profile in the first correction request workflow.
- Do not include guardian/emergency contact in the first correction request workflow.
- Do not expose `schoolId`, `organizationId`, `Student.userId`, `Student.applicationId`, actor ids, or audit internals in Student App responses.
- Do not mutate Applicant identity.
- Do not change Admissions registration behavior.
- Do not change ADM-REG-DOC import behavior.
- Do not change homework/task behavior.
- Do not change global guards.
- Do not change schoolScope behavior.

## 18. Final Verdict

```text
STU_PROF_2A_PROFILE_CORRECTION_REQUEST_DECISION_LOCKED
```

The correction request contract is locked for V1 planning. Students may request correction of selected official profile fields through Student App, but the request does not mutate Student records. Staff reviews and approves/rejects from Students/Guardians admin routes, and only approval applies allowed changes transactionally. Avatar, StudentDocument, medical, guardian/emergency, Parent/Guardian request submission, Applicant behavior, Admissions behavior, and homework/task behavior remain out of scope.

## Decision Matrix

| Decision Area | Options Considered | Locked Decision | Reason | Future Sprint |
| --- | --- | --- | --- | --- |
| Correction request existence | None, Student App, Parent/Guardian, combined | Student App correction requests | Direct edits are unsafe; request submission is auditable. | STU-PROF-2B |
| Allowed requester | Student only, Parent only, combined | Student only for V1 | STU-PROF is focused on Student App; Parent flow has separate consent policy. | STU-PROF-2B |
| Requestable fields | All profile fields, official subset, none | Official Student subset only | Matches staff-managed Student profile fields. | STU-PROF-2B |
| Non-requestable fields | Allow all, block sensitive/internal | Block internal, medical, guardian, avatar, documents | Different ownership/security boundaries. | STU-PROF-2B plus later sprints |
| Request storage | Direct Student mutation, normalized per-field rows, JSON request | JSON `requestedChanges` plus optional current snapshot | V1 flexibility without over-modeling. | STU-PROF-2B |
| Status lifecycle | Pending/approved only, full lifecycle | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` | Supports staff decisions and Student cancellation. | STU-PROF-2B |
| Student App routes | Submit only, submit/list/read/cancel | Submit, list, read, cancel own pending | Students need request history and cancellation. | STU-PROF-2B |
| Staff routes | Approve only, approve/reject, list/read/approve/reject | List, read, approve, reject | Staff needs review workflow and audit trail. | STU-PROF-2B |
| Approval behavior | Mutate request only, mutate Student only, transactional apply | Transactionally update Student and request | Prevent partial state drift. | STU-PROF-2B |
| Cancellation behavior | No cancel, any status cancel, pending-only cancel | Student can cancel own `PENDING` request | Keeps terminal states stable. | STU-PROF-2B |
| Audit events | None, generic event, explicit events | Four explicit correction audit actions | Sensitive profile workflow needs observability. | STU-PROF-2B |
| Parent involvement | Include now, defer | Defer Parent/Guardian submission | Ownership and consent policy are not locked. | Future Parent correction sprint |
| Medical/guardian data | Include now, defer | Defer | Sensitive and separately owned data. | Future medical/guardian policy sprint |
| StudentDocument boundary | Include docs, keep separate | Keep StudentDocument staff-only and out of correction requests | Document visibility is separate privacy policy. | Future STU-DOC sprint |

## Requestable Field Matrix

| Field / Group | Requestable? | Directly editable? | Reviewer required? | Reason |
| --- | --- | --- | --- | --- |
| legal English name fields | Yes | No | Yes | Official identity data; staff must approve. |
| Arabic name fields | Yes | No | Yes | Official identity data; staff must approve. |
| gender | Yes | No | Yes | Sensitive official field. |
| birth date | Yes | No | Yes | Sensitive official field. |
| nationality | Yes | No | Yes | Official Student profile field. |
| student phone | Yes | No | Yes | Student and account contact sources may diverge; staff review required. |
| student email | Yes | No | Yes | Student and account contact sources may diverge; staff review required. |
| addressLine/city/district | Yes | No | Yes | School record contact/address data. |
| preferred/display name | No in first implementation | No | N/A | No durable Student preferred-name field exists today. |
| avatar/profile image | No | Yes, through avatar routes only | No | Avatar has a separate implemented route and audit flow. |
| medical profile | No | No | Future medical reviewer | Sensitive staff-managed subresource. |
| guardian/emergency contact | No | No | Future guardian/staff reviewer | Not solely Student-owned. |
| `Student.userId` | No | No | N/A | Internal account-link field. |
| `Student.applicationId` | No | No | N/A | Internal Admissions idempotency anchor. |
| `schoolId`/`organizationId` | No | No | N/A | Tenant fields. |
| StudentDocument | No | No | N/A | Staff-managed document records, not profile correction fields. |

## Future Route Matrix

| Route | Actor | Purpose | Side effect | Decision |
| --- | --- | --- | --- | --- |
| `POST /api/v1/student/profile/correction-requests` | Student App Student | Submit allowed field corrections. | Creates `PENDING` request only; no Student mutation. | Implement in STU-PROF-2B. |
| `GET /api/v1/student/profile/correction-requests` | Student App Student | List own requests. | None. | Implement in STU-PROF-2B. |
| `GET /api/v1/student/profile/correction-requests/:requestId` | Student App Student | Read own request detail. | None. | Implement in STU-PROF-2B. |
| `POST /api/v1/student/profile/correction-requests/:requestId/cancel` | Student App Student | Cancel own pending request. | Sets status `CANCELLED`; no Student mutation. | Implement in STU-PROF-2B. |
| `GET /api/v1/students-guardians/profile-correction-requests` | School staff | List same-school requests. | None. | Implement in STU-PROF-2B. |
| `GET /api/v1/students-guardians/profile-correction-requests/:requestId` | School staff | Review request detail. | None. | Implement in STU-PROF-2B. |
| `POST /api/v1/students-guardians/profile-correction-requests/:requestId/approve` | School staff | Approve and apply request. | Transactionally updates Student and request. | Implement in STU-PROF-2B. |
| `POST /api/v1/students-guardians/profile-correction-requests/:requestId/reject` | School staff | Reject request. | Sets status `REJECTED`; no Student mutation. | Implement in STU-PROF-2B. |

## Status Lifecycle Matrix

| Status | Entered by | Allowed next statuses | Student visible? | Meaning |
| --- | --- | --- | --- | --- |
| `PENDING` | Student submit | `APPROVED`, `REJECTED`, `CANCELLED` | Yes | Request is waiting for staff review. |
| `APPROVED` | Staff approval | None | Yes | Staff approved and applied allowed changes to Student. |
| `REJECTED` | Staff rejection | None | Yes | Staff declined; Student record unchanged. |
| `CANCELLED` | Student cancellation | None | Yes | Student cancelled before staff decision; Student record unchanged. |

## No-Leak Matrix

| Field / Concept | Student App response | Staff response | Decision |
| --- | --- | --- | --- |
| request id | Expose | Expose | Safe correction request identifier. |
| student id | Expose own safe id if useful | Expose safe Student id/summary | `Student.id` is safe; no tenant ids. |
| student display name | Expose if useful | Expose | Safe presentation field. |
| requested changes | Expose own request values | Expose for review | Required for workflow; validate allowed fields only. |
| current snapshot | Hide or expose only safe subset | Expose safe profile subset | Staff needs context; Student App can rely on current profile. |
| reviewer note | Expose after rejection/approval if present | Expose/edit on decision | Must not include unrelated sensitive data. |
| `requestedByUserId` | Do not expose | Do not expose by default | Internal actor id. |
| `approvedBy`/`rejectedBy`/`cancelledBy` | Do not expose | Do not expose raw ids by default | Internal actor ids; audit can retain. |
| `schoolId` | Do not expose | Do not expose | Tenant field. |
| `organizationId` | Do not expose | Do not expose | Tenant field. |
| `Student.userId` | Do not expose | Do not expose | Internal account link. |
| `Student.applicationId` | Do not expose | Do not expose | Internal registration idempotency anchor. |
| audit internals | Do not expose | Do not expose | Audit logs are separate historical evidence. |
| medical details | Do not expose | Do not include unless future medical workflow | Deferred sensitive domain. |
| guardian sensitive details | Do not expose | Do not include unless future guardian workflow | Deferred ownership domain. |

## Future Test Matrix

| Test area | Required scenario | Expected result |
| --- | --- | --- |
| student submits valid correction request | Student submits allowed fields and reason. | `PENDING` request created; Student unchanged. |
| student cannot submit empty changes | `changes` is empty or omitted. | Validation error. |
| student cannot submit disallowed fields | Body includes `userId`, `applicationId`, medical, guardian, avatar, or documents. | Validation error; Student unchanged. |
| student lists only own requests | Student has own and another Student's requests. | Only own requests returned. |
| student cancels own pending request | Student cancels a `PENDING` request. | Status becomes `CANCELLED`; Student unchanged. |
| student cannot cancel approved/rejected request | Student cancels terminal request. | Conflict error. |
| parent cannot use Student App correction routes | Parent actor calls Student routes. | Forbidden/unauthorized according to Student App convention. |
| applicant cannot use Student App correction routes | Applicant actor calls Student routes. | Forbidden/unauthorized according to Student App convention. |
| staff lists same-school pending requests | Staff with view permission lists requests. | Same-school requests only. |
| staff approves request and Student is updated transactionally | Staff approves pending request. | Student fields and request status update in one transaction. |
| staff rejects request and Student remains unchanged | Staff rejects pending request. | Request becomes `REJECTED`; Student unchanged. |
| cross-school request id is safe not-found | Staff/student guesses another school's request id. | Safe not-found behavior. |
| no internal ids leak in Student App response | Student App reads/list requests. | No tenant ids, actor ids, `Student.userId`, or `Student.applicationId`. |
| audit events written safely | Submit/cancel/approve/reject occur. | Correct audit actions with safe payload only. |

## Deferred Backlog Matrix

| Backlog item | Why deferred | Recommended owner sprint | Priority | Risk |
| --- | --- | --- | --- | --- |
| Parent/guardian correction request flow | Parent consent and field ownership differ from Student request flow. | Parent Correction Request Decision | Medium | High if mixed into Student flow. |
| Medical profile correction workflow | Medical profile is sensitive and staff-managed. | STU-MED Correction Decision | Medium | High privacy risk. |
| Guardian/emergency contact correction workflow | Guardian data is not solely Student-owned. | Guardian Contact Correction Decision | Medium | High ownership risk. |
| Direct non-official preferences edit | Preferences need durable fields and source-of-truth rules. | STU-PROF Preferences Decision | Low | Medium contract risk. |
| Student contact source-of-truth cleanup | Student contact and User account contact fields differ today. | Student Contact Source Audit | High | Medium consistency risk. |
| Profile correction attachments/evidence | Attachments require file visibility and retention policy. | Profile Correction Evidence Decision | Medium | Medium/High file risk. |
| Notification to staff on new request | Requires notification recipient/template policy. | Notifications Sprint | Medium | Low/Medium operational risk. |
| Notification to student on decision | Requires Student notification template and delivery policy. | Notifications Sprint | Medium | Low/Medium operational risk. |
| Bulk/admin repair tools | Data repair is separate from request workflow. | Admin Data Repair Sprint | Low | Medium if automated casually. |
