# School Support Chat Architecture V1

## Purpose

Design the V1 backend architecture for a School Dashboard Help page support chat between a school-scoped user and Moazez Platform Support.

The initial `SCHOOL-SUPPORT-CHAT-0A` sprint was documentation-only. `SCHOOL-SUPPORT-CHAT-1A` implements the core REST and IAM wrapper described here without Prisma schema or migration changes.

## 1A Implementation Status

Implemented in `SCHOOL-SUPPORT-CHAT-1A`:

- `src/modules/school-support/**` module with school and platform support controllers.
- School Dashboard routes under `/api/v1/school-support/*`.
- Platform Admin routes under `/api/v1/platform-admin/support/*`.
- Five support permissions in the permission seed.
- One persistent `CommunicationConversationType.SUPPORT` conversation per school, enforced in application code.
- Text-only support messages.
- Per-current-user unread semantics using `CommunicationMessageRead` and participant `lastReadAt`.
- Platform support participant rows for opened/replied support conversations without creating school memberships.
- Closed conversations reject school sends and platform replies with `409`.
- Focused e2e/security coverage for route surface, IAM, tenancy, no-leak payloads, generic `/communication` separation, and platform membership boundaries.

Not implemented in 1A:

- Support-specific realtime room access.
- Support-specific push notification delivery.
- Ticketing, assignment, SLA, categories, internal notes, email, or bot/AI support.

## 1B Implementation Status

Implemented in `SCHOOL-SUPPORT-CHAT-1B`:

- Best-effort support message-created realtime events using `communication.chat.message.created`.
- Best-effort support read realtime events using `communication.chat.message.read`.
- Support realtime payloads use support-specific presenters and do not expose raw platform user ids, participant ids, memberships, metadata, room names, or storage internals.
- Support side effects run after the REST mutation commits; realtime or notification failures are logged and do not roll back message/read persistence.
- In-app `CommunicationNotification` records are created for eligible active support conversation participants only.
- Platform reply notifications target school support participants, exclude the sender, and store `actorUserId = null` to avoid exposing raw platform user ids through generic notification presenters.
- School message notifications target existing platform support participants only. If no platform actor has opened/read/replied to the conversation yet, no platform notification row is created; Platform Admin inbox REST unread remains the source of truth.
- Notification delivery is limited to `IN_APP`; support push delivery is not implemented in 1B.
- Platform inbox unread remains per platform user. If a platform actor has no participant/read row, school-authored support messages count as unread for that actor.

## Product Scope

V1 product behavior:

- A school admin opens the Help page in the School Dashboard.
- The school can start or continue a support conversation with Moazez Support.
- Platform Admin users can view a cross-school support inbox.
- Platform Admin users can open a school support conversation and reply.
- The school sees the reply in the same Help page.

V1 scope discipline:

- Use one persistent support conversation per school.
- Use existing Communication persistence and message/read/notification infrastructure.
- Do not implement full ticketing in V1.
- Do not implement categories, priorities, assignment, SLA, internal notes, ticket numbers, external email support, bot/AI support, or multi-ticket history in V1.

## Actors

School Dashboard actor:

- `UserType.SCHOOL_USER` or another explicitly permitted school-scoped user with `school.support.*` permissions.
- Operates inside an active school membership.
- Resolves `organizationId`, `schoolId`, `membershipId`, `roleId`, and school permissions through the existing scope guards.

Platform Support actor:

- `UserType.PLATFORM_USER` with `platform_super_admin` permissions.
- Operates without school membership.
- Uses platform scope only.
- Must not be made a school member to support this feature.

## Current Backend Assets Reused

The current Communication module already includes:

- Communication conversations.
- Communication participants.
- Communication messages.
- Message reads.
- Message deliveries.
- Message attachments.
- Notifications.
- Realtime events.
- Moderation, reporting, restrictions, and blocking infrastructure.

`CommunicationModule` exports reusable application services/use cases that can be composed by future support-specific wrappers:

- `CreateOrReuseCommunicationDirectConversationUseCase`
- `CreateCommunicationMessageUseCase`
- `MarkCommunicationConversationReadUseCase`
- `CommunicationAppNotificationCenterService`
- `CommunicationNotificationCommandService`
- `CommunicationNotificationPreferenceService`
- `CommunicationNotificationPushQueueService`

The Prisma schema already has the required storage primitives:

- `CommunicationConversationType.SUPPORT`
- `CommunicationConversation`
- `CommunicationConversationParticipant`
- `CommunicationMessage`
- `CommunicationMessageRead`
- `CommunicationMessageDelivery`
- `CommunicationMessageAttachment`
- `CommunicationNotification`

The current realtime layer already provides:

- Conversation rooms named from `schoolId` and `conversationId`.
- Existing chat event names such as `communication.chat.message.created`, `communication.chat.message.read`, and attachment/reaction events.
- Existing notification realtime event `communication.notification.created`.

The current notification generation path already creates message notifications for eligible non-sender active participants in active conversations. That can help the school side when platform replies are represented as messages from a participant, but platform-support-specific inbox notification behavior still needs implementation verification before claiming push behavior.

## Current Backend Limitations

`requireCommunicationScope()` currently requires:

- an authenticated actor
- an active membership with `schoolId`
- active school context

`UserType.PLATFORM_USER` / `platform_super_admin` does not have a school membership in the intended Platform Admin posture.

Therefore, generic `/api/v1/communication/*` routes cannot be used directly by Platform Admin for support inbox or platform replies. They will fail scope requirements or would require weakening a global tenancy rule, which is not acceptable.

Current Platform Admin lives under:

- `/api/v1/platform-admin/*`

and uses:

- `@PlatformScope()`
- explicit `@RequiredPermissions(...)`
- `platformBypassScope(...)` in platform repositories where cross-school access is intentional

Support chat must preserve that separation.

## Why Support-Specific Wrapper Is Required

Generic Communication endpoints are school-scoped by design:

- Controllers require `communication.*` permissions.
- Use cases call `requireCommunicationScope()`.
- Repositories use the scoped Prisma client, which injects current-school tenancy.
- Participant access is evaluated within the current school.

Platform Admin support inbox/reply cannot safely call those generic endpoints because:

- Platform users do not have active school membership.
- Platform users should not receive school roles or memberships.
- Platform queries must load explicit `schoolId` / `conversationId` under platform scope.
- Cross-school inbox listing must intentionally bypass school scope through reviewed platform-safe repository methods.

Recommended V1 decision:

- Keep Communication tables as the source of truth.
- Add support-specific wrapper APIs for the School Dashboard Help surface and Platform Admin Support Inbox surface.
- School-side wrapper can compose school-scoped Communication logic where safe.
- Platform-side wrapper must use platform-safe use cases/repositories that explicitly load and verify support conversations by `conversationId`, `schoolId`, and `type = SUPPORT`.

## Recommended Module Structure

Recommended implementation sprint structure:

- `src/modules/school-support/`
  - School Dashboard Help surface.
  - School-scoped controller under `school-support`.
  - Application use cases that resolve the current school from `RequestContext`.
  - Presenters that return the narrow School Dashboard response shape.
  - No direct Prisma in controllers.

- `src/modules/platform-admin/support/` or a support sub-area inside `src/modules/platform-admin/`
  - Platform Admin support inbox surface under `platform-admin/support`.
  - Platform-scoped controller methods decorated with `@PlatformScope()`.
  - Use cases requiring platform support permissions.
  - Platform-safe repository methods wrapped in `platformBypassScope(...)`.
  - Presenters that return safe cross-school inbox cards and message details.

- Reusable support composition services can live under the support module/application layer and may delegate to Communication repositories/services where their tenancy assumptions match the actor surface.

Do not put business logic in controllers. Do not use Prisma in controllers. Keep all response shaping in presenters.

Actual 1A structure:

- `src/modules/school-support/controller/school-support.controller.ts`
- `src/modules/school-support/controller/platform-support.controller.ts`
- `src/modules/school-support/application/school-support.use-cases.ts`
- `src/modules/school-support/infrastructure/school-support.repository.ts`
- `src/modules/school-support/presenters/school-support.presenter.ts`
- `src/modules/school-support/dto/*.dto.ts`
- `src/modules/school-support/domain/*`

## Data Model Strategy

Use existing tables:

- `CommunicationConversation`
- `CommunicationConversationParticipant`
- `CommunicationMessage`
- `CommunicationMessageRead`
- `CommunicationMessageDelivery`
- `CommunicationMessageAttachment`
- `CommunicationNotification`

Use:

```text
CommunicationConversation.type = SUPPORT
CommunicationConversation.schoolId = target school
CommunicationConversation.metadata.supportConversation = true
CommunicationConversation.metadata.surface = "school_dashboard_help"
CommunicationConversation.metadata.version = 1
```

V1 default:

```text
One active SUPPORT conversation per school.
```

Recommended initial status:

- `ACTIVE` when created.
- `CLOSED` when Platform Support closes the support conversation.
- `ACTIVE` again when reopened.
- `ARCHIVED` should remain an administrative/lifecycle state, not the normal school help flow.

No schema migration is required for V1 unless the team chooses to enforce one-support-conversation-per-school uniqueness at the database level. Without a DB uniqueness constraint, implementation must enforce one active support conversation per school transactionally in the repository/use case.

## Platform Actor As Participant

Platform Admin may be inserted as a `CommunicationConversationParticipant` for the school support conversation so existing message/read/notification logic can identify a sender/recipient. This participant row must not create or imply school membership.

Rules:

- Platform user remains `UserType.PLATFORM_USER`.
- Platform user must not be shown in Settings Users.
- Platform user must not receive school role or membership.
- Participant row only grants access to the specific support conversation.
- Participant row must not be treated as a school user listing source.
- School-side presenters must not expose raw platform user id or platform admin email unless explicitly approved.

Implementation must verify that any participant-driven school user queries do not accidentally surface `PLATFORM_USER` participants in school settings or school user management.

## Conversation Lifecycle

School opens Help:

1. Resolve active school membership and `school.support.view`.
2. Find the school's existing non-deleted `SUPPORT` conversation with support metadata.
3. If none exists, create it with `type = SUPPORT`, `status = ACTIVE`, and required metadata.
4. Ensure the current school actor is an active participant.
5. Return safe conversation summary and actor-specific unread state.

School sends first or later message:

1. Resolve active school membership and `school.support.send`.
2. Get or create the support conversation for the active school.
3. Ensure the school actor is an active participant.
4. Persist a `CommunicationMessage` with `senderUserId = current actor`.
5. Update `lastMessageAt`.
6. Generate unread/read state and notifications where supported.

Platform opens inbox:

1. Resolve platform actor and `platform.support.view`.
2. Query support conversations across schools using platform-safe repository methods.
3. Filter only `type = SUPPORT` and support metadata.
4. Return safe school/organization summaries, conversation status, preview, and platform unread count.

Platform replies:

1. Resolve platform actor and `platform.support.reply`.
2. Load support conversation by `conversationId` using platform-safe repository methods.
3. Verify `type = SUPPORT`, non-deleted, and school exists.
4. Ensure platform actor participant row exists for that support conversation only.
5. Persist a `CommunicationMessage` with `senderUserId = platform actor`.
6. Update `lastMessageAt`.
7. Notify school participants where supported.

Platform close/reopen:

1. Resolve `platform.support.manage`.
2. Load support conversation by id under platform scope.
3. Transition `ACTIVE` to `CLOSED`, or `CLOSED`/`ARCHIVED` to `ACTIVE` only through explicit rules.
4. Audit the transition.

## School-Side Flow

School Help page routes:

- `GET /api/v1/school-support/conversation`
- `GET /api/v1/school-support/messages`
- `POST /api/v1/school-support/messages`
- `POST /api/v1/school-support/read`

