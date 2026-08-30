# Student bulk registration and credentials follow-up 1A closeout

## Authority and status

This document is the authoritative source closeout for follow-up stages F0-F4
on Draft PR #101. It supersedes the current-contract portions of the historical
PR #100 closeout without rewriting that historical evidence.

- Authoritative base: `main` at
  `35d6537c3829e508787c602883e472463e54ec70`.
- Certified implementation/source SHA:
  `2d368f9c20289c2ae48d45e7e8316bba78af00e3`.
- Pull request: #101, open and Draft; not Ready for Review and not merged.
- Active migration count: 10.
- Follow-up migration:
  `20260829223100_student_credential_admin_mode_placement_context`.
- Deployment state: no Staging or Production deployment was performed.

The F4 commit changes documentation only. Its exact Git SHA and exact-head CI
run are recorded in PR #101 and the F4 execution report because a Git commit
cannot embed its own final object ID.

## Follow-up stages

| Stage | Outcome |
| --- | --- |
| F0 | Created the follow-up branch from the authoritative post-PR-100 `main` and established the governed persistence baseline. |
| F1 | Persisted exact credential-placement provenance on credential rows and aligned the import-batch E2E fixture with the real Enrollment truth. |
| F2 | Added the public `shared_admin_provided` credential mode with central password-policy validation and pre-enqueue private secret-artifact staging. |
| F3 | Added academic placement context to credential exports and added the UTF-8 BOM to the version-1 registration template. |
| F4 | Audited the full feature range, ran focused and universal certification, reconciled documentation, and froze the pre-merge source candidate. |

## Public credential contract

The public credential modes are exactly:

- `unique_generated`
- `shared_temporary`
- `shared_admin_provided`

`sharedPassword` is accepted only when creating a
`shared_admin_provided` batch. It is request-only and write-only: it is not
returned by preview, create, detail, row, ordinary JSON, queue, audit, or log
contracts. Supplying it for either generated mode fails closed with
`shared_password_not_allowed`.

The admin-provided value is validated without trimming or other normalization
by the central IAM credential password policy. Missing and invalid values use
the governed error `iam.credentials.password_policy_failed`; the accepted
string is applied exactly as supplied. Every provisioned credential retains
`mustChangePassword=true`, uses the existing credential-version concurrency
guard, and revokes existing sessions. Generated-mode behavior is unchanged.

Plaintext exists only in the bounded request memory, the protected secret
artifact, and the authorized temporary CSV export before expiry. It is not
stored in normal relational fields and is not copied to queue payloads, audit
records, application logs, or normal JSON responses.

## Secret artifact and asynchronous execution

For `shared_admin_provided`, the service validates the request, creates the
pending batch and rows, stages and verifies the custom artifact, attaches its
pointer atomically, and only then enqueues execution. The artifact contract is:

- version: 1;
- visibility: `PRIVATE`;
- lifetime: 24 hours;
- MIME type: `application/vnd.moazez.student-credentials+json`;
- maximum artifact size: 64 MiB.

The BullMQ job payload remains identifier-only: `{ batchId }`. A missing,
expired, corrupt, mismatched, or otherwise unverifiable custom artifact fails
closed; recovery never substitutes a generated password. Orphan cleanup is
confirmed before terminalization, and cleanup failure preserves recoverable
state. Generic File APIs continue to exclude secret artifacts.

## Audience and Enrollment provenance

`StudentCredentialRow.enrollmentId` is the durable placement source of truth.
The audience rules are:

- `import_batch` uses the exact Enrollment reconciled onto each CREATED source
  registration row and rejects missing, cross-school, or student-mismatched
  provenance;
- `academic_year`, `stage`, `grade`, `section`, and `classroom` persist the
  selected active Enrollment;
- `selected_students` and `missing_password` persist the deterministically
  resolved current Enrollment when one is available, otherwise `null`.

Export reads the persisted Enrollment relationship. It does not perform a
"latest Enrollment" lookup at export time and does not introduce an N+1 query.
A non-null broken or cross-tenant provenance chain fails closed with
`students.credentials.export_placement_provenance_invalid`.

## Credential CSV contract

The secure credential export contains exactly 19 columns, in this order:

`student_id`, `student_name`, `username`, `login_email`,
`temporary_password`, `credential_status`, `must_change_password`,
`generated_at`, `placement_status`, `academic_year_id`,
`academic_year_name`, `stage_id`, `stage_name`, `grade_id`, `grade_name`,
`section_id`, `section_name`, `classroom_id`, `classroom_name`.

