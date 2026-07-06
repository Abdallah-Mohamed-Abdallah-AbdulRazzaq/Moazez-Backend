# Dismissal / Smart Pickup Frontend Contract V1

Status: source-backed final V1 contract audit.

This document freezes implemented backend behavior for frontend/mobile teams. It does not describe future features as available.

## Implemented and Stable

- Parent Smart Pickup readiness, request creation, recent calls, and cancel-before-called.
- Dismissal settings, gates, staff assignments, profile.
- Active queue, request detail, lifecycle transitions, waiting students, arrival confirmation.
- Pickup recipient discovery, pickup-code verification, and handover.
- Dismissal in-app notifications for staff/recipient users.
- Best-effort realtime queue/request/notification events through the existing realtime gateway.
- History, delay/urgent computed signals, and manual escalation event/audit.
- Automatic request expiration worker for stale active requests.
- Best-effort push delivery for Dismissal / Smart Pickup notification rows using existing app-device-token and communication push infrastructure.
- Dismissal Staff device-token registration through `/api/v1/dismissal/notifications/device-tokens`.

## Implemented but Best-Effort

- Realtime delivery is best-effort. There is no durable outbox or replay.
- Push delivery is best-effort. REST remains the source of truth and clients must refetch after push/realtime hints. No durable Dismissal-specific push outbox or replay was added.

## Not Implemented Yet

- Durable realtime reconnect replay.
- Temporary external delegate authorization, delegate OTP, delegate QR, pickup-code resend/rotation.
- Staff-parent chat, files, CSV/PDF export, analytics dashboards, shifts/duty handover.

## Status Model

| Internal status | Public status | Segment |
| --- | --- | --- |
| `REQUESTED` | `requested` | active |
| `QUEUED` | `queued` | active |
| `CALLED` | `called` | active, waiting |
| `MOVING` | `moving` | active, waiting |
| `AT_GATE` | `at_gate` | active, waiting |
| `READY` | `ready` | active, waiting, deliverable |
| `HANDED_OVER` | `handed_over` | terminal |
| `CANCELLED` | `cancelled` | terminal |
| `EXPIRED` | `expired` | terminal |

Active statuses are `requested`, `queued`, `called`, `moving`, `at_gate`, and `ready`.

Terminal statuses are `handed_over`, `cancelled`, and `expired`.

Computed signals:

- `delayed`
- `urgent`
- `escalated`

`delayed` is not a status. `urgent` is not a status. `escalated` is not a status.

## Actor Matrix

| Actor | User type | Surface | Visibility |
| --- | --- | --- | --- |
| Parent | `PARENT` | `/api/v1/parent/smart-pickup` | Own linked children and owned requests in current school context. |
| Dismissal Staff | `DISMISSAL_STAFF` | `/api/v1/dismissal` | Own profile and assignment-matching operational requests. |
| School Admin / school user with dismissal permissions | `SCHOOL_USER` | `/api/v1/dismissal` | Current-school dismissal resources allowed by permission. |
| Teacher / Student | `TEACHER`, `STUDENT` | none for Dismissal V1 | No Dismissal or Parent Smart Pickup staff permissions. |
| Pickup Delegate | `PICKUP_DELEGATE` | not implemented | Not a staff actor; no route surface in this V1 contract. |

## Permission Matrix

| Permission | Used by routes |
| --- | --- |
| `parent.smart_pickup.view` | readiness, recent calls |
| `parent.smart_pickup.request` | parent request creation |
| `parent.smart_pickup.cancel` | parent cancel |
| `dismissal.profile.view` | profile |
| `dismissal.settings.view` | get settings |
| `dismissal.settings.manage` | update settings |
| `dismissal.gates.view` | list/get gates |
| `dismissal.gates.manage` | create/update gates |
| `dismissal.staff.view` | list/get assignments |
| `dismissal.staff.manage` | create/update/delete assignments |
| `dismissal.requests.view` | active queue, active detail, waiting students |
| `dismissal.requests.manage` | status transitions, arrival confirmation |
| `dismissal.requests.deliver` | pickup recipients, delivery |
| `dismissal.requests.escalate` | escalation |
| `dismissal.requests.history.view` | history list/detail |
| `dismissal.notifications.view` | notifications list |
| `dismissal.notifications.manage` | mark notification read/read-all |
| `app.device_tokens.manage` | register/unregister current actor device tokens |

