# Sprint 29B - App Notification Filtering & Grouping Closeout

## Summary

Sprint 29B implemented app-facing notification filtering and grouping for the existing Parent, Student, and Teacher notification center list routes. The work preserves Track A routes, actor scoping, notification generation, notification preferences, realtime behavior, and existing list response shape when `groupBy` is absent.

Final verdict: `APP_NOTIFICATION_FILTERING_GROUPING_COMPLETE`

## Files changed

Runtime files changed:

- `src/modules/communication/application/communication-app-notification-center.service.ts`
- `src/modules/communication/dto/communication-notification.dto.ts`
- `src/modules/communication/infrastructure/communication-notification.repository.ts`
- `src/modules/communication/presenters/communication-app-notification.presenter.ts`
- `src/modules/parent-app/notifications/dto/parent-notifications.dto.ts`
- `src/modules/student-app/notifications/dto/student-notifications.dto.ts`
- `src/modules/teacher-app/notifications/dto/teacher-notifications.dto.ts`

Test files changed:

- `src/modules/communication/tests/communication-app-notification-center.service.spec.ts`
- `src/modules/communication/tests/communication-app-notification.presenter.spec.ts`
- `src/modules/parent-app/notifications/tests/parent-notifications.use-case.spec.ts`
- `src/modules/student-app/notifications/tests/student-notifications.use-case.spec.ts`
- `src/modules/teacher-app/notifications/tests/teacher-notifications.use-case.spec.ts`

Closeout file changed:

- `docs/sprint-29b-app-notification-filtering-grouping-closeout.md`

## Runtime scope

The runtime change is limited to app notification list filtering, safe current-page grouping, DTO validation, and presentation. It does not change notification generation, notification preference persistence, notification delivery rows, realtime events, routes, global prefix, schema, migrations, packages, lockfiles, or generated files.

## Routes affected

Enhanced existing list routes only:

- `GET /api/v1/parent/notifications`
- `GET /api/v1/student/notifications`
- `GET /api/v1/teacher/notifications`

No changes were made to summary, detail, read, read-all, archive, or preference routes.

## Query params added

Added to Parent, Student, and Teacher list DTOs:

- `createdFrom`
- `createdTo`
- `unreadOnly`
- `category`
- `groupBy`

Existing query params remain supported:

- `status`
- `priority`
- `type`
- `sourceModule`
- `page`
- `limit`

## Date filter semantics

- `createdFrom` must be an ISO datetime string and is inclusive.
- Repository condition for app routes: `createdAt >= createdFrom`.
- `createdTo` must be an ISO datetime string and is exclusive.
- Repository condition for app routes: `createdAt < createdTo`.
- `createdFrom` and `createdTo` may be supplied together.
- The request is rejected if `createdFrom >= createdTo`.
- The app route uses a new repository filter field, `createdToExclusive`, so older core callers that use `createdTo` keep their existing inclusive behavior.

## unreadOnly semantics

- `unreadOnly=true` is equivalent to `status=unread`.
- `unreadOnly=false` has no filtering effect.
- `unreadOnly=true` with `status=unread` is accepted.
- `unreadOnly=true` with any non-`unread` status is rejected before repository access.
- DTO validation accepts only `true` and `false` string values from app query params.

## category/type mapping

`category` is an app-facing filter alias only. It does not add or change persistence enums or preference categories.

Accepted `category` values:

- `message_received`
- `announcement`
- `announcement_published`

Mapping:

- `category=message_received` -> `type=MESSAGE_RECEIVED`
- `category=announcement` -> `type=ANNOUNCEMENT_PUBLISHED`
- `category=announcement_published` -> `type=ANNOUNCEMENT_PUBLISHED`

If `category` and `type` are supplied together, the request is accepted only when they resolve to the same actual notification type. Conflicting combinations are rejected before repository access.

Preference categories remain `message_received` and `announcement`. Generated notification types remain `message_received` and `announcement_published`.

## sourceModule behavior

`sourceModule` remains backed by the existing notification source module allow list to preserve current behavior:

- `communication`
- `announcements`
- `attendance`
- `grades`
- `behavior`
- `reinforcement`
- `admissions`
- `students`
- `system`

This sprint did not add new source modules. Phase B Communication filtering is validated for `communication` and `announcements`; unsupported values are rejected safely by DTO/domain validation.

## groupBy behavior

Accepted `groupBy` values:

- `category`
- `sourceModule`
- `day`

When `groupBy` is absent, the response remains the existing Track A list shape:

- `notifications`
- `pagination`
- `summary`

