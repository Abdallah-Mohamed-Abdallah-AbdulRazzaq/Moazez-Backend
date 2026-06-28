# ADM-REG-1G — Accepted Application Source-Bound Registration Submit Closeout

## Sprint Summary

ADM-REG-1G implemented a school-staff-only Admissions registration submit endpoint that creates operational registration records from an accepted Admissions application by reusing the existing ADM-REG-1D school registration wizard.

The implementation is source-bound and explicit:

- The route application id is the trusted source application id.
- Accepted application eligibility is validated with the existing handoff validator.
- Registration creation is delegated to `CreateSchoolRegistrationUseCase`.
- `Student.applicationId` is set only through the internal Admissions source context.
- Duplicate submit calls return a safe already-registered response.
- Applicant identity, Applicant Portal behavior, Parent App behavior, and Student App behavior are unchanged.

## Files Changed

- `src/modules/admissions/applications/application/register-accepted-application.use-case.ts`
- `src/modules/admissions/applications/applications.module.ts`
- `src/modules/admissions/applications/controller/applications.controller.ts`
- `src/modules/admissions/applications/dto/application-registration-submit.dto.ts`
- `src/modules/admissions/applications/presenters/application-registration-submit.presenter.ts`
- `src/modules/admissions/applications/tests/register-accepted-application.use-case.spec.ts`
- `src/modules/students/registration/application/create-school-registration.use-case.ts`
- `src/modules/students/registration/registration.module.ts`
- `src/modules/students/registration/tests/school-registration.use-case.spec.ts`
- `test/e2e/admissions-registration-submit.e2e-spec.ts`
- `test/security/tenancy.admissions-registration-submit.spec.ts`
- `docs/sprint-adm-reg-1g-accepted-application-source-bound-registration-submit-closeout.md`

## Route Added

```text
POST /api/v1/admissions/applications/:id/register
```

The existing preview route remains read-only:

```text
GET /api/v1/admissions/applications/:id/registration-handoff
```

## Permissions Used

The submit route requires all of:

```text
admissions.applications.manage
students.records.manage
students.guardians.manage
students.enrollments.manage
```

This keeps the action both Admissions-owned and operational-registration-scoped.

## Request / Response Summary

Request body reuses the school registration wizard command shape:

- `student`
- `guardians`
- `enrollment`
- optional guardian `account`
- optional `studentAccount`

The route does not accept public `applicationId`. If `applicationId` appears in the body, request validation rejects it before it can affect registration.

Successful response:

```text
applicationId
registered: true
alreadyRegistered: false
registration: <safe school registration wizard response>
warnings
```

Already-registered response:

```text
applicationId
registered: true
alreadyRegistered: true
registration.student
registration.enrollment
warnings: ["application.already_registered", ...]
```

## Eligibility Behavior

The submit endpoint reuses `ApplicationEnrollmentHandoffValidator`.

Required baseline remains:

- Application belongs to current school scope.
- Application status is `ACCEPTED`.
- Latest decision is `ACCEPT`.
- At least one placement test exists.
- All placement tests are `COMPLETED`.
- At least one interview exists.
- All interviews are `COMPLETED`.

Document acceptance is not a new blocking rule in this sprint.

## Idempotency Behavior

`Student.applicationId + schoolId` is the source-bound idempotency anchor.

If a Student already exists for the route application id in the current school, the endpoint:

- does not create another Student,
- does not create Guardians,
- does not create StudentGuardian links,
- does not create Enrollment,
- returns a safe already-registered summary.

If a concurrent submit hits the unique constraint, the use case re-reads the application handoff source and returns the already-registered response when the Student is now present.

If an existing Student has no active Enrollment, the response remains already registered and includes:

```text
application.already_has_student_without_active_enrollment
```

No repair is attempted in ADM-REG-1G.

## Student.applicationId Behavior

The public school registration route still creates:

```text
Student.applicationId = null
```

The Admissions source-bound route calls the wizard with an internal source context:

```text
source: admissions_application
sourceApplicationId: <route application id>
```

Only that internal path sets:

```text
Student.applicationId = <route application id>
```

