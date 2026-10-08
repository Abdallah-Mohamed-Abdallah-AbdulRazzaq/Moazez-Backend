# ACC-11C — Guardian Weekly Note acknowledgements

## Authority and source reconciliation

Required base: `afb18bddfcd4c3c2d6e7783e5b8e2036fb264dde`.
Branch: `agent/acc-11c-guardian-acknowledgements`.
The manager checkout, fetched `origin/main` and merged PR #196 matched that
authority before the clean, separate worktree was created. The initial task
HEAD matched the base with zero tracked or untracked changes and zero divergence.
The retained preflight is `coverage/acc11c/clean-start-proof.json`.

The accepted ACC-10 final, ACC-11A foundation and ACC-11B engagement audits were
reconciled against the merged schema, domain policies, V2 decoder, recipient
SQL, Core services/repositories, Parent ownership adapters and module wiring.

| Existing source                               | ACC-11C use                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AcademicContentAcknowledgement                | Existing durable table, four-part unique key and restrictive historical FKs                                                              |
| academicContentAcknowledgementEligible        | Required-note business eligibility after live authority resolution                                                                       |
| decodeAcademicContentRevisionSnapshotV2       | Exact immutable Guardian Weekly Note state; mutable authoring detail is never read                                                       |
| ParentAppAccessService.getOwnedStudentContext | Authenticated Parent and exact currently owned child before Core execution                                                               |
| ACC-10 recipient SQL                          | Current School/Organization, actor, child, enrollment, academic placement, audience and immutable target matching                        |
| ACC-11B repository                            | Shared Content-first locking, live membership/view grant, Guardian binding, fresh statement clock and distributed School/actor admission |

The shared authority methods are moved into
`academic-content-recipient-authority.ts`. Both engagement and acknowledgement
repositories reuse that class through inheritance; neither constructs another
Prisma client. Engagement retains its accepted command shape, fingerprint,
reference policies, response, five event types and request identity. Its final
reference/session predicates wrap the same shared live eligibility SQL.

## HTTP contract

Exactly two Parent routes are added:

```http
GET /api/v1/parent/children/:studentId/academic-content/:contentId/acknowledgement?expectedPublicationId=<UUID>
POST /api/v1/parent/children/:studentId/academic-content/:contentId/acknowledgement
```

GET requires one UUID query property. POST requires exactly the JSON body
`{"expectedPublicationId":"<UUID>"}` and accepts no query properties. Both path
IDs are UUIDs. Extra body/query properties, missing/null/malformed or repeated
preconditions are rejected through existing strict global DTO validation.
School, actor, Guardian, Enrollment, Revision and timestamps are server owned.

Both routes require only `academics.academic_content.view`, existing
JWT/session/scope/permission guards and Parent App ownership. Success is HTTP
200 with exactly these fields:

```text
publicationId: UUID
revisionId: UUID
requiresAcknowledgement: boolean
status: NOT_REQUIRED | PENDING | ACKNOWLEDGED
acknowledgementId: UUID | null
acknowledgedAt: ISO timestamp | null
```

The application service projects this bounded response. No private note body,
foreign identity, historical Guardian/Enrollment, request fingerprint,
notification identifier, URL, storage coordinate or SQL is exposed.
Both success and error responses use
`Cache-Control: no-store, private, max-age=0`. The existing private exception
filter preserves `Retry-After: 60` on 429.

| Condition                                                                                                                               | HTTP / established code                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Missing/malformed token or invalid token/session identity                                                                               | 401 / auth.token.invalid                                                                                                         |
| Expired access token                                                                                                                    | 401 / auth.token.expired                                                                                                         |
| Revoked session                                                                                                                         | 401 / auth.session.revoked                                                                                                       |
| Disabled authenticated account                                                                                                          | 403 / auth.account.disabled                                                                                                      |
| Missing/invalid current scope, membership or view grant                                                                                 | 403 / auth.scope.missing                                                                                                         |
| Student, Teacher, School or Applicant actor at Parent boundary                                                                          | 403 / parent_app.actor.required_parent                                                                                           |
| Strict DTO/path validation                                                                                                              | 400 / validation.failed                                                                                                          |
| Missing currently owned Parent Guardian, child, Enrollment or Classroom                                                                 | 404 / parent_app.guardian.not_found, parent_app.child.not_found, parent_app.enrollment.not_found, parent_app.classroom.not_found |
| Foreign/stale/ineligible publication, live authority revoked during resolution, unsupported snapshot/type, or POST on non-required note | 404 / not_found                                                                                                                  |
| Exhausted shared admission window                                                                                                       | 429 / rate_limit.exceeded, Retry-After 60                                                                                        |
| Core database/pool/lock/transaction or Parent ownership lookup failure                                                                  | 503 / service_unavailable, sanitized message without raw cause                                                                   |

The inherited global guards and lifecycle may emit their existing failures
before the acknowledgement application boundary. This stage does not change
those global error policies or claim all global infrastructure failures map to 503. The two tested acknowledgement boundaries are ownership lookup and Core
repository execution.

## Status and immutable publication authority

Canonical publication resolution precedes comparison with the client
precondition. The expected ID cannot select an expired predecessor or provide
an alternate ACL. Current authorization uses the independently resolved exact
Publication/Revision and the existing target/audience matcher.

Only V2 `GUARDIAN_WEEKLY_NOTE` snapshots are supported. The existing decoder
validates the complete frozen state. A required note also passes the existing
acknowledgement policy. The final SQL repeats exact type, version and immutable
boolean requirement alongside fresh canonical authorization.

| State        | Derivation                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------ |
| NOT_REQUIRED | Exact authorized immutable note requiresAcknowledgement=false; no acknowledgement mutation |
| PENDING      | Exact authorized required note has no row for the four-part natural identity               |
| ACKNOWLEDGED | Durable row for this Parent account, child and current publication                         |

GET uses bounded indexed natural-key lookup inside the same authorization
transaction. It neither consumes admission nor writes an acknowledgement,
engagement event, notification read or acknowledgement-implying AuditLog.
PENDING/NOT_REQUIRED are never placeholders. Historical notification/audience,
engagement or acknowledgement records are never current authorization.

## Durable identity and history

