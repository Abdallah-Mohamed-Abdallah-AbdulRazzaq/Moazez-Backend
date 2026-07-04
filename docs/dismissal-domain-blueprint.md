# Dismissal Domain Blueprint

Sprint: DISMISSAL-BLUEPRINT-0A - Dismissal Domain Blueprint + ADR Mapping

Status: documentation-only architecture blueprint

Baseline reviewed: `2c1a211 docs: define dismissal app architecture`

## 1. Executive Summary

Dismissal should be implemented as a new school-scoped core domain named `dismissal`, with canonical backend APIs under `/api/v1/dismissal`.

The Dismissal App ADRs describe user-facing screens for calls, gates, duties, waiting students, notifications, and profile. They should not be copied literally as backend module names or persistence design. The backend should translate those screen expectations into a normalized dismissal lifecycle that reuses existing IAM, memberships, roles, permissions, students, guardians, enrollments, communication, notification, files, audit, and school-scope foundations.

The recommended new user type is `DISMISSAL_STAFF`. It represents school operational staff who manage active dismissal requests, call students, verify pickup, and complete handover. It is separate from `PICKUP_DELEGATE`, which already exists and represents a pickup person/delegate rather than a staff app user.

This sprint does not implement runtime logic, schema changes, migrations, routes, DTOs, permissions, or user types. It defines the safe implementation path.

## 2. ADR Interpretation Rule

The Dismissal ADR files are product and frontend expectation documents. They include screen names, example payloads, and UI-oriented routes. Backend implementation must preserve the intended workflows without blindly adopting the names or data shapes.

| ADR frontend expectation | Backend canonical design | Reason |
| --- | --- | --- |
| `pickup` route namespace | `dismissal` domain and `/api/v1/dismissal` namespace | `pickup` is a product label. The backend domain is broader: settings, gates, assignments, queue, lifecycle, notifications, and handover. |
| `GET /api/v1/pickup/requests/active` | `GET /api/v1/dismissal/requests/active` | Keeps request lifecycle under the canonical domain. A frontend adapter alias can be considered only if contract stability requires it. |
| `PATCH /api/v1/pickup/requests/{id}/status` | `PATCH /api/v1/dismissal/requests/:id/status` or narrower action endpoints | Status transitions need backend validation, permissions, audit, and state machine rules. |
| `GET /api/v1/gates` | `GET /api/v1/dismissal/gates` | Gate records belong to the dismissal operational domain, not a global root namespace. |
| `PATCH /api/v1/gates/{id}/status` | `PATCH /api/v1/dismissal/gates/:id/status` | Prevents collision with future physical-facility or access-control gates. |
| `GET /api/v1/waiting-students` | `GET /api/v1/dismissal/waiting-students` | Waiting students are a read model derived from active dismissal requests, not an independent student module. |
| `GET /api/v1/notifications` | `GET /api/v1/dismissal/notifications` later, backed by Communication notifications | Avoids a second notification center. Keeps staff notification scope explicit. |
| `GET /api/v1/me/profile` | `GET /api/v1/dismissal/profile` plus existing `/api/v1/auth/me` permissions | Profile is app-surface composition. Machine permissions already belong in `/auth/me`. |
| ADR status `newRequest` | Backend state `REQUESTED` or `QUEUED`, presented as needed | Backend states should be stable, uppercase Prisma enums internally, and mapped by presenters. |
| ADR status `preparing` | Backend state `CALLED` or `MOVING` depending on action | "Preparing" hides two operational phases that require separate audit and visibility. |
| ADR status `ready` | Backend state `READY` | Good product concept; keep as canonical state after gate/readiness verification. |
| ADR status `delivered` | Backend state `HANDED_OVER` | "Delivered" can sound like notification delivery. "Handed over" is the domain event. |
| ADR status `delayed` | Computed `isDelayed` signal in V1 | A request can be `CALLED` and delayed at the same time. Storing `DELAYED` as a core status would lose lifecycle position. |

## 3. Existing Backend Reality

Current relevant backend facts:

- `UserType.PICKUP_DELEGATE` exists in `prisma/schema.prisma`.
- `UserType.DISMISSAL_STAFF` does not exist yet.
- `Guardian.userId` exists and links a Guardian profile to a `User`.
- `StudentGuardian` exists as the normalized student-guardian link.
- `Guardian.canPickup` exists and should be used before inventing delegate models.
- `Guardian.canReceiveNotifications` exists and should inform notification eligibility where relevant.
- `Enrollment` stores active classroom, grade, section, stage, academic year, and term placement.
- `SchoolProfile` stores school name, address, latitude, longitude, and map label fields.
- `SchoolProfile` should provide default geofence center inputs, not operational dismissal policy.
- `AppDeviceTokenSurface` currently supports `PARENT`, `STUDENT`, and `TEACHER`; it does not support Dismissal yet.
- `CommunicationNotification`, `CommunicationNotificationDelivery`, `CommunicationNotificationPushAttempt`, and `CommunicationNotificationPreference` already exist.
- Communication has conversations, participants, messages, reads, deliveries, attachments, reports, moderation, notifications, and policies.
- Parent App modules exist under `src/modules/parent-app`, not `src/modules/parent`.
- Auth lives under `src/modules/iam/auth`, not `src/modules/auth`.
- Parent App ownership is implemented through `ParentAppAccessService`, using current actor, active membership, `Guardian.userId`, `StudentGuardian`, and active `Enrollment`.
- Parent role permissions are locked and intentionally exclude generic `files.downloads.view` and `files.uploads.manage`.
- No pickup, smart-pickup, dismissal request, dismissal gate, dismissal setting, dismissal assignment, or dismissal queue core model exists today.
- No `src/modules/dismissal` module exists today.

