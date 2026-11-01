# ST13 bounded performance evidence

PERFORMANCE_MEASURED=YES. PERFORMANCE_SLO_CERTIFICATION=NOT_CERTIFIED. These are isolated measurements, not a Production capacity, latency or scalability acceptance.

## Source and method

The measured candidate is `a30a1c0ab4fd18cbcffaf886ed3f6c0ff9e498ca`, tree `1648db2222110213f83dfcfe774cda1025e8354c`. The approved baseline is `e517b3d6e464b23babde6db28cf0f80d6bbcc865`, tree `9aacef2d3540926f51ae4294c7ad85f22ea8c225`; its preserved read-only checkout has the exact approved tree despite a different checkout commit. The certified code/test source is `8ac0b4ead91385ba84e9b4212346e426759cc820`; the subsequent publication-clock fixture correction changes neither application source nor this performance harness. A direct diff of `src/` and the two harness files is empty between these candidates.

Both runs use the same helper SHA256 `6070e90a9b4bb85844110ccb197acbd6f1c3e35df5e93cba70e84ed70a5cc4cc`, Node v22.23.1, PostgreSQL 16.15, actual JWT/Nest loopback HTTP, private MinIO, Redis, Windows x64, 16 logical CPUs and 8399794176 bytes of host RAM. PostgreSQL, Redis and MinIO are task-owned, image-pinned, loopback-only and tmpfs-backed. MinIO release is RELEASE.2025-09-07T16-13-09Z. Each source gets a separate fresh 39-migration database, generate/seed, checksum/status/drift verification and a second-deploy no-op. The desktop is resource-constrained; no other owned compiler or test process runs during sampling. Background host activity and sequential-run/cache effects remain sources of noise.

Each of the 15 workloads has three sequential warmups and 20 measured requests: 300 samples and 45 warmups per source, 600 measured samples and 90 warmups overall. Concurrency is one except four simultaneous manual-review requests. The large Grades fixture has 200 canonical questions, 20 display groups, one owning Student and one submitted required answer; the remaining 199 questions are optional. The Homework fixture contains all eleven types in one group. The private transfer is 294912 bytes. Exact per-workload student/asset/physical-file counts, timings and resource observations are in [the numeric artifact](st13-performance-measurements.json). No fixture Student identity, storage coordinate, credential, SQL text or SQL parameter is recorded.

Query instrumentation records numeric Prisma query events only. Transaction timing transparently delegates the actual scoped transaction with unchanged receiver/arguments/result/rejection. It measures caller-observed elapsed time including queuing and commit, not pure lock-hold time. Memory is sampled at workload boundaries; these observations are not continuous peak-RSS measurements. Correctness assertions retain actual status, stable identity, idempotence, canonical points, exact private bytes and no implicit GradeItem synchronization.

## Measured results

All times are milliseconds. DB counts are aggregate observations across the 20 measured requests, not exact individual-request traces. Transaction p95 is baseline / candidate; 'not observed' means that workload used no observed scoped transaction.

