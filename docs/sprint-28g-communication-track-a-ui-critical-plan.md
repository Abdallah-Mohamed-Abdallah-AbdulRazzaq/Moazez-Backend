# Sprint 28G — Communication Track A UI-Critical Plan

## 1. Executive Summary

Track A is the accepted Communication UI-complete critical path. Sprint 28G is documentation-only and locks the implementation-ready contract before runtime work starts.

Current baseline:

- `6afb0a6 docs: add communication final contract handoff`

Runtime implementation will start only after this plan is reviewed and committed. Sprint 28G does not change Prisma schema, migrations, controllers, DTOs, use-cases, presenters, repositories, realtime services, tests, package files, generated files, route names, or route aliases.

Track A items:

| Item | Name | Purpose |
| --- | --- | --- |
| A1 | App-facing media messages | Let app clients send and render image, video, file, and audio/voice messages through safe attachment contracts. |
| A2 | Message notification generation | Generate in-app `message_received` and `message_mention` notifications after message persistence. |
| A3 | App-facing conversation creation/contact discovery | Add safe contact discovery and conversation creation without arbitrary participant ids. |
| A4 | Teacher app announcements | Add Teacher app announcement list/detail/read/attachments parity with Parent and Student where policy allows. |
| A5 | App notification preferences | Add per-actor notification preference controls and apply them to generation/realtime/badges. |

## 2. Current Reality Snapshot

### Messages

- Parent, Student, and Teacher app-facing message controllers currently expose conversation list/detail, message list, message readers/info, send message, and mark conversation read.
- Parent and Student send DTOs currently accept only required text `body`.
- Teacher send DTO currently accepts text `body` plus optional `replyToMessageId`.
- Core `CreateCommunicationMessageDto` exposes `type`, `body`, `content`, `clientMessageId`, `replyToMessageId`, and `metadata`, but the public allowed type list is currently `['text']`.
- Core message domain logic rejects non-`TEXT` message creation through `assertMessageCreatePayload`, so image/file/audio/video kinds exist in the schema but are not publicly creatable today.
- Core `CommunicationMessageKind` already includes `TEXT`, `IMAGE`, `FILE`, `AUDIO`, `VIDEO`, and `SYSTEM`.
- Core message attachment link/list/delete routes exist under `/api/v1/communication/messages/:messageId/attachments`.
- Core message attachment link DTO currently supports `fileId`, `caption`, and `sortOrder`.
- Core message attachment policy enforcement exists for `allowAttachments`, `maxAttachmentSizeMb`, participant status, read-only participants, muted participants, hidden/deleted messages, and current-school file safety.
- Core message attachment presenter currently includes core/internal fields such as `uploadedById` and `createdById`; these must not be reused directly for app-facing Track A payloads.
- Teacher app message responses already include safe attachment summaries for listed messages: `attachmentId`, `fileId`, `originalName`, `mimeType`, `sizeBytes`, `visibility`, `caption`, `sortOrder`, `downloadPath`, and `createdAt`.
- Parent and Student app message responses do not currently include attachments.
- Parent and Student app message DTOs expose `audio_url` and `audio_duration` placeholders as `null`.
- Existing file upload allow-list is currently `application/pdf`, `image/jpeg`, `image/png`, and `text/plain`; audio/video MIME types are not currently allowed by the generic upload policy.

### Notifications

- App-facing notification centers exist for Parent, Student, and Teacher.
- Parent/Student notification responses use camelCase plus snake_case aliases.
- Teacher notification responses use camelCase.
- App notification filters currently include `status`, `priority`, `type`, `sourceModule`, `limit`, and `page`.
- Core notification DTOs include `message_received` and `message_mention` enum values.
- Announcement notification generation exists and creates in-app notification rows plus in-app delivery records.
- `communication.notification.created` is emitted after announcement notification rows are persisted.
- Message notification generation for `MESSAGE_RECEIVED` and `MESSAGE_MENTION` is not implemented in the inspected message creation path.
- No notification preferences model or app notification preferences route exists in the inspected schema/modules.