Important current guard path:

1. `JwtAuthGuard` verifies token and sets actor.
2. `ScopeResolverGuard` resolves active membership and active school context.
3. `PermissionsGuard` checks `@RequiredPermissions()`.
4. Resource ownership or assignment checks must happen in use cases/services.

## 4. Actor Model and User Types

Recommended new user type: `DISMISSAL_STAFF`.

Rationale:

- `DISMISSAL_STAFF` is a school operational actor using the Dismissal App.
- `PICKUP_DELEGATE` is not the staff app user. It represents an authorized pickup person/delegate and may be the parent or another approved person.
- `PARENT` creates dismissal requests from the Parent App.
- `STUDENT` is the subject of the request, not the actor.
- `SCHOOL_USER` configures settings, gates, shifts, staff assignments, and policy from the School Dashboard.
- `SERVICE_ACCOUNT` can run expiration, delay escalation, notification, and cleanup jobs.

| Actor | UserType | Existing or new | App surface | Allowed actions | Forbidden actions | Ownership/scope model |
| --- | --- | --- | --- | --- | --- | --- |
| School administrator or operations admin | `SCHOOL_USER` | Existing | School Dashboard | Configure dismissal settings, gates, assignments, policy, view history, audit operational reports | Act as parent, bypass pickup verification, access unrelated schools | Active school membership plus dismissal admin permissions |
| Parent/guardian account | `PARENT` | Existing | Parent App | View smart-pickup readiness, create request for owned child, view recent calls, cancel before called if policy allows | Request unowned child, manage gates, act as staff, search arbitrary students | Current parent user -> `Guardian.userId` -> `StudentGuardian` -> active `Enrollment` |
| Pickup person/delegate | `PICKUP_DELEGATE` | Existing | Future delegate surface or parent-approved handover flow | Be verified as authorized pickup person where product approves delegate accounts | Use Dismissal Staff App, manage queue, configure settings | Per-student pickup authorization; V1 should prefer existing Guardian links |
| Dismissal staff | `DISMISSAL_STAFF` | New | Dismissal App | View assigned queue, call students, update lifecycle, verify code, confirm handover, view assigned gates, view own profile and notifications | Configure global settings unless separately granted, browse all parents/students, use broad communication admin powers | Active school membership, dismissal permissions, assignment visibility |
| Student | `STUDENT` | Existing | Student App | Potentially view own pickup history later | Create parent pickup requests, confirm handover, access staff queue | Own student account/enrollment only |
| System jobs | `SERVICE_ACCOUNT` | Existing | Background jobs | Expire stale requests, compute delay signals, generate notifications, publish realtime events later | Human workflow decisions unless policy says automatic | Service account scope and explicit job permissions/audit context |

## 5. Domain Naming and API Namespace

Canonical backend domain: `dismissal`.

Canonical future module path: `src/modules/dismissal/**`.

Canonical API namespace: `/api/v1/dismissal`.

Use `pickup` only as:

- a product label in presenter output when required by a frontend contract;
- an optional frontend alias if an adapter-backed path becomes fixed;
- a field name where it describes the pickup person or pickup code.

Do not name the core module `pickup`, because the domain includes settings, gates, staff assignment, queue lifecycle, notifications, audit, and handover.

## 6. End-to-End Flows

A. School Dashboard configures dismissal:

1. School admin enables dismissal settings.
2. School admin confirms school geofence center from `SchoolProfile`.
3. School admin configures dismissal-specific radius, time windows, code policy, and default gate.
4. School admin creates gates and basic waiting zones.
5. School admin assigns `DISMISSAL_STAFF` to gates/classes.
6. All settings and assignment changes are audited.

B. Parent opens Smart Pickup:

1. Parent authenticates as `UserType.PARENT`.
2. Parent access resolves `Guardian.userId`.
3. Linked students are resolved through `StudentGuardian`.
4. Active enrollments are resolved.
5. Response returns school zone, enabled status, open window, owned children, active queue count, and safe recent calls.

C. Parent creates dismissal request:

1. Parent submits owned `childId`, location, desired gate if supported, optional `clientRequestId`.
2. Backend validates ownership through Guardian -> StudentGuardian -> Student -> active Enrollment.
3. Backend validates `Guardian.canPickup` or approved delegate relationship.
4. Backend validates dismissal is enabled, request window, geofence, active enrollment, no duplicate active request.
5. Backend creates a `DismissalRequest` and first `DismissalRequestEvent`.
6. Audit logs `dismissal.request.created`.

D. Request enters active queue:

1. Request is visible to eligible `DISMISSAL_STAFF`.
2. Visibility uses staff assignments by gate, stage, grade, section, classroom, and optional shift.
3. If no assignment exists, secure default should be no visibility unless policy explicitly enables all-access staff.

E. Staff calls student:

1. Staff opens active queue.
2. Staff transitions `REQUESTED` or `QUEUED` to `CALLED`.
3. Backend records `calledAt`, actor, notes, and event.
4. Backend audits `dismissal.student.called`.

F. Student moves or arrives:

1. Staff records `MOVING`, `AT_GATE`, or `READY` depending on verified step.
2. Waiting-students screen is a read model over non-terminal requests after call.
3. `waitingMinutes` and `isDelayed` are computed from committed timestamps and settings.

G. Staff verifies pickup code and person:

1. Staff enters or scans pickup code.
2. Backend validates code, request state, authorized parent/delegate, and gate.
3. Backend records verification event without exposing code hash internals.

H. Staff marks handed over:

1. Staff submits handover command.
2. Backend requires valid state, authorized pickup person, optional verified code, and staff assignment.
3. Backend transitions to `HANDED_OVER`.
4. Backend records audit, event, and future notification/realtime event.

I. Parent receives status updates:

1. V1 can return status through REST recent calls.
2. V2 can add in-app dismissal notifications through Communication notifications.
3. V3 can add push/realtime after persistence and lifecycle are stable.

J. Delayed requests escalate:

1. Backend computes delayed and urgent signals from `delayThresholdMinutes` and `urgentThresholdMinutes`.
2. Manual escalation creates a request event and audit record.
3. Future notification event can alert assigned leads or admins.

K. History/audit:

1. School users with history permission can view safe history.
2. Audit internals remain hidden from normal API responses.
3. `DismissalRequestEvent` provides domain history; `AuditLog` provides sensitive mutation trace.

## 7. Parent App Flow

Recommended parent endpoints:

| Endpoint | V1/V2 | Purpose |
| --- | --- | --- |
| `GET /api/v1/parent/smart-pickup` | V1 | Read readiness, zone, owned children, active queue summary, safe recent calls |
| `POST /api/v1/parent/smart-pickup/requests` | V1 | Create a dismissal request for an owned child |
| `GET /api/v1/parent/smart-pickup/recent-calls` | V1 | List safe recent dismissal requests for owned children |
| `POST /api/v1/parent/smart-pickup/requests/:id/cancel` | V2 | Cancel before called if policy allows |

Validation rules:

- Actor must be `UserType.PARENT`.
- Parent must have an active membership and current school scope under current V1 parent app rules.
- `childId` must be verified; never trust it from the frontend.
- Ownership resolves current authenticated parent user -> `Guardian.userId` -> `StudentGuardian` -> `Student` -> active `Enrollment`.
- Student must be active.
- Student must have active enrollment in the resolved school context.
- Guardian/delegate must be allowed to pickup.
- Use existing `Guardian.canPickup` where possible.
- School dismissal must be enabled.
- Request must be inside configured request window unless policy allows override.
- Geofence must pass when configured.
- No duplicate active request for the same student.
- Use `clientRequestId` for idempotency if supported.
- Return safe 404 for unowned or out-of-scope child/request IDs.

Parent response rules:

- Use presenters for frontend-specific casing.
- Do not expose internal IDs except approved public request/student IDs.
- Do not expose `schoolId`, `organizationId`, membership, guardian `userId`, or raw internal enrollment IDs.

## 8. Dismissal Staff App Flow

Recommended canonical staff endpoints:

| Endpoint | V1/V2/V3 | Purpose |
| --- | --- | --- |
| `GET /api/v1/dismissal/profile` | V1 | Current staff profile, assignment summary, safe stats |
| `GET /api/v1/dismissal/requests/active` | V1 | Active queue filtered by staff visibility |
| `PATCH /api/v1/dismissal/requests/:id/status` | V1 | Controlled lifecycle transition |
| `POST /api/v1/dismissal/requests/:id/verify-code` | V1 | Verify pickup code before handover when required |
| `POST /api/v1/dismissal/requests/:id/hand-over` | V1 | Complete handover |
| `GET /api/v1/dismissal/waiting-students` | V1 | Read model over called/moving/at-gate/ready requests |
| `GET /api/v1/dismissal/gates` | V1 | Gate list and operational status |
| `PATCH /api/v1/dismissal/gates/:id/status` | V1 | Gate status mutation for authorized staff/admins |
| `GET /api/v1/dismissal/requests/history` | V2 | Paginated history and filters |
| `POST /api/v1/dismissal/requests/:id/escalate` | V2 | Manual escalation with reason |
| `GET /api/v1/dismissal/notifications` | V2 | Staff notification center backed by Communication notifications |
| `PATCH /api/v1/dismissal/notifications/:id/read` | V2 | Mark staff notification read |
| `PATCH /api/v1/dismissal/notifications/read-all` | V2 | Mark all staff notifications read |
| `GET /api/v1/dismissal/gates/:id/shifts` | V2 | Full shift plan |
| `POST /api/v1/dismissal/gates/:id/handover` | V2 | Shift handover |
| Realtime queue events | V3 | Live updates after lifecycle is stable |
| Push/device tokens for staff | V3 | Requires `AppDeviceTokenSurface.DISMISSAL_STAFF` |

Do not implement all endpoints in one runtime sprint. Start with identity, settings, gates, assignments, parent request creation, then queue lifecycle.

## 9. School Dashboard Flow

Recommended school-side admin endpoints:

| Endpoint | Purpose | Permission |
| --- | --- | --- |
| `GET /api/v1/dismissal/settings` | Read settings | `dismissal.settings.view` |
| `PATCH /api/v1/dismissal/settings` | Manage settings | `dismissal.settings.manage` |
| `GET /api/v1/dismissal/gates` | List gates for dashboard/admin | `dismissal.gates.view` |
| `POST /api/v1/dismissal/gates` | Create gate | `dismissal.gates.manage` |
| `GET /api/v1/dismissal/gates/:id` | Read gate | `dismissal.gates.view` |
| `PATCH /api/v1/dismissal/gates/:id` | Update gate | `dismissal.gates.manage` |
| `GET /api/v1/dismissal/staff-assignments` | List assignments | `dismissal.staff.view` |
| `POST /api/v1/dismissal/staff-assignments` | Create assignment | `dismissal.staff.manage` |
| `PATCH /api/v1/dismissal/staff-assignments/:id` | Update assignment | `dismissal.staff.manage` |
| `DELETE /api/v1/dismissal/staff-assignments/:id` | Remove assignment | `dismissal.staff.manage` |

