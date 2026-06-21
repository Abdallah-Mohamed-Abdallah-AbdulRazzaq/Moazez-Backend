# Sprint 28I - App-Facing Media Message Sending Closeout

## Summary

Sprint 28I enables Parent, Student, and Teacher app-facing message send flows to create media messages by linking existing uploaded file ids to Communication messages.

Supported app-facing send types:

- `text`
- `image`
- `video`
- `file`
- `audio`
- `voice` as an app-facing alias normalized internally to `AUDIO`

The sprint keeps the existing upload pipeline, file download route convention, route names, and global `/api/v1` prefix. No schema or migration was added.

## Files Changed

Runtime:

- `src/modules/communication/application/communication-message-attachment.use-cases.ts`
- `src/modules/communication/application/communication-message.use-cases.ts`
- `src/modules/communication/domain/communication-message-attachment-domain.ts`
- `src/modules/communication/domain/communication-message-domain.ts`
- `src/modules/communication/dto/communication-message.dto.ts`
- `src/modules/communication/infrastructure/communication-message.repository.ts`
- `src/modules/communication/presenters/communication-message.presenter.ts`
- `src/modules/files/uploads/domain/file-upload.constraints.ts`
- `src/modules/parent-app/messages/application/send-parent-conversation-message.use-case.ts`
- `src/modules/parent-app/messages/dto/parent-messages.dto.ts`
- `src/modules/student-app/messages/application/send-student-conversation-message.use-case.ts`
- `src/modules/student-app/messages/dto/student-messages.dto.ts`
- `src/modules/teacher-app/messages/application/send-teacher-conversation-message.use-case.ts`
- `src/modules/teacher-app/messages/dto/teacher-messages.dto.ts`

Tests:

- `src/modules/communication/tests/communication-message-attachment-domain.spec.ts`
- `src/modules/communication/tests/communication-message-domain.spec.ts`
- `src/modules/communication/tests/communication-message.presenter.spec.ts`
- `src/modules/communication/tests/communication-message.repository.spec.ts`
- `src/modules/communication/tests/communication-message.use-case.spec.ts`
- `src/modules/files/uploads/tests/upload-file.use-case.spec.ts`
- `src/modules/parent-app/messages/tests/parent-messages.use-case.spec.ts`
- `src/modules/student-app/messages/tests/student-messages.use-case.spec.ts`
- `src/modules/teacher-app/messages/tests/teacher-messages.use-case.spec.ts`

Docs:

- `docs/sprint-28i-app-facing-media-message-sending-closeout.md`

## Runtime Scope

The Communication core create-message path now accepts non-text message kinds when valid attachments are provided. App-facing Parent, Student, and Teacher send use-cases continue to perform app-specific actor/conversation visibility checks first, then delegate the canonical create command to the core Communication use-case.

The repository creates the message and attachment rows in the same transaction. Existing `clientMessageId` idempotency is preserved: if the sender retries with the same client message id, the existing message is returned with its safe attachments and no duplicate message or attachment rows are created.

## Message Types Enabled

`text` remains backward-compatible and still requires a body/content value.

Media types require at least one attachment:

- `image` requires `image/*`
- `video` requires `video/*`
- `audio` requires `audio/*`
- `voice` is accepted by app/core DTOs and maps to the internal `AUDIO` kind
- `file` requires a non-image, non-video, non-audio file MIME type

## DTO Contract

Parent, Student, and Teacher send DTOs now accept:

```json
{
  "type": "image",
  "body": "optional body",
  "content": "optional body alias",
  "caption": "optional shared caption",
  "clientMessageId": "client-generated-id",
  "replyToMessageId": "uuid-or-null",
  "attachments": [
    {
      "fileId": "uuid",
      "mediaKind": "image",
      "caption": "optional per-attachment caption",
      "sortOrder": 0
    }
  ]
}
```

Parent and Student retain their app-facing dual alias response style. Teacher remains camelCase in the app response.

## Response Contract

App-facing message responses include the safe Sprint 28H attachment contract:

- `attachmentId`
- `fileId`
- `displayName`
- `mimeType`
- `sizeBytes`
- `mediaKind`
- `caption`
- `sortOrder`
- `createdAt`
- `downloadPath`

