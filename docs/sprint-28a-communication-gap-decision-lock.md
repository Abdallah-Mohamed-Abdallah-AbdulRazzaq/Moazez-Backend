# Sprint 28A — Communication Gap Decision Lock

## 1. Executive Decision

Status:
COMMUNICATION_GAP_DECISION_LOCKED

Baseline:
252f9fa docs: lock learning flow deferred decisions

Sprint type:
Docs-only

Runtime changes:
None

Schema/migration:
None

Next runtime sprint:
Sprint 28B — Communication Read Receipts & Realtime Accuracy

Communication is a large feature family. It must not be implemented as one big-bang sprint. Sprint 28A locks the decisions and runtime order only; it does not change `src/`, `test/`, `prisma/`, package files, generated files, OpenAPI/Swagger artifacts, migrations, or routes.

The exact uploaded frontend gap note files were not present locally, so this lock uses the provided Frontend Communication Gap Summary as the report source of truth.

## 2. Current Backend Capability Map

Core Communication:

- Conversations exist as core school-scoped Communication routes for list, create, detail, update, archive, close, and reopen. The core list is current-school scoped and permission-guarded, but it is not actor-participant scoped.
- Participants exist for list, add, update, remove, leave, promote, and demote.
- Invites exist for list, create, accept, and reject.
- Join requests exist for list, create, approve, and reject.
- Messages exist for list, create, detail, update, delete, per-message read, conversation read, and read summary.
- Read receipts exist through `CommunicationMessageRead` rows, per-message read endpoints, conversation mark-read, participant read pointers, and read summary.
- Read summary exists as a per-conversation REST read model with `items: [{ messageId, readCount }]`.
- Reactions exist for list, upsert, and delete.
- Message attachments exist for list, link, and delete, backed by file records.
- Reports exist for message report create/list/detail/update.
- Moderation exists for moderation action list/create and message state realtime updates.
- Blocks exist for list/create/delete.
- Restrictions exist for list/create/update/revoke.
- Policies/admin overview exist for communication policy and admin summary.

Announcements:

- Core announcements exist for list, create, detail, update, publish, archive, cancel, read, read-summary, attachment list/link/delete.
- Targeting exists through normalized announcement audience rows for school, stage, grade, section, classroom, student, guardian, and user targets.
- Attachments exist through file-backed announcement attachment rows.
- Read markers exist through `CommunicationAnnouncementRead`.
- Student and Parent app-facing announcement reads exist with audience-aware filtering, read markers, and safe attachment metadata.
- Teacher announcements app-facing route appears missing after inspection; no `teacher-app/announcements` controller/module surface is present.

Notifications:

- Notification records exist for list, detail, mark read, mark all read, and archive.
- Delivery records exist for list/detail and in-app delivery rows.
- Queue-backed announcement notification generation exists after announcement publish.
- Realtime event naming and publisher support for `communication.notification.created` exist, but realtime emission after generated notification rows are persisted is missing or unclear and should be treated as a runtime gap for Sprint 28D.

Realtime:

- Socket gateway exists at `/api/v1/realtime`.
- Socket auth exists and joins authenticated sockets to school and user rooms.
- School, user, and conversation rooms include school scope.
- Conversation join/leave socket commands exist.
- `conversation.join` validates access and joins the room only; it does not mark messages read.
- Typing start/stop exist and publish conversation events.
- Presence exists with TTL-backed online/offline state and school-room publishing.
- Event names are centralized.
- Publisher supports school, user, and conversation rooms.

App-facing surfaces:

- Parent messages exist for actor-scoped existing conversations, conversation detail, message list, send, and mark-read.
- Student messages exist for actor-scoped existing conversations, conversation detail, message list, send, and mark-read.
- Teacher messages exist for actor-scoped existing conversations, conversation detail, message list, send, and mark-read.
- Parent announcements exist for list, detail, mark-read, and attachments.
- Student announcements exist for list, detail, mark-read, and attachments.
- Teacher announcements app-facing route appears missing.

## 3. Frontend Reports Classification Matrix

