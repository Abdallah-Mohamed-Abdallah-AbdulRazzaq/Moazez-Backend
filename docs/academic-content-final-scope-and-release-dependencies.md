# Academic Content final scope and release dependencies

The authoritative ACC-12 base is `ed8c48ab7acb682e9dd66bdec97b4c63dff123bd`. The independently accepted source audit found no confirmed functional defect. The Owner authorized seven composed Backend journeys, the bounded OBS-02 correction and final contract documentation in one Draft PR. This execution does not authorize a release, merge, reference activation or shared database/deployment mutation.

## Scope disposition

School Management Analytics is absent from current source and its implementation is explicitly deferred by the Owner for this execution. Its final V1 disposition still requires explicit Owner approval. Teacher-Owned Analytics is implemented and has its own distinct permission and ownership contract. Execution deferral does not decide V1 exclusion.

These six original deferred features remain outside this execution:

| Feature                                      | Current execution | Final disposition       |
| -------------------------------------------- | ----------------- | ----------------------- |
| Copy previous week                           | Deferred          | Owner decision required |
| Copy to classroom                            | Deferred          | Owner decision required |
| Custom user folders                          | Deferred          | Owner decision required |
| Ask Teacher context linking                  | Deferred          | Owner decision required |
| Advanced notification digests                | Deferred          | Owner decision required |
| Zero-downtime published revision replacement | Deferred          | Owner decision required |

ACC-12 reuses the accepted ACC-0 through ACC-11 mechanisms: immutable revisions/publications, current recipient authority, shared admission, transactional ACK, worker recovery, Teacher aggregate analytics and private storage verification. No new route, permission, schema, migration, worker, queue, consumer registration, dependency or CI configuration is authorized.

## Acceptance dependencies

| Gate                                                                                                           | Responsible party                 | Evidence/disposition                                                                            |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| School Analytics final V1 decision                                                                             | Owner                             | Pending explicit decision                                                                       |
| Engagement/ACK retention, legal hold, historical ownership, deletion/anonymization and reference-aware cleanup | Owner/security/product            | Pending; ADR-0013 D041–D045 remain unresolved; no policy implemented or approved here           |
| Small-cohort analytics privacy                                                                                 | Owner/security/product            | Pending; current fixed aggregate windows are implementation facts, not policy approval          |
| Reference-data and permission activation/bootstrap                                                             | Authorized DevOps/operator        | Backend has not performed live bootstrap; disposable test seeding is test infrastructure only   |
| Real browser-to-GCS resumable upload, CORS, complete, preview/download                                         | Authorized nonproduction DevOps   | Pending; the isolated provider contract double proves Backend composition only                  |
| Student frontend acceptance                                                                                    | Frontend/QA                       | Pending; guarded Backend HTTP evidence does not establish app acceptance                        |
| Parent frontend acceptance                                                                                     | Frontend/QA                       | Pending, including explicit ACK and child ownership                                             |
| Teacher frontend acceptance                                                                                    | Frontend/QA                       | Pending, including preparation review and own analytics                                         |
| School frontend/dashboard acceptance                                                                           | Frontend/QA/Owner                 | Pending; unsupported School analytics remains absent                                            |
| Production Redis capacity and role topology                                                                    | DevOps                            | Pending live proof; current source inventory is API 0 consumers, Core 8, Media 1, Maintenance 9 |
| Live load, signal collection, dashboards, alert thresholds and on-call readiness                               | DevOps/on-call                    | Pending; existing 27 disposable PostgreSQL SQL plans are not production load acceptance         |
| Independent Backend review                                                                                     | Independent engineering reviewer  | Required after the Draft PR and exact feature-head checks                                       |
| Post-merge exact-main CI and release/deployment authorization                                                  | Independent reviewer/Owner/DevOps | Pending; feature-head CI cannot satisfy an exact-main post-merge gate                           |
| Repository-wide lint                                                                                           | Engineering                       | UNVERIFIED; no repository-wide fixing lint command is run                                       |

Targeted Phase 3 lint fixes must remain intact. Targeted lint on ACC-12 changed TypeScript is a separate bounded gate and does not change repository-wide lint status. The accepted base has 28 governed migrations, 243 permissions, seven system roles and 874 role grants; ACC-12 introduces no catalog or migration delta.

## OBS-02 operational contract

Signals use the existing Nest Logger. The event and outcome fields form a fixed low-cardinality taxonomy:

| Event                                | Outcomes                                                               | Emission boundary                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `academic_content.engagement`        | `accepted`, `denied`, `rate_limited`, `unavailable`                    | Application authority/result classification; accepted after repository transaction resolves                                               |
| `academic_content.acknowledgement`   | `accepted`, `identical_retry`, `denied`, `rate_limited`, `unavailable` | Explicit write only; insert affected-row count distinguishes creation from conflict retry; success after commit/final eligibility recheck |
| `academic_content.teacher_analytics` | `success`, `denied`, `failed`                                          | Authorized query result or error; monotonic elapsed `durationMs` is numeric and nonnegative                                               |

Only trusted request correlation is added. No School/user/student/guardian/content identifiers, client request keys, body/text/name, private URL/file key, SQL/bindings, arbitrary exception messages, JWT/device token or signed capability is included in these signals. GET ACK produces no accepted-write signal. Sink failure cannot alter the operation's result. Existing HTTP envelopes, retry headers, authority checks and transaction ordering remain authoritative.

ACK repository `resolve` retains its existing result shape and retry equality. `resolveWithOutcome` returns a separate internal outcome envelope, populated by a per-call observer after the original resolver transaction commits; the insert affected-row count does not become an enumerable field on the legacy resolver result or a public DTO.

DevOps must verify actual log level/collection includes these structured signals, apply retention/access restrictions approved by the Owner, build aggregate outcome/latency views and obtain live alert thresholds/on-call acceptance. This document supplies the application signal contract; production monitoring and alerts have not passed. Existing unrelated logger behavior and the GlobalExceptionFilter are outside this approved amendment.

## Release boundary

Backend composed journey, contract, observability and canonical CI evidence support independent engineering review of the feature head. Outstanding Owner, frontend and DevOps gates remain visible release dependencies. None is silently waived by a passing Backend suite, a deferred implementation or the existence of a Draft PR.
