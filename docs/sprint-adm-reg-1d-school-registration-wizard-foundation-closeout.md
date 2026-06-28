# ADM-REG-1D - School Registration Wizard Foundation Closeout

## Sprint Summary

ADM-REG-1D implemented a school-side registration wizard foundation under the Students/Guardians dashboard surface.

The new workflow creates an operational registration by coordinating Student profile creation, Guardian profile creation, StudentGuardian links, active Enrollment creation, optional Parent account create/link, optional Student account create/link, safe response presentation, and focused audit logging.

Accepted applicant conversion, applicant identity mutation, applicant school membership creation, Admissions handoff expansion, Parent App behavior changes, Student App behavior changes, schoolScope changes, global guard changes, package changes, and Prisma schema changes were not introduced.

## Files Changed

- `src/modules/students/students.module.ts`
- `src/modules/students/students/students.module.ts`
- `src/modules/students/guardians/guardians.module.ts`
- `src/modules/students/registration/registration.module.ts`
- `src/modules/students/registration/controller/school-registration.controller.ts`
- `src/modules/students/registration/application/create-school-registration.use-case.ts`
- `src/modules/students/registration/dto/school-registration.dto.ts`
- `src/modules/students/registration/infrastructure/school-registration.repository.ts`
- `src/modules/students/registration/presenters/school-registration.presenter.ts`
- `src/modules/students/registration/tests/school-registration.use-case.spec.ts`
- `test/e2e/school-registration-wizard.e2e-spec.ts`
- `test/security/tenancy.school-registration.spec.ts`
- `docs/sprint-adm-reg-1d-school-registration-wizard-foundation-closeout.md`

## Route Added

- `POST /api/v1/students-guardians/registrations`

Controller:

- `src/modules/students/registration/controller/school-registration.controller.ts`

## Permissions Used

The route requires all existing manage permissions:

- `students.records.manage`
- `students.guardians.manage`
- `students.enrollments.manage`

No new permissions were added.

## Input Contract Summary

The request accepts:

- `student`: aligned with existing Student create/profile fields, including ADM-REG-1C durable English name parts, Arabic name parts, gender, nationality, birth date, status, and contact fields.
- `guardians[]`: at least one guardian profile, aligned with existing Guardian create/profile fields, including ADM-REG-1C durable secondary phone, national ID, job/workplace, pickup, and notification fields.
- `guardians[].relationship.is_primary`: optional link-level primary marker.
- `guardians[].account`: optional Parent account step with `mode: none | create | link`.
- `enrollment`: active enrollment placement with required `classroomId` and `enrollmentDate`, plus academic year, term, grade, and section identifiers as supported by existing enrollment placement rules.
- `studentAccount`: optional Student account step with `mode: none | create | link`.

The public wizard contract does not accept `schoolId`, `organizationId`, `userId`, or `applicationId`.

## Output Contract Summary

The response includes:

- `registrationId`: currently the created Student id.
- `student`: existing `presentStudent` output.
- `guardians`: existing `presentGuardianLink` output using StudentGuardian link primary truth.
- `enrollment`: existing `presentEnrollment` output.
- `parentAccounts`: sanitized account step summaries.
- `studentAccount`: sanitized account step summary.
- `warnings`: skipped or failed optional account steps.
- `createdAt` and `completedAt`.

Account summaries intentionally omit `userId`, `roleId`, and membership internals even though existing credential presenters expose those in account-specific endpoints.

## Transaction / Consistency Behavior

The core operational registration is created in one Prisma transaction:

1. Student
2. Guardian(s)
3. StudentGuardian link(s)
4. Active Enrollment

Before the transaction, the use case validates school scope, required payload shape, guardian presence, account mode requirements, academic year, term, classroom, section/grade consistency, and active student seat policy.

Optional Parent and Student account create/link steps are executed after the core registration transaction through the existing account-linking use cases. If an optional account step fails after the core registration is durable, the wizard returns a failed account summary and warning instead of rolling back the Student/Guardian/Enrollment records. This preserves the existing IAM/account-linking boundaries without introducing a saga or broad IAM rewrite.

## Student Creation Behavior

The wizard always creates a new Student record.

Persisted Student fields include:

- English name parts from `name`, `full_name_en`, or explicit name-part fields.
- Arabic name parts from `full_name_ar` or explicit Arabic name-part fields.
- `dateOfBirth` / `date_of_birth`
- `gender`
- `nationality`
- `contact.address_line`
- `contact.city`
- `contact.district`
- `contact.student_phone`
- `contact.student_email`
- `status` when provided, otherwise the existing Student default applies.

The wizard does not expose or accept `applicationId` or `userId`.

## Guardian Creation / Link Behavior

The wizard always creates new Guardian profile records and links them to the new Student.

Persisted Guardian fields include:

- `full_name` / `first_name` / `last_name`
- `relation`
- `phone_primary`
- `phone_secondary`
- `email`
- `national_id`
- `job_title`
- `workplace`
- `can_pickup`
- `can_receive_notifications`

