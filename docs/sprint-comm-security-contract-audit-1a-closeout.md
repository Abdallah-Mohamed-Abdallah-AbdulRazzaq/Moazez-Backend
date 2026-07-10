# COMMUNICATION-SECURITY-CONTRACT-AUDIT-1A Closeout

## Status

- Branch: `fix/communication-security-contract`
- Required base HEAD: `4bb61977`
- Initial reproduction: 60 passed, 8 failed, 68 total
- Final broad result: 68 passed, 0 failed, 68 total
- Schema or migration change: none
- Permission or system-role seed change: none
- Final verdict: `READY FOR REVIEW`

`DIRECTORY_STRUCTURE.md`, named by the workspace reading order, is not present
in this checkout. The accepted architecture, security, module, sprint handoff,
seed, controller metadata, registered route, repository, and presenter evidence
below is sufficient to decide the Communication boundary without expanding
scope.

## Canonical evidence and decision

- `PROJECT_OVERVIEW.md`, **Operational Source of Truth**, identifies the School
  Dashboard as the operational source of truth for Communication and says the
  Teacher, Student, and Parent apps consume that core.
- `ARCHITECTURE_DECISION.md`, **Core Rules**, **Source of Truth Rule**, and
  **Authorization Rule**, separates domain truth from app composition and
  requires user type, role, membership, and scope authorization.
- `SECURITY_MODEL.md`, sections **1**, **3**, **4**, and **5**, requires actor,
  user type, membership/scope, permission, and resource ownership in order.
- `MODULES.md`, **Communication**, the three app module lists, and **Module
  Boundary Rule**, separates core Communication from app-facing composition.
- `V1_SCOPE.md`, **Communication** and the three app scopes, includes core chat,
  announcements, notifications, and app-specific message/announcement flows.
- `docs/sprint-28a-communication-gap-decision-lock.md`, sections **2**, **3**,
  and **5**, records that the core conversation list is current-school-wide and
  not participant-scoped, while app message lists are participant-scoped.
- `docs/sprint-28c-communication-conversation-list-enrichment-closeout.md`,
  **Core vs App-facing Decision**, calls the core list a school-scoped management
  surface and the three app routes actor-scoped inboxes.
- `docs/sprint-28f-communication-final-contract-handoff.md`, sections **3-5**,
  **Security / Tenancy Contract**, and **Frontend Integration Notes**, says app
  clients use app routes, core routes are for admin/core UI, core conversation
  mutation and participant management are management-only, core notifications
  expose core fields, and app notifications use a safe presenter.
- `docs/sprint-28o-track-a-final-integration-audit-handoff.md`, **Audit Notes**,
  **App Route Matrix**, **Core Communication Route Matrix**, and **Auth And
  Authorization Summary**, repeats that all core Communication families are
  management/core and all app clients use actor-scoped adapters.
- `docs/sprint-28m-teacher-app-announcements-closeout.md`, **Teacher
  Authorization Rules**, locks teacher announcement writes to owned records and
  allocated classrooms through `/teacher/announcements/**`, not core routes.
- `docs/sprint-29e-scheduled-announcement-publishing-replay-closeout.md`,
  **Admin/core authorization behavior**, makes replay admin/core-only.
- `docs/sprint-30d-push-delivery-worker-integration-closeout.md`, **Delivery and
  attempt behavior**, defines no-active-token push deliveries as `SKIPPED`.
- `docs/sprint-comm-push-1a-bullmq-jobid-fix-closeout.md`, **Exact job ID
  formats before/after**, proves BullMQ rejects colon-delimited custom IDs and
  locks the deterministic hyphenated announcement ID.
- `prisma/seeds/01-permissions.seed.ts`, the Communication catalog, separates
  view/send/read permissions from core manage/moderate/admin permissions.
- `prisma/seeds/02-system-roles.seed.ts`, `TEACHER_PERMISSIONS`,
  `PARENT_PERMISSIONS`, and `STUDENT_PERMISSIONS`, grants app view/send/read
  capabilities but intentionally omits core conversation management,
  participant management, and Teacher message edit/delete.

