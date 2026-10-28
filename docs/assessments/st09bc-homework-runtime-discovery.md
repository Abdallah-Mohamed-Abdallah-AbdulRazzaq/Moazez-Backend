# ST09-B/C Homework runtime discovery and execution checkpoints

Authority: Owner mandate dated 2026-10-28. Verified source before edits:
`0f55de8d875ba4e0ffb67514b3b8a6f3bc270c0e`, tree
`ff8b5b25da6eacd62b41da3453e2a256a6dc4c85`. ST09-A is accepted; its
inactive-runtime statements describe the prior stage, not a new restriction on
this explicitly authorized integration. Node 22.23.1 meets >=22.23.1 <23.
The primary checkout was clean, 0 ahead/0 behind; 122 registered worktrees
were inventoried and preserved. No existing ST09-B/C branch or PR was found.

This document records discovery before runtime edits. Planned tests below are
acceptance obligations, not claims that tests already passed.

## Request, persistence and response matrix

| Surface | Verified starting behavior | Required integration | Authority | Transaction boundary | Required proof |
| --- | --- | --- | --- | --- | --- |
| Core authoring | Questions controller -> question use cases -> HomeworkRepository; original-five DTO allowlist; metadata generic | Eight explicit types, entire typed definition replacement, separate tagged key writes | Existing assignments.manage, school/organization, live membership | ST06 ordered authorization then assignment/question locks, including creation without Rich | HTTP create/update/key privacy and revoked membership |
| Teacher authoring | Teacher wrappers resolve owned classId allocation before delegation; actor passed for questions | Preserve exact classId and ownership at final write; no new grants | Existing questions.manage and exact owned live allocation | School/grants -> allocation -> assignment -> question | Wrong class, foreign tenant and concurrent allocation revocation |
| Options | Use case guards choice types; non-Rich create writes directly; update type guard only in protected branch | All create/update/reorder/delete paths inspect current parent type while locked | Existing Core/Teacher manage authority | Same parent locks as type transitions | Typed parent cannot acquire legacy options, concurrent transition |
| Publication | Use-case preflight validates legacy options; repository locks assignment and rechecks types only | Complete definitions, compatible keys, active Rich/MEDIA references, current state and targets before writes | Existing assignments.manage, exact Teacher ownership | Author authority before assignment; stable question set before target/status writes | Invalid late question, concurrent update/delete/key/asset/publish and rollback |
| MEDIA | ST06 exact question bindings support managed READY and external HTTPS; Rich resolver accepts managed only | Narrow transaction-aware stimulus resolver reusing ST06 view/provenance/policy | Existing owner graph and actor; no bare File/upload/URL substitution | Existing asset/policy/session/File lock order; DB only | Managed/external positive; wrong/deleted/non-READY negative; actual protected bytes |
| Student read | Target-scoped read adapter, safe presenters, ST06 assets and ST08 Rich composition | Closed public definitions plus normalized saved answer; no private key in shared select | Live Student identity/enrollment/target and route permission | Bounded scoped reads, authoritative SQL-null evidence | Sentinel privacy, wrong target, invalid stored JSON |
| Single answer | Resolves draft separately; normalizes old types then repository target lock | Typed dispatch and preservation of omitted PATCH fields | answers.manage and live Student target | Assignment share -> target -> Student/enrollment -> draft submission; current definitions under same boundary | Wrong type, clear, optional partial, terminal and save races |
| Bulk answers | Sequential one-answer commits after separate draft creation | One governed batch transaction with duplicate check and late-failure rollback | Same live Student target and operation permission | Same target serialization, one submission and all answers | Mixed types, invalid last item, no partial submission/answers |
| Draft submission | Saves body then optionally loops answers | Atomic body + batch for requests containing answers | submissions.save, live target | Same Student writer order | Body/answer rollback, empty/incomplete drafts |
| Final submission | Inline answers commit before final transaction; final callback rechecks current state | Inline writes + authoritative persisted validation + terminal transition in one transaction | submissions.submit only; preserve ST08-C response correction | Same target/submission locks, authoritative active questions and SQL-null evidence | Both aliases, save/clear/submit races, duplicate submit and real final rows |
| Teacher review | Existing manual individual/bulk marking and rollup; response excludes new private fields | Normalize submitted typed answers, retain manual scoring and current review rules | submissions.view/review, exact allocation; review is not key management | Preserve final resource/state checks and serialize concurrent review rollup | Review-only key denial, upper bounds, two reviewers, release visibility |
| Parent | Linked-child, submitted answers only, reviewed fields only after REVIEWED; no Rich/assets | Recognize eight types, safe child structured answers; omit protected MEDIA source | Existing linked-child and school/enrollment ownership | Scoped read adapter, bounded SQL-null evidence | Wrong child, draft/review withholding, no key/Rich/bytes |
| Grade Sync | Existing Homework-owned adapter delegates to Grades score-based item use cases after review | Preserve existing manual scores and eligibility; no new scorer | Existing grade_sync permission and existing Grades boundaries | Existing Grade Sync operations | Eight-type reviewed score + existing Grade Sync regressions |

