# Sprint 28E — Message Readers / WhatsApp-like Message Info Closeout

## Executive Summary

Sprint 28E adds safe Communication message readers and message-info read models for core and app-facing clients. The implementation lets clients show who read a message without adding delivery receipts, push notifications, contact discovery, media lifecycle work, or schema changes.

The read model preserves the Sprint 28B convention:

- `readCount` excludes the sender.
- Sender self-read rows are ignored.
- Readers exclude the sender.
- `participantsCount` includes active+muted participants and includes the sender when present.
- `fullyRead = readCount + 1 >= participantsCount`.

## Baseline

- Baseline commit: `cd04542`
- Baseline message: `feat: add app notification center`
- Sprint type: runtime endpoint + app-facing message info contract + tests + closeout doc
- Schema/migration: none
- Route renames/global prefix changes: none

## Runtime Files Changed

Core Communication:

- `src/modules/communication/infrastructure/communication-message.repository.ts`
- `src/modules/communication/application/communication-message.use-cases.ts`
- `src/modules/communication/controller/communication-message.controller.ts`
- `src/modules/communication/dto/communication-message.dto.ts`
- `src/modules/communication/presenters/communication-message-read.presenter.ts`
- `src/modules/communication/communication.module.ts`

App-facing messages:

- `src/modules/parent-app/messages/**`
- `src/modules/student-app/messages/**`
- `src/modules/teacher-app/messages/**`
- `src/modules/parent-app/parent-app.module.ts`
- `src/modules/student-app/student-app.module.ts`
- `src/modules/teacher-app/teacher-app.module.ts`

Security coverage:

- `test/security/tenancy.communication.spec.ts`

## Tests Added/Updated

- Core presenter tests for safe reader cards, hidden/deleted body masking, and internal-field exclusion.
- Core repository tests for active+muted participant filtering, sender exclusion, pagination, ordering, and absolute counts.
- Core use-case tests for participant access, elevated access, non-participant rejection, and message-info wrapping.
- Parent/Student/Teacher app-facing use-case tests for ownership checks before delegation and response contract shape.
- Communication tenancy/security tests for cross-school guessed IDs, same-school non-participant access, permission denial, and safe payloads.

## Core Message Readers Route

Added:

- `GET /api/v1/communication/messages/:messageId/readers`
- `GET /api/v1/communication/messages/:messageId/info`

Core routes remain additive and use the existing `communication.messages.view` controller permission. The use-cases preserve the existing Communication access model: a scoped actor must be able to view the conversation as a participant, or have the existing elevated Communication view/manage permissions.

Core reader responses are camelCase only and expose only safe reader card fields.

## App-facing Message Readers Routes

Parent:

- `GET /api/v1/parent/messages/conversations/:conversationId/messages/:messageId/readers`
- `GET /api/v1/parent/messages/conversations/:conversationId/messages/:messageId/info`

Student:

- `GET /api/v1/student/messages/conversations/:conversationId/messages/:messageId/readers`
- `GET /api/v1/student/messages/conversations/:conversationId/messages/:messageId/info`

Teacher:

- `GET /api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/readers`
- `GET /api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/info`

The app-facing routes derive the actor from the app access services. They never accept `actorUserId`, `recipientUserId`, `schoolId`, or other ownership override fields. Parent and Student responses keep camelCase + snake_case aliases. Teacher responses keep the current camelCase style.

## Message Info Contract

Message info combines a safe message preview with the same reader summary used by the readers route.

The message preview includes:

- `messageId`
- `conversationId`
- safe sender card
- `type`
- `status`
- `body`
- `content`
- `createdAt`
- `readCount`

Hidden/deleted messages continue to mask `body` and `content`. Message info does not expose raw metadata, attachments, storage internals, moderation actor ids, delivery rows, or notification data.

## Reader Card Contract

Reader cards expose only:

- `userId`
- `displayName`
- `userType`
- `isMe`
- `readAt`

Parent and Student additionally expose snake_case aliases for the same fields. Readers are ordered by `readAt` ascending, then stable read id ascending. Reader pagination supports `page` and `limit`, with a max limit of `100`.

## ReadCount / ParticipantsCount / FullyRead Convention

- `readCount` is the absolute count of non-sender readers.
- Historical sender self-read rows are ignored.
- The sender is excluded from the reader list even if a historical self-read row exists.
- `participantsCount` counts active+muted conversation participants.
- `participantsCount` includes the sender/current actor when they are active or muted participants.
- Removed, left, inactive, deleted, or otherwise non-active/non-muted participants are excluded from the app-safe read model.
- `fullyRead` is computed as `readCount + 1 >= participantsCount`.
- If `participantsCount` is unavailable or zero, `fullyRead` remains false.

## Security/Tenancy Notes

- All repository reads use the current scoped Prisma client.
- Core access checks reuse the existing participant/elevated Communication message view model.
- App-facing routes verify the app actor can see the conversation and message before delegating to core readers/info use-cases.
- Cross-school guessed message ids do not leak reader data.
- Same-school non-participants cannot read message reader/message-info data.
- Payloads do not expose `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, `hiddenById`, `deletedById`, `recipientUserId`, raw metadata, storage keys, `bucket`, `objectKey`, `storageKey`, `signedUrl`, delivery ids, notification ids, or private contact data.

## Explicitly Not Included

- Delivery receipts / double-grey checks.
- `deliveredAt` or delivery status tracking.
- FCM/mobile push provider integration.
- Device-token registration or notification preferences.
- Notification center changes; Sprint 28D owns that scope.
- Conversation list enrichment; Sprint 28C owns that scope.
- Read receipt semantic changes; Sprint 28B owns that scope.
- Audio messages, thumbnails, media transcoding, or advanced media lifecycle.
- Message search.
- Server-side pin/mute/clear/export actions.
- Contact discovery or new conversation creation.
- Schema or migration changes.
- Route renames or global prefix changes.

## Verification Commands

Required verification commands:

```bash
git status --short --untracked-files=all
git diff --name-only
git diff --stat
git diff --check
npx prisma validate
npx prisma generate
npm run build
npm run test -- communication --runInBand
npm run test -- parent-app --runInBand
npm run test -- student-app --runInBand
npm run test -- teacher-app --runInBand
npm run test -- realtime --runInBand
npm run test:security -- --runInBand
```

Focused tests added during implementation:

```bash
npm run test -- communication-message --runInBand
npm run test -- parent-messages --runInBand
npm run test -- student-messages --runInBand
npm run test -- teacher-messages --runInBand
```

## Final Verdict

Sprint 28E status:
MESSAGE_READERS_INFO_IMPLEMENTED

Runtime changes:
Implemented safe core and app-facing message readers/message-info read models.

Next:
Sprint 28F or a future Communication contract closeout sprint owns any remaining final documentation, contract audit, or cross-surface closeout work.
