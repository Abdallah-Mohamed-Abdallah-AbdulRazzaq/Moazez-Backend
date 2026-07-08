# School Support Chat API Contract V1

## Purpose

Define the proposed V1 REST contract for School Dashboard Help support chat between a school-scoped user and Moazez Platform Support.

This contract was initially planned in `SCHOOL-SUPPORT-CHAT-0A`. The core REST and IAM route surface is implemented in `SCHOOL-SUPPORT-CHAT-1A`.

All routes are under the mandatory global prefix:

```text
/api/v1
```

## Contract Principles

- Use existing Communication storage with `CommunicationConversation.type = SUPPORT`.
- Use one persistent support conversation per school in V1.
- Use support-specific wrapper endpoints.
- Do not expose Platform Admin support through generic `/api/v1/communication/*` routes.
- Do not make `platform_super_admin` a school member.
- REST is source of truth for conversation, messages, and read state.
- Realtime is best-effort and must use existing event names where verified.
- Responses must be presenter-shaped and must not return raw Prisma rows.

## Permissions

Permissions implemented in `SCHOOL-SUPPORT-CHAT-1A`:

| Permission | Intended surface | Purpose |
| --- | --- | --- |
| `school.support.view` | School Dashboard | View support conversation, messages, and mark read. |
| `school.support.send` | School Dashboard | Send school support messages. |
| `platform.support.view` | Platform Admin | View support inbox, conversations, and messages. |
| `platform.support.reply` | Platform Admin | Send platform support replies. |
| `platform.support.manage` | Platform Admin | Close and reopen support conversations. |

Intended role assignment:

- `school_admin` should receive `school.support.view` and `school.support.send`.
- `platform_super_admin` should receive `platform.support.view`, `platform.support.reply`, and `platform.support.manage`.
- Teacher, Parent, and Student should not receive `school.support.*` by default.
- Dismissal Staff should not receive `school.support.*` by default.

Implementation verification:

- `platform_super_admin` receives `platform.support.*` through `ALL`.
- `school_admin` receives `school.support.*` through `NON_PLATFORM` / `SCHOOL_LEVEL` after the seed is rerun.
- Teacher, Parent, Student, and Dismissal Staff explicit permission arrays do not include `school.support.*`.

## 1A Runtime Choices

- Messages are text-only.
- `clientMessageId` is supported for per-sender idempotent message creation.
- School sends and platform replies to closed conversations return `409`.
- School messages do not auto-reopen closed conversations.
- Platform unread state is per platform user, not shared across all platform admins.
- Platform support actors may be inserted as conversation participants, but no school membership is created.
- Support-specific realtime and push notification behavior is not implemented in 1A; REST is the source of truth.