| Report item | Frontend claim | Backend reality | Classification | Decision | Next sprint |
| --- | --- | --- | --- | --- | --- |
| Core conversations not participant-filtered | Core `/communication/conversations` is not participant-scoped. | Confirmed. Core list is current-school scoped by Prisma/request scope and filters type/status/search, but does not require current actor to be a participant. App-facing message lists are participant-scoped. | TRUE_FOR_CORE_ENDPOINT / NEEDS_DECISION | Do not blindly change core admin endpoint. Decide whether to add an actor-scoped endpoint or keep app-facing routes responsible. | 28C decision point |
| Missing lastMessage in core conversation list | List needs last message to avoid N+1 calls. | Confirmed for core. It returns `lastMessageAt`, not a `lastMessage` object. App-facing message lists already include a last message preview. | TRUE_RUNTIME_GAP | Handle in conversation list enrichment sprint. | 28C |
| Missing unreadCount in core conversation list | List needs unread counts. | Confirmed for core. App-facing lists compute unread counts by actor, but core has no actor-scoped unread count. | TRUE_RUNTIME_GAP | Handle in conversation list enrichment sprint. | 28C |
| participantsCount sometimes wrong | Frontend needs a consistent participants count convention. | Core returns `participantCount` from participant rows; app-facing routes return active/muted participant counts as `participantsCount`. The read threshold convention is not locked. | CONVENTION_GAP / PARTIAL_RUNTIME_GAP | Define `participantsCount` as active+muted participants including sender for read threshold. | 28B/28C |
| No absolute readCount in read events | Read events need absolute count. | Confirmed. Per-message read event emits `messageId`, `readerId`, and `readAt`; conversation read event emits only `markedCount`. | TRUE_RUNTIME_GAP | Sprint 28B. | 28B |
| Conversation read event lacks affected message list | Conversation mark-read needs affected message ids/counts. | Confirmed. Repository returns only `conversationId`, `readAt`, and `markedCount`; event does not include affected messages. | TRUE_RUNTIME_GAP | Sprint 28B should emit batch or per-message affected read payload. | 28B |
| readCount includes sender or may include self-read | Sender self-read should not inflate count. | Likely confirmed. Current read creation allows the actor to mark any readable message and read counts are raw `_count.reads`; no sender-exclusion convention is enforced in the observed code. | TRUE_RUNTIME_GAP_IF_CONFIRMED | Sprint 28B must enforce `readCount` excludes sender. | 28B |
| Message responses need accurate readCount | Message responses should carry accurate read count. | Partial. Core message presenter returns `readCount` from `_count.reads`; teacher app messages expose it. Parent/student app message DTOs expose `isRead`, not absolute `readCount`. Convention needs hardening. | PARTIAL | Core has `_count.reads`/`readCount`; app-facing and convention need hardening. | 28B |
| clientMessageId missing from message.created event | Realtime message created event should include `clientMessageId`. | Already implemented in current core path. Message create stores `clientMessageId`; `message.created` uses `presentCommunicationMessage`, which includes `clientMessageId`. | ALREADY_IMPLEMENTED_IF_CONFIRMED | Document that `message.created` uses `presentCommunicationMessage` and includes `clientMessageId`; add regression test later. | 28B test |
| conversation.join marks messages as read | Joining a socket room should not mark read. | Current code only validates access and joins the conversation room. It does not call mark-read use cases or repositories. | FRONTEND_MISUNDERSTANDING_OR_STALE_REPORT_IF_CURRENT_CODE_ONLY_JOINS_ROOM | Do not change runtime for this in 28A; add regression test in 28B to prove join does not create reads. | 28B test |
| notification.created realtime event not emitted after generation | Queue-backed generated notifications should emit realtime events. | Event name and user-room publisher exist; generation creates rows/deliveries but does not emit `communication.notification.created` after persistence. | TRUE_RUNTIME_GAP_IF_CONFIRMED | Sprint 28D. | 28D |
| isGroup missing | Conversation list needs `isGroup`. | Core list does not expose `isGroup`; parent/student app lists expose `isGroup`; teacher list does not. | CONTRACT_IMPROVEMENT | Conversation list enrichment sprint. | 28C |
| message readers endpoint missing | WhatsApp-like message info needs readers endpoint. | Confirmed missing in core/app-facing routes. Read summary returns counts, not reader details. | TRUE_RUNTIME_GAP / OPTIONAL_ENHANCEMENT | Sprint 28E. | 28E |
| typing event missing userName | Typing events should include display name. | Confirmed. Typing payload has `conversationId`, `userId`, and timestamps only. | SMALL_RUNTIME_IMPROVEMENT | Later sprint unless included with realtime polish. | Later / 28F if approved |
| delivery receipts/double-grey | Frontend wants delivered receipts. | `CommunicationMessageDelivery` exists historically, but WhatsApp-like delivery receipts are not part of the current hardening contract. | FUTURE_FEATURE | Not part of 28B. | Future |
| FCM push notifications | Frontend wants mobile push. | In-app notifications and in-app deliveries exist; push provider/device-token lifecycle is not implemented. | FUTURE_FEATURE_FAMILY | Not part of first Communication hardening wave. | Future |
| audio messages/thumbnails/media preview | Frontend wants richer media. | Core message kinds and attachments exist; parent/student expose audio placeholders as null; advanced media lifecycle is not implemented. | FUTURE_FEATURE_OR_PRODUCT_DECISION | Defer. | Future |
| pin/mute/clear/export | Frontend wants conversation actions. | Some metadata/presenter fields mention pinned/muted state, but server-side product behavior is not locked as a first-wave feature. | FUTURE_PRODUCT_DECISION | Defer. | Future |
| message search | Frontend wants search. | Core conversation search exists; message body search is not a first-wave contract. | FUTURE_ENHANCEMENT | Defer. | Future |
| contact discovery/new conversation creation | Frontend wants discovery/new conversation flows. | Previously deferred in app-facing audits; current app-facing messages use existing participant conversations only. | DEFERRED_PRODUCT_DECISION | Do not implement without explicit scope. | Future gated |

## 4. Read Receipt Decision Lock