At least one guardian is required. If no guardian is explicitly primary, the first guardian becomes primary. If one guardian is explicitly primary, the wizard uses that StudentGuardian link as canonical primary truth. `Guardian.isPrimary` remains a backward-compatible profile-level value and was not redesigned.

## Enrollment Behavior

The wizard creates one active Enrollment for the newly created Student.

Enrollment validation reuses the same repository-backed placement rules as the existing enrollment flow where applicable:

- Academic year must exist in the current school scope.
- Academic year must be active.
- Term must belong to the academic year when provided.
- Classroom must exist in the current school scope.
- Classroom/section and section/grade consistency are validated.
- Student seat limit policy is enforced before creation.

The wizard does not create inactive, completed, or withdrawn enrollments.

## Optional Parent Account Behavior

For each guardian:

- `none`: creates the Guardian and StudentGuardian link only.
- `create`: delegates to existing Parent account create/link behavior, creating a `UserType.PARENT` user with school membership and linking `Guardian.userId`.
- `link`: delegates to existing Parent link behavior and requires an existing scoped `UserType.PARENT` user.

Parent account creation is optional. Parent App visibility rules were not changed and still require the full operational chain.

## Optional Student Account Behavior

For the student:

- `none`: creates Student, Guardian(s), links, and Enrollment only.
- `create`: delegates to existing Student account create/link behavior, creating a `UserType.STUDENT` user with school membership and linking `Student.userId`.
- `link`: delegates to existing Student link behavior and requires an existing scoped `UserType.STUDENT` user.

Student account creation is optional. Student App visibility rules were not changed and still require the full operational chain.

## Audit Behavior

The wizard writes one focused audit log after durable changes:

- `module`: `students`
- `action`: `students.registration.create`
- `resourceType`: `registration`
- `resourceId`: created Student id

Safe audit payload fields:

- `studentId`
- `guardianCount`
- `primaryGuardianCount`
- `enrollmentId`
- `parentAccountsCreatedCount`
- `parentAccountsLinkedCount`
- `studentAccountCreated`
- `studentAccountLinked`

The audit payload does not include `national_id`, temporary passwords, password hashes, role IDs, membership IDs, raw address details, or full guardian PII.

## Security / No-Leak Confirmation

The wizard route is authenticated, school-scoped, and permission guarded.

The response does not expose:

- `schoolId`
- `organizationId`
- `userId`
- `membershipId`
- `roleId`
- `passwordHash`
- `deletedAt`
- `applicationId`
- applicant ids
- storage internals

Guardian `national_id` is returned only through the Guardian profile response where ADM-REG-1B/1C locked it as part of the V1 profile contract.

No global guard, schoolScope, Applicant Portal, Admissions, Parent App, Student App, or IAM semantics were changed.

## Tests Run

- `npx prisma validate`: passed.
- `npm run build`: first two-minute attempt timed out; rerun with longer timeout passed.
- `npm test -- --runInBand src/modules/students/registration/tests`: passed 1 suite / 7 tests.
- `npm test -- --runInBand src/modules/students/registration/tests src/modules/students/students/tests src/modules/students/guardians/tests src/modules/students/account/tests src/modules/students/enrollments/tests`: passed 9 suites / 35 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/school-registration-wizard.e2e-spec.ts`: initial assertion fixture mismatch was corrected; final run passed 1 suite / 1 test.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.school-registration.spec.ts`: initial academic-year fixture setup was corrected to reuse existing active years; final run passed 1 suite / 6 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/school-registration-wizard.e2e-spec.ts test/security/tenancy.school-registration.spec.ts`: passed 2 suites / 7 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.students.spec.ts`: passed 1 suite / 47 tests.
- `npm run test:e2e:sprint2b`: passed 3 suites / 4 tests.

## Known Limitations

- No accepted applicant conversion was implemented.
- No Admissions handoff expansion was implemented.
- No applicant user type mutation or applicant school membership creation was implemented.
- The wizard always creates new Student and Guardian records; duplicate detection and merge policy remain deferred.
- Optional account create/link steps are not inside the core Student/Guardian/Enrollment transaction. Failed optional account steps are returned as warnings and can be retried through existing account endpoints.
- `registrationId` is the created Student id because there is no dedicated Registration model in V1.
- Parent App and Student App visibility remain dependent on their existing operational ownership chains.

## Explicit Deferred Items

- Accepted application handoff-to-wizard.
- Applicant-to-parent transition or link workflow.
- Applicant-to-student transition or link workflow.
- Duplicate Student/Guardian resolution.
- Bulk registration import.
- Mobile-app direct registration.
- Finance, HR, transport, smart pickup, and notification engine behavior.

## Final Verdict

ADM_REG_1D_SCHOOL_REGISTRATION_WIZARD_FOUNDATION_READY
