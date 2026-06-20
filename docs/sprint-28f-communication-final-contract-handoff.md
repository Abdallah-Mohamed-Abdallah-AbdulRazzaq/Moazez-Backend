# Sprint 28F — Communication Final Contract Handoff

## 1. Executive Summary

The Communication Feature Family backend contract is closed through the Sprint 28A-28E hardening wave:

| Sprint | Scope | Status |
| --- | --- | --- |
| Sprint 28A | Communication gap decision lock | Complete |
| Sprint 28B | Read receipts and realtime accuracy | Complete |
| Sprint 28C | Conversation list enrichment | Complete |
| Sprint 28D | App-facing notification center and `communication.notification.created` realtime | Complete |
| Sprint 28E | Message readers / WhatsApp-like message info | Complete |

Current accepted baseline:

- `7cb5912 feat: add communication message readers info`

Sprint 28F is documentation-only. No runtime behavior, route prefixes, route names, DTOs, controllers, presenters, Prisma schema, migrations, package files, generated files, or OpenAPI artifacts are changed in this sprint.

This handoff is the authoritative frontend/backend contract summary for V1 Communication surfaces as implemented in the backend at the Sprint 28E baseline.

## 2. Final Scope Status

| Area | Final V1 status | Notes |
| --- | --- | --- |
| Conversations | Complete for V1 list/detail/message flow | App-facing inboxes are actor-scoped. Core conversation routes remain permissioned school management surfaces. |
| Read receipts | Complete for V1 absolute `readCount` | `readCount` excludes the sender and is safe for frontend SET semantics. |
| Conversation list enrichment | Complete | App-facing lists include `lastMessage`, `unreadCount`, `participantsCount`, `lastMessageReadCount`, and `isGroup`. |
| Notifications center | Complete for app-facing V1 | Parent, Student, and Teacher notification centers exist. |
| Realtime `notification.created` | Complete | Emits after notification persistence to the recipient user room only. |
| Message readers/info | Complete | Core and app-facing message readers/info routes exist with safe reader cards. |
| Announcements app-facing reads | Already implemented where applicable | Parent and Student announcement list/detail/read/attachments exist. Teacher announcement routes are not present. |
| File/media download/attachment handling | Limited to existing safe contracts | Message attachments and announcement attachment metadata remain app-safe; no signed storage URLs are exposed. |
| Delivery receipts | Deferred | No deliveredAt, delivery status, or double-grey check system in V1. |
| Push/FCM | Deferred | No mobile push provider integration. |
| Device tokens/preferences | Deferred | No device token or notification preference runtime. |
| Message search | Deferred | Not part of this Communication wave. |
| Audio/media lifecycle | Deferred | Audio messages, thumbnails, transcoding, and preview lifecycle are future product work. |
| Pin/mute/clear/export | Deferred | Not part of this Communication wave. |
| Contact discovery/new conversation creation | Deferred | Do not backdoor through app-facing routes without explicit product scope. |

## 3. Global API Conventions

- The global API prefix remains `/api/v1`, enforced by the application global prefix.
- No route renames or global prefix changes were introduced in Sprints 28A-28F.
- Parent and Student app-facing Communication contracts generally expose camelCase plus snake_case aliases.
- Teacher app-facing Communication contracts generally expose camelCase only unless a pre-existing Teacher app contract says otherwise.
- Core Communication surfaces generally expose camelCase.
- Frontend clients must treat backend-provided counts as absolute values, not values to increment locally.
- App-facing payloads must not expose unsafe internal fields or storage internals.
- Core Communication routes are not the default route family for Parent/Student/Teacher apps. Use app-facing routes unless building an admin/core UI.

## 4. App-facing Route Matrix

### Parent Communication Routes

