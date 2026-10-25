# ST08-A Safe Rich AST V1 implementation contract

Status: shared foundation for independent Backend review. Source authority:
`0f28b3ae637670b0db1e5ccab0f90259b25e40e2`. Owner order 2026-10-26, unit A
only. Both planning references were available locally; their historical register
does not supersede current authority. Q11/Q12/Q15 are narrowed here to pure
contracts and nullable persistence. No authoring HTTP input, presenter activation,
frontend editor, ST08-B/C, new question type or answer/scoring behavior.

## 1. Source-backed discovery and risk matrix

Paths are repository relative; source observations precede implementation.
HW = Homework; GA = Grades Assessment. Tests in the last column are existing
regression owners or the new proof, not claims of execution before verification.

| Capability | Current source path | Current behavior / consumer | Classification | ST08 requirement | Security risk | Legacy risk | Unit | Persistence impact | Test evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HW stem/instructions | prisma/schema.prisma; homework/dto/homework-question.dto.ts | prompt/instructions/expectedAnswer/metadata; 8000/4000 limits | ALREADY_IMPLEMENTED | Preserve text; add isolated rich storage | Never mix expectedAnswer into display | Old rows must read with NULL AST | A storage, B integration | Nullable question JSON | safe-rich-content-persistence; homework-questions-attachments.use-case |
| HW choices | homework/domain/homework-question-inputs.ts; infrastructure/homework.repository.ts | text/correctness/order/metadata; actual option UUID; 1000 limit | REUSE_REQUIRED | Rich label on actual option row | Correctness is private | Reorder/update/delete must keep identity | A contract, B writes | Nullable option JSON | AST association/fallback; existing HW tests |
| HW mutations | homework/application/homework-questions.use-cases.ts; controller/homework-questions.controller.ts | DRAFT guard, explicit display patch, audit; no rich field | REUSE_REQUIRED / RISK | Future atomic text+AST update at final authorized boundary | Pre-read alone cannot authorize a future write | Legacy edit must clear stale rich envelope | B | No current write activation | Existing HW question use cases |
| HW author/student | homework/presenters/homework-question.presenter.ts | Explicit Admin/Safe projection; expectedAnswer/isCorrect gated | REUSE_REQUIRED | Separate display-only AST projection | No whole-record spread | Preserve exact legacy DTO shape in A | B | Existing select omits new columns | HW presenter/use-case regression |
| GA question text | grades/assessments/dto/grade-assessment-question.dto.ts | prompt/promptAr aliases; both 5000; private explanation/answerKey | ALREADY_IMPLEMENTED | Separate rich stem translations | Answers/explanations forbidden in AST | Alias and bilingual limits remain | A, C | Nullable question JSON | AST fallback; grade-assessment-question.presenter |
| GA interaction | grades/assessments/domain/grade-question-interaction.ts; grade-question-domain.ts | Eight canonical types; blank/segment/matching/media definitions and scoring inputs | REUSE_REQUIRED | Keep AST separate from interaction and answers | Public sanitizer is not strict AST validation | No blank/matching ID or answer-mode changes | C | Do not repurpose metadata | grade-question-interaction; question use cases |
| GA content policy | grades/assessments/domain/grade-question-content-policy.ts | Bounded URL validation and metadata public filtering | RISK | New strict closed AST boundary | Loose JSON is not an executable-content contract | No historical text rewrite | A | Independent JSON | AST adversarial tests |
| GA option identity | grades/assessments/infrastructure/grades-assessment-questions.repository.ts:replaceOptionsPreservingIdentity | Explicit ID lookup; legacy sort-order lookup when ID absent; duplicate/foreign IDs rejected; unused rows retired | REUSE_REQUIRED | Future rich edits require exact stable option ID | Never associate new rich label by index/order/text | Keep existing replacement semantics | C | Column follows stable row | Persistence stable-ID proof; GA question tests |
| GA create/update | grades/assessments/application/create-grade-assessment-question.use-case.ts; update-grade-assessment-question.use-case.ts | Normalize legacy data; merge interaction metadata; scoped repository guards | RISK | Domain transaction owns future source-of-truth updates | Generic metadata namespace collision/exposure | Preserve partial updates and structural guards | C | Dedicated column avoids merge collision | GA question use cases |
| GA author/review | grades/assessments/presenters/grade-assessment-question.presenter.ts; grades/shared/presenters/grade-question-contract.ts | Explicit authoring flags, eight canonical interactions, sanitized reveal | REUSE_REQUIRED | Validate stored AST independently, retain reveal rules | No generic Author/Student presenter in A | Unsupported stored types retain safe legacy behavior | C | Existing selects omit rich | GA/Student presenter tests |
| Student HW | student-app/homeworks/infrastructure/student-homeworks-read.adapter.ts; presenters/student-homeworks.presenter.ts | Target/current active enrollment and PUBLISHED/CLOSED audience | REUSE_REQUIRED | Future authorized rich projection and asset resolution | No IDs-only authorization | Existing answers/attachments untouched | B | Select rich only when integrated | Student HW regression |
| Student Exams | student-app/exams/infrastructure/student-exams-read.adapter.ts:assertAssetAccess; presenters/student-exams.presenter.ts | Exact live enrollment including term; exam-specific assessment audience | REUSE_REQUIRED | Keep final term and subject/audience checks | Never substitute broader Grades audience | Preserve exam submission/scoring | C | Deferred read selection | ST07 term and Exams regressions |
| Student Grades | student-app/grades/infrastructure/student-grades-read.adapter.ts:assertAssetAccess; presenters/student-grades.presenter.ts | Exact current term/enrollment; broader legitimate assessment types | REUSE_REQUIRED | Separate Grades audience | Exams filter is not this access contract | Preserve grade release/reveal | C | Deferred read selection | ST07 term and Grades regressions |
| Teacher HW / review | teacher-app/homeworks/application; teacher-app/classroom/grades/presenters/teacher-classroom-submission-review.presenter.ts | Owned allocation wrapper; domain questions and authorized review | REUSE_REQUIRED | Future use existing transaction/access and reveal | Do not add teacher Grades authoring rights | Keep status/submission/grade sync | B/C | No current change | Teacher/HW/Grades regression |
| Existing assets | HomeworkQuestionAsset, GradeAssessmentQuestionAsset, GradeAssessmentAsset; homework/infrastructure/homework-question-assets.repository.ts; homework-question-asset-authorization.ts; grades/assessments/infrastructure/grade-assets.repository.ts | Normalized exact-parent bindings; READY provenance; private policy; metadata and resource paths | REUSE_REQUIRED | AST references question assets only | UUID shape is not authority; assessment-wide ID is not question asset | Deleted/stale refs must fail safely | A shape, B/C resolver | No new FK or media identity | ST06/07 asset regressions |
| Private bytes/lifetime | files/assessment-media; files/shared; infrastructure/storage/private-media-content.service.ts | Verified private bytes, resource reauthorization, retained references, disabled DR07 release | ALREADY_IMPLEMENTED | Retain all boundaries | No keys/URLs/tokens or generic File capability in AST | No deletion/reference refund | A contract, B/C integration | No File/asset change | Existing ST05/06/07 suites |
| Shared rich contract | common/rich-content | Previously absent | MISSING | Pure V1 validation/normalization/fallback/update primitives | Hostile JSON, complexity, Unicode, privacy | Deterministic fallback within real DTO limits | A | Four isolated nullable columns | rich-content.spec.ts |
| Persistence | schema.prisma; ADR-0019 | Metadata already carries unrelated semantics | DECISION_REQUIRED → RESOLVED_BY_ORDER_9_1 | Choose B after comparison below | Avoid metadata collisions | No defaults/backfill/historical rewrite | A | One additive generated migration | Real PostgreSQL/null tests and replay |

