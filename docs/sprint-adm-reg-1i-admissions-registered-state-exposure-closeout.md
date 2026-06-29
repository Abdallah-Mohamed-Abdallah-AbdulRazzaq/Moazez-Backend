# ADM-REG-1I - Admissions Registered State Exposure Closeout

## Sprint Summary

ADM-REG-1I exposes a safe, derived `registrationState` on staff-facing Admissions application responses.

The state is derived from the existing same-school `Application -> Student` relation, which is backed by `Student.applicationId + schoolId`. No registered state is stored on `Application`, and no Admissions lifecycle status is mutated.

## Files Changed

- `src/modules/admissions/applications/dto/application.dto.ts`
- `src/modules/admissions/applications/infrastructure/applications.repository.ts`
- `src/modules/admissions/applications/presenters/application.presenter.ts`
- `src/modules/admissions/applications/tests/application.presenter.spec.ts`
- `src/modules/admissions/applications/tests/applications.use-case.spec.ts`
- `test/e2e/admissions-flow.e2e-spec.ts`
- `test/e2e/admissions-registration-submit.e2e-spec.ts`
- `test/security/tenancy.admissions.spec.ts`
- `docs/sprint-adm-reg-1i-admissions-registered-state-exposure-closeout.md`

## Routes Affected

- `GET /api/v1/admissions/applications/:id`
- `GET /api/v1/admissions/applications`
- `POST /api/v1/admissions/applications`
- `PATCH /api/v1/admissions/applications/:id`
- `POST /api/v1/admissions/applications/:id/submit`

The module uses the shared `ApplicationResponseDto` and `presentApplication` presenter for those staff-facing application responses, so the additive `registrationState` object is now present consistently wherever that DTO is returned.

No changes were made to:

- `GET /api/v1/admissions/applications/:id/registration-handoff`
- `POST /api/v1/admissions/applications/:id/register`
- `POST /api/v1/students-guardians/registrations`

## Response Contract Added

`ApplicationResponseDto` now includes:

```ts
registrationState: {
  registered: boolean;
  studentId: string | null;
  enrollmentId: string | null;
  enrollmentStatus: string | null;
  registeredVia: 'admissions_application' | null;
  registeredAt: string | null;
  source: 'derived_from_student_application_id';
}
```

Unregistered applications return explicit nulls for `studentId`, `enrollmentId`, `enrollmentStatus`, `registeredVia`, and `registeredAt`.

Registered source-bound applications return `registered = true`, the safe linked Student id, and the active Enrollment id/status when an active enrollment exists.

If a Student exists for the application but has no active Enrollment, `registered = true` and the enrollment fields remain null.

## Derived State Source

The repository detail/list query now selects:

- linked `Student.id`
- latest active linked `Enrollment.id`
- latest active linked `Enrollment.status`

The presenter derives the public state from that relation. It does not expose `Student.applicationId`, `Student.userId`, tenant ids, soft-delete fields, or membership/role data.

## Application.status Behavior

`Application.status` remains the Admissions workflow / decision state.

ADM-REG-1I does not:

- mutate `Application.status`
- add a `REGISTERED`, `ENROLLED`, or `CLOSED` status
- map accepted registered applications to a fake status
- add closure timestamps or closure columns

Registered accepted applications continue to return `status: "accepted"` with `registrationState.registered = true`.

## No-Schema-Change Confirmation

No Prisma schema changes were made.

No migration was added.

No new persisted registered-state field was introduced.

`registeredAt` is returned as `null` because no durable `registeredAt` field exists and audit logs are not used as the current-state query source.

## Applicant Boundary Confirmation

ADM-REG-1I preserves ADR-0003 and the ADM-REG-1B/1E/1G identity decisions.

This sprint does not:

- mutate `UserType.APPLICANT`
- create Applicant memberships
- link Applicant users to Guardian or Student records
- create Parent or Student users
- send credentials or activation links
- change Applicant Portal behavior
- change Parent App or Student App visibility behavior

## Security / No-Leak Confirmation

The new response does not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- `Student.applicationId`
- `Student.userId`
- `Guardian.userId`
- Applicant internal ids
- storage internals
- audit internals

Allowed exposed ids are limited to existing safe staff-facing identifiers:

- `Application.id`
- linked `Student.id`
- linked active `Enrollment.id`

Admissions route permissions and school-scoped access are unchanged.

## Tests Run

```bash
git status --short --untracked-files=all
git log --oneline -10
npm test -- --runInBand src/modules/admissions/applications/tests
npx prisma validate
npm run build
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-flow.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-registration-submit.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions-registration-submit.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/school-registration-wizard.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.school-registration.spec.ts
git status --short --untracked-files=all
git diff --name-only
git diff --stat
git diff --check
```

## Results

- `npm test -- --runInBand src/modules/admissions/applications/tests`: passed, 5 suites / 24 tests.
- `npx prisma validate`: passed.
- `npm run build`: passed after clearing stale generated `dist` output from a timed-out prior build process.
- `test/e2e/admissions-flow.e2e-spec.ts`: passed, 1 suite / 3 tests.
- `test/security/tenancy.admissions.spec.ts`: passed, 1 suite / 36 tests.
- `test/e2e/admissions-registration-submit.e2e-spec.ts`: passed, 1 suite / 3 tests.
- `test/security/tenancy.admissions-registration-submit.spec.ts`: passed, 1 suite / 6 tests.
- `test/e2e/school-registration-wizard.e2e-spec.ts`: passed, 1 suite / 1 test.
- `test/security/tenancy.school-registration.spec.ts`: passed, 1 suite / 6 tests.
- `git diff --check`: clean, with only normal Windows LF-to-CRLF working-copy warnings.

## Tests Not Run

No broader full-repository test suite was run. ADM-REG-1I touched only Admissions application response presentation/query shape and the requested focused suites passed.

## Known Limitations

- `registeredAt` remains `null` until a future product decision introduces a durable timestamp or closure marker.
- Dashboard counters are not implemented in this sprint.
- Post-registration decision mutation guards are not implemented in this sprint.
- The list response now receives `registrationState` through the shared `ApplicationResponseDto`; no dashboard reporting/filtering behavior was added.

## Deferred Items

- ADM-REG-1J or later: optional guard against contradictory Admissions decision mutations after operational registration.
- Future reporting sprint: derived accepted/registered/unregistered counters if product needs them.
- Future schema decision only if product requires durable registered timestamp/actor/source metadata.

## Final Verdict

ADM_REG_1I_ADMISSIONS_REGISTERED_STATE_EXPOSURE_READY

ADM-REG-1I is ready for review. The registered state is visible to school staff through a safe derived response object, remains backed by `Student.applicationId + schoolId`, and does not change Application lifecycle, Applicant identity, schema, or app visibility rules.