| Method | Path | Purpose | Auth/access rule | Response style | Notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/parent/messages/conversations` | Parent conversation inbox | Authenticated current parent; current-school/current-child access services | Dual aliases | Returns enriched conversation cards. |
| GET | `/api/v1/parent/messages/conversations/:conversationId` | Parent conversation detail | Current parent must have app access to the conversation | Dual aliases | Includes participants and own read state. |
| GET | `/api/v1/parent/messages/conversations/:conversationId/messages` | List messages | Current parent participant/access scoped | Dual aliases | Message body is hidden for hidden/deleted messages. |
| POST | `/api/v1/parent/messages/conversations/:conversationId/messages` | Send message | Current parent participant/access scoped | Dual aliases | Uses existing Communication message creation path; `clientMessageId` remains supported. |
| POST | `/api/v1/parent/messages/conversations/:conversationId/read` | Mark conversation read | Current parent participant/access scoped | Dual aliases | REST mark-read is the source of truth. |
| GET | `/api/v1/parent/messages/conversations/:conversationId/messages/:messageId/readers` | List message readers | Current parent must access the message conversation | Dual aliases | Safe reader cards; sender excluded. |
| GET | `/api/v1/parent/messages/conversations/:conversationId/messages/:messageId/info` | Message info with readers | Current parent must access the message conversation | Dual aliases | Message preview plus reader summary. |
| GET | `/api/v1/parent/announcements` | List announcements | Current parent/current-school audience access | Dual aliases | Returns app-safe announcement cards. |
| GET | `/api/v1/parent/announcements/:announcementId` | Announcement detail | Current parent/current-school audience access | Dual aliases | Same safe card contract in detail wrapper. |
| POST | `/api/v1/parent/announcements/:announcementId/read` | Mark announcement read | Current parent/current-school audience access | Dual aliases | Creates/updates read marker. |
| GET | `/api/v1/parent/announcements/:announcementId/attachments` | List announcement attachments | Current parent/current-school audience access | Dual aliases | Safe file metadata only: `fileId`, `filename`, `mimeType`, `size`. |
| GET | `/api/v1/parent/notifications` | List notification center cards | Current parent actor only | Dual aliases | Does not accept `recipientUserId`. |
| GET | `/api/v1/parent/notifications/summary` | Notification unread summary | Current parent actor only | Dual aliases | Minimum summary is `unreadCount`/`unread_count`. |
| GET | `/api/v1/parent/notifications/:notificationId` | Notification detail | Current parent recipient ownership | Dual aliases | No delivery rows or raw metadata. |
| POST | `/api/v1/parent/notifications/:notificationId/read` | Mark notification read | Current parent recipient ownership | Dual aliases | Idempotent where core behavior allows. |
| POST | `/api/v1/parent/notifications/read-all` | Mark all parent notifications read | Current parent actor only | Dual aliases | Applies only to current actor/current school. |
| POST | `/api/v1/parent/notifications/:notificationId/archive` | Archive notification | Current parent recipient ownership | Dual aliases | App-safe dismiss/archive surface. |

### Student Communication Routes

| Method | Path | Purpose | Auth/access rule | Response style | Notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/student/messages/conversations` | Student conversation inbox | Authenticated current student; current-school/current-enrollment access services | Dual aliases | Returns enriched conversation cards. |
| GET | `/api/v1/student/messages/conversations/:conversationId` | Student conversation detail | Current student must have app access to the conversation | Dual aliases | Includes participants and own read state. |
| GET | `/api/v1/student/messages/conversations/:conversationId/messages` | List messages | Current student participant/access scoped | Dual aliases | Message body is hidden for hidden/deleted messages. |
| POST | `/api/v1/student/messages/conversations/:conversationId/messages` | Send message | Current student participant/access scoped | Dual aliases | Uses existing Communication message creation path; `clientMessageId` remains supported. |
| POST | `/api/v1/student/messages/conversations/:conversationId/read` | Mark conversation read | Current student participant/access scoped | Dual aliases | REST mark-read is the source of truth. |
| GET | `/api/v1/student/messages/conversations/:conversationId/messages/:messageId/readers` | List message readers | Current student must access the message conversation | Dual aliases | Safe reader cards; sender excluded. |
| GET | `/api/v1/student/messages/conversations/:conversationId/messages/:messageId/info` | Message info with readers | Current student must access the message conversation | Dual aliases | Message preview plus reader summary. |
| GET | `/api/v1/student/announcements` | List announcements | Current student/current-school audience access | Dual aliases | Returns app-safe announcement cards. |
| GET | `/api/v1/student/announcements/:announcementId` | Announcement detail | Current student/current-school audience access | Dual aliases | Same safe card contract in detail wrapper. |
| POST | `/api/v1/student/announcements/:announcementId/read` | Mark announcement read | Current student/current-school audience access | Dual aliases | Creates/updates read marker. |
| GET | `/api/v1/student/announcements/:announcementId/attachments` | List announcement attachments | Current student/current-school audience access | Dual aliases | Safe file metadata only: `fileId`, `filename`, `mimeType`, `size`. |
| GET | `/api/v1/student/notifications` | List notification center cards | Current student actor only | Dual aliases | Does not accept `recipientUserId`. |
| GET | `/api/v1/student/notifications/summary` | Notification unread summary | Current student actor only | Dual aliases | Minimum summary is `unreadCount`/`unread_count`. |
| GET | `/api/v1/student/notifications/:notificationId` | Notification detail | Current student recipient ownership | Dual aliases | No delivery rows or raw metadata. |
| POST | `/api/v1/student/notifications/:notificationId/read` | Mark notification read | Current student recipient ownership | Dual aliases | Idempotent where core behavior allows. |
| POST | `/api/v1/student/notifications/read-all` | Mark all student notifications read | Current student actor only | Dual aliases | Applies only to current actor/current school. |
| POST | `/api/v1/student/notifications/:notificationId/archive` | Archive notification | Current student recipient ownership | Dual aliases | App-safe dismiss/archive surface. |

