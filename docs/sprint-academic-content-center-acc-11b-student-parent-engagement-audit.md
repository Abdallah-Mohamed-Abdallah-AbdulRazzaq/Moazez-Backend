# ACC-11B — Student and Parent Academic Content engagement

## Authority and scope

- Repository: `Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend`.
- Accepted baseline: `7ecebe99a75721f25f0502db0c82b6d896408a6e`, the merged PR #195.
- Branch: `agent/acc-11b-student-parent-engagement`, created in a clean dedicated
  worktree from that exact baseline. Initial clean-start proof was recorded at
  `2026-10-08T09:09:54.7364814Z`.
- ACC-0 through ACC-10 and ACC-11A remain accepted authorities. PR #194 was
  neither reused nor mutated. Manager checkout, main, production, cloud resources,
  dependency manifests, CI routing/classification, permission seeds, queue topology,
  and existing committed migration bytes are unchanged.
- This change records authenticated client reports. It does not infer events
  from feed/detail GETs, signed URL issuance, storage delivery, or notifications.
  It does not prove full file transfer or actual Online Session attendance.
- Guardian acknowledgements, analytics, Teacher analytics permissions, new
  notification/push delivery, consumers, and ACC-11C/11D/11E/12 remain deferred.

Source reconciliation covered the merged ACC-8/9/10/11A audits and implementation,
current access/recipient read SQL, Student/Parent access services, Guardian ownership,
file access and policy resolvers, signing, request-context guards, scope extension,
and ACC-7/9 Content-first transaction ordering. The original ACC-11A engagement
policy, uniqueness, exact RevisionAsset/RevisionLink FKs, historical events, and
independent acknowledgement persistence are reused. No new Content authority exists.

## HTTP contract

Exactly two routes are added:

| Actor   | Route                                                                                   |
| ------- | --------------------------------------------------------------------------------------- |
| Student | `POST /api/v1/student/academic-content/:contentId/engagement-events`                    |
| Parent  | `POST /api/v1/parent/children/:studentId/academic-content/:contentId/engagement-events` |

Existing JWT/session authentication, scope resolution, app actor ownership and
`academics.academic_content.view` apply. No management permission or
SchoolManagementOnly bypass is introduced. Success and errors carry
`Cache-Control: no-store, private, max-age=0`.

The strict DTO requires UUID `clientRequestId`, supported enum `eventType`, UUID
`expectedPublicationId`, and optional UUID `fileId` or `revisionLinkId`. Explicit
nulls and unexpected fields are rejected. Shape validation prohibits references
on CONTENT_VIEWED/JOIN_LINK_CLICKED, requires only fileId for file events, and
requires only revisionLinkId for LINK_CLICKED. Identity, School, Guardian,
Enrollment, revision, timestamps, URL, storage key and permission claims cannot
be supplied through additional fields.

`expectedPublicationId` is an additive HTTP optimistic precondition. The server
independently resolves its canonical currently authorized publication, then
requires equality. Mismatch produces non-disclosing 404 and no event. The
precondition is stripped before invoking the original four-field ACC-11A command
and is never used to select persisted attribution. The canonical query chooses
the latest authorized visible publication before applying the precondition;
it cannot fall back to an earlier publication to satisfy a stale request.

New and identical retry responses are HTTP 200 and contain only:

```json
{
  "eventId": "UUID",
  "eventType": "CONTENT_VIEWED",
  "publicationId": "UUID",
  "revisionId": "UUID",
  "recordedAt": "server/database ISO timestamp"
}
```

Contradictory reuse returns HTTP 409 with stable code
`academic_content.engagement.idempotency_conflict`. Other established responses
are 400 for malformed/extra/invalid-shape input, 401 for invalid/revoked sessions,
403 for guard app/permission denial, 404 for inaccessible/stale content or
references, 429 for admission exhaustion, and sanitized 503 for database failure.
No File object, raw SQL, storage metadata, signed URL or private error cause is
returned. Database failures are replaced before reaching the existing exception
logger. The route exception filter adds private caching and Retry-After behavior
without changing the shared global filter.

## Current authorization and event semantics

Student composition calls StudentAppAccessService for its current actor, School,
Student, Enrollment, Classroom, Year and Term. Parent composition calls
ParentAppAccessService.getOwnedStudentContext for the exact requested child.
Core rechecks those facts against live PostgreSQL truth, including request
membership and its current view grant. A cached app context, prior successful
GET/event, historical recipient snapshot or notification is insufficient.

The shared ACC-10 SQL predicates remain unchanged for existing reads; only their
helpers are exported and their clock parameter accepts a SQL expression for the
new write path. Writes additionally require Student Organization to match School
Organization, and the exact Parent Guardian Organization to match that School.
Every raw write/read has explicit School predicates.

Core verifies active School/Organization/actor/Student/Enrollment, exact School
and Year/Term/Classroom, current Guardian-child link, immutable V2 revision,
appropriate actor audience and content type, matching target and positive
SubjectAllocation when needed, published time and visibility, and absence of
cancellation, expiry, supersession and future visibility. Parent Guardians are
restricted to live server-resolved links and chosen deterministically by UUID
order. Relevant live Guardian/link rows are locked before final authorization.

| Event             | Additional requirements and meaning                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| CONTENT_VIEWED    | Explicit authenticated client report; no file/link reference                                                                            |
| FILE_PREVIEWED    | Exact current RevisionAsset, PRIVATE live nonempty File, effective School inline-preview policy, supported inline type                  |
| FILE_DOWNLOADED   | Exact current RevisionAsset, PRIVATE live nonempty File, actor-specific download policy; client interaction report                      |
| LINK_CLICKED      | Exact current immutable RevisionLink ID; no client URL                                                                                  |
| JOIN_LINK_CLICKED | Immutable eligible ONLINE_SESSION V2 snapshot, valid nonempty join URL, session end after the final database clock; no attendance claim |

Effective policy defaults and supported inline types reuse the established Core
file policy/registry. ACC-10 asset access, authorized signing and 307 contracts
are unchanged.

## Admission control and connection budget

There is no assumed global NestJS limiter. A new PostgreSQL admission row is
unique by `(school_id, actor_user_id)` and shared by all API instances, both new
routes and all of a Parent's children. An atomic INSERT/ON CONFLICT counts at
most **60 admissions per 60-second fixed window**, starting with the first
database admission. The database clock establishes/reset the window. An expired
row resets on the next request; no background cleanup or maintenance repeat is
needed. One indexed mutable row per recorded School/actor bounds control state
independently of event count. Existing School/User deletion cascades remove it.
The database CHECK keeps the counter between 1 and 60. Exhausted requests do not
increment or update the row.

Admission commits separately from event recording: well-shaped authorized actor
requests consume a slot even when content is stale/inaccessible, a request
conflicts, or an identical retry returns its original event. Earlier validation,
guard and app ownership rejection does not consume admission. Current database
actor/membership/grant/School/Organization authorization is checked in the
admission statement. No admission or event is granted on database failure.
Exhaustion returns 429 and conservative `Retry-After: 60`; clients should wait,
then retry with the same logical request UUID when the original result is unknown.

The implementation uses the existing singleton Prisma pool. It adds no pool,
Redis client/endpoint, connection role, queue, worker, consumer or repeat. Its two
short transactions execute sequentially, never reserving two connections at
once for one request. Both use READ COMMITTED, maxWait 1000ms, transaction timeout
5000ms, SET LOCAL lock_timeout 1500ms and statement_timeout 3000ms. Lock/pool or
database failure produces sanitized 503 with no automatic retry.

The current capacity-control document owns API pool 5, Staging max 4 and
Production normal max 10, Core one pool 6 and Media one pool 3: 29 Staging / 59
Production normal application DB connections. ADR-0005's earlier API max 4,
Core count 2, Media count 2 calculation (38 runtime plus 12 operational = 50
against database 100) is historical role-policy evidence, not the current
environment-owned capacity default. Neither authority is changed. Existing
queue/realtime Redis capacity decisions remain governed separately; this path
does not use them. These are source-budget calculations, not production load or
live-provider measurements. Admission adds bounded query/WAL/lock demand within
the existing pool; protected deployment must monitor p95 latency, 429/503 rate,
pool waits, lock waits, admission row growth and event growth before increasing
traffic. No additional cloud capacity is assumed or provisioned.

## Transaction design, idempotency and races

The durable event key remains ACC-11A
`(schoolId, actorUserId, clientRequestId)`. UUID request/reference values are
normalized to lowercase. The original ACC-11A fingerprint is computed outside
the transaction from independently resolved server publication/revision/Guardian
facts and command fields. Inside the transaction, those exact identities are
resolved and compared under locks; a changed identity fails before persistence.
No external network, Redis operation or cryptographic call occurs inside either
transaction. The existing B3 transaction classifier is unchanged.

