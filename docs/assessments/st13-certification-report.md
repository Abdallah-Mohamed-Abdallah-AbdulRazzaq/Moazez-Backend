# ST13 Full Acceptance Certification — Backend source evidence

Mandate: MOAZEZ-ST13-FULL-CERTIFICATION-2026-10-31. Program: HOMEWORK_ASSESSMENTS_MODERNIZATION_V1.0. Approved starting main: `e517b3d6e464b23babde6db28cf0f80d6bbcc865`. This package certifies the implemented Backend source and the explicit supported/denied classes below. Owner Backend Engineering review and Planning acceptance remain pending.

## Result and exact evidence boundary

Certified runtime/test source: `8ac0b4ead91385ba84e9b4212346e426759cc820`, based on the approved main. Exact-head [CI 41280175526, attempt 1](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/actions/runs/41280175526) passed all 35 jobs and 26 routed regression shards. CI / Required is PASS; discovery/execution parity is 1058/1058 active files with zero missing, duplicate or unexpected assignments; cleanup is PASS. Required artifact [13073835593](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/actions/runs/41280175526/artifacts/13073835593) has independently downloaded ZIP SHA256 `ca4e3ac368567a690280f7aadaad2ff10dbca03ce569273793ef3d61d3f837e0`, matching GitHub's artifact digest. Earlier failed-head CI is retained as failure evidence and is not substituted for this receipt.

This report/matrix publication is a subsequent documentation-only commit on the same Draft PR #232. Its final handoff must identify a new final exact-head CI and Required artifact. App/test/script identity between the certified code source and that publication is checked separately. A documentation commit's own SHA cannot be embedded self-referentially here; the final delivery receipt supplies it. No Ready, merge or deployment is implied.

## Requirements and coverage denominator

[Requirements traceability](st13-requirements-traceability.csv) contains all 30 distinct definitions: Q-01 through Q-16, FM-01 through FM-13, and F-12. All 30 are PASS at the certified source, with exact canonical statements, authority/provenance, implemented paths, actual test case/assertion references, migration relevance, CI binding, residual risk and owner. Q and FM statements are recovered from sections 3/4 of the approved master plan (SHA256 1aab11deec89c493499c1e703bb72aede033870ecd67fc5afbdd525faae62e3e); no meanings are inferred from IDs.

The Owner-approved F-12 statement is reproduced exactly:

> Legacy test infrastructure available; new actor/type/asset/codec coverage and runtime proof absent — FM13 / ST13.

Provenance is the approved ST00 regrouped program-level F-label mapping, handoff SHA256 8324a10a8ad7ae7679e09cf8b28b3ba03d202b1e553e459b197f7f5e3c9ffb40, plus the explicit Owner/Backend Engineering decision. F12_ST00_PROGRAM_AUTHORITY=APPROVED. F12_ORIGINAL_VERBATIM_WORDING=NOT_INDEPENDENTLY_VERIFIED. F12_CERTIFICATION=EVIDENCE_DEPENDENT. It links to FM-13 and ST13 Full Certification. Historical absence is not assumed to persist: current actor/type/asset/codec/authorization/runtime obligations are closed using executed evidence, not merely legacy infrastructure existence. Production provider approval, client execution and performance SLO approval remain separate limitations.

[Question/actor/state coverage](st13-question-actor-state-coverage.csv) defines 189 meaningful classes, not a Cartesian-product percentage. Class counts: `{"VALID":171,"INVALID":14,"UNSUPPORTED":2,"IMPOSSIBLE":2}`. Execution classification: `{"PASS":185,"NOT_APPLICABLE":4}`. VALID and INVALID required-supported obligations must all have PASS evidence; INVALID means the expected denial was proved. UNSUPPORTED and IMPOSSIBLE combinations are explicitly justified from the implemented contract and restrictive SQL, with guard tests; their NOT_APPLICABLE classification is not an excuse for missing evidence.