### Teacher Communication Routes

| Method | Path | Purpose | Auth/access rule | Response style | Notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/teacher/messages/conversations` | Teacher conversation inbox | Authenticated current teacher; allocation/participant access as implemented | CamelCase | Returns enriched conversation cards. |
| GET | `/api/v1/teacher/messages/conversations/:conversationId` | Teacher conversation detail | Current teacher must have app access to the conversation | CamelCase | Includes participants and own read state. |
| GET | `/api/v1/teacher/messages/conversations/:conversationId/messages` | List messages | Current teacher participant/access scoped | CamelCase | Message body is hidden for hidden/deleted messages. |
| POST | `/api/v1/teacher/messages/conversations/:conversationId/messages` | Send message | Current teacher participant/access scoped | CamelCase | Uses existing Communication message creation path; `clientMessageId` remains supported. |
| POST | `/api/v1/teacher/messages/conversations/:conversationId/read` | Mark conversation read | Current teacher participant/access scoped | CamelCase | REST mark-read is the source of truth. |
| GET | `/api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/readers` | List message readers | Current teacher must access the message conversation | CamelCase | Safe reader cards; sender excluded. |
| GET | `/api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/info` | Message info with readers | Current teacher must access the message conversation | CamelCase | Message preview plus reader summary. |
| Not implemented | Teacher announcements | Teacher announcement app-facing routes | N/A | N/A | No `teacher-app/announcements` route family is present in this closeout baseline. |
| GET | `/api/v1/teacher/notifications` | List notification center cards | Current teacher actor only | CamelCase | Does not accept `recipientUserId`. |
| GET | `/api/v1/teacher/notifications/summary` | Notification unread summary | Current teacher actor only | CamelCase | Minimum summary is `unreadCount`. |
| GET | `/api/v1/teacher/notifications/:notificationId` | Notification detail | Current teacher recipient ownership | CamelCase | No delivery rows or raw metadata. |
| POST | `/api/v1/teacher/notifications/:notificationId/read` | Mark notification read | Current teacher recipient ownership | CamelCase | Idempotent where core behavior allows. |
| POST | `/api/v1/teacher/notifications/read-all` | Mark all teacher notifications read | Current teacher actor only | CamelCase | Applies only to current actor/current school. |
| POST | `/api/v1/teacher/notifications/:notificationId/archive` | Archive notification | Current teacher recipient ownership | CamelCase | App-safe dismiss/archive surface. |

## 5. Core Communication Route Matrix

Core `/api/v1/communication/conversations` remains a school-scoped permissioned management surface. It was not converted into a participant-scoped inbox endpoint. Parent, Student, and Teacher apps should use their app-facing route families for actor-scoped inbox behavior.

### Core Conversations

| Method | Path | Purpose | Permission expectation | Surface | Safety notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/communication/conversations` | List conversations | `communication.conversations.view` | Core/management | School-scoped; enriched additively; `unreadCount` is `null` without participant actor context. |
| POST | `/api/v1/communication/conversations` | Create conversation | `communication.conversations.create` | Core/management | Do not use as contact discovery backdoor. |
| GET | `/api/v1/communication/conversations/:conversationId` | Conversation detail | `communication.conversations.view` | Core/management | School-scoped. |
| PATCH | `/api/v1/communication/conversations/:conversationId` | Update conversation | `communication.conversations.manage` | Core/management | Management-only. |
| POST | `/api/v1/communication/conversations/:conversationId/archive` | Archive conversation | `communication.conversations.manage` | Core/management | Management-only. |
| POST | `/api/v1/communication/conversations/:conversationId/close` | Close conversation | `communication.conversations.manage` | Core/management | Management-only. |
| POST | `/api/v1/communication/conversations/:conversationId/reopen` | Reopen conversation | `communication.conversations.manage` | Core/management | Management-only. |

### Core Messages and Read Receipts