Decision: every registered core `/api/v1/communication/**` controller is
limited to authenticated `SCHOOL_USER` and scoped `ORGANIZATION_USER` actors.
Parent, Student, and Teacher behavior remains on their existing app adapters.
This is a user-type boundary in addition to the unchanged global permission and
school-scope checks; no permission or seed split is required.

## Guard design and trusted actor source

`CommunicationCoreAccessGuard` follows the accepted
`HomeworkCoreAccessGuard` pattern. It reads only the AsyncLocalStorage actor
written by `JwtAuthGuard`; it accepts no actor identity from headers, query,
route params, or request bodies. The allowlist is exactly `ORGANIZATION_USER`
and `SCHOOL_USER`.

Missing context, missing actor, and malformed actor ID use the canonical
`auth.token.invalid` 401 contract. Missing, unknown, or disallowed user type
uses canonical `auth.scope.missing` 403 with no policy details. The guard has no
database dependency and performs no mutation. It is a provider only in
`CommunicationModule`, is attached at controller class level, and is absent
from global `APP_GUARD` registration. Global order remains `JwtAuthGuard`,
`ScopeResolverGuard`, `PermissionsGuard`.

## Complete runtime route-family inventory

All routes below inherit global `JwtAuthGuard -> ScopeResolverGuard ->
PermissionsGuard` and the framework `/api/v1` prefix.

### Core/dashboard and policy/admin routes

Every row in this subsection is current-school scoped through the scoped Prisma
path, allows only `SCHOOL_USER`/scoped `ORGANIZATION_USER`, and has route-local
`CommunicationCoreAccessGuard`.

