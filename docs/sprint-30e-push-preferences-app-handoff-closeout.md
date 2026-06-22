# Sprint 30E - Push Preferences And App Handoff Closeout

## Summary

Sprint 30E adds `pushEnabled` support to Communication notification preferences and documents the final backend/mobile FCM integration contract. In-app notifications remain the source of truth. Firebase push remains an additional transport that is skipped when a recipient disables push for a Communication preference category.

Baseline commit: `d6ca255 feat: add communication push delivery worker`

Final verdict: `PUSH_PREFERENCES_APP_HANDOFF_COMPLETE`

## Files Changed

Schema and migration:

- `prisma/schema.prisma`
- `prisma/migrations/20260622170000_0043_communication_notification_push_preferences/migration.sql`

Runtime:

- `src/modules/communication/application/communication-notification-generation.service.ts`
- `src/modules/communication/application/communication-notification-preference.service.ts`
- `src/modules/communication/domain/communication-notification-preference-domain.ts`
- `src/modules/communication/dto/communication-notification-preference.dto.ts`
- `src/modules/communication/infrastructure/communication-notification-generation.repository.ts`
- `src/modules/communication/infrastructure/communication-notification-preference.repository.ts`
- `src/modules/communication/presenters/communication-notification-preference.presenter.ts`
- `src/modules/parent-app/notifications/dto/parent-notifications.dto.ts`
- `src/modules/student-app/notifications/dto/student-notifications.dto.ts`
- `src/modules/teacher-app/notifications/dto/teacher-notifications.dto.ts`

Tests:

- `src/modules/communication/tests/communication-notification-generation.repository.spec.ts`
- `src/modules/communication/tests/communication-notification-generation.service.spec.ts`
- `src/modules/communication/tests/communication-notification-preference.service.spec.ts`
- `src/modules/parent-app/notifications/tests/parent-notifications.use-case.spec.ts`
- `src/modules/student-app/notifications/tests/student-notifications.use-case.spec.ts`
- `src/modules/teacher-app/notifications/tests/teacher-notifications.use-case.spec.ts`

Docs:

- `docs/communication-fcm-mobile-push-handoff.md`
- `docs/sprint-30e-push-preferences-app-handoff-closeout.md`

No package, lockfile, Firebase provider, Google Maps, or generated source files were intentionally changed.

## Schema And Migration

`CommunicationNotificationPreference` now includes:

- `pushEnabled Boolean @default(true) @map("push_enabled")`

The migration adds `push_enabled BOOLEAN NOT NULL DEFAULT true` to existing preference rows. Missing preference rows are still treated as enabled by default in application behavior:

- `inAppEnabled=true`
- `pushEnabled=true`

No new model was added in this sprint.

## Preference Behavior

`inAppEnabled` and `pushEnabled` now have separate meanings:

- `inAppEnabled=false`: no `CommunicationNotification` row is created, so no push is sent.
- `inAppEnabled=true` and `pushEnabled=false`: the in-app notification row is created, IN_APP delivery and realtime notification-created behavior remain unchanged, and Firebase push is skipped.
- `inAppEnabled=true` and `pushEnabled=true`: Sprint 30D behavior remains; PUSH delivery is created and enqueued.

Preference updates are backward-compatible:

- Existing clients that only send `inAppEnabled` remain valid.
- Omitted `inAppEnabled` preserves the existing value or defaults to `true` for new rows.
- Omitted `pushEnabled` preserves the existing value or defaults to `true` for new rows.
- Conflicting camelCase and snake_case aliases are rejected safely.

## App Contracts

Routes are unchanged.

Parent:

- `GET /api/v1/parent/notifications/preferences`
- `PATCH /api/v1/parent/notifications/preferences`
- Response includes `pushEnabled` and `push_enabled`.

Student:

- `GET /api/v1/student/notifications/preferences`
- `PATCH /api/v1/student/notifications/preferences`
- Response includes `pushEnabled` and `push_enabled`.

Teacher:

- `GET /api/v1/teacher/notifications/preferences`
- `PATCH /api/v1/teacher/notifications/preferences`
- Response includes `pushEnabled` only.
- Teacher response remains camelCase only.