Event transaction lock order:

1. School-bound nondeleted Content FOR SHARE (ACC-7/9 Content-first order).
2. Canonical current publication independently resolved; exact Publication SHARE.
3. Revision, School, Organization, actor, Student, Enrollment, Classroom,
   Section, Grade and Stage SHARE through the shared current-access query.
4. Exact Membership, Role, RolePermission and Permission SHARE.
5. Relevant positive SubjectAllocation rows SHARE in ID order; fresh canonical
   read after any wait.
6. Current Parent Guardian/link rows SHARE in Guardian UUID order, then exact
   server identity comparison with the precomputed fingerprint attribution.
7. Exact RevisionAsset/File and existing School policy SHARE, or exact
   RevisionLink SHARE. Missing policy defaults are checked again in final SQL.
8. Reuse ACC-11A shape/eligible policy against the locked V2 publication and a
   database clock. Decode immutable Online Session constraints.
9. INSERT SELECT with a materialized fresh final clock, canonical current
   authorization, precondition and exact file/link/Guardian/session predicates.
   PostgreSQL uniqueness arbitrates duplicates using ON CONFLICT DO NOTHING.
10. On collision, look up the durable event in a single statement CROSS JOINing
    fresh final eligibility, then use ACC-11A retry comparison to return the
    identical original result or 409. An expired/revoked retry yields 404.

SHARE allows independent engagement writers but conflicts with UPDATE/DELETE
revocation and Content publication/cancellation writers. Relevant committed
revocation that wins before the locks is observed after waiting and blocks the
event. A writer that already holds the locks can commit before the subsequent
revocation. Fresh statement clocks enforce expiry after waits; READ COMMITTED
provides fresh canonical snapshots. Historical retry authorization and lookup
share a statement. The operation linearizes at the final eligible SQL statement;
it does not promise authorization remains unchanged after the response.

## Migration governance

One new incremental migration creates only the admission table, indexes, FKs and
bounded-counter CHECK:

`20261008093728_academic_content_engagement_admission`

- New SQL SHA-256:
  `68b1f5140c36a2b5a2290d2309debdeac86e58464c85721bc516e43231d9e1c1`.
- Accepted ACC-11A SQL SHA-256 retained:
  `bca21aa56272e03fd69965e8595962bfd690777d14a3eb870482ddb7aab6e094`.
- Aggregate 28-migration chain SHA-256:
  `e7c4e10394cfdb5788d5f75988850b035c81763ee860af763836d224f4be51e1`.
- All 27 historical SQL files and migration lock match baseline Git bytes.
- Schema/SQL/manifest were reviewed and staged; Prisma generation, validation,
  migration-governance tests/check and staged diff check passed before first
  application. Pre-application seal: `2026-10-08T09:41:01.764Z`.
- The first disposable owned PostgreSQL fixture had zero public tables.
  Fresh deploy applied all 28; status/seed passed, schema parity diff returned
  zero, and a second deploy was a no-op. First replay completed successfully at
  `2026-10-08T09:41:29.822Z`; fixture cleanup passed.
- New SQL bytes have remained sealed since application. A later schema comment
  placement correction required regenerating the client and manifest; it changed
  no SQL or schema semantics. No applied migration was edited. No reset, db push,
  resolve, manual DDL bypass or rebaseline was used.

## Real PostgreSQL and HTTP verification matrix

New fixtures create distinct Schools/Organizations, current Student/Parent actors,
memberships and view grant, Enrollment, multiple children and multiple Guardians,
immutable V2 publications, files, links and Online Sessions. Production authority
is exercised through actual Prisma/PostgreSQL; fixture deletion is School-bound.

| Coverage         | Observed assertions                                                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Five event types | Student and Parent event attribution, bounded responses, current file/link/session policy                                                                                                                                                     |
| Ownership        | Exact child, multiple-child isolation, deterministic multiple Guardians, foreign School/Organization, changed Student/Guardian Organization                                                                                                   |
| Live access      | Actor/School/Organization/Student/Enrollment/membership/grant revocation, changed Classroom, Guardian/link removal, cancelled/expired/future/predecessor/superseded publication, audience/internal/non-V2 denial, positive subject allocation |
| References       | Wrong, foreign, predecessor, public, deleted or empty File; unsupported preview type; preview/download policy; exact link and valid session                                                                                                   |
| Retry            | Stable original ID/time/response, uppercase UUID normalization, contradictory reuse 409, actor isolation, child conflict, stale precondition and revoked retry 404                                                                            |
| Duplicate race   | Eight simultaneous requests through two independent Prisma services produce one event and identical responses                                                                                                                                 |
| Admission race   | Counter at 58 plus eight concurrent requests admits exactly two and returns six 429s; window resets to one bounded row; retries/stale denials consume slots                                                                                   |
| Revoker wins     | Real pg_blocking_pids barriers for Guardian link, actor, Enrollment, permission, cancellation and actual successor publication; zero unauthorized events                                                                                      |
| Writer wins      | Actual event authority locks block cancellation/Guardian unlink until event commits; subsequent request denied                                                                                                                                |
| Expiry race      | Database clock polled after initial read while waiting on Student lock; final insert denied with no event                                                                                                                                     |
| Actual HTTP      | JWT/session/scope/permissions/app access, strict DTO/paths, 200/retry/400/401/403/404/409/429/503, private headers and Retry-After, sanitized error logs                                                                                      |

Test barriers activate real PostgreSQL queries before polling blockers. Writer
barriers execute the real reference SQL before pausing. No production test hooks
or mock-only race claims were introduced. The only mocked database failure checks
public/log sanitization; concurrency and authorization races use real PostgreSQL.

## Verification results

Local gate results are recorded below. The owner approved the narrow inherited
route-test lint exception after the complete diagnostic comparison; every other
gate remains mandatory. No mandatory CI failure is waived.

| Gate                                                            | Result                                                         | Evidence                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Prisma validate/generate                                        | PASS                                                           | `static-gates.json`, final generation after comment correction                        |
| Production typecheck                                            | PASS, zero diagnostics                                         | `productionTypecheck.log`; local process heap 6144 MiB, config unchanged              |
| Changed TypeScript typecheck                                    | PASS, 20 files, zero diagnostics                               | `typecheck-changed.json`; no baseline exception                                       |
| Production build/postbuild                                      | PASS                                                           | `productionBuild.log`, reference-data bootstrap contract PASS                         |
| Lint other changed TypeScript                                   | PASS, 18 files, zero errors/warnings                           | `changed-eslint-final.json`                                                           |
| Format other changed TypeScript                                 | PASS, 18 files                                                 | `final-prettier18.log`, existing endOfLine auto setting                               |
| Audit format / diff check                                       | PASS                                                           | `final-auditFormat.log`, `final-diffCheck.log`                                        |
| Focused ACC-11A + ACC-11B PostgreSQL/HTTP/races                 | PASS, 4 suites / 76 tests / zero skipped                       | `focus-attempt-5-evidence.json`, cleanup PASS                                         |
| Academic Content/Communication/app unit regression              | PASS, 118 suites / 1343 tests / zero skipped                   | `unit-attempt-3-evidence.json`, cleanup PASS                                          |
| ACC-10 access/files/Student/Parent/notifications integration    | PASS, 6 suites / 289 tests / zero skipped                      | `integration-attempt-1-evidence.json`, cleanup PASS                                   |
| Publication snapshots/runtime/ACC-10 final/shared file lifetime | PASS, 4 suites / 174 tests / zero skipped                      | `dbregression-attempt-1-evidence.json`, cleanup PASS                                  |
| Existing app/file security and final app closeout               | PASS, 6 suites / 144 tests / zero skipped                      | `security-attempt-2-evidence.json`, cleanup PASS                                      |
| Existing CI orchestration Node tests                            | PASS, 69 tests / zero skipped                                  | `ci-orchestrator-tests.log`                                                           |
| B3 transaction/G05 current-CI Node tests                        | PASS, 188 executed; 8 explicit historical skips; zero failures | `transaction-clean-start-current-ci-tests.log`                                        |
| Migration governance / fresh replay                             | PASS                                                           | Pre-application seal, full-chain replay/status/parity/seed/no-op and cleanup evidence |
| Exact baseline-to-candidate route inventory                     | PASS                                                           | Exactly 2 added POSTs, 0 removals, all existing routes preserved                      |

### Inherited lint findings in route inventory tests

The two existing final-closeout files changed only to admit their authorized POST
and adjust Parent route counts. Their complete diagnostic sets were compared
against Git source at accepted baseline
`7ecebe99a75721f25f0502db0c82b6d896408a6e` using the same ESLint configuration.
Location mapping accounts only for the inserted expectation line; rule, severity,
message, node type, start/end locations and source hashes are retained. No
diagnostics were suppressed, filtered, added or removed.