Source paths: `src/modules/homework/{controller,application,infrastructure,dto,presenters,domain}`;
`teacher-app/homeworks/application/teacher-homeworks.use-cases.ts`;
`student-app/homeworks/{application,infrastructure,presenters}`;
`parent-app/homeworks/{infrastructure,presenters}`. Shared Rich grammar, Grades
runtime, IAM seeds and provider storage code are protected.

## Lock-order and transaction map

| Operation | Acquisition order / final checks | Contention rule |
| --- | --- | --- |
| ST06 author and Rich mutation | School/organization and live grants -> allocation operational gate -> assignment -> question -> optional option -> asset -> policy -> upload session -> File | No allocation lock after an unprotected assignment lock. Existing discovery escalation rolls back before protected retry. |
| Typed authoring | Same protected author order even without Rich; current type/definition/key/relationships checked after parent locks | Metadata and key commit together; option mutations use the same parent serialization. |
| Publication | Live operation grant -> allocation -> assignment -> deterministic question/options -> referenced assets/policy/session/File -> eligible targets -> publication write | No external I/O; no nested independent transaction; reject stale lifecycle and validate before target writes. |
| Student writers | Live membership/grant before assignment share -> target update -> Student/enrollment share -> mutable submission update -> active questions share -> answer writes | The target exists before the first submission and serializes all saves/submit. Keep current bounded transaction budgets. |
| Final submit | Same Student order; attachment/File share as existing; persisted answers and authoritative `IS NULL` evidence before terminal writes | Inline answer writes roll back with validation or terminal transition failure. |
| Review | Authorize exact live reviewer resource before submission serialization, then answers and rollup | No allocation acquisition after holding an incompatible parent lock; current points/status revalidated. |

ST06 asset mutations already serialize against the assignment. Typed publication
must take that same lock; a preflight or UUID is never resource authority.
Provider operations, streaming, scanning and remote HTTPS fetches are excluded
from locked transactions. Tests must prove each possible serialization using
barriers and final database state, not arbitrary sleeps.

## Private exposure and endpoint permission map

