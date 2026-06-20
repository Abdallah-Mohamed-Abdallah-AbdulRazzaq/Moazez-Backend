# Sprint 28B — Communication Read Receipts & Realtime Accuracy Closeout

## Executive Summary

Sprint 28B implemented the Sprint 28A read receipt decision lock for Communication runtime behavior.

Read counts are now presented as absolute backend-owned values that exclude the message sender. Sender self-read no longer creates or updates `CommunicationMessageRead` rows and no longer inflates read counts. REST mark-read remains the source of truth, and realtime events carry absolute counts so frontend clients can set values directly instead of incrementing locally.

No schema, migration, route rename, global prefix change, delivery receipt feature, FCM/push work, notification center runtime, readers endpoint, conversation list enrichment, media lifecycle, search, pin/mute/clear/export, or contact discovery work was included.

## Baseline

- Accepted baseline: `d1f2762`
- Baseline message: `docs: lock communication gap decisions`
- Sprint: Sprint 28B — Communication Read Receipts & Realtime Accuracy
- Sprint type: Runtime hardening + tests + closeout doc

## Runtime Files Changed

- `src/modules/communication/infrastructure/communication-message.repository.ts`
- `src/modules/communication/application/communication-message.use-cases.ts`
- `src/modules/communication/application/communication-realtime-events.service.ts`
- `src/modules/communication/presenters/communication-message.presenter.ts`
- `src/modules/communication/presenters/communication-message-read.presenter.ts`
- `src/modules/parent-app/messages/dto/parent-messages.dto.ts`
- `src/modules/parent-app/messages/presenters/parent-messages.presenter.ts`
- `src/modules/student-app/messages/dto/student-messages.dto.ts`
- `src/modules/student-app/messages/presenters/student-messages.presenter.ts`
- `src/modules/teacher-app/messages/infrastructure/teacher-messages-read.adapter.ts`
- `src/modules/teacher-app/messages/presenters/teacher-messages.presenter.ts`

No Prisma schema or migration files were changed.

## Tests Added/Updated

- Added `src/modules/communication/tests/communication-message.repository.spec.ts`
- Updated Communication message use-case, presenter, and read presenter tests.
- Updated realtime gateway regression coverage for `communication.chat.conversation.join`.
- Updated Parent, Student, and Teacher app-facing message presenter/use-case fixtures and assertions.
- Added coverage for sender-excluded counts, historical sender read rows, idempotent repeated reads, affected conversation mark-read counts, `clientMessageId` in `message.created`, and safe app-facing contracts.

## ReadCount Convention

- `readCount` excludes the message sender.
- `participantsCount` includes the sender.
- Fully read is computed as `readCount + 1 >= participantsCount`.
- Historical sender/self read rows are ignored in output counts.
- Sender self-read returns a safe idempotent response and does not create or update a read row.
- Repeated non-sender reads keep absolute `readCount` stable.

## Realtime Event Contract

Per-message read events still use:

```text
communication.chat.message.read
```

The per-message payload now includes absolute `readCount`:

```json
{
  "conversationId": "uuid",
  "messageId": "uuid",
  "readerId": "uuid",
  "readAt": "ISO",
  "readCount": 2,
  "eventAt": "ISO"
}
```

`message.created` continues to use `presentCommunicationMessage` and still includes `clientMessageId` when provided.

`conversation.join` remains subscribe-only. It validates access and joins the socket room; it does not create read rows, update participant read pointers, or emit read events.

## Conversation Mark-Read Contract

`POST /api/v1/communication/conversations/:conversationId/read` remains the source of truth for conversation read state.

The response and realtime payload now include affected messages:

```json
{
  "conversationId": "uuid",
  "readerId": "uuid",
  "readAt": "ISO",
  "markedCount": 3,
  "messages": [
    { "messageId": "uuid-1", "readCount": 2 },
    { "messageId": "uuid-2", "readCount": 1 }
  ],
  "eventAt": "ISO"
}
```

Rules now enforced:

- Affected `messages` includes only newly read non-self messages.
- `markedCount` matches the number of affected non-self messages.
- Each affected `readCount` is absolute and excludes the sender.
- Actor-authored messages are not given self-read rows and are not included in affected payloads.
- Participant read pointers remain compatible with existing conversation mark-read behavior.

## App-facing Message Contract

Parent and Student app message DTOs now add `readCount` and `read_count` while preserving existing `isRead` and `is_read`.

Teacher app messages continue to expose `readCount`; the count now excludes the sender.

For app-facing messages:

- Own sent message `isRead` means at least one other participant has read it.
- Received message `isRead` continues to mean the current actor has read it.
- Sender self-read rows do not make own messages appear read.
- Unsafe fields such as `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, raw metadata, storage keys, bucket, objectKey, storageKey, and signedUrl remain unexposed.

## Security/Tenancy Notes

- Existing school scoping and participant checks remain in the core use-cases/repositories.
- Missing scoped message ids still return not found through the existing Communication convention.
- Non-participants cannot mark messages read.
- App-facing routes still validate actor-specific conversation visibility before delegating to core mark-read behavior.
- Focused Communication tenancy/security coverage passed.

## Explicitly Not Included

- Conversation list enrichment; Sprint 28C owns this.
- Notification center runtime and realtime `communication.notification.created`; Sprint 28D owns this.
- Message readers endpoint; Sprint 28E owns this.
- Delivery receipts / double-grey checks.
- FCM or push notification provider integration.
- Audio messages, thumbnails, media transcoding, or media preview lifecycle.
- Server-side pin, mute, clear, or export.
- Message search.
- Contact discovery or new conversation creation.
- Schema changes or migrations.
- Route renames or global route prefix changes.

## Verification Commands

Completed:

```text
npx prisma validate
PASS

npx prisma generate
PASS

npm run build
PASS on rerun with a longer timeout

npm run test -- communication --runInBand
PASS: 49 suites, 228 tests

npm run test -- realtime --runInBand
PASS: 8 suites, 45 tests

npm run test -- parent-app --runInBand
PASS: 48 suites, 182 tests

npm run test -- student-app --runInBand
PASS: 48 suites, 219 tests

npm run test -- teacher-app --runInBand
PASS: 43 suites, 239 tests

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.communication.spec.ts
PASS: 1 suite, 67 tests
```

Notes:

- Initial `npm run build` attempt timed out after 120 seconds without a failure; rerun with a longer timeout passed.
- `npm run test:security -- --runInBand` timed out after 300 seconds without producing a pass/fail result. The closest focused Communication security suite passed.
- Final git verification commands were run after implementation and should be rerun immediately before review if more edits are made.

## Final Verdict

Sprint 28B status:
COMMUNICATION_READ_RECEIPTS_REALTIME_ACCURACY_HARDENED

Runtime changes:
Implemented

Schema/migration:
None

Next:
Sprint 28C — Communication Conversation List Enrichment

Acceptance criteria:

- `readCount` excludes sender everywhere touched.
- Sender self-read does not inflate `readCount`.
- Per-message read event includes absolute `readCount`.
- Conversation mark-read event includes affected message counts.
- Read summary excludes sender.
- Message responses expose accurate `readCount` where required.
- App-facing message contracts are updated additively.
- `message.created` still includes `clientMessageId`.
- `conversation.join` regression proves subscribe-only behavior.
- No schema or migration added.
- No out-of-scope Communication features added.
- Closeout doc created.
- Build passes.
- Focused relevant tests pass.
- No commit.
