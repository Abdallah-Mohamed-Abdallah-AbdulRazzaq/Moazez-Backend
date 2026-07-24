# Learning Content Discovery and Media 1G — Full Security, Storage, Performance, and Operational Closeout

## Pre-remediation audit decision

```text
LEARNING_CONTENT_MEDIA_PROGRAM = BLOCKED

BLOCKERS =
LCM-1G-F001,
LCM-1G-F002,
LCM-1G-F003,
LCM-1G-F004,
LCM-1G-F005,
LCM-1G-F008

PHASE_1F_TRIGGERED = FALSE
```

This block preserves the original audit decision before the test-only route
inventory remediation recorded in Section 21. At that point no production,
test, schema, migration, dependency, permission, role, seed, Docker, Compose,
CI, environment, or observability implementation had been changed, and the only
repository change was this document.

The program cannot be declared complete. The canonical regression is red,
there is no represented production-equivalent proxy/TLS/mobile-network path,
the required media observability surface does not exist, the single health
endpoint conflates liveness and readiness, a production startup failure exposes
a raw Prisma error and database endpoint, and the checked-in Compose
infrastructure is not fully immutable.

## 1. Baseline and branch

| Evidence                       | Result                                          |
| ------------------------------ | ----------------------------------------------- |
| Branch                         | `chore/learning-content-media-1g-full-closeout` |
| HEAD                           | `ac99609fa60c8f8a79615bfd4f4e4f7301d5f149`      |
| `origin/main`                  | `ac99609fa60c8f8a79615bfd4f4e4f7301d5f149`      |
| Base branch                    | `main`                                          |
| Initial tracked changes        | 0                                               |
| Initial staged paths           | 0                                               |
| Initial untracked paths        | 0                                               |
| Commits, pushes, pull requests | 0 / 0 / 0                                       |

The gate was checked before starting services or creating temporary material.
No branch operation, pull, merge, rebase, reset, or checkout was performed.

## 2. Authoritative source register

The current tracked versions of the following were read before forming the
conclusions:

- `AGENTS.md`, `CLAUDE.md`, `PROJECT_OVERVIEW.md`,
  `ARCHITECTURE_DECISION.md`, `SECURITY_MODEL.md`, `DOMAIN_GLOSSARY.md`,
  `DIRECTORY_STRUCTURE_VISUAL.md`, `ENGINEERING_RULES.md`,
  `TESTING_STRATEGY.md`, `OBSERVABILITY.md`, `API_CONTRACT_RULES.md`,
  `PRISMA_CONVENTIONS.md`, `MIGRATION_GOVERNANCE.md`, `ERROR_CATALOG.md`,
  `MODULES.md`, `USER_TYPES.md`, and `V1_SCOPE.md`;
- all tracked `adr/ADR-*.md` files in numeric order;
- `Dockerfile`, `docker-compose.yml`, `package.json`, and `package-lock.json`;
- `.github/workflows/migration-integrity.yml`,
  `.github/workflows/learning-content-integrity.yml`, and
  `.github/workflows/learning-media-integrity.yml`;
- `docs/sprint-learning-content-discovery-media-0a-contract-lock.md`;
- the merged 0B, 1A, 1B, 1B-H1, 1C, 1D, and 1E closeouts, plus the 1C-P
  evidence embedded in the runtime/upload closeout;
- `docs/database/migration-custom-sql-inventory.md` and the migration
  rebaseline closeout, decision, and post-rebaseline register.

`DIRECTORY_STRUCTURE.md` is not present; `DIRECTORY_STRUCTURE_VISUAL.md` is the
current repository equivalent. Runtime code, committed migrations, tests, and
CI were treated as authoritative where prose differed.

## 3. Environment inventory

### Host and tools

| Item                                     | Observed value                                            |
| ---------------------------------------- | --------------------------------------------------------- |
| OS                                       | Windows 11 Home Single Language, build 10.0.26200, 64-bit |
| CPU                                      | AMD Ryzen 7 7435HS, 16 logical processors                 |
| Memory                                   | 7.82 GiB                                                  |
| Host Node.js                             | v22.21.1                                                  |
| Host npm                                 | 11.14.1                                                   |
| Docker Engine                            | 29.6.2, Linux/amd64 engine                                |
| Docker Compose                           | 5.3.1                                                     |
| Application mode used for runtime checks | committed production Docker image                         |

### Infrastructure

The original infrastructure state was three stopped containers:
`moazez-postgres`, `moazez-redis`, and `moazez-minio`. Their existing volumes
and `backend_default` network were preserved. `npm run infra:up` started only
those existing services, and the audit stopped them again on completion.

| Service                | Declared image                             | Executed version                                                                     |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| PostgreSQL             | `postgres:16-alpine`                       | PostgreSQL 16.13                                                                     |
| Redis                  | `redis:7-alpine`                           | Redis 7.4.8                                                                          |
| MinIO                  | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | `RELEASE.2025-09-07T16-13-09Z` in the existing image and exact disposable rehearsals |
| Runtime base           | digest-pinned `node:20.19.4-bookworm-slim` | Node 20.19.4                                                                         |
| ffmpeg/ffprobe package | `7:5.1.9-0+deb12u1`                        | ffprobe 5.1.9-0+deb12u1                                                              |

The configured development storage endpoint is direct MinIO on port 9000.
There is no tracked reverse proxy, TLS termination, production hostname,
Kubernetes/Helm/Terraform deployment, or other target-runtime manifest. No
supported target mobile-network environment was available. Production
application CORS is disabled; MinIO browser CORS is separately configured by
the Learning Media CI workflow for its exact test origin.

### Production-equivalence verdict

```text
BLOCKED — PRODUCTION_EQUIVALENT_ENVIRONMENT_UNAVAILABLE
```

The production Docker image, PostgreSQL, Redis, and exact MinIO binary path
were executable. The intended deployed application-to-storage path, proxy,
TLS boundary, public hostname, browser path, and target mobile network are not
represented. Docker Desktop loopback results below are local-only and are not
deployment certification.

## 4. Section 20 executable traceability matrix

Command identifiers:

- `U`: focused 19 valid unit suites, 225/225 tests (the containing invocation
  also named two nonexistent controller paths and is not counted as a wholly
  green command);
