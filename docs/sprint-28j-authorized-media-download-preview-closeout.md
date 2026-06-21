# Sprint 28J — Authorized Media Download / Preview Integration Closeout

## Summary

Sprint 28J adds app-facing authorized download and preview routes for Communication message attachments across Parent, Student, and Teacher message surfaces.

The implementation keeps the existing global file download route compatible, keeps signed URLs out of app JSON payloads, and adds app-specific nested attachment paths to safe message attachment payloads.

## Files Changed

Runtime:
- `src/modules/communication/application/communication-message-attachment-download.use-case.ts`
- `src/modules/communication/infrastructure/communication-message-attachment.repository.ts`
- `src/modules/communication/presenters/communication-app-message-attachment.presenter.ts`
- `src/modules/communication/communication.module.ts`
- `src/modules/parent-app/messages/application/get-parent-message-attachment-download-url.use-case.ts`
- `src/modules/parent-app/messages/controller/parent-messages.controller.ts`
- `src/modules/parent-app/messages/dto/parent-messages.dto.ts`
- `src/modules/parent-app/messages/presenters/parent-messages.presenter.ts`
- `src/modules/parent-app/parent-app.module.ts`
- `src/modules/student-app/messages/application/get-student-message-attachment-download-url.use-case.ts`
- `src/modules/student-app/messages/controller/student-messages.controller.ts`
- `src/modules/student-app/messages/dto/student-messages.dto.ts`
- `src/modules/student-app/messages/presenters/student-messages.presenter.ts`
- `src/modules/student-app/student-app.module.ts`
- `src/modules/teacher-app/messages/application/get-teacher-message-attachment-download-url.use-case.ts`
- `src/modules/teacher-app/messages/controller/teacher-messages.controller.ts`
- `src/modules/teacher-app/messages/dto/teacher-messages.dto.ts`
- `src/modules/teacher-app/messages/presenters/teacher-messages.presenter.ts`
- `src/modules/teacher-app/teacher-app.module.ts`

Tests:
- `src/modules/communication/tests/communication-app-message-attachment.presenter.spec.ts`
- `src/modules/communication/tests/communication-message-attachment.use-case.spec.ts`
- `src/modules/parent-app/messages/tests/parent-messages.presenter.spec.ts`
- `src/modules/parent-app/messages/tests/parent-messages.use-case.spec.ts`
- `src/modules/student-app/messages/tests/student-messages.presenter.spec.ts`
- `src/modules/student-app/messages/tests/student-messages.use-case.spec.ts`
- `src/modules/teacher-app/messages/tests/teacher-messages.presenter.spec.ts`
- `src/modules/teacher-app/messages/tests/teacher-messages.use-case.spec.ts`

Docs:
- `docs/sprint-28j-authorized-media-download-preview-closeout.md`

## Runtime Scope

This sprint adds only authorized app-facing attachment download and preview access for existing Communication message attachments.

It does not add media sending, upload behavior, notification generation, contact discovery, teacher announcements, notification preferences, thumbnails, transcoding, waveform extraction, or schema changes.

## Routes Added

Parent:
- `GET /api/v1/parent/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download`
- `GET /api/v1/parent/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview`

Student:
- `GET /api/v1/student/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download`
- `GET /api/v1/student/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview`

Teacher:
- `GET /api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download`
- `GET /api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview`

All routes return a temporary redirect using the existing storage signed-download mechanism after authorization succeeds.

## Download Behavior

Download requests:
- derive the actor from the app access service;
- verify app-specific conversation visibility;
- verify the message belongs to the route conversation;
- verify the attachment belongs to the route message and conversation;
- verify the underlying file belongs to the same scoped school and is not deleted;
- return a `307` redirect to the existing short-lived storage download URL.

The app response never returns signed URLs in JSON.

## Preview Behavior

Preview routes are implemented as authorized preview aliases using the same existing download semantics.

The current storage abstraction only supports download-style signed GET URLs with attachment disposition. Sprint 28J therefore does not add inline disposition, MIME-specific preview headers, thumbnails, transcoding, duration extraction, or signed preview URLs in JSON.

## Attachment Response Path Changes

The existing app-safe attachment `downloadPath` remains unchanged:
- `/api/v1/files/:fileId/download`

