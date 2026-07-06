# Dismissal API Route Inventory V1

Status: final frontend contract audit for implemented Dismissal / Smart Pickup V1.

Global prefix: every REST path below is served under `/api/v1`.

Guard chain: every Dismissal and Parent Smart Pickup REST route uses `JwtAuthGuard`, `ScopeResolverGuard`, and `PermissionsGuard`.

## Parent Smart Pickup

| Method | Path | Actor surface | Permission | Request DTO | Response presenter/DTO | Read/write | Side effects | Scope and safe hiding |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/parent/smart-pickup` | Parent App | `parent.smart_pickup.view` | none | `ParentSmartPickupReadinessResponseDto` / readiness presenter | read-only | none | Requires `UserType.PARENT`; current school context; children resolved through Guardian -> StudentGuardian -> active Enrollment. |
| POST | `/api/v1/parent/smart-pickup/requests` | Parent App | `parent.smart_pickup.request` | `CreateParentSmartPickupRequestDto` | `CreateParentSmartPickupRequestResponseDto` / request presenter | mutating | creates request, request-created event, audit, staff notification, realtime request/queue/parent events | Own child only; enabled settings; open window; geofence; available gate; duplicate active guard; safe 404 for unowned or cross-school child. |
| GET | `/api/v1/parent/smart-pickup/recent-calls` | Parent App | `parent.smart_pickup.view` | `ParentSmartPickupRecentCallsQueryDto` | `ParentSmartPickupRecentCallsResponseDto` / recent calls presenter | read-only | none | Owned current-parent/current-school requests only; safe filtering; terminal history is visible without internal receiver fields. |
| POST | `/api/v1/parent/smart-pickup/requests/:id/cancel` | Parent App | `parent.smart_pickup.cancel` | `CancelParentSmartPickupRequestDto` | `CancelParentSmartPickupRequestResponseDto` / recent calls presenter | mutating | changed cancel creates status event, audit, staff notification, realtime cancelled/queue/parent events | Own request only; `REQUESTED` or `QUEUED` only; already-cancelled retry is idempotent; cross-school/unowned/deleted hidden as 404. |

## Dismissal Settings

| Method | Path | Permission | DTO | Response | Read/write | Side effects | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/dismissal/settings` | `dismissal.settings.view` | none | `DismissalSettingsResponseDto` | read-only | none | Current school. Missing row returns computed defaults from `SchoolProfile` without persisting. |
| PATCH | `/api/v1/dismissal/settings` | `dismissal.settings.manage` | `UpdateDismissalSettingsDto` | `DismissalSettingsResponseDto` | mutating | upsert settings and audit | Current school only; `updatedById` from actor; default gate must be current-school and non-deleted. |

## Dismissal Gates

| Method | Path | Permission | DTO | Response | Read/write | Side effects | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/dismissal/gates` | `dismissal.gates.view` | `ListDismissalGatesQueryDto` | `DismissalGatesListResponseDto` | read-only | none | Current-school, non-deleted gates. |
| POST | `/api/v1/dismissal/gates` | `dismissal.gates.manage` | `CreateDismissalGateDto` | `DismissalGateResponseDto` | mutating | creates gate and audit | Current school; duplicate code rejected per school. |
| GET | `/api/v1/dismissal/gates/:id` | `dismissal.gates.view` | path UUID | `DismissalGateResponseDto` | read-only | none | Current-school, non-deleted; cross-school/deleted returns safe 404. |
| PATCH | `/api/v1/dismissal/gates/:id` | `dismissal.gates.manage` | `UpdateDismissalGateDto` | `DismissalGateResponseDto` | mutating | updates gate and audit | Current-school only; cannot move school. |

## Dismissal Staff / Profile / Assignments

| Method | Path | Permission | DTO | Response | Read/write | Side effects | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/dismissal/profile` | `dismissal.profile.view` | none | `DismissalProfileResponseDto` | read-only | none | Requires `UserType.DISMISSAL_STAFF`; returns own active assignment summary. |
| GET | `/api/v1/dismissal/staff-assignments` | `dismissal.staff.view` | `ListDismissalStaffAssignmentsQueryDto` | `DismissalStaffAssignmentsListResponseDto` | read-only | none | Current school. |
| POST | `/api/v1/dismissal/staff-assignments` | `dismissal.staff.manage` | `CreateDismissalStaffAssignmentDto` | `DismissalStaffAssignmentResponseDto` | mutating | creates assignment and audit | Current school; staff must be active `DISMISSAL_STAFF` in same school. |
| GET | `/api/v1/dismissal/staff-assignments/:id` | `dismissal.staff.view` | path UUID | `DismissalStaffAssignmentResponseDto` | read-only | none | Current-school, non-deleted; hidden as safe 404. |
| PATCH | `/api/v1/dismissal/staff-assignments/:id` | `dismissal.staff.manage` | `UpdateDismissalStaffAssignmentDto` | `DismissalStaffAssignmentResponseDto` | mutating | updates assignment and audit | Current school only. |
| DELETE | `/api/v1/dismissal/staff-assignments/:id` | `dismissal.staff.manage` | path UUID | `DeleteDismissalStaffAssignmentResponseDto` | mutating | soft delete and audit | Current school only. |

