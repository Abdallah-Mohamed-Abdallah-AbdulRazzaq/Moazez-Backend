# ADM-REG-1J — Admissions Registration Flow Final Closeout Audit

## 1. Executive Summary

ADM-REG is ready to close as a registration flow. The implemented V1 path is a school-controlled Admissions-to-Registration workflow:

1. Applicant Portal collects pre-admission intake data and documents.
2. Admissions staff review the school-side application, documents, placement tests, interviews, and decision.
3. Accepted applications can be previewed as a wizard-compatible handoff draft.
4. School staff can explicitly submit a completed registration payload from the accepted application.
5. The submit path reuses the school registration wizard to create operational Student, Guardian, StudentGuardian, and Enrollment records.
6. Source-bound idempotency is stored on `Student.applicationId` within the current school scope.
7. Admissions application closure remains derived from operational records through `registrationState`; `Application.status` remains the admissions workflow state.

The flow does not convert Applicant identity. `UserType.APPLICANT` remains a pre-admission identity, does not receive a school membership through ADM-REG, and is not automatically linked to `Guardian.userId` or `Student.userId`. Parent App and Student App visibility still depend on their normal operational account, membership, link, active Student, and active Enrollment chains.

The implemented flow supports staff-controlled registration from accepted applications. It does not implement Applicant-to-Parent conversion, StudentDocument migration, Student avatar/profile self-service, dashboard counters, post-registration decision mutation guards, duplicate matching beyond `applicationId`, or optional account retry/recovery.

Recommended next step: finish ADM-REG-1J as the final closeout for this flow. Do not keep adding loosely related features inside ADM-REG. The safest next sprint is `ADM-REG-DOC-1A — Admissions Documents to Student Documents Decision Lock`.

## 2. Source Evidence Reviewed

Planning, audit, and closeout evidence:

- `docs/sprint-adm-reg-1a-registration-reality-audit.md`
- `docs/sprint-adm-reg-1b-registration-contract-decision-lock.md`
- `docs/sprint-adm-reg-1c-student-guardian-profile-persistence-repair-closeout.md`
- `docs/sprint-adm-reg-1d-school-registration-wizard-foundation-closeout.md`
- `docs/sprint-adm-reg-1e-accepted-applicant-conversion-audit-handoff-expansion.md`
- `docs/sprint-adm-reg-1f-accepted-application-handoff-to-wizard-implementation-closeout.md`
- `docs/sprint-adm-reg-1g-accepted-application-source-bound-registration-submit-closeout.md`
- `docs/sprint-adm-reg-1h-post-registration-admissions-closure-audit-decision-lock.md`
- `docs/sprint-adm-reg-1i-admissions-registered-state-exposure-closeout.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`

Governance evidence:

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

Runtime evidence inspected:

- `prisma/schema.prisma`
- `src/modules/applicant-portal/infrastructure/applicant-portal.repository.ts`
- `src/modules/admissions/applications/controller/applications.controller.ts`
- `src/modules/admissions/applications/application/register-accepted-application.use-case.ts`
- `src/modules/admissions/applications/application/get-application-registration-handoff.use-case.ts`
- `src/modules/admissions/applications/validators/application-enrollment-handoff.validator.ts`
- `src/modules/admissions/applications/presenters/application.presenter.ts`
- `src/modules/admissions/applications/presenters/application-registration-handoff.presenter.ts`
- `src/modules/students/registration/application/create-school-registration.use-case.ts`
- `src/modules/students/registration/infrastructure/school-registration.repository.ts`
- `src/modules/students/documents/controller/student-documents.controller.ts`
- `src/modules/students/documents/controller/documents.controller.ts`
- `src/modules/students/documents/application/create-student-document.use-case.ts`
- `src/modules/parent-app/access/parent-app-access.service.ts`
- `src/modules/student-app/access/student-app-access.service.ts`
- `src/modules/student-app/profile/controller/student-profile.controller.ts`
- `src/modules/student-app/profile/application/get-student-profile.use-case.ts`

