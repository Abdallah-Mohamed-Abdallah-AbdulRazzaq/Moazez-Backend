# Sprint 29F - App Message Search Closeout

## Summary

Sprint 29F adds conversation-scoped app-facing message search for Parent, Student, and Teacher apps. The implementation keeps search inside already authorized conversations, reuses the existing app-safe message presenters, and avoids global/admin search, full-text infrastructure, attachment content search, and raw identity or tenant query inputs.

Final verdict: APP_MESSAGE_SEARCH_COMPLETE

## Files changed

Runtime files:
- `src/modules/parent-app/messages/controller/parent-messages.controller.ts`
- `src/modules/parent-app/messages/dto/parent-messages.dto.ts`
- `src/modules/parent-app/messages/application/search-parent-conversation-messages.use-case.ts`
- `src/modules/parent-app/messages/infrastructure/parent-messages-read.adapter.ts`
- `src/modules/parent-app/messages/presenters/parent-messages.presenter.ts`
- `src/modules/parent-app/parent-app.module.ts`
- `src/modules/student-app/messages/controller/student-messages.controller.ts`
- `src/modules/student-app/messages/dto/student-messages.dto.ts`
- `src/modules/student-app/messages/application/search-student-conversation-messages.use-case.ts`
- `src/modules/student-app/messages/infrastructure/student-messages-read.adapter.ts`
- `src/modules/student-app/messages/presenters/student-messages.presenter.ts`
- `src/modules/student-app/student-app.module.ts`
- `src/modules/teacher-app/messages/controller/teacher-messages.controller.ts`
- `src/modules/teacher-app/messages/dto/teacher-messages.dto.ts`
- `src/modules/teacher-app/messages/application/search-teacher-conversation-messages.use-case.ts`
- `src/modules/teacher-app/messages/infrastructure/teacher-messages-read.adapter.ts`
- `src/modules/teacher-app/messages/presenters/teacher-messages.presenter.ts`
- `src/modules/teacher-app/teacher-app.module.ts`