- `H`: focused HTTP/security, 12/12 suites and 97/97 tests;
- `I`: focused PostgreSQL/Redis/MinIO integration evidence;
- `C1`/`C2`/`C3`: six-suite critical concurrency group, 161/161 each;
- `MV`: canonical Docker media verifier, 18/18;
- `MS`: exact-release MinIO storage/CORS suite, 4/4;
- `R`: canonical `npm run test:regression`;
- `M`: fresh and populated migration rehearsals.

Every Section 20 bullet is mapped. Thirty-eight of 39 rows have passing
executable evidence. The final canonical-regression row fails and blocks
closeout.

| ID  | Requirement                                                      | Authoritative implementation                   | Existing executable test                                                                                              | Command/result                                                             |
| --- | ---------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| S1  | Allocation/visible-plan/no-plan/co-teaching branches             | `src/modules/student-app/subjects/`            | `src/modules/student-app/subjects/tests/student-subject-lessons*.spec.ts`; `test/e2e/student-app-lessons.e2e-spec.ts` | `U`, `H`: PASS                                                             |
| S2  | Subject/School/class/term/year/Curriculum/plan visibility states | same module/read adapter                       | `test/e2e/student-app-lessons.e2e-spec.ts`; `test/security/tenancy.student-subject-lessons.spec.ts`                   | `H`: PASS                                                                  |
| S3  | Historical allocation transfer/deletion                          | Student subject read adapter                   | `test/e2e/student-app-lessons.e2e-spec.ts`                                                                            | `H`: PASS                                                                  |
| S4  | Date/status/limit validation                                     | Student subject use case/controller            | Student subject unit and Student lessons E2E                                                                          | `U`, `H`: PASS                                                             |
| S5  | Null-period ordering/cursors/denylist                            | Student subject use case/presenter             | four Student subject unit suites; Student lessons E2E                                                                 | `U`, `H`: PASS                                                             |
| G1  | Management actor allow matrix                                    | Files generic download controller/use case     | `test/security/tenancy.files-generic-download-boundary.spec.ts`                                                       | `H`: PASS                                                                  |
| G2  | App/platform/org-only denial before lookup                       | Files guards/controller                        | same security suite                                                                                                   | `H`: PASS                                                                  |
| G3  | Unrelated/cross-School/deleted File hiding                       | Files download use case                        | same security suite                                                                                                   | `H`: PASS                                                                  |
| G4  | Relation-scoped attachment compatibility                         | app-facing attachment use cases                | canonical unit and security suites                                                                                    | `R` unit/security: PASS                                                    |
| G5  | Multipart 10 MiB boundary/413/no use-case call                   | upload filter/interceptor/controller           | `files-upload-multer-exception.filter.spec.ts`, `uploads.controller.spec.ts`, security E2E                            | `U`, canonical security: PASS                                              |
| G6  | Permission metadata/no seed mutation                             | controller metadata/security inventories       | generic and Academics security suites                                                                                 | `H`, canonical security: PASS                                              |
| P1  | DRAFT/PUBLISHED/ARCHIVED Student/Parent/Teacher visibility       | curriculum publication plus three app adapters | publication adapter integration and app E2E/security                                                                  | `I`, `H`: PASS                                                             |
| P2  | Publication backfill/default/CHECK                               | migrations 6 and publication constraint        | `lesson-content-publication-constraint.integration.spec.ts`; populated upgrade                                        | `I`, `M`: PASS                                                             |
| P3  | DRAFT mutation rules                                             | Lesson Content use cases/repository            | publication unit/E2E                                                                                                  | `U`, `H`: PASS                                                             |
| P4  | PUBLISHED conflicts/no mutation                                  | same                                           | publication unit/atomicity/E2E                                                                                        | `U`, `I`, `C1-C3`: PASS                                                    |
| P5  | ARCHIVED terminal immutability                                   | same                                           | publication unit/constraint/E2E                                                                                       | `U`, `I`, `H`: PASS                                                        |
| P6  | Update/delete versus publish                                     | conditional repository writes                  | `lesson-content-publication-atomicity.integration.spec.ts`                                                            | `C1-C3`: PASS                                                              |
| P7  | Transition and race audits/no body/title leak                    | publication UoW/audit                          | publication unit, atomicity, Academics E2E                                                                            | `U`, `C1-C3`, `H`: PASS                                                    |
| P8  | Structural mutability versus publication visibility              | Curriculum repository/app read adapters        | Curriculum unit, publication read-adapter integration, E2E                                                            | `U`, `I`, `H`: PASS                                                        |
| U1  | Server-owned storage identity/DTO whitelist/direct PUT           | upload session use cases, DTOs, MinIO adapter  | learning-media upload/storage/E2E/security                                                                            | `I`, `MS`, `H`: PASS                                                       |
| U2  | Filename normalization and stored name                           | classifier/use case/migration normalizer       | upload integration and migration parity cases                                                                         | `I`: PASS                                                                  |
| U3  | `clientRequestId` idempotency/convergence/conflict               | upload session repository/use case             | upload integration                                                                                                    | `I`, `C1-C3`: PASS                                                         |
| U4  | PUT/session TTL and renewal                                      | storage adapter/upload use case                | upload/storage integrations                                                                                           | `I`, `MS`: PASS                                                            |
| U5  | MIME/container/codec/size/duration/dimension boundaries          | production verifier                            | `learning-media-verification.integration.spec.ts`                                                                     | `MV`: 18/18 PASS                                                           |
| U6  | Complete/cancel/expiry races, one File/audit                     | upload UoW                                     | upload integration                                                                                                    | `I`, `C1-C3`: PASS                                                         |
| U7  | LEGACY backfill and verification transitions                     | migration 7/upload use cases                   | populated upgrade and upload integration                                                                              | `M`, `I`: PASS                                                             |
| U8  | READY attachment/retention/claim/PURGED                          | attachment guard/cleanup repository            | upload and cleanup integrations                                                                                       | `I`, `C1-C3`: PASS                                                         |
| U9  | FAILED/CANCELLED/EXPIRED evidence/retry/LEGACY exclusion         | cleanup service/worker                         | cleanup integration                                                                                                   | `I`, `C1-C3`: PASS                                                         |
| U10 | Seven-day orphan policy/no Buffer/no coordinate leak             | cleanup/upload/verifier/audit contracts        | cleanup/upload/unit/security; audit query                                                                             | `I`, `U`, `H`; sensitive audit matches 0: PASS                             |
| B1  | Student exact READY ownership and all denials                    | Student playback adapter/coordinator           | Student playback integration, E2E, security                                                                           | `I`, `H`, `C1-C3`: PASS                                                    |
| B2  | Inline/verified MIME/300 s/renewal/no persistence/denylist       | signer/coordinator/presenter                   | signed URL unit plus playback integrations                                                                            | `U`, `I`: PASS                                                             |
| B3  | Real MinIO Range 206/header/type/bytes                           | MinIO adapter                                  | `learning-media-playback-range.integration.spec.ts`                                                                   | `I`; local 100/100 probe: PASS                                             |
| B4  | Playback versus publication/File mutation                        | three app adapters and publication/File writes | Student/Parent/Teacher playback integrations                                                                          | `C1-C3`: PASS                                                              |
| A1  | Parent linked-current-child relation                             | Parent playback adapter                        | Parent playback integration, Parent E2E/security                                                                      | `I`, `H`, `C1-C3`: PASS                                                    |
| A2  | Teacher exact allocation/plan ownership and DRAFT preview        | Teacher playback adapter                       | Teacher playback integration, Teacher E2E/security                                                                    | `I`, `H`, `C1-C3`: PASS                                                    |
| R1  | Affected unit suites                                             | all named application modules                  | focused unit paths plus canonical unit set                                                                            | canonical: 516/516 suites, 3682/3682 tests PASS                            |
| R2  | E2E/presenter/School A/B                                         | named E2E/security suites                      | focused 12-suite group; canonical security/E2E                                                                        | focused 97/97, security 1154/1154, and canonical E2E 543/543 PASS          |
| R3  | PostgreSQL/MinIO/Redis execution                                 | migrations, adapter, cleanup worker            | migration rehearsals and focused integrations                                                                         | `M`, `I`, `MV`, `MS`, `C1-C3`: PASS                                        |
| R4  | Full canonical regression                                        | `package.json` `test:regression`               | repository canonical processes                                                                                        | `R`: PASS after test-inventory remediation; finding `LCM-1G-F001` RESOLVED |