Test evidence reviewed from ADM-REG closeouts and current test files:

- `src/modules/admissions/applications/tests`
- `src/modules/students/registration/tests`
- `test/e2e/admissions-flow.e2e-spec.ts`
- `test/e2e/admissions-registration-submit.e2e-spec.ts`
- `test/e2e/school-registration-wizard.e2e-spec.ts`
- `test/security/tenancy.admissions.spec.ts`
- `test/security/tenancy.admissions-registration-submit.spec.ts`
- `test/security/tenancy.school-registration.spec.ts`

## 3. Final Flow Map

```text
Applicant Portal
  -> Applicant user remains UserType.APPLICANT
  -> ApplicantAdmissionRequest + ApplicantAdmissionRequestDocument
  -> submit bridges to Admissions Application + ApplicationDocument

Admissions Review
  -> staff reviews application/documents/tests/interviews
  -> latest AdmissionDecision must be ACCEPT
  -> Application.status must be ACCEPTED
  -> placement tests and interviews must exist and be completed

Read-only Handoff Preview
  -> GET /api/v1/admissions/applications/:id/registration-handoff
  -> returns wizardDraft, safe source summaries, document summaries, missing fields
  -> creates nothing

Source-Bound Registration Submit
  -> POST /api/v1/admissions/applications/:id/register
  -> route :id is trusted source application id
  -> body applicationId is not accepted
  -> calls school registration wizard internally

School Registration Wizard
  -> creates Student
  -> creates Guardian(s)
  -> creates StudentGuardian link(s)
  -> creates Enrollment
  -> optionally creates/links Parent account(s)
  -> optionally creates/links Student account
  -> normal wizard keeps Student.applicationId null
  -> Admissions source-bound path sets Student.applicationId internally

Admissions Closure
  -> Application.status remains ACCEPTED
  -> registrationState is derived from same-school Student.applicationId
  -> registeredAt remains null because no durable registeredAt field exists
```

## 4. ADM-REG Sprint-by-Sprint Closeout

| Sprint | Type | Goal | Implemented? | Commit / Evidence | Final state |
|---|---|---:|---|---|---|
| ADM-REG-1A | Documentation audit | Establish current reality for admissions, registration, students, guardians, enrollments, and app visibility. | Yes | `4d9ec5ce`; `docs/sprint-adm-reg-1a-registration-reality-audit.md` | Confirmed intake/review/manual registration existed; no accepted applicant conversion or unified wizard existed. |
| ADM-REG-1B | Documentation decision lock | Lock conservative V1 registration contract. | Yes | `dfb17519`; `docs/sprint-adm-reg-1b-registration-contract-decision-lock.md` | Locked profile repair, school wizard, then accepted application handoff; Applicant identity remains separate. |
| ADM-REG-1C | Implementation | Persist Student and Guardian profile fields already accepted by DTOs. | Yes | `79490659`; `docs/sprint-adm-reg-1c-student-guardian-profile-persistence-repair-closeout.md`; `prisma/schema.prisma` | Student/Guardian rich profile fields are durable and presented; no identity conversion. |
| ADM-REG-1D | Implementation | Add school-side registration wizard foundation. | Yes | `cb314af8`; `docs/sprint-adm-reg-1d-school-registration-wizard-foundation-closeout.md`; `src/modules/students/registration/**` | `POST /api/v1/students-guardians/registrations` creates core operational records and optional accounts. |
| ADM-REG-1E | Documentation audit/design | Design accepted application handoff-to-wizard contract. | Yes | `60e6adea`; `docs/sprint-adm-reg-1e-accepted-applicant-conversion-audit-handoff-expansion.md` | Locked handoff preview, no automatic conversion, no Applicant mutation, no StudentDocument migration. |
| ADM-REG-1F | Implementation | Add read-only accepted application registration handoff preview. | Yes | `4c866817`; `docs/sprint-adm-reg-1f-accepted-application-handoff-to-wizard-implementation-closeout.md`; `src/modules/admissions/applications/**` | `GET /api/v1/admissions/applications/:id/registration-handoff` returns safe wizard draft and source/document summaries. |
| ADM-REG-1G | Implementation | Add source-bound accepted application registration submit. | Yes | `df5f42fd`; `docs/sprint-adm-reg-1g-accepted-application-source-bound-registration-submit-closeout.md`; `src/modules/admissions/applications/application/register-accepted-application.use-case.ts` | `POST /api/v1/admissions/applications/:id/register` delegates to wizard and sets `Student.applicationId` internally. |
| ADM-REG-1H | Documentation decision lock | Lock post-registration Admissions closure policy. | Yes | `7bdbf538`; `docs/sprint-adm-reg-1h-post-registration-admissions-closure-audit-decision-lock.md` | Closure is derived from `Student.applicationId + schoolId`; `Application.status` remains ACCEPTED. |
| ADM-REG-1I | Implementation | Expose derived registered state to staff-facing Admissions responses. | Yes | `4db7bb08`; `docs/sprint-adm-reg-1i-admissions-registered-state-exposure-closeout.md`; `src/modules/admissions/applications/presenters/application.presenter.ts` | `registrationState` is exposed; `registeredAt` remains null; no schema/status changes. |
| ADM-REG-1J | Documentation final audit | Close out the ADM-REG flow and lock next-step boundaries. | Yes | This document | Final closeout recommends moving next work to a separate document-focused decision sprint. |