Module paths above begin with `src/modules/` unless schema, common or test paths
are indicated. Full source implementation is unchanged outside common and the
four nullable fields. No parallel HW/GA subsystem is introduced.

## 2. Envelope and exact V1 schemas

Canonical TypeScript unions: `src/common/rich-content/rich-content.types.ts`.
Required properties are unmarked; `?` means omission is allowed, never JSON null.
All objects reject every unlisted own property, accessor and symbol property.
All lists below are dense, nonempty arrays. Every shape has at most five properties.

```text
Question = {contentVersion:1, kind:"question", stem:Document,
            instructions?:Document, stemAr?:Document}
Option   = {contentVersion:1, kind:"option", label:Document, labelAr?:Document}
Document = {language:"ar"|"en"|"und", direction:"rtl"|"ltr"|"auto", blocks:Block[]}
Block    = {type:"paragraph", children:Inline[]} | Math(display="block")
Inline   = Text | LineBreak | Strong | Emphasis | Expression | Math(display="inline")
           | Chemistry | AssetReference
Text     = {type:"text", text:string, language?:"ar"|"en"|"und",
            direction?:"rtl"|"ltr"|"auto"}
LineBreak = {type:"lineBreak"}
Strong/Emphasis = {type:"strong"|"emphasis", children:Inline[]}
Expression = Text | {type:"subscript"|"superscript", children:Expression[]}
             | {type:"fraction", numerator:Expression[], denominator:Expression[]}
             | {type:"radical", radicand:Expression[], degree?:integer[2,16]}
Math = {type:"math", display:"inline"|"block", children:Expression[], altText:string}
Chemistry = {type:"chemistry", reactants:Species[], products?:Species[],
             arrow?:"yields"|"equilibrium", altText:string}
Species = {coefficient:integer[1,999], elements:ElementCount[],
           charge?:integer[-8,8], state?:"s"|"l"|"g"|"aq"}
ElementCount = {element:periodic-symbol, count:integer[1,999]}
AssetReference = {type:"assetReference", assetId:UUID, kind:"image"|"audio"|"video"|
                  "document"|"other", altText:string, caption?:string}
```

