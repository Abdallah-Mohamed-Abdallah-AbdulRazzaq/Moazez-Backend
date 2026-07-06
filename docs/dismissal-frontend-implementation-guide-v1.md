# Dismissal Frontend Implementation Guide V1

This guide translates the final backend contract into practical screen and client behavior.

## Screen Map

Parent:

- Smart Pickup readiness/home
- Create pickup request
- Active request tracker
- Recent calls/history
- Cancel request flow

Dismissal Staff:

- Profile/assignment landing
- Active queue
- Request detail
- Waiting students
- Pickup recipients selection
- Delivery/handover
- Notifications
- History
- Escalation action

School Admin:

- Settings
- Gates
- Staff assignments/profile oversight
- Active queue oversight
- History/detail

## Parent App Flow

1. Load `GET /api/v1/parent/smart-pickup` on screen open.
2. If `status.canRequestNow=false`, render the stable reason strings and child-level `blockedReason`.
3. When a child has `activeRequest`, open the tracker instead of creating a duplicate request.
4. To create a request, send `POST /api/v1/parent/smart-pickup/requests` with child, coordinates, optional gate, and a generated `clientRequestId`.
5. Store and display the raw pickup code only from the first creation response. Do not expect it later.
6. Use `GET /api/v1/parent/smart-pickup/recent-calls` for tracker/history and after realtime events.
7. Show cancel only when `canCancel=true`; call `POST /api/v1/parent/smart-pickup/requests/:id/cancel`.

Safe retry:

- Retrying creation with the same `clientRequestId` is safe only for the same intent.
- Retrying cancel is safe; already-cancelled returns `changed=false`.

## Dismissal Staff Flow

1. Load `GET /api/v1/dismissal/profile` after login.
2. If `readiness.hasAssignments=false`, show an empty assignment state.
3. Load active work from `GET /api/v1/dismissal/requests/active`.
4. Open request detail with `GET /api/v1/dismissal/requests/:id`.
5. Move lifecycle through `PATCH /api/v1/dismissal/requests/:id/status`.
6. Use `GET /api/v1/dismissal/waiting-students` for called/moving/at-gate/ready operational view.
7. Use `POST /api/v1/dismissal/waiting-students/:id/arrival` for arrival confirmation.
8. When status is `ready`, call `GET /api/v1/dismissal/requests/:id/pickup-recipients`.
9. Use one returned `pickupRecipientToken` immediately in `POST /api/v1/dismissal/requests/:id/deliver`, along with pickup code if policy requires it.
10. Use `GET /api/v1/dismissal/notifications` for staff notification center.
11. Use history and escalation only from history/detail or active detail screens where user has permission.

## School Admin Flow

Settings:

- Read with `GET /api/v1/dismissal/settings`.
- Save with `PATCH /api/v1/dismissal/settings`.
- Keep timezone, coordinates, radius, window, delay/urgent/expiry thresholds, code policy, delegate policy, cancel policy, and default gate in the admin form.

Gates:

- List with `GET /api/v1/dismissal/gates`.
- Create/update with `POST/PATCH /api/v1/dismissal/gates`.
- Gate statuses are `open`, `busy`, `closed`, `maintenance`.

Assignments:

- Manage with `/api/v1/dismissal/staff-assignments`.
- Require at least one scope dimension: gate or academic scope.

## State Machine Usage

Use public status values:

- `requested`
- `queued`
- `called`
- `moving`
- `at_gate`
- `ready`
- `handed_over`
- `cancelled`
- `expired`

Allowed staff PATCH transitions:

- `requested -> queued`
- `requested -> called`
- `queued -> called`
- `called -> moving`
- `called -> at_gate`
- `moving -> at_gate`
- `at_gate -> ready`

Terminal transitions:

- `ready -> handed_over` only through delivery.
- `requested/queued -> cancelled` only through parent cancel.
- active status -> `expired` only through the internal expiration worker.

Never send terminal statuses through generic PATCH.

## REST and Realtime

Connect to the existing realtime gateway after auth.

Do not rely on realtime as the source of truth.

On event, refetch the affected REST endpoint:

| Event | Suggested refetch |
| --- | --- |
| `dismissal.request.created` | active queue |
| `dismissal.request.cancelled` | active queue, history |
| `dismissal.request.status_changed` | active queue/detail/waiting/recent calls/history |
| `dismissal.request.arrival_confirmed` | waiting students/detail |
| `dismissal.request.delivered` | active queue/history |
| `dismissal.queue.changed` | active queue |
| `parent.smart_pickup.request.changed` | readiness/recent calls |
| `dismissal.notification.created` | notifications |
| `dismissal.notification.read` | notifications |
| `dismissal.notifications.read_all` | notifications |

If offline/reconnected, refetch readiness, recent-calls, queue, waiting, notifications, and history depending on the current screen.

No durable replay exists yet.

## Polling Strategy

Suggested fallback intervals:

- Parent active tracker: 10-15 seconds while request is active.
- Staff active queue: 5-10 seconds during dismissal window.
- Waiting students: 5-10 seconds.
- Notifications: 30-60 seconds or on screen focus.
- History/admin tables: on filter change and manual refresh.

Stop high-frequency polling when the screen is backgrounded.

## Empty States

- Readiness disabled: show school has not enabled Smart Pickup.
- No requestable child: show per-child `blockedReason`.
- No available gates: show school has no open/busy gates.
- Staff no assignments: show assignment-required operational state.
- Empty queue/waiting/history: show no current records for selected filters.
- No pickup recipients: refetch request; if still empty, route to admin/support because live eligibility may have changed.

## Loading States

- Use route-level skeletons for list screens.
- Keep previous list while refetching on realtime event.
- Disable mutation buttons while request is in flight.
- After mutation succeeds, refetch the relevant canonical REST endpoint.

## Error Handling

- 401: logout or refresh auth.
- 403: hide route/action and show permission message.
- Safe 404: treat as hidden, inaccessible, deleted, or moved out of scope.
- 409: state conflict; refetch and re-render actions.
- 422/400: client validation or semantic input; fix form/query.

Use machine `error.code`; do not branch on English messages.

## Idempotency Notes

- Parent creation supports `clientRequestId`; generate a stable id per button attempt.
- Reusing a `clientRequestId` for different child/gate intent returns conflict.
- Cancel retries are idempotent for already-cancelled owned requests.
- Same-status staff PATCH returns no change and no duplicate event.
- Escalation retries return `changed=false` after first escalation.

## Offline and Reconnect Notes

- Do not create requests while offline unless the client can preserve `clientRequestId` and retry exactly once online.
- Do not cache `pickupRecipientToken` beyond the immediate delivery flow.
- On reconnect, refetch before enabling status/delivery/cancel buttons.

## Security Notes

- Never store `pickupRecipientToken` longer than needed for immediate delivery.
- Never display internal IDs.
- Never send `schoolId`, `guardianId`, `studentGuardianId`, `requestedById`, actor IDs, assignment IDs, or handover actor IDs.
- Never build URLs outside the documented route inventory.
- Treat safe 404 as hidden/not accessible.
- Do not log raw pickup codes or recipient tokens.

## Known Unavailable Features

- No pickup-code resend or rotation.
- No pickup QR.
- No delegate OTP or external invitation.
- No push notification/device-token surface for Dismissal Staff.
- No durable realtime replay.
- No staff-parent chat or files.
- No CSV/PDF export or analytics dashboards.
- No shifts or duty handover.
