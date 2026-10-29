# ST10-B eleven-type Homework and Grades runtime contract V1

Authority: Owner/Planning mandate `MOAZEZ-ST10B-HOMEWORK-GRADES-ELEVEN-TYPE-RUNTIME`, 2026-10-29. Authorized base: `460f706c137a1d793b2e78ab216e1a40a07001c7`. This authorization supersedes the historical ST10-B no-activation statements in ADR-0022/ST10-A documentation; the accepted shared mathematics, limits and migration remain unchanged. One Draft PR is authorized; Ready, merge, deployed migrations, Production activation and ST11–ST14 are not.

## Source discovery and ownership

| Domain / entry point | Existing behavior | ST10-B extension | Authority / transaction | Storage and risk | Executable evidence |
| --- | --- | --- | --- | --- | --- |
| Shared `common/question-evaluation` | Closed ST10-A definitions/keys/answers and bounded exact comparison | Reuse unchanged | Pure; no DB, scope or grading | Versioned values, no marks | Original four shared suites, domain adapter suites |
| Homework `normalizeHomeworkTypedQuestionMutation` / `questionMutation` | ST09 closed metadata replacement and retained-key validation | Explicit three-type adapters | Existing live management grant, allocation, assignment/question locks | metadata/answerKey; stale retained key | Authoring HTTP and adapter tests |
| Homework `publishAssignmentWithTargets` | Locked current definitions, keys, targets, assets and lifecycle | Include all six structured interactions | Existing allocation-first publication transaction | SQL NULL key evidence, no stale snapshot | Publication rollback and update/key races |
| Homework `normalizeAnswerForQuestion` / `mutateTypedStudentSubmission` | Atomic mixed saves and final persisted-answer checks | Three new structured types use the same path | Live Student grant, target/enrollment and existing lock order | answerJson, explicit SQL-null evidence | Single/bulk/submit, revocation and concurrency tests |
| Homework typed projections/review | Author keys isolated; protected answer queries; manual review | Reconstruct new closed definitions/answers | Author management separate from review/linked-child access | No private fields in shared selects | Student/reviewer/Parent HTTP, explicit Grade Sync |
| Grades question use cases/repository | Legacy metadata extras/patch merge, locked effective validation | Closed whole ST10 replacements and canonical key validation | Existing question-management permission and assessment mutation guard | metadata/answerKey; no stale merge/key | HTTP, direct malformed-data security and adapter tests |
| Grades publication | QUESTION_BASED locked validation; independent SCORE_ONLY | Validate all eleven definitions and configured keys | Existing publish grant and lock hierarchy | JSON null key rejected, SQL NULL manual | Publication rollback, definition/key races; old SCORE_ONLY regressions |
| Grades submissions / Student Exams | Locked single/bulk saves, stored-answer validation, manual review | ST10 draft/final normalization and canonical persistence | Existing exact submission/Student/enrollment authority and locks | answerJson; distinguish SQL NULL from JSON null | All six combinations, mixed eleven-type rollback, review/finalize race |
| Grades shared presenters / Student Exams / Student Grades | Explicit interaction identity and safe answers | Three distinct interactions; bounded SQL-null fact projection | Existing audience-authorized read models | No private-key selection; no raw JSON fallback | Typed read/clear tests and malformed stored-data security |
| Teacher Classroom Grades submission detail/review | Historical eight-type answers returned through existing reviewer DTOs | Normalize only the three new types and add their canonical interaction | Existing exact owned allocation and review permissions, unchanged mutation locks | Public metadata only; malformed JSON/text withheld | Three real Teacher Classroom HTTP read/review/finalize cases, wrong-teacher denial |

Homework and Grades keep independent repositories, lifecycle rules, authorization and synchronization. The new Grades SQL-null projection is needed because its existing nullable Prisma JSON value alone cannot distinguish a valid clear from malformed persisted JSON null. It reads only nullness for already-authorized answer identities, in bounded batches, into an internal WeakMap. It adds no schema/API field or key selection. Student Grades and Teacher Classroom Grades are included for affected read-model consistency. Teacher Classroom changes preserve the historical eight-type shapes and add canonical interactions only for the three newly activated types.

## Explicit runtime catalogs

Homework: `SHORT_TEXT`, `LONG_TEXT`, `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TRUE_FALSE`, `FILL_IN_BLANK`, `MATCHING`, `MEDIA`, `ORDERING`, `NUMERIC`, `MATH_EXPRESSION`.

