# Sprint School Support Chat 1B Realtime Notifications Unread Closeout

## Sprint Name

SCHOOL-SUPPORT-CHAT-1B - Realtime / Notifications / Unread Polish

## Baseline Commit

Expected baseline:

```text
440848bf feat: add school support chat core
```

Observed `HEAD` at sprint start:

```text
440848bf feat: add school support chat core
```

Baseline difference:

```text
None. Observed HEAD matched the expected baseline.
```

## Files Changed

- `docs/school-support-chat-architecture-v1.md`
- `docs/school-support-chat-api-contract-v1.md`
- `docs/sprint-school-support-chat-1b-realtime-notifications-unread-closeout.md`
- `src/modules/school-support/application/school-support-side-effects.service.ts`
- `src/modules/school-support/application/school-support.use-cases.ts`
- `src/modules/school-support/domain/school-support.constants.ts`
- `src/modules/school-support/infrastructure/school-support.repository.ts`
- `src/modules/school-support/presenters/school-support.presenter.ts`
- `src/modules/school-support/school-support.module.ts`
- `test/e2e/school-support-chat.e2e-spec.ts`
- `test/security/tenancy.school-support-chat.spec.ts`

## Schema Changes

None.

## Migration Changes

None.

## Seed Changes

None.

## Runtime Source Changes

- Added `SchoolSupportSideEffectsService`.
- Support message creation now returns `wasCreated` internally so idempotent replays do not duplicate realtime or notification side effects.
- Support message-created events publish best-effort to the support conversation room after the REST mutation commits.
- Support read events publish best-effort to the support conversation room after read persistence commits.
- Support in-app notification records are created for active support conversation participants only.
- Support notification records use `sourceType = school_support_message`, `type = MESSAGE_RECEIVED`, and `actorUserId = null`.
- `SchoolSupportModule` imports `CommunicationModule` for the exported in-app notification command service and `RealtimeModule` for the publisher.

## Routes Changed

None. The 1A REST/IAM contract is preserved.

## Realtime Behavior

- `communication.chat.message.created` is published with a support-safe message payload.
- `communication.chat.message.read` is published with a support-safe reader-kind payload.
- `communication.notification.created` is published for created in-app notification records.
- Realtime is best-effort. Publish failures are logged and do not roll back REST mutations.
- Platform-safe socket room join is not implemented in 1B; Platform Admin inbox freshness remains REST polling/refresh.

## Notification Behavior

- Platform replies create in-app notifications for active non-platform support participants in the same support conversation.
- School messages create in-app notifications for active platform support participants already present in the same support conversation.
- Sender is excluded.
- Unrelated schools and non-participants are excluded.
- If a platform actor has not opened/read/replied yet, no platform notification row is created for that actor; REST inbox unread still counts school-authored messages for that actor.
- Support notification records are in-app only.

## Unread Behavior

- School unread count increases when platform support replies and resets after school read.
- Platform unread count increases when school sends and resets after that platform actor reads.
- Platform unread remains per platform actor.
- A second platform admin who has not read the conversation keeps their own unread count when the first platform admin marks read.

## Push Status

Not implemented. 1B creates only `IN_APP` notification deliveries and does not enqueue support push delivery.

## No-Leak Posture

- School support realtime and REST payloads do not expose raw school/org scope ids, membership ids, role ids, participant ids, raw platform user ids, platform email, raw metadata, socket rooms, storage internals, token material, or session internals.
- Platform support REST payloads remain limited to safe operational school/organization summaries.
- Support notification records set `actorUserId = null` to avoid raw platform id exposure through generic notification presenters.

## Tests Added / Updated

Updated:

- `test/e2e/school-support-chat.e2e-spec.ts`
- `test/security/tenancy.school-support-chat.spec.ts`

Added focused coverage for:

- Message-created realtime event payloads.
- Read realtime event payloads.
- Notification-created realtime event payloads.
- Best-effort realtime failure behavior.
- In-app notification recipients and sender exclusion.
- No platform push attempts.
- Per-platform-user unread isolation.
- Notification cleanup in focused suites.

## Commands Run

Initial commands:

```powershell
git status --short --untracked-files=all
git log --oneline -15
npx prisma validate
```

Initial results:

- `git status --short --untracked-files=all`: no output; working tree was clean.
- `git log --oneline -15`: top commit was `440848bf feat: add school support chat core`.
- `npx prisma validate`: passed.

Verification results:

- `npx tsc -p tsconfig.build.json --noEmit`: passed.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npm run seed`: passed; seeded 227 permissions.
- `npm run build`: passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/school-support-chat.e2e-spec.ts`: passed, 4 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.school-support-chat.spec.ts`: passed, 5 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard.spec.ts`: passed, 6 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.platform-admin.spec.ts`: passed, 12 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.communication.spec.ts --verbose`: failed with the documented pre-existing broad pattern, 8 failed and 60 passed.

## Known Pre-Existing Communication Regression Status

The broad `test/security/tenancy.communication.spec.ts` regression was documented in 1A as pre-existing at baseline `210cc9bf` with `8 failed, 60 passed`.

1B reran the suite with `--verbose`; it still reports `8 failed, 60 passed` with the same failure categories:

- teacher/parent/student default dashboard communication access expectations
- teacher seeded communication edit/manage expectations
- announcement notification job id delimiter expectation

No failure references `school-support` routes.

## Known Issues

- Required root guidance file `DIRECTORY_STRUCTURE.md` is still absent in this checkout.
- The requested `src/modules/app-device-token/**` path does not exist; the actual module is `src/modules/app-device-tokens/**`.
- Platform-safe support socket room join remains deferred.
- Support push delivery remains deferred.
- One support conversation per school remains application-enforced only.

## Final Verdict

READY FOR REVIEW.