## 5. Command and result ledger

The following validation commands were executed. Diagnostic inventory commands
(`git`, `rg`, `Get-Content`, Docker inspect/version/state, and nonsecret
environment inspection) are summarized in Sections 1–3.

| Command                                                     | Result                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `npm run infra:up`                                          | Existing PostgreSQL/Redis/MinIO containers started                                                                              |
| `npm run test:migration-governance`                         | 39/39 PASS                                                                                                                      |
| `npm run db:migrations:check`                               | PASS; active 7, new 0                                                                                                           |
| `npx prisma validate`                                       | PASS                                                                                                                            |
| `npx prisma generate`                                       | PASS; no tracked change                                                                                                         |
| `npm run db:migrations:status`                              | PASS; 7 migrations, current                                                                                                     |
| `npm run build`                                             | PASS                                                                                                                            |
| `npm run test:regression`                                   | Original audit: FAIL only in three final route inventories; post-remediation: PASS, exact totals below                          |
| focused 21-path unit command                                | 19 real suites and 225 tests PASS; two nonexistent controller paths made the command invalid, so it is not represented as green |
| focused 11-suite integration command on Windows             | 9 suites healthy; verifier and CORS exposed missing host runtime/environment inputs                                             |
| verifier suite in `media-test` Docker target                | 18/18 PASS                                                                                                                      |
| storage/CORS suite against exact disposable MinIO           | 4/4 PASS                                                                                                                        |
| six critical integration suites, three independent commands | 161/161 PASS on each run                                                                                                        |
| focused E2E/security 12-suite command                       | 97/97 PASS                                                                                                                      |
| publication/upload/cleanup/Range four-suite command         | 56/56 PASS                                                                                                                      |
| `test/app.e2e-spec.ts` after canonical short-circuit        | 1/1 PASS                                                                                                                        |
| fresh seven-migration deploy, seed, status, second deploy   | PASS / PASS / current / no-op                                                                                                   |
| populated five-to-six-to-seven upgrade                      | PASS; assertions in Section 7                                                                                                   |
| production and `media-test` Docker builds                   | PASS                                                                                                                            |
| runtime contract verifier                                   | PASS                                                                                                                            |
| non-root/Prisma/ffprobe checks                              | UID 1000 / PASS / exact version PASS                                                                                            |
| correct runtime startup/health/graceful stop                | startup PASS; health degraded HTTP 200; graceful stop PASS                                                                      |
| wrong ffprobe with valid dependency network                 | exited nonzero; fail-closed PASS                                                                                                |
| local Docker performance harness                            | completed; aggregates in Section 11                                                                                             |
| `git diff --check` throughout                               | PASS                                                                                                                            |

Two orchestration attempts did not produce product evidence: the first
populated-upgrade command accidentally resolved the repository migration
directory through `prisma.config.ts`, and an initial raw fixture insert needed
explicit UUID casts. The disposable database/directory was removed and the
corrected rehearsal then passed. An attempted combined media test on the host
correctly failed for absent `/usr/bin/ffmpeg` and absent CORS input; it was
rerun in the intended Docker/MinIO split. No finding is based on those
command-construction or host-runtime errors.

## 6. Canonical regression

### Original pre-remediation run

The repository-defined command preserved its three separate Jest processes:

| Process                     |                                       Suites |     Tests | Result             |
| --------------------------- | -------------------------------------------: | --------: | ------------------ |
| Unit                        |                                      516/516 | 3682/3682 | PASS               |
| Security                    |                                        89/89 | 1154/1154 | PASS               |
| E2E directory               |                                      100/103 |   540/543 | FAIL               |
| Root `test/app.e2e-spec.ts` | canonical short-circuited; independently 1/1 |       1/1 | PASS independently |

The three E2E failures are deterministic stale route inventories:

- `test/e2e/student-app-final-closeout.e2e-spec.ts:763` omits the merged
  Student playback route;
- `test/e2e/parent-app-final-closeout.e2e-spec.ts:851` expects 72 routes but
  runtime registers 73 after Parent playback;
- `test/e2e/teacher-app-final-closeout.e2e-spec.ts:636` expects 111 routes but
  runtime registers 112 after Teacher playback.

No implementation was changed during that audit run. The original canonical
command exited 1 and established `LCM-1G-F001`.

### Post-remediation canonical run

After correcting only the three exact route inventories, the unchanged
repository-defined command `npm run test:regression` completed successfully:

| Process                     |  Suites |     Tests | Result |
| --------------------------- | ------: | --------: | ------ |
| Unit                        | 516/516 | 3682/3682 | PASS   |
| Security                    |   89/89 | 1154/1154 | PASS   |
| E2E directory               | 103/103 |   543/543 | PASS   |
| Root `test/app.e2e-spec.ts` |     1/1 |       1/1 | PASS   |

The full command exited 0 after 1700.8 seconds. No retry, force-exit,
quarantine, reduced selection, or heap override was used.

## 7. Migration and database rehearsal

### Inventory and checksums

Seven active migrations were observed:

1. `20260710135222_baseline_v1`
2. `20260711162248_dashboard_todos`
3. `20260716120000_school_branding_logo_asset`
4. `20260718115332_teacher_directory_data_foundation`
5. `20260720182221_membership_suspended_open_state`
6. `20260721224852_lesson_content_publication_lifecycle`
7. `20260722160000_learning_media_runtime_upload_foundation`

Governance reported active 7, new 0, rebaseline mode off. The migration files'
SHA-256 values were captured before rehearsal and the worktree remained
unchanged afterward. No drift, failed migration, reset request, or P3009 was
observed.

### Fresh PostgreSQL 16

A uniquely named disposable database on PostgreSQL 16.13 applied all seven
migrations. The canonical seed created 236 permissions, seven system roles,
the platform administrator, the demo organization/School administrator, and
the demo academics baseline. Status was current; the database contained seven
successful migration records; a second deploy reported no pending migrations.
The database was dropped.

### Populated five-to-six-to-seven upgrade

A second disposable PostgreSQL 16 database applied only the first five
migrations. A pre-publication fixture contained one live and one deleted
LessonContentItem pointing at one real File.

- migration 6 backfilled the live item to PUBLISHED with original
  `created_at`/creator: 1/1;
- migration 6 backfilled the deleted item to ARCHIVED with original
  `deleted_at` and no invented archive actor: 1/1;
- pre-media classification returned
  `{"referencedFiles":1,"valid":true}`;
- migration 7 created one LEGACY FileUploadSession preserving the File
  bucket/key and both LessonContentItem relations: 1 session / 2 relations;
- status was current and the second deploy was a no-op.

The direct publication constraint, upload lifecycle matrix, and filename
normalizer parity execute in the focused PostgreSQL integration suites. The
four-suite invariant group passed 56/56. Both disposable databases and the
temporary fixture script/directory were removed.

## 8. Storage and CORS rehearsal

The exact MinIO `RELEASE.2025-09-07T16-13-09Z` image and the real adapter were
used. Evidence:

- configured-origin OPTIONS preflight permits PUT and `content-type`;
- an unconfigured origin does not receive wildcard access;
- private-bucket resolution, presigned PUT, stat, streamed read, and delete:
  PASS;
- complete MIME matrix and spoof/near-neighbor container rejection in the
  canonical ffprobe runtime: 18/18 PASS;
- direct storage/CORS suite: 4/4 PASS;
- upload, cleanup, and Range database-backed group: PASS;
- local signed GET used inline disposition and authoritative `video/mp4`;
- 100/100 signed Range requests returned 206, exact
  `Content-Range`, `Accept-Ranges: bytes`, and the exact 1,024-byte slice;
- a one-second capability was denied after expiry and a newly signed
  capability succeeded;
- audit JSON sensitive-pattern query for URL, `X-Amz`, object key, bucket,
  checksum, credential, or token returned 0.

Upload use-case and integration evidence also proves a staging key distinct
from the final key, streamed local verification, immutable final bytes after
PUT replay, 3,600-second PUT capability, fixed session expiry, one File/audit,
and no media Buffer through Nest.

This is valid local and Docker evidence. It is not a browser-through-production
proxy/TLS proof because no such path is represented.

## 9. Authorization and no-leak audit

The complete canonical security run passed 89/89 suites and 1154/1154 tests.
The directly affected mixed E2E/security command passed 12/12 suites and 97/97
tests. It covers:

- School management, selected-School Organization management, and scoped
  custom management;
- Teacher, Student, Parent, Applicant, and Platform actor boundaries;
- missing/inactive membership, inactive actor state, stale allocation or
  ownership, cross-School, cross-Organization, and guessed IDs;
- management-only generic Files versus relation-scoped app download/playback;
- exact Parent child ownership;
- exact Teacher current plan/allocation ownership and owner-only DRAFT preview;
- Student/Parent DRAFT denial and all-actor ARCHIVED playback denial;
- safe 404 collapse for hidden resources, safe 403 actor/permission failures,
  absent details, attempted-ID denylists, and response field denylists.

Runtime application logs are not structured JSON. The ordinary correct-runtime
sample did not contain credentials, signed URLs, storage coordinates, tenant
identifiers, or test File IDs. A deliberately broken startup did, however,
emit the raw Prisma initialization exception and database endpoint. That is
finding `LCM-1G-F005`.

## 10. Concurrency, cleanup, and recovery

The critical group was executed three times without Jest retries:

| Run | Suites |   Tests | Result |
| --- | -----: | ------: | ------ |
| 1   |    6/6 | 161/161 | PASS   |
| 2   |    6/6 | 161/161 | PASS   |
| 3   |    6/6 | 161/161 | PASS   |

The group includes publication atomicity, upload lifecycle, per-candidate
cleanup, and Student/Parent/Teacher playback. PostgreSQL tests use actual
blocking relationships and dedicated observer connections rather than sleeps
as the synchronization contract.

Passing evidence covers:

- no deadlock, transaction timeout, or connection-pool observer starvation;
- mutation-first denial and playback-first writer blocking while signing;
- attach-versus-cleanup-claim serialization;
- complete-versus-cancel/expiry serialization;
- idempotent create/complete with one session/File/success audit;
- publication races ending only in valid states;
- CANCELLED, EXPIRED, new-upload FAILED, zero-reference READY, retained
  referenced READY, archived reference, LEGACY, and failed LEGACY behavior;
- object-delete retry, visible failed claim, stale-claim recovery,
  phase-specific cleanup jobs, confirmed-absence semantics, and PURGED only
  after deletion/absence.

No Phase 1G fixture row, AuditLog, Redis key/job, MinIO bucket/object,
temporary media file, or test process remained.

## 11. Performance methodology and aggregates

