# Post-closeout Homework review integrity repair

Authority: `MOAZEZ-HA-V1-POST-CLOSEOUT-REVIEW-INTEGRITY-REPAIR`, starting
`main` `46cf4256a6ae48193279414e130053fe20ddae26`. This is one bounded repair,
not another modernization stage. Backend Engineering review and Planning
reacceptance remain pending. Ready, merge, Production, live migrations and
DR07 enablement are not authorized.

## Confirmed findings and correction

| Finding | Independently observed before repair | Correction |
| --- | --- | --- |
| HA-AUD-01 | Authenticated legacy reviews left answers 4 and 5 with stored total 5. An omitted points field cleared the latest points to null through DTO transformation. A points-only request lost the latest comment. | Preserve actual own-property intent through DTO transformation; write only supplied fields; aggregate current non-deleted answer points in the locked transaction. |
| HA-AUD-02 | An initially authorized request wrote after competing Finalize/Cancel or authorization revocation. Explicit stale finalization persisted 0 while current answers summed to 4. | Apply the same current authorization, identity, lifecycle and parent-to-child locking fence to legacy, typed, mixed and response-configured reviews and finalization. |
| HA-AUD-03 | Real PostgreSQL Audit insertion faults produced HTTP 500 while Single/Bulk answer changes or finalization status remained committed. | Insert mandatory success Audit through the existing `createAuditLog(entry, tx)` API before the same transaction commits. |
| HA-AUD-04 | Custom Core School/Organization manage-without-review roles succeeded on legacy Homework but received 404 on typed Homework. | Select Core manage versus Teacher review permission from the trusted actor, independently of type, response configuration or finalization lifecycle. |

No finding was disproved. The supplied method-double reproduction was treated
as source evidence only. RED fixtures ran against the exact starting source
using the established authenticated NestJS harness and fresh, task-owned
PostgreSQL, Redis and MinIO resources. Historical shared resources were not used.

## Transaction and compatibility contract

The existing authorization service locks current organization/school,
membership and permission grants, then the Teacher allocation where applicable
and assignment parent. Review reuses the Student writer's target/live
student/enrollment/submission order before exact answer/question checks.
Current question bounds, required review completeness and File/Audio validity
are revalidated. Duplicate or mismatched identities and unexpected update counts
fail atomically. Actual current SQL totals, submission/target changes and safe
success Audit belong to one transaction. No storage or network operation was
added under these locks.

Omitted review fields retain current committed values. Explicit null, zero and
whitespace normalization retain their existing meaning. `declare` on the two
optional review DTO properties prevents JavaScript class initialization from
manufacturing an own undefined property for omitted JSON fields. Public fields,
routes, envelopes and exception classes are unchanged.

Zero-question graded Homework retains bounded manual assignment marks;
ungraded Homework retains null marks and rejects supplied marks. Multipart
rollups count canonical child answers. Finalization preserves explicit-total
equality, already-reviewed and not-reviewable rules. No GradeItem sync, XP,
AnswerKey disclosure, default role grant or question/response mode change was
introduced.

The transaction-pressure source inventory registers only the two exact new
`input.audit` callback owners. This is necessary for its existing fail-closed
call-graph validation: the callbacks resolve solely to the existing database
Audit insert on the supplied transaction. No generic callback exemption,
transaction-budget change, workflow, routing or aggregator change was made.

The first exact-head CI exposed one inherited inventory assertion that counted
all later approved test additions explicitly. Its existing list now also names
this repair's E2E file, asserts its unique pull-request/E2E ownership and includes
it in total/active counts. Baseline retirement obligations, ten manual owners,
planner equivalence and every other assertion remain intact. This test-only
registration reflects the authorized new file; discovery/routing is unchanged.

## Executed verification and evidence ownership

The focused new PostgreSQL/HTTP suite covers 65 cases: all four fixture kinds,
distinct-answer and omitted-field races, aggregate ceilings, Review versus
Finalize/Cancel, membership/permission/allocation revocation, stale explicit
finalization, exact identities/update counts, groups, zero-question marks and
real Audit/answer constraint failures. Lock ordering is demonstrated through
measured `pg_blocking_pids` dependency graphs. An Audit insertion trigger barrier
also proves competing Finalize/Cancel waits for the complete Review/Audit
transaction. Test-only SQL fault objects are removed after each case.

The restricted positive fixtures assert the actual current custom role and keep
only the appropriate write permission plus the two existing read grants. Teacher
Core access, unowned and cross-tenant access remain denied. The existing pinned
Linux audio suite additionally reviews and finalizes actual verified Homework
MP3/M4A/WebM answers; its runtime result is certified by exact-head media CI,
not by the Windows host.

Affected existing HTTP/security suites cover review completion, all eleven
question types, File-only review, explicit Grade sync, read disclosure,
unsupported definitions and authoring/concurrency. Focused Unit tests cover
transaction-bound Audit and property presence. Existing transaction-pressure
contracts also run unchanged. Build and its bootstrap contract pass.

Focused non-mutating lint uses the identical starting source tree, locked
dependencies and ESLint configuration, comparing diagnostic multiplicities by
file/rule/severity/message. Baseline: 203 errors/59 warnings; candidate: 171
errors/59 warnings; introduced: zero. Raw ESLint exits nonzero for inherited
diagnostics. Whole-project standalone lint/typechecking is not certified by
this focused comparison.

All 39 migration SQL checksums, Prisma schema, migration manifest, default role
seeds, Grades implementation and historical ST13/ST14 evidence remain unchanged.
A fresh disposable full migration replay, Prisma status, second-deploy no-op
and migration governance checks pass.

Machine-readable RED/GREEN, lock, lint, replay, protected-source, cleanup and
exact-head GitHub job/artifact receipts are retained outside the source tree in
the task-owned `homework-review-integrity-evidence-20261102` directory. The final
engineering handoff and Draft PR identify the actual candidate SHA, CI run,
attempt, complete test-file parity and independently verified Required Artifact
SHA-256. Prior-stage CI is not final evidence for this repair.
