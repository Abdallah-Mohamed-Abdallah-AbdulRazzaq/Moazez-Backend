# Sprint 30A - Communication Phase C FCM Decision Lock

## 1. Summary

Phase C name: Communication Production Delivery & Mobile Push.

Baseline commit: `a48d36d docs: add communication enhancements final handoff`.

Sprint type: docs-only architecture, security, and implementation decision lock.

Final intended verdict: `COMMUNICATION_PHASE_C_FCM_DECISION_LOCKED`.

Sprint 30A does not implement Firebase Cloud Messaging yet. It does not add Firebase Admin SDK code, packages, environment validation, migrations, runtime workers, DTOs, presenters, routes, tests, or generated files.

Runtime source files changed in Sprint 30A: none.

Schema, migration, package, lockfile, and generated files changed in Sprint 30A: none.

## 2. Current Backend Reality Audit

Files and areas inspected for this decision lock:

- `docs/sprint-29g-communication-enhancements-final-handoff.md`
- `docs/sprint-29f-app-message-search-closeout.md`
- `docs/sprint-29e-scheduled-announcement-publishing-replay-closeout.md`
- `docs/sprint-29d-app-safe-attachment-presenter-hardening-closeout.md`
- `docs/sprint-29c-realtime-typing-presence-enrichment-closeout.md`
- `docs/sprint-29b-app-notification-filtering-grouping-closeout.md`
- `docs/sprint-29a-communication-enhancements-decision-lock.md`
- `docs/sprint-28o-track-a-final-integration-audit-handoff.md`
- `SECURITY_MODEL.md`
- `API_CONTRACT_RULES.md`
- `ENGINEERING_RULES.md`
- `TESTING_STRATEGY.md`
- `PRISMA_CONVENTIONS.md`
- `DOMAIN_GLOSSARY.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `ERROR_CATALOG.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`
- `package.json`
- `src/config/env.validation.ts`
- `prisma/schema.prisma`
- `src/modules/communication/communication.module.ts`
- `src/modules/communication/application/communication-notification-generation.service.ts`
- `src/modules/communication/application/communication-notification-preference.service.ts`
- `src/modules/communication/application/communication-notification-queue.service.ts`
- `src/modules/communication/infrastructure/communication-notification-generation.repository.ts`
- `src/modules/communication/infrastructure/communication-notification-generation.worker.ts`
- `src/modules/communication/infrastructure/communication-notification.repository.ts`
- `src/modules/communication/domain/communication-notification-domain.ts`
- `src/modules/communication/domain/communication-notification-generation-domain.ts`
- `src/modules/communication/presenters/communication-app-notification.presenter.ts`
- `src/modules/communication/presenters/communication-notification-delivery.presenter.ts`
- `src/modules/parent-app/notifications/**`
- `src/modules/student-app/notifications/**`
- `src/modules/teacher-app/notifications/**`
- `src/infrastructure/queue/**`
- `src/infrastructure/database/**`
- `src/modules/settings/email/domain/email-secret-crypto.ts`
- settings email use-cases that use encrypted provider secrets

Repository note: `DIRECTORY_STRUCTURE.md` was requested by the workspace guide but is not present in this checkout. The ADR files listed above are present and were read in numerical order.

Current facts found:

- `CommunicationNotification` rows are already created for message and announcement events.
- `CommunicationNotificationDelivery` rows are already created for the `IN_APP` channel.
- `CommunicationNotificationDelivery` already includes delivery fields: `channel`, `status`, `provider`, `providerMessageId`, `errorCode`, `errorMessage`, `attemptedAt`, `sentAt`, `deliveredAt`, `failedAt`, `metadata`, `createdAt`, and `updatedAt`.
- `CommunicationNotificationDeliveryChannel` already has enum values `IN_APP`, `EMAIL`, `SMS`, and `PUSH`, but only `IN_APP` is implemented for Communication notification generation today.
- `CommunicationNotificationDeliveryStatus` already has `PENDING`, `SENT`, `DELIVERED`, `FAILED`, and `SKIPPED`.
- Notification generation currently resolves recipients, applies in-app preferences, creates missing notifications, creates missing `IN_APP` delivery rows, and publishes realtime notification events only for created notifications.
- Message notification generation is synchronous after message creation and must not be blocked by future push sends.
- Announcement notification generation uses BullMQ through `CommunicationNotificationQueueService` and `CommunicationNotificationGenerationWorker`.
- The existing announcement notification worker reconstructs a request context from job data containing `schoolId`, `organizationId`, `actorUserId`, and `actorUserType`.
- Existing notification generation uses scoped Prisma and repository-level dedupe/advisory locks to avoid duplicate notification rows and duplicate in-app deliveries.
- `CommunicationNotificationPreference` currently has `inAppEnabled` only.
- Notification preference categories are currently `message_received` and `announcement`.
- Parent, Student, and Teacher notification preference routes already exist.
- Parent and Student notification/preference responses use dual camelCase plus snake_case aliases.
- Teacher notification/preference responses are camelCase only.
- The app notification center remains the source of truth for app-visible notification state.
- `package.json` does not contain `firebase-admin`.
- `src/config/env.validation.ts` has no Firebase or FCM variables.
- `src/config/env.validation.ts` includes optional `SETTINGS_SECRET_ENCRYPTION_KEY`.
- `src/modules/settings/email/domain/email-secret-crypto.ts` already provides an AES-256-GCM secret encryption pattern using `SETTINGS_SECRET_ENCRYPTION_KEY`.
- `CommunicationNotificationDelivery` presenter already sanitizes error messages that appear to contain token, secret, credential, password, bearer, authorization, or API key material.
- No `AppDeviceToken` model exists.
- No app device token registry table exists.
- No Firebase provider module exists.
- No push worker exists.
- No per-device push attempt table exists.
- No FCM token registration routes exist.
- Email and SMS are not to be implemented inside Communication Phase C.

## 3. External Infrastructure Assumptions

The project owner has completed the external setup below:

- Google Cloud project exists: `moazez-production`.
- Billing is enabled under official organization/project governance.
- Firebase is linked to the Google Cloud project.
- Firebase Cloud Messaging HTTP v1 API is enabled.
- Firebase Admin SDK service account JSON was generated securely.
- Organization policy disabling service account key creation was temporarily bypassed, then re-enabled after key extraction.
- Android `google-services.json` files are ready for mobile clients.
- iOS `GoogleService-Info.plist` files are ready for mobile clients.
- Web `firebaseConfig` is ready for future frontend/browser notification work.
- Google Maps APIs and frontend/backend API keys are prepared.

Security notes:

- Do not include any Firebase private key, service account JSON content, or API key in repository docs, code, tests, logs, tickets, or screenshots.
- Do not commit Firebase credentials.
- Do not log Firebase credentials.
- Do not log raw FCM registration tokens.
- Google Maps setup is out of scope for Communication FCM.
- The backend must not receive or store Google Maps frontend keys as part of Communication Phase C.

## 4. Locked Phase C Scope

In scope:

- Firebase Cloud Messaging push delivery for Communication notifications.
- Device token registration and unregistration for Parent, Student, and Teacher apps.
- Secure device token storage.
- Push delivery worker using the existing queue infrastructure.
- `PUSH` delivery rows tied to `CommunicationNotification`.
- Per-device delivery attempt tracking if needed.
- Invalid and stale token cleanup.
- Optional dry-run/local-disabled mode.
- App-safe FCM payloads and deep links.
- Push preference support.
- Final frontend/mobile integration handoff.

Out of scope:

- SMS channel.
- Email channel inside Communication.
- Google Maps implementation.
- Backend storage of Google Maps frontend keys.
- Global app-wide notification provider for unrelated modules unless routed through existing `CommunicationNotification`.
- Media transcoding.
- Video previews.
- Mentions parser.
- Pin, mute, clear, or export conversation actions.
- Delivery receipts and double-grey checks.
- Online status or exact lastSeen privacy expansion.
- Read-by grouping by role or class.
- Browser/web push implementation unless explicitly planned later.
- Real Firebase network calls in unit tests.
- Any secret committed to the repository.

Business channel decision:

- Communication notifications remain in-app first.
- Firebase Cloud Messaging is an additional mobile/browser push transport, not a replacement for `CommunicationNotification` rows.
- SMS is out of scope.
- Email notification delivery inside Communication is out of scope because email is handled elsewhere.

## 5. Secret and Environment Decision

Preferred production mode:

- `GOOGLE_APPLICATION_CREDENTIALS` points to a secure Firebase Admin SDK service-account JSON file mounted outside the repository.

Optional environment-variable mode, only if the deployment platform cannot mount files:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Required runtime flags for the future provider sprint:

- `FCM_ENABLED`
- `FCM_DRY_RUN`

Recommended local and test values:

- `FCM_ENABLED=false`
- `FCM_DRY_RUN=true`

Locked security decisions:

- The backend must never use the Firebase Web API key as the server send credential.
- Firebase Admin SDK credentials are server-side secrets.
- Service account JSON must live in hosting secret manager or a secure file mount, not Git.
- If env mode is used, private key newlines must be handled safely by the provider implementation.
- Future env validation must reject production FCM send mode unless valid server-side credentials are configured.
- Future logs must not include credential values, service account JSON, private keys, API keys, or raw FCM tokens.
- Node runtime compatibility with `firebase-admin` must be verified in Sprint 30C before package installation.

## 6. Device Token Registry Decision

Preferred model name: `AppDeviceToken`.

Reason:

- Device tokens are app infrastructure, not Communication-only state, even though Communication Phase C will be the first backend user.

Target table: `app_device_tokens`.

Proposed fields:

- `id`
- `schoolId`
- `userId`
- `tokenHash`
- `encryptedToken` or `tokenCiphertext`
- `platform`: `ANDROID | IOS | WEB`
- `appSurface`: `PARENT | STUDENT | TEACHER`
- `deviceId` optional
- `appVersion` optional
- `locale` optional
- `timezone` optional
- `isActive` default `true`
- `lastSeenAt`
- `revokedAt`
- `lastFailureCode`
- `lastFailureAt`
- `failureCount`
- `createdAt`
- `updatedAt`

Security decisions:

- Store `tokenHash` for lookup and deduplication.
- Store encrypted token/ciphertext for sending.
- Do not store raw token if the existing encryption convention can be reused or cleanly generalized.
- Prefer adapting the existing `SETTINGS_SECRET_ENCRYPTION_KEY` AES-256-GCM pattern for device-token encryption.
- If encryption cannot be introduced in the first implementation sprint, the implementation must document why, must never return raw token, and must never log raw token.
- Unique constraints should prevent duplicate active token registration per `schoolId`, `userId`, `tokenHash`, and `appSurface`.
- `schoolId` must be part of the model and must be enforced by scoped Prisma.
- `AppDeviceToken` must be added to the Prisma school scope model list when implemented.
- App clients must never pass `userId`, `schoolId`, `membershipId`, `roleId`, or `organizationId` to register or unregister a token.
- Token hash, encrypted token/ciphertext, and raw token must never be returned in app-facing responses.

## 7. App Token Registration Route Decision

Future app-facing routes:

Parent:

- `POST /api/v1/parent/notifications/device-tokens`
- `DELETE /api/v1/parent/notifications/device-tokens/current`

Student:

- `POST /api/v1/student/notifications/device-tokens`
- `DELETE /api/v1/student/notifications/device-tokens/current`

Teacher:

- `POST /api/v1/teacher/notifications/device-tokens`
- `DELETE /api/v1/teacher/notifications/device-tokens/current`

Register body:

- `token`: required string
- `platform`: `android | ios | web`
- `deviceId`: optional string
- `appVersion`: optional string
- `locale`: optional string
- `timezone`: optional string

Unregister body:

- Prefer token-based unregister because the FCM token is the actual credential to revoke.
- `token` should be accepted and preferred.
- `deviceId` may also be accepted for client bookkeeping, but it must not revoke a different user's token.
- If both are supplied, both must resolve inside the current actor/current app surface scope.

Response shape:

- `deviceTokenId`
- `platform`
- `appSurface`
- `isActive`
- `lastSeenAt`
- `createdAt`
- `updatedAt`

Alias style:

- Parent and Student should preserve dual aliases if notification DTO conventions still use them:
  - `deviceTokenId` and `device_token_id`
  - `appSurface` and `app_surface`
  - `isActive` and `is_active`
  - `lastSeenAt` and `last_seen_at`
  - `createdAt` and `created_at`
  - `updatedAt` and `updated_at`
- Teacher should remain camelCase only.

Client lifecycle:

- Register token after login.
- Register or update token on FCM token refresh.
- Unregister token on logout.
- Backend deactivates invalid or stale tokens after Firebase errors.

Route security:

- Parent routes derive `userId` and `schoolId` through `ParentAppAccessService`.
- Student routes derive `userId` and `schoolId` through `StudentAppAccessService`.
- Teacher routes derive `userId` and `schoolId` through `TeacherAppAccessService`.
- App clients cannot broaden token scope by sending raw ids.

## 8. Push Preference Decision

Future preference schema decision:

- Add `pushEnabled Boolean @default(true)` to `CommunicationNotificationPreference` in a future runtime sprint.

Reason:

- `inAppEnabled` controls whether an in-app `CommunicationNotification` row is created.
- `pushEnabled` controls whether a created notification should be sent to mobile/browser push.
- A user may want in-app notifications but not mobile push.
- If `inAppEnabled=false`, the notification row should not be created and therefore no push should be sent.
- If `inAppEnabled=true` and `pushEnabled=false`, the notification row is created, realtime may still occur, but FCM push is skipped.

Future DTO behavior:

- Existing preference categories remain `message_received` and `announcement`.
- Add `pushEnabled`.
- Parent and Student expose `pushEnabled` and `push_enabled`.
- Teacher exposes `pushEnabled` only.
- Backward compatibility: existing clients that only send `inAppEnabled` remain valid and do not need to send `pushEnabled`.
- Missing preference rows default to enabled for both in-app and push until a user changes them.

## 9. Push Delivery Pipeline Decision

Desired message notification flow:

1. Message is created.
2. `CommunicationNotificationGenerationService` creates missing `CommunicationNotification` rows.
3. `IN_APP` delivery rows remain unchanged.
4. Push delivery creation/enqueue is added after notification row creation, not before.
5. Push send must not block message creation.

Desired announcement notification flow:

1. Published announcement generation creates missing `CommunicationNotification` rows.
2. `IN_APP` delivery rows remain unchanged.
3. Push delivery creation/enqueue is added after notification row creation.
4. Replay can create or enqueue missing `PUSH` delivery work without duplicating in-app notifications.

Push worker decisions:

- Use BullMQ through the existing `QueueModule` and `BullmqService`.
- Use scoped request context with `schoolId` and `organizationId` from job data.
- Do not use a fake global bypass context.
- Keep batch processing bounded.
- Configure retries and backoff.
- Normalize Firebase provider errors into safe internal codes.
- Deactivate invalid and stale tokens.
- Job data must not contain raw FCM token if avoidable.
- Worker should load encrypted tokens from DB by `deviceTokenId` or by `recipientUserId` under current scope.
- Worker must not publish raw Firebase responses to app/admin payloads.

Delivery rows:

- Create `CommunicationNotificationDelivery` with channel `PUSH`.
- Status progression: `PENDING -> SENT`, `FAILED`, or `SKIPPED`.
- `provider` should be `firebase_fcm`.
- `providerMessageId` stores Firebase message id if available.
- `errorCode` stores a normalized safe error code.
- `errorMessage` must be safe and must not include token/private data.
- `metadata` must not include raw token, private key, credentials, or Firebase request payload containing a token.

Per-device attempt design:

- Preferred design: `CommunicationNotificationDelivery` represents notification-level `PUSH` delivery summary.
- Add `CommunicationNotificationPushAttempt` for per-device send attempts.

Reason:

- One notification can target multiple active devices.
- Keeping notification-level delivery rows separate from per-device attempts makes list/detail summaries simpler.
- Per-device attempts allow invalid token tracking and provider result recording without overloading delivery rows.
- Attempt rows can reference `AppDeviceToken` without exposing device token material.

Alternative considered:

- One `CommunicationNotificationDelivery` row per device token.

Decision:

- Use the preferred `CommunicationNotificationPushAttempt` design unless Sprint 30D proves a migration would be too heavy. If the alternative is chosen later, that sprint must document why and preserve the same no-leak guarantees.

## 10. Firebase Payload No-Leak Decision

Allowed FCM notification display fields:

- `title`
- `body`

Allowed FCM data payload fields:

- `notificationId`
- `type`
- `sourceModule`
- `deepLinkType`
- `conversationId` when route-safe and applicable
- `messageId` when route-safe and applicable
- `announcementId` when route-safe and applicable

Forbidden in FCM payload:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `recipientUserId`
- `actorUserId`
- `senderUserId`
- participant ids
- `guardianId`
- `studentGuardianId`
- `enrollmentId`
- `teacherAllocationId`
- `bucket`
- `objectKey`
- `storageKey`
- `signedUrl`
- raw metadata
- provider metadata
- queue metadata
- `deviceTokenId`
- FCM token
- private key
- stack traces
- internal errors

Behavior:

- FCM payload is not the source of truth.
- Client should use `notificationId` and the safe deep-link fields to fetch details from authenticated app APIs.
- Payloads should remain small, stable, and app-safe.
- Payloads must be built from the same safe notification/deep-link semantics used by app notification presenters, not from raw notification metadata.

## 11. Firebase Provider Decision

Target provider module paths:

- `src/infrastructure/push/firebase/firebase-admin.module.ts`
- `src/infrastructure/push/firebase/firebase-admin.service.ts`
- `src/infrastructure/push/firebase/firebase-push.provider.ts`

Provider behavior:

- Initialize Firebase Admin SDK once.
- Support disabled mode through `FCM_ENABLED=false`.
- Support dry-run mode through `FCM_DRY_RUN=true`.
- Support send to one token.
- Support bounded batches.
- Normalize provider results and errors.
- Never log raw token.
- Never expose credentials.
- Never return raw Firebase provider payloads to app/admin clients.
- Unit tests must mock Firebase Admin SDK.
- No real Firebase network calls in unit, app, or security test suites.

Package decision:

- `firebase-admin` will be added in a later runtime sprint, not Sprint 30A.
- Before adding the package, verify Node runtime compatibility with the current backend runtime and TypeScript/Nest build.

## 12. Invalid/Stale Token Behavior

Locked behavior:

- If Firebase returns an invalid/unregistered token style error, mark the related `AppDeviceToken` inactive.
- Set `revokedAt` or `lastFailureAt` according to the final model field names.
- Set `lastFailureCode`.
- Increment `failureCount`.
- Do not retry inactive tokens.
- Do not delete tokens by default unless a later cleanup job is explicitly approved.
- Keep audit and log output safe.
- Do not expose invalid-token provider details to app clients.

## 13. Security and Tenancy Model

Security model:

- Device tokens are user-scoped and school-scoped.
- Register and unregister derive the current user from Parent, Student, and Teacher app access services.
- Clients cannot pass `userId`, `schoolId`, `membershipId`, `roleId`, or `organizationId`.
- Token operations are current-actor only.
- Push delivery worker reads tokens only for the notification recipient within the current school scope.
- Cross-school notification/token access fails safely.
- App-facing responses must not include raw token, token hash, encrypted token, ciphertext, provider payloads, or credential material.
- Logs must not include token, credentials, raw Firebase request payload, or raw error payload if it contains sensitive data.
- Security tests must recursively assert no unsafe fields.

Tenant behavior:

- `AppDeviceToken` must be school-scoped.
- `CommunicationNotificationPushAttempt` must be school-scoped if implemented.
- Both models must be added to `SCHOOL_SCOPED_MODELS` when implemented.
- Worker job data may include route-safe internal ids needed for scope reconstruction, but must not include raw token.
- Worker code must use `runWithRequestContext` and scoped repositories, following the existing announcement notification generation worker pattern.

Audit/logging posture:

- Registration/unregistration may be audit-worthy because it affects a delivery credential.
- Audit records must not store raw token, token hash, ciphertext, or provider payloads.
- Provider errors must be normalized before storing or logging.

## 14. Future Sprint Plan

Sprint 30A - Communication Phase C FCM Decision Lock:

- Docs-only decision lock.

Sprint 30B - App Device Token Registry:

- Prisma model and migration.
- Register/unregister routes for Parent, Student, and Teacher.
- Token hash and encryption.
- DTOs, presenters, tests, and security coverage.
- No Firebase Admin network integration yet.

Sprint 30C - Firebase Admin Provider Foundation:

- Add `firebase-admin` dependency.
- Add env validation.
- Add Firebase provider module.
- Add disabled and dry-run modes.
- Add provider tests with mocks.
- No notification pipeline integration yet unless explicitly safe.

Sprint 30D - Push Delivery Worker Integration:

- Create and enqueue `PUSH` deliveries.
- Worker sends using Firebase provider.
- Per-device attempts.
- Invalid token cleanup.
- Replay compatibility.
- Tests and security coverage.

Sprint 30E - Push Preferences and App Handoff:

- Add `pushEnabled` to preferences.
- Parent/Student aliases and Teacher camelCase.
- App/mobile integration handoff.
- Final FCM closeout.

Optional later Sprint 30F - Communication Remaining Deferred Decisions:

- delivery receipts and double-grey checks
- pin, mute, clear, and export actions
- advanced mentions
- read-by grouping
- online status and lastSeen privacy expansion
- media/video pipeline decisions

## 15. Verification Commands for Sprint 30A

Required docs-only verification:

```powershell
git status --short --untracked-files=all
git diff --name-only
git diff --stat
git diff --check

npx prisma validate
npm run build
```

Optional but preferred verification:

```powershell
npm run test -- communication --runInBand
npm run test -- parent-app --runInBand
npm run test -- student-app --runInBand
npm run test -- teacher-app --runInBand
npm run test:security -- --runInBand
```

`npx prisma generate` should not be run in Sprint 30A because there are no schema changes.

Sprint 30A verification results:

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS - output: `?? docs/sprint-30a-communication-phase-c-fcm-decision-lock.md` |
| `git diff --name-only` | PASS - no output |
| `git diff --stat` | PASS - no output |
| `git diff --check` | PASS - no output |
| `npx prisma validate` | PASS - `The schema at prisma\schema.prisma is valid` |
| `npm run build` | PASS - `nest build` completed |
| `npm run test -- communication --runInBand` | PASS - 55 suites passed, 305 tests passed |
| `npm run test -- parent-app --runInBand` | PASS - 50 suites passed, 205 tests passed |
| `npm run test -- student-app --runInBand` | PASS - 50 suites passed, 242 tests passed |
| `npm run test -- teacher-app --runInBand` | PASS - 47 suites passed, 272 tests passed |
| `npm run test:security -- --runInBand` | PASS - 49 suites passed, 804 tests passed |

## 16. Acceptance Criteria

- Exactly one new docs file: `docs/sprint-30a-communication-phase-c-fcm-decision-lock.md`.
- No runtime source files changed.
- No tests changed.
- No Prisma schema or migration changed.
- No package or lockfile changed.
- No generated files changed.
- The document accurately describes current code reality.
- The document locks FCM-only direction.
- The document excludes SMS and email channels from Communication.
- The document records Firebase/GCP setup without secrets.
- The document locks device token storage strategy.
- The document locks token registration routes.
- The document locks `pushEnabled` decision.
- The document locks push delivery worker design.
- The document locks no-leak FCM payload.
- The document locks future sprint sequence.
- Verification commands pass.
- No commit is made.

## 17. Final Document Verdict

COMMUNICATION_PHASE_C_FCM_DECISION_LOCKED