Products and arrow are either both present or both absent. The symbol allowlist
is the 118 exact case-sensitive element symbols H through Og in source. Species
are display data, not a solver or assertion that a reaction balances. Grouped
formula terms, isotopes and reaction conditions are deferred. Count/charge/
coefficient are finite safe integers; negative zero normalizes to zero.

Math Text is one identifier (`Unicode letter` followed by letters/numbers), one
Latin/Arabic-Indic/Eastern-Arabic number with optional decimal and e/E exponent,
or one allowlisted operator/sign. Fraction/radical/script grouping is structural;
delimiters, arbitrary command strings, TeX, macros and external-resource syntax
are unsupported. Sequences are display fragments, not an arithmetic parser or
automatic scorer. Ordinary prose may still contain equations as escaped text.
No KaTeX/MathJax/parser dependency, network load or executable grammar is added.

## 3. Canonical security boundary and limits

`normalizeRichContent(unknown)` performs descriptor-only bounded JSON inspection
then strict schema reconstruction in fixed property order. It returns fresh
objects and arrays, retaining no source aliases. No getter/toJSON is invoked.
Depth is checked before recursion. Input sharing is counted per occurrence;
ancestor cycles are rejected. Object prototype must be exactly Object.prototype,
array prototype exactly Array.prototype. Null-prototype/custom/class instances,
sparse or extended arrays, symbols, functions, BigInt, undefined, non-safe-integer
numbers and all dangerous prototype keys fail. Unknown fields are rejected,
never silently stripped. JSON null is not a valid document or optional property.

| Constant | Value | Meaning / rationale |
| --- | ---: | --- |
| MAX_UTF8_BYTES | 65536 | Compact JSON UTF-8 including escaped strings, property names and syntax; covers 8000 Arabic UTF-16 units plus structure and short instructions |
| MAX_TOTAL_NODES | 1024 | ALL object/array containers, including document/envelope/chemical support data, not just discriminator nodes |
| MAX_NESTING_DEPTH | 16 | JSON property/index edges, root depth zero; bounded recursive stack |
| MAX_TEXT_LENGTH | 8000 | UTF-16 units per text primitive; the widest existing HW prompt limit; destination fallbacks separately enforce 5000/4000/1000 |
| MAX_MATH_COMPLEXITY | 512 | Aggregate Expression nodes across every math/script/fraction/radical in the envelope |
| MAX_CHEMISTRY_COMPLEXITY | 256 | Aggregate Species plus ElementCount objects across all chemistry nodes |
| MAX_ASSET_REFERENCES | 8 | Occurrences across all documents, even repeated IDs; no relaxation of resource-policy limits |
| MAX_NODE_PROPERTIES | 5 | Largest actual V1 object schema; no arbitrary properties |
| MAX_ACCESSIBLE_TEXT_LENGTH | 1000 | Each altText/caption, nonblank; compatible with option fallback budget |

