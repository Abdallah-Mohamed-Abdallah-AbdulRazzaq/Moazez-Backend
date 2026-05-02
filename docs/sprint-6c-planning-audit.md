# Sprint 6C Planning Audit

## Current State After Sprint 6B

Sprint 6B Communication Core Chat is implemented as a school-scoped core Communication module. The latest confirmed closeout state is commit `8811dea docs: update project structure after sprint 6b`.

The runtime Communication APIs are wired through `CommunicationModule` and currently cover:

- policies and admin overview
- conversations, participants, invites, and join requests
- messages, read receipts, and read summary
- reactions and message attachments
- reports, moderation actions, user blocks, and user restrictions

The module follows the existing modular monolith conventions:

- Controllers stay thin and delegate to use-cases/services.
- Prisma access is in repositories, not controllers.
- Request scope comes from `RequestContext` and `requireCommunicationScope`.
- Authorization uses the global guard chain: JWT, scope, and permissions.
- Routes rely on the framework-level `/api/v1` global prefix.
- Communication tenant models are registered in `school-scope.extension.ts`.

Existing Communication Prisma enums and models include:

- `CommunicationPolicy`
- `CommunicationConversation`
- `CommunicationConversationParticipant`
- `CommunicationConversationInvite`
- `CommunicationConversationJoinRequest`
- `CommunicationMessage`
- `CommunicationMessageRead`
- `CommunicationMessageDelivery`
- `CommunicationMessageReaction`
- `CommunicationMessageAttachment`
- `CommunicationMessageReport`
- `CommunicationModerationAction`
- `CommunicationUserBlock`
- `CommunicationUserRestriction`

Existing Communication permission catalog entries include:

- `communication.overview.view`
- `communication.policies.view`
- `communication.policies.manage`
- `communication.conversations.view`
- `communication.conversations.create`
- `communication.conversations.manage`
- `communication.conversations.moderate`
- `communication.participants.manage`
- `communication.messages.view`
- `communication.messages.send`
- `communication.messages.edit`
- `communication.messages.delete`
- `communication.messages.react`
- `communication.messages.attachments.manage`
- `communication.messages.moderate`
- `communication.messages.report`
- `communication.admin.view`
- `communication.admin.manage`
- `communication.platform.view`
- `communication.platform.manage`
- `communication.announcements.view`
- `communication.announcements.manage`

Sprint 6B closeout coverage exists in:

- `test/e2e/communication-core-chat.e2e-spec.ts`
- `test/security/tenancy.communication.spec.ts`
- `npm run test:e2e:sprint6b`
- `npm run verify:sprint6b`

Important limitations Sprint 6C must respect:

- Chat message creation currently supports text messages only.
- Existing tests intentionally reject unsupported announcement-like message payloads.
- Existing tests assert chat mutations do not create notification side effects.
- `CommunicationMessageDelivery` exists but is chat-specific and is not a general notification model.
- `CommunicationPolicy` already has realtime-adjacent flags such as `allowOnlinePresence`, `allowDeliveryReceipts`, and `allowReadReceipts`, but realtime delivery is not implemented.
- App-facing teacher, student, and parent message routes are not implemented in Sprint 6B and should remain deferred unless explicitly approved.
- Platform communication routes remain deferred despite catalog permissions existing for platform communication.

## Realtime Readiness

The repository has an empty realtime infrastructure directory:

- `src/infrastructure/realtime/.gitkeep`

No `RealtimeModule`, gateway, room helper, event helper, or Socket.io adapter exists yet.

The current dependency state is:

- `bullmq` exists.
- `ioredis` exists.
- Socket.io-facing Nest dependencies are not installed as direct project dependencies:
  - `@nestjs/websockets`
  - `@nestjs/platform-socket.io`
  - `socket.io`
  - `@socket.io/redis-adapter`

Queue infrastructure exists in:

- `src/infrastructure/queue/queue.module.ts`
- `src/infrastructure/queue/bullmq.service.ts`

