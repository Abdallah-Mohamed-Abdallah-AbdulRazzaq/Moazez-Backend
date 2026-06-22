# Sprint 30C - Firebase Admin Provider Foundation Closeout

## Summary

Baseline commit: `c7f840b feat: add app device token registry`.

Sprint 30C adds the Firebase Admin SDK provider foundation for future Communication FCM push delivery. The sprint adds the `firebase-admin` runtime dependency, FCM environment validation, a safe Firebase provider module, disabled and dry-run modes, mocked enabled-mode send behavior, payload no-leak validation, provider result shaping, and safe Firebase error normalization.

Final verdict: `FIREBASE_ADMIN_PROVIDER_FOUNDATION_COMPLETE`.

## Files Changed

Package and lockfile:

- `package.json`
- `package-lock.json`

Environment validation:

- `src/config/env.validation.ts`

Firebase infrastructure provider:

- `src/infrastructure/push/firebase/firebase-admin.module.ts`
- `src/infrastructure/push/firebase/firebase-admin.service.ts`
- `src/infrastructure/push/firebase/firebase-push.provider.ts`
- `src/infrastructure/push/firebase/firebase-push.types.ts`
- `src/infrastructure/push/firebase/firebase-push-error-normalizer.ts`

Tests:

- `src/infrastructure/push/firebase/tests/firebase-env.validation.spec.ts`
- `src/infrastructure/push/firebase/tests/firebase-push.provider.spec.ts`
- `src/infrastructure/push/firebase/tests/firebase-push-error-normalizer.spec.ts`

Closeout:

- `docs/sprint-30c-firebase-admin-provider-foundation-closeout.md`

## Package and Runtime Compatibility

Added runtime dependency:

- `firebase-admin@^14.0.0`

Compatibility check:

- Installed package version: `14.0.0`
- Package engine requirement: `node >=22`
- Local runtime used for verification: `node v22.21.1`

No unrelated package dependencies were intentionally added. `npm install firebase-admin` updated `package-lock.json` with the Firebase Admin dependency tree and reported existing npm audit findings; no audit fix or unrelated upgrade was run.

## Environment Validation Changes

Added FCM flags:

- `FCM_ENABLED`, default `false`
- `FCM_DRY_RUN`, default `true`

Added optional credential inputs:

- `GOOGLE_APPLICATION_CREDENTIALS`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Validation behavior:

- Disabled mode does not require Firebase credentials.
- Dry-run mode does not require Firebase credentials.
- Real send mode (`FCM_ENABLED=true` and `FCM_DRY_RUN=false`) requires exactly one credential strategy:
  - `GOOGLE_APPLICATION_CREDENTIALS`; or
  - the env credential triple: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
- Partial env credential triples are rejected safely.
- If env credentials are used, escaped private-key newlines remain accepted and are normalized by the provider.
- No Firebase Web API key or frontend Firebase config is accepted as a backend send credential.

## Provider Module Paths

Provider module:

- `src/infrastructure/push/firebase/firebase-admin.module.ts`

Provider service:

- `src/infrastructure/push/firebase/firebase-admin.service.ts`

Push provider:

- `src/infrastructure/push/firebase/firebase-push.provider.ts`

Types:

- `src/infrastructure/push/firebase/firebase-push.types.ts`

Error normalizer:

- `src/infrastructure/push/firebase/firebase-push-error-normalizer.ts`

The module exports `FirebaseAdminService` and `FirebasePushProvider` for future Sprint 30D worker consumption. It is not imported into Communication notification generation, app modules, or `AppModule` in this sprint.

## Mode Behavior

Disabled mode:

- `FCM_ENABLED=false`
- Firebase Admin SDK is not initialized.
- Single send returns a safe skipped result with `skippedReason: "disabled"`.
- Batch send returns safe skipped per-token-index rows.
- No network calls are made.

Dry-run mode:

- `FCM_DRY_RUN=true`
- Firebase Admin SDK messaging send methods are not called.
- Single send returns `skippedReason: "dry_run"`.
- Batch send returns safe skipped per-token-index rows.
- Payload validation still runs, including forbidden-key checks.
- No network calls are made.

Enabled send mode:

- `FCM_ENABLED=true`
- `FCM_DRY_RUN=false`
- Firebase Admin SDK initializes once and reuses the app instance.
- `GOOGLE_APPLICATION_CREDENTIALS` uses `applicationDefault()`.
- Env credential mode uses `cert({ projectId, clientEmail, privateKey })`.
- Escaped private-key newlines are normalized before `cert(...)`.
- Single send uses mocked `messaging.send(...)` in tests.
- Batch send uses mocked `messaging.sendEachForMulticast(...)` in tests.

## Provider Input and Result Contracts

Single send input:

- `token`
- `notification.title`
- `notification.body`
- optional string `data`
- optional `android`, `apns`, and `webpush` configs

Batch send input:

- `tokens`
- `notification.title`
- `notification.body`
- optional string `data`
- optional `android`, `apns`, and `webpush` configs
- optional `maxBatchSize`

Batch limits:

- default max batch size: `500`
- absolute max batch size: `500`

Single result:

- `status`: `sent`, `skipped`, or `failed`
- `provider`: `firebase_fcm`
- optional `providerMessageId`
- optional `skippedReason`
- optional safe `errorCode`
- optional safe `errorMessage`

Batch result:

- `status`: `sent`, `partial`, `skipped`, or `failed`
- `provider`: `firebase_fcm`
- `successCount`
- `failureCount`
- per-item `results` with `tokenIndex`, never token value
- optional safe error fields

No provider result includes raw FCM token, credentials, private key, raw Firebase request payload, raw Firebase error object, or stack trace.

## Payload No-Leak Guard

The provider rejects forbidden FCM data keys before send, including:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `recipientUserId`
- `actorUserId`
- `senderUserId`
- `guardianId`
- `studentGuardianId`
- `enrollmentId`
- `teacherAllocationId`
- `bucket`
- `objectKey`
- `storageKey`
- `signedUrl`
- `deviceTokenId`
- `token`
- `tokenHash`
- `tokenCiphertext`
- `privateKey`
- `credential`
- `credentials`
- `authorization`
- `bearer`
- `providerMetadata`
- `queueMetadata`
- `rawMetadata`
- `stack`
- `errorStack`

The guard is case-insensitive. It reports the forbidden key name but never reports the offending value.

Future Communication data keys remain safe for Sprint 30D:

- `notificationId`
- `type`
- `sourceModule`
- `deepLinkType`
- `conversationId`
- `messageId`
- `announcementId`

## Error Normalization

Common Firebase Messaging error codes are normalized to safe internal codes:

- `messaging/registration-token-not-registered` -> `fcm/registration-token-not-registered`
- `messaging/invalid-registration-token` -> `fcm/invalid-registration-token`
- `messaging/invalid-argument` -> `fcm/invalid-argument`
- `messaging/quota-exceeded` -> `fcm/quota-exceeded`
- `messaging/sender-id-mismatch` -> `fcm/sender-id-mismatch`
- `messaging/unavailable` -> `fcm/unavailable`
- `messaging/internal` -> `fcm/internal`
- unknown provider codes -> `fcm/unknown`

Error messages are sanitized. If a provider message contains token, bearer, authorization, credential, private key, API key, or secret-looking material, the provider stores/returns the generic message:

- `Firebase push send failed`

## Explicitly Not Included

- No Communication notification generation integration.
- No message or announcement push sends.
- No push worker.
- No `PUSH` delivery row creation.
- No per-device push attempt table.
- No `pushEnabled` preference.
- No AppDeviceToken schema change.
- No Prisma schema or migration change.
- No app route changes.
- No Parent, Student, or Teacher contract changes.
- No SMS notification channel.
- No email notification channel inside Communication.
- No Google Maps changes.
- No Firebase private key, service account JSON, API key, or FCM token committed.
- No real Firebase network calls in tests.