| Method and path | Controller | Required permission | Resource rule and response sensitivity |
| --- | --- | --- | --- |
| GET `/communication/policies` | `CommunicationPolicyController` | `communication.policies.view` | Current-school policy; sensitive operational controls. |
| PATCH `/communication/policies` | same | `communication.policies.manage` | Current-school mutation; audited policy state. |
| GET `/communication/admin/overview` | same | `communication.admin.view` | School-wide administration summary. |
| POST `/communication/admin/announcements/:announcementId/replay-notifications` | `CommunicationAdminController` | `communication.admin.view` + `communication.notifications.manage` | Current-school published/non-expired announcement; admin replay summary only. |
| GET `/communication/conversations` | `CommunicationConversationController` | `communication.conversations.view` | School-wide list; deliberately not participant-filtered; management-sensitive. |
| POST `/communication/conversations` | same | `communication.conversations.create` | Core create; creator becomes participant; audited. |
| GET `/communication/conversations/:conversationId` | same | `communication.conversations.view` | Current-school detail, not app ownership adapter. |
| PATCH `/communication/conversations/:conversationId` | same | `communication.conversations.manage` | Core metadata mutation; audited. |
| POST `/communication/conversations/:conversationId/archive` | same | `communication.conversations.manage` | Core lifecycle mutation; audited. |
| POST `/communication/conversations/:conversationId/close` | same | `communication.conversations.manage` | Core lifecycle mutation; audited. |
| POST `/communication/conversations/:conversationId/reopen` | same | `communication.conversations.manage` | Core lifecycle mutation; audited. |
| GET `/communication/conversations/:conversationId/messages` | `CommunicationMessageController` | `communication.messages.view` | Current-school conversation access rules; core message fields. |
| POST `/communication/conversations/:conversationId/messages` | same | `communication.messages.send` | Participant/policy send checks; core route; message notification side effects. |
| POST `/communication/conversations/:conversationId/read` | same | `communication.messages.view` | Participant/elevated access; actor read state. |
| GET `/communication/conversations/:conversationId/read-summary` | same | `communication.messages.view` | Participant/elevated access; aggregate read counts. |
| GET `/communication/messages/:messageId` | same | `communication.messages.view` | Participant/elevated current-school message detail. |
| GET `/communication/messages/:messageId/readers` | same | `communication.messages.view` | Participant/elevated safe reader cards. |
| GET `/communication/messages/:messageId/info` | same | `communication.messages.view` | Participant/elevated message/read summary. |
| PATCH `/communication/messages/:messageId` | same | `communication.messages.edit` | Sender/state/policy edit rules; audited core mutation. |
| DELETE `/communication/messages/:messageId` | same | `communication.messages.delete` | Sender/state/policy delete rules; audited core mutation. |
| POST `/communication/messages/:messageId/read` | same | `communication.messages.view` | Participant read ownership. |
| GET `/communication/messages/:messageId/reactions` | `CommunicationMessageInteractionsController` | `communication.messages.view` | Current-school message access; reaction identities. |
| PUT `/communication/messages/:messageId/reactions` | same | `communication.messages.react` | Participant/policy own reaction. |
| DELETE `/communication/messages/:messageId/reactions/me` | same | `communication.messages.react` | Participant/policy own reaction. |
| GET `/communication/messages/:messageId/attachments` | same | `communication.messages.view` | Message access; core attachment metadata. |
| POST `/communication/messages/:messageId/attachments` | same | `communication.messages.attachments.manage` | Message/file ownership and policy checks. |
| DELETE `/communication/messages/:messageId/attachments/:attachmentId` | same | `communication.messages.attachments.manage` | Matching message/attachment mutation. |
| GET `/communication/conversations/:conversationId/participants` | `CommunicationParticipantController` | `communication.conversations.view` | School-wide core participant graph; no actor-participant filter in list use case. |
| POST `/communication/conversations/:conversationId/participants` | same | `communication.participants.manage` | Policy/state/target-user checks; audited. |
| PATCH `/communication/conversations/:conversationId/participants/:participantId` | same | `communication.participants.manage` | Matching conversation participant; audited. |
| DELETE `/communication/conversations/:conversationId/participants/:participantId` | same | `communication.participants.manage` | Matching conversation participant; audited. |
| POST `/communication/conversations/:conversationId/leave` | same | `communication.conversations.view` | Current actor participant/state rule. |
| POST `/communication/conversations/:conversationId/participants/:participantId/promote` | same | `communication.participants.manage` | Owner/moderator lifecycle; audited. |
| POST `/communication/conversations/:conversationId/participants/:participantId/demote` | same | `communication.participants.manage` | Owner/moderator lifecycle; audited. |
| GET `/communication/conversations/:conversationId/invites` | same | `communication.participants.manage` | Core invitation graph; management-sensitive. |
| POST `/communication/conversations/:conversationId/invites` | same | `communication.participants.manage` | Current-school target and policy checks. |
| POST `/communication/conversation-invites/:inviteId/accept` | same | `communication.conversations.view` | Current trusted actor must own invite. |
| POST `/communication/conversation-invites/:inviteId/reject` | same | `communication.conversations.view` | Current trusted actor must own invite. |
| GET `/communication/conversations/:conversationId/join-requests` | same | `communication.participants.manage` | Core request graph; management-sensitive. |
| POST `/communication/conversations/:conversationId/join-requests` | same | `communication.conversations.view` | Current trusted actor request plus policy/state checks. |
| POST `/communication/join-requests/:requestId/approve` | same | `communication.participants.manage` | Core approval; audited. |
| POST `/communication/join-requests/:requestId/reject` | same | `communication.participants.manage` | Core rejection; audited. |
| GET `/communication/announcements` | `CommunicationAnnouncementController` | `communication.announcements.view` | School-wide management list; optional status filter means drafts/scheduled rows are visible. |
| POST `/communication/announcements` | same | `communication.announcements.manage` | Core create with normalized audience rows; audited. |
| GET `/communication/announcements/:announcementId` | same | `communication.announcements.view` | Core detail exposes lifecycle actor IDs and normalized audience rows. |
| PATCH `/communication/announcements/:announcementId` | same | `communication.announcements.manage` | Core lifecycle/target mutation; audited. |
| POST `/communication/announcements/:announcementId/publish` | same | `communication.announcements.manage` | Publish and deterministic notification queue enqueue. |
| POST `/communication/announcements/:announcementId/archive` | same | `communication.announcements.manage` | Core lifecycle mutation; audited. |
| POST `/communication/announcements/:announcementId/cancel` | same | `communication.announcements.manage` | Core lifecycle mutation; audited. |
| POST `/communication/announcements/:announcementId/read` | same | `communication.announcements.view` | Current trusted actor read marker. |
| GET `/communication/announcements/:announcementId/read-summary` | same | `communication.announcements.manage` | Core target/read aggregate. |
| GET `/communication/announcements/:announcementId/attachments` | same | `communication.announcements.view` | Core attachment metadata. |
| POST `/communication/announcements/:announcementId/attachments` | same | `communication.announcements.manage` | Core file link mutation. |
| DELETE `/communication/announcements/:announcementId/attachments/:attachmentId` | same | `communication.announcements.manage` | Matching core attachment mutation. |
| GET `/communication/notifications` | `CommunicationNotificationController` | `communication.notifications.view` | Manage actors may list all recipients; core presenter includes recipient/actor/source fields. |
| POST `/communication/notifications/read-all` | same | `communication.notifications.view` | Current trusted actor recipient-owned mutation. |
| GET `/communication/notifications/:notificationId` | same | `communication.notifications.view` | Recipient or manage access; core delivery summary included. |
| POST `/communication/notifications/:notificationId/read` | same | `communication.notifications.view` | Recipient-owned mutation. |
| POST `/communication/notifications/:notificationId/archive` | same | `communication.notifications.view` | Recipient-owned mutation. |
| GET `/communication/notification-deliveries` | same | `communication.notifications.manage` | Delivery/provider/status/error inspection; administration-sensitive. |
| GET `/communication/notification-deliveries/:deliveryId` | same | `communication.notifications.manage` | Delivery/provider/status/error detail. |
| POST `/communication/messages/:messageId/reports` | `CommunicationSafetyController` | `communication.messages.report` | Current-school message access and actor-owned report. |
| GET `/communication/message-reports` | same | `communication.messages.moderate` | School-wide moderation queue. |
| GET `/communication/message-reports/:reportId` | same | `communication.messages.moderate` | Core moderation detail. |
| PATCH `/communication/message-reports/:reportId` | same | `communication.messages.moderate` | Moderation mutation; audited. |
| GET `/communication/messages/:messageId/moderation-actions` | same | `communication.messages.moderate` | Core moderation history. |
| POST `/communication/messages/:messageId/moderation-actions` | same | `communication.messages.moderate` | Core moderation mutation; audited. |
| GET `/communication/blocks` | same | `communication.conversations.view` | Current actor block list but core presenter/route family. |
| POST `/communication/blocks` | same | `communication.conversations.view` | Current trusted actor block mutation. |
| DELETE `/communication/blocks/:blockId` | same | `communication.conversations.view` | Current trusted actor block ownership. |
| GET `/communication/restrictions` | same | `communication.messages.moderate` | School-wide restriction administration. |
| POST `/communication/restrictions` | same | `communication.messages.moderate` | Core restriction mutation; audited. |
| PATCH `/communication/restrictions/:restrictionId` | same | `communication.messages.moderate` | Core restriction mutation; audited. |
| DELETE `/communication/restrictions/:restrictionId` | same | `communication.messages.moderate` | Core revoke mutation; audited. |