School-side access:

- Requires authenticated actor.
- Requires active school membership.
- Requires `school.support.view` for read/read-marker routes.
- Requires `school.support.send` for sending messages.
- Does not accept `schoolId` from the client.
- Does not expose raw tenant or participant internals.

School-side response semantics:

- Always represents the conversation as "Moazez Support".
- Sender is presented as `school`, `support`, or equivalent safe display kind.
- `isMine` is computed against current actor.
- REST response is source of truth for messages and read state.

## Platform-Side Flow

Platform Admin support routes:

- `GET /api/v1/platform-admin/support/conversations`
- `GET /api/v1/platform-admin/support/conversations/:conversationId`
- `GET /api/v1/platform-admin/support/conversations/:conversationId/messages`
- `POST /api/v1/platform-admin/support/conversations/:conversationId/messages`
- `POST /api/v1/platform-admin/support/conversations/:conversationId/read`
- `POST /api/v1/platform-admin/support/conversations/:conversationId/close`
- `POST /api/v1/platform-admin/support/conversations/:conversationId/reopen`

Platform-side access:

- Requires `UserType.PLATFORM_USER`.
- Requires platform permissions.
- Uses `@PlatformScope()` and platform-safe use cases/repositories.
- Must load `schoolId` and `organizationId` from the conversation/school records, not from membership.
- Must verify every `conversationId` is a support conversation before returning or mutating it.

Platform-side response semantics:

- May include safe school and organization summaries.
- May include conversation status, last message preview, and unread count.
- Must not expose private user/auth/storage/audit internals.

## Permission Strategy

New permissions to add in the implementation sprint:

- `school.support.view`
- `school.support.send`
- `platform.support.view`
- `platform.support.reply`
- `platform.support.manage`

Intended role assignment:

- `school_admin` should receive `school.support.view` and `school.support.send`.
- `platform_super_admin` should receive `platform.support.view`, `platform.support.reply`, and `platform.support.manage`.
- Teacher, Parent, and Student should not receive `school.support.*` by default.
- Dismissal Staff should not receive `school.support.*` by default.

Implementation note:

- Current seed behavior grants `platform_super_admin` all permission codes through `ALL`.
- Current `school_admin` receives `SCHOOL_LEVEL = NON_PLATFORM`.
- `school.support.*` is seeded as non-platform, so `school_admin` receives it through `NON_PLATFORM` / `SCHOOL_LEVEL` after the seed is rerun.
- Teacher, Parent, Student, and Dismissal Staff use explicit permission arrays, so they should not receive `school.support.*` unless deliberately added.

Do not reuse generic `communication.*` permissions as the only support-chat permission model. Support chat is a distinct product surface and needs narrower, auditable permissions.

## Realtime Strategy

Expected V1 behavior:

- Use existing Communication realtime event names where possible.
- School clients subscribe to the support conversation room after loading the conversation.
- Platform clients may subscribe to support conversation rooms they open, or rely on polling/inbox refresh in V1.
- Realtime is best-effort.
- REST is source of truth.
- No durable support-specific replay in V1.

Current realtime constraints:

- Conversation rooms are named by `schoolId` and `conversationId`.
- Existing realtime access checks use scoped Prisma and current-school permissions.
- Platform support room join needs either a dedicated platform-safe realtime access path or a conservative V1 decision to use REST polling for the platform inbox and only use realtime after explicit room access is implemented.

Do not claim platform support realtime room access until implementation verifies the platform-safe join behavior.

1B runtime status:

- Support message-created and read events are published to the existing conversation room using support-safe payloads.
- School clients can subscribe after loading the support conversation through REST and joining the existing conversation room.
- Platform-safe socket room join is still not implemented. Platform Admin clients should continue to use REST inbox polling/refresh for V1, although opened platform participants may receive notification records and best-effort user-room notification events if the current realtime infrastructure can deliver them.
- REST remains the source of truth for conversation, messages, read state, and inbox freshness.
- No durable support-specific realtime replay is implemented.

