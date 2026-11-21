# OR09 import confirmation and recovery

Confirmation checks the exact stored preview ID, digest, batch revision, selected sheet set, and warning acknowledgments. A clear reason supplied at confirmation must agree with the reviewed reason. The API locks and verifies the current policy, academic scope, definition, roster, and cell evidence before it records an execution intent and the explicit sheet units.

Every job uses the persisted actor, not an authority-bearing queue payload. A worker claim is fenced by a lease token. The worker locks the exact sheet and placement records and checks each reviewed value and dependency version. The observed whole-sheet data generation remains informational. The gradebook applies the reviewed changes with per-cell compare-and-swap, invalidates dependent release candidates, and writes audit and cell revision records. That transaction also writes the successful unit marker.

A worker replays from the database when a queue dispatch is lost or a lease expires. A committed unit is immutable. An uncommitted transient failure can be retried if the same reviewed bindings still hold. A stale semantic failure requires a new review. The worker derives the batch outcome from the stored unit states and reports independent sheet failures explicitly.

Cancellation applies to still queued units. A running unit finishes its all-or-none transaction. An outcome with both applied and cancelled units is PARTIALLY_APPLIED with terminationReason CANCELLED. A fully handled cancellation carries the same reason in the separate CANCELLED status. The administrative note remains audit evidence.

Only saved drafts change. The queues and operations pages record result marks as academic changes in the existing Official Results store. No import state creates publication or family notifications.