Supported categories remain:

- `message_received`
- `announcement`

No notification preference category was added.

## Push Enqueue Behavior

Notification generation now resolves push-enabled recipients after the in-app preference filter.

For push-enabled recipients:

- A PUSH delivery row is created idempotently.
- Push delivery work is enqueued through the Sprint 30D queue path.

For push-disabled recipients:

- A PUSH delivery row is created or updated as `SKIPPED`.
- `errorCode` is `push/preference-disabled`.
- `errorMessage` is `Push notification preference disabled`.
- `metadata.skippedReason` is `preference_disabled`.
- No push job is enqueued.

Existing `SENT` push deliveries are not rewritten when a preference later changes. Replay stays conservative and duplicate-safe: it does not duplicate existing PUSH deliveries, and preference-disabled deliveries are not re-enqueued.

Push preference lookup or enqueue failures remain non-blocking for message and announcement creation. Warnings must remain safe and must not include tokens, token hashes, ciphertext, credentials, provider payloads, or raw internals.

## Mobile Handoff

Permanent mobile/backend handoff:

- `docs/communication-fcm-mobile-push-handoff.md`

That document covers:

- Firebase environment expectations.
- Device token lifecycle.
- Parent, Student, and Teacher device-token routes.
- Preference routes and `pushEnabled` behavior.
- Push payload contract.
- Client deep-link behavior.
- Local/test FCM disabled and dry-run guidance.
- Out-of-scope SMS, email, browser service-worker, Google Maps, and non-Communication features.

## Security And No-Leak Confirmation

App-facing preference responses do not expose:

- schoolId
- organizationId
- userId
- membershipId
- roleId
- recipientUserId
- actorUserId
- deviceTokenId
- token
- tokenHash
- tokenCiphertext
- providerMessageId
- provider payloads
- queue metadata

FCM payload behavior from Sprint 30D remains unchanged: push payloads contain only safe notification and deep-link identifiers, and clients must fetch the source of truth through authenticated app APIs.

## Explicitly Not Included

- SMS notification channel.
- Email notification channel inside Communication.
- Real Firebase network calls in tests.
- New Firebase credentials or secrets.
- Firebase provider foundation changes.
- Device token route changes.
- Push retry dashboard.
- Delivery receipts or double-grey checks.
- Pin, mute, clear, or export conversation actions.
- Media transcoding, thumbnails, video previews, waveforms, or duration extraction.
- Mentions parser.
- Read-by grouping.
- Online status or lastSeen privacy expansion.
- Google Maps changes.
- Package or lockfile changes.

## Tests Run And Results

Verification was run locally during Sprint 30E:

- `git status --short --untracked-files=all`: PASS
- `git diff --name-only`: PASS
- `git diff --stat`: PASS
- `git diff --check`: PASS
- `npx prisma validate`: PASS
- `npx prisma generate`: PASS
- `npm run build`: PASS after clearing stale untracked `dist` build output; the first build attempt timed out, the next attempt hit Windows `ENOTEMPTY` during Nest cleanup, and the final reruns passed.
- `npm run test -- communication --runInBand`: PASS, 58 suites / 316 tests.
- `npm run test -- push --runInBand`: PASS, 6 suites / 30 tests.
- `npm run test -- firebase --runInBand`: PASS, 3 suites / 23 tests.
- `npm run test -- app-device-tokens --runInBand`: PASS, 4 suites / 12 tests.
- `npm run test -- parent-app --runInBand`: PASS, 50 suites / 206 tests.
- `npm run test -- student-app --runInBand`: PASS, 50 suites / 243 tests.
- `npm run test -- teacher-app --runInBand`: PASS, 47 suites / 273 tests.
- `npm run test:security -- --runInBand`: PASS, 49 suites / 807 tests.
- `npx prisma migrate deploy`: PASS, migration `20260622170000_0043_communication_notification_push_preferences` applied successfully.
- Final `git status --short --untracked-files=all`: PASS

## Final Verdict

PUSH_PREFERENCES_APP_HANDOFF_COMPLETE