`BullmqService` creates BullMQ queues and workers backed by `REDIS_URL`. This is a useful foundation for async notification generation, but no Sprint 6C workers exist yet.

Cache infrastructure is not implemented yet:

- `src/infrastructure/cache/.gitkeep`

There is no Redis cache abstraction for ephemeral presence, typing, socket membership, or short-lived realtime state.

Environment validation already requires `REDIS_URL`, which is enough for BullMQ and a future Redis-backed realtime/cache layer. No realtime-specific environment variables are currently validated.

Recommended gateway location:

- `src/infrastructure/realtime/realtime.module.ts`
- `src/infrastructure/realtime/realtime.gateway.ts`
- `src/infrastructure/realtime/realtime-auth.service.ts`
- `src/infrastructure/realtime/realtime-room-names.ts`
- `src/infrastructure/realtime/realtime-event-names.ts`
- `src/infrastructure/realtime/realtime-publisher.service.ts`

Recommended module wiring:

- Create `RealtimeModule` under infrastructure.
- Import it from `AppModule` after the gateway foundation exists.
- Avoid a hard circular dependency between `CommunicationModule` and `RealtimeModule`.
- Prefer an application port/provider token for publishing realtime events from Communication use-cases after persistence succeeds.

Recommended Socket auth pattern:

- HTTP guards do not automatically protect Socket.io handlers, so the gateway must perform explicit handshake auth.
- Accept the access token from `client.handshake.auth.token` or an `Authorization: Bearer` header.
- Verify the token through the existing auth/token infrastructure.
- Verify the session is still valid and not revoked.
- Load the user and active school membership with existing auth repository/service patterns.
- Attach actor, active membership, school id, and permission data to `client.data`.
- For every handler that touches tenant data, run inside `RequestContext` so Prisma `schoolScope` remains active.
- Apply permission checks equivalent to the HTTP `PermissionsGuard`.
- Reuse existing Communication application services/use-cases for business operations.

Recommended namespace and room naming:

- Namespace/path: `/api/v1/realtime`
- School room: `school:{schoolId}`
- Conversation room: `school:{schoolId}:conversation:{conversationId}`
- User room: `school:{schoolId}:user:{userId}`

Including `schoolId` in every room name reduces cross-school leak risk and keeps multi-school users explicit.

Recommended event naming:

- Use namespaced dotted event names.
- Server events:
  - `communication.chat.message.created`
  - `communication.chat.message.updated`
  - `communication.chat.message.deleted`
  - `communication.chat.message.read`
  - `communication.chat.reaction.upserted`
  - `communication.chat.reaction.deleted`
  - `communication.chat.attachment.linked`
  - `communication.chat.attachment.deleted`
  - `communication.presence.user.updated`
  - `communication.typing.started`
  - `communication.typing.stopped`
  - `communication.announcement.published`
  - `communication.notification.created`
  - `communication.notification.read`
- Client command events:
  - `communication.chat.message.send`
  - `communication.chat.conversation.read`
  - `communication.typing.start`
  - `communication.typing.stop`

Runtime business operations should still be executed by REST/use-cases first unless a socket command explicitly reuses the same application-layer use-case and permission checks.

## Announcements Readiness

Announcement runtime models are missing.

No Prisma model currently exists for:

- `Announcement`
- `AnnouncementAudience`
- `AnnouncementRead`
- `AnnouncementAttachment`

No migration currently creates announcement tables.

Announcement permissions do exist in the seed catalog:

- `communication.announcements.view`
- `communication.announcements.manage`

Role coverage needs review in the implementation task. The school and organization admin roles receive non-platform permissions through the existing seed grouping, but teacher, parent, and student app-facing consumption will need explicit policy decisions before those app roles can consume announcement data directly.

Recommended data model foundation:

- `Announcement`
  - `id`
  - `schoolId`
  - `title`
  - `description` or `body`
  - optional localized title/body fields only if aligned with existing localization conventions
  - `category`
  - `status`
  - `isPinned`
  - optional `pinnedUntil`
  - optional `actionLabel`
  - optional `actionUrl`
  - optional `imageFileId`
  - `publishedAt`
  - optional `scheduledAt`
  - optional `archivedAt`
  - `createdById`
  - `updatedById`
  - timestamps
- `AnnouncementAudience`
  - `id`
  - `schoolId`
  - `announcementId`
  - audience discriminator such as school, stage, grade, section, classroom, role, or user
  - normalized target columns where possible
  - timestamps
- `AnnouncementRead`
  - `id`
  - `schoolId`
  - `announcementId`
  - `userId`
  - `readAt`

Attachment and link support should stay minimal in V1:

- Use `imageFileId` when only one preview image is needed.
- Add dedicated announcement attachment support only if the dashboard/app contract requires multiple files.
- Keep file access aligned with the existing Files module and signed access rules.
- Do not store binary file data in announcement tables.

Required school-scope work for a future schema task:

- Register all tenant-scoped announcement models in `SCHOOL_SCOPED_MODELS`.
- Add tenancy/security tests for cross-school reads and guessed ids.
- Prefer not-found responses for inaccessible cross-school ids.

Required core/dashboard APIs for a future runtime task:

- `GET /api/v1/communication/announcements`
- `POST /api/v1/communication/announcements`
- `GET /api/v1/communication/announcements/:announcementId`
- `PATCH /api/v1/communication/announcements/:announcementId`
- `POST /api/v1/communication/announcements/:announcementId/publish`
- `POST /api/v1/communication/announcements/:announcementId/archive`
- `POST /api/v1/communication/announcements/:announcementId/read`
- `GET /api/v1/communication/announcements/:announcementId/read-summary`

Student, teacher, and parent app-facing announcement consumption should be planned as adapter/read-model work after the core APIs exist. The Student App handoff expects a custom response shape with `announcements`, `title`, `description`, `sender`, `date_label`, `category`, `is_pinned`, `is_new`, `action_label`, and `image`; that shape should be produced in presenters, not in the database schema.

## Notifications Readiness

General notification runtime models are missing.

Existing notification-related settings models are:

- `NotificationTemplate`
- `NotificationTemplateChannelState`

Existing notification-related enums are:

- `NotificationTemplateStatus`
- `NotificationChannel`

These models support configurable notification templates and channels, but they are not user notification inbox or delivery records.

No Prisma model currently exists for:

- `Notification`
- `NotificationDelivery`
- `NotificationPreference`
- `NotificationDevice`

No notification runtime module, controller, use-case, repository, queue worker, or delivery provider exists.

Notification permissions are missing. The permission catalog does not currently include entries such as:

- `communication.notifications.view`
- `communication.notifications.manage`
- `communication.notifications.read`

Recommended V1 notification model foundation:

- `Notification`
  - `id`
  - `schoolId`
  - `recipientUserId`
  - optional `actorUserId`
  - `type` or `eventKey`
  - `sourceModule`
  - `sourceType`
  - `sourceId`
  - `title`
  - `body`
  - optional `priority`
  - `status`
  - optional `readAt`
  - optional `dismissedAt`
  - optional `expiresAt`
  - optional `metadata`
  - timestamps
- `NotificationDelivery`
  - `id`
  - `schoolId`
  - `notificationId`
  - `channel`
  - `status`
  - optional `attemptedAt`
  - optional `deliveredAt`
  - optional `failedAt`
  - optional `failureReason`
  - optional `metadata`
  - timestamps

`NotificationPreference` and `NotificationDevice` should remain deferred unless V1 explicitly needs per-user channel preferences or device token management.

In-app notification center requirements:

- List notifications for the current actor within the active school.
- Support unread count.
- Mark one notification as read.
- Mark all current-school notifications as read.
- Avoid exposing notifications from another school for multi-school users.
- Emit realtime notification events only after notification persistence succeeds.

