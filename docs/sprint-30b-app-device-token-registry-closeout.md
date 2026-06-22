# Sprint 30B - App Device Token Registry Closeout

## Summary

Baseline commit: `cdb3032 docs: lock communication phase c fcm decisions`.

Sprint 30B implements the secure app device token registry required for future Firebase Cloud Messaging push delivery. The sprint adds scoped, encrypted device token storage plus Parent, Student, and Teacher register/unregister routes.

This sprint does not integrate Firebase Admin SDK, does not send push messages, does not add a push worker, does not create push delivery rows, and does not add `pushEnabled` preferences.

Final verdict: `APP_DEVICE_TOKEN_REGISTRY_COMPLETE`.

## Files Changed

Schema and migration:

- `prisma/schema.prisma`
- `prisma/migrations/20260622120000_0041_app_device_tokens/migration.sql`
- `src/infrastructure/database/school-scope.extension.ts`

Shared runtime module:

- `src/modules/app-device-tokens/app-device-tokens.module.ts`
- `src/modules/app-device-tokens/application/app-device-token.service.ts`
- `src/modules/app-device-tokens/domain/app-device-token-crypto.ts`
- `src/modules/app-device-tokens/domain/app-device-token-domain.ts`
- `src/modules/app-device-tokens/dto/app-device-token.dto.ts`
- `src/modules/app-device-tokens/infrastructure/app-device-token.repository.ts`
- `src/modules/app-device-tokens/presenters/app-device-token.presenter.ts`

App route wiring:

- `src/modules/parent-app/notifications/application/parent-notifications.use-cases.ts`
- `src/modules/parent-app/notifications/controller/parent-notifications.controller.ts`
- `src/modules/parent-app/parent-app.module.ts`
- `src/modules/student-app/notifications/application/student-notifications.use-cases.ts`
- `src/modules/student-app/notifications/controller/student-notifications.controller.ts`
- `src/modules/student-app/student-app.module.ts`
- `src/modules/teacher-app/notifications/application/teacher-notifications.use-cases.ts`
- `src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts`
- `src/modules/teacher-app/teacher-app.module.ts`

Tests:

- `src/modules/app-device-tokens/tests/app-device-token-crypto.spec.ts`
- `src/modules/app-device-tokens/tests/app-device-token.dto.spec.ts`
- `src/modules/app-device-tokens/tests/app-device-token.repository.spec.ts`
- `src/modules/app-device-tokens/tests/app-device-token.service.spec.ts`
- `src/modules/parent-app/notifications/tests/parent-notifications.use-case.spec.ts`
- `src/modules/student-app/notifications/tests/student-notifications.use-case.spec.ts`
- `src/modules/teacher-app/notifications/tests/teacher-notifications.use-case.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- `test/security/tenancy.teacher-app.spec.ts`

Closeout:

- `docs/sprint-30b-app-device-token-registry-closeout.md`

## Schema and Migration Summary

Added enums:

- `AppDeviceTokenPlatform`: `ANDROID`, `IOS`, `WEB`
- `AppDeviceTokenSurface`: `PARENT`, `STUDENT`, `TEACHER`

Added model:

- `AppDeviceToken` mapped to `app_device_tokens`

Model fields:

- `id`
- `schoolId`
- `userId`
- `tokenHash`
- `tokenCiphertext`
- `platform`
- `appSurface`
- `deviceId`
- `appVersion`
- `locale`
- `timezone`
- `isActive`
- `lastSeenAt`
- `revokedAt`
- `lastFailureCode`
- `lastFailureAt`
- `failureCount`
- `createdAt`
- `updatedAt`

Constraints and indexes:

- `@@unique([id, schoolId])`
- `@@unique([schoolId, userId, tokenHash, appSurface])`
- indexes on `schoolId`, `userId`, `[schoolId, userId]`, `[schoolId, userId, appSurface]`, `[schoolId, appSurface, isActive]`, `tokenHash`, and `revokedAt`

Scope registration:

- `AppDeviceToken` was added to `SCHOOL_SCOPED_MODELS`.
- It was not added to soft-delete models because the registry uses `isActive` and `revokedAt`.

`PRISMA_CONVENTIONS.md` was not changed because it describes the rule and does not maintain a per-model registry list.

## Routes Added

Parent:

- `POST /api/v1/parent/notifications/device-tokens`
- `DELETE /api/v1/parent/notifications/device-tokens/current`

Student:

- `POST /api/v1/student/notifications/device-tokens`
- `DELETE /api/v1/student/notifications/device-tokens/current`

Teacher:

- `POST /api/v1/teacher/notifications/device-tokens`
- `DELETE /api/v1/teacher/notifications/device-tokens/current`

Static `device-tokens` routes are registered before `:notificationId` routes to avoid route conflicts.

## Request and Response Contracts

Register body:

- `token`: required string
- `platform`: `android | ios | web`
- `deviceId`: optional string
- `appVersion`: optional string
- `locale`: optional string
- `timezone`: optional string

Unregister body:

- `token`: optional string
- `deviceId`: optional string
- At least one of `token` or `deviceId` is required.
- If both are supplied, both must match the same current actor/current surface token row.

Parent and Student response alias behavior:

- `deviceTokenId` and `device_token_id`
- `appSurface` and `app_surface`
- `isActive` and `is_active`
- `lastSeenAt` and `last_seen_at`
- `createdAt` and `created_at`
- `updatedAt` and `updated_at`
- `revokedAt` and `revoked_at`

Teacher response behavior:

- camelCase only
- no snake_case aliases

No response includes raw `token`, `tokenHash`, `tokenCiphertext`, `schoolId`, `userId`, `membershipId`, `roleId`, or `organizationId`.

## Token Crypto and Security Decisions

Token normalization:

- Tokens are trimmed before hashing or encryption.
- Empty tokens and tokens shorter than 10 characters are rejected.
- Maximum token length is 4096 characters.

Hashing:

- `tokenHash` uses deterministic SHA-256 over the normalized token.
- It is used for lookup and deduplication only.
- It is never returned by app routes.

Encryption:

- `tokenCiphertext` uses an app-device-token-specific AES-256-GCM helper adapted from the existing email secret crypto pattern.
- The helper uses `SETTINGS_SECRET_ENCRYPTION_KEY`.
- `production` and `staging` require `SETTINGS_SECRET_ENCRYPTION_KEY`.
- local and test runtimes may derive the same deterministic local-only fallback key as the existing secret crypto convention.
- Ciphertext uses the `v1:iv:tag:ciphertext` base64url format.

No new environment variables were added in Sprint 30B.

Register behavior:

- `schoolId`, `userId`, and `appSurface` are derived server-side.
- Duplicate detection uses `[schoolId, userId, tokenHash, appSurface]`.
- Re-registering the same token reactivates the row, clears failure fields, updates metadata, updates ciphertext, and refreshes `lastSeenAt`.

Unregister behavior:

- Token-based unregister is preferred.
- DeviceId unregister is supported for client bookkeeping.
- Unknown token/device unregister returns a safe idempotent response.
- Rows are deactivated with `isActive=false` and `revokedAt`, not deleted.

## Explicitly Not Included

- Firebase Admin SDK package or provider
- Firebase network calls
- FCM environment variables
- Push worker or queue integration
- `PUSH` delivery row creation
- Per-device push attempt rows
- `pushEnabled` preference
- Communication notification generation changes
- Communication notification preference changes
- SMS or email notification delivery
- Google Maps keys or Google Maps integration

## Tests Added and Updated

Shared module tests cover:

- AES-256-GCM encrypt/decrypt roundtrip
- deterministic SHA-256 token hashing
- token validation failures
- safe presenter output
- DTO validation and scope override rejection
- register service behavior
- unregister service behavior
- repository upsert/reactivation behavior
- repository idempotent revocation behavior

App use-case tests cover:

- Parent register/unregister derives current parent user and uses dual alias style
- Student register/unregister derives current student user and uses dual alias style
- Teacher register/unregister derives current teacher user and uses camelCase only

Security tests cover:

- app clients cannot pass `schoolId` or `userId` to control token scope
- token rows are written to the current school/current user only
- raw token is not stored as `tokenHash` or visible in ciphertext
- raw token, hash, ciphertext, school id, and user id do not appear in responses
- unregister is safe and idempotent
- Teacher response does not include snake_case aliases

## Verification Results

Local database setup:

- `npx prisma migrate deploy` - PASS - applied `20260622120000_0041_app_device_tokens`; all migrations successfully applied.

Required verification:

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS - output shows intended schema/module/app route/test/security changes plus new migration and closeout doc; no package, lockfile, or generated tracked files |
| `git diff --name-only` | PASS - tracked runtime/test/schema changes only; untracked new files are visible in `git status` |
| `git diff --stat` | PASS - tracked diff: 17 files changed, 866 insertions before untracked new module/doc/migration files are staged |
| `git diff --check` | PASS - no whitespace errors; only Git line-ending warnings |
| `npx prisma validate` | PASS - `The schema at prisma\schema.prisma is valid` |
| `npx prisma generate` | PASS - generated Prisma Client v6.19.3; no tracked generated files changed |
| `npm run build` | PASS - `nest build` completed |
| `npm run test -- app-device-tokens --runInBand` | PASS - 4 suites passed, 12 tests passed |
| `npm run test -- parent-app --runInBand` | PASS - 50 suites passed, 206 tests passed |
| `npm run test -- student-app --runInBand` | PASS - 50 suites passed, 243 tests passed |
| `npm run test -- teacher-app --runInBand` | PASS - 47 suites passed, 273 tests passed |
| `npm run test -- communication --runInBand` | PASS - 55 suites passed, 305 tests passed; existing warning-path test logged a notification generation failure warning |
| `npm run test:security -- --runInBand` | PASS - 49 suites passed, 807 tests passed |

Security fallback was not needed.

Post-generate and post-test status checks confirmed no tracked generated files changed.

## Known Follow-Ups

Sprint 30C:

- Add `firebase-admin`.
- Add Firebase provider module.
- Add FCM env validation.
- Add disabled/dry-run mode.
- Mock Firebase Admin SDK in tests.

Sprint 30D:

- Integrate push delivery creation/enqueue.
- Add push worker.
- Add per-device send attempts.
- Deactivate invalid/stale tokens after provider errors.

Sprint 30E:

- Add `pushEnabled` preference.
- Produce final mobile/frontend FCM handoff.

## Final Verdict

APP_DEVICE_TOKEN_REGISTRY_COMPLETE