| Workload | B p50 | B p95 | B max | C p50 | C p95 | C max | DB count B / C | Tx p95 B / C |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PERF-G-AUTHOR-200 | 260.90 | 287.39 | 294.19 | 244.15 | 267.43 | 301.22 | 1440 / 1440 | 195.27 / 176.00 |
| PERF-G-STUDENT-LIST | 50.12 | 56.53 | 58.16 | 47.59 | 56.42 | 57.60 | 520 / 520 | not observed / not observed |
| PERF-G-STUDENT-DETAIL-200 | 205.01 | 236.35 | 244.86 | 180.93 | 237.59 | 238.64 | 1701 / 1701 | 63.71 / 55.74 |
| PERF-G-GROUP-DISPLAY-20 | 184.30 | 192.81 | 193.92 | 176.46 | 193.44 | 194.56 | 1700 / 1700 | 52.10 / 51.97 |
| PERF-G-QUESTION-ASSET-METADATA | 110.65 | 121.28 | 127.25 | 107.81 | 125.51 | 164.55 | 800 / 800 | 64.29 / 72.67 |
| PERF-G-TEACHER-QUEUE | 61.90 | 64.98 | 81.70 | 60.12 | 62.50 | 66.49 | 461 / 460 | not observed / not observed |
| PERF-G-TEACHER-PAGINATION | 59.32 | 62.92 | 65.52 | 62.24 | 66.21 | 74.35 | 460 / 460 | not observed / not observed |
| PERF-G-TEACHER-DETAIL-200 | 164.48 | 229.41 | 232.44 | 141.10 | 169.30 | 172.68 | 1001 / 1001 | 100.03 / 70.63 |
| PERF-G-OBJECTIVE-EVALUATION | 162.54 | 225.77 | 234.43 | 136.26 | 207.37 | 211.83 | 1340 / 1340 | 195.13 / 184.28 |
| PERF-G-CONCURRENT-MANUAL-REVIEW | 291.55 | 923.68 | 959.07 | 285.34 | 648.60 | 1211.71 | 1400 / 1400 | 311.54 / 346.97 |
| PERF-G-PARENT-RELEASED-200 | 114.46 | 148.48 | 150.69 | 107.57 | 145.64 | 150.27 | 780 / 780 | 97.52 / 102.55 |
| PERF-G-PRIVATE-BYTES | 124.31 | 133.76 | 135.60 | 149.81 | 183.03 | 183.22 | 1060 / 1060 | 39.46 / 54.93 |
| PERF-G-EXPLICIT-SYNC | 43.29 | 47.21 | 52.51 | 72.62 | 103.52 | 109.00 | 461 / 600 | 9.55 / 64.61 |
| PERF-G-ANSWER-ASSET-METADATA | 62.21 | 70.73 | 72.25 | 58.74 | 65.75 | 69.40 | 620 / 620 | 40.68 / 39.19 |
| PERF-H-GROUPED-ELEVEN-TYPE-DETAIL | 87.07 | 99.66 | 104.60 | 87.89 | 94.43 | 95.17 | 1000 / 1000 | 26.49 / 22.73 |

The explicit sync p95 rises from 47.21 ms to 103.52 ms and observed query count from 461 to 600 across 20 samples. The repair adds current permission/resource fences and places validation, GradeItem persistence and audit in one transaction. That is a measured cost of the demonstrated security/atomicity correction. Other unchanged workloads also move in both directions, including private-byte transfer; this small noisy paired experiment does not establish a performance improvement or a statistically demonstrated regression.

Collection reads are bounded by the existing question limits and pagination. At this fixed large fixture, unchanged projection workloads have the same query counts apart from a single aggregate event in the queue measurement. Source review confirms that this change adds fixed submission/assessment/identity/GradeItem fences, not a query for every question. The existing 200-question detail and authoring paths still produce substantial aggregate authorization/projection query counts (see table); a one-size paired fixture is insufficient to certify asymptotic query growth or absence of every inherited N+1 pattern. Backend performance owners should profile representative deployment sizes before accepting a capacity or latency target. Transaction elapsed observations are available for that follow-up; no transaction budget was increased.

## Reproduction and integrity

Run `node scripts/ci/st13-bounded-performance.cjs --output <new-owned-output.json>` only inside the governed disposable environment. A baseline run additionally uses `--source-root <preserved-clean-baseline> --approved-source e517b3d6e464b23babde6db28cf0f80d6bbcc865`. The CLI requires Node v22.23.1, test mode, the expected origin and a clean committed source checkout. It validates all 15 workload IDs and zero errors, refuses output overwrite and removes only its newly allocated OS temporary directory after absolute-path/realpath checks. It is a manual measurement tool, not a mandatory CI latency assertion or discovery exclusion.

Numeric artifact SHA256: `529bd928ecb10a87e6703adfd424a5ab0fd086bf87e2b0bfddf40f14a2da0685`. Original candidate JSON SHA256: `279b6e65bd431ac7df345e9dd1964e84c601f03116c4c6797b6f885270532aa8`; baseline: `0648b8cfcab3bfe5024a846c403e849ea1ba3a4a64ca495ac07f04f60a141561`. Both source objects are retained losslessly in the numeric artifact. Re-serializing an individual object with `JSON.stringify(value, null, 2)` reproduces its original checksum.

The earlier fourteen-workload experiment is exploratory and is not substituted for this final fifteen-workload pair. Initial duplicate sort-order, owned MinIO capacity and missing canonical fixture-CORS errors were corrected only in owned fixtures and remain recorded externally. All four original disposable databases were checked for matching 39-migration checksums, no injected audit CHECK and no idle transaction; the three original fixture containers were removed with verified ownership and zero remaining resources. The later live-clock regression fixture has its own cleanup receipt. Production and shared environments were not exercised.

No workload-specific latency SLO is approved (ADR-0010 retains that approval dependency). Planning/Backend performance owners must approve a workload and deployment budget before SLO certification. DR07 provider approval and Production enablement remain pending.