Queue/BullMQ integration plan:

- Use `BullmqService` to create a notification queue.
- Enqueue notification generation after committed source-of-truth actions, such as announcement publish or eligible chat events.
- Workers should create `Notification` and `NotificationDelivery` rows.
- Use idempotency keys or uniqueness constraints based on source event, recipient, and channel.
- Emit realtime events to user rooms after the in-app notification row exists.

Deferred notification delivery integrations:

- push providers
- SMS providers
- email provider delivery
- provider-specific device token lifecycle
- provider-specific delivery receipts
- complex user notification preferences

## Source-Of-Truth Rules

Sprint 6C should use these rules consistently:

- REST endpoints, application use-cases, and PostgreSQL remain the source of truth.
- Socket.io is a delivery layer only.
- Redis presence and typing state is ephemeral and must not be treated as canonical data.
- Queue workers handle async notification generation and delivery work.
- No realtime event may bypass guards, permission checks, policy checks, or tenant scope.
- Realtime handlers must reuse existing application-layer services/use-cases or explicit application ports.
- Gateway handlers must not duplicate Communication business logic.
- Gateway handlers must not use Prisma directly.
- Realtime events should be emitted only after successful persistence or successful application-layer state transition.
- App-facing teacher, student, and parent APIs should remain composition/read-model APIs and should not become the core source of truth.

## Architecture Decisions For Sprint 6C

1. Create the realtime foundation before adding feature events.

   The repository does not currently have Socket.io dependencies or a gateway module. The first implementation task should establish auth, request context, room naming, event naming, and module boundaries.

2. Keep Communication REST/use-cases canonical.

   Chat send, read, reaction, attachment, report, moderation, and block/restriction behavior already exists and is tested. Realtime should publish state changes from those flows instead of replacing them.

3. Build presence and typing on Redis as ephemeral state.

   Presence and typing should use TTL-backed Redis keys. PostgreSQL should not store live typing state.

4. Add announcement schema before announcement runtime.

   Announcement models are missing, so the runtime API task depends on a migration, seed updates, school-scope registration, and tenancy tests.

5. Add notification persistence before notification generation.

   Existing template settings are not enough for an in-app notification center. `Notification` and `NotificationDelivery` should be added before any queue worker starts producing notification rows.

6. Defer external providers.

   V1 should deliver in-app notifications and realtime events first. Push, SMS, and email provider integrations should remain outside Sprint 6C unless explicitly approved.

## Proposed Task Breakdown

### Task 2: Realtime Infrastructure Foundation

Objective:

- Establish the Socket.io infrastructure foundation without implementing feature-specific realtime behavior.

In scope:

- Add approved Socket.io/Nest websocket dependencies.
- Create `RealtimeModule`.
- Create the gateway skeleton under `src/infrastructure/realtime`.
- Add socket handshake authentication.
- Add request-context setup for socket handlers.
- Add room and event naming helpers.
- Join authenticated sockets to school and user rooms.

Out of scope:

- Chat realtime events.
- Presence and typing.
- Announcements.
- Notifications.
- Queue workers.

Expected files to inspect:

- `package.json`
- `src/app.module.ts`
- `src/main.ts`
- `src/modules/auth/**`
- `src/common/context/**`
- `src/common/guards/**`
- `src/infrastructure/realtime/**`
- `src/infrastructure/cache/**`
- `src/infrastructure/queue/**`
- `src/config/env.validation.ts`

Expected files to modify:

- `package.json`
- lockfile
- `src/app.module.ts`
- `src/infrastructure/realtime/**`
- possibly `src/infrastructure/cache/**` if a shared Redis cache abstraction is introduced

Testing requirements:

- Unit tests for socket auth/context helpers.
- Build verification.
- Existing Sprint 6B e2e/security verification remains green.

Verification commands:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- `npm run verify:sprint6b`