## Notification Strategy

Expected V1 behavior:

- School message creates notification signal for platform support inbox if supported by existing notification infrastructure or a support-specific notification/read model.
- Platform reply creates notification for the school participant(s).
- If push is not completed for platform support in V1, in-app notifications and REST unread counts remain the source of truth.

Current Communication message notification generation can notify eligible active participants for active conversations. It should help with school-side notifications when platform replies are stored as messages and school actors are active participants.

Do not overclaim:

- Do not claim push delivery for platform support unless the implementation verifies platform participant device tokens/preferences and queue behavior.
- Do not claim email/SMS support.
- Do not claim a durable support-specific notification replay mechanism.

1B runtime status:

- Platform replies create in-app `MESSAGE_RECEIVED` notifications for active non-platform support participants in the same support conversation.
- School messages create in-app `MESSAGE_RECEIVED` notifications for active platform support participants already present in the same support conversation.
- Sender is excluded from notification recipients.
- Unrelated schools and non-participants are not notification recipients.
- Support notification records use `sourceModule = COMMUNICATION`, `sourceType = school_support_message`, and `type = MESSAGE_RECEIVED`.
- Support notification records intentionally set `actorUserId = null` so school notification readers do not receive raw platform user ids for support replies.
- Support notification delivery is `IN_APP` only in 1B.
- Push delivery, email, SMS, and notification replay are not implemented for support chat in 1B.

## Read / Unread Strategy

Reuse existing read primitives:

- `CommunicationMessageRead`
- `CommunicationConversationParticipant.lastReadMessageId`
- `CommunicationConversationParticipant.lastReadAt`

School-side unread:

- Count unread visible/listable support messages sent by other users.
- Exclude current actor's own messages.
- Return school-safe `unread.count` and `unread.lastReadAt`.

Platform-side unread:

- Count unread visible/listable support messages sent by school participants.
- Exclude platform actor's own messages.
- 1A uses per-platform-user unread semantics. Each Platform Admin actor marks only their own support inbox read state.
- 1B keeps the same per-platform-user model.
- If a platform actor has not yet opened/read/replied and therefore has no support participant/read row, school-authored messages still count as unread for that actor in the Platform Admin REST inbox.
- Marking read for one platform actor does not clear unread for another platform actor.

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

Platform-side responses may include safe school summary:

- school display name
- organization display name
- school status
- conversation status
- last message preview
- unread count

Platform-side responses must never expose:

- `passwordHash`
- session data
- token material
- storage object keys
- raw audit internals
- private internal metadata
- email provider secrets
- refresh token hashes
- raw file objects
- signed storage URLs unless a separate authorized file download contract explicitly returns one

Support message presenters must mask hidden/deleted bodies according to existing Communication presenter behavior.

## Audit Strategy

Audit sensitive support actions explicitly at the service/use-case layer:

- support conversation creation
- school support message creation
- platform support reply creation
- close support conversation
- reopen support conversation
- participant insertion for platform support actor, if implemented as a sensitive support action

Audit entries should include:

- actor id
- user type
- organization id where applicable
- school id
- module/action/resource type/resource id
- outcome
- safe before/after snapshots

Audit entries must not include:

- full message bodies when avoidable; use preview or `bodyPresent`
- token material
- session data
- storage object keys
- password hashes
- raw metadata containing private implementation internals

Suggested module/action names:

- `school_support.conversation.create`
- `school_support.message.create`
- `platform_support.message.reply`
- `platform_support.conversation.close`
- `platform_support.conversation.reopen`

## Testing Strategy

Implementation sprint tests should cover:

- School actor with `school.support.view` can get/create own support conversation.
- School actor with `school.support.send` can send support messages.
- School actor without `school.support.view` or `school.support.send` receives 403.
- Teacher, Parent, Student, and Dismissal Staff do not receive support access by default.
- School A cannot access School B support conversation or messages by guessed ids.
- School-side payloads do not expose `schoolId`, `organizationId`, membership/role ids, participant ids, raw metadata, storage keys, or platform admin email.
- Platform user with `platform.support.view` can list and read support conversations across schools.
- Platform user with `platform.support.reply` can reply.
- Platform user with `platform.support.manage` can close/reopen.
- Platform user without required support permissions receives 403.
- Non-platform actors cannot access `/api/v1/platform-admin/support/*`.
- Platform reply does not create a school membership.
- Platform participant row does not surface platform admin in Settings Users.
- Generic `/api/v1/communication/*` routes are not used for platform admin replies.
- Prisma `schoolScope` remains intact.
- Platform repository methods use `platformBypassScope(...)` only in `@PlatformScope()` paths.
- Notification and unread counts are correct for sender/non-sender.
- Realtime, if implemented for platform support, authorizes room join without weakening school-scoped realtime access for ordinary routes.

Docs-only sprint verification:

- `npx prisma validate`
- `npm run build`
- `git diff --check`

## Future V2 Scope

Future V2 ticketing can include:

- categories
- priority
- assignment
- SLA
- internal notes
- ticket numbers
- multi-ticket history
- multiple concurrent tickets per school
- support operator queues
- email ingestion/reply
- attachment lifecycle polish
- richer analytics

These are explicitly not part of V1 support chat.

## Rejected Alternatives

Rejected: build a separate support-chat schema from scratch.

- Reason: existing Communication tables already model conversations, participants, messages, reads, deliveries, attachments, notifications, and realtime behavior.
- Cost: duplicate chat infrastructure and higher tenancy/security risk.

Rejected: make `platform_super_admin` a school member.

- Reason: violates Platform Admin separation and would leak platform actors into school membership/user management semantics.
- Cost: pollutes Settings Users and weakens user type/membership boundaries.

Rejected: expose Platform Admin support replies through generic `/api/v1/communication` routes.

- Reason: generic Communication use cases require active school scope through `requireCommunicationScope()`.
- Cost: would require weakening core school-scope assumptions or creating unsafe fake memberships.

Rejected: implement full ticketing in V1.

- Reason: V1 product asks for one persistent Help conversation per school.
- Cost: expands scope into categories, priorities, assignment, SLA, internal notes, and ticket lifecycle.

Rejected: store frontend response shape in the database.

- Reason: project rules require normalized storage and presenter-layer response shaping.

## Open Decisions

- Should the one-support-conversation-per-school invariant be enforced only in application code for V1, or with a future DB uniqueness strategy?
- Should a future implementation enforce uniqueness with a database constraint or partial index?
- Should Platform Admin support realtime join be implemented in 1B, or should Platform Admin continue to use polling/inbox refresh?
- Should support messages add attachments in a later sprint after file authorization and presenter contracts are approved?
- Should support-specific push/in-app notification delivery be added in 1B or remain REST-unread only?

## Proposed Implementation Sequence

SCHOOL-SUPPORT-CHAT-1A - Core REST and IAM

- Add permission catalog entries.
- Assign roles deliberately.
- Add school support wrapper REST routes.
- Add platform support wrapper REST routes.
- Add platform-safe repositories/use cases.
- Add support presenters and no-leak tests.
- Reuse existing Communication tables.

1A status: implemented.

SCHOOL-SUPPORT-CHAT-1B - Realtime / Notifications / Unread Polish

- Verify and implement support-specific unread semantics.
- Verify notification generation for school participants and platform support inbox.
- Add platform-safe realtime room access if included in V1.
- Keep REST as source of truth.

1B status: implemented with support-safe message/read publish, in-app-only participant notifications, per-platform-user unread polish, and REST polling as Platform Admin inbox source of truth. Platform-safe socket room join and push delivery remain deferred.

SCHOOL-SUPPORT-CHAT-1C - Security and Final Acceptance

- Add focused security/e2e coverage.
- Verify no source leaks in school/platform payloads.
- Verify platform support does not create school membership.
- Verify generic `/communication` routes remain school-scoped.
- Produce final handoff/acceptance docs.