| File                            | Baseline errors / warnings | Candidate errors / warnings |
| ------------------------------- | -------------------------- | --------------------------- |
| Parent final-closeout e2e test  | 70 / 1                     | 70 / 1                      |
| Student final-closeout e2e test | 68 / 0                     | 68 / 0                      |
| Total                           | 138 / 1                    | 138 / 1                     |

```ini
CLEAN_CHANGED_FILE_LINT_PASS=NO
ROUTE_TEST_LINT_DIAGNOSTIC_SET_IDENTICAL=YES
INTRODUCED_LINT_ERRORS=0
INTRODUCED_LINT_WARNINGS=0
REMOVED_LINT_ERRORS=0
REMOVED_LINT_WARNINGS=0
INHERITED_ROUTE_TEST_LINT_EXCEPTION=APPROVED_WITH_CONDITIONS
ACC_11B_LINT_EXCEPTION=APPROVED_WITH_CONDITIONS
EXCEPTION_SCOPE=TWO_EXISTING_ROUTE_TEST_FILES_ONLY
LINT_CLEAN_PASS=NO
LINT_STATUS=PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION
REMOVED_LINT_DIAGNOSTICS=0
BASELINE_LINT_DEBT_FIXED_IN_ACC_11B=NO
OTHER_18_CHANGED_TYPESCRIPT_ESLINT=PASS
TYPECHECK_CHANGED_TYPESCRIPT=PASS
```

Evidence: `route-expectation-eslint-baseline.json`,
`route-expectation-eslint.json`, `route-expectation-lint-comparison.json` and
`route-lint-comparison.log`. The baseline copies were temporary same-directory
files to preserve import/typechecking context and were removed in a finally
block. Existing lint/TypeScript configuration and rules are unchanged; no new
disable comments, suppressions, mass formatting or unrelated lint fixes exist.

All disposable fixtures use the existing CI orchestration harness and loopback
Docker PostgreSQL/Redis/MinIO with owned labels and cleanup evidence. Local reuse
of installed dependencies and matching generated Prisma client is explicitly
checked; it does not alter committed CI. Logs, JSON results and source hashes are
retained locally under ignored `coverage/acc11b/`.

Initial failures are retained: offline Prisma required a dummy validation URL;
default Node heap exhausted during typecheck; local Windows engine regeneration
was blocked while Jest held its DLL; a comment-only schema difference invalidated
the local generated-client reuse check. Appropriate environment/client correction
resolved these without suppressions or config changes. First focused fixtures
had an invalid internal Teacher audience, a blocker PID bigint cast mismatch and
a privacy assertion matching a forbidden field name rather than a private value;
these were corrected. Three app/Core module imports initially placed after class
initialization were moved to the normal import block. B3 initially could not
classify hashing inside the write callback; hashing moved outside while exact
server identities are checked again under locks. No classifier was weakened.

The Student and Parent final-closeout route assertions require their one
authorized POST addition (Parent 77→78 total and 12→13 writes; 65 GETs retained).
Every other route assertion is preserved. The historical G05 unmodified-working-
tree check is inapplicable before a feature commit; the existing PRD3_CURRENT_CI
mode explicitly classifies historical candidate checks as skipped. This is
reported separately from executed passing tests.

### Complete retained diagnostic comparison

Owner authorization is limited to the two exact existing file paths below. The
raw ESLint reports remain unfiltered under `coverage/acc11b`; their content
identities are sealed below. Every one of the 139 diagnostics (138 errors and
one warning) is listed with its original message, rule, severity, node type,
baseline/candidate locations and identical mapped source-span SHA-256. Candidate
locations after the inserted route expectation map back by one line. No
diagnostic intersects newly introduced text, and every diagnostic source span
is unchanged. Counter literals changed only for the authorized Parent route
counts and introduce no diagnostic. This evidence supports the approved minimal
route-test patch; it does not waive a mandatory CI gate.

- `coverage/acc11b/route-expectation-eslint-baseline.json`: `3e4a4506899846854e86c7f178916c2365592efefe64c0957fcb18b99c0c9b83`.
- `coverage/acc11b/route-expectation-eslint.json`: `5b0ed9dd7c16245e9867c961b164d63a41ff31abd01449131a1d2c51f579e205`.
- `coverage/acc11b/route-expectation-lint-comparison.json`: `c03eb0038b8e1d2a9617a8101f68904bcc37c1d8bc7fd5305d3edb168b6459c8`.

<details>
<summary>test/e2e/parent-app-final-closeout.e2e-spec.ts — 70 errors / 1 warnings</summary>

Baseline Git authority: `7ecebe99a75721f25f0502db0c82b6d896408a6e:test/e2e/parent-app-final-closeout.e2e-spec.ts`.

Baseline source SHA-256: `21d459fffaccda0a455741514bb811fccdd67a714b6c899acbb951110a62a4da`.

Candidate source SHA-256: `1ef2b0c1f4f599a9f78fd49db49d1f56ec60b19fc918d4c1cb6fb98518d81048`.

Inserted expectation candidate line: `924`.

Complete comparison (one JSON record per unfiltered diagnostic):

