# ADM-REG-1C — Student Guardian Profile Persistence Repair Closeout

## Sprint Summary

ADM-REG-1C implemented durable persistence for the Student and Guardian profile fields locked in ADM-REG-1B as V1-supported-after-profile-repair.

The sprint kept scope focused on Student and Guardian profile persistence only. No registration wizard, accepted applicant conversion, applicant-to-parent transition, Parent App behavior change, Student App behavior change, IAM behavior change, or schoolScope behavior change was introduced.

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260628120000_0046_adm_reg_1c_student_guardian_profile_fields/migration.sql`
- `src/modules/students/students/dto/student.dto.ts`
- `src/modules/students/students/domain/person-name.helper.ts`
- `src/modules/students/students/domain/student-record.inputs.ts`
- `src/modules/students/students/application/create-student.use-case.ts`
- `src/modules/students/students/application/update-student.use-case.ts`
- `src/modules/students/students/infrastructure/students.repository.ts`
- `src/modules/students/students/presenters/student.presenter.ts`
- `src/modules/students/students/tests/student.presenter.spec.ts`
- `src/modules/students/students/tests/students.use-case.spec.ts`
- `src/modules/students/guardians/dto/guardian.dto.ts`
- `src/modules/students/guardians/domain/guardian.inputs.ts`
- `src/modules/students/guardians/application/create-guardian.use-case.ts`
- `src/modules/students/guardians/application/update-guardian.use-case.ts`
- `src/modules/students/guardians/infrastructure/guardians.repository.ts`
- `src/modules/students/guardians/presenters/guardian.presenter.ts`
- `src/modules/students/guardians/tests/guardian.presenter.spec.ts`
- `src/modules/students/guardians/tests/guardians.use-case.spec.ts`
- `docs/sprint-adm-reg-1c-student-guardian-profile-persistence-repair-closeout.md`

## Schema / Migration Summary

Created one Prisma migration:

`20260628120000_0046_adm_reg_1c_student_guardian_profile_fields`

The migration adds nullable columns only.

Student columns added:

- `father_name_en`
- `grandfather_name_en`
- `first_name_ar`
- `father_name_ar`
- `grandfather_name_ar`
- `family_name_ar`
- `gender`
- `nationality`
- `address_line`
- `city`
- `district`
- `student_phone`
- `student_email`

Guardian columns added:

- `phone_secondary`
- `national_id`
- `job_title`
- `workplace`
- `can_pickup`
- `can_receive_notifications`

No existing columns, constraints, tenancy keys, applicant models, admissions models, enrollment models, user models, membership models, Parent App models, or Student App models were changed.

## Student Fields Now Persisted

- `father_name_en`
- `grandfather_name_en`
- `first_name_ar`
- `father_name_ar`
- `grandfather_name_ar`
- `family_name_ar`
- `gender`
- `nationality`
- `contact.address_line`
- `contact.city`
- `contact.district`
- `contact.student_phone`
- `contact.student_email`

`full_name_en` is derived from persisted English name parts. `full_name_ar` is derived from persisted Arabic name parts when present. `name` remains the English display alias.

## Guardian Fields Now Persisted

- `phone_secondary`
- `national_id`
- `job_title`
- `workplace`
- `can_pickup`
- `can_receive_notifications`

`phone_primary`, `email`, `relation`, `full_name`, and the existing `is_primary` compatibility behavior remain intact.

## Fields Still Intentionally Deferred

- `student_id` remains null-only / deferred.
- `Student.applicationId` remains an internal operational link and is not exposed in Student responses.
- `Student.userId` remains an internal operational link and is not exposed in Student responses.
- `Guardian.userId` remains internal and is not exposed in Guardian responses.
- Applicant-to-student, applicant-to-parent, applicant-to-guardian, applicant-to-enrollment, and accepted-application conversion remain deferred.
- Registration wizard runtime remains deferred to ADM-REG-1D.

## No-Go Confirmations

- No registration wizard was introduced.
- No accepted applicant conversion was introduced.
- No applicant user type mutation was introduced.
- No applicant membership creation was introduced.
- No Admissions decision behavior was changed.
- No Parent App visibility rule was changed.
- No Student App visibility rule was changed.
- No IAM, permission, global guard, or schoolScope behavior was changed.
- No package dependency, package script, seed, or lockfile change was made.

## Security / No-Leak Confirmation

- Public Student responses still omit `schoolId`, `organizationId`, `applicationId`, `userId`, `deletedAt`, membership IDs, role IDs, and password data.
- Public Guardian responses still omit `schoolId`, `organizationId`, `userId`, `deletedAt`, membership IDs, role IDs, and password data.
- `national_id` is returned only through the Guardian profile response contract where ADM-REG-1B locked it as supported after repair.
- No audit logging of `national_id` was added.
- Existing school-scoped repository access patterns were preserved.

## Test Commands Run

- `git status --short --untracked-files=all` before implementation: clean.
- `git log --oneline -10` before implementation: baseline included `dfb1751 docs: lock admissions registration contract decisions`.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npm run build`: initial run timed out, second run hit stale generated `dist` cleanup `ENOTEMPTY`, stale build processes were stopped, untracked generated `dist` was cleared, final build passed.
- `npm test -- --runInBand src/modules/students/students/tests src/modules/students/guardians/tests`: first run found one assertion mismatch in the new clearing test; after correcting the test expectation to match existing no-op first/last write behavior, passed 5 suites / 15 tests.
- `npm test -- --runInBand src/modules/students/account/tests src/modules/students/students/tests src/modules/students/guardians/tests`: passed 6 suites / 21 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.students.spec.ts`: first run failed because the local database had not yet applied the new migration; after migration status reported up to date, passed 47 tests.
- `npx prisma migrate dev --skip-generate`: timed out locally after applying the pending migration; `npx prisma migrate status` then reported database schema up to date.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/students-guardians-flow.e2e-spec.ts`: first run found summary rendering dropped persisted English middle parts; after summary presenter/select repair, passed 2 tests.
- `npm run test:e2e:sprint2b`: passed 3 suites / 4 tests.

## Results

The implementation now round-trips the ADM-REG-1B-supported Student and Guardian profile fields through:

- DTO acceptance
- normalization helpers
- create use cases
- update use cases
- Prisma persistence
- repository selects
- public presenters
- focused unit tests
- existing Student/Guardian e2e flows
- existing Student tenancy security checks

## Known Limitations

- Guardian `email` clearing remains unchanged from the existing fallback behavior; this sprint did not redesign legacy optional fields outside the ADM-REG-1C profile-repair list.
- DTO validators still preserve existing phone/email validation behavior. Null clears newly persisted nullable phone/email fields; invalid phone/email strings remain rejected by validation.
- `full_name_ar`, `first_name_ar`, and `family_name_ar` still participate in the existing update name-patch path for backward compatibility, so clearing Arabic full-name data may also write current English first/last values back as a no-op.
- The local `prisma migrate dev --skip-generate` command timed out after applying the migration; follow-up `prisma migrate status` and passing security/e2e tests confirmed the local database was updated.

## Final Verdict

ADM_REG_1C_STUDENT_GUARDIAN_PROFILE_PERSISTENCE_READY