## Tests Added

Environment validation tests cover:

- defaults for `FCM_ENABLED=false` and `FCM_DRY_RUN=true`
- disabled mode without credentials
- dry-run mode without credentials
- enabled non-dry-run credential requirement
- `GOOGLE_APPLICATION_CREDENTIALS` strategy
- env credential triple strategy
- escaped newline acceptance
- partial env credential rejection
- duplicate strategy rejection

Provider tests cover:

- disabled mode does not initialize Firebase Admin SDK
- disabled single and batch skipped results
- dry-run single skipped result without messaging send calls
- dry-run forbidden payload validation
- enabled single send with mocked Firebase messaging
- one-time Firebase app initialization
- `GOOGLE_APPLICATION_CREDENTIALS` strategy
- env credential `cert(...)` strategy with newline normalization
- bounded batch send with per-token-index results
- provider failure normalization
- non-string data value rejection
- forbidden data key detection

Error normalizer tests cover:

- common Firebase code mapping
- unknown code fallback
- sensitive message sanitization
- safe concise message preservation

## Verification Results

Git and diff checks:

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS - output shows intended package, env validation, Firebase provider/test files, and this closeout doc only |
| `git diff --name-only` | PASS - tracked changes: `package-lock.json`, `package.json`, `src/config/env.validation.ts`; new files are untracked as expected because no commit/staging was requested |
| `git diff --stat` | PASS - tracked diff: 3 files changed, 1533 insertions, 78 deletions; new untracked provider/test/doc files are visible in `git status` |
| `git diff --check` | PASS - no whitespace errors; Git reported line-ending warnings for tracked modified files |

Package installation:

| Command | Result |
| --- | --- |
| `npm install firebase-admin` | PASS - installed `firebase-admin@14.0.0`; package requires `node >=22`; npm reported existing audit findings: 42 vulnerabilities, no audit fix run |

Focused and regression verification:

| Command | Result |
| --- | --- |
| `npx prisma validate` | PASS - `The schema at prisma\schema.prisma is valid` |
| `npx prisma generate` | PASS - generated Prisma Client v6.19.3; no tracked generated files changed |
| `npm run build` | PASS - `nest build` completed after a nullability fix in the new provider code |
| `npm run test -- firebase --runInBand` | PASS - 3 suites passed, 23 tests passed |
| `npm run test -- push --runInBand` | PASS - 3 suites passed, 23 tests passed |
| `npm run test -- app-device-tokens --runInBand` | PASS - 4 suites passed, 12 tests passed |
| `npm run test -- communication --runInBand` | PASS - 55 suites passed, 305 tests passed; existing warning-path notification generation log appeared |
| `npm run test -- parent-app --runInBand` | PASS - 50 suites passed, 206 tests passed |
| `npm run test -- student-app --runInBand` | PASS - 50 suites passed, 243 tests passed |
| `npm run test -- teacher-app --runInBand` | PASS - 47 suites passed, 273 tests passed |
| `npm run test:security -- --runInBand` | PASS - 49 suites passed, 807 tests passed |

Security fallback was not needed.

Post-generate and post-test status checks confirmed no tracked generated files were changed.

## Known Follow-Ups

Sprint 30D:

- Integrate provider into the push delivery worker.
- Create/enqueue `PUSH` delivery rows.
- Add per-device send attempts if the preferred model remains accepted.
- Load/decrypt app device tokens under scoped worker context.
- Deactivate invalid/stale tokens from normalized Firebase error codes.
- Keep job data free of raw FCM token material where possible.

Sprint 30E:

- Add `pushEnabled` to notification preferences.
- Preserve Parent/Student dual alias style and Teacher camelCase style.
- Produce app/mobile FCM integration handoff.

## Final Verdict

FIREBASE_ADMIN_PROVIDER_FOUNDATION_COMPLETE