## Dismissal Active Queue and Request Detail

| Method | Path | Permission | DTO | Response | Read/write | Side effects | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/dismissal/requests/active` | `dismissal.requests.view` | `ListActiveDismissalRequestsQueryDto` | `ActiveDismissalRequestsListResponseDto` | read-only | none | Active statuses only; school admins see current school, `DISMISSAL_STAFF` sees assignment-matching requests. |
| GET | `/api/v1/dismissal/requests/:id` | `dismissal.requests.view` | path UUID | `DismissalRequestDetailResponseDto` | read-only | none | Active, current-school, non-deleted, assignment-visible only; terminal/cross-school/deleted/hidden returns safe 404. |

## Dismissal Lifecycle Transitions

| Method | Path | Permission | DTO | Response | Read/write | Side effects | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PATCH | `/api/v1/dismissal/requests/:id/status` | `dismissal.requests.manage` | `UpdateDismissalRequestStatusDto` | `DismissalRequestStatusUpdateResponseDto` | mutating | changed transition creates status event, audit, parent notification for called/ready, realtime status/queue/parent events | Active current-school request; assignment-scoped for `DISMISSAL_STAFF`; same-status no-op writes nothing. |

Implemented transition targets are `queued`, `called`, `moving`, `at_gate`, and `ready`.

## Dismissal Waiting Students

| Method | Path | Permission | DTO | Response | Read/write | Side effects | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/dismissal/waiting-students` | `dismissal.requests.view` | `ListDismissalWaitingStudentsQueryDto` | `DismissalWaitingStudentsListResponseDto` | read-only | none | Current-school requests in `CALLED`, `MOVING`, `AT_GATE`, `READY`; assignment-scoped for staff. |
| POST | `/api/v1/dismissal/waiting-students/:id/arrival` | `dismissal.requests.manage` | `ConfirmStudentArrivalDto` | `ConfirmStudentArrivalResponseDto` | mutating | changed arrival creates status event, audit, realtime arrival/queue/parent events | `CALLED` or `MOVING` -> `AT_GATE`; `AT_GATE`/`READY` no-op; other states rejected or hidden. |

## Dismissal Delivery / Handover and Pickup Recipients

| Method | Path | Permission | DTO | Response | Read/write | Side effects | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/dismissal/requests/:id/pickup-recipients` | `dismissal.requests.deliver` | path UUID | `DismissalPickupRecipientsResponseDto` | read-only | issues short-lived opaque recipient tokens in response only | READY, current-school, assignment-visible request only. |
| POST | `/api/v1/dismissal/requests/:id/deliver` | `dismissal.requests.deliver` | `DeliverDismissalRequestDto` | `DeliverDismissalRequestResponseDto` | mutating | `READY` -> `HANDED_OVER`, event, audit, parent notification, realtime delivered/queue/parent events | Requires recipient token; requires pickup code when policy requires; revalidates live recipient eligibility. |

## Dismissal Notifications

| Method | Path | Permission | DTO | Response | Read/write | Side effects | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/dismissal/notifications` | `dismissal.notifications.view` | `ListDismissalNotificationsQueryDto` | `DismissalNotificationsListResponseDto` | read-only | none | Current actor recipient and current school only. |
| PATCH | `/api/v1/dismissal/notifications/:id/read` | `dismissal.notifications.manage` | path UUID | `DismissalNotificationReadResponseDto` | mutating | marks recipient notification read; publishes `dismissal.notification.read` | Current actor recipient/current school only; idempotent. |
| PATCH | `/api/v1/dismissal/notifications/read-all` | `dismissal.notifications.manage` | none | `DismissalNotificationsReadAllResponseDto` | mutating | marks current actor unread dismissal notifications read; publishes `dismissal.notifications.read_all` when rows changed | Current actor recipient/current school only. |