### Announcements

- Core announcement routes exist for list/create/detail/update/publish/archive/cancel/read/read-summary/attachments.
- Parent app announcement routes exist for list, detail, mark read, and attachments.
- Student app announcement routes exist for list, detail, mark read, and attachments.
- Teacher app announcement routes are absent in the current implementation.

### Realtime

- The runtime model remains REST-first for send/read.
- `communication.chat.conversation.join` validates access and joins the socket room only; it is subscribe-only.
- Existing verified realtime publishers include message created/updated/deleted, message read/conversation read, reactions, attachments, typing, presence, and notification.created.
- `communication.notification.created` publishes to the recipient user room only.
- Event constants exist for `communication.announcement.published` and `communication.notification.read`, but no verified app-facing publisher contract was found for them in the inspected Communication realtime service.
- Client command constants exist for socket message send and conversation read, but the inspected gateway currently implements join, leave, typing start, and typing stop only.

### Policies

- `CommunicationPolicy` includes `allowAttachments`, `allowVoiceMessages`, `allowVideoMessages`, `allowDeliveryReceipts`, and `allowOnlinePresence`.
- `allowAttachments` and `maxAttachmentSizeMb` are enforced by message attachment linking.
- `allowVoiceMessages` and `allowVideoMessages` are future-facing today because public message creation still rejects non-text messages.
- `allowDeliveryReceipts` is future-facing for app-facing delivery receipt UI. Delivery models exist, but delivery receipts/double-grey checks remain out of Track A.
- `allowOnlinePresence` is enforced at realtime gateway connection registration through `RealtimeCommunicationAccessService.isOnlinePresenceEnabled()`. The lower-level presence service itself does not independently re-check the policy flag.

## 3. Track A Design Principles

- Core Communication modules own business rules and persistence.
- App modules compose app-specific safe routes, access checks, and presenters.
- App actors are derived from app access services and authenticated context.
- Clients must never provide `actorUserId`, `recipientUserId`, `schoolId`, or `organizationId`.
- No route renames.
- No route aliases unless explicitly approved in a later sprint.
- App-facing responses must not expose unsafe internal fields.
- Parent/Student contracts generally use camelCase plus snake_case aliases.
- Teacher contracts generally use camelCase only.
- Core contracts generally use camelCase.
- Counts and realtime counts remain absolute backend values.
- Runtime sprints must be narrow, test-backed, and accompanied by closeout docs.
- Track A must not become a big-bang Communication rewrite.

## 4. A1 — App-Facing Media Messages Contract

### Target Message Types

Track A media messages should support:

- `text`
- `image`
- `video`
- `file`
- `audio`
- `voice` as an app-facing alias if product needs it, mapped internally to `audio`
- mixed text/caption plus attachments when policy allows it

Core persistence should continue using `CommunicationMessage.kind` and `CommunicationMessageAttachment` rather than denormalizing UI contracts into the schema.

### Proposed App-facing Send DTO

Canonical request shape:

```json
{
  "type": "image",
  "body": "Optional text body",
  "content": "Optional alias for body when supported",
  "caption": "Optional shared caption",
  "clientMessageId": "client-generated-id",
  "replyToMessageId": "uuid-or-null",
  "attachments": [
    {
      "fileId": "uuid",
      "mediaKind": "image",
      "caption": "Optional per-attachment caption",
      "sortOrder": 0,
      "thumbnailFileId": "uuid-or-null",
      "durationMs": null,
      "metadata": {
        "width": 1280,
        "height": 720
      }
    }
  ]
}
```

DTO rules:

- `type` is required for non-text messages.
- `body`/`content` are text body aliases. They may be omitted for pure media messages if at least one attachment is present.
- `caption` is safe display text and must not duplicate raw metadata.
- `attachments` must be non-empty for `image`, `video`, `file`, `audio`, or `voice`.
- `fileId` is required per attachment and must resolve to a current-school file owned/usable by the actor.
- `mediaKind` must match the message type or be safely inferred from MIME type.
- `sortOrder` is optional and defaults to zero.
- `replyToMessageId` keeps existing reply semantics and must belong to the same conversation.
- `clientMessageId` preserves existing idempotency semantics from the unique `(conversationId, senderUserId, clientMessageId)` constraint.
- `metadata` must be sanitized, allow-listed, and never returned raw.

### Body and Caption Rules

| Message type | Body/content rule | Attachment rule |
| --- | --- | --- |
| `text` | Body/content required | Attachments optional only if mixed text+attachment is explicitly enabled. |
| `image` | Body/content optional; caption allowed | At least one image attachment. |
| `video` | Body/content optional; caption allowed | At least one video attachment. |
| `file` | Body/content optional; caption allowed | At least one file attachment. |
| `audio`/`voice` | Body/content optional; caption allowed | At least one audio attachment. |

### App-facing Message Response Shape

Target Parent/Student responses should extend existing message DTOs additively:

```json
{
  "messageId": "uuid",
  "message_id": "uuid",
  "sender": {
    "userId": "uuid",
    "displayName": "Ahmed Mohamed",
    "userType": "teacher",
    "isMe": false
  },
  "senderType": "other",
  "sender_type": "other",
  "type": "image",
  "status": "sent",
  "text": "Optional body",
  "body": "Optional body",
  "content": "Optional body",
  "replyToMessageId": null,
  "reply_to_message_id": null,
  "attachments": [],
  "readCount": 0,
  "read_count": 0,
  "createdAt": "ISO",
  "created_at": "ISO"
}
```

Teacher should use camelCase only and can build on the existing safe attachment response already present in Teacher message presenters.

### Attachment Response Shape

Safe app-facing attachment shape:

```json
{
  "attachmentId": "uuid",
  "fileId": "uuid",
  "displayName": "math-homework.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": "1048576",
  "mediaKind": "file",
  "caption": "Optional caption",
  "sortOrder": 0,
  "thumbnail": {
    "fileId": "uuid",
    "downloadPath": "/api/v1/files/:fileId/download"
  },
  "durationMs": null,
  "createdAt": "ISO",
  "downloadPath": "/api/v1/files/:fileId/download"
}
```

Safe fields only:

- `attachmentId`
- `fileId` when route-safe
- `displayName`
- `mimeType`
- `sizeBytes`
- `mediaKind`
- `caption`
- `sortOrder`
- `thumbnail` if supported
- `durationMs` if supported
- `createdAt`
- `downloadPath` or an authorized download action route

Explicitly forbidden in app-facing media payloads:

- `uploadedById`
- `createdById`
- `schoolId`
- `organizationId`
- `bucket`
- `objectKey`
- `storageKey`
- `signedUrl`
- raw metadata
- `deletedAt`

### Download and Preview Rules

- Direct S3/MinIO URLs must never be returned in app JSON.
- Existing `/api/v1/files/:id/download` returns a short-lived redirect after scoped lookup.
- Track A media preview/download integration must add or reuse authorized backend routes with Communication conversation/message/participant ownership checks.
- Image/video thumbnails and audio duration must be sanitized explicit fields, not raw metadata passthrough.

### Schema Migration Expectation

- No schema migration is expected for the first media attachment foundation if V1 uses existing `File`, `CommunicationMessage`, and `CommunicationMessageAttachment` with MIME-derived `mediaKind`, `caption`, and `sortOrder`.
- Runtime work is still needed to widen public DTO/domain creation beyond text and app-present safe attachment responses.
- Migration candidates for later media work: `thumbnailFileId`, `durationMs`, first-class `mediaKind`, dimensions, waveform/preview metadata, and explicit media processing state.
- Audio/video upload MIME allow-list changes are runtime/config changes and may not require Prisma migration.