The authoritative identity remains
`(schoolId, publicationId, studentId, actorUserId)`.
Guardian and Enrollment are retained original action context. Selecting another
currently owned Guardian or resolving a new legitimate Enrollment does not
change that key or rewrite original context. Different Parent accounts and
children are independent. A successor publication creates a new obligation;
the predecessor acknowledgement remains historical.

POST uses `INSERT SELECT ... ON CONFLICT DO NOTHING` against the existing
PostgreSQL unique constraint. Its source SELECT includes final eligibility.
Every insert rereads status through another fresh eligibility statement after
unique-index arbitration. If a conflicting transaction rolls back after expiry,
the fresh check denies and rolls back the waiting insert as well. An insert loser
returns the original row only after this same check. Every retry reauthorizes; original ID,
acknowledgedAt and createdAt are never updated. There is no application-only
check/insert arbitration or inferred acknowledgement.

## Transactions and revocation

The accepted ACC-11B order is retained:

1. Same-School nondeleted Content SHARE.
2. Independently resolved current Publication SHARE.
3. Revision, School, Organization, actor, Student, Enrollment, Classroom,
   Section, Grade and Stage SHARE through current-access SQL.
4. Exact Membership, Role, RolePermission and Permission SHARE.
5. Relevant positive SubjectAllocation SHARE in UUID order; canonical reread.
6. Current owned Guardian/link SHARE in Guardian UUID order.
7. Decode the exact locked V2 note and reuse required-note policy.
8. Final INSERT/status SELECT with a materialized fresh database clock,
   canonical precondition, current Guardian and immutable requirement fence.

SHARE allows concurrent acknowledgement writers and conflicts with authority
UPDATE/DELETE. Committed revocation that wins a lock wait is observed before
the final mutation/read. A writer holding the authority locks may commit before
a subsequently waiting revoker. Expiry is checked with clock_timestamp after
waits; authorization linearizes at the final eligible SQL statement and does
not promise it remains unchanged after response delivery.

Both operations use the existing singleton pool and READ COMMITTED, maxWait
1000ms, transaction timeout 5000ms, lock_timeout 1500ms and statement_timeout
3000ms. No Redis, storage, provider, external network or cryptographic call
occurs inside these transactions. No automatic retry is added.

## Shared admission and resource boundary

POST reuses the existing committed PostgreSQL admission path and existing
`academic_content_engagement_admissions` natural identity. Engagement recording
and acknowledgement writing share **60 requests per 60-second School/actor
window**. Repeats and stale-content requests consume that same quota after
valid actor/membership admission. Content denial cannot roll back admission.
GET performs no admission mutation and remains available at quota saturation
when current authority permits it. Rejected saturated writes do not increase
the bounded counter or create an acknowledgement/event.

No new Prisma pools, Redis clients/endpoints, queues, workers, consumers,
repeat registrations or schedulers are added. Current environment capacity
controls remain unchanged: API pool 5, Staging max 4 / Production normal max
10; Core one pool 6 and Media one pool 3, totaling 29 / 59 application DB
connections. ADR-0005's earlier pilot aggregate is historical source evidence.
These are source-budget observations, not load or provider measurements.

## Migration and production dependencies

No schema change or new migration is required. All 28 SQL files, migration
lock, schema, Prisma config and committed manifest are compared byte-for-byte
against the exact base. Complete identities are retained in
`coverage/acc11c/migration-byte-parity.json`.
The migration-governance, fresh replay/status/parity/no-op and cleanup results
all passed and are recorded below.

Existing acknowledgement history retains restrictive foreign keys. This stage
does not delete, backfill, expire or anonymize production history. Owner
decisions on privacy, retention, legal holds and the lifecycle implications for
User/Guardian/Student/Enrollment/Publication/Revision remain separate production
readiness dependencies. Local fixture cleanup is limited to owned test Schools.
There is no production data, deployment, infrastructure or main mutation.

## Verification and evidence

Local validation ran against this uncommitted worktree at the exact accepted
base. The canonical local runner's plan/evidence records candidateSha as the
base because no feature commit exists yet; these are **local dirty-candidate
results**, not exact-head GitHub CI results. Source identities from the refreshed
production gates and final lint comparison bind the checked files. Production
TypeScript typecheck and build were rerun after fixing module import ordering;
the acknowledgement race suite was rerun after the final typed test bridge.

All required local gates passed. Changed-file lint is
PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION under the explicit ACC-11C owner
approval, scoped to the single existing Parent route test. The complete
comparison was rerun after approval before commit. There is no clean lint PASS
and no mandatory CI waiver; the earlier ACC-11B waiver was not reused.

| Check                                                     | Actual result                                                                                | Retained evidence under coverage/acc11c                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Exact-base migration/schema/config/manifest bytes         | PASS; 28 SQL files unchanged                                                                 | migration-byte-parity.json                                                              |
| Canonical artifact manifest                               | PASS; 28 entries; chain SHA e7c4e10394cfdb5788d5f75988850b035c81763ee860af763836d224f4be51e1 | manifest-preflight.log                                                                  |
| Migration governance                                      | PASS; 28 active, 0 new, rebaseline disabled                                                  | migration-governance-preflight.log                                                      |
| Production source governance                              | PASS; 74 gates, 6 Phase-3 gates                                                              | production-governance-preflight.log                                                     |
| Runtime policy                                            | PASS; Node 22.23.1, Firebase Admin 14.0.0                                                    | runtime-policy-preflight.log                                                            |
| Migration/rebaseline/runtime-policy Node tests            | PASS; 50 tests, 0 failures/skips                                                             | governance-node-tests.log                                                               |
| Prisma validate / generate                                | PASS; unchanged schema                                                                       | static-gates.json; prismaValidate.log; prismaGenerate.log                               |
| Refreshed complete production typecheck / build           | PASS; exit 0 / 0; postbuild reference-data contract passed                                   | production-refresh.json; production-refresh-typecheck.log; production-refresh-build.log |
| All 14 changed TypeScript files plus transitive imports   | PASS; 0 TypeScript diagnostics, unchanged compiler settings                                  | typecheck-changed.json                                                                  |
| Other 13 changed/new TypeScript files ESLint              | CLEAN PASS; 0 errors, 0 warnings                                                             | other-changed-eslint-raw.json                                                           |
| Existing Parent final-closeout route test ESLint          | PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION; base/candidate 70 errors + 1 warning; 0 new/removed | parent-lint-comparison.json                                                             |
| AST route comparison                                      | PASS; exactly 2 additions, 0 removals                                                        | route-comparison.json                                                                   |
| Production transaction inventory                          | PASS; all 232 classified, 0 unknown/unresolved/unwired/external waits                        | transaction-inventory-review.json; transaction-inventory.json                           |
| Fresh PostgreSQL schema parity after complete replay      | PASS; exit 0, No difference detected                                                         | fresh-schema-parity.json                                                                |
| Final formatting, scope, source identities and diff check | See final-scope-review.json; refreshed after audit completion                                | final-scope-review.json                                                                 |