The inspector measures one length-bounded string at a time, checks a running byte
budget and container count, and never stringifies/clones an unbounded input.
Schema traversal receives only the bounded safe copy. `serializeRichContent`
always normalizes before JSON.stringify. `parseRichContentJson` bounds raw UTF-8
and lexical JSON nesting before native JSON.parse, then invokes the same boundary.
Wire JSON uses native JSON.parse duplicate-member semantics; applications should
send canonical serialized JSON. No consumer may interpret a second parser's raw
members or treat normalization as authorization. Executable JS Proxies are not
a supported network data model; callers must not construct hostile executable
objects in-process. Descriptor-based ordinary-object attacks are tested.

Strings are escaped data, never trusted markup. Reject HTML/XML-like tags,
script/SVG/iframe constructs, handlers/CSS assignments, encoded angle-markup,
backslash commands, unsafe schemes and URL/provider capabilities. V1 has no URL
node and forbids network URL tokens, including HTTPS, in rich display strings;
ordinary external sources remain existing separately authorized asset bindings.
Plain comparisons `x < y`, `x<y`, `y > 2`, `≤`, `≠` are accepted. Backend emits no
HTML, executes no expression and fetches nothing. Private/correctness fields are
unlisted even inside nested nodes, so they fail rather than becoming Student data.
Human-authored display text cannot mechanically prove pedagogical secrecy; domain
authors/reveal rules still own what teachers intentionally write as visible text.

## 4. Unicode and RTL/LTR

Preserve Arabic letters, joiners, diacritics, signs, Arabic-Indic/Eastern-Arabic
and Latin digits without numeric conversion, NFC/NFKC rewriting or transliteration.
Reject lone surrogates, disallowed C0/C1 controls, BOM and Unicode bidi formatting
controls (including balanced sequences, isolates and deprecated controls).
Language/direction fields replace raw bidi commands. LF/CR/tab are escaped data.
Renderers must isolate each directional fragment using their platform's safe text
APIs (`bdi`/equivalent with explicit dir/lang), never user CSS/HTML. Do not reverse
strings, reorder numeral characters or concatenate fragments without isolation.
No renderer implementation is part of this unit.

## 5. Rich field mapping and legacy fallback

| Stable entity | Column envelope | Display mapping / limits |
| --- | --- | --- |
| HomeworkQuestion | Question | stem → prompt 8000; instructions → instructions 4000; stemAr forbidden for this adapter |
| HomeworkQuestionOption | Option | label → text 1000; labelAr forbidden |
| GradeAssessmentQuestion | Question | stem → prompt 5000; stemAr → promptAr 5000; instructions forbidden |
| GradeAssessmentQuestionOption | Option | label → label 1000; labelAr → labelAr 1000 |

Each legacy field still exists. `questionTextEn/Ar` and `textEn/Ar` remain existing
API aliases; no new write is activated. `value`, `answerKey`, `canonicalType`,
interaction, points, required, expectedAnswer, all metadata and option identity
are never read or generated by fallback. Fill blanks and matching IDs remain in
their existing domain contract, outside the display AST.

`richContentFallback` first validates the envelope and entity association.
Concatenate text and strong/emphasis children; LF for lineBreak and between
blocks; `_(...)` / `^(...)` for scripts; `(numerator)/(denominator)`; `sqrt(...)`
or `root[n](...)`; explicit chemistry counts, charge signs, states, coefficients,
`+`, `→`/`⇌`; `[altText — caption]` for assets. No UUID/URL/File/answer is emitted.
Trim outside whitespace only. Reject blank or over-limit fallback, never truncate.
Destination length mirrors the installed class-validator/validator.js MaxLength
algorithm, including surrogate pairs and presentation-selector sequences.
Conservative per-primitive UTF-16 limit still applies.
Rich content can exceed a target's fallback limit; such content cannot be written
through that target adapter. All math/chemical essential notation is retained.

## 6. Source-of-truth and update rules

Pure `planRichContentChange` returns a future transaction plan; no repository is
wired to it yet. No per-row or partial AST merge is supported.