| Method | Path | Purpose | Permission expectation | Surface | Safety notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/communication/conversations/:conversationId/messages` | List messages | `communication.messages.view` | Core | Access checked against Communication conventions. |
| POST | `/api/v1/communication/conversations/:conversationId/messages` | Send message | `communication.messages.send` | Core | `clientMessageId` remains part of safe message contract. |
| POST | `/api/v1/communication/conversations/:conversationId/read` | Mark conversation read | `communication.messages.view` | Core | Returns `conversationId`, `readAt`, `markedCount`, and affected `messages`. |
| GET | `/api/v1/communication/conversations/:conversationId/read-summary` | Read summary | `communication.messages.view` | Core | `readCount` excludes sender. No reader identities here. |
| GET | `/api/v1/communication/messages/:messageId` | Message detail | `communication.messages.view` | Core | Hidden/deleted body masking preserved. |
| GET | `/api/v1/communication/messages/:messageId/readers` | Message readers | `communication.messages.view` | Core | Participant or elevated access; sender excluded. |
| GET | `/api/v1/communication/messages/:messageId/info` | Message info | `communication.messages.view` | Core | Message preview plus safe readers summary. |
| PATCH | `/api/v1/communication/messages/:messageId` | Edit message | `communication.messages.edit` | Core | Existing edit rules apply. |
| DELETE | `/api/v1/communication/messages/:messageId` | Delete message | `communication.messages.delete` | Core | Existing delete rules apply. |
| POST | `/api/v1/communication/messages/:messageId/read` | Mark one message read | `communication.messages.view` | Core | Sender self-read does not inflate `readCount`. |

### Core Message Interactions, Participants, and Safety

| Method | Path | Purpose | Permission expectation | Surface | Safety notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/communication/messages/:messageId/reactions` | List reactions | `communication.messages.view` | Core | School/access scoped. |
| PUT | `/api/v1/communication/messages/:messageId/reactions` | Upsert own reaction | `communication.messages.react` | Core | Realtime reaction event exists. |
| DELETE | `/api/v1/communication/messages/:messageId/reactions/me` | Delete own reaction | `communication.messages.react` | Core | Realtime reaction event exists. |
| GET | `/api/v1/communication/messages/:messageId/attachments` | List message attachments | `communication.messages.view` | Core | Do not expose storage internals in app-facing contracts. |
| POST | `/api/v1/communication/messages/:messageId/attachments` | Link attachment | `communication.messages.attachments.manage` | Core | Requires existing file/storage ownership rules. |
| DELETE | `/api/v1/communication/messages/:messageId/attachments/:attachmentId` | Delete attachment link | `communication.messages.attachments.manage` | Core | Realtime attachment deletion event exists. |
| GET | `/api/v1/communication/conversations/:conversationId/participants` | List participants | `communication.conversations.view` | Core | Management/core participant surface. |
| POST/PATCH/DELETE | `/api/v1/communication/conversations/:conversationId/participants...` | Manage participants | `communication.participants.manage` | Core | Management-only participant changes. |
| POST | `/api/v1/communication/conversations/:conversationId/leave` | Leave conversation | `communication.conversations.view` | Core | Existing participant rules apply. |
| GET/POST | `/api/v1/communication/conversations/:conversationId/invites` | List/create invites | `communication.participants.manage` | Core | Management-only. |
| POST | `/api/v1/communication/conversation-invites/:inviteId/accept` | Accept invite | `communication.conversations.view` | Core | Existing invite rules apply. |
| POST | `/api/v1/communication/conversation-invites/:inviteId/reject` | Reject invite | `communication.conversations.view` | Core | Existing invite rules apply. |
| GET/POST | `/api/v1/communication/conversations/:conversationId/join-requests` | List/create join requests | Manage or view permission by action | Core | Contact discovery remains product-gated. |
| POST | `/api/v1/communication/join-requests/:requestId/approve` | Approve join request | `communication.participants.manage` | Core | Management-only. |
| POST | `/api/v1/communication/join-requests/:requestId/reject` | Reject join request | `communication.participants.manage` | Core | Management-only. |
| POST | `/api/v1/communication/messages/:messageId/reports` | Report message | `communication.messages.report` | Core | Safety surface. |
| GET/PATCH | `/api/v1/communication/message-reports...` | Moderate reports | `communication.messages.moderate` | Core | Moderation-only. |
| GET/POST | `/api/v1/communication/messages/:messageId/moderation-actions` | Moderate message | `communication.messages.moderate` | Core | Moderation-only. |
| GET/POST/DELETE | `/api/v1/communication/blocks...` | Manage blocks | `communication.conversations.view` | Core | User safety surface. |
| GET/POST/PATCH/DELETE | `/api/v1/communication/restrictions...` | Manage restrictions | `communication.messages.moderate` | Core | Moderation-only. |

### Core Announcements, Notifications, and Admin

