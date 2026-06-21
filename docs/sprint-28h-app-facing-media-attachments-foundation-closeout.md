# Sprint 28H — App-Facing Media Attachments Foundation Closeout

## Summary

Sprint 28H added safe app-facing message attachment read support for Parent, Student, and Teacher message surfaces.

The sprint is intentionally narrow:

- Existing text message sending remains unchanged.
- Existing core Communication attachment link/list/delete behavior remains unchanged.
- Parent and Student message read models now select safe attachment metadata.
- Parent and Student message payloads now expose safe attachment arrays and attachment counts.
- Teacher message attachment payloads are aligned additively with the shared safe app contract.
- Hidden or deleted messages do not expose attachment arrays.
- No standalone app attachment list endpoints were added in this sprint.

## Files Changed

Runtime:

- `src/modules/communication/presenters/communication-app-message-attachment.presenter.ts`
- `src/modules/parent-app/messages/dto/parent-messages.dto.ts`
- `src/modules/parent-app/messages/infrastructure/parent-messages-read.adapter.ts`
- `src/modules/parent-app/messages/presenters/parent-messages.presenter.ts`
- `src/modules/student-app/messages/dto/student-messages.dto.ts`
- `src/modules/student-app/messages/infrastructure/student-messages-read.adapter.ts`
- `src/modules/student-app/messages/presenters/student-messages.presenter.ts`
- `src/modules/teacher-app/messages/dto/teacher-messages.dto.ts`
- `src/modules/teacher-app/messages/presenters/teacher-messages.presenter.ts`

Tests:

- `src/modules/communication/tests/communication-app-message-attachment.presenter.spec.ts`
- `src/modules/parent-app/messages/tests/parent-messages-read.adapter.spec.ts`
- `src/modules/parent-app/messages/tests/parent-messages.presenter.spec.ts`
- `src/modules/student-app/messages/tests/student-messages-read.adapter.spec.ts`
- `src/modules/student-app/messages/tests/student-messages.presenter.spec.ts`
- `src/modules/teacher-app/messages/tests/teacher-messages.presenter.spec.ts`

Docs:

- `docs/sprint-28h-app-facing-media-attachments-foundation-closeout.md`

## Runtime Scope

Sprint 28H is a read-contract foundation sprint.

Parent and Student app message read adapters now select message attachments with safe file fields only:

- file id
- original name
- MIME type
- size
- visibility
- created timestamp

The app presenters do not expose raw file records. They use a shared Communication app-safe attachment presenter that derives `mediaKind`, builds the backend download path, and applies the correct alias style.

Teacher message responses already had attachment summaries. Sprint 28H keeps the existing safe Teacher fields and additively adds `displayName`, `mediaKind`, and `attachmentsCount`.

## Explicitly Not Included

- media sending
- message create DTO changes for image/video/audio/file
- upload MIME allow-list changes
- audio or video recording
- thumbnails or media transcoding
- signed URLs in app JSON
- schema or migration changes
- message notification generation
- contact discovery or app-facing conversation creation
- teacher announcements
- notification preferences
- route renames
- global prefix changes

## Route Changes

No route changes were made.

Standalone app-facing attachment list endpoints were intentionally deferred. The current Sprint 28H contract exposes attachments through already authorized message list/detail/send response paths, which keeps attachment visibility tied to the existing app-specific conversation/message access checks.

Deferred candidate routes for a later sprint:

- `GET /api/v1/parent/messages/conversations/:conversationId/messages/:messageId/attachments`
- `GET /api/v1/student/messages/conversations/:conversationId/messages/:messageId/attachments`
- `GET /api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/attachments`

## Response Contract

Parent and Student message payloads now include dual alias fields:

```json
{
  "attachments": [
    {
      "attachmentId": "uuid",
      "attachment_id": "uuid",
      "fileId": "uuid",
      "file_id": "uuid",
      "displayName": "photo.jpg",
      "display_name": "photo.jpg",
      "mimeType": "image/jpeg",
      "mime_type": "image/jpeg",
      "sizeBytes": "123456",
      "size_bytes": "123456",
      "mediaKind": "image",
      "media_kind": "image",
      "caption": "optional",
      "sortOrder": 0,
      "sort_order": 0,
      "createdAt": "ISO",
      "created_at": "ISO",
      "downloadPath": "/api/v1/files/<fileId>/download",
      "download_path": "/api/v1/files/<fileId>/download"
    }
  ],
  "attachmentsCount": 1,
  "attachments_count": 1
}
```

Teacher message payloads now include camelCase fields:

```json
{
  "attachments": [
    {
      "attachmentId": "uuid",
      "fileId": "uuid",
      "displayName": "photo.jpg",
      "originalName": "photo.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": "123456",
      "mediaKind": "image",
      "visibility": "private",
      "caption": "optional",
      "sortOrder": 0,
      "createdAt": "ISO",
      "downloadPath": "/api/v1/files/<fileId>/download"
    }
  ],
  "attachmentsCount": 1
}
```

`mediaKind` derivation:

- `image/*` -> `image`
- `video/*` -> `video`
- `audio/*` -> `audio`
- `application/pdf` -> `file`
- `text/plain` -> `file`
- any other MIME type -> `file`

Last-message previews include attachment counts only. Full attachment arrays remain on message payloads.

## Security / No-Leak Confirmation

App-facing attachment payloads do not expose:

- uploadedById
- createdById
- schoolId
- organizationId
- membershipId
- roleId
- deletedAt
- bucket
- objectKey
- storageKey
- signedUrl
- raw metadata
- provider metadata
- internal audit fields
- raw File model objects

Attachment visibility follows message visibility:

- the actor must already be able to access the conversation/message through Parent, Student, or Teacher app access paths;
- hidden or deleted message bodies remain masked;
- hidden or deleted messages return empty attachment arrays and zero attachment counts;
- cross-school and guessed-id protections remain delegated to the existing app access/read-model paths.

## Tests Run And Results

Focused local slice after implementation:

```text
npm run test -- communication-app-message-attachment.presenter parent-messages.presenter student-messages.presenter teacher-messages.presenter parent-messages-read.adapter student-messages-read.adapter teacher-messages-read.adapter --runInBand
Test Suites: 7 passed, 7 total
Tests: 39 passed, 39 total
```

Required verification:

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
Tests: 255 passed, 255 total
```

```text
npm run test -- parent-app --runInBand
Test Suites: 49 passed, 49 total
Tests: 190 passed, 190 total
```

```text
npm run test -- student-app --runInBand
Test Suites: 49 passed, 49 total
Tests: 227 passed, 227 total
```

```text
npm run test -- teacher-app --runInBand
Test Suites: 44 passed, 44 total
Tests: 246 passed, 246 total
```

```text
npm run test -- realtime --runInBand
Test Suites: 9 passed, 9 total
Tests: 47 passed, 47 total
```

Full security suite:

```text
npm run test:security -- --runInBand
Test Suites: 49 passed, 49 total
Tests: 803 passed, 803 total
Time: 279.083 s
```

Historical note:

```text
An earlier full security run timed out after 244030 ms. During investigation, the focused fallback bundle passed on rerun with 5 suites / 158 tests, and test/security/tenancy.communication.spec.ts also passed in isolation with 67 tests. The final accepted verification for Sprint 28H is the full security suite pass above.
```

## Known Follow-ups For 28I / 28J

- Sprint 28I should implement app-facing media message sending only after the send DTO and policy contracts are explicitly scoped.
- Sprint 28J should implement authorized media download/preview integration if the existing `/api/v1/files/:fileId/download` route is insufficient for app clients.
- Thumbnail, duration, transcoding, and advanced preview metadata remain future work unless a later sprint approves schema changes.
- Standalone app-facing attachment list endpoints remain deferred until there is a clear frontend need and a tested access model.

## Final Verdict

APP_FACING_MEDIA_ATTACHMENTS_FOUNDATION_COMPLETE