## School Dashboard Routes

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/school-support/conversation` | `school.support.view` | Get or create the current school's persistent support conversation summary. |
| `GET` | `/api/v1/school-support/messages` | `school.support.view` | List support messages for the current school's support conversation. |
| `POST` | `/api/v1/school-support/messages` | `school.support.send` | Send a school support message. |
| `POST` | `/api/v1/school-support/read` | `school.support.view` | Mark the current school's support conversation read by the current actor. |

School route access rules:

- Requires authenticated actor.
- Requires active school membership.
- Does not accept `schoolId`, `organizationId`, `membershipId`, or `participantId` from the client.
- Loads the current school from `RequestContext`.
- Uses support-specific presenters, not raw Communication presenters when those expose internal fields.

## `GET /api/v1/school-support/conversation`

Returns the current school's support conversation. If no V1 support conversation exists, implementation should create one transactionally.

Response:

```json
{
  "conversation": {
    "id": "uuid",
    "type": "support",
    "status": "active",
    "title": "Moazez Support",
    "lastMessageAt": "2026-07-08T12:00:00.000Z"
  },
  "unread": {
    "count": 0,
    "lastReadAt": null
  }
}
```

Response notes:

- `conversation.id` is the support conversation id.
- `type` is lowercase API value for `CommunicationConversationType.SUPPORT`.
- `status` is lowercase API value: `active`, `closed`, or `archived`.
- `title` is always a safe support title.
- `lastMessageAt` is ISO timestamp or `null`.

## `GET /api/v1/school-support/messages`

Query parameters:

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `before` | ISO datetime | No | Return messages before this timestamp. |
| `after` | ISO datetime | No | Return messages after this timestamp. |
| `page` | number | No | Default `1`. |
| `limit` | number | No | Default `50`, max should be capped by implementation. |

Response:

```json
{
  "conversation": {
    "id": "uuid",
    "status": "active"
  },
  "items": [
    {
      "id": "uuid",
      "conversationId": "uuid",
      "body": "نحتاج مساعدة في إعداد صفحة المساعدة.",
      "sender": {
        "kind": "school",
        "displayName": "School Admin"
      },
      "isMine": true,
      "sentAt": "2026-07-08T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1
  }
}
```

School message item fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Message id. |
| `conversationId` | UUID | Support conversation id. |
| `body` | string or null | Hidden/deleted messages should be masked according to Communication presenter rules. |
| `sender.kind` | string | `school`, `support`, or `system`. |
| `sender.displayName` | string | Safe display name only. |
| `isMine` | boolean | True when the message sender is current actor. |
| `sentAt` | ISO datetime | Message sent timestamp. |

## `POST /api/v1/school-support/messages`

Request:

```json
{
  "body": "نحتاج مساعدة في إعداد صفحة المساعدة.",
  "clientMessageId": "browser-generated-id"
}
```

Request validation:

- `body` is required for V1 text messages.
- Empty or whitespace-only body should return validation error.
- `clientMessageId` is optional but recommended for idempotency.
- Attachments are not included in this V1 contract unless explicitly approved in implementation.

Response:

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "body": "نحتاج مساعدة في إعداد صفحة المساعدة.",
  "sender": {
    "kind": "school",
    "displayName": "School Admin"
  },
  "isMine": true,
  "sentAt": "2026-07-08T12:00:00.000Z"
}
```

## `POST /api/v1/school-support/read`

Request:

```json
{
  "readAt": "2026-07-08T12:05:00.000Z"
}
```

Request notes:

- `readAt` is optional. If omitted, server time is used.

Response:

```json
{
  "conversationId": "uuid",
  "readAt": "2026-07-08T12:05:00.000Z",
  "markedCount": 1
}
```

## Platform Admin Routes

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/platform-admin/support/conversations` | `platform.support.view` | List support inbox conversations across schools. |
| `GET` | `/api/v1/platform-admin/support/conversations/:conversationId` | `platform.support.view` | Read one support conversation detail. |
| `GET` | `/api/v1/platform-admin/support/conversations/:conversationId/messages` | `platform.support.view` | List messages for a support conversation. |
| `POST` | `/api/v1/platform-admin/support/conversations/:conversationId/messages` | `platform.support.reply` | Send a platform support reply. |
| `POST` | `/api/v1/platform-admin/support/conversations/:conversationId/read` | `platform.support.view` | Mark the support conversation read for the platform support actor or selected platform unread model. |
| `POST` | `/api/v1/platform-admin/support/conversations/:conversationId/close` | `platform.support.manage` | Close support conversation. |
| `POST` | `/api/v1/platform-admin/support/conversations/:conversationId/reopen` | `platform.support.manage` | Reopen support conversation. |

Platform route access rules:

- Requires authenticated `UserType.PLATFORM_USER`.
- Requires platform support permission.
- Controller/use cases should use `@PlatformScope()`.
- Repository queries that cross school boundaries must use `platformBypassScope(...)`.
- Every `conversationId` must be verified as `type = SUPPORT` and support metadata before data is returned or mutated.

## Platform Inbox Query

`GET /api/v1/platform-admin/support/conversations`

Query parameters:

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `schoolId` | UUID | No | Filter to one school. |
| `organizationId` | UUID | No | Filter to one organization. |
| `status` | string | No | `active`, `closed`, or `archived`. |
| `search` | string | No | Search by school, organization, or safe support preview fields. |
| `hasUnread` | boolean | No | Filter conversations with unread platform-side messages. |
| `page` | number | No | Default `1`. |
| `limit` | number | No | Default `20`, max should be capped by implementation. |

Response:

```json
{
  "items": [
    {
      "conversation": {
        "id": "uuid",
        "status": "active",
        "lastMessageAt": "2026-07-08T12:00:00.000Z"
      },
      "school": {
        "id": "uuid",
        "name": "Example School",
        "status": "active"
      },
      "organization": {
        "id": "uuid",
        "name": "Example Organization"
      },
      "lastMessage": {
        "preview": "نحتاج مساعدة...",
        "senderKind": "school",
        "sentAt": "2026-07-08T12:00:00.000Z"
      },
      "unread": {
        "count": 1
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

Platform inbox response notes:

- School and organization ids are allowed on Platform Admin responses as safe operational identifiers.
- `lastMessage.preview` must be truncated and must mask hidden/deleted content.
- `senderKind` should be `school`, `support`, or `system`.
- `unread.count` is per current platform actor in 1A.

## `GET /api/v1/platform-admin/support/conversations/:conversationId`

Response:

```json
{
  "conversation": {
    "id": "uuid",
    "type": "support",
    "status": "active",
    "lastMessageAt": "2026-07-08T12:00:00.000Z",
    "createdAt": "2026-07-08T11:00:00.000Z"
  },
  "school": {
    "id": "uuid",
    "name": "Example School",
    "status": "active"
  },
  "organization": {
    "id": "uuid",
    "name": "Example Organization"
  },
  "unread": {
    "count": 1,
    "lastReadAt": null
  }
}
```

## `GET /api/v1/platform-admin/support/conversations/:conversationId/messages`

Query parameters:

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `before` | ISO datetime | No | Return messages before this timestamp. |
| `after` | ISO datetime | No | Return messages after this timestamp. |
| `page` | number | No | Default `1`. |
| `limit` | number | No | Default `50`, max should be capped by implementation. |

Response:

```json
{
  "conversation": {
    "id": "uuid",
    "status": "active"
  },
  "school": {
    "id": "uuid",
    "name": "Example School"
  },
  "items": [
    {
      "id": "uuid",
      "conversationId": "uuid",
      "body": "شكرًا لتواصلكم، سنساعدكم في الإعداد.",
      "sender": {
        "kind": "support",
        "displayName": "Moazez Support"
      },
      "isMine": true,
      "sentAt": "2026-07-08T12:10:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1
  }
}
```

## `POST /api/v1/platform-admin/support/conversations/:conversationId/messages`

Request:

```json
{
  "body": "شكرًا لتواصلكم، سنساعدكم في الإعداد.",
  "clientMessageId": "operator-generated-id"
}
```

Request validation:

- `body` is required for V1 text replies.
- `clientMessageId` is optional but recommended for idempotency.
- The conversation must be `SUPPORT`, non-deleted, and active. Closed conversations return `409`.

Response:

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "body": "شكرًا لتواصلكم، سنساعدكم في الإعداد.",
  "sender": {
    "kind": "support",
    "displayName": "Moazez Support"
  },
  "isMine": true,
  "sentAt": "2026-07-08T12:10:00.000Z"
}
```

Implementation rule:

- The platform support actor may be inserted as a `CommunicationConversationParticipant`.
- This must not create school membership, school role assignment, or Settings Users visibility.

## `POST /api/v1/platform-admin/support/conversations/:conversationId/read`

Request:

```json
{
  "readAt": "2026-07-08T12:15:00.000Z"
}
```

Response:

```json
{
  "conversationId": "uuid",
  "readAt": "2026-07-08T12:15:00.000Z",
  "markedCount": 1
}
```

## `POST /api/v1/platform-admin/support/conversations/:conversationId/close`

Request:

```json
{
  "reason": "Resolved in chat"
}
```

Request notes:

- `reason` is optional.
- V1 should not implement internal notes or ticket disposition fields. If stored, use safe metadata/audit only.

Response:

```json
{
  "conversation": {
    "id": "uuid",
    "status": "closed",
    "closedAt": "2026-07-08T12:20:00.000Z"
  }
}
```

## `POST /api/v1/platform-admin/support/conversations/:conversationId/reopen`

Request:

```json
{
  "reason": "School followed up"
}
```

Request notes:

- `reason` is optional.

Response:

```json
{
  "conversation": {
    "id": "uuid",
    "status": "active",
    "reopenedAt": "2026-07-08T12:25:00.000Z"
  }
}
```

## Error Contract

Use existing error envelope conventions.

Expected status patterns:

| Condition | HTTP |
| --- | --- |
| Missing/invalid token | `401` |
| Missing required permission or invalid actor surface | `403` |
| Conversation not found, not support, deleted, or outside allowed scope | `404` |
| Closed/archived conversation blocks send under chosen rules | `409` |
| Invalid request body/query | `400` or `422` per existing validation conventions |
| Rate limit exceeded | `429` |

Suggested future support error codes:

- `school_support.conversation.not_found`
- `school_support.conversation.closed`
- `school_support.message.empty`
- `platform_support.conversation.not_found`
- `platform_support.conversation.closed`
- `platform_support.conversation.invalid_state`
- `platform_support.actor.invalid_type`
- `platform_support.message.empty`

These are registered in `ERROR_CATALOG.md` in 1A. DTO validation still uses the global `validation.failed` envelope for malformed body/query input.

## Realtime Contract

Expected V1:

- School clients load the support conversation through REST, then join the conversation room if the existing realtime client supports it.
- Use existing server event names where possible:
  - `communication.chat.message.created`
  - `communication.chat.message.updated`
  - `communication.chat.message.deleted`
  - `communication.chat.message.read`
  - `communication.notification.created`
- Platform clients may subscribe to opened support conversation rooms only after a platform-safe realtime access path exists.
- Platform inbox may rely on REST polling/refresh in V1.
- REST remains source of truth.
- No durable support-specific realtime replay is part of V1.

## Notification Contract

Expected V1:

- School message should make the support conversation visible/unread in Platform Admin support inbox.
- Platform reply should notify eligible school participant(s) through existing in-app notification center where implementation verifies support participants and notification generation.
- Push behavior must not be promised until verified for this support surface.
- Email/SMS support is out of scope.

## No-Leak Rules

School-side responses must not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- participant row ids
- raw platform user id
- platform admin email unless explicitly approved
- raw metadata
- `deletedAt`
- audit internals
- socket room ids
- storage internals
- object keys
- token hashes
- session internals

Platform-side responses may include:

- school display name
- organization display name
- school status
- conversation status
- last message preview
- unread count

Platform-side responses must not expose:

- `passwordHash`
- session data
- token material
- storage object keys
- raw audit internals
- private internal metadata
- provider secrets
- raw file objects

## Explicit Non-Goals

- No ticketing in V1.
- No SLA.
- No categories.
- No priority.
- No assigned support operators.
- No internal notes.
- No external email support.
- No bot/AI support.
- No platform billing engine.
- No finance, HR, wallet, or marketplace behavior.
- No platform admin reply through generic `/api/v1/communication/*` routes.
- No platform user school membership.