| Method | Path | Purpose | Permission expectation | Surface | Safety notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/communication/announcements` | List announcements | `communication.announcements.view` | Core/management | School-scoped. |
| POST | `/api/v1/communication/announcements` | Create announcement | `communication.announcements.manage` | Core/management | Management-only. |
| GET | `/api/v1/communication/announcements/:announcementId` | Announcement detail | `communication.announcements.view` | Core/management | School-scoped. |
| PATCH | `/api/v1/communication/announcements/:announcementId` | Update announcement | `communication.announcements.manage` | Core/management | Management-only. |
| POST | `/api/v1/communication/announcements/:announcementId/publish` | Publish announcement | `communication.announcements.manage` | Core/management | Queue-backed notification generation can follow. |
| POST | `/api/v1/communication/announcements/:announcementId/archive` | Archive announcement | `communication.announcements.manage` | Core/management | Management-only. |
| POST | `/api/v1/communication/announcements/:announcementId/cancel` | Cancel announcement | `communication.announcements.manage` | Core/management | Management-only. |
| POST | `/api/v1/communication/announcements/:announcementId/read` | Mark announcement read | `communication.announcements.view` | Core | Read marker surface. |
| GET | `/api/v1/communication/announcements/:announcementId/read-summary` | Announcement read summary | `communication.announcements.manage` | Core/management | No app reader identities exposed. |
| GET/POST/DELETE | `/api/v1/communication/announcements/:announcementId/attachments...` | Announcement attachments | View/manage by action | Core/management | Storage internals remain hidden from app contracts. |
| GET | `/api/v1/communication/notifications` | List notifications | `communication.notifications.view` | Core | Core presenter includes recipient/actor ids; app routes use safer presenter. |
| POST | `/api/v1/communication/notifications/read-all` | Mark own/current query notifications read | `communication.notifications.view` | Core | Existing core behavior preserved. |
| GET | `/api/v1/communication/notifications/:notificationId` | Notification detail | `communication.notifications.view` | Core | Detail includes delivery summary for core. |
| POST | `/api/v1/communication/notifications/:notificationId/read` | Mark notification read | `communication.notifications.view` | Core | Recipient/access scoped by core use-case. |
| POST | `/api/v1/communication/notifications/:notificationId/archive` | Archive notification | `communication.notifications.view` | Core | Recipient/access scoped by core use-case. |
| GET | `/api/v1/communication/notification-deliveries` | List delivery records | `communication.notifications.manage` | Core/management | Not app-facing. |
| GET | `/api/v1/communication/notification-deliveries/:deliveryId` | Delivery detail | `communication.notifications.manage` | Core/management | Not app-facing. |
| GET | `/api/v1/communication/policies` | View policies | `communication.policies.view` | Core/admin | Admin surface. |
| PATCH | `/api/v1/communication/policies` | Update policies | `communication.policies.manage` | Core/admin | Admin surface. |
| GET | `/api/v1/communication/admin/overview` | Admin overview | `communication.admin.view` | Core/admin | Admin surface. |

## 6. Conversation List Contract

Sprint 28C finalized the conversation list contract.

App-facing conversation cards include:

- `lastMessage` and, for Parent/Student, `last_message`
- `unreadCount` and, for Parent/Student, `unread_count`
- `participantsCount` and, for Parent/Student, `participants_count`
- `lastMessageReadCount` and, for Parent/Student, `last_message_read_count`
- `isGroup` and, for Parent/Student, `is_group`

Contract rules:

- App-facing `unreadCount` is actor-specific.
- App-facing `unreadCount` counts unread visible/listable messages sent by other users only.
- Core `unreadCount` is `null` because the core conversation list has no participant actor context.
- `participantsCount` uses active+muted participants and includes the sender/current actor when active or muted.
- Core `participantCount` preserves the legacy raw participant count where applicable.
- Core `activeParticipantsCount` is additive and reflects active participant rows selected for the core response.
- `lastMessage` is the latest visible/listable message selected for the conversation list.
- `lastMessage` hides body/content for hidden/deleted messages using existing presenter rules.
- `readCount` inside `lastMessage` excludes the sender.
- `lastMessageReadCount` equals `lastMessage.readCount`; it is `0` for app-facing cards without a last message and `null` in the core response when there is no last message.
- `isGroup` maps `group`, `classroom`, `grade`, `section`, `stage`, and `school_wide` to true; `direct` and `system` to false; `support` to true only when participants exceed two.

## 7. Read Receipt Contract

Sprint 28B finalized read receipt semantics.

- `readCount` excludes the message sender.
- Historical sender self-read rows are ignored in output counts.
- Sender self-read does not create or inflate read counts in current runtime behavior.
- `participantsCount` includes active+muted participants and includes the sender/current actor when active or muted.
- `fullyRead = readCount + 1 >= participantsCount`.
- Frontend clients must SET `readCount` from backend payloads, not increment blindly.
- `communication.chat.conversation.join` subscribes the socket to a conversation room only; it does not mark messages read.
- REST mark-read endpoints remain the source of truth for reads.
- Per-message read events include absolute `readCount`.
- Conversation mark-read responses and events include affected messages and absolute read counts.

Core read response shapes:

- Single message read returns `id`, `conversationId`, `messageId`, `userId`, `readAt`, `readCount`, `createdAt`, and `updatedAt`.
- Conversation mark-read returns `conversationId`, `readAt`, `markedCount`, and `messages: [{ messageId, readCount }]`.
- Read summary returns `conversationId`, `items`, `total`, `limit`, and `page`, with item `readCount` values excluding sender.

## 8. Message Readers / Message Info Contract

Sprint 28E finalized the message readers and message info contract.

Routes:

- Core readers: `GET /api/v1/communication/messages/:messageId/readers`
- Core info: `GET /api/v1/communication/messages/:messageId/info`
- Parent readers: `GET /api/v1/parent/messages/conversations/:conversationId/messages/:messageId/readers`
- Parent info: `GET /api/v1/parent/messages/conversations/:conversationId/messages/:messageId/info`
- Student readers: `GET /api/v1/student/messages/conversations/:conversationId/messages/:messageId/readers`
- Student info: `GET /api/v1/student/messages/conversations/:conversationId/messages/:messageId/info`
- Teacher readers: `GET /api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/readers`
- Teacher info: `GET /api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/info`

Reader list shape:

- Core and Teacher use camelCase.
- Parent and Student include snake_case aliases.
- Top-level fields: `messageId`, `conversationId`, `readCount`, `participantsCount`, `fullyRead`, `readers`, and `pagination`.
- Parent/Student aliases: `message_id`, `conversation_id`, `read_count`, `participants_count`, and `fully_read`.
- Reader card safe fields: `userId`, `displayName`, `userType`, `isMe`, and `readAt`.
- Parent/Student reader aliases: `user_id`, `display_name`, `user_type`, `is_me`, and `read_at`.
- Pagination includes `page`, `limit`, and `total`.
- Reader ordering is stable by the repository/read-model implementation and should be treated as backend-defined for V1.

Message info shape:

- Top-level fields: `message`, `readers`, `readCount`, `participantsCount`, `fullyRead`, and `pagination`.
- `message` includes `messageId`, `conversationId`, safe `sender`, `type`, `status`, `body`, `content`, `createdAt`, and `readCount`.
- Parent/Student include route-style aliases for the message and count fields.
- Hidden/deleted message body/content is masked to `null`.
- Attachments are not expanded by the message info endpoint unless an existing safe message attachment contract is intentionally used elsewhere.

Reader/count rules:

- Readers exclude the sender.
- Sender self-read rows are ignored.
- `readCount` excludes the sender.
- `participantsCount` uses active+muted participants and includes the sender.
- `fullyRead = readCount + 1 >= participantsCount`.
- The endpoint is not a delivery receipt system. No `deliveredAt`, per-recipient delivery status, or double-grey checks exist in V1.

## 9. Notification Center Contract

Sprint 28D finalized the app-facing notification center.

Routes:

- Parent:
  - `GET /api/v1/parent/notifications`
  - `GET /api/v1/parent/notifications/summary`
  - `GET /api/v1/parent/notifications/:notificationId`
  - `POST /api/v1/parent/notifications/:notificationId/read`
  - `POST /api/v1/parent/notifications/read-all`
  - `POST /api/v1/parent/notifications/:notificationId/archive`
- Student:
  - `GET /api/v1/student/notifications`
  - `GET /api/v1/student/notifications/summary`
  - `GET /api/v1/student/notifications/:notificationId`
  - `POST /api/v1/student/notifications/:notificationId/read`
  - `POST /api/v1/student/notifications/read-all`
  - `POST /api/v1/student/notifications/:notificationId/archive`
- Teacher:
  - `GET /api/v1/teacher/notifications`
  - `GET /api/v1/teacher/notifications/summary`
  - `GET /api/v1/teacher/notifications/:notificationId`
  - `POST /api/v1/teacher/notifications/:notificationId/read`
  - `POST /api/v1/teacher/notifications/read-all`
  - `POST /api/v1/teacher/notifications/:notificationId/archive`

App-facing routes never accept `recipientUserId`. Recipient ownership is derived from the authenticated current actor and current school.

List response:

- `notifications`: safe notification cards.
- `pagination`: `page`, `limit`, `total`.
- `summary`: unread summary.

Notification card fields:

- `notificationId`
- `type`
- `sourceModule`
- `sourceId`
- `title`
- `body`
- `priority`
- `status`
- `readAt`
- `archivedAt`
- `createdAt`
- `deepLink`

Parent and Student add aliases such as `notification_id`, `source_module`, `source_id`, `read_at`, `archived_at`, `created_at`, and `deep_link`.

Summary:

- Parent/Student: `unreadCount` and `unread_count`.
- Teacher: `unreadCount`.

Read-all response:

- Parent/Student: `markedCount`, `marked_count`, `readAt`, and `read_at`.
- Teacher: `markedCount` and `readAt`.

Deep links:

- Announcement notifications map to `{ type: "announcement", announcementId: "<sourceId>" }`.
- Unsupported notification types return `deepLink: null`.
- App-facing deep links do not expose `schoolId`, `organizationId`, `recipientUserId`, delivery rows, queue job ids, storage internals, or raw metadata.

## 10. Announcement Contract

Implemented app-facing announcement route families:

- Parent:
  - `GET /api/v1/parent/announcements`
  - `GET /api/v1/parent/announcements/:announcementId`
  - `POST /api/v1/parent/announcements/:announcementId/read`
  - `GET /api/v1/parent/announcements/:announcementId/attachments`
- Student:
  - `GET /api/v1/student/announcements`
  - `GET /api/v1/student/announcements/:announcementId`
  - `POST /api/v1/student/announcements/:announcementId/read`
  - `GET /api/v1/student/announcements/:announcementId/attachments`

Teacher announcement app-facing routes are not present in this baseline and are not part of the closed Communication app-facing route matrix.

Parent/Student announcement cards include safe fields such as:

- `id`, `announcementId`, `announcement_id`
- `title`, `description`, `body`
- `sender`
- `dateLabel`, `date_label`
- `category`
- `priority`
- `isPinned`, `is_pinned`
- `isNew`, `is_new`
- `actionLabel`, `action_label`
- `image`
- `publishedAt`, `published_at`
- `expiresAt`, `expires_at`
- `readAt`, `read_at`
- `attachmentsCount`, `attachments_count`

Read marker response:

- `announcementId`, `announcement_id`, `readAt`, `read_at`

Attachment list response:

- `announcementId`, `announcement_id`
- `attachments: [{ fileId, filename, mimeType, size }]`

No bucket, object key, storage key, signed URL, or raw storage metadata is exposed through app-facing announcement contracts.

## 11. Realtime Contract

Realtime namespace:

- `/api/v1/realtime`

Socket connection behavior:

- Authenticated sockets join the school room and the actor user room.
- Presence registration runs when enabled.
- Conversation room join is explicit through `communication.chat.conversation.join`.

Realtime server events:

| Event | Target room | Payload summary | Safety notes |
| --- | --- | --- | --- |
| `communication.chat.message.created` | Conversation room | `conversationId`, safe presented `message`, `eventAt` | Message payload keeps `clientMessageId` when provided. |
| `communication.chat.message.updated` | Conversation room | `conversationId`, safe presented `message`, `eventAt` | Hidden/deleted body rules follow presenter behavior. |
| `communication.chat.message.deleted` | Conversation room | `conversationId`, `messageId`, `eventAt` | No raw deletion internals. |
| `communication.chat.message.read` | Conversation room | Per-message: `conversationId`, `messageId`, `readerId`, `readAt`, `readCount`, `eventAt` | `readCount` is absolute and excludes sender. |
| `communication.chat.message.read` | Conversation room | Conversation mark-read: `conversationId`, `readerId`, `readAt`, `markedCount`, `messages`, `eventAt` | `messages` contains affected `{ messageId, readCount }` values. |
| `communication.chat.reaction.upserted` | Conversation room | `conversationId`, `messageId`, `reaction`, `eventAt` | Existing reaction presenter rules apply. |
| `communication.chat.reaction.deleted` | Conversation room | `conversationId`, `messageId`, `userId`, `reactionKey`, `eventAt` | Existing reaction access rules apply. |
| `communication.chat.attachment.linked` | Conversation room | `conversationId`, `messageId`, `attachment`, `eventAt` | Do not expose storage internals in app-facing clients. |
| `communication.chat.attachment.deleted` | Conversation room | `conversationId`, `messageId`, `attachmentId`, `eventAt` | Existing attachment access rules apply. |
| `communication.typing.started` | Conversation room | `conversationId`, `userId`, `startedAt`, `expiresAt` | Typing display name enrichment is not implemented. |
| `communication.typing.stopped` | Conversation room | `conversationId`, `userId`, `stoppedAt` | Typing display name enrichment is not implemented. |
| `communication.presence.user.updated` | School room | `userId`, `status`, `online`, `updatedAt` | Presence is school-room scoped. |
| `communication.notification.created` | Recipient user room | `notification`, `eventAt` | Emits after notification persistence; no school-room broadcast. |

`communication.notification.created` details:

- Published through the realtime publisher to the recipient user room.
- Uses the safe camelCase notification presenter.
- Does not broadcast to the school room.
- Emits only after notification rows are persisted.
- Queue retry behavior should not emit duplicates for existing rows.

Contract notes:

- Event constants also define `communication.announcement.published` and `communication.notification.read`; this handoff only treats `communication.notification.created` and the listed chat/presence/typing events as verified app contract events from the inspected publisher paths.
- Client command constants include `communication.chat.conversation.read`, but the active gateway read contract remains REST mark-read. Do not mark read on socket join.

## 12. Security / Tenancy Contract

App-facing Communication payloads must not leak:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- `recipientUserId`
- internal actor ids unless route-safe
- `hiddenById`
- `deletedById`
- raw metadata
- queue/job metadata
- delivery ids/rows
- storage bucket
- `objectKey`
- `storageKey`
- `signedUrl`
- private contact data
- `enrollmentId` unless already route-safe and explicitly part of an existing app contract

Tenancy rules:

- Parent routes are current-parent/current-child scoped through app access services.
- Student routes are current-student/current-enrollment scoped.
- Teacher routes are current-teacher/current-allocation/participant scoped as implemented.
- Core routes require current-school scoping and the relevant Communication permissions.
- Guessed IDs must not leak cross-school or same-school unauthorized data.
- App-facing routes must not accept `actorUserId`, `recipientUserId`, or `schoolId` overrides.
- Notifications are recipient-owned in app-facing surfaces.
- Message readers require conversation/message access before returning reader cards.
- Core notification presenters may include core-management fields such as `recipientUserId`; app-facing notification presenters intentionally do not.

## 13. Frontend Integration Notes

- Use Parent, Student, and Teacher app-facing routes for app clients. Use core routes only for admin/core UIs.
- For conversation cards, use backend-provided `unreadCount`, `readCount`, and `lastMessageReadCount` as absolute values.
- For read realtime events, update local state by SET using absolute `readCount`; do not increment blindly.
- Do not mark read on socket join.
- Use REST mark-read endpoints as the source of truth.
- Use message readers/info routes for WhatsApp-like "seen by" views.
- Use notification summary endpoints for app badge counts.
- Use `communication.notification.created` to insert, refresh, or invalidate notification cards for the recipient user.
- Do not depend on internal ids, raw metadata, delivery rows, queue metadata, or storage internals.
- Do not assume delivery receipts exist.
- Treat Teacher announcement routes as not implemented unless a future sprint adds them.
- Treat typing events as user-id based for V1; display name enrichment remains future work.

## 14. Deferred / Future Backlog

- FCM/mobile push provider integration.
- Device token registration.
- Notification preferences.
- Delivery receipts/double-grey checks.
- `deliveredAt` per recipient.
- Contact discovery.
- New app-facing conversation creation if not fully supported by product scope.
- Audio messages.
- Thumbnails/media transcoding.
- Media preview lifecycle.
- Message search.
- Server-side pin/mute/clear/export.
- Advanced notification filters/preferences.
- Online status/lastSeen privacy and batch presence expansion beyond current presence event.
- Typing `userName`/display-name enrichment.
- Teacher announcements, if product scope requires them.
- Any remaining frontend app gaps discovered during handoff.

## 15. Verification Snapshot

Latest known Sprint 28E verification from the closeout/final handoff state:

| Command/suite | Latest known result |
| --- | --- |
| `npx prisma validate` | Passed |
| `npx prisma generate` | Passed |
| `npm run build` | Passed |
| `npm run test -- communication --runInBand` | Passed |
| `npm run test -- parent-app --runInBand` | Passed |
| `npm run test -- student-app --runInBand` | Passed |
| `npm run test -- teacher-app --runInBand` | Passed |
| `npm run test -- realtime --runInBand` | Passed |
| `npm run test:security -- --runInBand` | Passed — 49 suites / 803 tests |

Sprint 28F is docs-only. Required verification commands:

```powershell
git status --short --untracked-files=all
git diff --name-only
git diff --stat
git diff --check
```

Because Sprint 28F changes only documentation, build/tests are not required unless runtime TypeScript files are changed.

Contract notes / follow-up items found during handoff:

- Teacher app-facing announcement routes are absent.
- Typing events include `userId` but do not include `userName`/`displayName`.
- Event names for `communication.announcement.published` and `communication.notification.read` exist, but this handoff does not treat them as verified app-facing publisher contracts.

## 16. Final Verdict

Sprint 28F status:

COMMUNICATION_FINAL_CONTRACT_HANDOFF_COMPLETE

Runtime changes:

None

Schema/migration changes:

None

Package/generated/OpenAPI changes:

None

Final handoff:

- Core and app-facing Communication route matrices are documented.
- Conversation list, read receipt, notification center, realtime, and message readers/info contracts are documented.
- Security and no-leak rules are documented.
- Deferred Communication backlog is documented.
- No commit is made by this sprint.
