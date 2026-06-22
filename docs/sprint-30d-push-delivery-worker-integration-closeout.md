# Sprint 30D - Push Delivery Worker Integration Closeout

## Summary

Sprint 30D integrated queued Firebase push delivery for Communication notifications.

Baseline commit: `0f908e5 feat: add firebase push provider foundation`

Final verdict: `PUSH_DELIVERY_WORKER_INTEGRATION_COMPLETE`

## Files changed

Runtime:
- `prisma/schema.prisma`
- `src/infrastructure/database/school-scope.extension.ts`
- `src/modules/app-device-tokens/app-device-tokens.module.ts`
- `src/modules/app-device-tokens/infrastructure/app-device-token.repository.ts`
- `src/modules/communication/communication.module.ts`
- `src/modules/communication/application/communication-message.use-cases.ts`
- `src/modules/communication/application/communication-notification-generation.service.ts`
- `src/modules/communication/application/communication-notification-push-delivery.service.ts`
- `src/modules/communication/application/communication-notification-push-payload.builder.ts`
- `src/modules/communication/application/communication-notification-push-queue.service.ts`
- `src/modules/communication/domain/communication-notification-generation-domain.ts`
- `src/modules/communication/infrastructure/communication-notification-generation.repository.ts`
- `src/modules/communication/infrastructure/communication-notification-push.repository.ts`
- `src/modules/communication/infrastructure/communication-notification-push.worker.ts`

Tests:
- `src/modules/communication/tests/communication-message.use-case.spec.ts`
- `src/modules/communication/tests/communication-notification-generation.repository.spec.ts`
- `src/modules/communication/tests/communication-notification-generation.service.spec.ts`
- `src/modules/communication/tests/communication-notification-push-delivery.service.spec.ts`
- `src/modules/communication/tests/communication-notification-push-payload.builder.spec.ts`
- `src/modules/communication/tests/communication-notification-push-queue.service.spec.ts`
- `test/security/tenancy.communication.spec.ts`

Schema/migration:
- `prisma/migrations/20260622150000_0042_communication_notification_push_attempts/migration.sql`

No package, lockfile, Firebase credential, generated tracked file, SMS/email, Google Maps, or `pushEnabled` preference changes were made.

## Schema and migration

Added `CommunicationNotificationPushAttempt` mapped to `communication_notification_push_attempts`.

Key fields:
- `schoolId`
- `deliveryId`
- `deviceTokenId`
- `status`
- `provider`
- `providerMessageId`
- `errorCode`
- `errorMessage`
- `attemptedAt`
- `sentAt`
- `failedAt`
- `skippedAt`
- timestamps

Constraints and indexes:
- unique `[deliveryId, deviceTokenId]`
- school/status and delivery/device-token indexes
- composite foreign keys through `school_id` to keep attempts tied to same-school deliveries and device tokens

`CommunicationNotificationPushAttempt` was added to `SCHOOL_SCOPED_MODELS`. It was not added to soft-delete models.

## Queue and worker

Added queue:
- `communication-notification-push`

Added job:
- `communication.notification.push.send`

Deterministic job id:
- `communication-push:<deliveryId>`

Job data contains only:
- `schoolId`
- `organizationId`
- `notificationId`
- `deliveryId`
- `actorUserId`
- `actorUserType`

Job data never contains raw FCM token, token hash, token ciphertext, Firebase credentials, provider payloads, provider errors, private keys, signed URLs, or storage internals.

The push worker reconstructs scoped request context with school and organization ids, loads the PUSH delivery under that scope, loads active app device tokens for the notification recipient, decrypts token ciphertext only inside the worker send path, calls `FirebasePushProvider`, records per-device attempts, and updates the notification-level PUSH delivery.

## Delivery and attempt behavior

For each generated Communication notification, the repository now ensures a notification-level `CommunicationNotificationDelivery` row:
- `channel = PUSH`
- `status = PENDING`
- `provider = firebase_fcm`

Creation is idempotent against existing PUSH deliveries for the notification and is replay-safe.

