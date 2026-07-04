# DISMISSAL-IAM-1A - DISMISSAL_STAFF UserType + Permission Seed Closeout

## Sprint Name

DISMISSAL-IAM-1A - DISMISSAL_STAFF UserType + Permission Seed

## Baseline Commit

- Expected baseline: `1715dc4 docs: add dismissal domain blueprint`
- Actual HEAD at start: `1715dc4 docs: add dismissal domain blueprint`
- Preflight working tree: clean

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260704145805_dismissal_staff_identity_permissions/migration.sql`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `test/security/tenancy.dismissal-iam.spec.ts`
- `test/security/tenancy.teacher-app.spec.ts`
- `docs/sprint-dismissal-iam-1a-user-type-permission-seed-closeout.md`
- `USER_TYPES.md`
- `DOMAIN_GLOSSARY.md`

`test/security/tenancy.teacher-app.spec.ts` was updated only for the global permission catalog count, from `205` to `219`, because this sprint intentionally adds 14 permission catalog entries. The Teacher role permission array remains locked at 54 permissions.

## Schema Changes

- Added `DISMISSAL_STAFF` to `UserType`.
- Preserved `PICKUP_DELEGATE`.
- Added no new Prisma models.
- Added no dismissal tables or relations.
- Did not change `AppDeviceTokenSurface`.

## Migration Name

`20260704145805_dismissal_staff_identity_permissions`

Migration SQL:

```sql
ALTER TYPE "user_type" ADD VALUE 'DISMISSAL_STAFF';
```

## Permission Catalog Additions

Added exactly 14 `dismissal` module permissions:

- `dismissal.profile.view`
- `dismissal.settings.view`
- `dismissal.settings.manage`
- `dismissal.gates.view`
- `dismissal.gates.manage`
- `dismissal.staff.view`
- `dismissal.staff.manage`
- `dismissal.requests.view`
- `dismissal.requests.manage`
- `dismissal.requests.deliver`
- `dismissal.requests.escalate`
- `dismissal.requests.history.view`
- `dismissal.notifications.view`
- `dismissal.notifications.manage`

## Dismissal Staff Role Permission List

Added system role:

- `key`: `dismissal_staff`
- `name`: `Dismissal Staff`
- `description`: `School dismissal app access for assigned pickup and handover operations`

Role permissions:

- `dismissal.profile.view`
- `dismissal.gates.view`
- `dismissal.requests.view`
- `dismissal.requests.manage`
- `dismissal.requests.deliver`
- `dismissal.requests.escalate`
- `dismissal.requests.history.view`
- `dismissal.notifications.view`
- `dismissal.notifications.manage`

## Explicit Exclusions

The Dismissal Staff role does not include:

- `platform.*`
- `settings.*`
- `files.downloads.view`
- `files.uploads.manage`
- `students.records.manage`
- `students.guardians.manage`
- `dismissal.settings.view`
- `dismissal.settings.manage`
- `dismissal.staff.view`
- `dismissal.staff.manage`
- `dismissal.gates.manage`
- `communication.*`

No Parent smart-pickup permissions/routes were added.
No Dismissal runtime APIs, controllers, DTOs, modules, repositories, or use cases were added.
No communication/chat, notification runtime, realtime, parent-app, student, or file runtime behavior was added.

## Parent/Teacher/Student Role Integrity Result

- Parent role permission array remains 43 permissions.
- Teacher role permission array remains 54 permissions.
- Student role permission array remains 57 permissions.
- Parent/Teacher/Student role regression specs passed after the catalog count baseline was updated for the new dismissal permissions.

## /auth/me Result

No `/auth/me` production code change was required.

The new security spec provisions a `DISMISSAL_STAFF` user with an active school membership using the seeded `dismissal_staff` role. `/api/v1/auth/me` returns the exact Dismissal Staff role permissions through the existing membership role-permission mapping and excludes forbidden broad permissions.

## Tests Added

Added `test/security/tenancy.dismissal-iam.spec.ts` covering:

- `DISMISSAL_STAFF` and `PICKUP_DELEGATE` enum contract.
- Migration SQL limited to the enum value addition.
- Exact 14 dismissal permission codes with module `dismissal`.
- No duplicate permission codes.
- Exact safe `DISMISSAL_STAFF_PERMISSIONS` list.
- `dismissal_staff` system role definition.
- Explicit forbidden permission exclusions.
- Parent/Teacher/Student role permission count integrity.
- No dismissal runtime source files.
- `/auth/me` permission mapping for a seeded Dismissal Staff actor.

## Commands Run

- `git status --short --untracked-files=all` - passed, clean at start.
- `git log --oneline -10` - confirmed HEAD `1715dc4`.
- `npx prisma validate` - passed before changes.
- `npx prisma migrate dev --name dismissal_staff_identity_permissions` - generated/applied migration; migration SQL was pruned to the required enum addition only.
- `npx prisma validate` - passed after changes.
- `npx prisma generate` - passed.
- `npm run seed` - passed, seeded 219 permissions and 7 system roles.
- `npm run build` - first run timed out, second run failed on stale ignored `dist` cleanup with `ENOTEMPTY`; removed ignored generated `dist/` and reran successfully.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts` - passed, 11 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` - passed, 30 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts` - passed, 55 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` - passed, 33 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts` - passed, 7 tests.

## Known Follow-ups

- DISMISSAL-CORE-1A will add settings and gates foundation.
- Parent smart-pickup permissions/routes remain deferred.
- Dismissal chat integration remains deferred to a request-scoped Communication sprint.
- Dismissal notifications runtime remains deferred.
- AppDeviceTokenSurface.DISMISSAL_STAFF remains deferred until push/device-token support is needed.

## Final Verdict

READY FOR REVIEW
