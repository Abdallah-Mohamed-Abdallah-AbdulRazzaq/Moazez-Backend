# Sprint School Support Chat 1C Security Final Acceptance Closeout

## Sprint Name

SCHOOL-SUPPORT-CHAT-1C - Security and Final Acceptance

## Baseline Commit

Expected baseline:

```text
9f5e6181 feat: add school support chat realtime polish
```

Observed `HEAD` at sprint start:

```text
9f5e6181 feat: add school support chat realtime polish
```

Baseline difference:

```text
None. Observed HEAD matched the expected baseline.
```

## Files Changed

- `docs/school-support-chat-architecture-v1.md`
- `docs/school-support-chat-api-contract-v1.md`
- `docs/school-support-chat-final-acceptance-v1.md`
- `docs/sprint-school-support-chat-1c-security-final-acceptance-closeout.md`
- `src/common/i18n/errors.ar.json`
- `src/common/i18n/errors.en.json`
- `test/e2e/school-support-chat.e2e-spec.ts`
- `test/security/tenancy.school-support-chat.spec.ts`

## Schema Changes

None.

## Migration Changes

None.

## Seed Changes

None.

## Runtime Source Changes

None to School Support Chat runtime behavior.

Added support error-code translation catalog entries under `src/common/i18n/` because the requested files did not exist in this checkout. The current runtime still surfaces domain exception messages through `GlobalExceptionFilter`.

## Routes Changed

None. The accepted V1 support route surface is unchanged.

## Security Hardening Performed

- Tightened focused e2e route-surface coverage to assert the exact support route set.
- Verified no support route is registered under generic `/api/v1/communication/*`.
- Added school-side validation coverage proving client-supplied tenant override fields are rejected.
- Added platform permission negative coverage by temporarily removing `platform.support.view`, `platform.support.reply`, and `platform.support.manage` from `platform_super_admin` and restoring them.
- Added controller metadata coverage for `@PlatformScope()` on Platform Support routes and absence of `@PlatformScope()` on School Support routes.
- Added idempotent replay side-effect suppression checks.
- Added closed-conversation rejected-send side-effect suppression checks.
- Added notification-generation failure best-effort coverage.

## No-Leak Verification

Focused tests verify that school REST/realtime payloads do not expose tenant scope ids, participant ids, role ids, raw platform ids, platform email, metadata, storage internals, token material, session internals, socket room names, or reader ids.

Platform REST payloads remain limited to safe operational school and organization summaries, conversation status, last message preview, and unread counts.

Notification realtime payload checks verify no raw recipient id, actor id, metadata, password hash, token hash, or school id is exposed.

## Tenancy Verification

- School support routes derive school context from active membership.
- School B receives its own support conversation and cannot read School A support messages.
- School-side client-supplied `schoolId`, `organizationId`, `membershipId`, and `participantId` are rejected by DTO validation.
- Platform Admin cross-school support inbox access remains confined to `/api/v1/platform-admin/support/*`.

## Platform Scope Verification

- `PlatformSupportController` is annotated with `@PlatformScope()`.
- Every platform support handler has a support-specific `@RequiredPermissions(...)` value.
- Platform support use cases require membershipless `UserType.PLATFORM_USER` through `requirePlatformSupportScope()`.
- `platformBypassScope(...)` remains confined to platform-safe support repository paths and generic Communication route scope was not weakened.

## Realtime Verification

- School send emits `communication.chat.message.created` with a support-safe payload.
- Platform reply emits `communication.chat.message.created` with a support-safe payload.
- School and platform read actions emit `communication.chat.message.read`.
- Realtime publish failure does not roll back message creation.
- Rejected closed-conversation sends/replies do not emit realtime events.
- Platform-safe socket room join remains deferred.

## Notification Verification

- Platform replies create in-app notifications for active school support participants.
- School messages create in-app notifications for existing platform support participants.
- Sender is excluded.
- Unrelated school users are excluded.
- `actorUserId` remains `null` on support notification records.
- Notification creation failure does not roll back message creation.
- Rejected closed-conversation sends/replies do not create support notifications.

## Unread Verification

- School unread increases after platform reply and resets after school read.
- Platform unread increases after school message and resets only for the platform actor who marks read.
- A second platform admin retains independent unread state.
- A platform actor with no participant/read row still sees school-authored messages as unread in the REST inbox.

## Idempotency Verification

`clientMessageId` replay returns the existing message and does not duplicate realtime events, notification realtime events, or notification records.

## Closed Conversation Verification

- School send to a closed support conversation returns `409`.
- Platform reply to a closed support conversation returns `409`.
- Platform can reopen the conversation.
- School can send again after reopen.
- Rejected closed-conversation sends/replies do not emit realtime or notification side effects.

## Push Status

Not implemented. V1 creates only in-app notification delivery records and no support push attempts are created.

## Docs Created / Updated

Created:

- `docs/school-support-chat-final-acceptance-v1.md`
- `docs/sprint-school-support-chat-1c-security-final-acceptance-closeout.md`

Updated:

- `docs/school-support-chat-architecture-v1.md`
- `docs/school-support-chat-api-contract-v1.md`

## Tests Added / Updated

Updated:

- `test/e2e/school-support-chat.e2e-spec.ts`
- `test/security/tenancy.school-support-chat.spec.ts`

Added focused coverage for:

- Exact support route surface.
- Rejected client-supplied tenant override fields.
- Rejected closed-conversation side-effect suppression.
- Idempotent side-effect suppression for school send and platform reply.
- Notification creation best-effort failure.
- Platform support permission denial when required permissions are absent.
- Platform scope metadata.

## Commands Run

Initial commands:

```powershell
git status --short --untracked-files=all
git log --oneline -15
npx prisma validate
```

Initial results:

- `git status --short --untracked-files=all`: no output; working tree was clean.
- `git log --oneline -15`: top commit was `9f5e6181 feat: add school support chat realtime polish`.
- `npx prisma validate`: passed.

Verification results:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/school-support-chat.e2e-spec.ts`: passed, 4 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.school-support-chat.spec.ts`: passed, 6 tests.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npm run seed`: passed; seeded 227 permissions and 7 system roles.
- `npm run build`: first run timed out at the 124s tool timeout; rerun with a longer timeout passed.
- `npx tsc -p tsconfig.build.json --noEmit`: passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard.spec.ts`: passed, 6 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.platform-admin.spec.ts`: passed, 12 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.communication.spec.ts --verbose`: failed with the documented pre-existing broad pattern, 8 failed and 60 passed.

## Known Pre-Existing Communication Regression Status

The broad `test/security/tenancy.communication.spec.ts` suite still reports `8 failed, 60 passed`, matching the previously documented 1A/1B pattern.

Failure categories remain:

- teacher/parent/student default dashboard communication access expectations
- teacher seeded communication edit/manage expectations
- announcement notification job id delimiter expectation

No failure references School Support Chat routes.

## Known Deferred Items

- Platform-safe support socket room join.
- Support push delivery.
- Ticketing, categories, priority, assignment, SLA, internal notes, ticket numbers, and multi-ticket history.
- Attachments.
- External email/SMS support.
- Bot/AI support.
- Database-level uniqueness enforcement for one support conversation per school.

## Known Issues

- Required root guidance file `DIRECTORY_STRUCTURE.md` is absent in this checkout.
- The requested `src/common/i18n/errors.en.json` and `src/common/i18n/errors.ar.json` files did not exist before this sprint; support entries were created, but the existing runtime exception filter still uses domain exception messages directly.
- The broad Communication tenancy regression remains pre-existing and requires separate Communication-track triage.

## Final Verdict

READY FOR REVIEW.
