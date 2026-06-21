# Sprint 29D - App-Safe Attachment Presenter Hardening Closeout

## Summary

Sprint 29D audited and hardened app-facing Communication message attachment payloads for Parent, Student, Teacher, and realtime conversation events.

The app HTTP message presenters were already using the shared app-safe attachment presenter and safe file selects. The runtime hardening needed in this sprint was the realtime `communication.chat.attachment.linked` payload, which still used the core attachment presenter and could expose `uploadedById`. That event now uses the app-safe attachment presenter.

Final verdict: `APP_SAFE_ATTACHMENT_PRESENTER_HARDENING_COMPLETE`

## Files changed

Runtime files changed:

- `src/modules/communication/application/communication-realtime-events.service.ts`

Test files changed:

- `src/modules/communication/tests/communication-app-message-attachment.presenter.spec.ts`
- `src/modules/communication/tests/communication-message-attachment.use-case.spec.ts`
- `src/modules/communication/tests/communication-realtime-events.service.spec.ts`
- `src/modules/parent-app/messages/tests/parent-messages.presenter.spec.ts`
- `src/modules/student-app/messages/tests/student-messages.presenter.spec.ts`
- `src/modules/teacher-app/messages/tests/teacher-messages.presenter.spec.ts`

Closeout file changed:

- `docs/sprint-29d-app-safe-attachment-presenter-hardening-closeout.md`

## Runtime scope

Runtime work was limited to the realtime attachment-linked event presenter path. No HTTP routes, controllers, DTO routes, authorization services, repositories, file download behavior, upload behavior, notification behavior, notification filtering, notification preferences, message read receipts, schema, migrations, packages, lockfiles, or generated source files were changed.

## Routes and payloads audited

Audited app message payloads:

- `GET /api/v1/parent/messages/conversations/:conversationId/messages`
- `POST /api/v1/parent/messages/conversations/:conversationId/messages`
- `GET /api/v1/student/messages/conversations/:conversationId/messages`
- `POST /api/v1/student/messages/conversations/:conversationId/messages`
- `GET /api/v1/teacher/messages/conversations/:conversationId/messages`
- `POST /api/v1/teacher/messages/conversations/:conversationId/messages`

Audited authorized media routes:

- `GET /api/v1/parent/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download`
- `GET /api/v1/parent/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview`
- `GET /api/v1/student/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download`
- `GET /api/v1/student/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview`
- `GET /api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download`
- `GET /api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview`
- `GET /api/v1/files/:id/download`

Audited realtime payloads:

- `communication.chat.message.created`
- `communication.chat.attachment.linked`
- `communication.chat.attachment.deleted`

Audited file metadata presenters:

- file upload metadata presenter
- generic file attachment presenter
- parent child file download use case

## App-safe attachment fields preserved

App-safe message attachment payloads preserve:

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
- `authorizedDownloadPath` when app route context is available
- `previewPath` when app route context is available

Teacher message attachment payloads also preserve existing app-safe fields:

- `originalName`
- `visibility`

Parent and Student payloads preserve dual camelCase plus snake_case aliases. Teacher remains camelCase only.

## Forbidden fields verified absent

Tests verify app-facing attachment payloads and the realtime attachment-linked payload do not expose:

- `uploadedById`
- `createdById`
- `ownerId`
- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `bucket`
- `objectKey`
- `storageKey`
- `signedUrl`
- raw `metadata`
- `providerMetadata`
- virus scan internals
- `deletedAt`

The Phase B no-leak contract remains intact for app-facing attachment payloads. The core attachment presenter still exists for core/internal Communication attachment use cases and audit summaries, but it is no longer used for the app-facing realtime attachment-linked event.

## attachmentId and fileId decision

`attachmentId` and `fileId` remain in app-facing payloads. They are route-safe Track A identifiers:

- `attachmentId` is required for nested authorized app download and preview routes.
- `fileId` is required for the existing authenticated shared file download path.

This sprint intentionally did not remove either field.

## Download and preview path decision

The existing authenticated path remains:

- `downloadPath: /api/v1/files/:fileId/download`

When the app message presenter has surface, conversation, and message context, it also returns:

- `authorizedDownloadPath`
- `previewPath`

Parent and Student include:

- `authorized_download_path`
- `preview_path`

The realtime `communication.chat.attachment.linked` payload does not have a known app surface, so it returns the shared authenticated `downloadPath` only. It does not invent a Parent, Student, or Teacher-specific nested path.

## Tokenized download link decision

Tokenized unauthenticated download links remain deferred. Sprint 29D continues the Track A authenticated download and preview model and does not add new token routes.

Signed storage URLs remain out of JSON responses. Existing download and preview handlers may internally create short-lived storage URLs only after authorization and return them through redirect/download behavior, not JSON payload metadata.

## Parent, Student, and Teacher response style confirmation

Parent App:

- Message attachments keep dual camelCase plus snake_case aliases.
- Attachment payloads do not expose guardian, studentGuardian, enrollment, or storage internals.

Student App:

- Message attachments keep dual camelCase plus snake_case aliases.
- Attachment payloads do not expose enrollment, student-user linkage, or storage internals.

Teacher App:

- Message attachments remain camelCase only.
- Existing safe `originalName` and `visibility` are preserved.
- Attachment payloads do not expose teacher allocation, class allocation, or storage internals.

## Realtime payload impact

Runtime impact:

- `communication.chat.attachment.linked` now uses `presentCommunicationAppMessageAttachment(..., { aliasStyle: 'camel' })`.

Before this sprint, the event used the core attachment presenter and could include `uploadedById`.

After this sprint, the event payload shape is:

```json
{
  "conversationId": "conversation-id",
  "messageId": "message-id",
  "attachment": {
    "attachmentId": "attachment-id",
    "fileId": "file-id",
    "displayName": "worksheet.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": "2048",
    "mediaKind": "file",
    "caption": "Worksheet",
    "sortOrder": 1,
    "createdAt": "2026-05-03T08:00:00.000Z",
    "downloadPath": "/api/v1/files/file-id/download"
  },
  "eventAt": "ISO"
}
```

No realtime event names changed. No 29C typing or presence behavior changed.

`communication.chat.attachment.deleted` already emits only route-safe ids:

- `attachmentId`
- `fileId`
- `messageId`
- `conversationId`

`communication.chat.message.created` continues to use the existing safe message presenter, including safe attachment cards when present.

## Files and download behavior impact

Authorized download and preview behavior is unchanged:

- app nested download and preview routes still perform app actor, conversation, message, attachment, file, school, hidden/deleted checks;
- the shared file route remains `/api/v1/files/:id/download`;
- storage `bucket` and `objectKey` are used only inside repository/use-case/storage boundaries;
- signed storage URLs are not returned in JSON.

## Security/no-leak confirmation

Attachment filtering and authorization remain scoped through existing app access paths:

- Parent access is scoped to current parent and linked-child conversation visibility.
- Student access is scoped to current student and active student conversation visibility.
- Teacher access is scoped to current teacher and participant/allocated conversation visibility.
- Realtime attachment publication remains conversation-room scoped.

No app clients can pass arbitrary `userId`, `schoolId`, `recipientUserId`, `actorUserId`, `membershipId`, `roleId`, `organizationId`, or participant arrays through this sprint's changes.

## Explicitly not included

This sprint did not include:

- tokenized unauthenticated download links
- signed URLs in JSON
- storage/provider rewrite
- schema or migration changes
- package or lockfile changes
- generated source file changes
- notification changes
- notification filtering or preference changes
- realtime typing or presence changes
- message search
- upload pipeline changes
- new file routes
- route renames
- global API prefix changes

## Tests run and results

Focused verification:

- `npm run test -- communication-app-message-attachment.presenter communication-message-attachment.use-case communication-realtime-events.service parent-messages.presenter student-messages.presenter teacher-messages.presenter --runInBand` - PASS, 6 suites, 44 tests.

Final verification:

- `git status --short --untracked-files=all` - PASS. Only intended runtime/test files are modified and the Sprint 29D closeout doc is untracked.
- `git diff --name-only` - PASS. Shows the 7 tracked runtime/test files only; the untracked closeout doc is listed by `git status`.
- `git diff --stat` - PASS. 7 tracked files changed, 201 insertions, 4 deletions; the untracked closeout doc is not included in Git diff stat.
- `git diff --check` - PASS. No whitespace errors; Git reported line-ending conversion warnings only.
- `npx prisma validate` - PASS. Schema valid.
- `npx prisma generate` - PASS. Prisma Client v6.19.3 generated to `node_modules/@prisma/client`.
- `npm run build` - first attempt timed out after 124037 ms with no compile error output.
- `npm run build` - second attempt failed with `ENOTEMPTY: directory not empty, rmdir '...\dist'`.
- Generated `dist` path was resolved inside the workspace and removed.
- `npm run build` - PASS after clearing stale `dist`.
- `npm run test -- communication --runInBand` - PASS, 54 suites, 296 tests.
- `npm run test -- parent-app --runInBand` - PASS, 49 suites, 200 tests.
- `npm run test -- student-app --runInBand` - PASS, 49 suites, 237 tests.
- `npm run test -- teacher-app --runInBand` - PASS, 46 suites, 267 tests.
- `npm run test -- realtime --runInBand` - PASS, 9 suites, 51 tests.
- `npm run test -- files --runInBand` - PASS, 8 suites, 27 tests.
- `npm run test:security -- --runInBand` - PASS, 49 suites, 803 tests.

The full security suite completed successfully, so the focused fallback security command was not needed.

## Known follow-ups for 29E and later

- Sprint 29E: scheduled announcement publishing and replay tooling.
- Sprint 29F: app message search.
- Keep tokenized download links deferred unless a future frontend requirement explicitly needs unauthenticated short-lived links.
- Keep thumbnails, transcoding, waveforms, duration extraction, and richer media previews deferred to a separate media performance/UX sprint.

## Final verdict

`APP_SAFE_ATTACHMENT_PRESENTER_HARDENING_COMPLETE`