### Likely Implementation Sprints

- Sprint 28H — App-Facing Media Attachments Foundation.
- Sprint 28I — App-Facing Media Message Sending.
- Sprint 28J — Authorized Media Download / Preview Integration.

## 5. A2 — Message Notification Generation Contract

### Target Behavior

Generate in-app notifications for:

- `message_received`
- `message_mention`

Rules:

- Sender never receives `message_received` for their own message.
- Active readable participants receive message notifications.
- `MUTED` participants remain conversation participants, but active conversation mute (`mutedUntil` in the future) should suppress realtime notification creation and badge increments for that muted conversation.
- Removed, left, blocked, invited-only, or otherwise inactive participants must not receive message notifications.
- Read-only participants may receive notifications if they can read the conversation.
- Block relationships and safety restrictions must suppress message notifications where existing Communication rules say the recipient cannot access the message.
- Deduplicate by `messageId + recipientUserId + type`.
- Retries must not duplicate notifications or delivery rows.
- In-app notification rows are the first implementation target.
- Realtime `communication.notification.created` emits only to the recipient user room after persistence.
- Personal message notifications must not broadcast to the school room.

### Safe Notification Payload

Notification cards should keep the Sprint 28D safe shape:

```json
{
  "notificationId": "uuid",
  "type": "message_received",
  "sourceModule": "communication",
  "sourceType": "communication_message",
  "sourceId": "message-uuid",
  "title": "Ahmed Mohamed",
  "body": "Sanitized preview",
  "priority": "normal",
  "status": "unread",
  "readAt": null,
  "archivedAt": null,
  "createdAt": "ISO",
  "deepLink": {
    "type": "conversation_message",
    "conversationId": "uuid",
    "messageId": "uuid"
  }
}
```

Parent/Student routes add aliases according to existing app style.

### Deep Link Rules

- Message notifications use `{ type: "conversation_message", conversationId, messageId }`.
- Mention notifications use the same shape plus `mention: true` only if product explicitly approves that field.
- Announcement deep links remain `{ type: "announcement", announcementId }`.
- Deep links must not expose participant ids, school ids, recipient ids, raw metadata, or queue internals.

### Preview Rules

| Message state/type | Preview body |
| --- | --- |
| Visible text | Sanitized, whitespace-normalized, truncated preview. |
| Image | `Photo` |
| Video | `Video` |
| File | `File` |
| Audio/voice | `Voice message` |
| Hidden/deleted | No body preview or a neutral unavailable preview. |

Preview text must be generated from presenter/domain-safe data, not raw metadata.

### Implementation Sprint

- Sprint 28K — Message Notification Generation.

## 6. A3 — App-Facing Conversation Creation / Contact Discovery Contract

These routes are proposed for later implementation. They do not exist today.

### Proposed Routes

Parent:

- `GET /api/v1/parent/messages/contacts`
- `POST /api/v1/parent/messages/conversations`

Student:

- `GET /api/v1/student/messages/contacts`
- `POST /api/v1/student/messages/conversations`

Teacher:

- `GET /api/v1/teacher/messages/contacts`
- `POST /api/v1/teacher/messages/conversations`

### Allowed User Flows

- Teacher -> Parent.
- Teacher -> Student.
- Parent -> Teacher.
- Student -> Teacher.
- Support channel creation.
- Student -> Student only if policy explicitly allows it.
- Staff/staff flows only where the Communication policy allows them.

### Contact Discovery Rules

- Client must not submit arbitrary participant user ids.
- Client submits target type/id only.
- Backend resolves actual participants from current school, assignments, guardianship, enrollment, allocation, and Communication policy.
- Existing direct conversation should be reused where the same resolved participants and scope already exist.
- Parent sees only teachers linked to their children unless policy allows more.
- Student sees assigned teachers and support. Student-to-student discovery is disabled unless policy enables it.
- Teacher sees assigned students and their guardians/parents. Staff discovery follows policy.
- Support channels must be explicit and safe.
- No cross-school discovery.
- No private contact data leaks.