Grades: `MCQ_SINGLE`, `MCQ_MULTI`, `TRUE_FALSE`, `SHORT_ANSWER`, `ESSAY`, `FILL_IN_BLANK`, `MATCHING`, `MEDIA`, `ORDERING`, `NUMERIC`, `MATH_EXPRESSION`.

Both catalogs remain explicit allowlists. Unknown/future type names remain refused by DTO/domain boundaries and receive unsupported presentation. The eight historical interactions retain their definitions, aliases, answer formats, metadata handling, option identities and manual marking rules. No type is disguised as text/essay/choice.

## Exact ST10-A data contracts

| Type | Public metadata / Grades interaction definition | Private key | Student answerJson |
| --- | --- | --- | --- |
| ORDERING | `{definitionVersion:1,kind:"ordering",items:[{id,displayOrder,label}]}` | `{keyVersion:1,kind:"ordering",expectedItemIds:[...]}` | `{orderedItemIds:[...]}` |
| NUMERIC | `{definitionVersion:1,kind:"numeric",units:{required,allowedCodes,allowUnitless}}` | `{keyVersion:1,kind:"numeric",reference:{value,unitCode},policy?:...}` | `{value:string,unitCode:string|null}` |
| MATH_EXPRESSION | `{definitionVersion:1,kind:"math_expression",variables:[...]}` | `{keyVersion:1,kind:"math_expression",expression:string}` | `{expression:string}` |

All shapes are closed and versioned, reconstructed through the unchanged ST10-A normalizers. Ordering has at most 50 stable IDs and 1,000-character labels, unique display positions, and a complete private permutation. Display order never supplies an answer. Numeric uses exact bounded decimal strings (64 input characters, 34 significant digits, written exponent ±100), including the approved Arabic digit/separator normalization. Policies remain EXACT, ABSOLUTE_TOLERANCE, RELATIVE_TOLERANCE and EXPLICIT_ACCEPTED_RANGE with their existing exact bounds. Missing policy is manual-only; malformed configured policy is rejected. There is no implicit epsilon, rounding, unit conversion or floating-point correctness decision.

Math uses the existing grammar and parser/evaluator budgets unchanged: length 512, tokens 128, nodes 256, depth 32, eight variables, integer powers within ±16, and rational numerator/denominator/operation caps of 4096. Private `x/0`, `x/(2-2)`, `x+1/0` and `x+0^0` remain invalid. Symbolic equivalence remains manual, including `x/x` vs `1` and `x+x` vs `2*x`. Proof exhaustion remains unknown. The shared evaluator retains distinct `UNDEFINED_EXPRESSION` and syntax-invalid outcomes. Student syntax normalization and technical proof are separate: a syntactically accepted undefined expression may be saved for manual review, but no ordinary equivalence claim or mark is produced for it.

## Authoring, keys and publication

Metadata for a new type is a complete closed replacement, never a legacy extras patch. Omission preserves the locked current definition. An omitted key is retained only after revalidation against that effective definition. Changing Ordering IDs, Numeric units or Math variables rejects a stale retained key, or accepts an explicit compatible replacement/clear atomically. A display-only Ordering reorder preserves IDs and the independently configured sequence. New types reject legacy options and incompatible expected answers. Unsafe type changes must deliberately replace incompatible metadata/key state and respect existing relationship, submission and lifecycle guards.

Homework preserves tagged `answerKey:{state:"value",value:key}` and `{state:"clear"}` writes. Raw null is not a tagged clear. Grades preserves its plain `answerKey:key` / explicit `answerKey:null` API. For the three new Grades types, that explicit clear and initial missing key write SQL NULL; the historical eight-type JSON helper is unchanged. Stored JSON null is not a valid new-type manual key. Neither domain silently clears an invalid configured key.

Complete publication validation runs again in the existing locked repository transaction, with current permission/resource/lifecycle, definitions, key consistency, options and targets. Grades preserves question points/maxScore and SCORE_ONLY behavior. Homework preserves targets, deadlines, Rich AST and ST06 media authority. An incomplete Ordering/Numeric draft cannot publish. Math with no variables is a valid constant-only definition; no invented incompleteness rule is added. No network/storage work or new lock ordering is introduced.

## Student Draft, save and Final