## 5. Current Implemented Capabilities

| Capability | Implemented today? | Source of truth | Evidence | Limitations |
|---|---:|---|---|---|
| Create Student | Yes | Students module / registration wizard | `src/modules/students/students/**`; `src/modules/students/registration/application/create-school-registration.use-case.ts` | Direct accepted applicant auto-conversion is not implemented. |
| Persist Student profile fields | Yes | Student model and presenter | `prisma/schema.prisma` `Student`; ADM-REG-1C closeout | `student_id` remains deferred/null-only; `applicationId` and `userId` remain internal. |
| Create Guardian | Yes | Guardians module / registration wizard | `src/modules/students/guardians/**`; `src/modules/students/registration/**` | Guardian creation does not imply Parent account creation unless requested. |
| Persist Guardian profile fields | Yes | Guardian model and presenter | `prisma/schema.prisma` `Guardian`; ADM-REG-1C closeout | `Guardian.isPrimary` remains backward-compatible; canonical per-student primary is `StudentGuardian.isPrimary`. |
| Link StudentGuardian | Yes | StudentGuardian relationship | `src/modules/students/guardians/**`; `src/modules/students/registration/infrastructure/school-registration.repository.ts` | No broad duplicate guardian resolution. |
| Primary guardian relation | Yes | StudentGuardian link | `StudentGuardian.isPrimary`; wizard auto-primary behavior in ADM-REG-1D | Primary behavior is not redesigned globally. |
| Create Enrollment | Yes | Enrollments module / wizard | `src/modules/students/enrollments/**`; `src/modules/students/registration/**` | Enrollment creation consumes existing/new Student; it does not create Applicant conversion by itself. |
| Classroom placement | Yes | Enrollment placement services | `src/modules/students/enrollments/**`; ADM-REG-1D closeout | Handoff preview cannot auto-select classroom/term/section; staff must complete missing placement fields. |
| Optional Parent account/link | Yes | Student account/guardian account linking through wizard | `src/modules/students/account/**`; `src/modules/students/registration/application/create-school-registration.use-case.ts` | Optional failure returns warnings and does not roll back core registration. |
| Optional Student account/link | Yes | Student account linking through wizard | `src/modules/students/account/**`; wizard closeout | Optional failure returns warnings; Student App activation still requires the full chain. |
| Accepted application handoff preview | Yes | Admissions application handoff | `GET /api/v1/admissions/applications/:id/registration-handoff`; ADM-REG-1F closeout | Read-only; does not create operational records. |
| Accepted application register submit | Yes | Admissions source-bound submit | `POST /api/v1/admissions/applications/:id/register`; ADM-REG-1G closeout | Staff-only; uses wizard; no Applicant mutation. |
| Idempotent source-bound registration | Yes | `Student.applicationId + schoolId` | `prisma/schema.prisma` `Student` unique constraint; register use case | If Student exists without active Enrollment, response warns but does not repair. |
| registrationState exposure | Yes | Admissions application presenter | `src/modules/admissions/applications/presenters/application.presenter.ts` | `registeredAt` is null; list/dashboard expansion remains intentionally limited to implemented responses. |
| Applicant-to-parent conversion | No | ADR-0003 / ADM-REG decisions | `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`; ADM-REG-1B/1E/1G | Requires separate identity ADR/sprint if ever pursued. |
| StudentDocument migration | No | Students documents module exists separately | `src/modules/students/documents/**`; ADM-REG-1E/1F decisions | Application/Applicant documents are not migrated to StudentDocument. |
| Student avatar/profile self-service | No | Student App profile is read-only | `src/modules/student-app/profile/**` | Avatar/profile mutation belongs to a separate Student Profile sprint, not ADM-REG. |