The runtime inventory test asserts this exact 74-route set and fails for an
added, missing, or misspelled core route.

### Actor-scoped adapters

These controllers have no `CommunicationCoreAccessGuard`. Global guards and
the listed permission still apply. Parent routes allow only a valid current
`PARENT`, Student routes only a valid current `STUDENT`, and Teacher routes only
a valid current `TEACHER`, as resolved by their app access services.

Message routes in all three apps are current-school and active/muted
participant-scoped; contact discovery is relationship/allocation scoped;
download/preview also verifies conversation -> message -> attachment -> file.

| Actor/controller | Method and path | Permission | Ownership/filter and sensitivity |
| --- | --- | --- | --- |
| Parent `ParentMessagesController` | GET `/parent/messages/contacts` | `communication.contacts.view` | Teachers allocated to linked-child classrooms; safe contact cards. |
| Parent | GET `/parent/messages/conversations` | `communication.conversations.view` | Active/muted participant inbox only. |
| Parent | GET `/parent/messages/conversations/:conversationId` | same | Participant-owned detail. |
| Parent | GET `/parent/messages/conversations/:conversationId/search` | `communication.messages.view` | Participant-owned visible sent non-system messages. |
| Parent | GET `/parent/messages/conversations/:conversationId/messages` | same | Participant-owned message list. |
| Parent | GET `/parent/messages/conversations/:conversationId/messages/:messageId/readers` | same | Conversation/message access; safe reader cards. |
| Parent | GET `/parent/messages/conversations/:conversationId/messages/:messageId/info` | same | Conversation/message access; safe info. |
| Parent | GET `/parent/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download` | same | Full ownership chain; 307 only after authorization. |
| Parent | GET `/parent/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview` | same | Full ownership chain; 307 only after authorization. |
| Parent | POST `/parent/messages/conversations` | `communication.conversations.create` | Opaque authorized teacher contact only. |
| Parent | POST `/parent/messages/conversations/:conversationId/messages` | `communication.messages.send` | Participant/policy send; safe presenter. |
| Parent | POST `/parent/messages/conversations/:conversationId/read` | `communication.conversations.read` | Participant-owned read state. |
| Student `StudentMessagesController` | GET `/student/messages/contacts` | `communication.contacts.view` | Teachers allocated to current enrollment classroom. |
| Student | GET `/student/messages/conversations` | `communication.conversations.view` | Active/muted participant inbox only. |
| Student | GET `/student/messages/conversations/:conversationId` | same | Participant-owned detail. |
| Student | GET `/student/messages/conversations/:conversationId/search` | `communication.messages.view` | Participant-owned visible sent non-system messages. |
| Student | GET `/student/messages/conversations/:conversationId/messages` | same | Participant-owned message list. |
| Student | GET `/student/messages/conversations/:conversationId/messages/:messageId/readers` | same | Conversation/message access; safe reader cards. |
| Student | GET `/student/messages/conversations/:conversationId/messages/:messageId/info` | same | Conversation/message access; safe info. |
| Student | GET `/student/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download` | `files.downloads.view` | Full ownership chain; 307 after authorization. |
| Student | GET `/student/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview` | same | Full ownership chain; 307 after authorization. |
| Student | POST `/student/messages/conversations` | `communication.conversations.create` | Opaque authorized teacher contact only. |
| Student | POST `/student/messages/conversations/:conversationId/messages` | `communication.messages.send` | Participant/policy send; safe presenter. |
| Student | POST `/student/messages/conversations/:conversationId/read` | `communication.conversations.read` | Participant-owned read state. |
| Teacher `TeacherMessagesController` | GET `/teacher/messages/contacts` | `communication.contacts.view` | Allocated students and linked guardians only. |
| Teacher | GET `/teacher/messages/conversations` | `communication.conversations.view` | Active/muted participant inbox only. |
| Teacher | GET `/teacher/messages/conversations/:conversationId` | same | Participant-owned detail. |
| Teacher | GET `/teacher/messages/conversations/:conversationId/search` | `communication.messages.view` | Participant-owned visible sent non-system messages. |
| Teacher | GET `/teacher/messages/conversations/:conversationId/messages` | same | Participant-owned message list. |
| Teacher | GET `/teacher/messages/conversations/:conversationId/messages/:messageId/readers` | same | Conversation/message access; safe reader cards. |
| Teacher | GET `/teacher/messages/conversations/:conversationId/messages/:messageId/info` | same | Conversation/message access; safe info. |
| Teacher | GET `/teacher/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download` | same | Full ownership chain; 307 after authorization. |
| Teacher | GET `/teacher/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview` | same | Full ownership chain; 307 after authorization. |
| Teacher | POST `/teacher/messages/conversations` | `communication.conversations.create` | Opaque allocated student/guardian contact only. |
| Teacher | POST `/teacher/messages/conversations/:conversationId/messages` | `communication.messages.send` | Participant/policy send; safe presenter. |
| Teacher | POST `/teacher/messages/conversations/:conversationId/read` | `communication.conversations.read` | Participant-owned read state. |

