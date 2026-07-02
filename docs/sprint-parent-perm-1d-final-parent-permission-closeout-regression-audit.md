# PARENT-PERM-1D - Final Parent Permission Closeout + Regression Audit

## Sprint name

PARENT-PERM-1D - Final Parent Permission Closeout + Regression Audit

## Baseline commit

Expected and actual baseline HEAD:

```text
fd1004b1 feat: enforce parent app action permissions
```

## Files changed

```text
test/e2e/parent-app-final-closeout.e2e-spec.ts
test/security/tenancy.parent-app.spec.ts
docs/sprint-parent-perm-1d-final-parent-permission-closeout-regression-audit.md
```

No `src/**`, seed, schema, migration, package, or env files were changed.

## Final Parent role count and exact decision

The final Parent role remains locked to exactly 43 permissions.

The Parent role intentionally does not include generic shared file permissions:

```text
files.downloads.view
files.uploads.manage
```

This preserves the PARENT-PERM-1A runtime security decision: the generic `/api/v1/files/:fileId/download` route is school-scoped and does not apply Parent App child ownership checks. Parent-owned file access remains routed through Parent App owned-child endpoints instead.

## Parent App RBAC coverage summary

Final Parent App RBAC coverage:

```text
Read-only handlers: 58
Action/write/self-service handlers: 10
Total covered handlers: 68
```

The route inventory in `test/e2e/parent-app-final-closeout.e2e-spec.ts` was updated to match the current real Parent App route surface, including message contacts/search/reader/info/attachment-preview/download routes and notification list/detail/preferences/action routes.

## Final route inventory result

The final closeout e2e route inventory now asserts:

```text
68 registered Parent App handlers
58 GET/read-only handlers
10 non-GET action handlers
```

Unsupported/deferred routes remain asserted absent, including unrelated root app routes and unsupported Parent App mutation surfaces.

## Final permission metadata inventory result

`test/security/tenancy.parent-app.spec.ts` preserves the static metadata inventory proving:

```text
58 read-only handlers have exact @RequiredPermissions() metadata
10 action handlers have exact @RequiredPermissions() metadata
68 total Parent App handlers are accounted for
```

The inventory also verifies every registered Parent App route has a matching permission inventory entry.

## Parent role seed integrity result

A security regression test now statically audits the seed files and verifies:

```text
PARENT_PERMISSIONS count is exactly 43
PARENT_PERMISSIONS equals the approved 43-permission list
All Parent role permissions exist in the permission catalog
Parent role excludes generic file, broad communication, student document/medical/guardian, settings.*, and platform.* permissions
STUDENT_PERMISSIONS remains at 57 permissions
The missing-permission seed guardrail remains present
```

No seed files were modified in this sprint.

## /auth/me Parent permissions result

The Parent App security suite now verifies `/api/v1/auth/me` exposes exactly 43 Parent active membership permissions through the existing membership mapping.

Representative included permissions:

```text
parent.home.view
parent.children.view
communication.messages.send
communication.notifications.archive
app.device_tokens.manage
```

Representative excluded permissions:

```text
files.downloads.view
files.uploads.manage
students.documents.view
students.medical.view
communication.messages.attachments.manage
```

## Generic files boundary result

The security regression coverage now verifies:

```text
Parent-owned GET /api/v1/parent/children/:studentId/files/:fileId/download still works for an owned child task proof file
Generic GET /api/v1/files/:fileId/download is forbidden for Parent role with auth.scope.missing and files.downloads.view missing
Generic POST /api/v1/files is forbidden for Parent role with auth.scope.missing and files.uploads.manage missing
```

The existing files security and upload/download e2e specs also pass.

## No-leak / ownership regression result

Existing Parent App security coverage remains intact for:

```text
Same-school unlinked children hidden
Cross-school children/resources hidden
Non-parent actors rejected
Hidden conversations inaccessible
Hidden announcements inaccessible
Other-user notifications inaccessible
Other-actor device-token operations forbidden
Parent responses do not expose tenant, membership, user-link, storage, raw signed URL JSON, or admin/audit internals
```

No presenters, DTOs, use cases, guards, controllers, or ownership services were modified.

## Tests updated

```text
test/e2e/parent-app-final-closeout.e2e-spec.ts
test/security/tenancy.parent-app.spec.ts
```

Updates included:

```text
Final Parent App route inventory correction
Notification cleanup before user deletion
Parent role seed integrity audit
/auth/me Parent permission exposure audit
Generic files boundary assertions for Parent role
```

## Verification command results

```text
git status --short --untracked-files=all
PASS - clean before sprint changes

git log --oneline -10
PASS - HEAD matched fd1004b1 feat: enforce parent app action permissions

npx prisma validate
PASS - schema is valid

npm run seed
PASS - seeded 190 permissions and 6 system roles

npm run build
PASS - Nest build completed

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts
PASS - 30 passed, 30 total

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-final-closeout.e2e-spec.ts
PASS - 18 passed, 18 total

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts
PASS - 7 passed, 7 total

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app-child-lessons.spec.ts
PASS - 5 passed, 5 total

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-child-lessons.e2e-spec.ts
PASS - 5 passed, 5 total

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.files.spec.ts
PASS - 8 passed, 8 total

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/files-upload-download.e2e-spec.ts
PASS - 1 passed, 1 total
```

## Known remaining issues

Future dedicated files-boundary work may decide whether Parent App-specific upload/download permissions are needed. This sprint intentionally keeps generic shared file permissions out of the Parent role.

## Final verdict

```text
READY FOR REVIEW
```