Per-device attempts are upserted by `[deliveryId, deviceTokenId]`, so worker retries do not duplicate attempts.

Delivery status summary:
- no active tokens: delivery `SKIPPED`, safe code `push/no-active-device-tokens`
- provider disabled/dry-run: attempts and delivery `SKIPPED` with safe provider skip code
- all failed: delivery `FAILED`
- at least one provider-accepted send: delivery `SENT`

`deliveredAt` is not set because FCM send acceptance is not device delivery confirmation.

## Payload no-leak behavior

FCM notification display payload:
- `title`
- `body`

FCM data payload:
- `notificationId`
- `type`
- `sourceModule`
- `deepLinkType`
- `conversationId` when safe
- `messageId` when safe
- `announcementId` when safe

The payload builder does not pass raw notification metadata through. It only derives safe deep-link fields from known Communication metadata.

Forbidden fields are not included:
- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `recipientUserId`
- `actorUserId`
- `senderUserId`
- `deviceTokenId`
- `token`
- `tokenHash`
- `tokenCiphertext`
- storage/provider/queue metadata
- stack traces
- internal errors

The Sprint 30C provider-level forbidden-key guard remains active as a second layer.

## Invalid token cleanup

The worker marks an `AppDeviceToken` inactive only for normalized invalid-token errors:
- `fcm/registration-token-not-registered`
- `fcm/invalid-registration-token`

For transient provider errors such as `fcm/unavailable` or `fcm/internal`, the worker records `lastFailureCode`, `lastFailureAt`, and increments `failureCount`, but it does not deactivate the token.

## Integration points

Message notification generation:
- still creates CommunicationNotification rows and IN_APP deliveries first
- now ensures/enqueues PUSH deliveries after notification rows exist
- message creation remains non-blocking if push enqueue fails

Announcement notification generation:
- existing generation and replay dedupe behavior remains intact
- PUSH deliveries are ensured for existing or newly created notification rows
- replay can enqueue existing/missing PUSH delivery work without duplicating IN_APP notifications

Realtime notification-created behavior is unchanged.

App notification center contracts are unchanged.

## Explicit exclusions

Not included:
- `pushEnabled` notification preference
- SMS/email channels
- Google Maps changes
- delivery receipts/double-grey checks
- pin/mute/clear/export
- media transcoding/video previews
- mentions parser
- read-by grouping
- online status or lastSeen privacy expansion
- app-facing raw push delivery/provider details
- real Firebase network calls in tests

## Verification

Commands run:
- `git diff --check` - PASS
- `npx prisma validate` - PASS, schema valid
- `npx prisma generate` - PASS, Prisma Client generated
- `npm run build` - PASS
- `npm run test -- push --runInBand` - PASS, 6 suites / 30 tests
- `npm run test -- app-device-tokens --runInBand` - PASS, 4 suites / 12 tests
- `npm run test -- firebase --runInBand` - PASS, 3 suites / 23 tests
- `npm run test -- communication --runInBand` - PASS, 58 suites / 314 tests
- `npm run test -- parent-app --runInBand` - PASS, 50 suites / 206 tests
- `npm run test -- student-app --runInBand` - PASS, 50 suites / 243 tests
- `npm run test -- teacher-app --runInBand` - PASS, 47 suites / 273 tests
- `npm run test:security -- --runInBand` - TIMEOUT after 304 seconds without terminal result
- focused fallback `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.communication.spec.ts test/security/tenancy.parent-app.spec.ts test/security/tenancy.student-app.spec.ts test/security/tenancy.teacher-app.spec.ts` - PASS, 4 suites / 156 tests
- `npx prisma migrate deploy` - PASS, applied `20260622150000_0042_communication_notification_push_attempts`

## Known follow-ups

Sprint 30E:
- add `pushEnabled` preferences
- finish app/mobile push preference handoff
- preserve Parent/Student aliases and Teacher camelCase behavior

Later:
- retry dashboard decisions if safe persistence is approved
- browser/service-worker implementation if separately scoped
- delivery receipts/double-grey checks if separately scoped

PUSH_DELIVERY_WORKER_INTEGRATION_COMPLETE