Parent and Student announcements are current-school, `PUBLISHED`, published-at
or before now, unexpired, and audience-filtered through child/enrollment
hierarchy. Teacher announcements are current-teacher-created, metadata-backed,
and allocation-owned; writes revalidate ownership and target allocation.

| Actor/controller | Method and path | Permission | Ownership/filter and sensitivity |
| --- | --- | --- | --- |
| Parent `ParentAnnouncementsController` | GET `/parent/announcements` | `communication.announcements.view` | Published, unexpired, linked-child audience; app-safe cards. |
| Parent | GET `/parent/announcements/:announcementId` | same | Same audience/publication filter. |
| Parent | POST `/parent/announcements/:announcementId/read` | `communication.announcements.read` | Same visibility plus current actor read marker. |
| Parent | GET `/parent/announcements/:announcementId/attachments` | `communication.announcements.view` | Same visibility; safe file metadata only. |
| Student `StudentAnnouncementsController` | GET `/student/announcements` | `communication.announcements.view` | Published, unexpired, enrollment hierarchy audience. |
| Student | GET `/student/announcements/:announcementId` | same | Same audience/publication filter. |
| Student | POST `/student/announcements/:announcementId/read` | `communication.announcements.read` | Same visibility plus current actor read marker. |
| Student | GET `/student/announcements/:announcementId/attachments` | `communication.announcements.view` | Same visibility; safe file metadata only. |
| Teacher `TeacherAnnouncementsController` | GET `/teacher/announcements` | `communication.announcements.view` | Current teacher-created/allocation-owned list. |
| Teacher | GET `/teacher/announcements/:announcementId` | same | Creator + teacher metadata + current allocation. |
| Teacher | POST `/teacher/announcements` | `teacher.announcements.manage` | Authorized classroom target only. |
| Teacher | PATCH `/teacher/announcements/:announcementId` | same | Owned draft/scheduled and allocation recheck. |
| Teacher | POST `/teacher/announcements/:announcementId/publish` | same | Owned record and allocation recheck. |
| Teacher | POST `/teacher/announcements/:announcementId/archive` | same | Owned allowed lifecycle state. |

