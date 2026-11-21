# OR06 family viewing and published aggregates

Student and parent result routes keep the existing authentication and school
scope guards. Every result query first proves the actor's live membership and
permission and resolves a same-school linked student or an explicitly retained
identity. Publication records the verified learner/account and guardian links
from the original school. A retained learner must still have a live academic
account link in the current school. A retained guardian still needs the
original live relationship to the requested child. Revocation and account
disablement are checked before every publication query. No old enrollment is
needed for an entitled former student's result.

The family presenter emits the frozen field values and placement of each
publication. It removes workflow evidence, staff notes, private operands and
formula expressions. An authorized preview carries the exact proposed fields
with a distinct PREVIEW identity and empty publication metadata.

Aggregate profiles identify precise group, release unit and field sources.
The candidate freezes selected published values, applicable profile revision
and current policy. Review uses its own typed target. Publish rechecks the
source pointers and approval within the same transaction. Superseding or
revoking a source marks dependent current totals stale. A repeatable-read
family query also validates source-current eligibility.

| Record | Class | Decision |
| --- | --- | --- |
| OR06-01, 2026-11-21 | B | Issue narrow retained read entitlements at publication for verified original identities. Cross-school queries use bound actor and old-school/student parameters, with live account and relationship checks. |
| OR06-02, 2026-11-21 | B | Keep one frozen placement per release. Derive stable result-set IDs from school, student and period. Return a version digest of the visible composition. |
| OR06-03, 2026-11-21 | B | Keep prior aggregate snapshots and mark the current pointer stale transactionally when a referenced release changes. |
| OR06-04, 2026-11-21 | B | Require a single eligible family summary for a period before returning an overall total. The school may maintain separate staff-only profiles. |

See the [implementation ledger](../../verification/implementation-ledger.json)
and [acceptance matrix](../../verification/acceptance-matrix.json) for the
executed contract and isolation checks.