The eleven-type catalogs remain separate in each domain. The matrix includes complete canonical lifecycle classes, all eleven Grades types × owning Student/related Parent × NONE/DETAILS/approved KEYS/revoked, Homework legacy Parent coverage, opt-in Teacher authoring, six approved response modes, multipart display/manual grading, legacy flat data, management/Platform surfaces where real, adversarial authorization and all ten required race families. The source-level inventory has exactly one new E2E file; all existing active files remain required. Planner, routing, aggregator and workflow source are unchanged.

## Demonstrated repairs and test hardening

[Defect register](st13-defect-register.md) records stable IDs, severity, exact reproduction and verification. Two approved-main runtime defects were demonstrated: explicit sync used a stale lifecycle read, and audit failure could leave a committed GradeItem. Current validation, permission/membership/allocation/enrollment/term fences, existing GradeItem state, upsert and audit now share one scoped transaction. The original five-second transaction budget, explicit/manual sync, scoring/error/response contracts remain intact. The shared audit method accepts a typed optional transaction client; unchanged callers retain their existing client.

Pre-push review also caught the initial local repair using the Teacher permission for Core. ST13-SYNC-003 records that local provenance honestly: Core remains grades.submissions.review, Teacher Assignment remains grades.items.manage. Real tests prove each works without the other grant and that actual concurrent grant revocation while the other remains yields 404, no GradeItem, no false-success audit and unchanged corrected marks. No OR permission exemption or grant was added. ST13-API-001 remains OPEN/LOW: two inherited sync Swagger 200 annotations differ from the established HTTP 201 behavior. The discrepancy and Backend API documentation owner are explicit in the register/client handoff; runtime compatibility is preserved and no residual-risk acceptance is invented.

Coverage additions prove the eleven-type audience grid, actual PostgreSQL bind/submit and group-move overlap, retained-file revocation before headers and exact real Academic Content private bytes. The inherited Buffer parameter inference is corrected without runtime behavior or compiler suppression. CI 41254056114 attempt 1 failed in two shards on the same live publication consumer fixture: its October-only term expired at the November rollover. Only that real-clock case's owned calendar is aligned to its captured clock; all deterministic cases, worker/drain assertions and timeouts are preserved. Its full 111-case PostgreSQL/Redis suite subsequently passes. There are zero open CRITICAL or HIGH source defects.

Local focused evidence comprises 1,301 distinct Jest cases in 64 files, plus the subsequently corrected 111-case publication runtime file; repeat runs are excluded. The 262 focused Node governance/checker cases and exact callback recheck are recorded separately. Full CI supplies the final complete regression execution, including the Linux media owner and durable role/migration harnesses. No .skip/.only, assertion suppression, routing exclusion or generic governance exemption was introduced. The transaction scanner has one exact DB-only callback record and a bounded test; its existing inventory ownership is preserved.

## Security, transaction and media proof

Actual scoped HTTP/PostgreSQL cases cover foreign School/Organization, wrong Student/Parent/teacher class/subject/term, revoked allocation/membership/grants after read, creator and broad-scope boundaries, Core-only key authority, stale parent/entity IDs, nullable legacy GradeItem enrollment and bulk submission authorization. The opt-in teacher-authoring permission remains registered once and absent from all seven default roles. No production permission seed/catalog changes occur.

Confidentiality checks cover current independent paper/key approval and release/revocation, public JSON whitelisting, Rich/group stimulus, author/reviewer separation and legacy route filtering. The ten concurrency families have real lock or storage barriers: save/submit, bind/submit, finalize/release, apply/override, key revision, authoring revocation, group moves, byte-reference retirement, duplicate/stale scoring and explicit sync/lifecycle. Current state and audits are atomic; marks are not changed by read-only evaluation and GradeItem sync remains explicit.