The temporary harness used built-in Node.js `fetch`, `node:perf_hooks`, the
existing MinIO dependency, the production Docker image, the exact MinIO
release, and a generated 2,418-byte H.264 MP4. It performed 20 warm-ups before
each 100-request measured set. Raw samples and the fixture were removed.

These values are Docker Desktop loopback only:

| Path                    | Concurrency | Success |      p50 |      p95 |      p99 |      max |
| ----------------------- | ----------: | ------: | -------: | -------: | -------: | -------: |
| `/api/v1/health`        |           1 | 100/100 |  4.54 ms |  6.13 ms |  8.18 ms |  8.32 ms |
| `/api/v1/health`        |          10 | 100/100 | 20.40 ms | 35.74 ms | 37.28 ms | 75.24 ms |
| MinIO signer generation |           1 | 100/100 |  0.06 ms |  0.08 ms |  0.09 ms |  0.13 ms |
| signed Range TTFB       |           1 | 100/100 |  2.30 ms |  4.15 ms |  4.49 ms |  5.10 ms |
| direct PUT, 2,418 bytes |           1 | 100/100 |  8.54 ms | 12.87 ms | 15.42 ms | 18.85 ms |

The health API sample is below the V1 p95 500 ms/p99 2,000 ms budgets. Direct
PUT is network/data-path dominated and is not evaluated against that API
budget.

The Range result is **signed Range time-to-first-byte**, not time-to-first-frame.
There was no target mobile network, client decode boundary, proxy, or TLS
termination. Student, Parent, and Teacher successful capability issuance and
the upload intent/complete full flow remain functionally proven but were not
certified with 100-request deployment-equivalent latency samples. That
measurement gap is part of `LCM-1G-F002`.

## 12. Observability reality audit

| Required capability                                      | Runtime evidence                                           | Verdict |
| -------------------------------------------------------- | ---------------------------------------------------------- | ------- |
| Request correlation                                      | request context, `x-request-id`, error `traceId`           | PRESENT |
| Sensitive error shaping                                  | global exception filter and denylist tests                 | PRESENT |
| Structured JSON application logs                         | Nest default colored text logs                             | ABSENT  |
| Protected `/api/v1/metrics`                              | no route                                                   | ABSENT  |
| Metrics dependency                                       | no `prom-client`, Pino, OpenTelemetry, or Terminus package | ABSENT  |
| HTTP/auth/DB/queue/storage metrics in `OBSERVABILITY.md` | no implementation                                          | ABSENT  |
| upload intent/replay/renewal/completion/expiry counters  | no implementation                                          | ABSENT  |
| verification failures by stable reason                   | stable error reasons exist; counter absent                 | ABSENT  |
| cleanup claim/retry/PURGED counters                      | no implementation                                          | ABSENT  |
| playback request/denial and Range failure counters       | no implementation                                          | ABSENT  |
| verification and signer latency histograms               | no implementation                                          | ABSENT  |
| sessions-by-state and cleanup-backlog gauges             | no implementation                                          | ABSENT  |
| low-cardinality metric label enforcement                 | no metric layer                                            | ABSENT  |

Static search found zero metric/structured-logger dependencies, zero metrics
routes, and zero media counter/histogram/gauge references. Documentation is
aspirational rather than runtime evidence. Required 1G observability is absent
and blocks closeout as `LCM-1G-F003`.

## 13. Health and operational audit

The production image built successfully, installed production dependencies,
ran as UID 1000, loaded Prisma Client, and contained `/usr/bin/ffprobe` with
the exact first version line. The runtime verification script proved timeout,
output limit, protocol/network denial, and MP4/WebM smoke behavior.

A valid dependency-network startup reached `/api/v1/health` and stopped
gracefully. The actual response was HTTP 200 with `status: degraded` because
the configured storage bucket was unavailable; it also exposed pre-existing
failed queue counts as bounded aggregates. The single `HealthController`
directly returns the service report, whose status is only `ok` or `degraded`,
and does not map dependency states to HTTP status codes. DB, Redis, storage,
and queues are required internally.

`OBSERVABILITY.md` permits a general failed check to remain HTTP 200 with a
degraded report, while separately requiring HTTP 503 for a critical database
failure. The storage-bucket experiment does not itself contradict that
database-critical requirement. It proves instead that the current CI startup
gate, which uses `curl --fail` and does not inspect JSON status, can accept an
application instance while a required Learning Media dependency is unusable.

With a valid dependency network and a deliberately wrong absolute ffprobe
path, the runtime exited nonzero. The startup identity gate therefore fails
closed. A separate deliberately unreachable database showed that Prisma
startup also fails closed, but its fatal log leaks the raw Prisma error and
endpoint.

There is no tracked application deployment/restart manifest, reverse proxy,
TLS configuration, secret manager integration, readiness probe semantics, or
production storage-bucket provisioning procedure. The Docker build warned
that `firebase-admin@14.0.0` declares Node `>=22` while the locked runtime is
Node 20.19.4.

## 14. Phase 1F trigger decision

```text
PHASE_1F_TRIGGERED = FALSE
```

No approved adaptive bitrate, offline playback, thumbnail, alternate
rendition, new source format, over-209,715,200-byte upload, resumable upload,
or multipart-recovery requirement was found. Local Range success was 100%,
not below the 99% trigger. The 4.15 ms local Range p95 is TTFB, not mobile
time-to-first-frame, so it neither proves nor triggers the 3,000 ms TTFF rule.
Phase 1F remains evidence-triggered and was not implemented.

## 15. Operational runbook

### Required services and versions

- production image built from the digest-pinned Node 20.19.4 Debian 12 base;
- PostgreSQL 16, Redis 7, and S3-compatible MinIO;
- `/usr/bin/ffprobe` first line exactly
  `ffprobe version 5.1.9-0+deb12u1 Copyright (c) 2007-2026 the FFmpeg developers`;
- `MEDIA_VERIFICATION_VERSION=ffprobe-5.1.9-debian12-learning-media-v1`.

Do not promote mutable service tags without an independently approved image
pin. Resolve findings `LCM-1G-F006` and `LCM-1G-F008` first.

### Environment variable names

