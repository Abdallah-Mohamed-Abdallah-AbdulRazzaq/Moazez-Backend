# ADM-REG-1F - Accepted Application Handoff-to-Wizard Implementation Closeout

## Sprint Summary

ADM-REG-1F implemented a read-only Admissions endpoint that prepares a wizard-compatible registration draft for accepted applications.

The endpoint is:

```text
GET /api/v1/admissions/applications/:id/registration-handoff
```

The endpoint does not create operational registration records. It does not call the school registration wizard submit use case. It only returns a safe preview for authorized school staff to review, complete, and submit separately through the existing school-side registration wizard.

## Files Changed

```text
src/modules/admissions/applications/applications.module.ts
src/modules/admissions/applications/controller/applications.controller.ts
src/modules/admissions/applications/application/get-application-registration-handoff.use-case.ts
src/modules/admissions/applications/dto/application-registration-handoff.dto.ts
src/modules/admissions/applications/infrastructure/applications.repository.ts
src/modules/admissions/applications/presenters/application-registration-handoff.presenter.ts
src/modules/admissions/applications/tests/application-registration-handoff.use-case.spec.ts
test/e2e/admissions-flow.e2e-spec.ts
test/security/tenancy.admissions.spec.ts
docs/sprint-adm-reg-1f-accepted-application-handoff-to-wizard-implementation-closeout.md
```

No Prisma schema, migration, package, Applicant Portal, Parent App, Student App, global guard, or schoolScope files were changed.

## Route Added

```text
GET /api/v1/admissions/applications/:id/registration-handoff
```

Controller:

```text
src/modules/admissions/applications/controller/applications.controller.ts
```

Use case:

```text
src/modules/admissions/applications/application/get-application-registration-handoff.use-case.ts
```

## Permissions Used

The route requires:

```text
admissions.applications.manage
```

This matches the existing non-mutating accepted handoff preview posture of:

```text
POST /api/v1/admissions/applications/:id/enroll
```

The route remains authenticated, school-scoped, and staff-only. Applicant, parent, and student actors are rejected by the existing scope/permission guard path.

## Handoff Response Summary

The response includes:

```text
applicationId
status
eligible
alreadyRegistered
eligibility
source.application
source.applicantRequest
source.lead
wizardDraft
documents
registered
warnings
missingRequiredForRegistration
```

When the application is not already registered, `wizardDraft` is compatible with the ADM-REG-1D school registration wizard input shape:

```text
student
guardians[]
enrollment
studentAccount
```

When a Student already exists for the application source, `alreadyRegistered` is true, `wizardDraft` is null, and the response returns a safe registered Student/enrollment summary instead of encouraging duplicate creation.

## Student Draft Mapping

The student draft uses the Admissions Application as the canonical school-side source:

```text
Application.studentName -> wizardDraft.student.name
Application.studentName -> wizardDraft.student.full_name_en
```

When a linked ApplicantAdmissionRequest belongs to the same school and application, it can prefill:

```text
childFirstName -> first_name_en
childLastName -> family_name_en
childDateOfBirth -> dateOfBirth / date_of_birth
childGender -> gender
childNationality -> nationality
```

If Application and ApplicantAdmissionRequest names conflict, the Application value wins and a warning is returned:

```text
application.applicant_request_name_conflict
```

Arabic name fields are not invented. They remain null in the draft unless a future source actually provides them.

## Guardian Draft Mapping

Guardian draft source order:

```text
1. ApplicantProfile, when linked through a same-school ApplicantAdmissionRequest
2. Lead contact fields, when no ApplicantProfile source is available
```

ApplicantProfile mapping:

```text
fullName -> full_name
relationship -> relation
phoneNumber -> phone_primary
contactEmail/email -> email
```

Lead fallback mapping:

```text
primaryContactName -> full_name
phone -> phone_primary
email -> email
```

The draft always defaults the relationship wrapper to:

```json
{ "is_primary": true }
```

Account mode defaults to:

```json
{ "mode": "none" }
```

The endpoint does not infer parent account creation or link the applicant user as a parent.

## Enrollment Draft Mapping

Enrollment draft uses Application placement as canonical:

```text
Application.requestedAcademicYearId -> wizardDraft.enrollment.academicYearId
Application.requestedGradeId -> wizardDraft.enrollment.gradeId
```

ApplicantAdmissionRequest placement is only a fallback if the Application value is missing. If Application and ApplicantAdmissionRequest placement values disagree, Application wins and a warning is returned.

The following remain intentionally null because source data cannot safely infer them:

```text
classroomId
sectionId
termId
enrollmentDate
```