The transaction scanner resolved inheritance and the unchanged module import
graph: 225 interactive and 7 batch transactions; 175 SHORT_DB_ONLY, 43
LOCK_CONTENTION_SENSITIVE and 14 SERIALIZABLE_CONFLICT_SENSITIVE. Acknowledgement
resolve and engagement record are classified for the API role as contention
sensitive; shared admission is short database-only. No classifier or CI router
change was needed.

| Local suite group                                                             |                Suites |      Tests |          Skipped | Overall / owned-fixture cleanup | Evidence                             |
| ----------------------------------------------------------------------------- | --------------------: | ---------: | ---------------: | ------------------------------- | ------------------------------------ |
| Focused acknowledgement / ACC-11A and ACC-11B PostgreSQL                      |                     7 |        152 |                0 | PASS / PASS                     | focus-attempt-3-evidence.json        |
| Fresh acknowledgement concurrency after typed test bridge                     |                     1 |         39 |                0 | PASS / PASS                     | ackraces-attempt-1-evidence.json     |
| Core / Student / Parent / Teacher / Communication / runtime unit              |                   118 |       1343 |                0 | PASS / PASS                     | unit-attempt-2-evidence.json         |
| Current access / recipient asset / Student / Parent / notification PostgreSQL |                     6 |        289 |                0 | PASS / PASS                     | integration-attempt-1-evidence.json  |
| Publication snapshot / runtime / file lifetime / ACC-10 final PostgreSQL      |                     4 |        174 |                0 | PASS / PASS                     | dbregression-attempt-2-evidence.json |
| Student / Parent / files tenancy and final route inventories                  |                     6 |        144 |                0 | PASS / PASS                     | security-attempt-1-evidence.json     |
| Recipient query plans / navigation / reference-data bootstrap PostgreSQL      |                     3 |         49 |                0 | PASS / PASS                     | scale-attempt-1-evidence.json        |
| Fresh migration replay / status / no-op / governance Node tests               | Node 2 files + replay | all stages | not a Jest count | PASS / PASS                     | migration-attempt-1-evidence.json    |

The principal Jest corpus is **144 distinct suites, 2,151 passing tests, zero
skipped tests**. The fresh 39-case acknowledgement race rerun brings successful
test executions to 2,190; it is a repeat of one suite, not 39 extra distinct
tests. All canonical evidence enumerates selected and actually executed files.
No absent result or retry is counted as a PASS.

The fresh migration profile passed complete deployment of all 28 governed
migrations, seed, governance Node tests, migration counts before/after second
deployment, the second deployment's no-op contract, final migrate status and
cleanup. An additional fresh schema diff returned exit 0 and no difference.
Owned local PostgreSQL/Redis/MinIO fixtures are isolated canonical test fixtures;
no production mutation or production load test occurred.

The unchanged G05 current-CI test mode was executed with PRD3_CURRENT_CI=1:
14 PASS, 8 registered historical-mode SKIPs, 0 FAIL, retained in
g05-current-ci-tests.log. These eight explicit historical skips are separate
from the zero-skipped Jest corpus. An earlier direct historical-mode run had
21 PASS and 1 FAIL because it requires zero source diff against HEAD, which is
inapplicable to this uncommitted feature. That original g05-source-tests.log is
preserved. No G05 assertion, configuration or CI gate was changed, and the full
exact-head CI/G05 workflow has not run.

The route comparison verified Student 106 unchanged, Parent 78 to 80, Parent
GET 65 to 66, Parent non-GET 13 to 14 and Teacher 149 unchanged. Its complete
old/new arrays contain only the two authorized Parent additions.

### Retained interrupted and failed local attempts

- Focus attempt 1 was interrupted during local dependency discovery; partial
  dependency trees had been retained within the project's search scope. It is
  retained as FAIL with cleanup PASS. The preserved partial trees were moved
  outside source, and completed attempts were run again.
- Focus attempt 2 passed 150 tests and failed two fixture setup cases: setting
  Membership INACTIVE also requires endedAt under the existing database check.
  The owned fixture was corrected. Focus attempt 3 passed all 152 tests.
- Unit attempt 1 found a real startup ReferenceError: newly added module imports
  were positioned after decorator evaluation. The two imports were moved to the
  top. Unit attempt 2 passed all 118 suites / 1,343 tests, and production
  typecheck/build were refreshed. No accepted test expectation was weakened.
- The final new concurrency test's unsafe apply invocation was replaced with a
  typed test subclass that calls the original protected method using super.
  All 39 real PostgreSQL races passed again and all new tests are lint-clean.
- Database regression attempt 1 passed all 4 suites / 174 tests but retained
  overall FAIL and cleanup FAIL because a MinIO absence check was transiently
  inconclusive. Read-only exact-name Docker inspect on the pinned desktop-linux
  endpoint subsequently proved the owned object absent. No manual deletion was
  performed. Original evidence was not reclassified; the entire fresh attempt 2
  passed all 174 tests and cleanup. Recovery proof is
  dbregression-cleanup-recovery-preflight.json.

Original attempt evidence and logs remain under coverage/acc11c. Fresh successful
attempts are separately identified above.