| Audience/endpoint family | Existing required permission | Allowed new data | Forbidden |
| --- | --- | --- | --- |
| Core question create/PATCH | homework.assignments.manage | Validated public definition, separately normalized private key in author response | Raw Prisma spread, audit key/answer payload |
| Core question GET/list | homework.assignments.view | Public definition; key only after independent live management authority | A view grant must not imply key access |
| Teacher question create/PATCH | homework.questions.manage | Same, with exact classId allocation | Other teacher or assignment |
| Teacher question GET/list | homework.questions.view | Public definition; private data only with independent management authority | Review/view-only key access |
| Core/Teacher publish | homework.assignments.manage | Existing publication response and safe definitions | New grants or target scope expansion |
| Student PUT answers / PATCH answer | homework.answers.manage | Own normalized answerJson or MEDIA text | Key, correctness, other Student answers |
| Student PUT submission / POST draft | homework.submissions.save | Same with existing body/submission contract | Partial committed typed batch |
| Student POST submit and submission/submit | homework.submissions.submit | Existing terminal response and own answers | Requiring unrelated view/save permission after commit |
| Teacher answer/review | homework.submissions.view/review; Core final review retains homework.assignments.manage | Submitted normalized answer and existing manual review fields | New private key; automatic scoring |
| Parent child Homework detail | homework.assignments.view + homework.submissions.view | Child's submitted safe answers and released review only | Key, Rich AST, MEDIA source/bytes, draft answers |

All routes retain `/api/v1`, wrappers and methods. Existing ST06 asset list,
preview/download GET/HEAD and Range routes remain the sole protected stimulus
delivery path. Every byte request reauthorizes current actor, enrollment, target,
question, asset, READY provenance and policy. No generic files.downloads grant.

## Compatibility and rollout risk register

- Runtime type expansion needs client recognition of lowercase `fill_in_blank`,
  `matching`, `media`; no legacy impersonation. Source merge is not rollout.
- Keep legacy metadata and expectedAnswer behavior for original five types.
  For new types, reject expectedAnswer/options and reconstruct metadata.
- Key omission preserves only a compatible current key; explicit tagged clear
  maps to SQL NULL. Structural changes with stale keys fail atomically.
- Type transitions preserve UUID and reject existing incompatible options,
  answers or asset relationships; no historical deletion or backfill.
- PostgreSQL SQL NULL and JSON null are distinct. Fetch `IS NULL` facts in a
  bounded scope; invalid/future JSON is rejected/withheld without rewriting.
- Parent MEDIA source is omitted; Parent Rich/media authority is unchanged.
- Existing ST09-A inactive-runtime HTTP assertions need a documented transition
  to new positive lifecycle and retained unknown/malformed negative coverage.
  Pure foundation and migration tests remain protected.
- All 33 migrations/schema/manifest must remain byte-identical. No redundant
  migration, db push/reset/resolve, Production or shared DB use.
- DR07 remains pending and managed media release disabled in Production.
- BC-1 must pass before dependent BC-2; BC-3 must supply real PG/HTTP/bytes,
  concurrency, security, focused lint/build and fresh exact-head CI evidence.

## Final implementation scope audit

Publication's assignment lock also fences existing assignment-update and
target-resolution writers. Those two stale-read paths now recheck DRAFT under
that lock before replacing targets. Without this narrow change an earlier
successful read could overwrite targets after publication. No new target or
allocation policy is introduced.

The new transaction-aware Homework calls expose conservative source-auditor
edges through the unchanged allocation gate, persisted URL formatter and Rich
UTF-8 length intrinsic. `prd3-g01-b3-transaction-pressure.cjs` records only exact
Homework owner/path/helper/expression mappings with review evidence. The
concrete gate remains independently audited; global unresolved-call rejection,
external-wait detection, budgets and Required aggregation are unchanged. The
new `st09bc-homework-transaction-boundaries.test.cjs` verifies the bounded
mappings and the complete strict inventory. Real PostgreSQL tests separately
verify contention and final state rather than treating source annotations as
runtime proof.

CI changes register that one TAP owner and the four new Jest test files.
Existing planner/retirement assertions retain every prior owner, all historical
manual exclusions and exact assignment parity. The historical planner-byte
comparison removes only the literal, independently asserted new registration
before applying its original comparison. There is no workflow, routing
algorithm, Required aggregator or failure-classification change.

The final execution receipt records actual test, build, lint, CI and artifact
results. It remains separate from independent Backend acceptance and any
Production release decision.