Media proof distinguishes source policy, actual isolated private objects and test-only security evidence. Academic Content uses the existing sealed-publication/legacy File fixture with actual MinIO GET/HEAD/Range/416/revocation; it does not claim real GCS resumable-provider certification. Learning Media and managed assessment/answer/group assets use the governed runtime owners. The mandatory Linux codec owner exercises Homework/Grades × MP3, AAC-MP4 and Opus-WebM with real verification, exact bytes, ranges, duration and final submission. Real object, MIME/signature/provenance/READY/quota/retention and abort tests complement the policy units. File Lifetime retains 30 physical File FKs and 29 retention consumers; UploadSession provenance is not a retention consumer. Soft-deleting one reference does not delete a shared physical File.

DR07_OPERATIONAL_RELEASE=PENDING. The test attestor is not an approved Production malware scanner. Production upload/provider enablement and scanner approval are not certified. Unsupported provider/content capabilities remain fail-closed. No GCS, cloud, IAM, DNS, Terraform, shared database or Production mutation occurs.

## Prisma and migration integrity

All 39 inherited migrations, schema and manifest remain byte-identical to the approved base. ST12 SQL SHA256 remains `3311350d985bf0ea9e958639cbbc3d89297ddf5bed8a6b32ea4906b4a6abda22`; manifest chain remains `00236bbdfa80b6f26effc04574841d92fc6fa18f31a93ae1a83bf45f16119214`. Validate/generate, fresh replay, applied checksums, status, no-op deploy and supported Prisma schema drift checks pass on owned disposable PostgreSQL. Physical catalog inspection records 803 FKs, 124 public CHECKs and 54 user triggers; custom SQL is verified separately because Prisma diff does not model it completely. Legacy ST11/ST12 upgrade tests preserve historical marks and restrictive tenant/resource relationships. Runtime DDL/role denials are executed by the real PRD3-G01/G04 durable shard harnesses, not inferred from a mocked unit or the legacy compatibility job labels.

The exact-code CI logs additionally record 18 positive privilege checks, 57 negative checks and 9 SET ROLE denials in G01, with zero remaining containers/networks/sessions. G04 independently records 21 runtime DDL denials, the 39-migration fresh/no-op results, matching checksums/schema and zero remaining owned resources. The media owner records 376 passing cases in 34 files with zero skips; its verifier integration log explicitly includes the audio file and two passing suites/24 cases. The six audio combinations are identified by the executed source parameterization, not invented verbose log titles.

The original four databases have matching checksums, no injected audit constraint and no idle transaction before ownership-verified container cleanup. The later clock regression has a separate fresh replay/no-op/drift and cleanup receipt. All owned containers are removed; preserved worktrees and inherited migration bytes are retained. No backfill, new migration, migration resolve or live deploy is performed.

## Build, lint and standalone typing

Normal npm run build/postbuild passes, including REFERENCE_DATA_BOOTSTRAP_BUILD_CONTRACT=PASS. Focused transitive TypeScript, including the corrected clock fixture, passes without compiler-rule changes. Non-mutating focused ESLint compares all 10 changed TypeScript files against 8 existing files from the exact approved tree: 54 baseline and 37 candidate diagnostics, 0 warnings, zero introduced diagnostics and 17 removed. This is a delta pass, not a clean whole-repository lint result.

| Whole-project check | Process heap | Exit | Elapsed | Failure mode | Certification |
| --- | --- | --- | --- | --- | --- |
| lint | 4096 MiB | null (terminated) | 300503 ms | BOUNDED_PROCESS_TIMEOUT | NOT_CERTIFIED |
| typecheck | 3072 MiB | 134 | 91837 ms | PROCESS_HEAP_EXHAUSTION | NOT_CERTIFIED |

Commands: non-mutating equivalent of lint:check is `node --max-old-space-size=4096 node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts" --format json --output-file <owned-evidence>`; standalone typing is `node --max-old-space-size=3072 node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`. Node v22.23.1, one owned compiler process at a time, five-minute bound, 16 logical CPUs and 8399794176 bytes of host RAM. Full lint was terminated at its bound (null exit, ETIMEDOUT/SIGTERM); standalone typing exited 134 with heap exhaustion, not a completed zero-error check. No whole-project baseline completion is claimed. Focused exact-base comparison and the reproduced/fixed inherited Buffer diagnostic are separate evidence. No global heap, lint rule, TypeScript configuration or production build policy is changed. Backend quality infrastructure owners retain both whole-project NOT_CERTIFIED limitations.