Required names include `NODE_ENV`, `APP_PORT`, `APP_URL`, `DATABASE_URL`,
`REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`,
`JWT_REFRESH_TTL`, `SETTINGS_SECRET_ENCRYPTION_KEY`, `STORAGE_PROVIDER`,
`STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`,
`STORAGE_BUCKET`, `STORAGE_PUBLIC_BUCKET`, `STORAGE_CORS_ORIGINS`,
`FFPROBE_PATH`, `FFPROBE_TIMEOUT_MS`, `FFPROBE_MAX_OUTPUT_BYTES`,
`MEDIA_VERIFICATION_VERSION`, `FCM_ENABLED`, `FCM_DRY_RUN`, and `LOG_LEVEL`.
Never place secret values in the runbook, logs, image, or command transcript.
Production storage origins must be explicit and non-wildcard.

### Deployment order

1. Provision version-pinned PostgreSQL, Redis, and MinIO in the approved
   network and TLS/proxy topology.
2. Provision the private/public buckets and exact MinIO CORS policy.
3. Load secrets through the approved secret manager.
4. Run `npm run db:migrations:check` in CI against the resolved base.
5. Run `npx prisma validate`.
6. Against a backup-protected database, run
   `npm run verify:legacy-learning-media` at the documented pre-media
   migration boundary where applicable.
7. Run `npm run db:migrations:deploy`, then
   `npm run db:migrations:status`.
8. Run the seed only for explicitly approved baseline/system data. Demo data
   must not be enabled in production.
9. Start the exact application image. Require ffprobe identity success and a
   readiness policy that fails when required dependencies fail.
10. Run smoke tests before exposing traffic.

Migrations are forward-only. Committed migrations are immutable. There is no
automatic SQL rollback; application rollback must remain schema-compatible.
Back up before migration and test restore independently.

### Startup and dependency checks

- verify the image digest, non-root UID, Node, OpenSSL, ffprobe, and
  verification identifier;
- verify database migration status and a simple read;
- verify Redis PING and BullMQ worker connection;
- verify both MinIO buckets exist and are private;
- send an OPTIONS preflight from the configured origin for PUT and
  `content-type`; verify a foreign origin receives no wildcard grant;
- require health/readiness behavior that distinguishes liveness from required
  dependency failure. Do not rely on HTTP 200 alone while `status` is
  `degraded`.

### Smoke tests

Upload smoke:

1. authenticate a scoped management actor;
2. create one intent for a small allowed test asset;
3. confirm the response contains no storage credentials/key/bucket;
4. PUT to staging, renew once, and confirm absolute session expiry is fixed;
5. complete and verify READY authoritative facts;
6. attach to DRAFT Lesson Content, publish, and verify exactly one completion
   audit;
7. remove all smoke fixtures through supported lifecycle operations.

Playback/Range smoke:

1. use current Student, linked Parent, and exact-current Teacher actors;
2. request relation-scoped playback;
3. verify inline verified MIME and 300-second capability;
4. request a known byte range and require 206, exact `Content-Range`,
   `Accept-Ranges: bytes`, and byte equality;
5. verify DRAFT/ARCHIVED/cross-School/guessed-ID denials;
6. verify capability renewal and expiry denial without recording the URL.

### Cleanup worker and Redis/BullMQ

- verify the repeating discovery job and phase-specific candidate jobs exist;
- inspect queue waiting/active/delayed/failed counts without flushing Redis;
- alert on oldest cleanup claim age, finalization-recovery age, retry
  exhaustion, cleanup backlog, and VERIFYING age;
- verify a controlled candidate retries and persists deletion evidence only
  after success/confirmed absence;
- never delete unknown Redis keys or flush a shared database.

### Incident procedures

Stuck VERIFYING:

1. capture upload ID, bounded status, timestamps, stable reason, trace ID, and
   worker status without logging storage coordinates;
2. confirm no File or completion success audit was committed;
3. inspect finalization-recovery claim and retry state;
4. restore the failed dependency and re-enqueue only the deterministic
   per-session target;
5. do not classify infrastructure failure as invalid media.

Old cleanup claim or object-delete retry:

1. confirm capability expiry and claim age;
2. determine staging versus final/finalization-recovery target;
3. inspect retry history and storage reachability;
4. re-enqueue the same deterministic target after correcting the cause;
5. keep claim/failure evidence visible until deletion or absence is confirmed;
6. never set PURGED optimistically.

Orphan investigation:

1. compare FileUploadSession final/staging identities with object inventory;
2. check live and archived LessonContentItem references;
3. preserve referenced READY/LEGACY objects;
4. quarantine ambiguous objects and obtain approval before deletion;
5. record only bounded identifiers/aggregates in incident logs.

### Alerts and metrics recommended before promotion

Implement an independently approved low-cardinality metrics scope for all
missing Section 12 counters, histograms, and gauges. Alert on health-required
dependency errors, verification latency/failure rate, expired/VERIFYING
backlog, cleanup retries/exhaustion, PURGED anomalies, playback denial/Range
failure rate, signed-URL generation latency, and queue failure growth.

### Credentials, backup, restore, and rollback

- rotate database, Redis, MinIO, JWT, encryption, email, and push credentials
  independently; account for outstanding presigned capabilities during MinIO
  rotation;
- use encrypted PostgreSQL and object-store backups with tested restore,
  retention, and access controls;
- Redis queues are operational state, not the system of record; reconcile from
  PostgreSQL after loss;
- application rollback must not edit migration history or use `db push`;
- if a migration cannot be safely forward-fixed, stop promotion and obtain an
  approved remediation plan.

### 1F reopening evidence

Capture the exact supported device, codec, deployment path, TLS/proxy, mobile
network profile, at least 100 requests, Range success, and true decoded
first-frame p95. Reopen 1F only for a locked trigger listed in Section 14.

### Promotion evidence package

Before production promotion capture immutable image/service versions, migration
status/checksums, backup/restore proof, health/readiness status, bucket/CORS
proof, upload/playback/Range smoke results, security matrix result, canonical
regression result, performance aggregates on the deployed path, observability
screenshots/queries, queue/cleanup backlog, and zero-residue confirmation.

## 16. Findings register

### LCM-1G-F001 — RESOLVED — deterministic canonical route-inventory failure

- Contract: Section 20 full canonical regression.
- Paths: the three final-closeout E2E files named in Section 6.
- Reproduction: `npm run test:regression`.
- Observed: unit 3682/3682 and security 1154/1154 pass; E2E 540/543 with
  three route inventory failures.
