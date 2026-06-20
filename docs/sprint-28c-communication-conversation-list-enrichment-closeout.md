# Sprint 28C — Communication Conversation List Enrichment Closeout

## Executive Summary

Sprint 28C enriched Communication conversation list responses to reduce frontend N+1 calls while preserving Sprint 28B read receipt semantics and existing route boundaries.

App-facing Parent, Student, and Teacher conversation lists now expose `lastMessage`, `unreadCount`, `participantsCount`, `lastMessageReadCount`, and `isGroup` from already scoped/batched read models. Core `/api/v1/communication/conversations` remains a school-scoped management surface and was enriched only with additive, safe fields.

No schema, migration, route rename, global prefix change, notification center runtime, realtime `communication.notification.created`, readers endpoint, delivery receipts, FCM/push work, media lifecycle, search, pin/mute/clear/export, or contact discovery work was included.

## Baseline

- Accepted baseline: `3edfa75`
- Baseline message: `fix: harden communication read receipts`
- Sprint: Sprint 28C — Communication Conversation List Enrichment
- Sprint type: Runtime contract enrichment + tests + closeout doc

## Runtime Files Changed

- `src/modules/communication/infrastructure/communication-conversation.repository.ts`
- `src/modules/communication/presenters/communication-conversation.presenter.ts`
- `src/modules/parent-app/messages/dto/parent-messages.dto.ts`
- `src/modules/parent-app/messages/presenters/parent-messages.presenter.ts`
- `src/modules/student-app/messages/dto/student-messages.dto.ts`
- `src/modules/student-app/messages/presenters/student-messages.presenter.ts`
- `src/modules/teacher-app/messages/dto/teacher-messages.dto.ts`
- `src/modules/teacher-app/messages/presenters/teacher-messages.presenter.ts`

No Prisma schema, migration, package, lockfile, generated, Swagger/OpenAPI, or global route prefix files were changed.

## Tests Added/Updated

- Updated `src/modules/communication/tests/communication-conversation.presenter.spec.ts`.
- Updated `src/modules/communication/tests/communication-conversation.use-case.spec.ts` fixtures for the enriched core record shape.
- Updated Parent, Student, and Teacher message presenter tests for enriched conversation list contracts.
- Updated Parent, Student, and Teacher read-adapter tests to assert the conversation list query remains scoped and carries latest-message/read/participant data in the list query shape while unread counts use grouped queries.

Coverage now asserts:

- Conversation list items include `lastMessage`.
- Last-message `readCount` excludes the sender.
- `lastMessageReadCount` equals `lastMessage.readCount`.
- `unreadCount` remains actor-specific on app-facing routes.
- `participantsCount` follows active+muted participant selection.
- `isGroup` follows the Sprint 28C mapping.
- Hidden/deleted latest message bodies are not exposed.
- App-facing enriched cards do not expose unsafe tenant, membership, role, storage, attachment, or raw internal fields.
- Core list wrapper remains `items`, `summary`, `total`, `limit`, and `page`.

## Conversation List Contract

App-facing conversation list cards now expose the enrichment fields needed by frontend lists:

- `lastMessage`
- `unreadCount`
- `participantsCount`
- `lastMessageReadCount`
- `isGroup`

Parent and Student preserve existing camelCase plus snake_case aliases, including:

- `lastMessage` / `last_message`
- `unreadCount` / `unread_count`
- `participantsCount` / `participants_count`
- `lastMessageReadCount` / `last_message_read_count`
- `isGroup` / `is_group`

Teacher preserves its existing camelCase-only style.

## lastMessage Contract

`lastMessage` is sourced from the latest selected conversation message in the existing conversation list read model. The list adapters already fetch the latest message with the conversation page, avoiding per-conversation message lookups.

`lastMessage` includes safe list-preview fields only:

- ids already safe for the route
- safe sender summary
- sender direction
- type/status
- body/content/text with hidden/deleted body masking
- `readCount`
- created timestamp aliases where the route already uses aliases

`readCount` excludes the message sender. Historical sender self-read rows do not inflate the displayed count.

App-facing `lastMessage` does not expose raw metadata, storage internals, bucket/object keys, signed URLs, school ids, organization ids, membership ids, or role ids.

## unreadCount Contract

App-facing `unreadCount` remains actor-specific:

- It counts unread messages sent by other users.
- It excludes messages authored by the current actor.
- It counts `SENT` messages only.
- It respects the existing participant/current-school scoped app-facing conversation filters.
- It is computed by grouped repository/read-adapter queries for the current page of conversation ids.

Core `/communication/conversations` does not have a participant actor context, so core `unreadCount` is returned as `null` rather than implying an admin-wide unread count.

## participantsCount Convention

For conversation list/read-threshold semantics:

- `participantsCount` includes active+muted participants.
- `participantsCount` includes the sender/current actor when active or muted.
- Removed/left/inactive/blocked participants are excluded through the existing active+muted participant selection.
- `readCount` excludes sender.
- Fully read remains `readCount + 1 >= participantsCount`.