Notification routes derive `recipientUserId` only from the current app actor;
no route accepts an ownership override. List/detail/read/archive are
recipient-owned. Presenters exclude recipient/actor IDs, deliveries, provider
details, queue metadata, and raw metadata. Preference and device-token routes
are current actor/current school/current app surface only.

| Actor/controller | Method and path | Permission | Ownership/filter and sensitivity |
| --- | --- | --- | --- |
| Parent `ParentNotificationsController` | GET `/parent/notifications` | `communication.notifications.view` | Current recipient only; app-safe filters/groups. |
| Parent | GET `/parent/notifications/summary` | same | Current recipient unread count. |
| Parent | POST `/parent/notifications/read-all` | `communication.notifications.read` | Current recipient only. |
| Parent | GET `/parent/notifications/preferences` | `communication.notifications.view` | Current actor/current school categories. |
| Parent | PATCH `/parent/notifications/preferences` | `communication.notifications.preferences.manage` | Current actor only. |
| Parent | POST `/parent/notifications/device-tokens` | `app.device_tokens.manage` | Current actor/surface; token never returned. |
| Parent | DELETE `/parent/notifications/device-tokens/current` | same | Current actor/surface token revocation. |
| Parent | GET `/parent/notifications/:notificationId` | `communication.notifications.view` | Other-recipient and cross-school IDs denied. |
| Parent | POST `/parent/notifications/:notificationId/read` | `communication.notifications.read` | Recipient-owned. |
| Parent | POST `/parent/notifications/:notificationId/archive` | `communication.notifications.archive` | Recipient-owned. |
| Student `StudentNotificationsController` | GET `/student/notifications` | `communication.notifications.view` | Current recipient only; app-safe filters/groups. |
| Student | GET `/student/notifications/summary` | same | Current recipient unread count. |
| Student | POST `/student/notifications/read-all` | `communication.notifications.read` | Current recipient only. |
| Student | GET `/student/notifications/preferences` | `communication.notifications.view` | Current actor/current school categories. |
| Student | PATCH `/student/notifications/preferences` | `communication.notifications.preferences.manage` | Current actor only. |
| Student | POST `/student/notifications/device-tokens` | `app.device_tokens.manage` | Current actor/surface; token never returned. |
| Student | DELETE `/student/notifications/device-tokens/current` | same | Current actor/surface token revocation. |
| Student | GET `/student/notifications/:notificationId` | `communication.notifications.view` | Other-recipient and cross-school IDs denied. |
| Student | POST `/student/notifications/:notificationId/read` | `communication.notifications.read` | Recipient-owned. |
| Student | POST `/student/notifications/:notificationId/archive` | `communication.notifications.archive` | Recipient-owned. |
| Teacher `TeacherNotificationsController` | GET `/teacher/notifications` | `communication.notifications.view` | Current recipient only; app-safe filters/groups. |
| Teacher | GET `/teacher/notifications/summary` | same | Current recipient unread count. |
| Teacher | POST `/teacher/notifications/read-all` | `communication.notifications.read` | Current recipient only. |
| Teacher | GET `/teacher/notifications/preferences` | `communication.notifications.preferences.manage` | Current actor/current school categories. |
| Teacher | PATCH `/teacher/notifications/preferences` | same | Current actor only. |
| Teacher | POST `/teacher/notifications/device-tokens` | `app.device_tokens.manage` | Current actor/surface; token never returned. |
| Teacher | DELETE `/teacher/notifications/device-tokens/current` | same | Current actor/surface token revocation. |
| Teacher | GET `/teacher/notifications/:notificationId` | `communication.notifications.view` | Other-recipient and cross-school IDs denied. |
| Teacher | POST `/teacher/notifications/:notificationId/read` | `communication.notifications.read` | Recipient-owned. |
| Teacher | POST `/teacher/notifications/:notificationId/archive` | `communication.notifications.archive` | Recipient-owned. |