`credential_status` is one of `temporary_credential`, `credential_changed`, or
`account_ineligible`; plaintext is emitted only for `temporary_credential`.
`placement_status` is one of `current`, `historical`, or `unavailable`.
Placement display names use trimmed English text when present and otherwise
trimmed Arabic text.

The export is UTF-8 with one BOM, uses CRLF line endings, quotes every cell,
escapes embedded quotes, and neutralizes spreadsheet-formula prefixes. It is
bounded to 64 MiB and is delivered as a private, non-cacheable, no-ETag,
`nosniff` response.

## Bulk-registration CSV and execution contract

The version-1 template filename is `student-bulk-registration-v1.csv`. It is a
header-only UTF-8 CSV with exactly one BOM (`EF BB BF`) at the beginning and a
single CRLF-terminated, ordered 14-column header:

`first_name_en`, `father_name_en`, `grandfather_name_en`, `family_name_en`,
`first_name_ar`, `father_name_ar`, `grandfather_name_ar`, `family_name_ar`,
`date_of_birth`, `gender`, `nationality`, `username`, `contact_email`,
`student_phone`.

The parser remains BOM-compatible. Bulk execution remains deliberately
sequential: each row is provisioned in its own serializable transaction so
Student, passwordless User, active Membership, active Enrollment, and source
row reconciliation commit atomically. School and classroom capacity checks
remain shared with single-student registration. F4 does not add parallel row
execution or change queue/worker topology.

## Local certification evidence

The feature was certified from a clean worktree at implementation SHA
`2d368f9c20289c2ae48d45e7e8316bba78af00e3` against the authoritative base.

- Focused registration and credentials: 22/22 suites, 291/291 tests.
- Focused tenancy/security: 3/3 suites, 24/24 tests.
- Focused E2E: 2/2 suites, 10/10 tests.
- Focused PostgreSQL integration: 2/2 suites, 7/7 tests.
- Universal Unit: 599/599 suites, 4,798/4,798 tests, zero skips.
- Universal Security: 92/92 suites, 1,189/1,189 tests, zero skips.
- Universal E2E: 106/106 suites, 555/555 tests, zero skips.
- Universal Integration: 33/33 suites, 314/314 tests, zero skips.
- Universal migration replay, status, seed, second-deploy no-op, build, media
  runtime, exact-range diff, and cleanup: PASS.
- Prisma validate/generate, manifest verification, migration governance and
  structure, G01-G05 current-CI, Runtime Governance, CI Orchestrator contracts,
  standalone build, 24-file feature-range lint, worktree diff, and exact-range
  diff: PASS.

Exact-head CI run 33311142728 certified the complete implementation source at
`2d368f9c20289c2ae48d45e7e8316bba78af00e3`: 35 jobs, overall SUCCESS. The
documentation-only F4 exact-head run is recorded in PR #101 and the final F4
execution report.

## Post-merge Staging performance acceptance

No Staging performance run was performed during F4. After owner-authorized
merge, post-merge CI, and DevOps handoff, Staging must exercise Bulk
Registration at 100, 500, and 1,000 students. It must prove no duplicate User,
Student, Membership, or Enrollment; correct batch/row counters and statuses;
preserved capacity invariants; and functional recovery.

Staging must then process a 1,000-student credential audience in each public
mode. It must verify credential versioning, `mustChangePassword=true`, session
revocation, secure export before expiry, academic provenance, exact custom
password behavior, and absence of plaintext leakage.

Observe Core Worker CPU/memory; Cloud SQL CPU/memory/connections; Redis health;
queue depth, retries, failures, and stuck jobs; serialization conflicts;
processing duration; reconciliation; OOM; and timeouts. The first Staging run
establishes the measured latency baseline—no invented latency SLA applies.
Release blockers include incomplete or stuck work, uncontrolled retry, lost or
duplicate data, counter divergence, credential corruption, capacity or tenant
violations, plaintext leakage, OOM, or completion-preventing timeouts.

## Pre-merge freeze

The backend follow-up implementation and source certification are complete.
PR #101 remains open and Draft, with no Ready-for-Review, merge, Staging, or
Production action performed. The next authorized action is owner review and
merge authorization; Staging performance acceptance follows only after that
handoff.