`applicationId` is not exposed in Student responses.

## Wizard Reuse Behavior

`CreateSchoolRegistrationUseCase` now accepts an internal optional source context. The public wizard controller still calls it with only the public DTO.

The submit endpoint does not duplicate wizard business logic for:

- Student creation,
- Guardian creation,
- StudentGuardian links,
- Enrollment placement validation,
- seat-limit policy,
- optional Parent account create/link,
- optional Student account create/link,
- wizard response presentation.

## Optional Account Behavior

Parent and Student account create/link behavior remains delegated to the existing wizard implementation.

As in ADM-REG-1D, optional account failures are returned as warnings after the core Student/Guardian/Enrollment registration is durable.

Known limitation: once a source-bound application is already registered, a repeated submit returns the idempotent already-registered summary and does not retry optional account steps that may have failed in the first submit.

## Audit Behavior

The wizard continues writing:

```text
students.registration.create
```

The Admissions source-bound submit also writes:

```text
admissions.application.register
```

Safe audit payload:

- `applicationId`
- `studentId`
- `enrollmentId`
- `guardianCount`
- `createdVia: admissions_application_register`

Audit payload does not include national id, temporary passwords, password hashes, raw address details, full guardian PII, membership ids, role ids, applicant user ids, or applicant profile ids.

## Identity Boundary Confirmation

ADM-REG-1G does not:

- mutate `UserType.APPLICANT`,
- turn Applicant into Parent,
- turn Applicant into Student,
- create Applicant membership,
- let Applicant users create operational records,
- change Applicant Portal behavior,
- activate Parent App directly,
- activate Student App directly.

Parent App and Student App visibility remain derived from operational Student/Guardian/Enrollment/account chains.

## Security / No-Leak Confirmation

The submit response does not expose:

- `schoolId`
- `organizationId`
- `userId`
- `membershipId`
- `roleId`
- `passwordHash`
- `deletedAt`
- `applicantUserId`
- `applicantProfileId`
- storage internals

Allowed in Admissions response context:

- top-level `applicationId`
- safe `student.id`
- safe `guardianId`
- safe `enrollmentId`
- temporary credentials only when existing wizard account creation returns them in the same request

## Tests Run

```text
git status --short --untracked-files=all
git log --oneline -10
npx prisma validate
npm run build
npm test -- --runInBand src/modules/admissions/applications/tests src/modules/students/registration/tests
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-registration-submit.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions-registration-submit.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-flow.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/school-registration-wizard.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.school-registration.spec.ts
```

## Results

- Prisma validate: passed.
- Build: passed after clearing a stale timed-out `dist` build process.
- Focused unit suites: 5 passed, 28 tests passed.
- New e2e submit suite: 1 passed, 3 tests passed.
- New security submit suite: 1 passed, 6 tests passed.
- Existing Admissions flow suite: 1 passed, 3 tests passed.
- Existing Admissions tenancy suite: 1 passed, 32 tests passed.
- Existing school registration wizard e2e suite: 1 passed, 1 test passed.
- Existing school registration tenancy suite: 1 passed, 6 tests passed.

## Known Limitations

- No StudentDocument migration from Admissions/Application documents.
- No Applicant-to-Parent or Applicant-to-Student identity transition.
- No Applicant membership creation.
- No application status mutation after registration.
- No document acceptance blocking policy was introduced.
- No duplicate matching beyond `Student.applicationId + schoolId`.
- Already-registered submit does not retry optional account steps.

## Explicit Deferred Items

- Accepted application handoff-to-wizard submit retries for optional account recovery.
- StudentDocument migration from Admissions documents.
- Future product decision for whether document acceptance must block registration.
- Duplicate resolution outside source-bound `applicationId`.
- Applicant identity linking policy, if a future ADR approves it.

## Final Verdict

```text
ADM_REG_1G_ACCEPTED_APPLICATION_SOURCE_BOUND_REGISTRATION_READY
```

ADM-REG-1G is ready for review. The source-bound submit path is implemented, school-staff-only, idempotent by `Student.applicationId + schoolId`, and preserves Applicant identity boundaries.