### Proposed Contact Card

```json
{
  "contactId": "stable-route-safe-id",
  "targetType": "teacher",
  "displayName": "Ahmed Mohamed",
  "userType": "teacher",
  "relationshipLabel": "Math teacher",
  "available": true,
  "disabledReason": null,
  "conversationId": "existing-conversation-id-or-null"
}
```

Parent/Student may add aliases such as `contact_id`, `target_type`, `relationship_label`, `disabled_reason`, and `conversation_id`.

### Proposed Create/Reused Conversation Request

```json
{
  "targetType": "teacher",
  "targetId": "route-safe-target-id",
  "context": {
    "studentId": "route-safe-student-id",
    "classroomId": "route-safe-classroom-id"
  },
  "initialMessage": {
    "body": "Optional first message",
    "clientMessageId": "client-generated-id"
  }
}
```

Rules:

- `targetId` is not a raw arbitrary user id unless that exact route contract is explicitly approved.
- Backend resolves participants.
- Backend reuses existing direct conversation when applicable.
- Backend validates current-school ownership.
- Backend applies Communication policy before creating.
- Optional `initialMessage` must reuse the Sprint 28I media/text message send contract if present.

### Proposed Response

```json
{
  "conversation": {
    "conversationId": "uuid",
    "type": "direct",
    "status": "active",
    "isGroup": false,
    "participantsCount": 2,
    "reused": true
  },
  "availability": {
    "available": true,
    "reason": null
  }
}
```

### Implementation Sprint

- Sprint 28L — Conversation Creation / Contact Discovery.

## 7. A4 — Teacher App Announcements Contract

These Teacher app routes are proposed for later implementation. They do not exist today.

Proposed routes:

- `GET /api/v1/teacher/announcements`
- `GET /api/v1/teacher/announcements/:announcementId`
- `POST /api/v1/teacher/announcements/:announcementId/read`
- `GET /api/v1/teacher/announcements/:announcementId/attachments`

### Teacher Visibility Rules

Teacher announcement routes should include:

- School-wide announcements.
- Targeted teacher user announcements.
- Custom audience rows targeting `teacherUserId`/`userId` if supported by existing core audience data.
- Classroom, section, grade, or stage announcements linked to the teacher's active allocations.
- Published announcements only.
- Non-expired announcements only, unless product explicitly asks for archive/history.

Teacher announcement routes must exclude:

- Draft, cancelled, archived, or expired announcements unless explicitly scoped.
- Announcements from another school.
- Announcements whose audience cannot be resolved to the current teacher.

### Safe Teacher Response Shape

```json
{
  "announcementId": "uuid",
  "title": "Exam schedule",
  "body": "Announcement body",
  "priority": "normal",
  "category": "school",
  "isPinned": false,
  "publishedAt": "ISO",
  "expiresAt": null,
  "readAt": null,
  "attachmentsCount": 1
}
```

Attachment response:

```json
{
  "announcementId": "uuid",
  "attachments": [
    {
      "fileId": "uuid",
      "filename": "schedule.pdf",
      "mimeType": "application/pdf",
      "size": "12345"
    }
  ]
}
```

No leaks:

- raw audience rows
- `guardianId`
- `studentGuardianId`
- `schoolId`
- `organizationId`
- `createdById`
- `publishedById`
- metadata internals
- storage internals

### Implementation Sprint

- Sprint 28M — Teacher App Announcements.

## 8. A5 — App Notification Preferences Contract

These routes are proposed for later implementation. They do not exist today.

### Target Capabilities

- Notification type preferences.
- Mute categories.
- Conversation mute.
- Global `mutedUntil`.
- `badgeEnabled`.
- Category switches for announcements, messages, attendance, grades, behavior, and reinforcement.

### Proposed Routes

Parent:

