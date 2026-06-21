# Sprint 28K - Message Notification Generation Closeout

## Summary

Sprint 28K adds persisted in-app Communication message notifications for newly created messages. When the existing Communication message creation flow persists a new message, the backend now creates `message_received` notification-center records for eligible non-sender conversation participants and publishes `communication.notification.created` realtime events to each recipient user room after notification rows are persisted.

The implementation preserves the existing message send contract, attachment handling, read receipt behavior, media download behavior, and app notification center routes.

## Files Changed

- `src/modules/communication/application/communication-message.use-cases.ts`
- `src/modules/communication/application/communication-notification-generation.service.ts`
- `src/modules/communication/domain/communication-notification-generation-domain.ts`
- `src/modules/communication/infrastructure/communication-notification-generation.repository.ts`
- `src/modules/communication/infrastructure/communication-notification.repository.ts`
- `src/modules/communication/presenters/communication-app-notification.presenter.ts`
- `src/modules/communication/tests/communication-app-notification-center.service.spec.ts`
- `src/modules/communication/tests/communication-app-notification.presenter.spec.ts`
- `src/modules/communication/tests/communication-message.use-case.spec.ts`
- `src/modules/communication/tests/communication-notification-generation.repository.spec.ts`
- `src/modules/communication/tests/communication-notification-generation.service.spec.ts`
- `src/modules/communication/tests/communication-notification.presenter.spec.ts`
- `src/modules/communication/tests/communication-notification.use-case.spec.ts`
- `src/modules/communication/tests/communication-realtime-events.service.spec.ts`
- `src/modules/parent-app/notifications/dto/parent-notifications.dto.ts`
- `src/modules/student-app/notifications/dto/student-notifications.dto.ts`
- `src/modules/teacher-app/notifications/dto/teacher-notifications.dto.ts`
- `test/security/tenancy.communication.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- `test/security/tenancy.teacher-app.spec.ts`

No Prisma schema, migration, package, route prefix, or generated contract changes were made.

## Runtime Scope

- Added message notification generation to the existing message create use case.
- Added repository read model and retry-safe creation for message notifications.
- Reused existing Communication notification records, in-app delivery rows, app notification center routes, and realtime publisher.
- Extended app notification deep links to safely support conversation-message targets.
- Kept notification generation non-fatal after message persistence: message creation remains source of truth if notification generation fails.

## Notification Types Implemented

- Implemented: `message_received`
- Deferred: `message_mention`

`message_mention` remains deferred because there is no existing mention extraction contract or mention persistence model in the current Communication message creation path. Adding ad hoc parsing would expand scope and risk false positives.

## Recipient Eligibility Rules

For `message_received`, recipients are resolved from conversation participants:

- Sender is excluded.
- Participant status must be `ACTIVE`.
- Participant role `SYSTEM` is excluded.
- Participant user must be active and not deleted.
- Participants with `mutedUntil` in the future are excluded.
- Participants with `MUTED`, `LEFT`, `REMOVED`, `BLOCKED`, or `INVITED` status are excluded.
- `READ_ONLY` participants receive notifications when otherwise active/readable because they can view the conversation.
- System messages, hidden messages, deleted messages, messages without a sender, and messages in inactive/deleted conversations do not generate normal user message notifications.

## Muted / Read-only / Inactive Participant Behavior

Muted behavior is enforced using existing participant fields:

- `CommunicationConversationParticipant.status = MUTED` suppresses notification generation.
- Future `mutedUntil` suppresses notification generation.
- Past or null `mutedUntil` does not suppress an otherwise active participant.

Read-only participants are eligible if active because they can read the conversation. Inactive, removed, left, blocked, invited, system, deleted-user, and non-active-user participants are not eligible.

## Dedupe / Idempotency Behavior

Message creation already returns a `wasCreated` flag from the repository. Notification generation only runs when `wasCreated` is true.

Notification creation is retry-safe without a schema migration:

- Message notification generation takes a transaction-level advisory lock by `schoolId + messageId`.
- Existing notification rows are checked by:
  - `recipientUserId`
  - `sourceModule = COMMUNICATION`
  - `sourceType = communication_message`
  - `sourceId = messageId`
  - `type = MESSAGE_RECEIVED`
- Only missing recipient notifications are inserted.
- Missing in-app delivery rows are inserted for existing and newly created notifications.
- Realtime `notification.created` is published only for newly inserted notification rows.

Idempotent message retries with the same `clientMessageId` do not create duplicate notifications and do not publish duplicate notification realtime events.

## Realtime Behavior

For each persisted new message notification, the backend publishes:

- Event: `communication.notification.created`
- Target: recipient user room only
- Payload: safe app notification presenter payload

The event is not sent to:

- sender user room
- school room
- conversation room

The existing `message.created` event remains unchanged.

## Deep Link Contract

Generated message notifications use:

```json
{
  "type": "conversation_message",
  "conversationId": "<conversationId>",
  "messageId": "<messageId>"
}
```

The raw notification `metadata` is selected internally to build this deep link, but app-facing and realtime payloads do not expose raw metadata.

Announcement notification deep links remain:

```json
{
  "type": "announcement",
  "announcementId": "<announcementId>"
}
```

## Notification Preview / Body Rules

Message notification bodies are safe previews:

- `text`: whitespace-normalized and truncated preview.
- `image`: `Photo`
- `video`: `Video`
- `file`: `File`
- `audio` / `voice`: `Voice message`
- hidden/deleted/system: no normal `message_received` notification is generated.

No attachment internals, signed URLs, object storage keys, raw metadata, answer keys, or private contact data are included.

## App Notification Center Integration

No app notification routes changed. Existing Parent, Student, and Teacher notification centers show generated message notifications through their current actor-scoped list/detail/summary/read/archive surfaces.

The notification DTO deep-link documentation classes now allow conversation-message deep links in addition to announcement deep links:

- Parent/Student keep dual camelCase + snake_case response style through the shared presenter.
- Teacher remains camelCase through the shared presenter.
- App clients still cannot pass `recipientUserId` overrides.

## Explicitly Not Included

- Push / FCM / APNs / device tokens
- Email / SMS
- Notification preferences
- Contact discovery
- Conversation creation
- Teacher announcements
- Delivery receipts
- Read receipt changes
- Attachment download changes
- Route renames or global prefix changes
- Prisma schema changes or migrations
- Package changes

## Security / No-leak Confirmation

App notification and realtime payloads do not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `participantId`
- `recipientUserId`
- `actorUserId`
- `senderUserId`
- `uploadedById`
- `createdById`
- `hiddenById`
- `deletedById`
- `bucket`
- `objectKey`
- `storageKey`
- `signedUrl`
- raw metadata
- provider metadata
- raw File objects
- attachment internals
- delivery rows
- `passwordHash`
- `deletedAt`

Notification ownership remains recipient-scoped through existing notification center use cases and repository filters.

## Tests Run and Results

- `npm run test -- communication --runInBand` - PASS, 53 suites / 279 tests.
- `npm run test -- parent-app --runInBand` - PASS, 49 suites / 193 tests.
- `npm run test -- student-app --runInBand` - PASS, 49 suites / 230 tests.
- `npm run test -- teacher-app --runInBand` - PASS, 44 suites / 249 tests.
- `npm run test -- realtime --runInBand` - PASS, 9 suites / 48 tests.
- `npm run test -- files --runInBand` - PASS, 8 suites / 27 tests.
- `npm run build` - PASS after clearing stale generated `dist` output that caused a Windows `ENOTEMPTY` cleanup failure on the first build attempt.
- `npx prisma validate` - PASS.
- `npx prisma generate` - PASS.
- `git diff --check` - PASS with normal Windows LF-to-CRLF warnings only.
- `npm run test:security -- --runInBand`
  - Result: PASS, 49 suites / 803 tests, 288.956 seconds.

Historical note:

An earlier full security run timed out after about five minutes without result output. During investigation, the focused fallback security command passed with 4 suites / 152 tests. The final accepted verification for Sprint 28K is the full security suite pass above.

- Focused fallback security command - PASS, 4 suites / 152 tests:
  - `test/security/tenancy.communication.spec.ts`
  - `test/security/tenancy.parent-app.spec.ts`
  - `test/security/tenancy.student-app.spec.ts`
  - `test/security/tenancy.teacher-app.spec.ts`

Security cleanup blocks were updated to delete generated communication notification deliveries and notifications before deleting test users.

## Known Follow-ups

- Sprint 28L owns app-facing conversation creation/contact discovery.
- `message_mention` should be implemented only after a reviewed mention extraction contract exists.
- Notification preferences remain future work and should later decide how muted conversations and category-level settings affect generation.

## Final Verdict

MESSAGE_NOTIFICATION_GENERATION_COMPLETE