Homework uses its existing isDraft/final flags, clear operation and target-serialized typed writer. Grades uses IN_PROGRESS saves and its existing final-submit transition; no Homework isDraft field is copied into Grades. The new structured adapters accept bounded valid partial Draft objects. A supplied Final answer must be complete even on an optional question. Optional absence is valid; required absence is not.

Homework omission in a partial PATCH preserves a valid current structured answer. Explicit `{clearAnswer:true}` clears to SQL NULL; raw answerJson null remains invalid. Grades uses an explicit answerJson null (with no incompatible text/options) to clear a new structured answer to SQL NULL; an omitted answerJson/empty new-type save request is invalid, rather than an implicit clear. Both domains reject nonempty incompatible text/selected options and foreign or duplicate identities.

A final submission revalidates actual persisted answers and current definitions inside the existing lock. SQL NULL is absence; persisted JSON null/future/malformed supplied content is invalid, including optional supplied content. No read repairs data. Grade read models and pre-submit checks carry the separately obtained internal SQL-null fact so a valid clear is neither rejected nor presented as malformed. The repository obtains fresh null facts again at final mutation/review boundaries.

All new Homework types participate in `mutateTypedStudentSubmission`, including mixed legacy/new batches and first-draft creation. Grades retains its assessment/submission mutex, complete batch validation and selected-option replacement transaction. Rejection leaves no partial answers or unauthorized state. Save/submit, bulk/submit, concurrent bulk, replay and terminal-state protections remain.

The strict transaction inventory now reaches the unchanged ST10-A `bits(n: bigint)` helper. Its `abs(n).toString(2).length` conversion is synchronous bounded computation, not external work. Fourteen observed transaction owners receive exact path/owner/helper/expression audit records, with a focused governance assertion preserving all previous ST09 records, zero unresolved calls and zero external waits. No global intrinsic exemption, transaction classification, runtime timeout or lock-order change is introduced. This minimal CI governance addition is required by the new runtime call graph.

## Audiences, manual review and synchronization

Student receives canonical public definitions, authorized saved answers, existing lifecycle and released review data. Parent remains linked-child/release scoped; no Rich/Media capability is added. Authorized reviewers receive normalized submitted typed answers. Review authority alone does not grant author-private key access. Shared Student/Parent selections never add answerKey, expected sequences, Numeric references/tolerances or Math references.

Runtime adapters normalize contracts; they do not consult comparison outcomes to award marks. No new correctness outcome is projected to Student, Parent or reviewer APIs. No awardedPoints/awardedMarks, correction completion, grade synchronization or Grade Item synchronization is triggered by technical equivalence/difference/undefinedness. Existing explicit manual review, point bounds, rollup, finalization and explicit synchronization endpoints remain authoritative. No persistent evaluation-result field or event is introduced.

Malformed stored values are withheld or refused through existing domain contracts, without raw JSON/text fallback. Grades interaction presentation reports supported=false/definition=null when the public definition/answer is invalid. Homework retains its existing typed error/withholding rules. Validation diagnostics contain fixed reasons/field names, never rejected keys, expressions or Student payloads.

## Verification, compatibility and operational limits

New executable suites: Homework/Grades ST10-B adapters; `st10b-authoring-publication`, `st10b-student-review`, `st10b-concurrency` and `st10b-eleven-type-runtime` HTTP/PG suites. They cover all six combinations, explicit clear/stale key rollback, malformed optional JSON, exact typed projections, legacy/new mixed atomicity, existing manual sync and observed PostgreSQL lock dependencies. Existing ST10-A no-activation tests are updated only for the authorized activation: all future-name, malformed-definition/key, mutation refusal, privacy and rollback protections remain. Both CI source-inventory tests register the six new test files with their existing unit/E2E owners; routing, Required policy and manual/historical ownership are unchanged.

The final engineering receipt records actual focused/legacy/security/integration counts, build/postbuild, non-mutating exact-base lint comparison, immutable migration verification, clean task source, normal commit/push, Draft PR and fresh exact-head Required artifact integrity. This contract is not an independent Reviewer Receipt. Whole-repository lint and standalone root typecheck remain uncertified unless separately proven.

No schema, migration, manifest, permission seed/grant, public route, shared mathematical semantics, media release, storage policy, Production setting or frontend/mobile source is changed. The 34-migration chain is a mandatory deployed prerequisite, not deployment authorization. Backend source support does not prove old client compatibility. See [client handoff](st10b-client-api-handoff.md); clients must explicitly support the distinct new interactions before separately authorized rollout.