- `GET /api/v1/parent/notifications/preferences`
- `PATCH /api/v1/parent/notifications/preferences`

Student:

- `GET /api/v1/student/notifications/preferences`
- `PATCH /api/v1/student/notifications/preferences`

Teacher:

- `GET /api/v1/teacher/notifications/preferences`
- `PATCH /api/v1/teacher/notifications/preferences`

### Proposed Response Shape

```json
{
  "preferences": {
    "badgeEnabled": true,
    "mutedUntil": null,
    "categories": {
      "announcements": true,
      "messages": true,
      "attendance": true,
      "grades": true,
      "behavior": true,
      "reinforcement": true
    },
    "types": {
      "announcement_published": true,
      "message_received": true,
      "message_mention": true
    },
    "mutedConversations": [
      {
        "conversationId": "uuid",
        "mutedUntil": "ISO-or-null"
      }
    ]
  }
}
```

Parent/Student may add snake_case aliases in a later contract if frontend adapters require them.

### Preference Effects

- Notification generation must skip or mark skipped for disabled types/categories.
- Notification center list should still show already-created notifications unless product explicitly asks for preference-based hiding.
- Notification summary/badges must respect `badgeEnabled`, global mute, type/category mute, and conversation mute.
- Realtime `communication.notification.created` must not emit when notification generation is skipped by preferences.
- Existing per-conversation participant `mutedUntil` should be honored for message notifications.
- Device tokens and push provider preferences remain future work.

### Schema Migration Expectation

- A new schema model or equivalent existing model is likely required; no suitable Notification Preference model was found in the inspected Prisma schema.
- Existing `CommunicationConversationParticipant.mutedUntil` can support conversation mute but cannot represent global/category/type preferences.
- No schema or migration is implemented in Sprint 28G.

### Implementation Sprint

- Sprint 28N — App Notification Preferences.

## 9. Final Track A Sprint Order

| Sprint | Purpose | Expected files touched | Schema expectation | Minimum tests | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| 28G — Track A Contract Lock / UI-Critical Communication Plan | Lock Track A plan before runtime work | `docs/sprint-28g-communication-track-a-ui-critical-plan.md` | None | Docs-only verification | Exactly one docs file changed; plan locked. |
| 28H — App-Facing Media Attachments Foundation | Add safe app-facing attachment read models and media-safe presenters | Communication attachment use-cases/repos/presenters, Parent/Student/Teacher message presenters/read adapters, docs closeout | No migration expected if using existing `File` and `CommunicationMessageAttachment`; MIME allow-list may change | Attachment presenter tests, app message list tests, no-leak tests, attachment access tests | App-facing safe attachment shape exists without storage/internal leaks. |
| 28I — App-Facing Media Message Sending | Allow app clients to create image/file/audio/video messages with attachments | Message DTOs/use-cases/domain, app send use-cases, presenters, realtime message.created tests | No migration expected for basic fileId/caption/sortOrder; media metadata fields are migration candidates | Send media tests per app, policy tests for attachments/voice/video, idempotency tests, hidden/deleted masking tests | Non-text message create works only when policy/file/access rules pass. |
| 28J — Authorized Media Download / Preview Integration | Add Communication-owned download/preview authorization for app attachments | Files download integration, Communication attachment access service/read model, app routes if approved, tests, closeout doc | No migration expected unless thumbnail/preview records are added | Unauthorized download tests, cross-school tests, preview route tests, no signed URL JSON tests | Attachment download/preview requires conversation/message access. |
| 28K — Message Notification Generation | Create `message_received` and `message_mention` notification rows and realtime events | Communication message use-case, notification generation repository/service, app notification presenter deep links, tests, closeout doc | Likely no migration if dedup can use existing notification indexes; add unique constraint only if investigation proves necessary | Sender exclusion, muted/removed/blocked participants, retry dedup, realtime user-room tests | Message notifications persist once and emit only to recipients. |
| 28L — Conversation Creation / Contact Discovery | Add app-facing contacts and create/reuse conversations | Parent/Student/Teacher messages controllers/DTOs/use-cases/read adapters, core conversation service helpers, tests, closeout doc | No migration expected unless reusable direct-conversation keys require new constraints | Contact visibility, policy, reuse, cross-school, no arbitrary user id tests | App clients can discover allowed contacts and create/reuse conversations safely. |
| 28M — Teacher App Announcements | Add Teacher announcement list/detail/read/attachments | Teacher app announcements module, core announcement read adapter reuse, tests, closeout doc | No migration expected | Teacher allocation visibility, read marker, attachment no-leak, cross-school tests | Teacher routes reach only visible published announcements. |
| 28N — App Notification Preferences | Add app notification preference storage/routes and apply to generation/badges/realtime | New preference model/repository/use-cases/controllers/DTOs/presenters, notification generation, app notification summaries, tests, closeout doc | Migration likely required | Preference CRUD, actor ownership, generation suppression, badge behavior, realtime suppression, cross-school tests | Preferences are actor-owned and affect generation/realtime/badges safely. |
| 28O — Track A Final Integration Audit / Frontend Handoff | Final integration audit and contract handoff for Track A | Docs, focused tests only if gaps found | None expected | Full focused Communication/app/realtime/security verification | Track A frontend handoff is complete and deferred backlog remains separated. |

