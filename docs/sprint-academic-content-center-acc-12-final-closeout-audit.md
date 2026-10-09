# ACC-12 final engineering closeout audit

Authoritative base: `ed8c48ab7acb682e9dd66bdec97b4c63dff123bd`.

This checked-in audit records completed local verification before the bounded ACC-12 commit. Its own eventual commit hash cannot be embedded in its contents. The Draft PR delivery record is the companion evidence record for the exact feature head, canonical CI run, mandatory check results and artifact identities after push. Until that record contains verified results, remote feature-head CI remains pending. Independent Backend acceptance, post-merge exact-main CI and release authorization remain pending.

## Authorized inventory

Exactly eight new files and four existing production files are in scope:

| File                                                                                                   | Purpose                                                                                                                         |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `test/fixtures/academic-content-acc12-journey.fixture.ts`                                              | Unique prerequisite identity/academic structure, actual API/Core composition, isolated Redis/storage boundary and owned cleanup |
| `test/integration/academic-content-acc12-authoring-review.integration.spec.ts`                         | J1–J2                                                                                                                           |
| `test/integration/academic-content-acc12-recipient-journeys.integration.spec.ts`                       | J3–J5                                                                                                                           |
| `test/integration/academic-content-acc12-resource-journeys.integration.spec.ts`                        | J6–J7                                                                                                                           |
| `test/integration/academic-content-acc12-observability.integration.spec.ts`                            | OBS-02 durable retry/outcomes/latency/redaction/unchanged HTTP                                                                  |
| `docs/academic-content-api-contract-freeze-v1.md`                                                      | 135-route source-derived freeze and request DTO inventory                                                                       |
| `docs/sprint-academic-content-center-acc-12-final-closeout-audit.md`                                   | This evidence/status record                                                                                                     |
| `docs/academic-content-final-scope-and-release-dependencies.md`                                        | Owner/frontend/DevOps dependencies and signal contract                                                                          |
| `src/modules/academics/academic-content/application/academic-content-engagement.service.ts`            | Fixed application outcome signals                                                                                               |
| `src/modules/academics/academic-content/application/academic-content-acknowledgement.service.ts`       | Fixed explicit-write/new-versus-retry signals                                                                                   |
| `src/modules/academics/academic-content/infrastructure/academic-content-acknowledgement.repository.ts` | Internal insert affected-row indicator; SQL/predicates/transaction preserved                                                    |
| `src/modules/teacher-app/academic-content/application/teacher-academic-content-analytics.use-case.ts`  | Fixed query classification and monotonic elapsed duration                                                                       |

## Journey assertions

| Journey | Composition/assertion                                                                                                                                                | Verification status |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| J1      | School guarded create/configure/readiness/schedule, actual publication queue completion, immutable Revision/Publication/audience                                     | Local PASS          |
| J2      | Teacher submit, School request changes, Teacher edit/resubmit, School approve, two immutable rounds and both registered-consumer decision notifications/owned inbox  | Local PASS          |
| J3      | Same Teacher Weekly Plan consumed through Student and Parent guarded HTTP, explicit exact-publication Engagement, own analytics counts, GET no writes                | Local PASS          |
| J4      | Required Guardian Note publication/notification, current owned child PENDING, explicit ACK/identical retry, governed successor PENDING with historical ACK preserved | Local PASS          |
| J5      | Valid session/reminder configuration, actual delayed job consumption after eligibility, exact join click, no AttendanceEntry or AttendanceSession mutation           | Local PASS          |
| J6      | Guarded upload/complete, named isolated provider contract double, actual metadata/MIME/size/signature verification, File/Asset/RevisionAsset, 307 capability/events  | Local PASS          |
| J7      | External-link author/publication, immutable recipient RevisionLink/exact click and unchanged original attribution after governed authoring replacement               | Local PASS          |

The fixture never seeds Revision, Publication, audience, Approval, Notification, File, Asset, Engagement or ACK facts. HTTP exercises the actual AppModule's JWT/session/scope/permission guards. CoreWorkerConsumersModule initializes its existing registrations separately; API consumer inventory remains zero. Worker proof requires BullMQ completed state and persisted facts, with bounded polling; processor invocation/captured callback/manual final rows are not used. Redis cleanup verifies the unique owner label; PostgreSQL deletions are constrained to fixture schools.

The four new suites passed all eight cases (seven journeys and OBS-02) with no skipped tests. J1 verifies publication processing occurred at or after the persisted scheduled time. J2 verifies both decision jobs and Teacher-owned inbox entries. J4 verifies the registered notification consumer and durable explicit ACK facts. J5 verifies the real delayed reminder is initially delayed, creates no premature notification, and completes at or after its eligibility time; both Attendance tables remain unchanged. J6 uses the explicitly named isolated object-storage provider contract double while retaining the actual upload verifier and persistence pipeline; live browser-to-GCS proof remains external.

## Reused accepted evidence

The independent source-first audit accepted the existing current-recipient authority, multi-connection admission/ACK/concurrency suites, immutable publication/revision and worker recovery suites, Teacher Analytics privacy/UTC tests, private file capability checks and 27 disposable PostgreSQL query plans. These mechanisms remain intact and require impacted regression plus canonical CI on this feature head. Prior base evidence is context, not a feature-head pass.