Dashboard endpoints remain under the core dismissal domain. App-specific frontend shaping belongs in presenters, not schema.

## 10. Pickup Delegate Model

V1 recommendation:

- Do not confuse `PICKUP_DELEGATE` with `DISMISSAL_STAFF`.
- Use existing `Guardian.canPickup` first.
- A pickup person should be either:
  - the requesting parent/guardian linked through `Guardian.userId`; or
  - an approved guardian/delegate linked to the student through current guardian records and `StudentGuardian`.
- Do not create external non-guardian delegate accounts in V1 unless product explicitly approves.
- Do not create a parallel parent-child ownership model.

Future V2/V3:

- If product needs temporary external delegates, design a `PickupDelegate` or `DismissalPickupAuthorization` model with expiry, identity proof, relationship, status, audit, and school-scoped visibility.
- If `UserType.PICKUP_DELEGATE` becomes a login surface, it must have route-local ownership checks and no staff permissions.

## 11. Domain Lifecycle and State Machine

Recommended canonical states:

- `REQUESTED`
- `QUEUED`
- `CALLED`
- `MOVING`
- `AT_GATE`
- `READY`
- `HANDED_OVER`
- `CANCELLED`
- `EXPIRED`

`DELAYED` should be a computed signal in V1, not a terminal/core status. A request can be `CALLED`, `MOVING`, or `AT_GATE` and delayed at the same time. Store timestamps and compute:

- `waitingMinutes`
- `isDelayed`
- `isUrgent`
- `delayLevel`

If a future sprint stores `DELAYED`, it should be stored as a flag or event, not as a replacement for lifecycle status.

Transition matrix:

| From | To | Allowed actor | Permission | Validation | Audit event | Later notification/realtime event |
| --- | --- | --- | --- | --- | --- | --- |
| none | `REQUESTED` | `PARENT`, service account | `parent.smart_pickup.request` | Own child, active enrollment, enabled, window, geofence, can pickup, no duplicate | `dismissal.request.created` | `dismissal.request.created` |
| `REQUESTED` | `QUEUED` | system or `DISMISSAL_STAFF` | `dismissal.requests.manage` | Gate open, staff visibility, request active | `dismissal.request.queued` | `dismissal.request.status_changed` |
| `REQUESTED` | `CALLED` | `DISMISSAL_STAFF` | `dismissal.requests.manage` | Staff assigned or admin, gate open, request not terminal | `dismissal.student.called` | `dismissal.request.status_changed` |
| `QUEUED` | `CALLED` | `DISMISSAL_STAFF` | `dismissal.requests.manage` | Staff assigned or admin, gate open | `dismissal.student.called` | `dismissal.request.status_changed` |
| `CALLED` | `MOVING` | `DISMISSAL_STAFF` | `dismissal.requests.manage` | Student called, not terminal | `dismissal.request.status_changed` | `dismissal.request.status_changed` |
| `MOVING` | `AT_GATE` | `DISMISSAL_STAFF` | `dismissal.requests.manage` | Student arrived at assigned gate | `dismissal.arrival.confirmed` | `dismissal.request.status_changed` |
| `CALLED` | `AT_GATE` | `DISMISSAL_STAFF` | `dismissal.requests.manage` | Direct arrival allowed by policy | `dismissal.arrival.confirmed` | `dismissal.request.status_changed` |
| `AT_GATE` | `READY` | `DISMISSAL_STAFF` | `dismissal.requests.deliver` | Pickup person present, code requirement satisfied or pending handover check | `dismissal.request.ready` | `dismissal.request.status_changed` |
| `READY` | `HANDED_OVER` | `DISMISSAL_STAFF` | `dismissal.requests.deliver` | Pickup code valid if required, authorized pickup person, request not terminal | `dismissal.handover.completed` | `dismissal.request.handed_over` |
| `AT_GATE` | `HANDED_OVER` | `DISMISSAL_STAFF` | `dismissal.requests.deliver` | Policy permits combined ready/handover, code valid if required | `dismissal.handover.completed` | `dismissal.request.handed_over` |
| `REQUESTED` | `CANCELLED` | `PARENT`, `SCHOOL_USER` | `parent.smart_pickup.cancel` or `dismissal.requests.manage` | Parent owns request; policy allows cancel before called | `dismissal.request.cancelled` | `dismissal.request.status_changed` |
| `QUEUED` | `CANCELLED` | `PARENT`, `SCHOOL_USER` | `parent.smart_pickup.cancel` or `dismissal.requests.manage` | Policy allows cancel before called | `dismissal.request.cancelled` | `dismissal.request.status_changed` |
| active non-terminal | `EXPIRED` | service account | service account job permission | Past expiry threshold, not handed over/cancelled | `dismissal.request.expired` | `dismissal.request.status_changed` |
| active non-terminal | same status with escalation event | `DISMISSAL_STAFF`, system | `dismissal.requests.escalate` | Delay/urgent threshold or manual reason | `dismissal.request.escalated` | `dismissal.request.delayed` |

Terminal states:

- `HANDED_OVER`
- `CANCELLED`
- `EXPIRED`

Terminal requests must not return from active queue unless explicitly filtered by history endpoints.

## 12. Settings and Geofence Policy

Proposed model: `DismissalSettings`.