Risks:

- Websocket handlers bypassing HTTP guard assumptions.
- Missing `RequestContext` causing school-scope failures.
- Circular module dependencies between realtime and communication.

Mitigations:

- Centralize socket auth and permission checks.
- Wrap handlers in request context.
- Use an application publishing port instead of importing gateways into domain modules.

### Task 3: Chat Realtime Events

Objective:

- Publish realtime events for existing chat state changes after source-of-truth operations succeed.

In scope:

- Message created, updated, deleted events.
- Conversation read/read-summary updates.
- Reaction upsert/delete events.
- Attachment linked/deleted events.
- Optional conversation status events for close/reopen/archive.
- Realtime publisher service or application port.

Out of scope:

- Changing REST response contracts.
- New app-facing message APIs.
- Notification generation.
- Presence and typing.

Expected files to inspect:

- `src/modules/communication/communication.module.ts`
- `src/modules/communication/**/message*`
- `src/modules/communication/**/conversation*`
- `src/modules/communication/**/reaction*`
- `src/modules/communication/**/attachment*`
- `src/infrastructure/realtime/**`
- `test/e2e/communication-core-chat.e2e-spec.ts`
- `test/security/tenancy.communication.spec.ts`

Expected files to modify:

- `src/infrastructure/realtime/**`
- selected Communication application/use-case files only where needed to publish events after persistence
- focused realtime tests

Testing requirements:

- Tests proving events are emitted only after authorized, scoped, successful operations.
- Regression verification for Sprint 6B chat behavior.

Verification commands:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- `npm run verify:sprint6b`

Risks:

- Event payloads leaking cross-school or private participant data.
- Publishing before transaction completion.
- Adding hidden side effects that break closeout tests.

Mitigations:

- Publish presenter-shaped minimal payloads.
- Emit after repository/use-case success.
- Keep existing REST behavior unchanged.

### Task 4: Presence + Typing

Objective:

- Add Redis-backed ephemeral online presence and typing indicators.

In scope:

- Presence state on connect, disconnect, and heartbeat.
- Typing start/stop events.
- TTL-backed Redis keys.
- Honor `CommunicationPolicy.allowOnlinePresence`.
- Emit updates to school, conversation, or user rooms as appropriate.

Out of scope:

- Persisted presence history.
- Analytics.
- App-facing presence REST APIs.
- Push/email/SMS notifications.

Expected files to inspect:

- `src/modules/communication/**/policy*`
- `src/infrastructure/realtime/**`
- `src/infrastructure/cache/**`
- `src/config/env.validation.ts`

Expected files to modify:

- `src/infrastructure/cache/**`
- `src/infrastructure/realtime/**`
- focused tests

Testing requirements:

- Unit tests for key naming and TTL behavior.
- Gateway/service tests for typing permission and room emission behavior.
- Sprint 6B regression verification.

Verification commands:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- `npm run verify:sprint6b`

Risks:

- Stale presence after disconnects.
- Typing events leaking conversation membership.
- Policy flags ignored.

Mitigations:

- Use short TTLs and heartbeat refresh.
- Verify participant membership before conversation typing events.
- Gate online presence with policy state.

### Task 5: Announcements Data Model Foundation

Objective:

- Add normalized, school-scoped announcement persistence.

In scope:

- Add announcement Prisma models and enums.
- Create migration.
- Register announcement models in school scope.
- Update permission and role seeds as needed.
- Add model-level tenancy/security coverage.

Out of scope:

- Announcement runtime endpoints.
- Realtime announcement events.
- Notification generation.
- App-facing announcement routes.

Expected files to inspect:

- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `src/infrastructure/database/school-scope.extension.ts`
- `src/modules/files/**`
- `adr/Student-App/student_ANNOUNCEMENTS_BACKEND_MODEL.md`

Expected files to modify:

- `prisma/schema.prisma`
- new migration under `prisma/migrations/**`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `src/infrastructure/database/school-scope.extension.ts`
- focused tests

