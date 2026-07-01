# STU-PERM-1F Final Security Closeout Audit

## Sprint Name

STU-PERM-1F - Final Security Closeout + Regression Audit

## Baseline Commit

Expected baseline: `f91a2e57 feat: enforce student communication profile permissions`

Actual baseline at audit start:

```text
f91a2e57 feat: enforce student communication profile permissions
e0d1ca61 feat: enforce student reinforcement action permissions
5ec5a782 feat: enforce student homework exam permissions
2307afd0 feat: enforce student app read permissions
e7c29693 feat: seed student app permissions
b10c1225 docs: audit student app permission coverage
bf7ad926 fix: make communication notification job ids bullmq safe
9865e56a docs: close student profile self-service
0f6caf79 feat: add student profile correction requests
a753cb2f docs: lock student profile correction requests
```

`git status --short --untracked-files=all` was clean before audit work began.

## Files Changed

```text
test/security/tenancy.student-app.spec.ts
docs/sprint-stu-perm-1f-final-security-closeout-audit.md
```

No controller, seed, schema, migration, guard, decorator, IAM, access-service, shared-domain, presenter, DTO, use-case, repository, or files module source changes were made.

## Implementation Sequence Recap

- STU-PERM-0A audited the Student App route surface and approved narrow self-service permission decisions.
- STU-PERM-1A added missing permission catalog entries, expanded `STUDENT_PERMISSIONS`, and added seed guardrails for missing permission codes.
- STU-PERM-1B added read-only Student App route permission decorators.
- STU-PERM-1C added Homework and Exam action route permission decorators.
- STU-PERM-1D added Task, Reward, and Hero action route permission decorators.
- STU-PERM-1E added Profile, Communication, Notification, Announcement read-marker, and Device Token action route permission decorators.
- STU-PERM-1F added a final static controller inventory test and ran the regression/security verification set.

## Permission Catalog Verification

Static seed audit result:

```json
{
  "catalog_total": 185,
  "approved_total": 57,
  "student_permission_count": 57,
  "catalog_missing_for_approved": [],
  "student_missing_approved": [],
  "student_extra_permissions": [],
  "student_permissions_missing_catalog": [],
  "forbidden_student_permissions": [],
  "seed_guardrail_present": true
}
```

All approved STU-PERM Student App permission codes exist in `prisma/seeds/01-permissions.seed.ts`.

## Student Role Verification

`STUDENT_PERMISSIONS` in `prisma/seeds/02-system-roles.seed.ts` contains exactly the 57 approved permissions from STU-PERM-0A / STU-PERM-1A.

The audit found:

- No approved permission missing from the Student role.
- No Student role permission missing from the catalog.
- No extra Student role permissions outside the approved final list.

## Forbidden Permissions Verification

The Student role does not include:

```text
students.records.manage
students.documents.manage
students.medical.manage
communication.notifications.manage
communication.conversations.manage
communication.messages.edit
communication.messages.delete
communication.messages.moderate
communication.admin.view
communication.admin.manage
reinforcement.hero.progress.manage
reinforcement.tasks.manage
reinforcement.rewards.manage
settings.*
platform.*
```

A focused search confirmed Student App controller `@RequiredPermissions()` usage does not require broad/admin permissions for self-service routes.

## Seed Guardrail Verification

`prisma/seeds/02-system-roles.seed.ts` still builds `foundPermissionIdsByCode`, checks each role permission code, and throws:

```text
Missing permissions for system role ...
```

when a system role references a catalog code that does not exist. Role permission rows are created from the ordered role permission list using `foundPermissionIdsByCode.get(code)!`.

## /auth/me Permission Exposure Verification

The permission exposure path remains role-backed and not hardcoded:

- `src/modules/iam/auth/infrastructure/auth.repository.ts` loads `rolePermissions.permission`.
- `src/modules/iam/auth/application/membership.mapper.ts` maps `membership.role.rolePermissions.map((rp) => rp.permission.code)`.
- `src/modules/iam/auth/application/me.use-case.ts` returns `activeMembership: pickActiveMembership(user)`.
- `src/modules/iam/auth/controller/auth.controller.ts` exposes `/auth/me` through `MeUseCase`.

The existing general `/auth/me` tenancy spec was run and passed. No dedicated Student-role `/auth/me` assertion was added because this sprint's allowed test edit scope is Student App / file closeout tests, but the static seed audit plus mapper/repository evidence proves the expanded Student role permissions flow into `activeMembership.permissions` after seeding.

## Full Student App Route Metadata Inventory Summary

`test/security/tenancy.student-app.spec.ts` now includes a final static route permission inventory test.