Parent role receives only the three `parent.smart_pickup.*` permissions plus shared app-device-token management for Parent App notifications. Dismissal Staff receives the operational dismissal permissions plus shared app-device-token management for the Dismissal Staff app surface, but not settings/staff assignment management. Parent does not receive `dismissal.*`.

## Parent App Contract

### GET `/api/v1/parent/smart-pickup`

Permission: `parent.smart_pickup.view`.

Actor: `UserType.PARENT`.

Body/query: none.

Response shape:

```json
{
  "enabled": true,
  "school": { "name": "School name" },
  "policy": {
    "geofenceRequired": true,
    "requestWindow": {
      "start": "00:00",
      "end": "23:59",
      "timezone": "Africa/Cairo",
      "isOpenNow": true
    },
    "pickupCodeRequired": true,
    "parentCancelBeforeCalledAllowed": true,
    "delegatePickupAllowed": true
  },
  "status": {
    "enabled": true,
    "configured": true,
    "requestWindowOpen": true,
    "canRequestNow": true,
    "reasons": []
  },
  "schoolZone": {
    "latitude": 30.04442,
    "longitude": 31.235712,
    "radiusMeters": 150,
    "label": "Main gate",
    "source": "settings"
  },
  "requestWindow": {
    "startLocal": "00:00",
    "endLocal": "23:59",
    "timezone": "Africa/Cairo",
    "serverNowLocal": "12:30"
  },
  "policies": {
    "requirePickupCode": true,
    "allowDelegatePickup": true,
    "allowParentCancelBeforeCalled": true
  },
  "children": [
    {
      "id": "uuid",
      "displayName": "Student Name",
      "grade": "Grade",
      "section": "Section",
      "classroom": "Classroom",
      "canPickup": true,
      "pickupEligible": true,
      "eligibilityReasons": [],
      "canRequestPickup": true,
      "blockedReason": null,
      "activeRequest": null
    }
  ],
  "gates": [
    {
      "id": "uuid",
      "code": "MAIN",
      "name": "Main Gate",
      "campus": null,
      "status": "open",
      "isActive": true,
      "sortOrder": 1
    }
  ],
  "summary": {
    "childCount": 1,
    "eligibleChildCount": 1,
    "availableGateCount": 1
  }
}
```

Business rules:

- Missing `DismissalSettings` returns computed defaults and does not persist.
- Coordinates come from settings first, then `SchoolProfile`, then null/default.
- `canRequestNow` requires enabled settings, configured row, zone coordinates, open window, eligible child, and available gate.
- Available gates are active, non-deleted, and `open` or `busy`.

Safe errors: invalid actor/context errors use `parent.smart_pickup.*` codes.

Frontend notes:

- Use `enabled`, `status.canRequestNow`, and each child `canRequestPickup` to enable the primary action.
- Treat `blockedReason` and `status.reasons` as stable machine strings.

### POST `/api/v1/parent/smart-pickup/requests`

Permission: `parent.smart_pickup.request`.

Body:

```json
{
  "childId": "uuid",
  "latitude": 30.04442,
  "longitude": 31.235712,
  "gateId": "uuid",
  "clientRequestId": "optional-idempotency-key"
}
```

Response shape:

```json
{
  "request": {
    "id": "uuid",
    "status": "requested",
    "isActive": true,
    "isTerminal": false,
    "canCancel": true,
    "canTrack": true,
    "requestedAt": "2026-07-06T10:00:00.000Z",
    "child": { "id": "uuid", "displayName": "Student", "grade": "Grade", "section": "A", "classroom": "1A" },
    "gate": { "id": "uuid", "code": "MAIN", "name": "Main Gate", "status": "open" },
    "pickup": {
      "codeRequired": true,
      "codeIssued": true,
      "codeIssuedAt": "2026-07-06T10:00:00.000Z",
      "code": "123456"
    },
    "policies": {
      "requirePickupCode": true,
      "allowParentCancelBeforeCalled": true
    }
  },
  "pickup": {
    "codeRequired": true,
    "codeIssued": true,
    "codeIssuedAt": "2026-07-06T10:00:00.000Z",
    "pickupCode": "123456"
  }
}
```

Business rules:

- Child ownership is verified server-side.
- Settings must be enabled and within server-side request window.
- Parent coordinates must pass geofence.
- Gate must be available or resolvable by default gate/single available gate.
- Duplicate active request for a child is rejected.
- `clientRequestId` makes same request retry safe; conflicting reuse is rejected.

Pickup code rule:

- Raw pickup code appears only in the first successful request creation response when pickup code is required.
- Raw pickup code does not appear in readiness.
- Raw pickup code does not appear in recent calls.
- Raw pickup code does not appear in cancel response.
- Raw pickup code does not appear in idempotent creation retry.
- Hash and salt are never exposed.

### GET `/api/v1/parent/smart-pickup/recent-calls`

Permission: `parent.smart_pickup.view`.

Query:

- `childId`
- `status`
- `activeOnly`
- `page`
- `limit`
- `sort`

Response includes `data`, `summary`, and `pagination`. Each item includes public status, active/terminal booleans, cancel/track booleans, safe child/gate, pickup code issue metadata, safe timestamps, and safe timeline.

Recipient verification hiding:

- Parent App never receives `pickupRecipientToken`.
- Parent App never receives `guardianId` or `studentGuardianId`.
- Parent App never receives handover receiver name/relation.
- Parent App sees `handed_over` status and `handedOverAt` only.

### POST `/api/v1/parent/smart-pickup/requests/:id/cancel`

Permission: `parent.smart_pickup.cancel`.

Body:

```json
{ "note": "optional note" }
```

Response:

```json
{
  "request": {
    "id": "uuid",
    "status": "cancelled",
    "previousStatus": "requested",
    "changed": true,
    "isActive": false,
    "isTerminal": true,
    "canCancel": false,
    "canTrack": false,
    "cancelledAt": "2026-07-06T10:03:00.000Z"
  }
}
```

Rules:

- Only `REQUESTED` and `QUEUED` can be cancelled.
- Already-cancelled owned request returns `changed=false`.
- Cancel can be disabled by settings.
- Cross-school/unowned/deleted requests are safe 404.

## Dismissal Staff/Admin Contract

### Settings and Gates

Settings response contains enabled flag, timezone, schoolZone, radius, requestWindow, thresholds, policies, defaultGate, configured, and updatedAt. Thresholds include `delayMinutes`, `urgentMinutes`, and `expiryMinutes`.

Gate response contains id, code, name, campus, public status, isActive, sortOrder, location, waitingZones, notes, createdAt, and updatedAt.

Settings and gate mutations write audit logs. Responses do not expose `schoolId`, `updatedById`, or `deletedAt`.

### Staff Profile and Assignments

Profile is for `DISMISSAL_STAFF` only and returns identity, school, assignments, and readiness booleans. Assignment management is school-admin oriented. Assignment visibility dimensions are gate, stage, grade, section, classroom, time window, active flag, and lead flag.

### Active Queue and Detail

`GET /dismissal/requests/active` returns active statuses only with data, summary, and pagination. Staff users see assignment-matching requests only. Admins with permission see current-school active queue.

`GET /dismissal/requests/:id` returns active detail only. Terminal/deleted/cross-school/assignment-hidden requests are safe 404.

### Lifecycle Transition Matrix

| From | To | Route |
| --- | --- | --- |
| `REQUESTED` | `QUEUED` | `PATCH /dismissal/requests/:id/status` |
| `REQUESTED` | `CALLED` | `PATCH /dismissal/requests/:id/status` |
| `QUEUED` | `CALLED` | `PATCH /dismissal/requests/:id/status` |
| `CALLED` | `MOVING` | `PATCH /dismissal/requests/:id/status` |
| `CALLED` | `AT_GATE` | `PATCH /dismissal/requests/:id/status` |
| `MOVING` | `AT_GATE` | `PATCH /dismissal/requests/:id/status` |
| `AT_GATE` | `READY` | `PATCH /dismissal/requests/:id/status` |
| `READY` | `HANDED_OVER` | `POST /dismissal/requests/:id/deliver` only |
| `REQUESTED` | `CANCELLED` | `POST /parent/smart-pickup/requests/:id/cancel` only |
| `QUEUED` | `CANCELLED` | `POST /parent/smart-pickup/requests/:id/cancel` only |
| active statuses | `EXPIRED` | internal expiration worker only |

