# PRD1-G05 School Email Delivery Job ID Closeout

## Gate status

`COMPLETE`

`PRD1-G05` is complete. The existing School Email Delivery job ID contract was
proven against the locked BullMQ packages and real Redis. The exact three-path
implementation candidate passed local owner verification and pull-request CI,
PR #52 merged into `main`, and all four post-merge push workflows passed on the
exact merge commit.

## Starting baseline

- Branch:
  `test/production-readiness-1d-school-email-job-id-proof`
- `HEAD`:
  `2f87a155cf27f2186cfd7746026562ef18cb4f71`
- `origin/main`:
  `2f87a155cf27f2186cfd7746026562ef18cb4f71`

## G05-A reality proof

`PRD1-G05-A` executed the current production job ID against the locked BullMQ
package and a real disposable Redis server. Its primary classification was:

`CURRENT_JOB_ID_CONTRACT_COMPATIBLE`

The reality proof established that the colon-delimited ID is accepted, stored
exactly, retrievable by exact ID, and duplicate-suppressed while the original
payload is retained. No production-source remediation is required.

The external G05-A evidence is retained at:

`C:\Users\Abdal\AppData\Local\Temp\moazez-prd1-g05-a-20260731-031807-756`

## Locked runtime contract

| Component    | Validated value  |
| ------------ | ---------------- |
| Node         | `22.23.1`        |
| npm          | `10.9.8`         |
| BullMQ       | `5.75.2`         |
| ioredis      | `5.10.1`         |
| Redis image  | `redis:7-alpine` |
| Redis server | `7.4.8`          |

Dependencies were installed by the repository Docker build through `npm ci`
from the committed lockfile. The workspace dependency tree was not installed
or modified.

## Preserved production contract

The exact custom job ID remains:

```text
school-email-delivery:<batchId>:<recipientId>
```

The production call chain remains:

1. `buildSchoolEmailDeliveryRecipientJobId()` in
   `src/modules/settings/email/delivery/domain/email-delivery.constants.ts`
   creates the exact colon-delimited ID.
2. `SchoolEmailDeliveryQueueService.enqueueRecipientDelivery()` in
   `src/modules/settings/email/delivery/application/school-email-delivery-queue.service.ts`
   supplies the ID as `jobId` with `attempts: 3` and exponential backoff delay
   `1000`.
3. `BullmqService.addJob()` in
   `src/infrastructure/queue/bullmq.service.ts` forwards the job name, payload,
   and options unchanged to the real BullMQ `Queue.add()`.

No worker is started by the regression test.

## Permanent regression

The permanent integration test is:

`test/integration/school-email-delivery-job-id.integration.spec.ts`

Ordinary runs skip the suite unless
`RUN_PRD1_G05_REDIS_INTEGRATION=1`. An opted-in run requires a valid
`PRD1_G05_REDIS_URL` and never falls back to `REDIS_URL`.

The test instantiates the real `BullmqService` and
`SchoolEmailDeliveryQueueService`. It does not mock BullMQ, ioredis,
`Queue.add()`, either production service, or a worker. It proves:

- the builder's exact colon-delimited value;
- the production queue and job names;
- exact returned and retrieved job IDs;
- exact first-enqueue payload storage;
- attempts `3` and exponential backoff delay `1000`;
- a same-ID second enqueue with a different actor marker;
- retention of the first payload;
- exactly one stored job for the custom ID;
- exactly one waiting job and zero delayed, active, completed, or failed jobs;
- queue obliteration, exact queue-key cleanup, one
  `BullmqService.onModuleDestroy()` call, and closed Redis handles.

## Dedicated workflow

The permanent workflow is:

`.github/workflows/school-email-delivery-integrity.yml`

`School Email Delivery Integrity` uses Node `22.23.1`, `npm ci`, the committed
lockfile, `redis:7-alpine`, the repository Redis health check, read-only
contents permission, and a bounded 20-minute job. It prints only the installed
BullMQ and ioredis versions, generates Prisma Client with a synthetic
build-only database URL, builds with a 4096 MB Node heap, runs the focused
delivery unit suites, and runs the opted-in Redis regression with
`--runInBand` and `--detectOpenHandles`.

The workflow starts no PostgreSQL, MinIO, SMTP provider, application process,
email worker, migration, or seed operation. Its integration step verifies that
exactly one test passed and fails if the opted-in contract is reported as
skipped.

## Local validation evidence

Validation used the repository's pinned Node
`22.23.1-bookworm-slim` Docker runtime and lockfile-installed dependencies.
The disposable Redis container used `redis:7-alpine` on an ephemeral host
port.

