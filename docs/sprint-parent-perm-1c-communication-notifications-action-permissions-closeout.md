# PARENT-PERM-1C Communication / Notifications Action Permissions Closeout

## Sprint Name

PARENT-PERM-1C - Communication / Notifications Parent Action Permissions

## Baseline Commit

Expected baseline:

```text
b64a388f feat: enforce parent app read permissions
```

Actual repository HEAD at sprint start matched:

```text
b64a388f feat: enforce parent app read permissions
```

Initial `git status --short --untracked-files=all` was clean, aside from the local Git warning about `C:\Users\Abdal/.config/git/ignore` access.

## Files Changed

```text
src/modules/parent-app/announcements/controller/parent-announcements.controller.ts
src/modules/parent-app/messages/controller/parent-messages.controller.ts
src/modules/parent-app/notifications/controller/parent-notifications.controller.ts
test/security/tenancy.parent-app.spec.ts
docs/sprint-parent-perm-1c-communication-notifications-action-permissions-closeout.md
```

No seeds, schema files, migrations, common guards, common decorators, files module files, IAM files, Parent App application/infrastructure/DTO/presenter files, package files, or environment files were changed.

## Action Handlers Decorated Count

```text
parent_app_action_required_permissions=10
```

## Read-only Handlers Preserved Count

```text
parent_app_read_only_required_permissions=58
```

The PARENT-PERM-1B read-only metadata inventory remains intact.

## Total Parent App RBAC-covered Handlers Count

```text
parent_app_total_required_permissions=68
```

The updated static inventory covers 58 read-only handlers from PARENT-PERM-1B plus 10 action handlers from PARENT-PERM-1C.

## Permission Mapping Summary

Messages:

```text
ParentMessagesController.createConversation -> communication.conversations.create
ParentMessagesController.sendMessage -> communication.messages.send
ParentMessagesController.markRead -> communication.conversations.read
```

Announcements:

```text
ParentAnnouncementsController.markRead -> communication.announcements.read
```

Notifications, preferences, and device tokens:

```text
ParentNotificationsController.markAllRead -> communication.notifications.read
ParentNotificationsController.updatePreferences -> communication.notifications.preferences.manage
ParentNotificationsController.registerDeviceToken -> app.device_tokens.manage
ParentNotificationsController.unregisterCurrentDeviceToken -> app.device_tokens.manage
ParentNotificationsController.markRead -> communication.notifications.read
ParentNotificationsController.archive -> communication.notifications.archive
```

No broad/admin permissions were added or required:

```text
files.downloads.view
files.uploads.manage
communication.messages.attachments.manage
communication.conversations.manage
communication.participants.manage
communication.messages.edit
communication.messages.delete
communication.messages.moderate
communication.notifications.manage
communication.announcements.manage
communication.admin.view
communication.admin.manage
```

## Generic Files Boundary Preservation Note

The Parent role still does not receive:

```text
files.downloads.view
files.uploads.manage
```

No generic files route decorators, files module code, or file permission seeds were changed. Parent-owned task proof file access remains on the Parent App owned-child route and continues to rely on Parent App ownership checks plus the existing `reinforcement.submissions.view` decorator from PARENT-PERM-1B.

The focused Parent App security spec still verifies that the generic route remains forbidden for the Parent role:

```text
GET /api/v1/files/:fileId/download -> 403
```

## Tests Added / Updated

Updated `test/security/tenancy.parent-app.spec.ts` with:

```text
Static metadata inventory for all 10 PARENT-PERM-1C action handlers.
Complete route inventory asserting 68 Parent App handlers are explicitly accounted for.
Missing-permission HTTP denial coverage for all 8 action permission families.
Notification read, read-all, archive, preference, and hidden-resource happy/security coverage.
Notification preference teardown for rows created by the new test.
```

Existing coverage remains in place for:

```text
Parent message conversation visibility and send/read actions.
Parent announcement audience visibility and read marker action.
Parent device-token register/unregister no-leak behavior.
Non-parent actor rejection.
Same-school unlinked and cross-school resource hiding.
Generic shared files route denial for Parent role.
No-leak response expectations.
```

## Verification Command Results

```powershell
npx prisma validate
```

Result:

```text
PASS - Prisma schema is valid.
```

```powershell
npm run build
```

Result:

```text
PASS - nest build completed successfully.
```

```powershell
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts
```

Result:

```text
PASS - Test Suites: 1 passed, 1 total
PASS - Tests: 28 passed, 28 total
```

```powershell
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts
```

Result:

```text
PASS - Test Suites: 1 passed, 1 total
PASS - Tests: 7 passed, 7 total
```

Optional Parent child lessons specs were not run because this sprint did not touch lessons routes, lessons permissions, or files module behavior. The focused Parent App security spec already covers the generic files boundary relevant to this sprint.

## Known Stale E2E Note

`test/e2e/parent-app-final-closeout.e2e-spec.ts` is documented as stale on the clean baseline because of route-inventory/deferred-route expectations for currently registered Parent message and notification routes. It was not used as a required pass gate for this sprint and was not modified.

## No-leak / Ownership Preservation Note

This sprint only added method-level RBAC metadata and focused tests. It did not modify presenters, DTOs, use cases, repositories, access services, guards, ownership checks, or route behavior.

The focused tests verify:

```text
Missing action permission returns 403 auth.scope.missing with the expected missing permission code.
Parent message actions remain participant/visibility constrained.
Parent announcement read markers remain audience constrained.
Parent notification read/archive actions remain current-recipient constrained.
Parent notification preferences remain current-parent constrained.
Parent device token responses do not expose raw token material, token hash, or ciphertext.
Generic shared files download remains forbidden for the Parent role.
```

## Known Follow-up Sprint

```text
PARENT-PERM-1D - Final Parent Permission Closeout + Regression Audit
```

## Final Verdict

```text
READY FOR REVIEW
```