Same-status lifecycle PATCH is an idempotent no-op. Generic PATCH cannot set terminal statuses.

### Automatic Expiration

The internal expiration worker runs as a BullMQ repeatable job and has no public REST trigger. It marks stale `requested`, `queued`, `called`, `moving`, `at_gate`, and `ready` requests as `expired` using `DismissalSettings.thresholds.expiryMinutes`, falling back to 180 minutes when no settings row exists. Expiration creates one safe `request_status_changed` timeline event, a service-account audit log, in-app notification rows for the requesting parent and matching dismissal staff, and existing realtime status/queue/parent/notification events after commit.

### Waiting Students

`GET /dismissal/waiting-students` includes `called`, `moving`, `at_gate`, and `ready` requests only. Arrival endpoint changes `called` or `moving` to `at_gate`; `at_gate` and `ready` are idempotent no-ops.

### Delivery Contract

- Pickup recipients can be listed only for READY visible requests.
- `pickupRecipientToken` is staff-side only.
- Token is opaque and short-lived.
- Delivery requires `pickupRecipientToken`.
- Delivery requires pickup code if configured.
- Delivery revalidates live recipient eligibility.
- Delivery stores verified receiver display fields from the live guardian link.
- Delivery never echoes token/code internals.

### History and Escalation Contract

History filters:

- `status`
- `statuses`
- `childId`
- `gateId`
- `stageId`
- `gradeId`
- `sectionId`
- `classroomId`
- `dateFrom`
- `dateTo`
- `activeOnly`
- `terminalOnly`
- `delayedOnly`
- `urgentOnly`
- `escalatedOnly`
- `page`
- `limit`
- `sort`

History detail timeline types:

- `request_created`
- `request_status_changed`
- `request_escalated`

Escalation:

- allowed only for active requests
- creates `REQUEST_ESCALATED` event and safe audit on first successful escalation
- idempotent retry returns `changed=false`
- terminal request returns `dismissal.escalation.terminal_request`
- no notification or realtime side effects

Allowed escalation reasons:

- `student_not_arrived`
- `gate_congestion`
- `parent_waiting`
- `safety_concern`
- `manual_follow_up`
- `other`

## Notification Contract

In-app notifications exist and use `CommunicationNotification` plus delivery rows.

Staff notification routes:

- `GET /api/v1/dismissal/notifications`
- `PATCH /api/v1/dismissal/notifications/:id/read`
- `PATCH /api/v1/dismissal/notifications/read-all`

Implemented dismissal notification public types:

- `request_created`
- `request_cancelled`
- `request_called`
- `request_ready`
- `request_handed_over`
- `request_expired`

Parent-facing dismissal updates are represented through Parent Smart Pickup REST/realtime behavior; expiration also creates a parent in-app notification row without adding a dedicated Parent Smart Pickup notification route.

Push delivery is implemented as best-effort for supported Dismissal / Smart Pickup notification rows. Escalation does not create notification or push.

## Realtime Event Contract

Implemented event names only:

- `dismissal.request.created`
- `dismissal.request.cancelled`
- `dismissal.request.status_changed`
- `dismissal.request.arrival_confirmed`
- `dismissal.request.delivered`
- `dismissal.queue.changed`
- `parent.smart_pickup.request.changed`
- `dismissal.notification.created`
- `dismissal.notification.read`
- `dismissal.notifications.read_all`

Realtime payloads contain safe request/child/gate/notification summaries only. They do not guarantee delivery, do not replay missed events, and do not replace REST as the source of truth. Frontends should refetch the affected REST route on event.

## Error Code Matrix