Core `participantCount` keeps its existing raw participant-row count for backward-compatible management/reporting behavior. Core additionally exposes `activeParticipantsCount` and `participantsCount` for the active+muted convention.

## lastMessageReadCount Contract

`lastMessageReadCount` mirrors `lastMessage.readCount`.

If there is no `lastMessage`, app-facing routes return `0` for `lastMessageReadCount`. Core returns `null` when there is no `lastMessage`.

The value is absolute and backend-owned; frontend clients should set the displayed count from the response rather than incrementing locally.

## isGroup Mapping

Sprint 28C uses this mapping:

- `direct`: `false`
- `support`: `true` only when active+muted participants are greater than 2
- `system`: `false` until product rules explicitly define it as broadcast/group behavior
- `group`: `true`
- `classroom`: `true`
- `grade`: `true`
- `section`: `true`
- `stage`: `true`
- `school_wide`: `true`

No enum values were changed.

## Core vs App-facing Decision

Core `/api/v1/communication/conversations` remains a school-scoped, permission-guarded management surface. It was not converted into a participant-scoped "my conversations" endpoint.

Core enrichment is additive and safe:

- existing `items`, `summary`, `total`, `limit`, and `page` wrapper remains
- existing `participantCount` remains
- new `activeParticipantsCount`
- new `participantsCount`
- new `isGroup`
- new `lastMessage`
- new `lastMessageReadCount`
- new `unreadCount: null`

Parent, Student, and Teacher app-facing routes remain the actor-scoped surfaces for frontend inbox experiences.

## Security/Tenancy Notes

- Existing app-facing adapters still use scoped Prisma and participant filters.
- App-facing conversation lists only return conversations where the actor is an active or muted participant.
- Parent and Student routes preserve current ownership/current-school behavior through their existing app-facing use-cases and read adapters.
- Teacher routes preserve teacher participant access behavior.
- Core routes retain existing permission-guarded school management behavior.
- No cross-school bypass or platform bypass was introduced.
- No app-facing enriched response exposes `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, raw metadata, storage internals, bucket, objectKey, storageKey, signedUrl, or private contact data.

## Explicitly Not Included

- Notification center runtime or realtime `communication.notification.created`; Sprint 28D owns this.
- Message readers endpoint; Sprint 28E owns this.
- Delivery receipts / double-grey checks.
- FCM or push notification provider integration.
- Audio messages.
- Thumbnails or media transcoding.
- Media preview lifecycle.
- Server-side pin, mute, clear, or export.
- Message search.
- Contact discovery or new conversation creation.
- Advanced notification preferences or device tokens.
- Public/signed file URLs in JSON.
- Exposing bucket/objectKey/storageKey/signedUrl.
- Changing global route prefixes.
- Broad role or permission rewrites.
- Schema changes or migrations.

## Verification Commands

Completed Sprint 28C verification:

```text
git status --short --untracked-files=all
PASS: intended modified runtime/test files plus this untracked closeout doc

git diff --name-only
PASS: intended tracked runtime/test files only

git diff --stat
PASS

git diff --check
PASS with Git CRLF warnings only

npx prisma validate
PASS

npx prisma generate
PASS

npm run build
PASS

npm run test -- communication --runInBand
PASS: 49 suites, 230 tests

npm run test -- parent-app --runInBand
PASS: 48 suites, 184 tests

npm run test -- student-app --runInBand
PASS: 48 suites, 221 tests

npm run test -- teacher-app --runInBand
PASS: 43 suites, 241 tests

npm run test:security -- --runInBand
TIMED OUT after 300 seconds without a pass/fail result

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.communication.spec.ts
PASS: 1 suite, 67 tests
```

Notes:

- Initial `npm run build` attempt timed out after 120 seconds before producing a compiler result; rerun with a longer timeout passed.
- If the full security suite times out, the focused Communication tenancy suite is the fallback requested for this sprint.
- Final git verification commands should remain clean immediately before review.

## Final Verdict

Sprint 28C status:
COMMUNICATION_CONVERSATION_LIST_ENRICHMENT_COMPLETE

Runtime changes:
Implemented

Schema/migration:
None

Sprint 28B read receipt behavior:
Preserved

Next:
Sprint 28D — App-facing Notification Center + notification.created realtime

Acceptance criteria:

- App-facing conversation lists expose `lastMessage`.
- App-facing conversation lists expose `unreadCount`.
- App-facing conversation lists expose `participantsCount` with the active+muted convention.
- App-facing conversation lists expose `lastMessageReadCount`.
- App-facing conversation lists expose `isGroup`.
- `readCount` still excludes sender.
- `participantsCount` includes active+muted participants and includes sender.
- Fully read remains `readCount + 1 >= participantsCount`.
- Core `/communication/conversations` remains backward-compatible and additive.
- No app-facing unsafe fields leak.
- No N+1 implementation pattern was introduced.
- No schema or migration added.
- No out-of-scope Communication features added.
- Sprint 28D owns notification center/realtime `communication.notification.created`.
- Sprint 28E owns the readers endpoint.
- Closeout doc created.
- Build and focused tests pass.
- No commit.