```text
{"rule":"@typescript-eslint/unbound-method","severity":2,"message":"A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.\nConsider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. \nIf a function does not access `this`, it can be annotated with `this: void`.","nodeType":"MemberExpression","baseline":{"line":106,"column":12,"endLine":106,"endColumn":55},"candidate":{"line":106,"column":12,"endLine":106,"endColumn":55},"mappedSourceSha256":"118427ecf7bc669b9c0009ea0d2a352e7c4d4358b362ac96aaa74fa4d97e55d7"}
{"rule":"@typescript-eslint/unbound-method","severity":2,"message":"A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.\nConsider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. \nIf a function does not access `this`, it can be annotated with `this: void`.","nodeType":"MemberExpression","baseline":{"line":151,"column":12,"endLine":151,"endColumn":58},"candidate":{"line":151,"column":12,"endLine":151,"endColumn":58},"mappedSourceSha256":"5e8c1d48d8850a3337b21b61dd3c718477317deb8d2f938dab991eca7245aaef"}
{"rule":"@typescript-eslint/unbound-method","severity":2,"message":"A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.\nConsider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. \nIf a function does not access `this`, it can be annotated with `this: void`.","nodeType":"MemberExpression","baseline":{"line":169,"column":12,"endLine":169,"endColumn":54},"candidate":{"line":169,"column":12,"endLine":169,"endColumn":54},"mappedSourceSha256":"06f57acd6f4dfc68a0536d1d996b456ff70620358de80cd6996438964f34eade"}
{"rule":"@typescript-eslint/require-await","severity":2,"message":"Async arrow function has no 'await' expression.","nodeType":"ArrowFunctionExpression","baseline":{"line":847,"column":95,"endLine":847,"endColumn":97},"candidate":{"line":847,"column":95,"endLine":847,"endColumn":97},"mappedSourceSha256":"b310676102b8f4f9acc55d058768284571823ae5e37c71cce3ff5c592c9e5a81"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .parent on an `any` value.","nodeType":"Identifier","baseline":{"line":997,"column":22,"endLine":997,"endColumn":28},"candidate":{"line":998,"column":22,"endLine":998,"endColumn":28},"mappedSourceSha256":"e47125968b3b71049fbc4802d1e40a71ea1359decfabacf70b34588037d4ff0c"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .school on an `any` value.","nodeType":"Identifier","baseline":{"line":1003,"column":22,"endLine":1003,"endColumn":28},"candidate":{"line":1004,"column":22,"endLine":1004,"endColumn":28},"mappedSourceSha256":"d64debd942d7dc26a851231583b1721f43ea936fa41932b6dad7556e5f8cd24a"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .children on an `any` value.","nodeType":"Identifier","baseline":{"line":1007,"column":22,"endLine":1007,"endColumn":30},"candidate":{"line":1008,"column":22,"endLine":1008,"endColumn":30},"mappedSourceSha256":"10910087de24bfcabe854fda62b5023a61fe531705043b9979fdf00f12c4c0ec"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summaries on an `any` value.","nodeType":"Identifier","baseline":{"line":1019,"column":22,"endLine":1019,"endColumn":31},"candidate":{"line":1020,"column":22,"endLine":1020,"endColumn":31},"mappedSourceSha256":"c626a992e31bddf7c99810ed648325d6eae70033aae4362eef9cd4da3bd6c66c"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .schedule on an `any` value.","nodeType":"Identifier","baseline":{"line":1020,"column":22,"endLine":1020,"endColumn":30},"candidate":{"line":1021,"column":22,"endLine":1021,"endColumn":30},"mappedSourceSha256":"5f72005e81c4ecbd5aa3588e80e3daf0df068ce0cf5638944508a0165fea609a"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .student on an `any` value.","nodeType":"Identifier","baseline":{"line":1058,"column":24,"endLine":1058,"endColumn":31},"candidate":{"line":1059,"column":24,"endLine":1059,"endColumn":31},"mappedSourceSha256":"264c8c381bf16c982a4e59b0dd4c6f7808c51a05f64c35db42cc78a2a72875bb"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .enrollment on an `any` value.","nodeType":"Identifier","baseline":{"line":1064,"column":24,"endLine":1064,"endColumn":34},"candidate":{"line":1065,"column":24,"endLine":1065,"endColumn":34},"mappedSourceSha256":"2791bd4394efbf10623f3cd301dc57f37ff18ff2a806b2c013403e85bc62c530"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summaries on an `any` value.","nodeType":"Identifier","baseline":{"line":1070,"column":24,"endLine":1070,"endColumn":33},"candidate":{"line":1071,"column":24,"endLine":1071,"endColumn":33},"mappedSourceSha256":"c626a992e31bddf7c99810ed648325d6eae70033aae4362eef9cd4da3bd6c66c"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .unsupported on an `any` value.","nodeType":"Identifier","baseline":{"line":1079,"column":24,"endLine":1079,"endColumn":35},"candidate":{"line":1080,"column":24,"endLine":1080,"endColumn":35},"mappedSourceSha256":"60945d49535300be8e42108658dba31fcd5d665fc40d6f186798e7e0682320ae"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .parent on an `any` value.","nodeType":"Identifier","baseline":{"line":1095,"column":25,"endLine":1095,"endColumn":31},"candidate":{"line":1096,"column":25,"endLine":1096,"endColumn":31},"mappedSourceSha256":"e47125968b3b71049fbc4802d1e40a71ea1359decfabacf70b34588037d4ff0c"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .guardians on an `any` value.","nodeType":"Identifier","baseline":{"line":1103,"column":25,"endLine":1103,"endColumn":34},"candidate":{"line":1104,"column":25,"endLine":1104,"endColumn":34},"mappedSourceSha256":"124f08e2ce881b978d2aeafa3a3c59911a6ab845be31f660a0cd105fba27bedc"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .children on an `any` value.","nodeType":"Identifier","baseline":{"line":1109,"column":25,"endLine":1109,"endColumn":33},"candidate":{"line":1110,"column":25,"endLine":1110,"endColumn":33},"mappedSourceSha256":"10910087de24bfcabe854fda62b5023a61fe531705043b9979fdf00f12c4c0ec"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .unsupported on an `any` value.","nodeType":"Identifier","baseline":{"line":1121,"column":25,"endLine":1121,"endColumn":36},"candidate":{"line":1122,"column":25,"endLine":1122,"endColumn":36},"mappedSourceSha256":"60945d49535300be8e42108658dba31fcd5d665fc40d6f186798e7e0682320ae"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .child on an `any` value.","nodeType":"Identifier","baseline":{"line":1141,"column":22,"endLine":1141,"endColumn":27},"candidate":{"line":1142,"column":22,"endLine":1142,"endColumn":27},"mappedSourceSha256":"ddc9e669194254cef019a29d3619a2c16592e5d52e1a81e98b01bd52319149a3"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .assessments on an `any` value.","nodeType":"Identifier","baseline":{"line":1145,"column":22,"endLine":1145,"endColumn":33},"candidate":{"line":1146,"column":22,"endLine":1146,"endColumn":33},"mappedSourceSha256":"f887c6af08daaa18b3e1b081db3571d065fd300e9fb86652aa5eaad9b960e161"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1163,"column":25,"endLine":1163,"endColumn":32},"candidate":{"line":1164,"column":25,"endLine":1164,"endColumn":32},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .assessment on an `any` value.","nodeType":"Identifier","baseline":{"line":1177,"column":24,"endLine":1177,"endColumn":34},"candidate":{"line":1178,"column":24,"endLine":1178,"endColumn":34},"mappedSourceSha256":"89c08f7a02989db85066486407e81228ddadae03a30b293e5298cd050bd92db7"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .grade on an `any` value.","nodeType":"Identifier","baseline":{"line":1182,"column":24,"endLine":1182,"endColumn":29},"candidate":{"line":1183,"column":24,"endLine":1183,"endColumn":29},"mappedSourceSha256":"ffe97bba510b9f5cf1bb187bebb59cefa42a3f1654d2c993654382cd10468c2e"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .records on an `any` value.","nodeType":"Identifier","baseline":{"line":1206,"column":22,"endLine":1206,"endColumn":29},"candidate":{"line":1207,"column":22,"endLine":1207,"endColumn":29},"mappedSourceSha256":"a94e7bcfcbed3c846d491d4f47c948e53a23908d480248b3ffe9e126e83ea865"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1222,"column":22,"endLine":1222,"endColumn":29},"candidate":{"line":1223,"column":22,"endLine":1223,"endColumn":29},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1229,"column":37,"endLine":1229,"endColumn":44},"candidate":{"line":1230,"column":37,"endLine":1230,"endColumn":44},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1240,"column":25,"endLine":1240,"endColumn":32},"candidate":{"line":1241,"column":25,"endLine":1241,"endColumn":32},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .child on an `any` value.","nodeType":"Identifier","baseline":{"line":1267,"column":28,"endLine":1267,"endColumn":33},"candidate":{"line":1268,"column":28,"endLine":1268,"endColumn":33},"mappedSourceSha256":"ddc9e669194254cef019a29d3619a2c16592e5d52e1a81e98b01bd52319149a3"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .items on an `any` value.","nodeType":"Identifier","baseline":{"line":1271,"column":28,"endLine":1271,"endColumn":33},"candidate":{"line":1272,"column":28,"endLine":1272,"endColumn":33},"mappedSourceSha256":"5f3c4f8580d392e422e7c2f6802674ac27966c98d95c39696e4b2490168e5488"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1300,"column":28,"endLine":1300,"endColumn":35},"candidate":{"line":1301,"column":28,"endLine":1301,"endColumn":35},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .child on an `any` value.","nodeType":"Identifier","baseline":{"line":1321,"column":35,"endLine":1321,"endColumn":40},"candidate":{"line":1322,"column":35,"endLine":1322,"endColumn":40},"mappedSourceSha256":"ddc9e669194254cef019a29d3619a2c16592e5d52e1a81e98b01bd52319149a3"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1325,"column":35,"endLine":1325,"endColumn":42},"candidate":{"line":1326,"column":35,"endLine":1326,"endColumn":42},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1332,"column":35,"endLine":1332,"endColumn":42},"candidate":{"line":1333,"column":35,"endLine":1333,"endColumn":42},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1335,"column":35,"endLine":1335,"endColumn":42},"candidate":{"line":1336,"column":35,"endLine":1336,"endColumn":42},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .academic on an `any` value.","nodeType":"Identifier","baseline":{"line":1349,"column":26,"endLine":1349,"endColumn":34},"candidate":{"line":1350,"column":26,"endLine":1350,"endColumn":34},"mappedSourceSha256":"b8a98203ec9d769d748b532cd77e452e31270cff2369717171175462fb1c0770"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .behavior on an `any` value.","nodeType":"Identifier","baseline":{"line":1354,"column":26,"endLine":1354,"endColumn":34},"candidate":{"line":1355,"column":26,"endLine":1355,"endColumn":34},"mappedSourceSha256":"08bf2418cca97fefbdf7f0d29719b005a6117989d84358de68bc57570ffbae36"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .xp on an `any` value.","nodeType":"Identifier","baseline":{"line":1357,"column":26,"endLine":1357,"endColumn":28},"candidate":{"line":1358,"column":26,"endLine":1358,"endColumn":28},"mappedSourceSha256":"9a3576ca4a048b010e835e65673b0db5bcd2e08bd95881d58117d28421c5a748"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .unsupported on an `any` value.","nodeType":"Identifier","baseline":{"line":1363,"column":26,"endLine":1363,"endColumn":37},"candidate":{"line":1364,"column":26,"endLine":1364,"endColumn":37},"mappedSourceSha256":"60945d49535300be8e42108658dba31fcd5d665fc40d6f186798e7e0682320ae"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1376,"column":26,"endLine":1376,"endColumn":33},"candidate":{"line":1377,"column":26,"endLine":1377,"endColumn":33},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1384,"column":26,"endLine":1384,"endColumn":33},"candidate":{"line":1385,"column":26,"endLine":1385,"endColumn":33},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .totalXp on an `any` value.","nodeType":"Identifier","baseline":{"line":1392,"column":20,"endLine":1392,"endColumn":27},"candidate":{"line":1393,"column":20,"endLine":1393,"endColumn":27},"mappedSourceSha256":"1ea0dcecceb1013e95c1946c371103fe59a29d8b8ac7aa6134e147a48eeaa857"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .reports on an `any` value.","nodeType":"Identifier","baseline":{"line":1403,"column":22,"endLine":1403,"endColumn":29},"candidate":{"line":1404,"column":22,"endLine":1404,"endColumn":29},"mappedSourceSha256":"7f26104f77a7ce477546cd1ea99b6c99b5eb079e3ec9238583314eccea00440a"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1408,"column":9,"endLine":1419,"endColumn":11},"candidate":{"line":1409,"column":9,"endLine":1420,"endColumn":11},"mappedSourceSha256":"1835aca556a5fdd6110a0e81733283654988ca8aba72e1707f774c2209750b7c"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1410,"column":11,"endLine":1418,"endColumn":13},"candidate":{"line":1411,"column":11,"endLine":1419,"endColumn":13},"mappedSourceSha256":"38e110f21b91d71acb8b5eb46fecc5dc2f62ebabed5c4b94d8c4c0a2b22365a2"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .unavailable on an `any` value.","nodeType":"Identifier","baseline":{"line":1426,"column":22,"endLine":1426,"endColumn":33},"candidate":{"line":1427,"column":22,"endLine":1427,"endColumn":33},"mappedSourceSha256":"ba691ba042bcedd9a61a36f5969026bc95859dccdc7e47f24e6bce35673baf2f"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .child on an `any` value.","nodeType":"Identifier","baseline":{"line":1482,"column":22,"endLine":1482,"endColumn":27},"candidate":{"line":1483,"column":22,"endLine":1483,"endColumn":27},"mappedSourceSha256":"ddc9e669194254cef019a29d3619a2c16592e5d52e1a81e98b01bd52319149a3"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .tasks on an `any` value.","nodeType":"Identifier","baseline":{"line":1485,"column":22,"endLine":1485,"endColumn":27},"candidate":{"line":1486,"column":22,"endLine":1486,"endColumn":27},"mappedSourceSha256":"085154084c7427596104bc42f51f59f6d3ffd3d5f49f098210c20449fb7b2c71"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1507,"column":25,"endLine":1507,"endColumn":32},"candidate":{"line":1508,"column":25,"endLine":1508,"endColumn":32},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .task on an `any` value.","nodeType":"Identifier","baseline":{"line":1523,"column":24,"endLine":1523,"endColumn":28},"candidate":{"line":1524,"column":24,"endLine":1524,"endColumn":28},"mappedSourceSha256":"0ebb429fa86d481c2630fac53db1c91cffed5d4d41d1021c179444eb67e7ee0b"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .task on an `any` value.","nodeType":"Identifier","baseline":{"line":1532,"column":24,"endLine":1532,"endColumn":28},"candidate":{"line":1533,"column":24,"endLine":1533,"endColumn":28},"mappedSourceSha256":"0ebb429fa86d481c2630fac53db1c91cffed5d4d41d1021c179444eb67e7ee0b"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1537,"column":11,"endLine":1549,"endColumn":13},"candidate":{"line":1538,"column":11,"endLine":1550,"endColumn":13},"mappedSourceSha256":"d882a8efad58c5ea2f54662d35749adfa08db424dd91a0cf7b532b822c67635f"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1540,"column":13,"endLine":1548,"endColumn":15},"candidate":{"line":1541,"column":13,"endLine":1549,"endColumn":15},"mappedSourceSha256":"4a48fc619f4ad0de89ca10f72c2c0de0f1258a134156cdefdcd69cf875be9781"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1546,"column":15,"endLine":1546,"endColumn":44},"candidate":{"line":1547,"column":15,"endLine":1547,"endColumn":44},"mappedSourceSha256":"4bc9776e26144d9d51df453094668869ff98f33e49b1a56ab6973657649b1eb9"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .submissions on an `any` value.","nodeType":"Identifier","baseline":{"line":1604,"column":29,"endLine":1604,"endColumn":40},"candidate":{"line":1605,"column":29,"endLine":1605,"endColumn":40},"mappedSourceSha256":"21e945ad5e3b81adf2ac82114f7e701ca858a81c9b678ea7d23f95927b71d424"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .submission on an `any` value.","nodeType":"Identifier","baseline":{"line":1627,"column":34,"endLine":1627,"endColumn":44},"candidate":{"line":1628,"column":34,"endLine":1628,"endColumn":44},"mappedSourceSha256":"293f1d2ee206a7cbebe633764a26ea455bd39f494a774a7289f8663da31916a2"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .conversations on an `any` value.","nodeType":"Identifier","baseline":{"line":1657,"column":22,"endLine":1657,"endColumn":35},"candidate":{"line":1658,"column":22,"endLine":1658,"endColumn":35},"mappedSourceSha256":"5c0dc939187d4ae4bdb6abd314825f9f524c45c140b6e929ab93708e94b4f25f"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .conversation on an `any` value.","nodeType":"Identifier","baseline":{"line":1678,"column":24,"endLine":1678,"endColumn":36},"candidate":{"line":1679,"column":24,"endLine":1679,"endColumn":36},"mappedSourceSha256":"8b34dbc2c05eb4d7e25d48efeace82456b16cee760bcae80c157f52a3c2e787b"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .conversation on an `any` value.","nodeType":"Identifier","baseline":{"line":1682,"column":24,"endLine":1682,"endColumn":36},"candidate":{"line":1683,"column":24,"endLine":1683,"endColumn":36},"mappedSourceSha256":"8b34dbc2c05eb4d7e25d48efeace82456b16cee760bcae80c157f52a3c2e787b"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"VariableDeclarator","baseline":{"line":1699,"column":11,"endLine":1702,"endColumn":6},"candidate":{"line":1700,"column":11,"endLine":1703,"endColumn":6},"mappedSourceSha256":"c874c464b37d8ba8b92b64a618e2071bdd6bdc864225dbf68611e5431cdf0f04"}
{"rule":"@typescript-eslint/no-unsafe-call","severity":2,"message":"Unsafe call of an `any` typed value.","nodeType":"MemberExpression","baseline":{"line":1699,"column":27,"endLine":1699,"endColumn":54},"candidate":{"line":1700,"column":27,"endLine":1700,"endColumn":54},"mappedSourceSha256":"8950ac7804c1e0f05f77558948f9b0bc0c1cbe24c124e6ccb93a967812139a11"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .messages on an `any` value.","nodeType":"Identifier","baseline":{"line":1699,"column":41,"endLine":1699,"endColumn":49},"candidate":{"line":1700,"column":41,"endLine":1700,"endColumn":49},"mappedSourceSha256":"f5cccfb737512bedd4f2e39e7d72425ae8d3ebf8aa8ab6f966bef1fc916f5011"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .message on an `any` value.","nodeType":"Identifier","baseline":{"line":1727,"column":22,"endLine":1727,"endColumn":29},"candidate":{"line":1728,"column":22,"endLine":1728,"endColumn":29},"mappedSourceSha256":"ab530a13e45914982b79f9b7e3fba994cfd1f3fb22f71cea1afbf02b460c6d1d"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1731,"column":7,"endLine":1734,"endColumn":9},"candidate":{"line":1732,"column":7,"endLine":1735,"endColumn":9},"mappedSourceSha256":"340c3a7b47005ce9d6b6519250efa817723b997baad73ef9f80316a7ea60bb05"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .announcements on an `any` value.","nodeType":"Identifier","baseline":{"line":1792,"column":22,"endLine":1792,"endColumn":35},"candidate":{"line":1793,"column":22,"endLine":1793,"endColumn":35},"mappedSourceSha256":"ac3b4e3b232f9dd207067c8e7dad449e35787fe63a8ed3f33023ef1fe0738594"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .announcement on an `any` value.","nodeType":"Identifier","baseline":{"line":1811,"column":24,"endLine":1811,"endColumn":36},"candidate":{"line":1812,"column":24,"endLine":1812,"endColumn":36},"mappedSourceSha256":"86118a3b7fc92492b026562882076481e99119cc9563879b4f0076cf8d7bff31"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .attachments on an `any` value.","nodeType":"Identifier","baseline":{"line":1839,"column":29,"endLine":1839,"endColumn":40},"candidate":{"line":1840,"column":29,"endLine":1840,"endColumn":40},"mappedSourceSha256":"3930e671c9e40dee2a33442c6f1055e8e8b75958ee19da8bd470754fd44beec2"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .attachments on an `any` value.","nodeType":"Identifier","baseline":{"line":1845,"column":29,"endLine":1845,"endColumn":40},"candidate":{"line":1846,"column":29,"endLine":1846,"endColumn":40},"mappedSourceSha256":"3930e671c9e40dee2a33442c6f1055e8e8b75958ee19da8bd470754fd44beec2"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1847,"column":9,"endLine":1847,"endColumn":35},"candidate":{"line":1848,"column":9,"endLine":1848,"endColumn":35},"mappedSourceSha256":"88c9950d6793abdd6a64a7eeae131bbcd49f6a0efb11007e29f0576cd7c55fe0"}
{"rule":"@typescript-eslint/no-unsafe-argument","severity":1,"message":"Unsafe argument of type `any` assigned to a parameter of type `{}`.","nodeType":"MemberExpression","baseline":{"line":1853,"column":24,"endLine":1853,"endColumn":55},"candidate":{"line":1854,"column":24,"endLine":1854,"endColumn":55},"mappedSourceSha256":"7a20903f1fa537b67172a87ad9b53fd952ea19fd6703bef062181e37ef51c8c0"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .attachments on an `any` value.","nodeType":"Identifier","baseline":{"line":1853,"column":41,"endLine":1853,"endColumn":52},"candidate":{"line":1854,"column":41,"endLine":1854,"endColumn":52},"mappedSourceSha256":"3930e671c9e40dee2a33442c6f1055e8e8b75958ee19da8bd470754fd44beec2"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":3395,"column":14,"endLine":3395,"endColumn":52},"candidate":{"line":3396,"column":14,"endLine":3396,"endColumn":52},"mappedSourceSha256":"4a42c908b534cb4333a0f97fde48f65ab3a7339d8ac01696f54082a6350b8fee"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .accessToken on an `any` value.","nodeType":"Identifier","baseline":{"line":3395,"column":41,"endLine":3395,"endColumn":52},"candidate":{"line":3396,"column":41,"endLine":3396,"endColumn":52},"mappedSourceSha256":"94a2776e7bd6f611462bc4344e17773c65fc4c486401643b724d102a8936dff4"}
```