The inventory identifies each handler by:

```text
controller class
handler method name
expected permission code
sprint source: 1B / 1C / 1D / 1E
```

Inventory coverage:

```text
1B read-only routes: 63
1C homework/exam action routes: 14
1D task/reward/hero action routes: 5
1E profile/communication/notification action routes: 14
Total Student App route handlers: 96
```

The test fails if:

- A known handler has missing permission metadata.
- A known handler has the wrong permission metadata.
- A Student App controller exposes a new Nest HTTP handler that is not included in the final inventory.

## Missing-Permission Denial Coverage

`test/security/tenancy.student-app.spec.ts` covers representative `403 auth.scope.missing` denial for:

- Read-only Student App routes.
- Homework and Exam action routes.
- Task, Reward, and Hero action routes.
- Profile, Communication, Notification, Announcement read-marker, and Device Token action routes.

This verifies the expected final ordering for missing permission:

```text
Missing permission -> 403 auth.scope.missing
```

## Ownership / Visibility Preservation Coverage

Existing Student App tests still cover:

- Non-student actors rejected from Student App routes.
- Student users without linked student records rejected.
- Linked students without active enrollment rejected.
- Cross-school guessed student, enrollment, classroom, lesson, file, message, announcement, reward, homework, task, and Hero resources hidden.
- Same-school unauthorized resources hidden where applicable.
- Correct permissions do not bypass ownership, audience, participant, resource visibility, or active-enrollment checks.

These checks remain in use cases and access services; RBAC decorators are additive and do not replace ownership or visibility enforcement.

## No-Leak Verification

The Student App security/e2e tests continue to assert app responses do not expose forbidden internals, including:

```text
schoolId
organizationId
membershipId
roleId
deletedAt
passwordHash
Student.userId
Guardian.userId
Student.applicationId
internal actor IDs
storage bucket
storage objectKey
raw signed URLs in JSON responses
audit internals
device token tokenHash/tokenCiphertext
notification routing internals
message moderation/admin internals
reward review/admin internals
Hero progress internals
```

Authorized file download redirects remain allowed after authorization and visibility checks. The audit did not change presenters or DTOs.

## Files Flow Verification

`src/modules/files/uploads/controller/uploads.controller.ts` still requires:

```text
POST /api/v1/files -> files.uploads.manage
GET /api/v1/files/:id/download -> files.downloads.view
```

The shared file security and upload/download e2e tests passed. No `src/modules/files/**` changes were made.

## Tests Added / Updated

Updated:

```text
test/security/tenancy.student-app.spec.ts
```

Change summary:

- Added a final 96-handler static metadata inventory.
- Added discovery of actual Student App controller HTTP handlers via Nest route method metadata.
- The test compares discovered handlers to the explicit final permission inventory.

No runtime behavior tests were broadened beyond the existing focused Student App/security coverage.

## Verification Commands And Results

```text
git status --short --untracked-files=all
```

Initial result: clean.

```text
git log --oneline -10
```

Result: HEAD matched expected baseline `f91a2e57`.

```text
npx prisma validate
```

Result: passed. Prisma reported the schema is valid.

```text
npm run build
```

Result: passed after clearing a stale generated `dist` directory. The first build attempt timed out, and the retry surfaced `ENOTEMPTY` while Nest tried to remove `dist/src/modules`. The verified workspace-local generated `dist` directory was removed, then `npm run build` passed.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
```

Result: passed, 33 tests.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts
```

Result: passed, 17 tests.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app-lessons.spec.ts
```

Result: passed, 5 tests.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-lessons.e2e-spec.ts
```

Result: passed, 5 tests.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.files.spec.ts
```

Result: passed, 8 tests.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/files-upload-download.e2e-spec.ts
```

Result: passed, 1 test.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts
```

Result: passed, 7 tests.

`npm run seed` was not required because the focused suites passed with the current local seed state.

## Discovered Gaps

No permission catalog, Student role, route metadata, forbidden permission, missing-permission denial, ownership/visibility, no-leak, or files-flow gaps were found.

## Limitations

No dedicated Student-role `/auth/me` runtime assertion was added in this sprint. The evidence is static and path-based: the Student seed list is complete, the auth repository loads role permission rows, the membership mapper exposes permission codes, and the existing `/auth/me` tenancy spec confirms the active membership permissions array is returned.

## Final Recommendation

The STU-PERM Student App permission enforcement sequence is ready for review. Later work should treat the final static route inventory as the regression tripwire for any new Student App controller route.

## Final Verdict

READY FOR REVIEW