## 10. Security Test Matrix

| Risk | Required coverage |
| --- | --- |
| Parent accesses unrelated child conversation | Parent app messages/contact/media tests reject conversations not linked to current parent/current child. |
| Student accesses another student's conversation | Student app messages/contact/media tests reject guessed conversation/message ids. |
| Teacher accesses unallocated student/parent conversation | Teacher app messages/contact/media tests enforce allocation/participant rules. |
| Unauthorized attachment download | Media download tests require conversation/message/attachment access before redirect or URL creation. |
| `recipientUserId` spoofing | App notification/preference routes ignore or reject recipient overrides. |
| Cross-school message/attachment/notification access | Security tests assert not-found/forbidden per project convention. |
| Message notifications leak to sender | Message notification tests assert sender receives no `message_received`. |
| Muted participants | Message notification tests assert active `mutedUntil` suppresses notification/realtime/badge behavior. |
| Blocked/removed/left participants | Message notification and contact tests assert no delivery/contact visibility. |
| Teacher announcement visibility by allocation | Teacher announcement tests cover school, user, classroom, section, grade, and stage targeting. |
| Notification preferences modified for another user | App preference tests derive actor from auth and reject guessed ids/overrides. |
| Unsafe field leaks | Presenter/security tests serialize app responses and assert forbidden fields are absent. |
| Raw metadata leaks | Media/message/notification tests assert raw metadata is sanitized or omitted. |

## 11. Field No-Leak Contract

App-facing Track A payloads must not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- `recipientUserId`
- `actorUserId`
- `uploadedById`
- `createdById`
- `hiddenById`
- `deletedById`
- `publishedById`
- `guardianId` unless explicitly safe in a route contract
- `studentGuardianId`
- `enrollmentId` unless explicitly safe in an existing app contract
- `bucket`
- `objectKey`
- `storageKey`
- `signedUrl`
- raw metadata
- queue metadata
- provider delivery internals
- delivery ids/rows

## 12. Runtime Sprint Verification Standard

Every runtime sprint after 28G must run:

```powershell
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

If the full security suite times out, focused security fallback may be accepted only with explicit reviewer approval and must be documented in the sprint closeout.

## 13. Sprint 28G Verification Snapshot

Sprint 28G is docs-only. Required verification commands:

```powershell
git status --short --untracked-files=all
git diff --name-only
git diff --stat
git diff --check
```

No build/tests are required if only documentation changes.

## 14. Final Verdict

Sprint 28G status:

COMMUNICATION_TRACK_A_PLAN_LOCKED