Parent and Student also include snake_case aliases. Teacher includes camelCase fields and preserves existing safe `originalName` and `visibility` fields.

Hidden or deleted messages continue to suppress body/content and attachment arrays.

## Policy Enforcement

The core create-message use-case enforces:

- communication policy enabled
- participant send access
- conversation send access
- `allowAttachments` for all media/file sends
- `allowVideoMessages` for video sends
- `allowVoiceMessages` for audio and voice sends
- `maxAttachmentSizeMb` for every attached file
- same-conversation reply target validation

Existing participant muted/read-only checks remain in place.

## File / MIME Validation

Attachment validation confirms every provided `fileId`:

- exists in the current school scoped file set
- is not deleted
- belongs to the current school
- is within the communication policy size limit
- has a MIME type matching the requested message type
- matches any provided `mediaKind`

The centralized upload MIME allow-list was minimally expanded to allow existing file uploads for:

- `audio/mpeg`
- `audio/mp4`
- `audio/webm`
- `video/mp4`
- `video/webm`

Executable and unsupported MIME types remain rejected.

## Idempotency Behavior

`clientMessageId` still uses the existing sender/conversation uniqueness behavior. A retry with the same `clientMessageId`:

- returns the existing message
- includes existing safe attachments
- does not create duplicate attachments
- does not publish a duplicate `message.created` event

## Realtime Behavior

`communication.chat.message.created` continues to publish after persistence succeeds. For media messages, the payload uses the safe message presenter and includes safe attachment cards only.

The realtime payload does not expose signed URLs, bucket names, object keys, storage keys, raw file records, or internal attachment audit fields.

## Explicitly Not Included

- new upload pipeline
- signed URLs in JSON
- standalone app-facing attachment list endpoints
- authorized media download/preview changes beyond the existing `/api/v1/files/:fileId/download` route convention
- thumbnails
- transcoding
- waveforms
- duration extraction
- message notification generation
- contact discovery or conversation creation
- teacher announcements
- notification preferences
- delivery receipts
- schema or migration changes
- route renames
- global prefix changes

## Security / No-Leak Confirmation

App-facing and realtime media message payloads do not expose:

- schoolId
- organizationId
- membershipId
- roleId
- deletedAt
- uploadedById
- createdById
- hiddenById
- deletedById
- bucket
- objectKey
- storageKey
- signedUrl
- raw metadata
- provider metadata
- raw File objects
- delivery rows
- recipientUserId
- actorUserId

App actors remain derived from Parent, Student, and Teacher access services. Clients cannot provide actor, sender, recipient, school, organization, or arbitrary participant ids.

## Tests Run And Results

```text
npx prisma validate
The schema at prisma\schema.prisma is valid
```

```text
npx prisma generate
Generated Prisma Client (v6.19.3)
```

```text
npm run build
nest build
```

```text
npm run test -- communication --runInBand
Test Suites: 53 passed, 53 total
Tests: 266 passed, 266 total
```

```text
npm run test -- parent-app --runInBand
Test Suites: 49 passed, 49 total
Tests: 191 passed, 191 total
```

```text
npm run test -- student-app --runInBand
Test Suites: 49 passed, 49 total
Tests: 228 passed, 228 total
```

```text
npm run test -- teacher-app --runInBand
Test Suites: 44 passed, 44 total
Tests: 247 passed, 247 total
```

```text
npm run test -- realtime --runInBand
Test Suites: 9 passed, 9 total
Tests: 47 passed, 47 total
```

Additional focused file/upload verification:

```text
npm run test -- files --runInBand
Test Suites: 8 passed, 8 total
Tests: 27 passed, 27 total
```

Full security verification:

```text
npm run test:security -- --runInBand
Test Suites: 49 passed, 49 total
Tests: 803 passed, 803 total
```

## Known Follow-ups For 28J And 28K

- Sprint 28J should verify whether the existing file download route is enough for app media preview/download UX or whether app-specific authorized preview routes are needed.
- Sprint 28J may define thumbnail, duration, preview, or transcoding contracts only if explicitly scoped.
- Sprint 28K owns message notification generation for `message_received` and `message_mention`.
- Notification center, contact discovery, teacher announcements, and notification preferences remain in their planned later Track A sprints.

## Final Verdict

APP_FACING_MEDIA_MESSAGE_SENDING_COMPLETE