## 6. Admissions Source-Bound Registration Behavior

Accepted application preview is implemented at:

```text
GET /api/v1/admissions/applications/:id/registration-handoff
```

The route is staff-facing, authenticated, and school-scoped. It returns a wizard-compatible draft, safe application/applicant/lead summaries, safe document summaries, warnings, missing fields, and already-registered state. It creates no Student, Guardian, StudentGuardian, Enrollment, account, membership, Applicant link, or StudentDocument.

Accepted application submit is implemented at:

```text
POST /api/v1/admissions/applications/:id/register
```

The route uses the route `:id` as the trusted source application id. It does not accept `applicationId` from the body and does not expose `applicationId` in Student responses. It validates the accepted application with the existing handoff validator, checks same-school idempotency through `Student.applicationId`, and delegates operational record creation to `CreateSchoolRegistrationUseCase`.

Eligibility before source-bound registration:

- Application must belong to the current school scope.
- `Application.status` must be `ACCEPTED`.
- Latest `AdmissionDecision` must be `ACCEPT`.
- At least one placement test must exist.
- All placement tests must be completed.
- At least one interview must exist.
- All interviews must be completed.
- Documents are summarized as evidence, but document acceptance is not a new blocking rule in ADM-REG.

Operational records created by submit:

- Student
- Guardian(s)
- StudentGuardian link(s)
- Enrollment
- Optional Parent account/create or link, when requested
- Optional Student account/create or link, when requested

Records not created by submit:

- Applicant-to-Parent link
- Applicant-to-Student link
- Applicant school membership
- StudentDocument from Applicant/Application documents
- Parent App or Student App activation outside normal operational chains

Repeat submit behavior is idempotent. If a same-school Student already exists with `applicationId = route application id`, the route returns `alreadyRegistered` with safe existing Student/Enrollment summary and creates no duplicates. If a Student exists without active Enrollment, it returns an already-registered warning and does not attempt repair.

## 7. Student / Guardian / Enrollment Behavior

The school can create a Student manually through the Students module and through the school registration wizard. ADM-REG-1C repaired Student persistence so DTO-accepted profile fields are durably stored and returned, including English and Arabic name parts, gender, nationality, and contact fields. `student_id` remains deferred/null-only. `applicationId` and `userId` are operational links and are not exposed in Student public response shapes.

The school can create Guardian profiles and link them to Students. ADM-REG-1C repaired Guardian profile persistence for secondary phone, national id, job/workplace fields, pickup permission, and notification permission. `Guardian.userId` remains an internal operational account link. A Guardian may exist without a Parent user. A Parent user may exist without being linked to a Guardian. Parent App visibility only activates after the full operational chain exists.