The first network install attempt was stopped after registry metadata stalled;
its log is preserved. Offline extraction on the USB-HDD worktree was then stopped
because of slow filesystem progress. Both attempts and their partial dependency
files were preserved. A fresh isolated task runtime on the local NVMe completed
`npm ci --offline --no-audit --no-fund`: 941 packages in 44 seconds, exit 0.
The copied package/lock/config/schema inputs were SHA-256 verified against the
worktree, and the worktree's ignored `node_modules` junction points only to this
task runtime. Source and Git authority remain the original task worktree.
Runtime inputs, paths and preservation identities are in
`coverage/acc11c/dependency-runtime.json`; installation output is in
`coverage/acc11c/npm-ci-ssd.log`. No dependency/configuration change or vulnerability
audit PASS is claimed. Prisma validation and generation subsequently passed
from the task worktree using its unchanged schema.

### Authorization and concurrency test matrix

All 16 cases below **passed in both directions** in the new real-PostgreSQL
suite: 32 race cases. Distinct Prisma pools and pg_blocking_pids proved the actual
lock relationship. The fresh 39-case rerun also passed GET unlink/supersession,
GET and POST expiry after authority waits, sanitized bounded lock timeout, and
unique-conflict expiry with both prior commit and prior rollback.

| Authority changed                  | Revoker wins expectation | Writer wins expectation                                    |
| ---------------------------------- | ------------------------ | ---------------------------------------------------------- |
| StudentGuardian unlink             | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Guardian account binding           | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Guardian deletion                  | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Parent account disabled            | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Membership inactive                | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| View grant removed                 | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Student suspended                  | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Enrollment deleted                 | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Enrollment withdrawn               | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Enrollment term changed            | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Classroom deleted                  | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Positive SubjectAllocation removed | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| School suspended                   | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Organization suspended             | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Publication cancelled              | 404, zero new rows       | Original durable row retained; GET/POST retry denied       |
| Canonical successor published      | 404, zero new rows       | Original durable row retained; stale GET/POST retry denied |

Additional database cases cover read-only PENDING/NOT_REQUIRED derivation,
explicit first/repeat acknowledgement, different Guardian selection and current
Enrollment with original historical context, child/account independence, eight
independent connections, successor obligations, other content types, malformed
snapshots, V1, wrong audience, future/expired/cancelled publications, stale
preconditions, foreign School and Guardian Organization. GET competes against
unlinking and supersession. GET/POST expiry after authority lock waits, unique
conflict expiry and bounded lock-timeout sanitization are separate cases.

HTTP cases exercise actual JWT/session/scope/permission guards and Parent
ownership, all seven documented status codes, Student/Teacher/School/Applicant
actor denial, exact response fields, strict UUID/body/query validation, private
headers, cross-child/account isolation, changed current Enrollment, shared
engagement/acknowledgement saturation and sanitized failures at both ownership
and repository boundaries.

### Inherited Parent route-test lint: approved narrow exception

Exception scope is exactly one existing file:
test/e2e/parent-app-final-closeout.e2e-spec.ts.
It changes only three route counts and two sorted route entries.
The requested disposition preserves the historical debt and the minimal route
update. It does not waive any mandatory CI check.

```ini
ACCEPTED_ACC_11B_BASE=afb18bddfcd4c3c2d6e7783e5b8e2036fb264dde
BASE_SOURCE_TREE=24723f0430f04a1eb57a3344982bdde47f0f9b9c
BASE_PARENT_FILE_SHA256=1ef2b0c1f4f599a9f78fd49db49d1f56ec60b19fc918d4c1cb6fb98518d81048
CANDIDATE_PARENT_FILE_SHA256=30395aacf66754663901cf20574d905e1232604d334ce3b07339da583fc47c3a
BASELINE_LINT_ERRORS=70
CANDIDATE_LINT_ERRORS=70
BASELINE_LINT_WARNINGS=1
CANDIDATE_LINT_WARNINGS=1
INTRODUCED_LINT_ERRORS=0
INTRODUCED_LINT_WARNINGS=0
REMOVED_LINT_ERRORS=0
REMOVED_LINT_WARNINGS=0
DIAGNOSTIC_SET_IDENTICAL=YES
MAPPED_SOURCE_SPANS_IDENTICAL=YES
DIAGNOSTICS_ON_MODIFIED_CODE=0
OTHER_CHANGED_TYPESCRIPT_FILES_LINT_CLEAN=13
CLEAN_LINT_PASS=NO
ACC_11C_LINT_EXCEPTION=APPROVED_WITH_CONDITIONS
EXCEPTION_SCOPE=ONE_EXISTING_PARENT_ROUTE_TEST_FILE
DIAGNOSTIC_IDENTITY_PARITY=REVERIFIED_BEFORE_COMMIT
LINT_STATUS=PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION
COMMIT_PUSH_DRAFT_PR=AUTHORIZED_AFTER_FINAL_GATES
```

Baseline lint ran against a complete read-only git archive of the exact base,
including accepted transitive source. base-lint-environment.json records its
archive/tree identity and verified ESLint, Prettier, TypeScript, package/lock,
schema and Parent source bytes. The candidate uses the same configuration,
compiler, lockfile dependencies and generated client. No suppression, severity,
exclusion, rule, assertion or CI modification was made.

parent-lint-comparison.json retains all 71 diagnostic records, raw reports,
source hashes and complete zero-context hunk mapping. Comparison checks rule,
severity, exact message, node type, columns, both mapped line endpoints and
every line covered by a diagnostic. Each diagnostic lies on unchanged mapped
code and its exact selected source span hashes identically. All 13 remaining
changed TypeScript files have zero diagnostics. File hashes were guarded before
and after lint. Counts are corroborating evidence, not the comparison authority.

Raw retained artifacts and SHA-256 identities:

| Artifact                                          | SHA-256                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| coverage/acc11c/parent-eslint-baseline-raw.json   | f86ee0d39066ef37bd2b331e5e1af886dba1269fd2332118d392e74ab2dab66f |
| coverage/acc11c/parent-eslint-candidate-raw.json  | 737cbb2f46430bdcd46e42a1430f878f5edb1ce9298af5a0ec8455d665fcb689 |
| coverage/acc11c/other-changed-eslint-raw.json     | 2a9c38422abfa6bdea8e29b902513ea1b584b1c419f11089bd1e48235fec9bb3 |
| coverage/acc11c/parent-source-position-diff.patch | ce0cd6093a0d9d057ac8d94bab27c814a6cbf91946c62e24065a6977c10f6d6e |