| Code family / code | Meaning | Likely HTTP | Frontend action | Safe-hidden 404 |
| --- | --- | --- | --- | --- |
| `parent.smart_pickup.invalid_actor_type` | Caller is not a parent | 403 | show forbidden/app mismatch | no |
| `parent.smart_pickup.parent_context_not_found` | Parent guardian context missing | 404 | ask support / refresh account | yes |
| `parent.smart_pickup.school_context_required` | No active school context | 403/422 | require school selection/login refresh | no |
| `parent.smart_pickup.invalid_status_filter` | Bad recent-call status filter | 422 | fix client query | no |
| `dismissal.settings.disabled` | Dismissal disabled | 409 | show disabled state | no |
| `dismissal.settings.coordinates_required` | Missing zone coordinates for parent request | 422 | ask school admin to configure | no |
| `dismissal.settings.invalid_timezone` | Invalid settings timezone | 422 | validate admin form | no |
| `dismissal.settings.invalid_coordinates` | Invalid settings coordinates | 422 | validate admin form | no |
| `dismissal.settings.invalid_radius` | Invalid radius | 422 | validate admin form | no |
| `dismissal.settings.invalid_window` | Invalid HH:mm window | 422 | validate admin form | no |
| `dismissal.settings.invalid_thresholds` | Urgent threshold below delay, expiry threshold not above urgent, or threshold out of bounds | 422 | validate admin form | no |
| `dismissal.settings.default_gate_not_found` | Default gate outside scope/deleted | 404/422 | refetch gates | yes |
| `dismissal.settings.coordinates_required_when_enabled` | Enabled settings need coordinates | 422 | require coordinates | no |
| `dismissal.gate.not_found` | Gate hidden/not found | 404 | refetch list | yes |
| `dismissal.gate.duplicate_code` | Gate code already used in school | 409 | ask for unique code | no |
| `dismissal.gate.invalid_status` | Bad gate status | 422 | fix client/admin form | no |
| `dismissal.gate.invalid_coordinates` | Bad gate coordinates | 422 | validate form | no |
| `dismissal.gate.invalid_waiting_zones` | Bad waiting-zone array | 422 | validate form | no |
| `dismissal.staff_assignment.*_not_found` | Staff/gate/academic scope hidden/not found | 404 | refetch form data | yes |
| `dismissal.staff_assignment.staff_not_dismissal_staff` | Assigned user has wrong type | 422 | choose dismissal staff user | no |
| `dismissal.staff_assignment.staff_not_in_school` | Staff lacks active membership | 422 | fix staff membership | no |
| `dismissal.staff_assignment.scope_required` | Assignment has no dimensions | 422 | require gate or academic scope | no |
| `dismissal.staff_assignment.scope_mismatch` | Academic dimensions inconsistent | 422 | fix hierarchy | no |
| `dismissal.staff_assignment.invalid_time_window` | startsAt/endsAt invalid | 422 | validate form | no |
| `dismissal.staff_assignment.duplicate_active` | Duplicate active assignment | 409 | show duplicate warning | no |
| `dismissal.request.not_found` | Request hidden/not found | 404 | treat as inaccessible | yes |
| `dismissal.request.invalid_status_filter` | Active queue status invalid | 422 | fix query | no |
| `dismissal.request.invalid_status` | Transition target invalid | 422 | fix command | no |
| `dismissal.request.invalid_transition` | Unsupported lifecycle move | 409 | refetch and re-render actions | no |
| `dismissal.request.terminal_status` | Terminal target through PATCH | 409 | use correct route or hide action | no |
| `dismissal.request.invalid_queue_filter` | Bad queue filter/sort | 422 | fix query | no |
| `dismissal.request.school_context_required` | No school context for queue | 403/422 | refresh session/scope | no |
| `dismissal.request.outside_window` | Parent request outside window | 422 | show window closed | no |
| `dismissal.request.outside_geofence` | Parent outside school zone | 422 | show move closer state | no |
| `dismissal.request.student_not_owned` | Child unowned/outside scope | 404 | hide child/request | yes |
| `dismissal.request.student_not_active` | Student inactive | 409 | show not eligible | no |
| `dismissal.request.no_active_enrollment` | No active enrollment | 404 | show not eligible | yes |
| `dismissal.request.guardian_not_allowed` | Guardian cannot pickup | 403 | show contact school | no |
| `dismissal.request.duplicate_active` | Child already has active request | 409 | switch to tracker | no |
| `dismissal.request.cancel_disabled` | Policy disables parent cancel | 409 | hide cancel | no |
| `dismissal.request.cancel_not_allowed` | Status no longer cancelable | 409 | refetch recent calls | no |
| `dismissal.request.already_terminal` | Terminal request mutation | 409 | refetch | no |
| `dismissal.request.gate_required` | Multiple gates need explicit gate | 422 | require gate picker | no |
| `dismissal.request.idempotency_conflict` | Client request id reused for different intent | 409 | generate new id or refetch | no |
| `dismissal.waiting.not_found` | Waiting request hidden/not found | 404 | treat as inaccessible | yes |
| `dismissal.waiting.invalid_arrival_status` | Arrival invalid for status | 409 | refetch actions | no |
| `dismissal.waiting.invalid_filter` | Bad waiting filter | 422 | fix query | no |
| `dismissal.delivery.not_found` | Delivery request hidden/not found | 404 | treat as inaccessible | yes |
| `dismissal.delivery.not_ready` | Pickup recipients requested before READY | 409 | hide delivery until ready | no |
| `dismissal.delivery.already_delivered` | Request already handed over | 409 | refetch history | no |
| `dismissal.delivery.pickup_code_required` | Missing code | 422 | prompt for code | no |
| `dismissal.delivery.invalid_pickup_code` | Bad code | 403 | show retry error | no |
| `dismissal.delivery.pickup_code_not_issued` | Required code missing server-side | 409 | ask support/admin | no |
| `dismissal.delivery.pickup_recipient_required` | Missing recipient token | 422 | select recipient first | no |
| `dismissal.delivery.invalid_pickup_recipient` | Token malformed/wrong request | 422 | refetch recipients | no |
| `dismissal.delivery.pickup_recipient_expired` | Token older than TTL | 422 | refetch recipients | no |
| `dismissal.delivery.pickup_recipient_not_allowed` | Recipient no longer eligible | 403 | refetch recipients | no |
| `dismissal.delivery.pickup_recipient_not_found` | Linked recipient vanished | 404 | refetch recipients | yes |
| `dismissal.delivery.invalid_payload` | Delivery payload invalid | 422 | fix client body | no |
| `dismissal.notification.not_found` | Notification hidden/not found | 404 | refetch list | yes |
| `dismissal.notification.invalid_filter` | Bad notification filter | 422 | fix query | no |
| `dismissal.notification.school_context_required` | No school context | 403/422 | refresh session/scope | no |
| `dismissal.history.not_found` | History request hidden/not found | 404 | treat as inaccessible | yes |
| `dismissal.history.invalid_status_filter` | Bad history status | 422 | fix query | no |
| `dismissal.history.invalid_date_range` | `dateFrom` after `dateTo` | 422 | fix date picker | no |
| `dismissal.history.invalid_filter_combination` | activeOnly and terminalOnly both true | 422 | fix query | no |
| `dismissal.escalation.not_found` | Escalation target hidden/not found | 404 | treat as inaccessible | yes |
| `dismissal.escalation.not_allowed` | Escalation policy disallows | 409/403 | refetch actions | no |
| `dismissal.escalation.invalid_reason` | Reason not allowed | 422 | fix reason enum | no |
| `dismissal.escalation.terminal_request` | Terminal request escalation | 409 | hide escalation | no |