Recommended fields:

- `id`
- `schoolId`
- `enabled`
- `timezone`
- `schoolLatitude`
- `schoolLongitude`
- `allowedRadiusMeters`
- `requestWindowStartLocal`
- `requestWindowEndLocal`
- `delayThresholdMinutes`
- `urgentThresholdMinutes`
- `requirePickupCode`
- `allowDelegatePickup`
- `allowParentCancelBeforeCalled`
- `defaultGateId`
- `createdAt`
- `updatedAt`
- `updatedById`

Relationship to `SchoolProfile`:

- `SchoolProfile` may provide default school name, address, latitude, longitude, and map label.
- `DismissalSettings` owns dismissal-specific radius, active window, delay thresholds, code policy, delegate policy, and default gate.
- Do not overload `SchoolProfile` with operational dismissal policy.
- Settings updates should copy or reference school coordinates intentionally and audit the change.

Geofence rules:

- Enforcement is server-side.
- Client coordinates are inputs, not truth.
- Validate distance from configured dismissal center.
- Record parent location, server time, request id, risk score, and validation result in domain event/audit-safe payload.
- Do not expose spoofing internals to frontend.
- Advanced anti-spoofing remains out of V1 unless explicitly approved.

## 13. Gates, Waiting Zones, Shifts, and Duties

Proposed models:

- `DismissalGate`
- `DismissalGateWaitingZone`
- `DismissalShift`
- `DismissalShiftAssignment`

Recommended V1:

- `DismissalSettings`
- `DismissalGate`
- Basic waiting zone labels either as `DismissalGateWaitingZone` or a constrained JSON/string list on the gate if runtime scope needs speed
- Gate operational status
- Gate enabled/disabled
- Gate display name, campus/building label, sort order, notes

Recommended V2:

- Full shifts
- Shift handover
- Radio channels
- Staff duty tasks
- Current/next shift computation
- Advanced waiting zone movement

Gate statuses:

- `OPEN`
- `BUSY`
- `CLOSED`
- `MAINTENANCE`

Gate metrics:

- `activeRequests`
- `averageWaitMinutes`
- `delayedCount`

Metrics should be derived from active requests, not stored as primary truth unless later performance requires cached aggregates.

## 14. Staff Assignments and Visibility

Proposed model: `DismissalStaffAssignment`.

Scope dimensions:

- `gateId`
- `stageId`
- `gradeId`
- `sectionId`
- `classroomId`
- `shiftId` optional
- `isLead`
- `startsAt` optional
- `endsAt` optional
- `createdAt`
- `updatedAt`

Rules:

- Staff sees only assigned gates/classes if assignments exist.
- School admins with management/history permissions can see all within school scope.
- Staff assignment checks happen in the service/use-case layer after guards and permissions.
- Staff must never see cross-school requests.
- Staff must not gain generic student, guardian, file, or communication admin access through dismissal.

Recommended secure fallback:

- Staff sees no requests until assigned.
- A school-level setting may later enable all-access staff, but this should be an explicit policy and audit event.

Open decision:

- Product/operations must confirm whether unassigned staff should see all gates by default for small schools. Secure backend default is none.

## 15. Notifications and Realtime Strategy

Existing notification foundations:

- `CommunicationNotification`
- `CommunicationNotificationDelivery`
- `CommunicationNotificationPushAttempt`
- `CommunicationNotificationPreference`
- `AppDeviceToken`
- `AppDeviceTokenSurface` with `PARENT`, `STUDENT`, `TEACHER`
- App-facing notification centers for Parent, Student, and Teacher surfaces

Recommended staged integration:

V1:

- Emit dismissal domain events and audit logs.
- Do not create a Dismissal notification center yet.
- Do not add push/device-token surface yet.

V2:

- Add in-app dismissal notifications for staff if needed.
- Prefer integrating with `CommunicationNotification` by adding safe dismissal source/type/category values.
- Add a dismissal/staff app-facing notification service similar to Parent Notifications, scoped to current staff user and assignment.

V3:

- Add push/device support only if mobile Dismissal App requires it.
- Extend `AppDeviceTokenSurface` carefully with a dismissal staff surface.
- Add permission checks, routes, DTOs, and tests for registering/unregistering dismissal staff device tokens.

Expected future events:

- `dismissal.request.created`
- `dismissal.request.status_changed`
- `dismissal.request.delayed`
- `dismissal.request.handed_over`
- `dismissal.gate.status_changed`
- `dismissal.notification.created`

Realtime rules:

- REST-first lifecycle.
- Realtime events only after request persistence and transition rules are stable.
- Events must be derived from committed DB state.
- Do not publish from uncommitted transactions.
- Realtime payloads must use presenter-safe fields.

## 16. Communication/Chat Integration Strategy

Should `DISMISSAL_STAFF` use existing Communication module?

Yes, eventually. Dismissal must not create a separate chat system.

Safe V1:

- No new chat creation.
- No arbitrary parent search by dismissal staff.
- No broad teacher/admin chat permissions.
- No dismissal-specific chat tables.
- If contact info is displayed for handover safety, keep it policy-controlled and masked where required.
- Existing communication entry points may be exposed only when parent/staff are authorized participants under current Communication rules.

V2 request-scoped communication:

- Consider request-scoped conversations using existing `CommunicationConversation` and participants.
- Store dismissal request reference in conversation metadata only if no stronger relation exists and schema policy approves it.
- Auto-create conversations only after explicit product/security approval.
- Limit participants to the authorized parent/guardian and assigned staff or lead.
- Close or archive request-scoped conversations after a retention period.