The response always reports these wizard-submit requirements when missing:

```text
enrollment.classroomId
enrollment.enrollmentDate
```

No classroom, section, term, or enrollment is auto-selected or created.

## Document / Source Summary Behavior

The endpoint includes safe ApplicationDocument summaries:

```text
applicationDocumentId
documentType
status
notes
source
file.id
file.originalName
file.mimeType
file.sizeBytes
```

It does not expose:

```text
bucket
objectKey
signed URLs
download URLs
storage internals
deletedAt
```

Pending document review is reported as a warning, but it is not blocking in ADM-REG-1F because the existing accepted handoff validator does not enforce document acceptance as a required rule.

## Eligibility Behavior

The use case reuses the existing accepted application handoff validator baseline:

```text
Application is in current school scope
Application status is ACCEPTED
Latest decision is ACCEPT
At least one placement test exists
All placement tests are COMPLETED
At least one interview exists
All interviews are COMPLETED
```

When the validator fails, the route keeps the existing error behavior instead of inventing a new success-with-errors shape.

The returned eligibility object includes:

```text
canPrepareHandoff
canSubmitRegistration
reasonCodes
placementTests total/completed
interviews total/completed
documents included/blockingPolicy
```

`canSubmitRegistration` remains false because staff must complete missing wizard fields and submit the school registration wizard separately.

## Already Registered Behavior

The endpoint detects an existing operational Student through:

```text
Student.applicationId + current school scope
```

When found:

```text
alreadyRegistered = true
wizardDraft = null
registered.student = safe presentStudent output
registered.enrollment = safe active enrollment output when present
warnings includes application.already_registered
```

If an existing Student has no active enrollment, the endpoint adds:

```text
application.already_has_student_without_active_enrollment
```

No repair or duplicate resolution is attempted in this sprint.

## Identity Boundary Confirmation

ADM-REG-1F does not:

```text
create Student
create Guardian
create StudentGuardian
create Enrollment
create Parent account
create Student account
create Membership
create Applicant-to-Parent link
create Applicant-to-Student link
create StudentDocument
mutate UserType.APPLICANT
grant applicant membership
call the school registration wizard submit use case
```

Applicant identity remains separate, consistent with ADR-0003 and ADM-REG-1B/1E.

## Security / No-Leak Confirmation

The response presenter strips internal ownership and credential fields from the app-facing payload.

The endpoint must not return:

```text
schoolId
organizationId
userId
membershipId
roleId
passwordHash
deletedAt
applicantUserId
applicantProfileId
bucket
objectKey
raw signed URLs
internal actor ids
```

Security coverage confirms:

```text
cross-school application ids return not-found behavior
same-school users without admissions.applications.manage are forbidden
applicant actors are forbidden
parent actors are forbidden
student actors are forbidden
```

## Tests Run

```text
npx prisma validate
npm run build
npm test -- --runInBand src/modules/admissions/applications/tests
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-flow.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.school-registration.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/school-registration-wizard.e2e-spec.ts
```

## Results

```text
npx prisma validate: passed
npm run build: passed
src/modules/admissions/applications/tests: 3 suites passed, 13 tests passed
test/e2e/admissions-flow.e2e-spec.ts: 1 suite passed, 3 tests passed
test/security/tenancy.admissions.spec.ts: 1 suite passed, 32 tests passed
test/security/tenancy.school-registration.spec.ts: 1 suite passed, 6 tests passed
test/e2e/school-registration-wizard.e2e-spec.ts: 1 suite passed, 1 test passed
```

Note: the first build attempt timed out and left a generated `dist` process/cleanup lock. The stale build process was stopped, generated `dist` output was cleaned, and the build was rerun successfully.

## Known Limitations

```text
Document acceptance is summarized but not blocking.
StudentDocument migration is deferred.
Source-bound wizard submit is deferred.
Application-source idempotent registration submit is deferred.
Duplicate resolution is deferred.
Applicant-to-parent/student conversion remains deferred.
Parent and student account creation/linking remain wizard-only choices, not handoff behavior.
Enrollment placement still requires staff to choose classroom and enrollment date before wizard submit.
```

## Explicit Deferred Items

```text
Future source-bound registration sprint: submit with applicationId idempotency.
Future product decision: whether mandatory document acceptance should block registration handoff.
Future scoped sprint: StudentDocument creation from Admissions/ApplicationDocument evidence.
Future ADR revisit only if applicant identity transition semantics change.
```

## Final Verdict

```text
ADM_REG_1F_ACCEPTED_APPLICATION_HANDOFF_TO_WIZARD_READY
```