When `groupBy` is present, the response adds a safe top-level `groups` array. Group rows include:

- `key`
- `label`
- `count`
- `unreadCount`
- `unread_count` for Parent and Student only

`groupBy=category`:

- `MESSAGE_RECEIVED` -> group key `message_received`, label `Messages`
- `ANNOUNCEMENT_PUBLISHED` -> group key `announcement`, label `Announcements`
- Unexpected existing non-Phase-B types are folded into safe group key `other`, label `Other`, instead of creating new app notification categories.

`groupBy=sourceModule`:

- Uses safe lowercase source module keys such as `communication` and `announcements`.
- Does not include `sourceId`, recipient ids, delivery ids, queue ids, or school ids.

`groupBy=day`:

- Uses UTC day boundaries from `createdAt.toISOString().slice(0, 10)`.
- Example key: `2026-06-21`.
- Does not expose timezone internals.

## Grouping aggregate scope

Groups are current-page based. The notification list still paginates normally, and `groups` counts only the filtered notifications returned in the current page. This matches the Sprint 29A preferred lightweight strategy and avoids adding broad aggregate queries in the first runtime sprint.

## Parent/Student/Teacher response style

- Parent and Student keep their Track A dual camelCase + snake_case alias style.
- Parent and Student group rows include `unreadCount` and `unread_count`.
- Teacher remains camelCase only.
- Teacher group rows include `unreadCount` and do not include `unread_count`.

## Security/no-leak confirmation

Filtering remains inside the existing app actor scope:

- Parent notifications are filtered only for the current parent user.
- Student notifications are filtered only for the current student user.
- Teacher notifications are filtered only for the current teacher user.

The app DTOs do not accept `userId`, `schoolId`, `recipientUserId`, `actorUserId`, `membershipId`, `roleId`, `organizationId`, or raw ownership ids. The shared service always sets `recipientUserId` from the resolved app actor and ignores attempted query overrides.

Responses and groups do not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `recipientUserId`
- `actorUserId`
- `userId`
- notification delivery ids
- notification queue ids
- provider metadata
- raw metadata
- `deletedAt`
- `passwordHash`

## Explicitly not included

This sprint did not include:

- new notification generation
- new notification preference categories
- push, FCM, APNs, or device tokens
- email, SMS, or provider delivery
- realtime event changes
- schema or migration changes
- package or lockfile changes
- generated file changes
- non-Communication category expansion
- a separate notification groups route

## Tests run and results

Focused tests run during implementation:

- `npm run test -- communication-app-notification --runInBand` - PASS, 2 suites, 13 tests
- `npm run test -- parent-notifications --runInBand` - PASS, 1 suite, 6 tests
- `npm run test -- student-notifications --runInBand` - PASS, 1 suite, 6 tests
- `npm run test -- teacher-notifications --runInBand` - PASS, 1 suite, 6 tests

Final verification:

- `git status --short --untracked-files=all` - PASS, only intended runtime/test/doc files changed.
- `git diff --name-only` - PASS, runtime/test files only; the closeout doc is untracked and listed by status.
- `git diff --stat` - PASS, no schema, migration, package, lockfile, generated, notification generation, preference, or realtime files changed.
- `git diff --check` - PASS, no whitespace errors; Git reported line-ending conversion warnings only.
- `npx prisma validate` - PASS, schema valid.
- `npx prisma generate` - PASS, Prisma Client generated to `node_modules/@prisma/client`.
- `npm run build` - PASS.
- `npm run test -- communication --runInBand` - PASS, 54 suites, 294 tests.
- `npm run test -- parent-app --runInBand` - PASS, 49 suites, 200 tests.
- `npm run test -- student-app --runInBand` - PASS, 49 suites, 237 tests.
- `npm run test -- teacher-app --runInBand` - PASS, 46 suites, 267 tests.
- `npm run test -- realtime --runInBand` - PASS, 9 suites, 48 tests.
- `npm run test -- files --runInBand` - PASS, 8 suites, 27 tests.
- `npm run test:security -- --runInBand` - PASS, 49 suites, 803 tests.

The full security suite completed successfully, so the focused fallback security command was not needed.

## Known follow-ups for 29C and later

- Sprint 29C: realtime typing and presence payload enrichment.
- Sprint 29D: app-safe attachment presenter hardening.
- Sprint 29E: scheduled announcement publishing and replay tooling.
- Sprint 29F: app message search.
- Consider full-filter aggregate notification groups later only if product needs counts beyond the current page and performance can be proven safe.