Testing requirements:

- Prisma validation.
- Migration application in test database.
- School-scope and permission tests for announcement data.

Verification commands:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- `npm run verify:sprint6b`

Risks:

- Over-flexible audience targeting becoming JSON-based and hard to secure.
- File attachment behavior bypassing Files module rules.

Mitigations:

- Keep audiences normalized.
- Use existing file records and signed access patterns.

### Task 6: Announcements Runtime APIs

Objective:

- Implement core/dashboard announcement APIs on top of the announcement data model.

In scope:

- DTOs, presenters, controllers, use-cases, repositories.
- Create, list, detail, update, publish, archive, mark-read, and read-summary APIs.
- Permission checks for view/manage.
- Audit logging for sensitive mutations.
- School-scoped filtering and guessed-id protection.

Out of scope:

- Student, teacher, and parent app-facing adapter routes unless explicitly approved.
- External notification delivery.
- Advanced scheduling beyond basic persisted fields unless explicitly approved.

Expected files to inspect:

- `src/modules/communication/**`
- `src/common/guards/**`
- `src/common/context/**`
- `src/infrastructure/database/**`
- `src/infrastructure/audit/**`
- `adr/Student-App/student_ANNOUNCEMENTS_BACKEND_MODEL.md`

Expected files to modify:

- `src/modules/communication/**/announcements/**`
- `src/modules/communication/communication.module.ts`
- DTO/presenter/use-case/repository files
- e2e and security tests for announcements

Testing requirements:

- E2E tests for happy path and authorization.
- Security tests for cross-school access and guessed ids.
- Regression verification for Sprint 6B chat.

Verification commands:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- `npm run verify:sprint6b`

Risks:

- Mixing dashboard/core contracts with app-facing response shapes.
- Exposing announcement audiences across schools.

Mitigations:

- Keep core response DTOs explicit.
- Add later app presenters without changing canonical storage.

### Task 7: Notifications Data Model/Foundation

Objective:

- Add normalized in-app notification persistence and permissions.

In scope:

- Add `Notification` and `NotificationDelivery` models.
- Add notification enums.
- Register notification models in school scope.
- Add notification permissions.
- Decide whether V1 needs preferences; defer if not necessary.

Out of scope:

- Queue workers.
- Push, SMS, and email providers.
- Device token management.
- Complex notification preference UI.

Expected files to inspect:

- `prisma/schema.prisma`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `src/infrastructure/database/school-scope.extension.ts`
- `src/infrastructure/queue/**`
- settings notification template models in Prisma

Expected files to modify:

- `prisma/schema.prisma`
- new migration under `prisma/migrations/**`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `src/infrastructure/database/school-scope.extension.ts`
- focused tests

Testing requirements:

- Prisma validation.
- Migration application in test database.
- School-scope tests for notification rows.

Verification commands:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- `npm run verify:sprint6b`

Risks:

- Confusing settings notification templates with user notification inbox records.
- Treating chat message deliveries as general notifications.

Mitigations:

- Keep model names and module boundaries explicit.
- Do not reuse `CommunicationMessageDelivery` for notification center records.

### Task 8: Notification Generation / Queue Integration

Objective:

- Generate in-app notifications asynchronously from approved source events.

In scope:

- Notification queue constants and worker registration.
- Enqueue notification generation after announcement publish and approved chat events.
- Create `Notification` and `NotificationDelivery` rows.
- Emit realtime notification events after persistence.
- Add unread count use-case.
- Add idempotency for source event, recipient, and channel.

Out of scope:

- Push providers.
- SMS providers.
- Email delivery integrations.
- Provider-specific device tokens.

Expected files to inspect:

- `src/infrastructure/queue/**`
- `src/infrastructure/realtime/**`
- `src/modules/communication/**`
- notification models from Task 7
- announcement APIs from Task 6

Expected files to modify:

- notification application/repository/service files
- queue worker files
- selected Communication use-cases for enqueue calls through an application port
- realtime publisher integration
- focused tests

Testing requirements:

- Unit tests for worker idempotency and failure handling.
- Tests proving notifications are school-scoped.
- Tests proving notification realtime events emit only after persistence.

Verification commands:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- `npm run verify:sprint6b`

Risks:

- Jobs created without matching committed source rows.
- Duplicate notifications on retry.
- Worker errors hiding source operation success.

Mitigations:

- Use idempotency constraints.
- Keep source operations independent from async delivery failure.
- Log and surface worker failures through queue observability.

### Task 9: Sprint 6C Closeout

Objective:

- Close Sprint 6C with documentation, verification, and regression proof.

In scope:

- Add Sprint 6C closeout tests and verifier if approved.
- Update project structure documentation.
- Update sprint docs and runbook notes.
- Run full build, unit, security, Sprint 6B, and Sprint 6C verification.

Out of scope:

- New feature expansion beyond accepted Sprint 6C scope.
- Platform communication routes.
- App-facing teacher, student, and parent route implementation unless explicitly approved.

Expected files to inspect:

- `package.json`
- `README.md`
- `Moazez-Project-Structure.json`
- `test/**`
- Sprint 6C implementation files

Expected files to modify:

- closeout docs
- `Moazez-Project-Structure.json`
- tests and package scripts only if explicitly approved for closeout

Testing requirements:

- Dedicated Sprint 6C closeout verification.
- Existing `verify:sprint6b` remains green.
- Security tests remain green.

Verification commands:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- `npm run verify:sprint6b`
- future `npm run verify:sprint6c` if added during closeout

Risks:

- Closeout churn masking behavior changes.
- Long verification time causing skipped checks.

Mitigations:

- Keep closeout changes focused.
- Preserve Sprint 6B verifier throughout Sprint 6C.

## Risks And Mitigations

- Risk: Socket.io auth bypasses HTTP guard assumptions.
  - Mitigation: centralize handshake auth, session validation, permissions, and request context setup.

- Risk: Realtime event payloads leak cross-school data.
  - Mitigation: include `schoolId` in room names, verify membership before joins, and publish only scoped presenter payloads.

- Risk: Redis state is treated as canonical.
  - Mitigation: document and enforce Redis as ephemeral presence/typing state only.

- Risk: Announcement audiences become unbounded JSON logic.
  - Mitigation: use normalized audience rows and explicit target types.

- Risk: Notification models duplicate settings templates or chat deliveries.
  - Mitigation: keep settings templates, chat deliveries, and user notification inbox records separate.

- Risk: Queue retries create duplicate notifications.
  - Mitigation: add idempotency keys or uniqueness constraints by source event, recipient, and channel.

- Risk: App-facing contracts pressure the core schema into frontend-specific shapes.
  - Mitigation: keep normalized storage and build app-specific shapes in presenters/adapters.

## Explicit Deferred Items

- Platform communication routes.
- Teacher, student, and parent app-facing communication APIs.
- External push provider integration.
- SMS provider integration.
- Email delivery provider integration.
- Provider-specific device token management.
- Advanced notification preferences.
- Advanced announcement analytics.
- Advanced scheduling workflows.
- Platform billing, finance, HR, wallet, marketplace, advanced smart pickup, and advanced analytics builder.

## Recommended Next Task

The recommended immediate next task is **Sprint 6C Task 2: Realtime Infrastructure Foundation**.

Task 2 should add the approved Socket.io foundation, create the `RealtimeModule`, implement socket authentication and request context bridging, define room/event naming helpers, and wire the module without adding chat, presence, announcements, notifications, or workers yet.

## Verification Recommendation

For this planning audit, the required verification is:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- `npm run verify:sprint6b`

For every Sprint 6C implementation task, keep `verify:sprint6b` green and add focused Sprint 6C tests only when runtime behavior is introduced.
