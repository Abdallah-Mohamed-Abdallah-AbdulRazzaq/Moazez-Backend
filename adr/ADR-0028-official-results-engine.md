# ADR-0028 — Official Results domain and integration

## Status

Accepted for source implementation on 2026-11-21 under the Official Results
v1.0 owner handoff. Baseline
`a8a8f160e8c85d1dd8364e055ada69cee61cd7e5`. See the
[OR00 reconciliation](../docs/official-results/or00-repository-reconciliation.md)
and [implementation ledger](../verification/implementation-ledger.json) for
verification status.

## Domain and ownership

`src/modules/official-results` owns reporting periods, groups, definitions,
drafts, review, publication, imports and history. Its only grade values are
independently entered typed values and their calculated projections. It uses
existing student, enrollment, class hierarchy, subject offering and teacher
allocation identities. It has no application dependency on the assessment,
homework, behavior or reinforcement value stores.

A sheet has a unique school, reporting period, classroom and group. A slot
has a unique school, student, reporting period and group. Teacher, school and
per-student views read/write that same slot. Moving its draft ownership is an
explicit reconciliation. A term/custom roster uses the school-local date of
the selected period and accepts a year-level enrollment when its dates overlap.
Ambiguous placement fails with a reconciliation result.

Keep adopted draft and officially accepted definition pointers separate.
Attach typed input values to stable identities and evaluated outputs to their
frozen definition. A personal definition can prepare a MANAGED teacher's
draft; trusted school protection rules bound what data the draft may expose.
Approval binds the exact immutable candidate and policy. Publication stores
an immutable snapshot and changes a current pointer. Typed review references,
predecessor checks and a slot publication generation protect correction,
revocation and atomic replacement of several release units. Overall aggregates
bind published source IDs and the profile version.

## Tenant and write boundary

Use the registered scoped Prisma client with explicit school and exact resource
predicates. Composite FKs bind tenant and parent identity. Create/upsert,
nested relations and SQL use explicit trusted context and same-school
relationships. Enforce period/year/enrollment/subject applicability in the
transaction for relationships whose semantics a FK cannot express.

Use the authorization row-lock pattern in
[src/modules/grades/assessments/infrastructure/grades-resource-access.ts](../src/modules/grades/assessments/infrastructure/grades-resource-access.ts)
and the exported Academics allocation write gate as references. Official
Results owns its authorization checks. A committing command reloads account,
membership, role permission, current policy and exact allocation or grant.
Mutations hold compatible locks against revocation, then verify period and
resource revisions. Acquire locks in a documented order and keep external
I/O outside the transaction. Structural sheet revisions, touched cell CAS,
and publication generations are independent. A missing cell starts at version
zero and has a unique insert boundary.

Queue work in the existing Core Worker and reconcile from durable DB state in
the Maintenance Scheduler. Jobs carry IDs. The durable operation marker, grade
revisions, audit and outbox intent commit together for the affected unit.
Worker execution uses a proven tenant and rechecks current resource rights.
Publication delivery rechecks current entitlement before sending a safe
notification.

## Family identity

Use existing IAM and school lifecycle protections. The ordinary Student App
and Parent App access contexts require active academic placement. Official
Results needs a separate read port for linked, enabled accounts and current
school membership and, for parents, a live `StudentGuardian` relationship.
Archived enrollment and former classroom are frozen display context.

The current same-school transfer/promotion/withdrawal code changes enrollment
records and retains the linked student ID. The globally unique
`Student.userId` and school-bound guardian links cannot establish continuity
when a different school registers another student record or changes the
account link. OR06 owns a results-only, revocable retained entitlement for
that case. Trusted identity/relationship evidence must explicitly bind the old
school/student and current principal at issue and read. A guardian entitlement
also depends on a live, revocable relationship. Query the one proven school
and student. Preserve normal guards and reject ambiguous or revoked evidence.
Cover account deactivation, movement, revocation and direct attempts across
schools in OR06.

## HTTP and file contracts

Use the existing global prefix and `GlobalExceptionFilter`. Official Results
returns `{ data }` and the existing structured error envelope. Use stable
operation IDs from the pinned catalog and generate OpenAPI from the Nest
application. Localize feature errors at the feature boundary by request locale
and preserve existing error behavior elsewhere. Existing adapter-backed
paths, methods and responses retain their meaning. The existing teacher
classroom grade path uses an allocation ID.

Store generated artifacts and uploaded bytes privately. Associate artifact
metadata with its exact result resources. Reuse the generic exclusion
pattern for sensitive assessment and credential artifacts. All generic URL,
content, attachment and preview paths must exclude Official Results artifacts.
A dedicated authenticated content route proves current access to the whole
artifact before reading bytes through the existing private media/storage
adapters. OR07 owns the access integration and OR12 owns its alternate-path
tests.

## Spreadsheet adapter

Use `csv-parse` from the current lockfile for CSV. Implement the bounded XLSX
adapter with `yauzl` 3.4.0 and `saxes` 6.0.0 for incremental package/XML reads,
and `yazl` 3.3.1 for writing a controlled SpreadsheetML package. Node 22 supports
these MIT/ISC libraries. Route both transports into the same normalized
manifest/validation/merge operation. Read real uncompressed counts, strictly
validate relationship targets, entry names and XML, and reject unsupported
workbook content before normalization. Accept typed inline/shared strings
and permitted numeric/boolean values. Generate typed text, sheet views,
editable styles and bounded validation lists from trusted definitions.

An isolated npm production audit of the three-component adapter dependency
set reported zero advisories on 2026-11-21. The ExcelJS 4.4.0 candidate
resolved a UUID version affected by GHSA-w5hq-g745-h8pq. OR10 owns adding the
exact dependencies, auditing the integrated lockfile and proving editor
round trips, resource bounds, abusive-content rejection and CSV parity.
[SpreadsheetML structure](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document)
[ZIP reader](https://github.com/thejoshwolfe/yauzl)
[XML parser](https://github.com/lddubeau/saxes)
[ZIP writer](https://github.com/thejoshwolfe/yazl)
[UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq)

## Migration and review

Use new incremental Prisma migrations and inventory PostgreSQL-specific
constraints before first application. Run full disposable database replay and
a no-op second deploy. IAM updates follow canonical permission/role catalogs
and controlled bootstrap. Keep reference data outside schema SQL and check
setup against synthetic data. The review path is a normal branch push and
Draft PR with exact verification evidence. Use feature exposure and school
pilot controls before any separately authorized rollout.