The accepted base run `37961897853` had 35 successful checks, 982 active executed files, 10 historical manual files, 26 shards and passing cleanup. Its canonical plan artifact was `11632390436` (SHA256 `e676f5545e2b8291cc87a9998afcd6529573369c7a69cf66181271e9f9fe2b81`); required summary artifact was `11631778522` (SHA256 `61c31191d8c7910898130c0e25859af439ee4e45cea4910b236cb5fb2f1b6fe2`). These historical identities must not be substituted for feature-head artifacts.

Migration baseline is 28, latest `20261008093728_academic_content_engagement_admission`; schema, migration SQL/manifest and IAM catalogs are outside the changed scope. Source runtime topology remains Core 8, Media 1, Maintenance 9, API 0.

## API and OBS-02 status

The freeze covers 96 ACC routes, 30 app notification routes, seven Core Communication notification routes and two generic file routes. Controller method/path declarations were reconciled through TypeScript AST; response types without explicit DTO are labelled source-inferred, and source links are repository-relative. Request validation, actor/grant, ownership, cache, paging, idempotency/version and capability behavior are documented. Frontend acceptance remains pending.

OBS-02 uses existing Nest Logger with fixed Engagement/ACK/Teacher Analytics taxonomy. ACK creation versus retry uses the affected-row count from the unchanged INSERT ON CONFLICT DO NOTHING, emitted only after the repository transaction resolves. The passing HTTP integration case verifies accepted/denied/rate-limited/unavailable Engagement and ACK outcomes, actual quota exhaustion, preserved 429 Retry-After 60 and sanitized 503 responses, new-versus-identical ACK retry truth, success/denied/failed analytics outcomes with numeric nonnegative durationMs, redaction of the new structured signals, read-only ACK GET and sink failure isolation. Existing unexpected analytics query failures retain their sanitized HTTP 500 internal_error contract. Existing generic error-filter logging is outside this bounded instrumentation amendment; the new signals do not carry errors, business identifiers, request bodies, signed URLs or arbitrary labels. Live collection/dashboard/alerts remain pending DevOps evidence.

## Gate status and independent review boundary

Local verification completed against the final source and test changes:

| Gate                                                 | Result and boundary                                                                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Changed TypeScript                                   | PASS: all nine changed TypeScript roots and their transitive production dependencies, zero diagnostics; this is not a claim of repository-wide test typecheck                 |
| Nest build                                           | PASS                                                                                                                                                                          |
| Targeted ESLint                                      | PASS: all nine changed TypeScript files, zero errors and zero warnings, no new suppressions                                                                                   |
| Targeted Prettier                                    | PASS: all 12 authorized files                                                                                                                                                 |
| New composed journeys / OBS-02                       | PASS: four suites, eight tests, zero skipped                                                                                                                                  |
| Impacted integration and security                    | PASS: 15 suites, 416 tests, zero skipped; includes separate-connection ACK/Engagement/Analytics concurrency and guarded tenancy/private-file boundary coverage                |
| Disposable PostgreSQL replay                         | PASS: all 28 migrations and canonical seed in fresh locally owned databases for both runs                                                                                     |
| Fixture/infrastructure cleanup                       | PASS for both runs; unique owner-checked Redis and scoped PostgreSQL cleanup                                                                                                  |
| Inventory and unchanged contracts                    | PASS: exactly eight new and four modified files; every original ACK SQL template is byte-identical; schema/migrations/IAM catalogs/runtime/CI governance remain unchanged     |
| Diff whitespace                                      | PASS: git diff --check                                                                                                                                                        |
| Canonical discovery                                  | PASS: 996 total, 986 active and 10 historical manual files; all four new specs assigned to existing integration-general pull-request profile                                  |
| Exact feature-head canonical execution and artifacts | Pending at this pre-commit record; exact identity, parity, every mandatory check and downloaded artifact digest verification must be recorded in the Draft PR delivery record |

Local results were collected with the existing canonical Jest configuration and fresh disposable PostgreSQL/Redis. The existing canonical shard launcher's direct npm.cmd spawn is incompatible with this Windows host (spawn EINVAL); a separate local disposable launcher executed the actual migration, seed and Jest commands without changing repository CI. Local runs do not substitute for Linux canonical CI, full discovery/execution parity, scale suites or artifact verification on the pushed feature head. Repository-wide lint remains UNVERIFIED.

School Analytics implementation is deferred for this execution and its final V1 disposition remains an explicit Owner decision. The six original deferred features and retention/legal hold/historical ownership/deletion/cleanup/small-cohort decisions remain unresolved as detailed in the dependency register. Reference activation, real nonproduction browser-to-GCS proof, all four frontends and production capacity/load/monitoring/on-call acceptance remain external gates.

After local gates, exact feature-head canonical checks/artifacts and Draft PR delivery, stop for independent Backend review. Do not mark ready, merge, run live bootstrap or deploy. Post-merge exact-main CI remains pending until an independently authorized merge actually occurs.