## Dismissal History and Escalation

| Method | Path | Permission | DTO | Response | Read/write | Side effects | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/dismissal/requests/history` | `dismissal.requests.history.view` | `ListDismissalRequestHistoryQueryDto` | `DismissalRequestHistoryListResponseDto` | read-only | none | Active and terminal current-school requests; assignment-scoped for staff; deleted hidden. |
| GET | `/api/v1/dismissal/requests/history/:id` | `dismissal.requests.history.view` | path UUID | `DismissalRequestHistoryDetailResponseDto` | read-only | none | Current-school, non-deleted, assignment-visible history detail; safe timeline. |
| POST | `/api/v1/dismissal/requests/:id/escalate` | `dismissal.requests.escalate` | `EscalateDismissalRequestDto` | `EscalateDismissalRequestResponseDto` | mutating | creates `REQUEST_ESCALATED` event and audit only on first escalation | Active request only; idempotent; no notification or realtime event. |

`/dismissal/requests/history` and `/dismissal/requests/history/:id` are registered before `/dismissal/requests/:id`.

## Realtime Gateway Events

No Dismissal REST route owns the realtime gateway. Dismissal uses the existing `/api/v1/realtime` Socket.IO gateway and `RealtimePublisherService`.

Implemented server event names:

| Event | Recipients | Emitted when | REST fallback |
| --- | --- | --- | --- |
| `dismissal.request.created` | assignment-matching staff users | parent request creation commits | `GET /dismissal/requests/active` |
| `dismissal.request.cancelled` | assignment-matching staff users | parent cancellation changes state | `GET /dismissal/requests/active`, `GET /parent/smart-pickup/recent-calls` |
| `dismissal.request.status_changed` | assignment-matching staff users | status PATCH changes state | `GET /dismissal/requests/:id`, `GET /dismissal/requests/active` |
| `dismissal.request.arrival_confirmed` | assignment-matching staff users | arrival endpoint changes `CALLED/MOVING` to `AT_GATE` | `GET /dismissal/waiting-students` |
| `dismissal.request.delivered` | assignment-matching staff users | delivery commits | `GET /dismissal/requests/history/:id` |
| `dismissal.queue.changed` | assignment-matching staff users | request creation/cancel/status/arrival/delivery changes queue | `GET /dismissal/requests/active` |
| `parent.smart_pickup.request.changed` | requesting parent user | request creation/cancel/status/arrival/delivery changes request | `GET /parent/smart-pickup/recent-calls` |
| `dismissal.notification.created` | notification recipient user | in-app dismissal notification row is created | `GET /dismissal/notifications` |
| `dismissal.notification.read` | current actor user | one notification is marked read | `GET /dismissal/notifications` |
| `dismissal.notifications.read_all` | current actor user | read-all changes unread rows | `GET /dismissal/notifications` |

Realtime is best-effort. There is no durable outbox, replay, or reconnect catch-up in V1. Frontends should refetch affected REST endpoints on every event.

## Routes That Do Not Exist

These are intentionally absent in V1:

- No `/api/v1/pickup`
- No `/api/v1/history`
- No `/api/v1/requests/history`
- No root `/api/v1/waiting-students`
- No root `/api/v1/notifications`
- No `/api/v1/parent/notifications`
- No pickup-code resend route
- No pickup-code rotation route
- No delegate OTP route
- No delegate QR route
- No external delegate invitation route
- No request-scoped chat or file route