`StudentGuardian.isPrimary` remains the canonical per-student primary guardian relationship. The registration wizard ensures at least one primary guardian by treating the first guardian as primary when none is explicitly marked.

Enrollment creation uses existing enrollment placement validation and seat-limit behavior. The wizard requires completed placement information such as `classroomId` and `enrollmentDate`. Handoff preview can prefill academic year and grade when known, but it does not auto-select classroom, section, term, or enrollment date.

Optional account creation/linking is intentionally not part of the core Student/Guardian/Enrollment transaction. If optional Parent or Student account creation/linking fails, the core operational registration remains created and the response includes warnings. Optional account retry/recovery is deferred.

## 8. Application Lifecycle and registrationState

The current `AdmissionApplicationStatus` enum in `prisma/schema.prisma` contains:

```text
SUBMITTED
DOCUMENTS_PENDING
UNDER_REVIEW
ACCEPTED
WAITLISTED
REJECTED
```

There is no `REGISTERED`, `ENROLLED`, or `CLOSED` application status. ADM-REG-1H locked the policy that registration does not mutate `Application.status`. After source-bound registration, the application remains `ACCEPTED`.

Staff-facing Admissions responses expose a derived `registrationState` through `src/modules/admissions/applications/presenters/application.presenter.ts`. The source is same-school `Student.applicationId = Application.id`.

Conceptual response:

```json
{
  "status": "accepted",
  "registrationState": {
    "registered": true,
    "studentId": "safe-student-id",
    "enrollmentId": "safe-active-enrollment-id-or-null",
    "enrollmentStatus": "active-or-null",
    "registeredVia": "admissions_application",
    "registeredAt": null,
    "source": "derived_from_student_application_id"
  }
}
```

`registeredAt` remains null because no durable `registeredAt`, `closedAt`, or `enrolledAt` field exists, and audit logs are not used as the primary current-state query source. The `admissions.application.register` audit event is historical evidence, while `Student.applicationId + schoolId` remains the current-state source.

## 9. Applicant / Parent / Student Identity Boundary

| Actor / Concept | Current behavior | Can change in ADM-REG? | Future owner | Decision |
|---|---|---:|---|---|
| Applicant user | Created as `UserType.APPLICANT`; remains pre-admission identity. | No | Future identity ADR | Do not mutate Applicant into Parent or Student. |
| Parent user | Operational `UserType.PARENT` account can be created/linked optionally by school staff. | No broad change | IAM / Students account linking | Parent identity is separate from Applicant identity. |
| Student user | Operational `UserType.STUDENT` account can be created/linked optionally by school staff. | No broad change | IAM / Students account linking | Student identity is separate from Applicant identity. |
| Guardian.userId | Internal optional link from Guardian profile to Parent user. | No casual change | Students / IAM | Never set to Applicant user automatically. |
| Student.userId | Internal optional link from Student record to Student user. | No casual change | Students / IAM | Never set to Applicant user automatically. |
| Membership | Parent/Student accounts need active school memberships for app access. | No Applicant membership in ADM-REG | IAM | Applicant receives no school membership through ADM-REG. |
| Parent App visibility | Derived from Parent user, membership, Guardian.userId, StudentGuardian, active Student, active Enrollment. | No | Parent App / Students | Do not infer from Application status or Applicant ownership. |
| Student App visibility | Derived from Student user, membership, Student.userId, active Student, active Enrollment. | No | Student App / Students | Do not infer from Application status or Applicant ownership. |
| Applicant Portal | Pre-admission route-local access to applicant-owned requests/docs. | No | Applicant Portal | Does not gain school dashboard access. |

Parent App visibility still requires:

```text
UserType.PARENT active user
active school membership
Guardian.userId = parent user id
Guardian not deleted
StudentGuardian link exists
Student active and not deleted
Enrollment active and not deleted
current school scope
```