| Gate                                         | Result                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Prettier check on the three authorized paths | PASS                                                                                              |
| Focused ESLint on the integration test       | PASS                                                                                              |
| Nest build with `--max-old-space-size=4096`  | PASS                                                                                              |
| Focused school email delivery unit tests     | 3 suites, 15 tests, 0 skipped                                                                     |
| Real Redis integration                       | 1 suite, 1 test, 0 skipped                                                                        |
| `--detectOpenHandles`                        | 0 open handles reported                                                                           |
| Unhandled rejections                         | 0                                                                                                 |
| Exact stored job ID                          | `school-email-delivery:33333333-3333-4333-8333-333333333333:44444444-4444-4444-8444-444444444444` |
| Stored job count                             | 1                                                                                                 |
| Duplicate returned same ID                   | PASS                                                                                              |
| First payload retained                       | PASS                                                                                              |
| Attempts/backoff retained                    | PASS                                                                                              |
| Queue counts                                 | waiting 1; delayed 0; active 0; completed 0; failed 0                                             |
| `git diff --check`                           | PASS                                                                                              |

External local evidence is retained at:

`C:\Users\Abdal\AppData\Local\Temp\moazez-prd1-g05-b-20260731-034012-571`

## Remote CI, publication, and merge evidence

The approved implementation candidate was published in PR #52.

| Evidence                  | Verified value                             |
| ------------------------- | ------------------------------------------ |
| Candidate commit          | `5f4d07da2361ad63ad443c66b3d303c2255505ea` |
| Candidate commits         | `1`                                        |
| Candidate paths           | `3`                                        |
| Production source changes | `0`                                        |
| Candidate workflow        | `School Email Delivery Integrity`          |
| Candidate workflow run    | `30597935686`                              |
| Candidate workflow event  | `pull_request`                             |
| Candidate workflow result | PASS                                       |
| Merge commit              | `ad58d34c45ea77c6fc51b47fa221f79f252a5b78` |

All four reported pull-request checks passed on the implementation candidate.

The exact merge commit then passed these automatic `push` workflows on
`main`:

| Workflow                        | Run ID        | Result |
| ------------------------------- | ------------- | ------ |
| Learning Content Integrity      | `30598436406` | PASS   |
| Learning Media Integrity        | `30598436417` | PASS   |
| Migration Integrity             | `30598436434` | PASS   |
| School Email Delivery Integrity | `30598436400` | PASS   |

The automatic post-merge runs appeared late in the first GitHub CLI listing,
but they were subsequently resolved by their exact merge SHA. No manually
dispatched replacement run was required.

The GitHub runner emitted a non-blocking annotation that Node.js 20-based
versions of `actions/checkout@v4` and `actions/setup-node@v4` were being forced
to the Node.js 24 action runtime. The workflow completed successfully. This
annotation does not change the School Email Delivery compatibility result and
requires no production-source change in this gate.

PR #51 remained open, Draft, unmerged, and unchanged throughout `PRD1-G05`.

## Unchanged production behavior

The implementation PR added no production TypeScript change. It did not change
queue or job names, the builder format, attempts, backoff, worker behavior,
delivery processing, API contracts, database persistence, Prisma schema,
migrations, seeds, package manifests, lockfile, runtime image, or Compose
configuration.

This governance closeout updates only this closeout document and the Phase 0A
acceptance matrix. It introduces no runtime or production-source behavior.

## Implementation PR exact changed-file inventory

1. `.github/workflows/school-email-delivery-integrity.yml`
2. `test/integration/school-email-delivery-job-id.integration.spec.ts`
3. `docs/production-readiness/phase-1/04-school-email-delivery-job-id-closeout.md`

No other repository path was changed by implementation PR #52.

## Local validation cleanup

- The integration test obliterated its queue and verified zero matching BullMQ
  keys.
- `BullmqService.onModuleDestroy()` ran exactly once.
- The dedicated cleanup ioredis client closed.
- The disposable Redis container and build-validation container were removed.
- The temporary validation image was removed after final checks.
- No test network was created.
- During local validation, no worker, email delivery, application process,
  migration, seed, commit, push, or GitHub mutation was performed. Publication,
  CI, merge, and post-merge verification occurred later as recorded above.

## Final disposition

The dedicated candidate workflow requirement was satisfied by successful run
`30597935686` on candidate
`5f4d07da2361ad63ad443c66b3d303c2255505ea`.

PR #52 merged the approved three-path candidate into `main` as merge commit
`ad58d34c45ea77c6fc51b47fa221f79f252a5b78`.

That merge commit passed Learning Content Integrity, Learning Media Integrity,
Migration Integrity, and School Email Delivery Integrity through automatic
`push` runs on `main`.

The exact custom job ID contract is compatible with the locked BullMQ and Redis
runtime. No production-source remediation is required.

Final status:

`COMPLETE`
