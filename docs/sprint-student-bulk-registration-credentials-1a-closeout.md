# Student bulk registration and credentials 1A closeout

> **Historical record:** This document records the original PR #100 / 1A
> source closeout. The authoritative post-PR-100 follow-up contract is recorded
> in
> `docs/sprint-student-bulk-registration-credentials-followup-1a-closeout.md`.

## Scope and outcome

This sprint adds a school-scoped, asynchronous workflow for importing students,
provisioning their records and enrollments, generating temporary credentials,
and exporting those credentials through a dedicated protected API. It does not
change the existing single-student registration contract, make the draft pull
request ready, merge it, deploy it, or add frontend behavior.

The work was delivered in ten bounded stages:

| Stage | Delivered boundary |
| --- | --- |
| 1 | Unified student placement and capacity policy used by single and bulk registration. |
| 2 | Durable bulk-registration batch and row persistence with school-scope registration. |
| 3 | Intake preflight, template, upload, batch detail, and row-preview API foundation. |
| 4 | Asynchronous CSV parsing, normalization, semantic validation, duplicate reporting, and preview state. |
| 5 | Confirmation plus asynchronous, atomic per-row student/account/enrollment provisioning under serializable capacity checks. |
| 6 | Execution recovery, deterministic retry, tenant revalidation, and fail-closed recovery-window handling. |
| 7 | Durable credential-batch and credential-row persistence. |
| 8 | Audience resolution, asynchronous credential generation, optimistic credential-version protection, and recovery. |
| 9 | Private temporary-secret artifact, secure CSV export, formula-injection defense, expiry, and cleanup. |
| 10 | Full source certification, Universal Regression, CI ownership correction, test-only lint remediation, and closeout documentation. |

## HTTP contract

All routes use the framework `/api/v1` prefix and require an authenticated,
school-scoped request.