Student App visibility still requires:

```text
UserType.STUDENT active user
active school membership
Student.userId = student user id
Student active and not deleted
Enrollment active and not deleted
current school scope
```

These chains are implemented as app-facing composition/read-model access behavior in `src/modules/parent-app/access/parent-app-access.service.ts` and `src/modules/student-app/access/student-app-access.service.ts`.

## 10. Documents and Files Boundary

| Document type | Current source | Visible in handoff? | Migrated to StudentDocument? | Storage internals exposed? | Decision |
|---|---|---:|---:|---:|---|
| ApplicantAdmissionRequestDocument | Applicant Portal uploads | Indirectly through bridged application/source evidence when available | No | No | Keep as intake evidence; migration requires separate decision. |
| ApplicationDocument | Admissions application documents | Yes, as safe summaries in handoff | No | No | Safe for staff evidence; do not migrate in ADM-REG. |
| StudentDocument | Students documents module | Not created by handoff/register | N/A | No | Existing separate module for student records; no automatic ADM-REG migration. |
| Homework/task submission files | Student/classroom academic workflows | No | No | No | Not student profile documents and not part of ADM-REG. |
| Student avatar/profile files | Student profile/self-service | No | No | No | Not implemented in ADM-REG; requires separate Student Profile audit. |

Applicant/Application documents are not migrated to StudentDocument by ADM-REG. The handoff endpoint may show safe document summaries, but storage internals such as buckets, object keys, signed URLs, and raw storage paths must remain hidden.

The existing Students documents module provides school-side StudentDocument behavior under Students/Guardians routes, but ADM-REG does not automatically transform Admissions evidence into Student profile documents.

## 11. Student Self-Service Boundary

Student App profile behavior is read-only in the inspected implementation. The Student profile controller exposes a read endpoint, and the profile DTO continues to report unsupported profile/avatar mutation behavior. Student avatar upload, Student profile field editing, and Student profile document upload are not implemented by ADM-REG.

Homework/task submission files are not the same as Student profile documents. They belong to academic assignment workflows and should not be used as evidence that Student self-service profile document management exists.

Student profile/avatar/self-service work should be owned by a separate Student Profile sprint, not by Admissions Registration closure.

## 12. Security, Tenancy, and No-Leak Review

Registration and Admissions routes remain school-scoped and staff-facing:

- `GET /api/v1/admissions/applications/:id` uses existing Admissions detail permissions.
- `GET /api/v1/admissions/applications/:id/registration-handoff` uses staff Admissions access.
- `POST /api/v1/admissions/applications/:id/register` requires Admissions manage and Students/Guardians/Enrollments manage permissions.
- `POST /api/v1/students-guardians/registrations` remains a school-side Students/Guardians route.

Controllers remain thin and delegate to use cases. Inspected controllers do not contain Prisma business logic directly. Runtime work is in application use cases, repositories, validators, and presenters.

No global guard weakening or `schoolScope` weakening was required. Cross-school application guesses use existing scoped lookup behavior and should return safe not-found/forbidden-style outcomes according to current route patterns.

No-leak boundaries:

- `Student.applicationId` is internal and not exposed in Student response objects.
- `Student.userId` and `Guardian.userId` are internal operational account links.
- `schoolId`, `organizationId`, `membershipId`, `roleId`, `passwordHash`, `deletedAt`, applicant internal ids, and storage internals must not appear in app-facing or dashboard-facing responses.
- Guardian `national_id` is profile PII and may appear only where the Guardian profile contract intentionally exposes it; it must not be included in audit payloads, warnings, or error details.
- Temporary passwords may be returned only by existing account creation behavior in the same request and must not be logged.

## 13. Test and Verification Coverage

Focused flow coverage exists across unit, e2e, and security suites.

Relevant test areas:

- `src/modules/admissions/applications/tests`
- `src/modules/students/registration/tests`
- `test/e2e/admissions-flow.e2e-spec.ts`
- `test/e2e/admissions-registration-submit.e2e-spec.ts`
- `test/e2e/school-registration-wizard.e2e-spec.ts`
- `test/security/tenancy.admissions.spec.ts`
- `test/security/tenancy.admissions-registration-submit.spec.ts`
- `test/security/tenancy.school-registration.spec.ts`

Last reported ADM-REG-1I verification:

- `npx prisma validate` passed.
- `npm run build` passed after clearing stale `dist`.
- `npm test -- --runInBand src/modules/admissions/applications/tests` passed: 5 suites, 24 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-flow.e2e-spec.ts` passed: 1 suite, 3 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions.spec.ts` passed: 1 suite, 36 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-registration-submit.e2e-spec.ts` passed: 1 suite, 3 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions-registration-submit.spec.ts` passed: 1 suite, 6 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/school-registration-wizard.e2e-spec.ts` passed: 1 suite, 1 test.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.school-registration.spec.ts` passed: 1 suite, 6 tests.

ADM-REG-1J is documentation-only, so no build or runtime tests were required for this sprint. The relevant regression areas to protect in the next implementation sprint are:

- Handoff preview remains read-only.
- Register submit remains idempotent.
- Public school wizard still leaves `Student.applicationId = null`.
- Admissions source-bound register sets `Student.applicationId` only from the trusted route id.
- `Application.status` remains `ACCEPTED` after registration.
- `registrationState` remains derived and safe.
- Applicant identity remains unchanged.
- Parent App and Student App visibility continue to require operational chains.

## 14. Known Limitations

- No Applicant-to-Parent or Applicant-to-Student identity transition exists.
- No Applicant school membership is created by ADM-REG.
- Document review is not a new blocking condition for registration submit beyond existing handoff validator rules.
- Applicant/Application documents are not migrated into StudentDocument records.
- No `registeredAt`, `closedAt`, `enrolledAt`, or `registeredBy` field exists.
- `registrationState.registeredAt` is therefore null.
- `Application.status` alone does not show post-registration closure.
- Optional Parent/Student account create/link failures do not roll back core registration.
- Optional account retry/recovery is not implemented.
- Data drift repair is not automatic, including Student-without-active-Enrollment cases.
- Duplicate matching is limited to accepted application source idempotency through `Student.applicationId`.
- Student profile/avatar/self-service mutation is not implemented.
- Dashboard/reporting counters for registered accepted applications are not implemented.
- Post-registration decision mutation guard is not implemented.

## 15. Deferred Backlog

| Backlog item | Why deferred | Recommended owner sprint | Risk | Priority |
|---|---|---|---|---|
| StudentDocument migration decision | Applicant/Application docs are evidence, but migration semantics are not locked. | `ADM-REG-DOC-1A — Admissions Documents to Student Documents Decision Lock` | Medium: document expectations may diverge across staff workflows. | High |
| Student profile/avatar/self-service audit | Student App profile is read-only; avatar/profile uploads are separate from registration. | `STU-PROF-1A — Student Profile / Avatar / Self-Service Audit` | Medium: users may expect self-service after enrollment. | Medium |
| Applicant-to-parent identity decision | ADR-0003 explicitly separates Applicant from Parent; conversion needs identity policy. | Future identity ADR / `IAM-APP-1A` | High: unsafe identity mutation could leak school access. | Low for immediate ADM-REG closure |
| Optional account retry/recovery | Wizard can complete core records while optional accounts fail. | `ADM-REG-ACCT-1A — Optional Account Recovery Decision Lock` | Medium: operational follow-up may be manual. | Medium |
| Post-registration decision mutation guard | Current flow derives closure but does not block contradictory later decisions. | `ADM-REG-1K` or `ADM-REG-GUARD-1A` | Medium: staff could create confusing historical state. | Medium |
| Admissions registered dashboard counters | Reporting definitions need product clarity to avoid double-counting. | Admissions reporting sprint | Low/Medium: visibility gap, not data integrity gap. | Low |
| Duplicate student matching beyond applicationId | Broad matching policy was intentionally not invented. | Student records/data quality sprint | High if implemented casually. | Low |
| Data drift/admin repair tooling | Cases like Student without active Enrollment need manual/admin policy. | Admin data repair sprint | Medium: rare but operationally sensitive. | Low |

