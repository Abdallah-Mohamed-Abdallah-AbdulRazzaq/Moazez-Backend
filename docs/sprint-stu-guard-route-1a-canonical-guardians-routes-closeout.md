# STU-GUARD-ROUTE-1A - Canonical Guardians Routes + Collision Regression

## Sprint name

STU-GUARD-ROUTE-1A - Canonical Guardians Routes + Collision Regression

## Baseline commit

Expected baseline: `240552a4 feat: expose admissions document review eligibility`

Actual baseline confirmed before edits: `240552a4 feat: expose admissions document review eligibility`

## Files changed

- `src/modules/students/guardians/controller/guardians.controller.ts`
- `src/modules/students/guardians/guardians.module.ts`
- `test/e2e/students-guardians-guardians-routes.e2e-spec.ts`
- `docs/sprint-stu-guard-route-1a-canonical-guardians-routes-closeout.md`

## Current collision confirmed

The focused regression reproduced the legacy collision before the routing shim: `GET /api/v1/students-guardians/students/guardians?search=fda` returned `400 Bad Request` from the student `:studentId` UUID validation path instead of the guardians list route.

## Canonical routes added

The main guardians CRUD/list controller is now canonical under:

- `GET /api/v1/students-guardians/guardians`
- `POST /api/v1/students-guardians/guardians`
- `GET /api/v1/students-guardians/guardians/:guardianId`
- `PATCH /api/v1/students-guardians/guardians/:guardianId`
- `GET /api/v1/students-guardians/guardians/:guardianId/students`

The existing canonical account route remains:

- `POST /api/v1/students-guardians/guardians/:guardianId/account`

## Legacy routes preserved

A legacy alias controller preserves:

- `GET /api/v1/students-guardians/students/guardians`
- `POST /api/v1/students-guardians/students/guardians`
- `GET /api/v1/students-guardians/students/guardians/:guardianId`
- `PATCH /api/v1/students-guardians/students/guardians/:guardianId`
- `GET /api/v1/students-guardians/students/guardians/:guardianId/students`

Because the existing student dynamic route is registered ahead of the legacy static route at runtime, `GuardiansModule` also applies a narrowly scoped middleware only for the legacy guardians prefix. It rewrites that legacy prefix to the canonical guardians prefix before controller matching, so the canonical guarded controller handles the request and the dynamic student route no longer receives `guardians` as `studentId`.

## Permission matrix

- List guardians: `students.guardians.view`
- Get guardian: `students.guardians.view`
- Get guardian students: `students.guardians.view`
- Create guardian: `students.guardians.manage`
- Update guardian: `students.guardians.manage`
- Create/link guardian account: `students.guardians.manage`

No permissions were added, removed, or renamed.

## Collision regression result

`test/e2e/students-guardians-guardians-routes.e2e-spec.ts` covers canonical and legacy list/search routes. The legacy search route now returns a guardians list response and no longer returns `validation.failed` for UUID parsing.

## Student dynamic route preservation result

`GET /api/v1/students-guardians/students/not-a-uuid` still returns `400 validation.failed` with the UUID validation message. `StudentsController.getStudent` behavior and `ParseUUIDPipe` were not changed.

## No-leak verification

The focused E2E checks canonical and legacy guardian responses for absence of internal fields including `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, `passwordHash`, `userId`, `applicationId`, `bucket`, `objectKey`, provider/signed URL fields, and audit actor fields.

Guardian response shape remains the existing public contract, including fields such as `guardianId`, `full_name`, `relation`, `phone_primary`, `phone_secondary`, `email`, `national_id`, `job_title`, `workplace`, `is_primary`, `can_pickup`, and `can_receive_notifications`.

## Cross-school/security verification

The focused E2E verifies canonical cross-school guardian access remains hidden with `404 not_found`. It also verifies canonical and legacy list routes require `students.guardians.view`, canonical create/update routes require `students.guardians.manage`, and canonical account creation/linking still requires `students.guardians.manage`.

The existing broad students security suite was also run and passed.

## Commands run

Before edits:

- `git status --short --untracked-files=all` - clean
- `git log --oneline -10` - HEAD matched expected baseline
- `npx prisma validate` - passed

After edits:

- `npx prisma validate` - passed
- `npm run build` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/students-guardians-guardians-routes.e2e-spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.students.spec.ts` - passed

## Optional tests run/skipped

Run:

- `test/security/tenancy.students.spec.ts` as the existing broad students/guardians security regression.

Skipped:

- `test/security/tenancy.parent-app.spec.ts`
- `test/security/tenancy.student-app.spec.ts`

Those optional app-facing suites were not directly affected by the guardians school-side route alias change.

## Known follow-ups

- Frontend should migrate guardians search to `GET /api/v1/students-guardians/guardians`.
- Legacy `/students-guardians/students/guardians` can be deprecated in a future API version only after frontend migration.
- ADM-DOC-UX-1B application document counters / dashboard summary fields.
- ADM-WORKFLOW-POLICY-1A optional tests/interviews workflow policy.

## Final verdict

READY FOR REVIEW