</details>

<details>
<summary>test/e2e/student-app-final-closeout.e2e-spec.ts — 68 errors / 0 warnings</summary>

Baseline Git authority: `7ecebe99a75721f25f0502db0c82b6d896408a6e:test/e2e/student-app-final-closeout.e2e-spec.ts`.

Baseline source SHA-256: `9a0fbc8ad046de5b7c38adf28434fc86b7b47fce9758498277453ece93b03720`.

Candidate source SHA-256: `006455e24ceb5eb634b9cf526b219e28566e047d0e8dec4f5f3e5190dd0e784d`.

Inserted expectation candidate line: `844`.

Complete comparison (one JSON record per unfiltered diagnostic):

```text
{"rule":"@typescript-eslint/unbound-method","severity":2,"message":"A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.\nConsider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. \nIf a function does not access `this`, it can be annotated with `this: void`.","nodeType":"MemberExpression","baseline":{"line":107,"column":12,"endLine":107,"endColumn":40},"candidate":{"line":107,"column":12,"endLine":107,"endColumn":40},"mappedSourceSha256":"8fcae5aa2581c86cc39eec94702133414ef482ede133d69c29971f893babfc38"}
{"rule":"@typescript-eslint/no-unused-vars","severity":2,"message":"'createdMessageReadIds' is assigned a value but never used.","nodeType":"Identifier","baseline":{"line":316,"column":9,"endLine":316,"endColumn":30},"candidate":{"line":316,"column":9,"endLine":316,"endColumn":30},"mappedSourceSha256":"dde842e89c4ee5cc7b417a756b4a006c6dcac22a3e8ac967f7f0f01f67ca74eb"}
{"rule":"@typescript-eslint/no-unused-vars","severity":2,"message":"'createdAnnouncementReadIds' is assigned a value but never used.","nodeType":"Identifier","baseline":{"line":319,"column":9,"endLine":319,"endColumn":35},"candidate":{"line":319,"column":9,"endLine":319,"endColumn":35},"mappedSourceSha256":"cb7ac775df82a53bdc8db049c717894add61234ce2d35b2d5814575cd5f61744"}
{"rule":"@typescript-eslint/require-await","severity":2,"message":"Async arrow function has no 'await' expression.","nodeType":"ArrowFunctionExpression","baseline":{"line":760,"column":97,"endLine":760,"endColumn":99},"candidate":{"line":760,"column":97,"endLine":760,"endColumn":99},"mappedSourceSha256":"b310676102b8f4f9acc55d058768284571823ae5e37c71cce3ff5c592c9e5a81"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .student on an `any` value.","nodeType":"Identifier","baseline":{"line":899,"column":22,"endLine":899,"endColumn":29},"candidate":{"line":900,"column":22,"endLine":900,"endColumn":29},"mappedSourceSha256":"264c8c381bf16c982a4e59b0dd4c6f7808c51a05f64c35db42cc78a2a72875bb"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .enrollment on an `any` value.","nodeType":"Identifier","baseline":{"line":904,"column":22,"endLine":904,"endColumn":32},"candidate":{"line":905,"column":22,"endLine":905,"endColumn":32},"mappedSourceSha256":"2791bd4394efbf10623f3cd301dc57f37ff18ff2a806b2c013403e85bc62c530"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .today on an `any` value.","nodeType":"Identifier","baseline":{"line":910,"column":22,"endLine":910,"endColumn":27},"candidate":{"line":911,"column":22,"endLine":911,"endColumn":27},"mappedSourceSha256":"e0f4f767ac88a9303e7317843ac20be980665a36f52397e5b26d4cc2bf54011d"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summaries on an `any` value.","nodeType":"Identifier","baseline":{"line":914,"column":22,"endLine":914,"endColumn":31},"candidate":{"line":915,"column":22,"endLine":915,"endColumn":31},"mappedSourceSha256":"c626a992e31bddf7c99810ed648325d6eae70033aae4362eef9cd4da3bd6c66c"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .student on an `any` value.","nodeType":"Identifier","baseline":{"line":927,"column":25,"endLine":927,"endColumn":32},"candidate":{"line":928,"column":25,"endLine":928,"endColumn":32},"mappedSourceSha256":"264c8c381bf16c982a4e59b0dd4c6f7808c51a05f64c35db42cc78a2a72875bb"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .student on an `any` value.","nodeType":"Identifier","baseline":{"line":935,"column":25,"endLine":935,"endColumn":32},"candidate":{"line":936,"column":25,"endLine":936,"endColumn":32},"mappedSourceSha256":"264c8c381bf16c982a4e59b0dd4c6f7808c51a05f64c35db42cc78a2a72875bb"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .avatar on an `any` value.","nodeType":"Identifier","baseline":{"line":936,"column":25,"endLine":936,"endColumn":31},"candidate":{"line":937,"column":25,"endLine":937,"endColumn":31},"mappedSourceSha256":"87bbe879c7a5f5784a70384bb49fa9513a6a3fbe4c2d388635e3c87611c03fae"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .unsupported on an `any` value.","nodeType":"Identifier","baseline":{"line":937,"column":25,"endLine":937,"endColumn":36},"candidate":{"line":938,"column":25,"endLine":938,"endColumn":36},"mappedSourceSha256":"60945d49535300be8e42108658dba31fcd5d665fc40d6f186798e7e0682320ae"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .subjects on an `any` value.","nodeType":"Identifier","baseline":{"line":953,"column":26,"endLine":953,"endColumn":34},"candidate":{"line":954,"column":26,"endLine":954,"endColumn":34},"mappedSourceSha256":"e223d8ec1e6450dae88d4eb042479e5fa6104e6fd30b15add076db936b290367"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":958,"column":11,"endLine":958,"endColumn":35},"candidate":{"line":959,"column":11,"endLine":959,"endColumn":35},"mappedSourceSha256":"046f36c2b7d14e0944a5829e8bfb9a8f27624541855ae3288394e6a00f166c6d"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":959,"column":11,"endLine":965,"endColumn":13},"candidate":{"line":960,"column":11,"endLine":966,"endColumn":13},"mappedSourceSha256":"19870ae4b32af7c703c149c99ac655144b2588a13c3a1a615b8280a23b2e16b9"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .subject on an `any` value.","nodeType":"Identifier","baseline":{"line":979,"column":31,"endLine":979,"endColumn":38},"candidate":{"line":980,"column":31,"endLine":980,"endColumn":38},"mappedSourceSha256":"a9491f4c1bf7b0cffbadcba2db8f028e4b3f2867cb59e1f3a0bc1968f3c51242"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .lessons on an `any` value.","nodeType":"Identifier","baseline":{"line":986,"column":31,"endLine":986,"endColumn":38},"candidate":{"line":987,"column":31,"endLine":987,"endColumn":38},"mappedSourceSha256":"314a6b49660562c305aaf89d981ea92f18a3437a693de65b674b6dacfcebfbe1"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .assignments on an `any` value.","nodeType":"Identifier","baseline":{"line":987,"column":31,"endLine":987,"endColumn":42},"candidate":{"line":988,"column":31,"endLine":988,"endColumn":42},"mappedSourceSha256":"ef8dcf7162a955368a7a33b8596e363a92e03fa7a4f0820231a02124089c059c"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .attachments on an `any` value.","nodeType":"Identifier","baseline":{"line":988,"column":31,"endLine":988,"endColumn":42},"candidate":{"line":989,"column":31,"endLine":989,"endColumn":42},"mappedSourceSha256":"3930e671c9e40dee2a33442c6f1055e8e8b75958ee19da8bd470754fd44beec2"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .assessments on an `any` value.","nodeType":"Identifier","baseline":{"line":996,"column":24,"endLine":996,"endColumn":35},"candidate":{"line":997,"column":24,"endLine":997,"endColumn":35},"mappedSourceSha256":"f887c6af08daaa18b3e1b081db3571d065fd300e9fb86652aa5eaad9b960e161"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1018,"column":30,"endLine":1018,"endColumn":37},"candidate":{"line":1019,"column":30,"endLine":1019,"endColumn":37},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1054,"column":13,"endLine":1058,"endColumn":15},"candidate":{"line":1055,"column":13,"endLine":1059,"endColumn":15},"mappedSourceSha256":"56d5e79277f7dafaae2e06094509f3637f2c07cd3f094bd976359f7dea7a255d"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1067,"column":11,"endLine":1073,"endColumn":13},"candidate":{"line":1068,"column":11,"endLine":1074,"endColumn":13},"mappedSourceSha256":"7a197e54563a27c8700e879ddb3ef9b4c96601825c7c959d3d49489a4e473095"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .mapping on an `any` value.","nodeType":"Identifier","baseline":{"line":1091,"column":23,"endLine":1091,"endColumn":30},"candidate":{"line":1092,"column":23,"endLine":1092,"endColumn":30},"mappedSourceSha256":"a6375ee99716acf4635ba3c192f7578a85ad4b479d09174e7d80d01aa91443af"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1115,"column":15,"endLine":1119,"endColumn":17},"candidate":{"line":1116,"column":15,"endLine":1120,"endColumn":17},"mappedSourceSha256":"87ee6d9c72a65c75a52f74243c2e0e9fd6e8205c970c38c6d2f2d6bdb7b14d10"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1143,"column":13,"endLine":1147,"endColumn":15},"candidate":{"line":1144,"column":13,"endLine":1148,"endColumn":15},"mappedSourceSha256":"56d5e79277f7dafaae2e06094509f3637f2c07cd3f094bd976359f7dea7a255d"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .records on an `any` value.","nodeType":"Identifier","baseline":{"line":1189,"column":26,"endLine":1189,"endColumn":33},"candidate":{"line":1190,"column":26,"endLine":1190,"endColumn":33},"mappedSourceSha256":"a94e7bcfcbed3c846d491d4f47c948e53a23908d480248b3ffe9e126e83ea865"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1205,"column":26,"endLine":1205,"endColumn":33},"candidate":{"line":1206,"column":26,"endLine":1206,"endColumn":33},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1235,"column":33,"endLine":1235,"endColumn":40},"candidate":{"line":1236,"column":33,"endLine":1236,"endColumn":40},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .items on an `any` value.","nodeType":"Identifier","baseline":{"line":1260,"column":28,"endLine":1260,"endColumn":33},"candidate":{"line":1261,"column":28,"endLine":1261,"endColumn":33},"mappedSourceSha256":"5f3c4f8580d392e422e7c2f6802674ac27966c98d95c39696e4b2490168e5488"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1289,"column":28,"endLine":1289,"endColumn":35},"candidate":{"line":1290,"column":28,"endLine":1290,"endColumn":35},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1317,"column":35,"endLine":1317,"endColumn":42},"candidate":{"line":1318,"column":35,"endLine":1318,"endColumn":42},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1324,"column":35,"endLine":1324,"endColumn":42},"candidate":{"line":1325,"column":35,"endLine":1325,"endColumn":42},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1327,"column":35,"endLine":1327,"endColumn":42},"candidate":{"line":1328,"column":35,"endLine":1328,"endColumn":42},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .grades_summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1337,"column":26,"endLine":1337,"endColumn":40},"candidate":{"line":1338,"column":26,"endLine":1338,"endColumn":40},"mappedSourceSha256":"bf82b8473082efe032940e61cb77d76694159f75e87a2fdcf5f0b14316a69e73"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .behavior_summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1341,"column":26,"endLine":1341,"endColumn":42},"candidate":{"line":1342,"column":26,"endLine":1342,"endColumn":42},"mappedSourceSha256":"767f17271c3d27cf60576e41a9ed3d50dd2f636d86fdb39ebf30a9b003f33662"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .xp on an `any` value.","nodeType":"Identifier","baseline":{"line":1346,"column":26,"endLine":1346,"endColumn":28},"candidate":{"line":1347,"column":26,"endLine":1347,"endColumn":28},"mappedSourceSha256":"9a3576ca4a048b010e835e65673b0db5bcd2e08bd95881d58117d28421c5a748"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .xp on an `any` value.","nodeType":"Identifier","baseline":{"line":1353,"column":26,"endLine":1353,"endColumn":28},"candidate":{"line":1354,"column":26,"endLine":1354,"endColumn":28},"mappedSourceSha256":"9a3576ca4a048b010e835e65673b0db5bcd2e08bd95881d58117d28421c5a748"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .behavior_summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1354,"column":26,"endLine":1354,"endColumn":42},"candidate":{"line":1355,"column":26,"endLine":1355,"endColumn":42},"mappedSourceSha256":"767f17271c3d27cf60576e41a9ed3d50dd2f636d86fdb39ebf30a9b003f33662"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .stats on an `any` value.","nodeType":"Identifier","baseline":{"line":1375,"column":22,"endLine":1375,"endColumn":27},"candidate":{"line":1376,"column":22,"endLine":1376,"endColumn":27},"mappedSourceSha256":"4b5af442229cf356a6868a3b8791ffaa70e0135ef8af2eb4898bddbeb0e0b0b0"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .levels on an `any` value.","nodeType":"Identifier","baseline":{"line":1382,"column":22,"endLine":1382,"endColumn":28},"candidate":{"line":1383,"column":22,"endLine":1383,"endColumn":28},"mappedSourceSha256":"7d50f20853334a3098a0e7389adfc0a56755c7df9606af98c97ccf7aad34ebaa"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .rewardsSummary on an `any` value.","nodeType":"Identifier","baseline":{"line":1390,"column":22,"endLine":1390,"endColumn":36},"candidate":{"line":1391,"column":22,"endLine":1391,"endColumn":36},"mappedSourceSha256":"728b479905fb59a2f716e2733859de31d3828a16f64f1af22a2dde05666d1de1"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1407,"column":30,"endLine":1407,"endColumn":37},"candidate":{"line":1408,"column":30,"endLine":1408,"endColumn":37},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1422,"column":28,"endLine":1422,"endColumn":35},"candidate":{"line":1423,"column":28,"endLine":1423,"endColumn":35},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .badges on an `any` value.","nodeType":"Identifier","baseline":{"line":1423,"column":28,"endLine":1423,"endColumn":34},"candidate":{"line":1424,"column":28,"endLine":1424,"endColumn":34},"mappedSourceSha256":"83ad6512db11213227b03c4a10550c0f5e043cde61f217cc135d29d2295e2fd8"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .visibility on an `any` value.","nodeType":"Identifier","baseline":{"line":1439,"column":30,"endLine":1439,"endColumn":40},"candidate":{"line":1440,"column":30,"endLine":1440,"endColumn":40},"mappedSourceSha256":"7d2fb3da93a013ce41e4eb531e0bb78e245939e05984a6a8dea49113becc347c"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .missions on an `any` value.","nodeType":"Identifier","baseline":{"line":1443,"column":30,"endLine":1443,"endColumn":38},"candidate":{"line":1444,"column":30,"endLine":1444,"endColumn":38},"mappedSourceSha256":"04f88e0a70fd088de7db83415858e79ea9cfd6eade9a44addfc157bf5d6b1f1c"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .tasks on an `any` value.","nodeType":"Identifier","baseline":{"line":1487,"column":22,"endLine":1487,"endColumn":27},"candidate":{"line":1488,"column":22,"endLine":1488,"endColumn":27},"mappedSourceSha256":"085154084c7427596104bc42f51f59f6d3ffd3d5f49f098210c20449fb7b2c71"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1492,"column":11,"endLine":1492,"endColumn":43},"candidate":{"line":1493,"column":11,"endLine":1493,"endColumn":43},"mappedSourceSha256":"a4c780ee42c2fa83ee0dcc6cb6a286489e8adeea3e8abf49ca53249316be9b85"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .summary on an `any` value.","nodeType":"Identifier","baseline":{"line":1505,"column":25,"endLine":1505,"endColumn":32},"candidate":{"line":1506,"column":25,"endLine":1506,"endColumn":32},"mappedSourceSha256":"761b7ad8ad439b2855fcbb611331c646ef0870b0631247bba3f3025cb6df5a53"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .task on an `any` value.","nodeType":"Identifier","baseline":{"line":1513,"column":24,"endLine":1513,"endColumn":28},"candidate":{"line":1514,"column":24,"endLine":1514,"endColumn":28},"mappedSourceSha256":"0ebb429fa86d481c2630fac53db1c91cffed5d4d41d1021c179444eb67e7ee0b"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .task on an `any` value.","nodeType":"Identifier","baseline":{"line":1518,"column":24,"endLine":1518,"endColumn":28},"candidate":{"line":1519,"column":24,"endLine":1519,"endColumn":28},"mappedSourceSha256":"0ebb429fa86d481c2630fac53db1c91cffed5d4d41d1021c179444eb67e7ee0b"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1522,"column":11,"endLine":1527,"endColumn":13},"candidate":{"line":1523,"column":11,"endLine":1528,"endColumn":13},"mappedSourceSha256":"739b840bb4366ce491ff5a168e6912f5a37a4e393ccdea3fef3aacf9c830f95e"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1523,"column":13,"endLine":1523,"endColumn":39},"candidate":{"line":1524,"column":13,"endLine":1524,"endColumn":39},"mappedSourceSha256":"88c9950d6793abdd6a64a7eeae131bbcd49f6a0efb11007e29f0576cd7c55fe0"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .submissions on an `any` value.","nodeType":"Identifier","baseline":{"line":1538,"column":29,"endLine":1538,"endColumn":40},"candidate":{"line":1539,"column":29,"endLine":1539,"endColumn":40},"mappedSourceSha256":"21e945ad5e3b81adf2ac82114f7e701ca858a81c9b678ea7d23f95927b71d424"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .submission on an `any` value.","nodeType":"Identifier","baseline":{"line":1552,"column":28,"endLine":1552,"endColumn":38},"candidate":{"line":1553,"column":28,"endLine":1553,"endColumn":38},"mappedSourceSha256":"293f1d2ee206a7cbebe633764a26ea455bd39f494a774a7289f8663da31916a2"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .conversations on an `any` value.","nodeType":"Identifier","baseline":{"line":1589,"column":31,"endLine":1589,"endColumn":44},"candidate":{"line":1590,"column":31,"endLine":1590,"endColumn":44},"mappedSourceSha256":"5c0dc939187d4ae4bdb6abd314825f9f524c45c140b6e929ab93708e94b4f25f"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1593,"column":11,"endLine":1593,"endColumn":42},"candidate":{"line":1594,"column":11,"endLine":1594,"endColumn":42},"mappedSourceSha256":"01fc4ce5e895db5b30a08851751a11b880e61a71ad1482d3ac92a5f34636bb6e"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .conversation on an `any` value.","nodeType":"Identifier","baseline":{"line":1612,"column":30,"endLine":1612,"endColumn":42},"candidate":{"line":1613,"column":30,"endLine":1613,"endColumn":42},"mappedSourceSha256":"8b34dbc2c05eb4d7e25d48efeace82456b16cee760bcae80c157f52a3c2e787b"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .message on an `any` value.","nodeType":"Identifier","baseline":{"line":1639,"column":22,"endLine":1639,"endColumn":29},"candidate":{"line":1640,"column":22,"endLine":1640,"endColumn":29},"mappedSourceSha256":"ab530a13e45914982b79f9b7e3fba994cfd1f3fb22f71cea1afbf02b460c6d1d"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1656,"column":7,"endLine":1656,"endColumn":38},"candidate":{"line":1657,"column":7,"endLine":1657,"endColumn":38},"mappedSourceSha256":"2f3350e992ec0024bc6d6b6b3bd2e9978a9672adfd35a4da7974373b40534067"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .announcement on an `any` value.","nodeType":"Identifier","baseline":{"line":1716,"column":24,"endLine":1716,"endColumn":36},"candidate":{"line":1717,"column":24,"endLine":1717,"endColumn":36},"mappedSourceSha256":"86118a3b7fc92492b026562882076481e99119cc9563879b4f0076cf8d7bff31"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1718,"column":7,"endLine":1718,"endColumn":32},"candidate":{"line":1719,"column":7,"endLine":1719,"endColumn":32},"mappedSourceSha256":"ea98f96ea622376277ac9ebbf33db90d07498612a5fe759df227bb3de7fc66a3"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1731,"column":7,"endLine":1731,"endColumn":33},"candidate":{"line":1732,"column":7,"endLine":1732,"endColumn":33},"mappedSourceSha256":"c12eff961d916adfc84a797e3f3975b111c0f3cc6f9e0ff1872648a78aaf6c92"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .attachments on an `any` value.","nodeType":"Identifier","baseline":{"line":1742,"column":29,"endLine":1742,"endColumn":40},"candidate":{"line":1743,"column":29,"endLine":1743,"endColumn":40},"mappedSourceSha256":"3930e671c9e40dee2a33442c6f1055e8e8b75958ee19da8bd470754fd44beec2"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":1744,"column":9,"endLine":1744,"endColumn":35},"candidate":{"line":1745,"column":9,"endLine":1745,"endColumn":35},"mappedSourceSha256":"88c9950d6793abdd6a64a7eeae131bbcd49f6a0efb11007e29f0576cd7c55fe0"}
{"rule":"@typescript-eslint/no-unsafe-assignment","severity":2,"message":"Unsafe assignment of an `any` value.","nodeType":"Property","baseline":{"line":3589,"column":14,"endLine":3589,"endColumn":52},"candidate":{"line":3590,"column":14,"endLine":3590,"endColumn":52},"mappedSourceSha256":"4a42c908b534cb4333a0f97fde48f65ab3a7339d8ac01696f54082a6350b8fee"}
{"rule":"@typescript-eslint/no-unsafe-member-access","severity":2,"message":"Unsafe member access .accessToken on an `any` value.","nodeType":"Identifier","baseline":{"line":3589,"column":41,"endLine":3589,"endColumn":52},"candidate":{"line":3590,"column":41,"endLine":3590,"endColumn":52},"mappedSourceSha256":"94a2776e7bd6f611462bc4344e17773c65fc4c486401643b724d102a8936dff4"}
```