## 16. Recommended Next Sprint Decision

| Option | Name | Why | Risk | Recommended now? |
|---|---|---|---|---:|
| Option A | ADM-REG final closeout only | Stops feature creep and treats ADM-REG as complete. | Low; no runtime change. | No, this document completes it. |
| Option B | `ADM-REG-DOC-1A — Admissions Documents to Student Documents Decision Lock` | Documents are the closest unresolved boundary after registration closure. | Low as audit/decision; medium if implemented without decision. | Yes |
| Option C | `STU-PROF-1A — Student Profile / Avatar / Self-Service Audit` | Student self-service is separate and currently read-only. | Low as audit; medium if mixed into ADM-REG. | Not first unless product prioritizes student self-service. |
| Option D | Applicant-to-parent identity ADR | Could define future identity linking, but is not required for ADM-REG closure. | High: identity/access mistakes are costly. | No |
| Option E | Post-registration decision mutation guard | Useful policy hardening after closure visibility. | Medium: could affect Admissions workflows. | Not before document boundary is locked. |

Recommended next sprint:

```text
ADM-REG-DOC-1A — Admissions Documents to Student Documents Decision Lock
```

Recommended scope:

- Audit ApplicantAdmissionRequestDocument, ApplicationDocument, and StudentDocument contracts.
- Decide whether accepted application registration should ever create StudentDocument records.
- Decide source metadata, file ownership, storage visibility, and duplicate behavior.
- Decide whether migration is manual, staff-confirmed, or never automatic.
- Do not implement migration in the decision sprint.

ADM-REG itself should not continue as a catch-all feature bucket after 1J.

## 17. Explicit Do-Not-Do List

- Do not convert Applicant to Parent as part of registration.
- Do not convert Applicant to Student as part of registration.
- Do not create Applicant school membership.
- Do not automatically link Applicant user to `Guardian.userId`.
- Do not automatically link Applicant user to `Student.userId`.
- Do not mutate `Application.status` to registered, enrolled, or closed.
- Do not add a new `REGISTERED`, `ENROLLED`, or `CLOSED` Application status casually.
- Do not add `registeredAt`, `closedAt`, `enrolledAt`, or `registeredBy` without product/reporting decision.
- Do not migrate Applicant or Application documents to StudentDocument without a decision sprint.
- Do not add Student profile/avatar uploads inside ADM-REG.
- Do not use audit logs as the primary current-state query source.
- Do not infer Parent App visibility from `Application.status`.
- Do not infer Student App visibility from `Application.status`.
- Do not bypass `schoolScope` to resolve registration state.
- Do not add duplicate matching beyond `Student.applicationId` without a data-quality policy.
- Do not make document acceptance a registration blocker without an explicit workflow decision.
- Do not broaden Applicant Portal routes into operational school dashboard access.

## 18. Final Verdict

```text
ADM_REG_1J_REGISTRATION_FLOW_FINAL_CLOSEOUT_READY
```

ADM-REG now has a coherent V1 registration flow: applicant intake remains pre-admission, Admissions review remains school-side, accepted application preview is read-only, registration submit is explicit and staff-controlled, operational records are created through the school wizard, source idempotency is anchored by `Student.applicationId`, and Admissions closure is exposed through derived `registrationState` without mutating `Application.status`.

The flow is closed for ADM-REG purposes. The safest next work is a separate decision sprint for Admissions documents to StudentDocument boundaries, not Applicant identity conversion or more implicit registration behavior.