- Expected: every canonical process exits 0.
- Impact: required regression is non-repeatable and CI cannot provide a clean
  release gate. This is a stale test-inventory failure, not a Student, Parent,
  or Teacher playback runtime failure.
- Resolution: the three exact playback routes were added to the stale
  inventories, focused validation passed 43/43, and the complete canonical
  regression passed. This was a deterministic stale test-inventory failure. It
  was not a Student, Parent, or Teacher playback runtime failure.
- Blocks 1G: no; resolved on 2026-07-24.

### LCM-1G-F002 — HIGH — production-equivalent execution/performance path is unavailable

- Contract: deployment-equivalent storage/Range/CORS and quantitative
  performance evidence.
- Paths: `Dockerfile`, `docker-compose.yml`, `.github/workflows/`.
- Reproduction: tracked deployment inventory plus environment inspection.
- Observed: no proxy/TLS/deployment manifest/production hostname/mobile
  network; only direct Docker/MinIO and CI runner paths.
- Expected: approved target path and mobile-network boundary.
- Impact: local latency, browser path, TLS/proxy Range behavior, and TTFF cannot
  be certified for production. This is an external deployment/environment
  exit-gate blocker, not evidence of an application-code defect.
- Blocks 1G: yes.
- Remediation: independently approve and provide the target deployment
  contract/environment, then execute the same security/storage/performance
  matrix there.

### LCM-1G-F003 — HIGH — required observability is not implemented

- Contract: `OBSERVABILITY.md`, 0A Section 15, and Phase 1G exit criteria.
- Paths: `package.json`, `src/main.ts`, `src/common/context/`,
  `src/modules/files/uploads/`, and playback modules.
- Reproduction: dependency/source search and runtime log inspection.
- Observed: no metrics dependency/route/media metrics; default unstructured
  Nest logs.
- Expected: structured/redacted logs and the required bounded counters,
  histograms, gauges, and low-cardinality policy.
- Impact: upload, playback, cleanup, verification, and Range failure cannot be
  operated or alerted reliably.
- Blocks 1G: yes.
- Remediation: separately approve an observability implementation with exact
  metrics, redaction, cardinality, dashboards, and alert tests.

### LCM-1G-F004 — HIGH — the single health endpoint conflates liveness and readiness, has no path for the documented critical-dependency HTTP 503 behavior, and the CI smoke accepts degraded HTTP 200 responses without inspecting the report status

- Contract: operational readiness and `OBSERVABILITY.md` health behavior.
- Paths: `src/modules/health/health.controller.ts`,
  `src/modules/health/health.service.ts`,
  `.github/workflows/learning-media-integrity.yml`.
- Reproduction: start the production image with the configured development
  bucket absent and call `/api/v1/health`.
- Observed: the single health controller directly returns a report limited to
  `ok` or `degraded`. An unavailable required storage bucket returned HTTP 200
  with `status: degraded`; CI uses `curl --fail` and does not inspect JSON
  status. DB, Redis, Storage, and Queues are internally treated as required
  dependencies, but the controller does not map dependency failures to HTTP
  status codes. `OBSERVABILITY.md` permits a general failed check to remain
  HTTP 200/degraded and separately requires HTTP 503 for a critical database
  failure; the storage experiment alone does not contradict that
  database-specific requirement.
- Expected: explicit liveness and readiness contracts, documented dependency
  criticality, non-2xx readiness for selected required dependency failures,
  and explicit bucket provisioning.
- Impact: the current CI startup gate can accept an application instance while
  a required Learning Media dependency is unusable.
- Blocks 1G: yes.
- Remediation: independently approve liveness/readiness separation, documented
  criticality, selected non-2xx readiness semantics, required-bucket
  provisioning/verification, and CI assertions for both HTTP status and JSON
  readiness state.

### LCM-1G-F005 — HIGH — startup logs expose raw Prisma error and database endpoint

- Contract: no raw Prisma errors or infrastructure coordinates in logs.
- Paths: `src/main.ts`, `src/infrastructure/database/prisma.service.ts`.
- Reproduction: start the production image with an unreachable database.
- Observed: `Fatal bootstrap error: PrismaClientInitializationError`, P1001,
  and the database host/port are printed.
- Expected: bounded startup reason and correlation without raw driver error or
  endpoint.
- Impact: infrastructure topology disclosure and unsafe log surface.
- Blocks 1G: yes.
- Remediation: separately approve bounded bootstrap logging/redaction tests
  while preserving nonzero startup failure.

### LCM-1G-F006 — MEDIUM — runtime dependency engine mismatch

- Contract: reproducible supported runtime.
- Paths: `Dockerfile`, `package-lock.json`.
- Reproduction: `docker build --tag moazez-learning-media:phase1g-audit .`.
- Observed: npm warns `firebase-admin@14.0.0` requires Node `>=22`; runtime is
  Node 20.19.4.
- Expected: locked runtime satisfies every production dependency engine.
- Impact: unsupported behavior may emerge in push-enabled deployments.
- Blocks 1G: no independently, but requires resolution before production.
- Remediation: separately choose a supported Node/runtime or dependency
  version and run the full regression/runtime matrix.

### LCM-1G-F007 — MEDIUM — no active HTTP rate-limiter implementation

- Contract: production security hardening and safe abuse resistance.
- Paths: `package.json`, `src/main.ts`, `src/common/exceptions/global-exception.filter.ts`.
- Reproduction: dependency/source search for Throttler/rate-limit middleware.
- Observed: only a 429 error mapping exists; no limiter dependency/provider is
  wired.
- Expected: independently approved, actor/route-aware limits for auth, intent,
  complete, and playback capability endpoints.
- Impact: credential and capability endpoints lack repository-enforced abuse
  throttling.
- Blocks 1G: no under the locked feature contract, but is production risk.
- Remediation: separate security-hardening scope with proxy and application
  limit ownership defined.

### LCM-1G-F008 — HIGH — Compose infrastructure is not fully immutable

- Contract: pinned runtime/infrastructure versions and repeatable operations.
- Paths: `docker-compose.yml`.
- Reproduction: inspect Compose image declarations.
- Observed: PostgreSQL uses a mutable major-family tag and is not patch- or
  digest-pinned. Redis uses a mutable major-family tag and is not patch- or
  digest-pinned. MinIO uses an exact dated release tag but is not digest-pinned.
  The application Node base image is digest-pinned.
- Expected: exact image ownership and an explicit controlled upgrade policy for
  all supported infrastructure.