App-facing Parent, Student, and Teacher message attachment payloads now also include app-specific nested paths when message/conversation context is available:
- `authorizedDownloadPath`
- `previewPath`

Parent and Student also include snake_case aliases:
- `authorized_download_path`
- `preview_path`

The app prefix is surface-specific:
- Parent paths use `/api/v1/parent/...`
- Student paths use `/api/v1/student/...`
- Teacher paths use `/api/v1/teacher/...`

## Authorization Chain

The authorization chain is:
1. authenticated app actor;
2. app surface access through Parent, Student, or Teacher access services;
3. app-specific conversation visibility;
4. message belongs to that conversation;
5. attachment belongs to that message and conversation;
6. message is not hidden or deleted;
7. attachment is not deleted;
8. file is scoped to the same current school and is not deleted;
9. storage URL is created only after all checks pass.

Message, attachment, and conversation ID mismatches return the existing safe not-found behavior.

## File / Storage Delegation

The Communication shared use case delegates object access to the existing `StorageService.createDownloadUrl` flow. It selects bucket/objectKey only inside the repository/use-case boundary and returns only the redirect URL to controllers.

The existing `/api/v1/files/:fileId/download` route remains in place and unchanged.

## Explicitly Not Included

- New upload pipeline
- Signed URLs in app JSON
- Public storage metadata in payloads
- Thumbnails
- Transcoding
- Waveform generation
- Media duration extraction
- Schema or migration changes
- Package changes
- Message notification generation
- Contact discovery
- Teacher announcements
- Notification preferences
- Standalone attachment list endpoints

## Security / No-Leak Confirmation

App-facing payloads and route wrappers do not expose:
- schoolId
- organizationId
- membershipId
- roleId
- uploadedById
- createdById
- hiddenById
- deletedById
- deletedAt
- bucket
- objectKey
- storageKey
- signedUrl
- raw metadata
- provider metadata
- raw File records
- delivery rows
- recipientUserId
- actorUserId

Hidden or deleted message attachments are not downloadable or previewable through app-facing routes.

## Tests Run and Results

Focused early verification:
- `npm run test -- communication-app-message-attachment.presenter communication-message-attachment.use-case parent-messages.presenter parent-messages.use-case student-messages.presenter student-messages.use-case teacher-messages.presenter teacher-messages.use-case --runInBand`
  - Result: PASS, 8 suites, 71 tests.

Full sprint verification:
- `npx prisma validate`
  - Result: PASS.
- `npx prisma generate`
  - Result: PASS.
- `npm run build`
  - Result: PASS after clearing untracked stale `dist` build output. The first build attempt timed out, and the next failed on `ENOTEMPTY` while Nest removed `dist/src/modules/student-app/schedule`.
- `npm run test -- communication --runInBand`
  - Result: PASS, 53 suites, 269 tests.
- `npm run test -- parent-app --runInBand`
  - Result: PASS, 49 suites, 193 tests.
- `npm run test -- student-app --runInBand`
  - Result: PASS, 49 suites, 230 tests.
- `npm run test -- teacher-app --runInBand`
  - Result: PASS, 44 suites, 249 tests.
- `npm run test -- files --runInBand`
  - Result: PASS, 8 suites, 27 tests.
- `npm run test -- realtime --runInBand`
  - Result: PASS, 9 suites, 47 tests.
- `npm run test:security -- --runInBand`
  - Result: PASS, 49 suites, 803 tests, 301.636 seconds.

Historical note:
An earlier full security run timed out after 304 seconds. During investigation, the focused fallback command was used; one existing communication announcement realtime assertion failed on the first fallback run, then `test/security/tenancy.communication.spec.ts` passed in isolation with 67 tests, and the focused fallback bundle passed on rerun with 5 suites / 160 tests. The final accepted verification for Sprint 28J is the full security suite pass above.

## Known Follow-ups

Sprint 28K owns message notification generation.

Future media work may add true inline preview disposition, thumbnails, transcoding, waveforms, or media duration extraction only if explicitly scoped and tested.

## Final Verdict

AUTHORIZED_MEDIA_DOWNLOAD_PREVIEW_COMPLETE