</details>

## Exact file inventory

25 files: 13 production TypeScript files, 7 TypeScript test/fixture files,
schema, one SQL migration, canonical manifest, error catalog and this audit.

```text
ERROR_CATALOG.md
config/deployment/migration-artifact-manifest.json
docs/sprint-academic-content-center-acc-11b-student-parent-engagement-audit.md
prisma/migrations/20261008093728_academic_content_engagement_admission/migration.sql
prisma/schema.prisma
src/infrastructure/database/school-scope.extension.ts
src/infrastructure/database/tests/school-scope.extension.spec.ts
src/modules/academics/academic-content/academic-content.module.ts
src/modules/academics/academic-content/application/academic-content-engagement.service.ts
src/modules/academics/academic-content/controller/academic-content-engagement-exception.filter.ts
src/modules/academics/academic-content/dto/academic-content-engagement.dto.ts
src/modules/academics/academic-content/infrastructure/academic-content-engagement.repository.ts
src/modules/academics/academic-content/infrastructure/academic-content-recipient-read.repository.ts
src/modules/parent-app/academic-content/application/parent-academic-content.use-cases.ts
src/modules/parent-app/academic-content/controller/parent-academic-content-engagement.controller.ts
src/modules/parent-app/parent-app.module.ts
src/modules/student-app/academic-content/application/student-academic-content.use-cases.ts
src/modules/student-app/academic-content/controller/student-academic-content-engagement.controller.ts
src/modules/student-app/student-app.module.ts
test/e2e/parent-app-final-closeout.e2e-spec.ts
test/e2e/student-app-final-closeout.e2e-spec.ts
test/fixtures/academic-content-engagement.fixture.ts
test/integration/academic-content-engagement-concurrency.integration.spec.ts
test/integration/academic-content-engagement-http.integration.spec.ts
test/integration/academic-content-engagement.integration.spec.ts
```

## Handoff

Deployment remains owner-governed: preserve migration bytes/manifest, apply the
new migration through the governed job before any application traffic and observe
existing connection/lock/timeouts and storage/event growth. There has been no
production database, object storage, cloud or traffic mutation in this task.
Review the bounded feature Draft PR and exact-head canonical CI evidence before
any separate Ready/merge/deployment decision. ACC-11C/11D/11E/12 are not started.