- Impact: rebuild/restart can silently change storage/database/cache behavior.
- Blocks 1G: yes for operational closeout.
- Remediation: separately approve exact image/digest pins and upgrade policy,
  then rerun migration/storage/recovery rehearsals.

## 17. Cleanup and residue evidence

| Resource                                              | Final audit count/state   |
| ----------------------------------------------------- | ------------------------- |
| Phase 1G disposable databases                         | 0                         |
| Phase 1G database fixture rows                        | 0                         |
| Phase 1G Redis keys/jobs                              | 0                         |
| Phase 1G MinIO buckets/objects                        | 0                         |
| Phase 1G containers                                   | 0                         |
| Phase 1G images/tags                                  | 0                         |
| Phase 1G temporary files/scripts/logs                 | 0                         |
| Lingering Phase 1G Node/Jest/ffmpeg/ffprobe processes | 0                         |
| Original PostgreSQL/Redis/MinIO containers            | restored to stopped state |
| Existing volumes/networks                             | preserved                 |
| Staged repository paths                               | 0                         |

No Redis flush, Prisma reset, `db push`, shared-database destructive operation,
user-volume deletion, or unrelated container removal was performed.

## 18. Deferred independently approved remediation scopes

1. Establish the approved deployment/proxy/TLS/mobile performance environment.
2. Implement required structured logging, metrics, dashboards, and alerts.
3. Define liveness/readiness, dependency criticality, non-2xx readiness,
   required-bucket provisioning, and CI JSON/status validation.
4. Redact bounded startup failures.
5. Resolve the Node/firebase engine contract.
6. Add rate-limit ownership.
7. Pin Compose service images immutably.

None of these remediations is implemented by this closeout.

## 19. Exact changed paths

Exactly four changed or untracked repository paths:

```text
docs/sprint-learning-content-discovery-media-1g-full-security-storage-performance-closeout.md
test/e2e/student-app-final-closeout.e2e-spec.ts
test/e2e/parent-app-final-closeout.e2e-spec.ts
test/e2e/teacher-app-final-closeout.e2e-spec.ts
```

No production path changed.

## 20. Final status

All Section 20 rows are mapped and pass after the test-only inventory
correction. Functional implementation and the canonical regression are
complete. Production-equivalent execution, required observability,
liveness/readiness separation, startup-log redaction, and fully immutable
infrastructure ownership remain deferred operational-readiness blockers.

```text
SECTION_20_REQUIREMENTS_MAPPED = 39/39
SECTION_20_REQUIREMENTS_PASSING = 39/39
LEARNING_CONTENT_MEDIA_FUNCTIONAL_IMPLEMENTATION = COMPLETE
CANONICAL_REGRESSION = PASS
SECURITY_AND_TENANCY = PASS
CONCURRENCY_AND_RECOVERY = PASS
LOCAL_STORAGE_AND_RANGE = PASS
PRODUCTION_OPERATIONAL_READINESS = DEFERRED
LEARNING_CONTENT_MEDIA_PROGRAM = BLOCKED
BLOCKERS = LCM-1G-F002, LCM-1G-F003, LCM-1G-F004, LCM-1G-F005, LCM-1G-F008
PHASE_1F_TRIGGERED = FALSE
SAFE_TO_START_NEXT_FEATURE = TRUE
```

`LCM-1G-F006` and `LCM-1G-F007` remain MEDIUM and independently
nonblocking. The remaining `BLOCKED` status applies only to deferred production
operational-readiness gates; this document does not claim production
certification.

## 21. Post-audit local functional remediation

Date: 2026-07-24. Baseline:
`ac99609fa60c8f8a79615bfd4f4e4f7301d5f149`.

The correction changed only:

- `test/e2e/student-app-final-closeout.e2e-spec.ts`;
- `test/e2e/parent-app-final-closeout.e2e-spec.ts`;
- `test/e2e/teacher-app-final-closeout.e2e-spec.ts`;
- this closeout document.

The exact inventory corrections were:

- Student:
  `GET /api/v1/student/lessons/:lessonPlanItemId/content/:contentItemId/playback`;
- Parent:
  `GET /api/v1/parent/children/:studentId/lessons/:lessonPlanItemId/content/:contentItemId/playback`,
  with total routes `72 -> 73`, GET routes `60 -> 61`, and non-GET routes
  unchanged at 12;
- Teacher:
  `GET /api/v1/teacher/lesson-preparation/:lessonPlanItemId/content/:contentItemId/playback`,
  with routes, inventory entries, and decorated entries `111 -> 112`;
  undecorated entries remain `[]`. The route retains
  `teacher.lesson_preparation.view`, `academics.lesson_plans.view`, and
  `academics.curriculum.view`.

Post-remediation executable evidence:

| Validation                          | Result                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Focused three-file Jest command     | 3/3 suites, 43/43 tests PASS in 49.869 s; no failures or open-handle warning                                               |
| `npm run test:migration-governance` | 39/39 PASS                                                                                                                 |
| `npm run db:migrations:check`       | PASS; active 7, new 0                                                                                                      |
| `npx prisma validate`               | PASS                                                                                                                       |
| `npx prisma generate`               | PASS; no tracked generated change                                                                                          |
| `npm run build`                     | PASS                                                                                                                       |
| `npm run test:regression`           | PASS; unit 516/516 suites and 3682/3682 tests; security 89/89 and 1154/1154; E2E 103/103 and 543/543; root application 1/1 |

The first focused attempt occurred before the previously stopped local
PostgreSQL service was started and therefore failed only with connection errors
at `localhost:5433`; it is infrastructure evidence, not route-inventory or
runtime evidence. After recording the original container state and starting
the existing infrastructure through `npm run infra:up`, the exact command
passed.

No production code or runtime behavior changed. No schema, migration, seed,
permission, role, package, lockfile, Dockerfile, Compose, CI, or environment
file changed.

Before local services were started, `moazez-postgres`, `moazez-redis`, and
`moazez-minio` all existed and were stopped. After validation, all three were
restored to that stopped state; no container or volume was removed. Read-only
cleanup inspection found zero MinIO data objects and zero repository temporary
files. The Redis volume retained its pre-existing development/BullMQ namespace;
no key was flushed or removed and this correction introduced no dedicated
Redis key or job. The completed canonical process left no non-watch Jest
process; existing VS Code Jest watch processes were not created or modified by
this correction.