| Operation | Deterministic rule |
| --- | --- |
| Legacy-only create | Existing legacy fields; SQL NULL richContent |
| Rich create/update | Validate full envelope, validate target, derive every associated fallback, atomically persist together after existing final access/lifecycle checks |
| Legacy display edit on rich row | Apply explicitly supplied legacy fields and clear the WHOLE associated rich envelope to SQL NULL; preserve untouched legacy fields |
| Legacy unrelated edit (points/order/etc.) | Preserve rich; no display patch |
| Explicit clear | SQL NULL rich; retain current legacy text (new legacy patch handled by legacy mode) |
| Omitted update | Preserve rich and legacy; do not emit an UPDATE value |
| Empty legacy patch | Preserve; no implicit clear |
| Historical no-AST row | Read legacy using current authorized presentation |
| Invalid/future stored AST | Withhold rich; keep stored bytes; use existing safe legacy presentation when authorized; do not echo rejected JSON or repair/delete/backfill |

A simultaneous rich and legacy payload is resolved by the future adapter before
calling the pure discriminated plan: rich is authoritative and generated fallback
must agree with any supplied legacy field, otherwise reject. Do not silently
choose contradictory strings. For translated rich edits missing translation
produces explicit null fallback, preventing stale translated text. An update
never changes grading identity. New rich option content must bind to exact
existing question+option row ID, never index, sort order or text. Reordering keeps
the row's content; retiring/deleting an option keeps its history and must not
expose it to students. Existing GA replacement behavior is not changed here.

## 7. Persistence comparison and migration decision

ADR-0019 was written before schema changes. Its comparison covers source of
truth, versioning, metadata collision, validation, legacy reads, privacy,
identity, partial updates/clear, transactions, parity, release order, integrity,
compatibility and extensibility. Option A is unproven: Grades metadata owns live
interaction definitions and merges/public sanitization; Homework has no reserved
namespace. **Option B** isolates display content in exactly four nullable
`richContent Json? @map("rich_content")` fields. No mandatory default, backfill,
row rewrite, index, new type, FK, privilege or automatic API exposure.

One Prisma-generated additive migration adds four JSONB columns. Review before
application; historical migrations remain immutable. Manifest generated and
verified by `scripts/migrations/migration-artifact-manifest.cjs`. Full disposable
PostgreSQL replay, status, parity, seed, second no-op, old-row preservation and
real JSON null tests are mandatory. No live database is a target. Future release
dependency: Governed Migration → Migration Verification → Compatible Runtime.

Prisma omitted column = preserve; `Prisma.DbNull` = SQL NULL/no rich;
`Prisma.JsonNull` = JSON null/invalid. Reads return JS null for both null forms,
so future adapters must supply SQL-null evidence (`rich_content IS NULL` or a
known omitted historical projection) to `readStoredRichContent(value, sqlNull)`.
Do not assume all JS null means absent. A supported valid document returns a
fresh normalized copy; unsupported/invalid results contain only a safe state,
never rejected content. SQL NULL and JSON null are tested on all four models.

## 8. Embedded question assets and authorization resolver

`assetReference.assetId` is a canonical lowercase UUID for an existing exact
question asset, not File.id, upload ID or assessment-wide GradeAssessmentAsset.
Kind is descriptive and must agree with the actual authorized binding category.
Alt text/caption are bounded escaped display data. All capability/ownership/
option/correctness metadata is forbidden in AST shapes. An option's AST stays
on its actual stable row; the question-owned asset relationship is reused.
No circular FK or new option-asset table is necessary in A.

`RichAssetResolver<TTransaction,TActor>` is a typed future port. Caller supplies
the existing scoped transaction, trusted actor, school, exact HW/GA parent,
question, optional actual option and audience. The domain implementation must
prove current live actor/membership/permission/allocation/target, exact school
and question/option ancestry, active nondeleted binding, parent lifecycle and
audience, resource capacity, private File and genuinely READY server provenance
when managed. An ID or valid AST cannot satisfy this port by itself.

Author sequence: CREATE_QUESTION → BIND_AUTHORIZED_QUESTION_ASSET →
UPDATE_RICH_CONTENT_REFERENCE. Binding failure rejects a new rich write atomically.
For stale/deleted/unusable historical references, future reads must withhold rich
and use safe legacy text/accessible placeholder without a link; never manufacture
a capability. Every private byte request continues through existing resource-bound
contracts and reauthorization. No generic `/files/:id/download` substitution.
The pure library does not invoke this port or assert resource authorization.

## 9. Privacy and future integration maps