The complete diagnostic mapping below uses an exact-message catalog to avoid
repeating long identical messages. Severity 2 means error and 1 means warning.
Locations are line:column through endLine:endColumn. The hash is the identical
selected source span in base and candidate. The raw JSON remains authoritative
for exact message whitespace.

Message M1 (exact JSON string):

```json
"A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.\nConsider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. \nIf a function does not access `this`, it can be annotated with `this: void`."
```

Message M2 (exact JSON string):

```json
"Async arrow function has no 'await' expression."
```

Message M3 (exact JSON string):

```json
"Unsafe member access .parent on an `any` value."
```

Message M4 (exact JSON string):

```json
"Unsafe member access .school on an `any` value."
```

Message M5 (exact JSON string):

```json
"Unsafe member access .children on an `any` value."
```

Message M6 (exact JSON string):

```json
"Unsafe member access .summaries on an `any` value."
```

Message M7 (exact JSON string):

```json
"Unsafe member access .schedule on an `any` value."
```

Message M8 (exact JSON string):

```json
"Unsafe member access .student on an `any` value."
```

Message M9 (exact JSON string):

```json
"Unsafe member access .enrollment on an `any` value."
```

Message M10 (exact JSON string):

```json
"Unsafe member access .unsupported on an `any` value."
```

Message M11 (exact JSON string):

```json
"Unsafe member access .guardians on an `any` value."
```

Message M12 (exact JSON string):

```json
"Unsafe member access .child on an `any` value."
```

Message M13 (exact JSON string):

```json
"Unsafe member access .assessments on an `any` value."
```

Message M14 (exact JSON string):

```json
"Unsafe member access .summary on an `any` value."
```

Message M15 (exact JSON string):

```json
"Unsafe member access .assessment on an `any` value."
```

Message M16 (exact JSON string):

```json
"Unsafe member access .grade on an `any` value."
```

Message M17 (exact JSON string):

```json
"Unsafe member access .records on an `any` value."
```

Message M18 (exact JSON string):

```json
"Unsafe member access .items on an `any` value."
```

Message M19 (exact JSON string):

```json
"Unsafe member access .academic on an `any` value."
```

Message M20 (exact JSON string):

```json
"Unsafe member access .behavior on an `any` value."
```

Message M21 (exact JSON string):

```json
"Unsafe member access .xp on an `any` value."
```

Message M22 (exact JSON string):

```json
"Unsafe member access .totalXp on an `any` value."
```

Message M23 (exact JSON string):

```json
"Unsafe member access .reports on an `any` value."
```

Message M24 (exact JSON string):

```json
"Unsafe assignment of an `any` value."
```

Message M25 (exact JSON string):

```json
"Unsafe member access .unavailable on an `any` value."
```

Message M26 (exact JSON string):

```json
"Unsafe member access .tasks on an `any` value."
```

Message M27 (exact JSON string):

```json
"Unsafe member access .task on an `any` value."
```

Message M28 (exact JSON string):

```json
"Unsafe member access .submissions on an `any` value."
```

Message M29 (exact JSON string):

```json
"Unsafe member access .submission on an `any` value."
```

Message M30 (exact JSON string):

```json
"Unsafe member access .conversations on an `any` value."
```

Message M31 (exact JSON string):

```json
"Unsafe member access .conversation on an `any` value."
```

Message M32 (exact JSON string):

```json
"Unsafe call of an `any` typed value."
```

Message M33 (exact JSON string):

```json
"Unsafe member access .messages on an `any` value."
```

Message M34 (exact JSON string):

```json
"Unsafe member access .message on an `any` value."
```

Message M35 (exact JSON string):

```json
"Unsafe member access .announcements on an `any` value."
```

Message M36 (exact JSON string):

```json
"Unsafe member access .announcement on an `any` value."
```

Message M37 (exact JSON string):

```json
"Unsafe member access .attachments on an `any` value."
```

Message M38 (exact JSON string):

```json
"Unsafe argument of type `any` assigned to a parameter of type `{}`."
```

Message M39 (exact JSON string):

```json
"Unsafe member access .accessToken on an `any` value."
```