## No-Leak Field Checklist

Forbidden globally unless the special case below says otherwise:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `guardianId`
- `guardian.userId`
- `studentGuardianId`
- `student.userId`
- `student.applicationId`
- `enrollmentId`
- `requestedById`
- `actorUserId`
- `staffUserId`
- `handedOverById`
- assignment IDs
- internal event IDs
- `pickupCodeHash`
- `pickupCodeSalt`
- `pickupRecipientToken`
- `parentLatitude`
- `parentLongitude`
- `distanceMeters`
- `geofencePassed`
- `clientRequestId`
- `deletedAt`
- raw event metadata
- raw relation objects
- audit internals
- storage internals
- room names
- socket IDs

Special cases:

- `pickupRecipientToken` is allowed only in `GET /api/v1/dismissal/requests/:id/pickup-recipients`.
- Raw pickup code is allowed only in the first successful parent request creation response when required.

## Recommended Frontend State Machines

Parent tracker states: no settings, not in zone, outside window, child not eligible, requestable, active requested/queued/called/moving/at_gate/ready, terminal handed_over/cancelled/expired.

Staff queue states: active queue, request detail, waiting segment, ready for recipient selection, delivery confirmation, terminal history.

Staff action availability should be derived from public status and booleans, not guessed internal fields.

## Polling and Realtime Fallback

- Connect to realtime after authentication if available.
- Treat realtime as a hint, not source of truth.
- Refetch the active screen on every event.
- If offline or reconnected, refetch readiness, recent calls, active queue, waiting students, notifications, and history depending on current screen.
- Use REST polling when realtime is unavailable.
