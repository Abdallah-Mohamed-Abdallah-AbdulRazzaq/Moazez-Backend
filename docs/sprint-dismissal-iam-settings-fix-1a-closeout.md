# DISMISSAL-IAM-SETTINGS-FIX-1A Closeout

## Sprint name

DISMISSAL-IAM-SETTINGS-FIX-1A - Expose Dismissal Staff Role in Settings

## Baseline commit

Expected and actual HEAD matched:

```text
f7f8bcce docs: accept dismissal smart pickup v1
```

## Problem found

`DISMISSAL_STAFF`, the `dismissal_staff` system role, and the Dismissal permission catalog already existed, but the Settings IAM flow did not bridge to them:

- Settings Roles hid `dismissal_staff` from `GET /api/v1/settings/roles`.
- Settings Users did not allow assigning `dismissal_staff`.
- Settings Users mapped unknown role keys to `SCHOOL_USER`, so assigning `dismissal_staff` would not create a `DISMISSAL_STAFF` actor.

## Files changed

- `src/modules/settings/roles/infrastructure/roles.repository.ts`
- `src/modules/settings/users/infrastructure/users.repository.ts`
- `src/modules/settings/users/domain/user-type-from-role.ts`
- `test/e2e/settings-dismissal-staff-role.e2e-spec.ts`
- `test/security/tenancy.settings-dismissal-staff-role.spec.ts`
- `docs/sprint-dismissal-iam-settings-fix-1a-closeout.md`

## Schema changes

None.

## Migration changes

None.

## Seed changes

None. The existing seed already defines `dismissal_staff`, its Dismissal operational permissions, and `app.device_tokens.manage`.

## Routes changed

None.

## Runtime Dismissal changes

None.

## Settings Roles fix

Added `dismissal_staff` to `VISIBLE_SYSTEM_ROLE_KEYS`, making the existing system role visible through Settings Roles.

## Settings Users assignment fix

Added `dismissal_staff` to `ASSIGNABLE_SYSTEM_ROLE_KEYS`, allowing create, invite, and update flows to assign the existing system role id.

## UserType mapping fix

Mapped `dismissal_staff` to `UserType.DISMISSAL_STAFF` in `userTypeFromRoleKey`.

Existing mappings remain unchanged:

- `school_admin` -> `SCHOOL_USER`
- `teacher` -> `TEACHER`
- `parent` -> `PARENT`
- `student` -> `STUDENT`
- custom school roles -> `SCHOOL_USER`

## Role response key decision

Did not add `key` to `RoleResponseDto`. The existing Settings Roles response contract does not expose it, and this bugfix can be verified without a response-shape change.

## Tests added/updated

Added:

- `test/e2e/settings-dismissal-staff-role.e2e-spec.ts`
- `test/security/tenancy.settings-dismissal-staff-role.spec.ts`

Coverage includes:

- Dismissal Staff role appears in Settings Roles.
- Dismissal Staff role exposes the approved Dismissal Staff permissions.
- Settings Permissions includes Dismissal permissions and `app.device_tokens.manage`.
- Settings Users create/invite/update accept the Dismissal Staff role id.
- Created/updated users and memberships persist `UserType.DISMISSAL_STAFF`.
- Existing role-key user type mappings remain unchanged.
- A Settings-created Dismissal Staff actor can authenticate and call `GET /api/v1/dismissal/profile`.
- Dismissal Staff cannot access Settings role management or manage Dismissal settings/staff assignments by default.
- Responses do not expose forbidden Settings/IAM internals beyond existing public contracts.

## Commands run

Pre-change:

```text
git status --short --untracked-files=all
git log --oneline -15
npx prisma validate
```

Post-change:

```text
npx prisma validate
npx prisma generate
npm run seed
npm run build
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/settings-dismissal-staff-role.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.settings-dismissal-staff-role.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.settings.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts
```

All listed post-change commands passed.

## Known issues

None for this sprint.

## Final verdict

READY FOR REVIEW