|   # | Rule                                       | Severity | Message | Node type               | Base span       | Candidate span  | Identical source-span SHA-256                                    |
| --: | ------------------------------------------ | -------: | ------- | ----------------------- | --------------- | --------------- | ---------------------------------------------------------------- |
|   1 | @typescript-eslint/unbound-method          |        2 | M1      | MemberExpression        | 106:12-106:55   | 106:12-106:55   | 118427ecf7bc669b9c0009ea0d2a352e7c4d4358b362ac96aaa74fa4d97e55d7 |
|   2 | @typescript-eslint/unbound-method          |        2 | M1      | MemberExpression        | 151:12-151:58   | 151:12-151:58   | 5e8c1d48d8850a3337b21b61dd3c718477317deb8d2f938dab991eca7245aaef |
|   3 | @typescript-eslint/unbound-method          |        2 | M1      | MemberExpression        | 169:12-169:54   | 169:12-169:54   | 06f57acd6f4dfc68a0536d1d996b456ff70620358de80cd6996438964f34eade |
|   4 | @typescript-eslint/require-await           |        2 | M2      | ArrowFunctionExpression | 847:95-847:97   | 847:95-847:97   | b310676102b8f4f9acc55d058768284571823ae5e37c71cce3ff5c592c9e5a81 |
|   5 | @typescript-eslint/no-unsafe-member-access |        2 | M3      | Identifier              | 998:22-998:28   | 1000:22-1000:28 | e47125968b3b71049fbc4802d1e40a71ea1359decfabacf70b34588037d4ff0c |
|   6 | @typescript-eslint/no-unsafe-member-access |        2 | M4      | Identifier              | 1004:22-1004:28 | 1006:22-1006:28 | d64debd942d7dc26a851231583b1721f43ea936fa41932b6dad7556e5f8cd24a |
|   7 | @typescript-eslint/no-unsafe-member-access |        2 | M5      | Identifier              | 1008:22-1008:30 | 1010:22-1010:30 | 10910087de24bfcabe854fda62b5023a61fe531705043b9979fdf00f12c4c0ec |
|   8 | @typescript-eslint/no-unsafe-member-access |        2 | M6      | Identifier              | 1020:22-1020:31 | 1022:22-1022:31 | c626a992e31bddf7c99810ed648325d6eae70033aae4362eef9cd4da3bd6c66c |
|   9 | @typescript-eslint/no-unsafe-member-access |        2 | M7      | Identifier              | 1021:22-1021:30 | 1023:22-1023:30 | 5f72005e81c4ecbd5aa3588e80e3daf0df068ce0cf5638944508a0165fea609a |
|  10 | @typescript-eslint/no-unsafe-member-access |        2 | M8      | Identifier              | 1059:24-1059:31 | 1061:24-1061:31 | 264c8c381bf16c982a4e59b0dd4c6f7808c51a05f64c35db42cc78a2a72875bb |
|  11 | @typescript-eslint/no-unsafe-member-access |        2 | M9      | Identifier              | 1065:24-1065:34 | 1067:24-1067:34 | 2791bd4394efbf10623f3cd301dc57f37ff18ff2a806b2c013403e85bc62c530 |
|  12 | @typescript-eslint/no-unsafe-member-access |        2 | M6      | Identifier              | 1071:24-1071:33 | 1073:24-1073:33 | c626a992e31bddf7c99810ed648325d6eae70033aae4362eef9cd4da3bd6c66c |
|  13 | @typescript-eslint/no-unsafe-member-access |        2 | M10     | Identifier              | 1080:24-1080:35 | 1082:24-1082:35 | 60945d49535300be8e42108658dba31fcd5d665fc40d6f186798e7e0682320ae |
|  14 | @typescript-eslint/no-unsafe-member-access |        2 | M3      | Identifier              | 1096:25-1096:31 | 1098:25-1098:31 | e47125968b3b71049fbc4802d1e40a71ea1359decfabacf70b34588037d4ff0c |
|  15 | @typescript-eslint/no-unsafe-member-access |        2 | M11     | Identifier              | 1104:25-1104:34 | 1106:25-1106:34 | 124f08e2ce881b978d2aeafa3a3c59911a6ab845be31f660a0cd105fba27bedc |
|  16 | @typescript-eslint/no-unsafe-member-access |        2 | M5      | Identifier              | 1110:25-1110:33 | 1112:25-1112:33 | 10910087de24bfcabe854fda62b5023a61fe531705043b9979fdf00f12c4c0ec |
|  17 | @typescript-eslint/no-unsafe-member-access |        2 | M10     | Identifier              | 1122:25-1122:36 | 1124:25-1124:36 | 60945d49535300be8e42108658dba31fcd5d665fc40d6f186798e7e0682320ae |
|  18 | @typescript-eslint/no-unsafe-member-access |        2 | M12     | Identifier              | 1142:22-1142:27 | 1144:22-1144:27 | ddc9e669194254cef019a29d3619a2c16592e5d52e1a81e98b01bd52319149a3 |
|  19 | @typescript-eslint/no-unsafe-member-access |        2 | M13     | Identifier              | 1146:22-1146:33 | 1148:22-1148:33 | f887c6af08daaa18b3e1b081db3571d065fd300e9fb86652aa5eaad9b960e161 |
|  20 | @typescript-eslint/no-unsafe-member-access |        2 | M14     | Identifier              | 1164:25-1164:32 | 1166:25-1166:32 | 761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53 |
|  21 | @typescript-eslint/no-unsafe-member-access |        2 | M15     | Identifier              | 1178:24-1178:34 | 1180:24-1180:34 | 89c08f7a02989db85066486407e81228ddadae03a30b293e5298cd050bd92db7 |
|  22 | @typescript-eslint/no-unsafe-member-access |        2 | M16     | Identifier              | 1183:24-1183:29 | 1185:24-1185:29 | ffe97bba510b9f5cf1bb187bebb59cefa42a3f1654d2c993654382cd10468c2e |
|  23 | @typescript-eslint/no-unsafe-member-access |        2 | M17     | Identifier              | 1207:22-1207:29 | 1209:22-1209:29 | a94e7bcfcbed3c846d491d4f47c948e53a23908d480248b3ffe9e126e83ea865 |
|  24 | @typescript-eslint/no-unsafe-member-access |        2 | M14     | Identifier              | 1223:22-1223:29 | 1225:22-1225:29 | 761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53 |
|  25 | @typescript-eslint/no-unsafe-member-access |        2 | M14     | Identifier              | 1230:37-1230:44 | 1232:37-1232:44 | 761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53 |
|  26 | @typescript-eslint/no-unsafe-member-access |        2 | M14     | Identifier              | 1241:25-1241:32 | 1243:25-1243:32 | 761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53 |
|  27 | @typescript-eslint/no-unsafe-member-access |        2 | M12     | Identifier              | 1268:28-1268:33 | 1270:28-1270:33 | ddc9e669194254cef019a29d3619a2c16592e5d52e1a81e98b01bd52319149a3 |
|  28 | @typescript-eslint/no-unsafe-member-access |        2 | M18     | Identifier              | 1272:28-1272:33 | 1274:28-1274:33 | 5f3c4f8580d392e422e7c2f6802674ac27966c98d95c39696e4b2490168e5488 |
|  29 | @typescript-eslint/no-unsafe-member-access |        2 | M14     | Identifier              | 1301:28-1301:35 | 1303:28-1303:35 | 761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53 |
|  30 | @typescript-eslint/no-unsafe-member-access |        2 | M12     | Identifier              | 1322:35-1322:40 | 1324:35-1324:40 | ddc9e669194254cef019a29d3619a2c16592e5d52e1a81e98b01bd52319149a3 |
|  31 | @typescript-eslint/no-unsafe-member-access |        2 | M14     | Identifier              | 1326:35-1326:42 | 1328:35-1328:42 | 761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53 |
|  32 | @typescript-eslint/no-unsafe-member-access |        2 | M14     | Identifier              | 1333:35-1333:42 | 1335:35-1335:42 | 761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53 |
|  33 | @typescript-eslint/no-unsafe-member-access |        2 | M14     | Identifier              | 1336:35-1336:42 | 1338:35-1338:42 | 761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53 |
|  34 | @typescript-eslint/no-unsafe-member-access |        2 | M19     | Identifier              | 1350:26-1350:34 | 1352:26-1352:34 | b8a98203ec9d769d748b532cd77e452e31270cff2369717171175462fb1c0770 |
|  35 | @typescript-eslint/no-unsafe-member-access |        2 | M20     | Identifier              | 1355:26-1355:34 | 1357:26-1357:34 | 08bf2418cca97fefbdf7f0d29719b005a6117989d84358de68bc57570ffbae36 |
|  36 | @typescript-eslint/no-unsafe-member-access |        2 | M21     | Identifier              | 1358:26-1358:28 | 1360:26-1360:28 | 9a3576ca4a048b010e835e65673b0db5bcd2e08bd95881d58117d28421c5a748 |
|  37 | @typescript-eslint/no-unsafe-member-access |        2 | M10     | Identifier              | 1364:26-1364:37 | 1366:26-1366:37 | 60945d49535300be8e42108658dba31fcd5d665fc40d6f186798e7e0682320ae |
|  38 | @typescript-eslint/no-unsafe-member-access |        2 | M14     | Identifier              | 1377:26-1377:33 | 1379:26-1379:33 | 761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53 |
|  39 | @typescript-eslint/no-unsafe-member-access |        2 | M14     | Identifier              | 1385:26-1385:33 | 1387:26-1387:33 | 761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53 |
|  40 | @typescript-eslint/no-unsafe-member-access |        2 | M22     | Identifier              | 1393:20-1393:27 | 1395:20-1395:27 | 1ea0dcecceb1013e95c1946c371103fe59a29d8b8ac7aa6134e147a48eeaa857 |
|  41 | @typescript-eslint/no-unsafe-member-access |        2 | M23     | Identifier              | 1404:22-1404:29 | 1406:22-1406:29 | 7f26104f77a7ce477546cd1ea99b6c99b5eb079e3ec9238583314eccea00440a |
|  42 | @typescript-eslint/no-unsafe-assignment    |        2 | M24     | Property                | 1409:9-1420:11  | 1411:9-1422:11  | 1835aca556a5fdd6110a0e81733283654988ca8aba72e1707f774c2209750b7c |
|  43 | @typescript-eslint/no-unsafe-assignment    |        2 | M24     | Property                | 1411:11-1419:13 | 1413:11-1421:13 | 38e110f21b91d71acb8b5eb46fecc5dc2f62ebabed5c4b94d8c4c0a2b22365a2 |
|  44 | @typescript-eslint/no-unsafe-member-access |        2 | M25     | Identifier              | 1427:22-1427:33 | 1429:22-1429:33 | ba691ba042bcedd9a61a36f5969026bc95859dccdc7e47f24e6bce35673baf2f |
|  45 | @typescript-eslint/no-unsafe-member-access |        2 | M12     | Identifier              | 1483:22-1483:27 | 1485:22-1485:27 | ddc9e669194254cef019a29d3619a2c16592e5d52e1a81e98b01bd52319149a3 |
|  46 | @typescript-eslint/no-unsafe-member-access |        2 | M26     | Identifier              | 1486:22-1486:27 | 1488:22-1488:27 | 085154084c7427596104bc42f51f59f6d3ffd3d5f49f098210c20449fb7b2c71 |
|  47 | @typescript-eslint/no-unsafe-member-access |        2 | M14     | Identifier              | 1508:25-1508:32 | 1510:25-1510:32 | 761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53 |
|  48 | @typescript-eslint/no-unsafe-member-access |        2 | M27     | Identifier              | 1524:24-1524:28 | 1526:24-1526:28 | 0ebb429fa86d481c2630fac53db1c91cffed5d4d41d1021c179444eb67e7ee0b |
|  49 | @typescript-eslint/no-unsafe-member-access |        2 | M27     | Identifier              | 1533:24-1533:28 | 1535:24-1535:28 | 0ebb429fa86d481c2630fac53db1c91cffed5d4d41d1021c179444eb67e7ee0b |
|  50 | @typescript-eslint/no-unsafe-assignment    |        2 | M24     | Property                | 1538:11-1550:13 | 1540:11-1552:13 | d882a8efad58c5ea2f54662d35749adfa08db424dd91a0cf7b532b822c67635f |
|  51 | @typescript-eslint/no-unsafe-assignment    |        2 | M24     | Property                | 1541:13-1549:15 | 1543:13-1551:15 | 4a48fc619f4ad0de89ca10f72c2c0de0f1258a134156cdefdcd69cf875be9781 |
|  52 | @typescript-eslint/no-unsafe-assignment    |        2 | M24     | Property                | 1547:15-1547:44 | 1549:15-1549:44 | 4bc9776e26144d9d51df453094668869ff98f33e49b1a56ab6973657649b1eb9 |
|  53 | @typescript-eslint/no-unsafe-member-access |        2 | M28     | Identifier              | 1605:29-1605:40 | 1607:29-1607:40 | 21e945ad5e3b81adf2ac82114f7e701ca858a81c9b678ea7d23f95927b71d424 |
|  54 | @typescript-eslint/no-unsafe-member-access |        2 | M29     | Identifier              | 1628:34-1628:44 | 1630:34-1630:44 | 293f1d2ee206a7cbebe633764a26ea455bd39f494a774a7289f8663da31916a2 |
|  55 | @typescript-eslint/no-unsafe-member-access |        2 | M30     | Identifier              | 1658:22-1658:35 | 1660:22-1660:35 | 5c0dc939187d4ae4bdb6abd314825f9f524c45c140b6e929ab93708e94b4f25f |
|  56 | @typescript-eslint/no-unsafe-member-access |        2 | M31     | Identifier              | 1679:24-1679:36 | 1681:24-1681:36 | 8b34dbc2c05eb4d7e25d48efeace82456b16cee760bcae80c157f52a3c2e787b |
|  57 | @typescript-eslint/no-unsafe-member-access |        2 | M31     | Identifier              | 1683:24-1683:36 | 1685:24-1685:36 | 8b34dbc2c05eb4d7e25d48efeace82456b16cee760bcae80c157f52a3c2e787b |
|  58 | @typescript-eslint/no-unsafe-assignment    |        2 | M24     | VariableDeclarator      | 1700:11-1703:6  | 1702:11-1705:6  | c874c464b37d8ba8b92b64a618e2071bdd6bdc864225dbf68611e5431cdf0f04 |
|  59 | @typescript-eslint/no-unsafe-call          |        2 | M32     | MemberExpression        | 1700:27-1700:54 | 1702:27-1702:54 | 8950ac7804c1e0f05f77558948f9b0bc0c1cbe24c124e6ccb93a967812139a11 |
|  60 | @typescript-eslint/no-unsafe-member-access |        2 | M33     | Identifier              | 1700:41-1700:49 | 1702:41-1702:49 | f5cccfb737512bedd4f2e39e7d72425ae8d3ebf8aa8ab6f966bef1fc916f5011 |
|  61 | @typescript-eslint/no-unsafe-member-access |        2 | M34     | Identifier              | 1728:22-1728:29 | 1730:22-1730:29 | ab530a13e45914982b79f9b7e3fba994cfd1f3fb22f71cea1afbf02b460c6d1d |
|  62 | @typescript-eslint/no-unsafe-assignment    |        2 | M24     | Property                | 1732:7-1735:9   | 1734:7-1737:9   | 340c3a7b47005ce9d6b6519250efa817723b997baad73ef9f80316a7ea60bb05 |
|  63 | @typescript-eslint/no-unsafe-member-access |        2 | M35     | Identifier              | 1793:22-1793:35 | 1795:22-1795:35 | ac3b4e3b232f9dd207067c8e7dad449e35787fe63a8ed3f33023ef1fe0738594 |
|  64 | @typescript-eslint/no-unsafe-member-access |        2 | M36     | Identifier              | 1812:24-1812:36 | 1814:24-1814:36 | 86118a3b7fc92492b026562882076481e99119cc9563879b4f0076cf8d7bff31 |
|  65 | @typescript-eslint/no-unsafe-member-access |        2 | M37     | Identifier              | 1840:29-1840:40 | 1842:29-1842:40 | 3930e671c9e40dee2a33442c6f1055e8e8b75958ee19da8bd470754fd44beec2 |
|  66 | @typescript-eslint/no-unsafe-member-access |        2 | M37     | Identifier              | 1846:29-1846:40 | 1848:29-1848:40 | 3930e671c9e40dee2a33442c6f1055e8e8b75958ee19da8bd470754fd44beec2 |
|  67 | @typescript-eslint/no-unsafe-assignment    |        2 | M24     | Property                | 1848:9-1848:35  | 1850:9-1850:35  | 88c9950d6793abdd6a64a7eeae131bbcd49f6a0efb11007e29f0576cd7c55fe0 |
|  68 | @typescript-eslint/no-unsafe-argument      |        1 | M38     | MemberExpression        | 1854:24-1854:55 | 1856:24-1856:55 | 7a20903f1fa537b67172a87ad9b53fd952ea19fd6703bef062181e37ef51c8c0 |
|  69 | @typescript-eslint/no-unsafe-member-access |        2 | M37     | Identifier              | 1854:41-1854:52 | 1856:41-1856:52 | 3930e671c9e40dee2a33442c6f1055e8e8b75958ee19da8bd470754fd44beec2 |
|  70 | @typescript-eslint/no-unsafe-assignment    |        2 | M24     | Property                | 3396:14-3396:52 | 3398:14-3398:52 | 4a42c908b534cb4333a0f97fde48f65ab3a7339d8ac01696f54082a6350b8fee |
|  71 | @typescript-eslint/no-unsafe-member-access |        2 | M39     | Identifier              | 3396:41-3396:52 | 3398:41-3398:52 | 94a2776e7bd6f611462bc4344e17773c65fc4c486401643b724d102a8936dff4 |