Answers to required design questions:

| Question | Recommendation |
| --- | --- |
| Should `DISMISSAL_STAFF` use existing communication module? | Yes, but not in V1 foundation. |
| How can staff communicate with parent safely? | Through existing participant conversations or future request-scoped conversations with strict policy. |
| Should dismissal request create a temporary conversation? | Not in V1. Consider V2 after lifecycle and participant policy are stable. |
| Should staff be able to search parents? | No arbitrary parent search. Staff may see only the authorized guardian/pickup contact for visible active requests. |
| What is the safe V1? | No chat creation; display only safe contact fields for visible active requests if policy approves. |

## 17. Data Model Proposal

No schema is changed in this sprint. The following is a future model proposal.

| Model | Purpose | Required tenant fields | Key relations | Safe public fields | Unsafe internal fields | Important indexes | V1/V2 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DismissalSettings` | School policy and geofence settings | `schoolId` | `school`, `defaultGate`, `updatedBy` | enabled, window labels, radius, safe zone center, code policy | `schoolId`, `updatedById`, raw policy internals if sensitive | unique `schoolId`, `defaultGateId` | V1 |
| `DismissalGate` | Pickup/handover point | `schoolId` | `school`, optional default settings relation | public gate id/code, name, campus, status, waiting zone labels | `schoolId`, internal notes, deletedAt | `schoolId,status`, `schoolId,code`, `schoolId,sortOrder` | V1 |
| `DismissalGateWaitingZone` | Structured waiting zones per gate | `schoolId` | `gate` | label, sort order, active flag | internal id unless approved | `schoolId,gateId`, unique `schoolId,gateId,label` | V1 if needed, otherwise V2 |
| `DismissalStaffAssignment` | Staff visibility and duties | `schoolId` | `user`, `gate`, academic structure, optional shift | staff display name, gate/class labels, lead flag | `userId`, membershipId, roleId | `schoolId,userId`, `schoolId,gateId`, scope compound indexes | V1 |
| `DismissalRequest` | Core request lifecycle | `schoolId`, `organizationId` | `student`, `enrollment`, `guardian`, `gate`, `requestedBy`, `assignedStaff`, pickup guardian/delegate | requestId/display code, student display name, grade/section labels, gate, status, timestamps, waiting minutes | `studentId`, `guardian.userId`, `pickupCodeHash`, location risk internals, actor IDs | `schoolId,status`, `schoolId,studentId,status`, `schoolId,gateId,status`, `schoolId,requestedAt`, unique active per student | V1 |
| `DismissalRequestEvent` | Domain event history | `schoolId` | `request`, `actorUser` | public event type, safe note, timestamp | actorId, before/after internals, raw verification payload | `schoolId,requestId,createdAt`, `schoolId,type,createdAt` | V1 |
| `DismissalNotification` or Communication extension | Staff notification center if Communication cannot safely cover it | `schoolId` | user/request/gate | title, body, priority, read state | source internals, raw actor IDs | `schoolId,userId,status`, `schoolId,createdAt` | Prefer Communication in V2 |
| `DismissalShift` | Shift window and duty metadata | `schoolId` | gate, school | title, type, startsAt, endsAt | internal staffing notes | `schoolId,gateId,startsAt` | V2 |
| `DismissalShiftAssignment` | Staff assigned to shift | `schoolId` | shift, user | staff display, role label, isLead | userId, roleId | `schoolId,shiftId`, `schoolId,userId` | V2 |
| `DismissalShiftHandover` | Shift handover trace | `schoolId` | shift, fromStaff, toStaff, gate | safe summary, open request count | internal notes, actor IDs | `schoolId,gateId,createdAt` | V2 |
| `DismissalComplaint` or escalation record | Complaint/escalation workflow | `schoolId` | request, actor | safe reason, status | internal investigation details | `schoolId,requestId`, `schoolId,status` | V2 |
| `PickupDelegate` or `DismissalPickupAuthorization` | Temporary external delegate if Guardian is insufficient | `schoolId` | student, guardian/user, request | display name, relation, expiry | identity proof, phone, raw document refs | `schoolId,studentId,status`, `expiresAt` | V2 only if approved |

Implementation notes:

- Every tenant-scoped model must be added to `SCHOOL_SCOPED_MODELS`.
- Soft-delete should be considered for settings/gates/assignments/requests where history matters.
- Use UUID primary keys and `@@map` snake_case tables.
- Store pickup codes hashed, not plaintext.
- Use presenters to map internal enum values to frontend contract names.

## 18. Permissions Proposal

Dismissal permissions:

- `dismissal.profile.view`
- `dismissal.settings.view`
- `dismissal.settings.manage`
- `dismissal.gates.view`
- `dismissal.gates.manage`
- `dismissal.staff.view`
- `dismissal.staff.manage`
- `dismissal.requests.view`
- `dismissal.requests.manage`
- `dismissal.requests.deliver`
- `dismissal.requests.escalate`
- `dismissal.requests.history.view`
- `dismissal.notifications.view`
- `dismissal.notifications.manage`

Parent Smart Pickup permissions:

- `parent.smart_pickup.view`
- `parent.smart_pickup.request`
- `parent.smart_pickup.cancel`

Rules:

- Do not reuse broad dashboard permissions for Dismissal App actions.
- Do not give `DISMISSAL_STAFF` generic student or guardian management permissions.
- Do not give `DISMISSAL_STAFF` generic files permissions unless a resource-owned file use case is explicitly built.
- Do not give `DISMISSAL_STAFF` `communication.notifications.manage`; staff notification reads should use app-facing notification permissions or dismissal-specific permissions.
- `/auth/me` should return dismissal permissions through the existing membership permission mapping.

## 19. API Contract Proposal

Parent App:

```http
GET  /api/v1/parent/smart-pickup
POST /api/v1/parent/smart-pickup/requests
GET  /api/v1/parent/smart-pickup/recent-calls
POST /api/v1/parent/smart-pickup/requests/:id/cancel
```

Dismissal Staff App:

```http
GET   /api/v1/dismissal/profile
GET   /api/v1/dismissal/requests/active
PATCH /api/v1/dismissal/requests/:id/status
POST  /api/v1/dismissal/requests/:id/escalate
POST  /api/v1/dismissal/requests/:id/verify-code
POST  /api/v1/dismissal/requests/:id/hand-over
GET   /api/v1/dismissal/requests/history
GET   /api/v1/dismissal/waiting-students
GET   /api/v1/dismissal/gates
PATCH /api/v1/dismissal/gates/:id/status
GET   /api/v1/dismissal/notifications
PATCH /api/v1/dismissal/notifications/:id/read
PATCH /api/v1/dismissal/notifications/read-all
```

School Dashboard/Admin:

```http
GET    /api/v1/dismissal/settings
PATCH  /api/v1/dismissal/settings
GET    /api/v1/dismissal/gates
POST   /api/v1/dismissal/gates
GET    /api/v1/dismissal/gates/:id
PATCH  /api/v1/dismissal/gates/:id
GET    /api/v1/dismissal/staff-assignments
POST   /api/v1/dismissal/staff-assignments
PATCH  /api/v1/dismissal/staff-assignments/:id
DELETE /api/v1/dismissal/staff-assignments/:id
```

Response rules:

- Use DTOs for request/response contracts.
- Use presenters for contract-specific shapes.
- Keep `/api/v1/` prefix in every test and contract.
- Do not hardcode internal route aliases without approval.
- Status values may be lower/camel-cased in presenter output if frontend needs it, but storage should follow Prisma enum conventions.

## 20. No-Leak and Security Model

Dismissal responses must not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `actorId`
- `userId`
- `guardian.userId`
- `student.userId`
- `student.applicationId`
- internal enrollment ids unless approved
- internal decision/admission ids
- storage bucket
- `objectKey`
- raw signed URLs
- audit internals
- `passwordHash`
- `deletedAt`
- raw Prisma enum names if contract expects public values
- pickup code hash
- geofence spoofing internals

Allowed public fields can include:

- request public UUID or display code
- student display name
- grade, section, stage labels
- gate display name
- waiting zone label
- guardian/delegate display name
- relation
- masked or policy-controlled phone
- pickup code only to authorized actors
- request status
- timestamps
- waiting minutes
- delay/urgent signal
- safe notes

Phone masking:

- Open decision for product/security.
- Recommended V1 default: mask phone for ordinary staff queue views; show full phone only to authorized lead/admin or when required for active handover and audited.

Security requirements:

- Staff request visibility must intersect school scope, permissions, and staff assignments.
- Parent request creation must validate ownership every time.
- Cross-school and unowned IDs should return safe 404.
- Do not use `platformBypass` for ordinary dismissal reads.
- Do not place business logic in controllers.
- Do not use Prisma directly in controllers.
- Mutations must be transactional.
- Sensitive mutations must audit success and denial/failure where appropriate.

## 21. Audit Logging Model

Every sensitive mutation must be auditable:

- request created
- status changed
- student called
- arrival confirmed
- pickup code verified
- handover completed
- request cancelled
- request expired
- request escalated
- gate status changed
- settings changed
- assignment changed
- shift handover completed later
- notification generated later

Audit record expectations:

- `actorId`
- `userType`
- `schoolId`
- `organizationId`
- module `dismissal`
- action
- resource type
- resource id
- before/after where safe
- outcome
- timestamp

Do not expose audit internals in normal API responses.

## 22. Validation and Error Model

Recommended error codes:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `dismissal.settings.disabled` | 409 | Dismissal is disabled for this school |
| `dismissal.request.outside_window` | 422 | Request outside configured dismissal window |
| `dismissal.request.outside_geofence` | 422 | Parent location outside allowed radius |
| `dismissal.request.student_not_owned` | 404 | Parent does not own requested child or child is outside scope |
| `dismissal.request.student_not_active` | 409 | Student is not active |
| `dismissal.request.no_active_enrollment` | 404 | Student has no active enrollment |
| `dismissal.request.duplicate_active` | 409 | Student already has an active request |
| `dismissal.request.guardian_not_allowed` | 403 | Guardian/delegate is not allowed to pickup |
| `dismissal.request.invalid_transition` | 409 | Status transition is invalid |
| `dismissal.request.pickup_code_required` | 422 | Pickup code is required |
| `dismissal.request.pickup_code_invalid` | 403 | Pickup code does not match |
| `dismissal.request.already_handed_over` | 409 | Request is already handed over |
| `dismissal.staff.not_assigned` | 403 | Staff is not assigned to the request scope |
| `dismissal.gate.closed` | 409 | Gate is closed |
| `dismissal.gate.not_found` | 404 | Gate not found or outside scope |
| `dismissal.assignment.conflict` | 409 | Staff assignment overlaps/conflicts |

Implementation rules:

- Add future error codes to `ERROR_CATALOG.md` and i18n files in the implementation sprint.
- Use stable machine codes.
- Match error codes in tests, not messages.

## 23. Testing Strategy

Future runtime sprints should include:

- Unit tests for lifecycle state machine and transition policy.
- Unit tests for geofence distance validation.
- Unit tests for pickup code hashing/verification.
- Unit tests for presenters/no-leak mapping.
- Integration tests for repositories and use cases.
- E2E tests for parent request creation, staff queue, call, arrival, verify code, handover, cancellation/expiry.
- Security tests in `test/security/tenancy.dismissal.spec.ts` for cross-school gates, requests, settings, assignments, and history.
- Permission metadata inventory tests for every dismissal route.
- Role seed integrity tests once `DISMISSAL_STAFF` and permissions are added.
- `/auth/me` permission exposure tests for `DISMISSAL_STAFF`.
- Parent permission regression proving parent role gets only `parent.smart_pickup.*`, not dashboard or staff permissions.
- No-leak tests for school/org IDs, user IDs, membership IDs, file internals, audit internals, pickup code hash, and geofence internals.
- Notification tests only when notification integration is added.
- Realtime tests only after V3 live events are implemented.

## 24. Incremental Sprint Breakdown

| Sprint | Goal | Likely allowed files | Schema impact | Tests expected | Risk | Dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| `DISMISSAL-IAM-1A` | Add `DISMISSAL_STAFF` user type and dismissal permissions/role seed | `prisma/schema.prisma`, migration, seeds, IAM tests, docs | Yes | Prisma validate, seed, auth/me, permission seed integrity | High | This blueprint, user type approval |
| `DISMISSAL-CORE-1A` | Settings and gates foundation | `src/modules/dismissal/**`, schema, migration, tests | Yes | settings/gates unit/e2e/security | High | IAM-1A |
| `DISMISSAL-STAFF-1A` | Staff assignments and profile | dismissal module, schema, tests | Yes | assignment visibility, profile, no-leak, tenancy | High | CORE-1A |
| `PARENT-DISMISSAL-1A` | Parent Smart Pickup readiness read | parent-app smart pickup module, dismissal read adapter, tests | Maybe no if CORE ready | Parent ownership, no-leak, disabled state | Medium | CORE-1A |
| `PARENT-DISMISSAL-1B` | Parent request creation | dismissal request model/use cases, parent route, tests | Yes | ownership, geofence, duplicate, idempotency | High | STAFF-1A |
| `DISMISSAL-CALLS-1A` | Active requests queue | dismissal queue use cases/controllers/presenters | No/Maybe | staff visibility, filters, summary, no-leak | High | Parent request creation |
| `DISMISSAL-CALLS-1B` | Request lifecycle transitions | transition policy, events, audit | Maybe | state matrix, invalid transitions, audit | High | CALLS-1A |
| `DISMISSAL-WAITING-1A` | Waiting students and arrival confirmation | waiting read model/use cases | No/Maybe | waiting filters, delay signal, arrival | Medium | CALLS-1B |
| `DISMISSAL-DELIVERY-1A` | Pickup code verification and handover | code policy, handover use cases | Maybe | code required/invalid, authorized pickup, terminal state | High | WAITING-1A |
| `DISMISSAL-HISTORY-1A` | History, delays, escalations | history query, escalation events | Maybe | pagination, delay compute, escalation permission | Medium | DELIVERY-1A |
| `DISMISSAL-NOTIF-1A` | Dismissal notification center | communication enum extension, app-facing notification alias, tests | Yes | notification recipient, preferences, no-leak | Medium | HISTORY-1A |
| `DISMISSAL-REALTIME-1A` | Live queue events | realtime infra/adapters/tests | Maybe | committed-state event tests, socket auth | Medium | NOTIF-1A |
| `DISMISSAL-FE-CONTRACT-1A` | Frontend contract final audit | docs/tests only or small presenters | No | route inventory, no-leak snapshots | Low | All prior Dismissal sprints |

## 25. Open Decisions

1. Should unassigned `DISMISSAL_STAFF` see all requests by default for small schools, or see none until assigned? Recommended secure default: none.
2. Should parent/staff phone numbers be masked by default, and who can see full phone during active handover?
3. Is `clientRequestId` required for parent dismissal request idempotency in V1?
4. Does V1 need separate `QUEUED`, or can `REQUESTED` serve as queue entry until staff call?
5. Should waiting zones be normalized in V1 or kept as gate-level labels until operations mature?
6. Should code verification be mandatory for all schools, or controlled entirely by `requirePickupCode`?
7. How should multi-school parent pickup work if a parent has active children in multiple schools under current parent active-school scope?
8. Should request-scoped staff-parent chat be part of V2, or should contact remain outside Dismissal App?
9. Should Dismissal notifications use new Communication enum values or a separate domain notification table if enum churn becomes too high?
10. What is the retention policy for dismissal requests, events, location validation payloads, and pickup code verification traces?
11. Should `PICKUP_DELEGATE` become a real login surface in V2, or remain only a conceptual/relationship actor?
12. Does dismissal integrate with Attendance early-leave in any workflow, or stay separate from attendance semantics?

## 26. Explicit Non-Goals

This blueprint does not implement:

- runtime logic
- schema changes
- migrations
- DTOs
- controllers
- modules
- routes
- seeds
- `UserType.DISMISSAL_STAFF`
- permissions
- realtime
- push notification support
- chat creation
- file upload/download
- external delegate accounts
- platform billing
- finance
- HR
- wallet
- marketplace
- advanced smart pickup
- advanced analytics builder

This blueprint also does not change Dismissal ADR files. It maps them into the existing backend architecture.