## Eight finding decisions

| # | Root cause/classification | Canonical/runtime finding | Resolution and final status |
| --- | --- | --- | --- |
| 1 | `RUNTIME AUTHORIZATION VULNERABILITY` | Core conversation list is school-wide and has no participant predicate; Sprint 28C calls it management-only. | Core guard denies Parent/Student/Teacher; management actors remain allowed. `RESOLVED`. |
| 2 | `STALE TEST EXPECTATION` plus boundary exposure | Teacher seed has view/create but no core manage; accepted Teacher app inbox/create adapter exists. | Core list/create/update all deny Teacher; Teacher app inbox remains 200. No permission added. `RESOLVED`. |
| 3 | `STALE TEST EXPECTATION` plus boundary exposure | Teacher seed has message view/send but no edit/delete; no accepted Teacher app edit/delete route, ownership window, or audit contract exists. | Core message routes deny Teacher; Teacher participant-owned adapter send/list remains 201/200; edit/delete remain unavailable. `RESOLVED`. |
| 4 | `RUNTIME AUTHORIZATION VULNERABILITY` | Core participant list checks current-school conversation only and returns participant/user/relationship lifecycle IDs; no actor membership filter exists. | Core participant/invite/join family is trusted-core only; app contact/conversation adapters remain relationship/participant scoped. `RESOLVED`. |
| 5 | `STALE TEST EXPECTATION` | Teacher lacks `communication.participants.manage`; permission alone would still not prove conversation membership/allocation. | Core participant/invite enumeration returns 403 for Teacher. No data exposure or seed change. `RESOLVED`. |
| 6 | `QUEUE CONTRACT REGRESSION` in broad assertion | Accepted production repair proves `:` is invalid in BullMQ custom IDs. | Assertion now expects `communication-announcement-notifications-<schoolId>-<announcementId>`; idempotency inputs unchanged. `RESOLVED`. |
| 7 | `RUNTIME AUTHORIZATION VULNERABILITY` | Core list defaults to no status/audience filter and presenter includes lifecycle actor IDs/audience summaries; app adapters require published/unexpired/audience visibility. | Core announcement controller guarded; Parent/Student audience filters and Teacher allocation/ownership adapter unchanged. `RESOLVED`. |
| 8 | `RUNTIME AUTHORIZATION VULNERABILITY` | Core notification presenter includes recipient/actor/source fields and detail delivery summary; delivery routes expose provider/status/error details. | Core notification and delivery controller guarded; app notification center remains current-recipient and safe-presented. `RESOLVED`. |

Additional latent regression exposed after the original eight:

- `TEST FIXTURE OR TEST-ORDER DEFECT`: tests expected a queued push delivery to
  stay `PENDING`. Sprint 30D requires `SKIPPED` with
  `push/no-active-device-tokens`; both affected assertions now wait for and
  verify that terminal state.
- `TEST FIXTURE OR TEST-ORDER DEFECT`: one BullMQ job may be consumed by another
  live worker sharing test Redis. The broad test accepts only all local
  recipient events or none, while stable persisted recipient/delivery state
  and focused realtime generation tests prove the event contract.

## Authorization matrix and regression coverage

| Case | Result/evidence |
| --- | --- |
| School user + permission + same school | Allowed in broad core functional tests. |
| Scoped organization user + permission | Allowed for policy and conversation core reads. |
| Teacher / Parent / Student | Denied on core; actor adapters pass independently. |
| Applicant and every other known user type | Denied by exhaustive guard unit test. |
| Missing/unknown user type | Canonical 403 in guard unit tests. |
| Missing/malformed actor | Canonical 401 in guard unit tests. |
| Missing permission | 403 remains enforced by unchanged `PermissionsGuard`. |
| Cross-school actor/resource | Existing broad and app tenancy tests deny/no-leak. |
| Nonparticipant app conversation/message | Parent, Student, and Teacher tenancy suites deny. |
| Other-recipient app notification | Parent/Student/Teacher tenancy suites deny. |
| Draft/unpublished/out-of-audience app announcement | Parent/Student/Teacher announcement security coverage denies/excludes. |
| Unrelated participant/invite enumeration | Core app actors denied before repository access; app contacts remain relationship-scoped. |

## Files changed

- `src/modules/communication/guards/communication-core-access.guard.ts`
- `src/modules/communication/guards/communication-core-access.guard.spec.ts`
- all nine `src/modules/communication/controller/communication-*.controller.ts`
- `src/modules/communication/communication.module.ts`
- `test/e2e/communication-security-contract.e2e-spec.ts`
- `test/e2e/communication-realtime-announcements-notifications.e2e-spec.ts`
- `test/security/tenancy.communication.spec.ts`
- `docs/database/post-rebaseline-regression-register.md`
- this closeout

## Verification evidence

- Guard unit: 1 suite, 8/8.
- Core runtime inventory/metadata: 1 suite, 3/3; exact 74 core routes.
- Communication Core Chat E2E: 1/1.
- Realtime/Announcements/Notifications E2E: 1/1.
- Broad Communication security: 68/68.
- Communication unit slice: 61 suites, 334/334.
- Push: 6 suites, 31/31.
- Firebase: 3 suites, 23/23.
- App device tokens: 4 suites, 12/12.
- Parent App units: 50 suites, 206/206.
- Student App units: 52 suites, 256/256.
- Teacher Communication units: 6 suites, 48/48.
- Parent App security: 30/30.
- Student App security: 33/33.
- Teacher App security: 55/55.
- All listed passing Jest invocations exited naturally; no `--forceExit`,
  process exit call, timer suppression, or blanket handle workaround was used.

The broader `npm run test -- teacher-app --runInBand` pattern was also run. It
reported two unrelated Teacher Profile assertions expecting `roleId`, while
the current safe presenter omits that field. No Communication test failed in
that command, neither profile file is changed here, and this closeout does not
claim all repository tests are green.

Final repository gates:

- Combined affected E2E/security: 7 suites, 191/191, natural exit.
- Combined affected unit: 88 suites, 496/496, natural exit.
- Final broad Communication security rerun: 68/68, natural exit.
- Final Communication Core Chat lifecycle rerun: 1/1, natural exit; no matching
  Jest/build/compiler process remained afterward.
- `npx prisma validate`: PASS.
- `npx prisma migrate status`: PASS; one migration, database up to date.
- `npm run test:migration-governance`: PASS, 39/39.
- `npm run db:migrations:check`: PASS, `active=1`, `new=0`, `rebaseline=off`.
- `npm run build`: PASS.
- `npx tsc -p tsconfig.build.json --noEmit`: PASS.
- `git diff --check`: PASS.
- No Prisma schema, migration, migration-governance, seed, `.env`, Live, or
  Dashboard Todos file changed. The Dashboard Todos stash remains intact at
  `stash@{0}`.