Test files:
- `src/modules/parent-app/messages/tests/parent-messages-read.adapter.spec.ts`
- `src/modules/parent-app/messages/tests/parent-messages.presenter.spec.ts`
- `src/modules/parent-app/messages/tests/search-parent-conversation-messages.use-case.spec.ts`
- `src/modules/student-app/messages/tests/student-messages-read.adapter.spec.ts`
- `src/modules/student-app/messages/tests/student-messages.presenter.spec.ts`
- `src/modules/student-app/messages/tests/search-student-conversation-messages.use-case.spec.ts`
- `src/modules/teacher-app/messages/tests/teacher-messages-read.adapter.spec.ts`
- `src/modules/teacher-app/messages/tests/teacher-messages.presenter.spec.ts`
- `src/modules/teacher-app/messages/tests/search-teacher-conversation-messages.use-case.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- `test/security/tenancy.teacher-app.spec.ts`

Closeout file:
- `docs/sprint-29f-app-message-search-closeout.md`

No Prisma schema, migration, package, lockfile, or generated source files were intentionally changed.

## Runtime scope

The sprint adds read-only HTTP search for app-facing messages inside a single conversation. It does not alter message creation, read receipts, notifications, realtime events, files, attachments, scheduled announcements, replay tooling, or global API prefix behavior.

## Routes added

New routes:
- `GET /api/v1/parent/messages/conversations/:conversationId/search`
- `GET /api/v1/student/messages/conversations/:conversationId/search`
- `GET /api/v1/teacher/messages/conversations/:conversationId/search`

No existing routes were renamed or removed. Existing list routes remain unchanged:
- `GET /api/v1/{app}/messages/conversations/:conversationId/messages`

## Search behavior

Query params:
- `q`: required string, trimmed, minimum 2 characters, maximum 100 characters.
- `page`: optional integer, minimum 1, maximum 10000.
- `limit`: optional integer, minimum 1, maximum 100.

Fields searched:
- Message `body` only.

Search rules:
- Case-insensitive `contains` match using Prisma query mode `insensitive`.
- Search excludes system messages.
- Search includes only `CommunicationMessageStatus.SENT`.
- Search excludes messages with `hiddenAt` or `deletedAt`.
- Search excludes deleted conversations.
- Search requires the current actor to remain an active or muted participant in the conversation.
- Search does not inspect attachment content, filenames, storage metadata, provider metadata, notifications, delivery records, or queue records.

Ordering:
- `createdAt` descending.
- `id` descending.

Pagination:
- Defaults follow the existing app message adapter default limit of 50 and page 1.
- Responses include `{ page, limit, total }`, matching existing app message list pagination.

Optional filters:
- No date, type, or sender filters were added in 29F. This keeps the first search sprint narrow and avoids raw sender or scope ids from app clients.

## Authorization behavior

Parent:
- The current parent is derived by `ParentAppAccessService.assertCurrentParent()`.
- Search first checks `findConversationForParent({ conversationId, parentUserId })`.
- Missing, same-school non-participant, and cross-school conversation ids return the existing safe not-found behavior before message search.
- The database search query also requires an active or muted participant row for the same parent user.

Student:
- The current student is derived by `StudentAppAccessService.getCurrentStudentWithEnrollment()`.
- Search first checks `findConversationForStudent({ conversationId, studentUserId })`.
- Missing, same-school other-student, and cross-school conversation ids return the existing safe not-found behavior before message search.
- The database search query also requires an active or muted participant row for the same student user.

Teacher:
- The current teacher is derived by `TeacherAppAccessService.assertCurrentTeacher()`.
- Search first checks `findConversationForTeacher({ conversationId, teacherUserId })`.
- Missing, same-school non-participant, and cross-school conversation ids return the existing safe not-found behavior before message search.
- The database search query also requires an active or muted participant row for the same teacher user.

## Result payload shape

Parent response:
```json
{
  "conversationId": "uuid",
  "conversation_id": "uuid",
  "messages": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0
  },
  "query": "trimmed query"
}
```

Student response:
```json
{
  "conversationId": "uuid",
  "conversation_id": "uuid",
  "messages": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0
  },
  "query": "trimmed query"
}
```

Teacher response:
```json
{
  "conversationId": "uuid",
  "messages": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0
  },
  "query": "trimmed query"
}
```

Parent and Student preserve the existing dual camelCase plus snake_case style. Teacher remains camelCase only.

## Presenter reuse decision

Search results reuse the existing app message presenters:
- `ParentMessagesPresenter.presentMessageSearch()` wraps `presentMessageList()`.
- `StudentMessagesPresenter.presentMessageSearch()` wraps `presentMessageList()`.
- `TeacherMessagesPresenter.presentMessageSearch()` wraps `presentMessageList()`.

This preserves app-safe message fields, sender display handling, read counts, attachment shaping, hidden/deleted masking, and Parent/Student alias behavior.

## Attachment handling decision

Search result payloads include attachments only because existing app message cards include attachments. Attachments are selected and presented through the app-safe attachment path hardened in Sprint 29D.

Search does not match:
- attachment display names
- original filenames
- object keys
- buckets
- storage keys
- provider metadata
- file contents
- OCR/transcoded media metadata

## Highlight/snippet decision

No highlight or snippet field was added in 29F. If the frontend needs snippets later, they should be derived only from message body text and must escape or avoid HTML.

## Security/no-leak confirmation

Search payloads must not expose:
- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `recipientUserId`
- `actorUserId`
- raw `senderUserId` outside existing app-safe sender card behavior
- participant internals
- `guardianId`
- `studentGuardianId`
- `enrollmentId`
- `teacherAllocationId`
- `hiddenById`
- `deletedById`
- `deletedAt`
- `passwordHash`
- `uploadedById`
- `bucket`
- `objectKey`
- `storageKey`
- `signedUrl`
- raw metadata
- provider metadata
- queue metadata
- delivery ids

Security tests cover visible-only search, hidden/deleted message exclusion, same-school non-participant denial, cross-school denial, and no unsafe app fields in search responses.

## Explicitly not included

- Global app-wide message search.
- Admin/core message search.
- Search across all conversations.
- Attachment content search.
- Attachment filename search.
- Storage metadata search.
- Full-text search indexing or migration.
- Date, type, or sender filters.
- Rich highlighting/snippets.
- Realtime changes.
- Notification generation/filtering/preference changes.
- Scheduled announcement publishing/replay changes.
- Schema or migration changes.
- Package or lockfile changes.

## Tests run and results

Early verification:
- `npm run build` timed out once at 120s, then passed with a 300s timeout.
- `npm run test -- parent-app --runInBand`: PASS, 50 suites, 205 tests.
- `npm run test -- student-app --runInBand`: PASS, 50 suites, 242 tests.
- `npm run test -- teacher-app --runInBand`: PASS, 47 suites, 272 tests.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.parent-app.spec.ts test/security/tenancy.student-app.spec.ts test/security/tenancy.teacher-app.spec.ts`: first run failed because the new test assertions omitted `q` on search routes or sent `q` to non-search routes; fixed the tests.
- Focused security rerun: PASS, 3 suites, 85 tests.

Final verification:
- `git status --short --untracked-files=all`: PASS; expected runtime/test/doc changes only.
- `git diff --name-only`: PASS; tracked runtime and security test changes only, with untracked new files shown by status.
- `git diff --stat`: PASS; tracked files only, 24 files changed, 789 insertions.
- `git diff --check`: PASS; no whitespace errors. Git reported CRLF conversion warnings only.
- `npx prisma validate`: PASS; schema valid.
- `npx prisma generate`: PASS; Prisma Client v6.19.3 generated to `node_modules/@prisma/client`.
- `npm run build`: PASS; `nest build`.
- `npm run test -- communication --runInBand`: PASS, 55 suites, 305 tests. One expected warning was logged by a notification-generation failure-path test.
- `npm run test -- parent-app --runInBand`: PASS, 50 suites, 205 tests.
- `npm run test -- student-app --runInBand`: PASS, 50 suites, 242 tests.
- `npm run test -- teacher-app --runInBand`: PASS, 47 suites, 272 tests.
- `npm run test -- realtime --runInBand`: PASS, 9 suites, 51 tests. One realtime disconnect debug log was emitted.
- `npm run test -- files --runInBand`: PASS, 8 suites, 27 tests.
- `npm run test:security -- --runInBand`: PASS, 49 suites, 804 tests.

## Known follow-ups after Phase B

- Global app-wide search remains deferred unless the frontend explicitly needs it after conversation-scoped search is stable.
- Full-text indexing remains deferred to a performance sprint if existing field search becomes insufficient.
- Date/type/sender filters remain deferred and should avoid raw sender ids if later added.
- Attachment filename/content search remains deferred and needs a separate no-leak decision.
- Message mentions, delivery receipts, pin/mute/clear/export actions, and group conversations remain outside this sprint.