Final decisions for Sprint 28B:

- `readCount` excludes sender.
- `participantsCount` includes sender.
- Fully read is defined as `readCount + 1 >= participantsCount`.
- Sender self-read must not inflate `readCount`.
- `message.read` event must include absolute `readCount`.
- Conversation read should emit either:
  - batch event with affected messages and counts, preferred, or
  - per-message events.
- Frontend must be able to SET `readCount`, not increment blindly.
- `conversation.join` must remain subscribe-only.
- REST mark-read remains the source of truth.

`CommunicationMessageRead` and participant read pointers already exist, so schema migration may not be needed unless runtime investigation proves otherwise.

## 5. Conversation List Enrichment Decision Lock

Final decisions for Sprint 28C:

- Add `lastMessage` to the app-facing/core-selected conversation list surface.
- Add `unreadCount`.
- Add `participantsCount` with a clear convention.
- Add `lastMessageReadCount`.
- Add `isGroup`.
- Avoid N+1 queries.
- Do not expose internal `schoolId`, `organizationId`, membership ids, or role ids.
- Do not expose unsafe metadata or storage internals.
- Decide carefully whether core `/communication/conversations` remains admin-wide or gets a separate actor-scoped endpoint.

Parent/student app-facing message lists already provide several of these fields. Sprint 28C should review the final app contract and avoid duplicating work where app presenters already satisfy it.

## 6. Notification Decision Lock

Final decisions for Sprint 28D:

- Emit `communication.notification.created` after notification rows are persisted.
- Emit to user room, not school room.
- Use safe presented notification payload.
- Preserve current-school isolation.
- App-facing notification center should be a separate runtime sprint.
- Push/FCM remains future.

The notification generation path should not publish before database persistence succeeds. Queue retry/idempotency behavior must remain intact.

## 7. Message Info / Readers Decision Lock

Final decisions for Sprint 28E:

- Add message readers endpoint if approved.
- Only participants or authorized moderators/admins can view readers.
- Return safe display names and `readAt`.
- Avoid contact/private data leakage.
- No cross-school leakage.

The endpoint should be designed as message info/readers, not as delivery receipts. Delivered/double-grey behavior remains separate future work.

## 8. Explicitly Deferred / Out of Scope For First Wave

- Delivery receipts/double grey checks
- FCM/mobile push provider integration
- audio messages
- thumbnails/media transcoding
- server-side pin/mute/clear/export
- message search
- contact discovery/new conversation creation
- advanced notification preferences/device tokens
- public/signed file URLs in JSON
- exposing bucket/objectKey/storageKey/signedUrl
- changing global route prefixes
- broad role/permission rewrites

Future file download behavior must use authorized backend routes and resource ownership checks. App JSON must not expose `signedUrl`, `objectKey`, `bucket`, or storage keys.

## 9. Recommended Communication Roadmap

Sprint 28A:
Communication Gap Decision Lock
Docs-only

Sprint 28B:
Communication Read Receipts & Realtime Accuracy
Runtime

Sprint 28C:
Communication Conversation List Enrichment
Runtime

Sprint 28D:
App-facing Notification Center + notification.created realtime
Runtime

Sprint 28E:
Message Readers / WhatsApp-like Message Info
Runtime

Sprint 28F:
Communication Contract Closeout
Docs + final tests

Future:
FCM, delivery receipts, audio/media, search, pin/mute, contact discovery.

## 10. Testing Expectations For Future Runtime Sprints

Sprint 28B:

- unit tests for `readCount` excludes sender
- conversation mark-read returns affected message counts
- read event includes absolute `readCount`
- join socket command does not create read rows
- app-facing message `readCount` convention tests
- security tests for cross-school read attempts

Sprint 28C:

- conversation list returns `lastMessage`/`unreadCount`/`participantsCount`/`isGroup`
- no N+1 where testable
- actor-scoped/app-facing privacy tests
- no internal ids leak

Sprint 28D:

- `notification.created` emitted to recipient user room only
- not emitted cross-school
- generated notification payload is safe
- mark read/mark all read behavior tested

Sprint 28E:

- readers endpoint accessible only to participants/admins
- cross-school guessed id returns not found/forbidden per project convention
- safe reader payload only

## 11. Verification For Sprint 28A

Required commands:

```bash
git status --short --untracked-files=all
git diff --name-only
git diff --stat
git diff --check
git diff -- docs/sprint-28a-communication-gap-decision-lock.md
```

Because this is docs-only, do not run build/tests unless the repository policy requires it.

## 12. Final Verdict

Sprint 28A status:
COMMUNICATION_GAP_DECISION_LOCKED

Runtime changes:
None

Next:
Sprint 28B — Communication Read Receipts & Realtime Accuracy

Acceptance criteria:

- Exactly one new docs file added:
  docs/sprint-28a-communication-gap-decision-lock.md
- No runtime files changed.
- No test files changed.
- No Prisma/schema/migration changes.
- No package/OpenAPI/generated changes.
- Frontend reports are classified with corrections.
- Roadmap is locked.
- Sprint 28B scope is clear.
- No commit.