Author access retains existing domain permissions and mutable lifecycle checks;
Student access retains exact audience and reveal rules; Review access retains
its permission and release policy. No shared generalized presenter can infer
these different audiences. Hidden answers/explanations never go into AST or
fallback. Do not attach private metadata to a display node to simplify rendering.

**ST08-B (Homework, not authorized here):** DTO/domain input → Homework question
use cases → scoped repository final transaction → nullable rich writes plus
fallback. Keep existing DRAFT/allocation/submission/option guards and audit.
Explicit rich selects and read validation → Admin/Safe presenters → Teacher/
Student compositions. Resolve exact HomeworkQuestionAsset using ST06 repository
and student target/enrollment checks; keep assignment and submission attachments
distinct. Preserve legacy-only updates via the clearing rule above.

**ST08-C (Grades, not authorized here):** question DTO/domain normalization →
create/update use cases → GradesAssessmentQuestionsRepository final authorization
transaction → stable question/option rich writes+fallback. Keep eight types,
fill/matching IDs, MEDIA text mode, answer keys, scoring and submitted item sync.
Select/validate rich independently in author/review presenters and each Student
read adapter. Exams retain exam type/year/term/subject audience; Grades retain
their broader existing audience. Both keep the ST07 transactional term checks.
Teacher writes retain existing permissions and exact allocation+creator boundary;
no ST12 authority. Resolve GradeAssessmentQuestionAsset, not an arbitrary File.

## 10. Examples and client rendering

```json
{"contentVersion":1,"kind":"question","stem":{"language":"ar","direction":"rtl","blocks":[{"type":"paragraph","children":[{"type":"text","text":"قارن س < ص و ١٢٣ = 123"},{"type":"math","display":"inline","children":[{"type":"fraction","numerator":[{"type":"text","text":"١"}],"denominator":[{"type":"text","text":"2"}]}],"altText":"نصف"}]}]}}
```

Fallback: `قارن س < ص و ١٢٣ = 123(١)/(2)`. Authors control explicit spaces between
fragments. Asset-only labels use descriptive alt text, never a blank legacy label.

Negative: contentVersion 2, unknown `html` node, nested `answerKey`/`isCorrect`,
`assetReference.fileId`, `signedUrl`, malformed UUID, empty fraction, undefined
chemistry symbol, `\\input`, `<svg>`, `javascript:`, raw bidi override, depth/byte/
node/formula/reference overflow. Errors contain only fixed code/reason and no
rejected values. Tests assert source preservation and no prototype pollution.

Frontend/Mobile: consume only explicitly authorized DTO fields when B/C ship.
Render text via escaped text APIs; never innerHTML/dangerouslySetInnerHTML or
user templates. Use explicit dir/lang and isolation, accessible math/chemistry
descriptions and asset alternatives. Build scientific layout from approved
structure, never pass arbitrary text to a TeX/HTML engine. Resolve only existing
authorized resource paths. For absent/unsupported/invalid rich data retain safe
legacy rendering; do not execute or opportunistically parse unsupported nodes.

## 11. Proof ownership, constraints and operational restrictions

`src/common/rich-content/rich-content.spec.ts` owns scientific, compatibility,
security and exact-boundary proofs. `test/integration/safe-rich-content-persistence.integration.spec.ts`
owns real PostgreSQL four-model/null/identity/read-validation tests. Canonical CI
discovers these new files exactly once; no routing exclusions or historical
reclassification. Existing HW/GA question tests and complete CI retain scoring,
submissions, review, ST05 File Lifetime, ST06/07 assets and student-term evidence.
ACC12 verified terminal snapshot and ACC9C separate pool observer remain unchanged.
Final commands/results, failed probes and exact-head artifacts belong in delivery
evidence; this contract alone is not an independent Reviewer Receipt.

DR07 release disabled; DR08 QA only; DR10 migration governance mandatory.
Parent media, physical File deletion, generic file grants, new Upload Purpose,
TeX runtime, frontend/editor, richer chemistry, scoring engines and later stages
are deferred. OBS_ST01_01 remains tracked; whole-repository lint is not certified.
No Production/shared DB mutation, live migration, Terraform apply, deploy, merge
or Ready-for-review action. Independent review, Owner acceptance and ST08 final
closeout remain pending after this Draft PR.