| Method | Route | Permission contract | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/students-guardians/bulk-registrations/preflight` | `students.records.manage` + `students.enrollments.manage` | Validate placement and current seat readiness before upload. |
| GET | `/api/v1/students-guardians/bulk-registrations/template` | `students.records.manage` + `students.enrollments.manage` | Download the version 1 header-only CSV template. |
| POST | `/api/v1/students-guardians/bulk-registrations` | `students.records.manage` + `students.enrollments.manage` | Upload one CSV and create its durable batch/import source. |
| GET | `/api/v1/students-guardians/bulk-registrations/:batchId` | `students.records.manage` + `students.enrollments.manage` | Read batch placement, counters, validation errors, and lifecycle timestamps. |
| GET | `/api/v1/students-guardians/bulk-registrations/:batchId/rows` | `students.records.manage` + `students.enrollments.manage` | Page and filter normalized source rows and validation results. |
| POST | `/api/v1/students-guardians/bulk-registrations/:batchId/confirm` | `students.records.manage` + `students.enrollments.manage` | Confirm a ready batch and enqueue execution. |
| POST | `/api/v1/students-guardians/credential-batches/preview` | `students.records.view` + `settings.users.view` | Resolve and count an eligible credential audience without mutation. |
| POST | `/api/v1/students-guardians/credential-batches` | `students.records.view` + `settings.users.manage` | Create and enqueue a credential batch. |
| GET | `/api/v1/students-guardians/credential-batches/:batchId` | `students.records.view` + `settings.users.view` | Read credential-batch counters and lifecycle state without secrets. |
| GET | `/api/v1/students-guardians/credential-batches/:batchId/export` | `students.records.view` + `settings.users.manage` | Export a completed or partially failed batch as a non-cacheable CSV. |

## CSV intake contract

The version 1 import is UTF-8 CSV with an optional BOM and an exact, ordered
14-column header:

`first_name_en`, `father_name_en`, `grandfather_name_en`, `family_name_en`,
`first_name_ar`, `father_name_ar`, `grandfather_name_ar`, `family_name_ar`,
`date_of_birth`, `gender`, `nationality`, `username`, `contact_email`, and
`student_phone`.

The parser rejects malformed CSV, an incorrect header, inconsistent column
counts, and an empty data set. It normalizes names, username, contact email,
date, phone, and profile fields; validates the school login identity contract;
and records errors per original row. A SHA-256 normalized-row hash supports
duplicate detection without being unique, so every duplicate source row remains
available in the validation report. Duplicate usernames and existing login
identities are also reported before confirmation.

## Registration lifecycle and atomicity

The batch lifecycle is `UPLOADED -> VALIDATING -> READY -> EXECUTING`, ending
as `COMPLETED`, `EXECUTION_PARTIAL_FAILED`, or `FAILED`; semantic validation can
end as `VALIDATION_FAILED`. Rows progress from `PENDING` through `VALID` or
`INVALID`, then `PROCESSING` to `CREATED` or `FAILED`.

`ImportJob` remains the file/storage/queue recovery foundation while
`StudentBulkRegistrationBatch` and `StudentBulkRegistrationRow` remain the
business workflow and per-source-row idempotency truth. One import job can back
at most one batch. Row number is unique within a batch, while row hash is only
indexed. Created student, user, and enrollment identities are reconciled on the
row so a retry does not provision the student twice.

Each eligible row is provisioned in one serializable transaction. Student,
account, membership, and enrollment changes commit together with row state.
The transaction rechecks school and classroom capacity using the shared
placement policy, preventing school-seat and classroom oversubscription under
concurrent bulk and single-student registration.

## Credential lifecycle and concurrency

Credential audiences support an import batch, selected students, academic
year, stage, grade, section, classroom, or students missing a password.
Credential modes are `unique_generated` and `shared_temporary`, with at most
10,000 explicitly selected students.

Batches progress from `PENDING` to `PROCESSING`, then `COMPLETED`,
`PARTIAL_FAILED`, or `FAILED`. Rows progress from `PENDING` to `PROCESSING`, then
`GENERATED`, `SKIPPED`, or `FAILED`. The API never returns temporary passwords
in its normal JSON batch responses.

Each credential row records `credentialVersionBefore` and
`credentialVersionAfter`. The serializable rotation transaction changes the
credential only when the user's current version still equals the captured
version, so a concurrent password change is not overwritten. Retries reconcile
the stored row outcome instead of blindly rotating the credential again.

## Queue and recovery topology

Bulk CSV validation, bulk execution, and credential-batch execution use the
existing BullMQ `files-imports` queue and Core Worker import-validation
consumer. Job names and batch-derived job IDs are deterministic. Registration
and credential reconcilers inspect durable database state, revalidate tenant
eligibility, and restore missing work within a 24-hour recovery window. Work
outside that window or with invalid tenant/source state fails closed with a
stable reason. The existing critical-queue recovery contract remains the queue
reconstruction authority.

## Secret artifact and secure export

Temporary passwords exist only in a versioned secret artifact in the private
object-storage bucket. The deterministic school/batch object key, private
visibility, MIME type, metadata, size bound, and persisted file identity are
verified before use. Database rows retain only reconciliation metadata and
credential versions, never plaintext passwords.

The generic File lookup explicitly excludes files referenced as student
credential secret artifacts. Secrets are available only through the dedicated
credential export use case after school scope, terminal status, file identity,
expiry, row set, and credential-version reconciliation checks pass.

The export is UTF-8 CSV with a BOM, deterministic headers, CRLF records, RFC
style quoting, and a 64 MiB bound. Every value that begins with a spreadsheet
formula marker—or whitespace followed by one—is prefixed with an apostrophe
before quoting. The response is private and non-cacheable, carries
`nosniff`, and removes `ETag`.

Secret artifacts expire after 24 hours. Cleanup scans only terminal batches,
verifies the private file/object identity, deletes expired objects
idempotently, and clears metadata with race-safe reconciliation. Missing,
expired, inconsistent, oversized, or unverifiable artifacts fail closed.

## Persistence, tenancy, and compatibility

The feature adds two governed migrations:

- `20260825152406_student_bulk_registration_domain`
- `20260827101533_student_credential_batch_domain`

They add the two batch/row model pairs and their enums, tenant-safe foreign
keys, uniqueness constraints, and workflow indexes. All four models carry an
explicit required `schoolId`, are registered with `SCHOOL_SCOPED_MODELS`, and
are not school-scope exclusions. Composite relations prevent a row, placement,
or source batch from crossing school boundaries.

Existing single-student registration, login identity, credential management,
generic file, and settings contracts remain available. The bulk workflows
reuse their canonical domain policies rather than replacing them, and no route,
schema, migration, package, infrastructure, or deployment behavior was changed
during Stage 10 certification.

## Verification evidence

The final uncommitted remediation bytes were certified before commit by:

- Universal Regression: PASS, including cleanup.
- Migration replay/status/seed: all 9 migrations applied, schema up to date,
  seed PASS, and second deploy reported no pending migrations.
- Unit: 599/599 suites and 4,743/4,743 tests PASS, with zero skipped tests.
- Security, every E2E batch, every General Integration batch, G02, G03, G05,
  G06, teacher closeout, build, and exact-range diff: PASS.
- G01 focused: 155/155 PASS; G01 through G05 current-CI: PASS.
- Runtime Governance: 170/170 PASS.
- Migration Governance: 39/39 PASS; structure and manifest verification PASS
  with 9 active migrations.
- Prisma validate, Prisma generate, build, and feature-range ESLint: PASS.
- Canonical CI inventory: 861 tests, no missing or duplicate assignments; the
  relocated disposable PostgreSQL helper spec is owned exactly once by Unit.

The final exact-head GitHub CI run is recorded in draft PR #100 after the
documentation commit is pushed. Stage 10 is complete only when that exact-head
run succeeds.

## Stage 10 regression classifications

Four certification issues were test or harness defects, not application
runtime defects:

1. G07's Docker disposable PostgreSQL identity was rejected by test-local
   loopback-only guards. A test-only fail-closed fixture identity helper now
   accepts only the owned Universal Regression fixture and continues to reject
   arbitrary remote databases.
2. E2E batch 15 left two ioredis disconnect timers because a route-only test
   initialized the real realtime gateway. The suite now uses the repository's
   existing no-op E2E gateway override; `--forceExit` was not used and
   open-handle detection remains fail closed.
3. Two bootstrap process tests used heavyweight `ts-node/register` in the
   constrained monolithic G07 Unit container. They now use the existing
   `ts-node/register/transpile-only` process-test convention with explicit
   `TS_NODE_PROJECT=tsconfig.json`. Application bootstrap source and process
   behavior are unchanged, and the 30-second child timeout was not increased.
4. The final feature-range lint exposed test-only debt in seven logical files.
   Typed mocks and fixtures, explicit Promise handling, and formatting removed
   all 235 errors and 26 warnings without skips, reduced assertions, disabled
   rules, or runtime changes. Final feature-range ESLint findings are zero.

No Staging or Production resource was accessed or mutated for this closeout.