## Performance and client acceptance

[Performance evidence](st13-performance-evidence.md) and [numeric measurements](st13-performance-measurements.json) retain all 15 workloads, 600 samples, zero errors, query/transaction/resource observations and their checksums. Explicit sync's measured extra fences have a latency/query cost; there is no invented latency threshold or improvement claim. PERFORMANCE_MEASURED=YES; PERFORMANCE_SLO_CERTIFICATION=NOT_CERTIFIED, with Planning/Backend performance ownership.

[Client compatibility handoff](st13-client-compatibility-handoff.md) records exact current routes/permissions, separate catalogs, null/fallback/option/group identity, File/Audio completeness, review/scoring/release semantics and concrete client journeys still to run. BACKEND_API_COMPATIBILITY=PASS for the modernization surfaces. FRONTEND_MOBILE_INTEGRATION=NOT_RUN / NOT_CERTIFIED; END_TO_END_PRODUCT_ACCEPTANCE=NOT_RUN / NOT_CERTIFIED. Existing sync Swagger 200 versus actual HTTP 201 remains explicit metadata debt; no runtime status is silently changed.

## Exact code-candidate jobs

| Job | Conclusion |
| --- | --- |
| CI / Plan | success |
| CI / Preflight | success |
| CI / G06 reinforcement and storage 1/1 | success |
| CI / PRD3-G01 database runtime invariants 1/1 | success |
| CI / PRD3-G02 Redis recovery 1/1 | success |
| CI / E2E 5/5 | success |
| CI / PRD3-G03 queue recovery 1/1 | success |
| CI / Security 1/3 | success |
| CI / Security 3/3 | success |
| CI / E2E 2/5 | success |
| CI / Security 2/3 | success |
| CI / PRD3-G05 clean start 1/1 | success |
| CI / Media and storage 1/1 | success |
| CI / PRD3-G04 governed migration job 1/1 | success |
| CI / E2E 4/5 | success |
| CI / E2E 3/5 | success |
| CI / E2E 1/5 | success |
| CI / General integration 1/2 | success |
| CI / General integration 2/2 | success |
| CI / Migration governance 1/1 | success |
| CI / Teacher closeout 1/1 | success |
| CI / Unit 2/4 | success |
| CI / Unit 4/4 | success |
| CI / Unit 3/4 | success |
| CI / Runtime governance 1/1 | success |
| CI / Unit 1/4 | success |
| CI / G05 email Redis 1/1 | success |
| CI / CI orchestrator contracts 1/1 | success |
| CI / Required | success |
| Exact-candidate Phase 3 gate | success |
| Blocking aggregate gate | success |
| Fresh PostgreSQL replay | success |
| school-email-delivery-integrity | success |
| learning-media-integrity | success |
| Lesson Content atomicity and visibility | success |

Six legacy compatibility result jobs mirror Required; they are not counted as independent runtime execution. Actual regression, codec, privilege and migration proof comes from the immutable assignments, executed-file receipts, stage results and their exact source. All 26 shard records and preflight have PASS status and PASS cleanup. Required aggregation has zero missing/duplicate/unexpected assignments. The final documentation publication must obtain its own new exact-head receipt before delivery.

## Owner-controlled closeout

ST13_ENGINEERING_FINAL_REVIEW=PENDING. ST13_PLANNING_ACCEPTANCE=PENDING. OWNER_READY_MERGE=NOT_PERFORMED. PR232 remains OPEN/DRAFT. No Reviewer Receipt is invented. Production deployment, live migration and DR07 operational release remain unauthorized; ST14 is not started. Backend Engineering must independently review the final Draft PR and new exact-head receipt before owner-controlled Ready/Merge and any Planning closeout.