The owner explicitly approved this narrow ACC-11C exception with strict
conditions in this chat. The comparison was freshly rerun at 2026-10-08T15:38:10.662Z
and verified against the complete prior retained records. All 71 identities and
source spans remain unchanged, and no diagnostic intersects modified code.
Only the three counts and two authorized sorted route entries differ in the
Parent test; every other assertion is preserved. Configuration and all other
TypeScript source identities remain unchanged. owner-lint-authorization.json
retains the disposition, fresh comparison identity and all raw artifact hashes.
The original pre-approval evidence remains in pre-authorization-evidence.
Mandatory CI gates are not waived. The authorized final scope and diff checks
precede exactly one feature commit and normal push/Draft PR delivery.
At this pre-commit audit snapshot, exact-head GitHub CI is NOT_STARTED; actual
commit/PR/CI evidence will be collected after delivery and reported separately.

### Exact changed-file inventory

Nine production TypeScript files, five test TypeScript files and this audit:

```text
src/modules/academics/academic-content/academic-content.module.ts
src/modules/academics/academic-content/application/academic-content-acknowledgement.service.ts
src/modules/academics/academic-content/dto/academic-content-acknowledgement.dto.ts
src/modules/academics/academic-content/infrastructure/academic-content-acknowledgement.repository.ts
src/modules/academics/academic-content/infrastructure/academic-content-engagement.repository.ts
src/modules/academics/academic-content/infrastructure/academic-content-recipient-authority.ts
src/modules/parent-app/academic-content/application/parent-academic-content.use-cases.ts
src/modules/parent-app/academic-content/controller/parent-academic-content-acknowledgement.controller.ts
src/modules/parent-app/parent-app.module.ts
test/e2e/parent-app-final-closeout.e2e-spec.ts
test/fixtures/academic-content-acknowledgement.fixture.ts
test/integration/academic-content-acknowledgement-concurrency.integration.spec.ts
test/integration/academic-content-acknowledgement-http.integration.spec.ts
test/integration/academic-content-acknowledgement.integration.spec.ts
docs/sprint-academic-content-center-acc-11c-guardian-acknowledgements-audit.md
```

The existing Parent final-closeout test changes only the three inventory counts
and two sorted acknowledgement route entries. Schema, migrations, manifest,
permissions, CI router/classifier, runtime configuration and dependency lockfile
are outside the change inventory.

## Deferred work and delivery

ACC-11D Teacher/school analytics and ACC-11E final security/scale closeout are
deferred. No analytics permission, notification/push behavior, frontend or
other stage is implemented. Delivery requires passing local gates, any newly
necessary owner lint disposition, exactly one normal commit/push and one Draft
PR to main. Exact remote HEAD, PR identity and fresh exact-head CI are reported
after execution. Ready, merge, deployment and subsequent slices are prohibited.
