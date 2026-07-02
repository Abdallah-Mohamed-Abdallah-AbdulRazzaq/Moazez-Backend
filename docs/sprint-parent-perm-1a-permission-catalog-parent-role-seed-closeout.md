# PARENT-PERM-1A Permission Catalog + Parent Role Seed Closeout

## Sprint Name

PARENT-PERM-1A - Permission Catalog + Parent Role Seed

## Baseline Commit

Expected baseline:

```text
11a3b1d5 docs: audit parent app permission coverage
```

Actual baseline at sprint start:

```text
11a3b1d5 docs: audit parent app permission coverage
2ede3f66 test: close student app permission coverage
f91a2e57 feat: enforce student communication profile permissions
e0d1ca61 feat: enforce student reinforcement action permissions
5ec5a782 feat: enforce student homework exam permissions
2307afd0 feat: enforce student app read permissions
e7c29693 feat: seed student app permissions
b10c1225 docs: audit student app permission coverage
bf7ad926 fix: make communication notification job ids bullmq safe
9865e56a docs: close student profile self-service
```

Initial `git status --short --untracked-files=all` was clean.

## Files Changed

```text
prisma/seeds/01-permissions.seed.ts
prisma/seeds/02-system-roles.seed.ts
docs/sprint-parent-perm-1a-permission-catalog-parent-role-seed-closeout.md
```

No `src/**`, `test/**`, schema, migration, package, or environment files were modified.

## Catalog Permissions Added

Added the five approved Parent App aggregate/self-facing catalog permissions:

```ts
{
  code: 'parent.home.view',
  module: 'parent',
  resource: 'home',
  action: 'view',
  description: 'View Parent App home aggregate data',
}
{
  code: 'parent.children.view',
  module: 'parent',
  resource: 'children',
  action: 'view',
  description: 'View Parent App linked children data',
}
{
  code: 'parent.profile.view',
  module: 'parent',
  resource: 'profile',
  action: 'view',
  description: 'View Parent App self profile data',
}
{
  code: 'parent.progress.view',
  module: 'parent',
  resource: 'progress',
  action: 'view',
  description: 'View Parent App child progress aggregate data',
}
{
  code: 'parent.reports.view',
  module: 'parent',
  resource: 'reports',
  action: 'view',
  description: 'View Parent App child reports aggregate data',
}
```

They were added in a `// parent app` section next to the existing app-facing permission sections.

## Final PARENT_PERMISSIONS List

```ts
const PARENT_PERMISSIONS = [
  'app.device_tokens.manage',
  'academics.calendar.view',
  'academics.curriculum.view',
  'academics.lesson_plans.view',
  'academics.subjects.view',
  'academics.timetable.view',
  'attendance.absences.view',
  'attendance.sessions.view',
  'behavior.points.view',
  'behavior.records.view',
  'communication.announcements.read',
  'communication.announcements.view',
  'communication.contacts.view',
  'communication.conversations.create',
  'communication.conversations.read',
  'communication.conversations.view',
  'communication.messages.send',
  'communication.messages.view',
  'communication.notifications.archive',
  'communication.notifications.preferences.manage',
  'communication.notifications.read',
  'communication.notifications.view',
  'discipline.timeline.view',
  'grades.assessments.view',
  'grades.gradebook.view',
  'grades.submissions.view',
  'homework.assignments.view',
  'homework.submissions.view',
  'parent.children.view',
  'parent.home.view',
  'parent.profile.view',
  'parent.progress.view',
  'parent.reports.view',
  'reinforcement.hero.badges.view',
  'reinforcement.hero.progress.view',
  'reinforcement.hero.view',
  'reinforcement.rewards.redemptions.view',
  'reinforcement.rewards.view',
  'reinforcement.submissions.view',
  'reinforcement.tasks.view',
  'reinforcement.xp.view',
  'students.enrollments.view',
  'students.records.view',
];
```

Parent role intentionally does not receive `files.downloads.view` or `files.uploads.manage` in PARENT-PERM-1A. This adjusts the PARENT-PERM-0A recommendation based on runtime security evidence: `files.downloads.view` currently authorizes the generic `/api/v1/files/:fileId/download` route using school scope and does not apply Parent App child ownership checks. Existing Parent App security tests correctly expect that generic route to remain forbidden for parents.

## Parent Permission Count

Static self-audit:

```json
{
  "catalog_total": 190,
  "parent_catalog_entries_present": [
    "parent.home.view",
    "parent.children.view",
    "parent.profile.view",
    "parent.progress.view",
    "parent.reports.view"
  ],
  "parent_catalog_entries_missing": [],
  "parent_permission_count": 43,
  "approved_parent_count": 43,
  "parent_missing_approved": [],
  "parent_extra_permissions": [],
  "parent_permissions_missing_catalog": [],
  "forbidden_parent_permission_count": 0,
  "forbidden_parent_permissions": [],
  "generic_file_permissions_in_parent": [],
  "generic_file_permissions_still_in_catalog": [
    "files.downloads.view",
    "files.uploads.manage"
  ],
  "student_permission_count": 57,
  "student_permissions_unchanged_from_head": true,
  "seed_guardrail_present": true
}
```

## Forbidden Parent Permission Check

Forbidden parent permission count is `0`.

The Parent role does not include:

```text
students.records.manage
students.guardians.manage
students.enrollments.manage
students.documents.view
students.documents.manage
students.medical.view
students.medical.manage
grades.items.manage
grades.assessments.manage
grades.assessments.publish
grades.assessments.approve
grades.assessments.lock
grades.submissions.submit
grades.submissions.review
homework.submissions.save
homework.submissions.submit
homework.answers.manage
homework.submission_attachments.manage
reinforcement.submissions.submit
reinforcement.rewards.redemptions.request
reinforcement.hero.missions.start
reinforcement.hero.missions.complete
reinforcement.hero.objectives.complete
communication.conversations.manage
communication.participants.manage
communication.messages.attachments.manage
communication.messages.edit
communication.messages.delete
communication.messages.moderate
communication.notifications.manage
communication.announcements.manage
communication.admin.view
communication.admin.manage
settings.*
platform.*
```

The Parent role also does not include `students.guardians.view`, `students.documents.view`, `students.medical.view`, `communication.messages.attachments.manage`, `files.downloads.view`, or `files.uploads.manage`.

## Student Permission Preservation Check

`STUDENT_PERMISSIONS` remains unchanged from the pre-sprint `HEAD` version.

Static self-audit result:

```text
student_permission_count: 57
student_permissions_unchanged_from_head: true
```

## Seed Guardrail Preservation Check

The existing missing-permission guardrail in `seedSystemRoles` was preserved:

- permissions are fetched by code;
- `foundPermissionIdsByCode` is built;
- each role permission code is checked;
- missing codes throw `Missing permissions for system role ...`;
- role permissions are created from the ordered role permission list.

## /auth/me Impact Note

`/auth/me` builds `activeMembership.permissions` from the active membership role's `rolePermissions.permission.code` rows through:

```text
src/modules/iam/auth/infrastructure/auth.repository.ts
src/modules/iam/auth/application/membership.mapper.ts
src/modules/iam/auth/application/me.use-case.ts
```

After seeding, Parent active memberships using the system `parent` role will expose the expanded 43-code permission list. No auth code was changed.

## Routes Intentionally Not Decorated In This Sprint

No Parent App route decorators were added. All `@RequiredPermissions()` work remains deferred to:

```text
PARENT-PERM-1B - Read-only Parent App Route Decorators
PARENT-PERM-1C - Communication / Notifications Parent Action Permissions
```

No controller files were changed.

## Tests / Verification Commands And Results

```text
npx prisma validate
```

Result: passed.

```text
npm run seed
```

Result: passed.

Seed output included:

```text
✔ seeded 190 permissions
✔ seeded 6 system roles
OK seed complete
```

```text
npm run build
```

Result: passed.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts
```

Result: passed.

```text
Test Suites: 1 passed, 1 total
Tests:       22 passed, 22 total
```

This confirms removing `files.downloads.view` from the Parent role restores the expected generic file route denial while keeping Parent-owned file route behavior intact.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-final-closeout.e2e-spec.ts
```

Result: failed.

The previous generic shared file route failure is repaired; this suite no longer reports the `expected 403, got 307` file-download mismatch.

Remaining failures are stale route-inventory/deferred-route expectations for current Parent App message and notification routes:

```text
registers the Sprint 9F Parent App route set and keeps deferred routes absent
does not expose mutation, avatar upload, add-child, or deferred Parent App routes
```

The route inventory test expects several current routes to be absent even though they are registered in the application, including current Parent message contacts/search/attachment metadata routes and Parent notification read/preferences/device-token routes.

The failed suite also hits cleanup fallout:

```text
Foreign key constraint violated on communication_notifications_recipient_user_id_fkey
```

No tests were modified in this sprint, per scope.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts
```

Result: passed, 7 tests.

## Runtime Security Decision

PARENT-PERM-0A recommended granting `files.downloads.view` and `files.uploads.manage` to the Parent role for shared file flows. Runtime security tests showed that granting `files.downloads.view` allows a parent to use the generic shared file route:

```text
GET /api/v1/files/:fileId/download
```

That route currently authorizes by active school scope plus permission and does not apply Parent App child ownership checks. Existing Parent App tests expect the generic route to remain `403` for parents and the Parent-owned file route to remain the allowed route:

```text
GET /api/v1/parent/children/:studentId/files/:fileId/download
```

Therefore this sprint removes `files.downloads.view` and `files.uploads.manage` from `PARENT_PERMISSIONS` for now while keeping both permissions in the catalog. Parent-owned file download authorization will be handled later after a dedicated decision in PARENT-PERM-1B or a files-boundary sprint.

This is a runtime/security-test-driven adjustment to the PARENT-PERM-0A recommendation.

## Remaining Verification Blocker

The seed-level files boundary is repaired and `test/security/tenancy.parent-app.spec.ts` now passes. The remaining blocker is `test/e2e/parent-app-final-closeout.e2e-spec.ts`, whose route inventory and deferred-route assertions are stale relative to the current Parent App message and notification routes.

This sprint is not allowed to modify `test/**`, controllers, or route behavior, so the stale e2e expectations are reported rather than changed.

## Known Follow-up Sprint

```text
PARENT-PERM-1B - Read-only Parent App Route Decorators
```

PARENT-PERM-1B should decide whether Parent App-owned download routes use a Parent App-specific permission, reuse `files.downloads.view` only after shared-route ownership is constrained, or defer file route decorators to a dedicated files-boundary sprint.

## Baseline Verification For Stale E2E

To verify whether `test/e2e/parent-app-final-closeout.e2e-spec.ts` was failing because of PARENT-PERM-1A or because of pre-existing stale expectations, the PARENT-PERM-1A working tree was stashed and the suite was run on clean baseline `11a3b1d5`.

Clean baseline result: failed with the same stale route inventory/deferred-route expectations for currently registered Parent message and notification routes.

Therefore this e2e failure is pre-existing test debt and not introduced by PARENT-PERM-1A.

The PARENT-PERM-1A-specific file boundary regression was repaired and `test/security/tenancy.parent-app.spec.ts` passed 22 tests.

## Final Verdict

READY FOR REVIEW
