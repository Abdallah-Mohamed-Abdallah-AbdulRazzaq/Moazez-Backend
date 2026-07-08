# School Support Chat Final Acceptance V1

## Feature Scope

School Support Chat V1 implements the School Dashboard Help conversation between a school-scoped admin user and Moazez Platform Support.

V1 remains intentionally narrow:

- One persistent `CommunicationConversationType.SUPPORT` conversation per school.
- Text-only support messages.
- REST source of truth for conversation, messages, read state, and inbox freshness.
- Best-effort realtime message/read events.
- In-app support notifications only.
- No push, email, SMS, attachments, ticketing, SLA, categories, priority, assignment, internal notes, or bot/AI support.

## Implemented Route Surface

School Dashboard:

- `GET /api/v1/school-support/conversation`
- `GET /api/v1/school-support/messages`
- `POST /api/v1/school-support/messages`
- `POST /api/v1/school-support/read`

Platform Admin:

- `GET /api/v1/platform-admin/support/conversations`
- `GET /api/v1/platform-admin/support/conversations/:conversationId`
- `GET /api/v1/platform-admin/support/conversations/:conversationId/messages`
- `POST /api/v1/platform-admin/support/conversations/:conversationId/messages`
- `POST /api/v1/platform-admin/support/conversations/:conversationId/read`
- `POST /api/v1/platform-admin/support/conversations/:conversationId/close`
- `POST /api/v1/platform-admin/support/conversations/:conversationId/reopen`

No support chat route is exposed through `/api/v1/communication/*`.

## Permissions

- `school.support.view`
- `school.support.send`
- `platform.support.view`
- `platform.support.reply`
- `platform.support.manage`

`school_admin` receives `school.support.view` and `school.support.send` through the non-platform school-level seed bundle. Teacher, Parent, Student, and Dismissal Staff explicit permission arrays do not include `school.support.*`.

`platform_super_admin` receives `platform.support.*` through the platform `ALL` seed bundle. The platform support controller uses `@PlatformScope()` and per-handler support permissions.

## Actor Boundaries

School Dashboard actors operate with an active school membership and school permissions resolved by the existing guards.

Platform Support actors operate as membershipless `UserType.PLATFORM_USER` callers. Platform support participant rows may be created in a support conversation, but this does not create a school membership and must not appear in Settings Users.

## Tenancy Posture

School routes derive `schoolId` and `organizationId` from request scope and reject client-supplied tenant override fields through DTO whitelist validation.

Platform support routes intentionally use platform-safe paths for cross-school support inbox reads and support conversation actions. Generic Communication routes remain school-scoped and cannot be used by Platform Admin to reply.

## No-Leak Posture

School REST and realtime payloads use support presenters and do not expose raw platform user ids, platform emails, participant ids, membership ids, role ids, raw metadata, audit internals, socket room names, storage internals, token material, or session internals.

Platform REST payloads expose only safe operational school/organization summaries, conversation status, last message preview, and unread counts.

Support notification realtime payloads use the existing app notification presenter. Support notification records use `actorUserId = null` and `sourceType = school_support_message`.

## Realtime Behavior

- Message-created publishes `communication.chat.message.created`.
- Read-state publishes `communication.chat.message.read`.
- In-app notification creation publishes `communication.notification.created`.
- Realtime publishing is best-effort and does not roll back REST mutations.
- Platform-safe socket room join remains deferred.
- No durable realtime replay exists in V1.

## Notification Behavior

- Platform replies create in-app notifications for active school support participants.
- School messages create in-app notifications for existing platform support participants only.
- Senders are excluded.
- Non-participants and unrelated schools are excluded.
- Notification generation failure is best-effort and does not roll back message creation.
- Push, email, and SMS are not attempted for support chat V1.

## Unread Behavior

- School unread increases after platform replies and resets after school read.
- Platform unread increases after school messages and resets only for the platform actor who marks read.
- A second platform admin's unread state remains independent.
- A platform actor with no participant/read row still sees school-authored messages as unread in the REST inbox.
- `clientMessageId` replay does not duplicate messages, realtime events, notifications, or unread side effects.

## Push Status

Deferred. V1 creates only in-app notification delivery records and does not enqueue support push delivery.

## Known Deferred Items

- Platform-safe socket room join.
- Support push delivery.
- Ticketing, categories, priority, assignment, SLA, internal notes, ticket numbers, and multi-ticket history.
- Attachments.
- External email/SMS support.
- Bot/AI support.
- Database-level uniqueness for one active support conversation per school.

## Known Pre-Existing Communication Regression

The broad `test/security/tenancy.communication.spec.ts` suite has a documented pre-existing failure pattern from baseline `210cc9bf`: `8 failed, 60 passed`.

This failure is outside the School Support Chat route surface unless its count or categories change.

## Frontend Integration Notes

- School Dashboard uses `/api/v1/school-support/*`.
- Platform Admin uses `/api/v1/platform-admin/support/*`.
- REST is source of truth.
- School clients may listen to message/read realtime events after loading the conversation.
- Platform Admin should use REST polling/refresh until platform-safe socket room join is implemented.
- Push is not available for this support surface in V1.
- School UI should display platform replies as `Moazez Support`; raw operator identity is intentionally not exposed.

## Final Acceptance Checklist

| Area | Status | Evidence |
| --- | --- | --- |
| Architecture | PASS | Existing Communication tables and SUPPORT conversation type reused. |
| REST route surface | PASS | Focused e2e route-surface assertion covers exact support routes. |
| Permissions | PASS | Support controller metadata and system role seed coverage verified. |
| School actor access | PASS | School admin positive path covered. |
| Platform actor access | PASS | Platform support positive path covered. |
| Default role denial | PASS | Teacher, Parent, Student, and Dismissal Staff denied by default. |
| Cross-school isolation | PASS | School B cannot read School A support messages. |
| Platform membership boundary | PASS | Platform participant row does not create school membership or Settings Users visibility. |
| Generic communication separation | PASS | Platform reply through generic `/communication` route is denied. |
| No-leak REST | PASS | Focused no-leak assertions cover school and platform payloads. |
| No-leak realtime | PASS | Message/read realtime payloads use support-safe presenters and leak checks. |
| No-leak notifications | PASS | Notification realtime payloads exclude raw ids and metadata. |
| Unread | PASS | School unread and per-platform-user unread are covered. |
| Idempotency | PASS | `clientMessageId` replay returns existing message without duplicate side effects. |
| Closed conversation behavior | PASS | Closed sends/replies return `409` and produce no side effects. |
| Realtime | PASS | Best-effort message/read events covered. |
| In-app notifications | PASS | Recipient targeting, sender exclusion, and best-effort failure covered. |
| Push | DEFERRED | No support push attempts are made. |
| Frontend integration readiness | PASS | REST contracts and realtime caveats are documented. |
| Known pre-existing regressions | KNOWN PRE-EXISTING | Broad Communication tenancy suite has unchanged documented failure pattern if rerun. |
| Known deferred items | DEFERRED | Platform socket join, push, ticketing, and extended support workflow remain future work. |

## Final Verdict

READY FOR REVIEW.
