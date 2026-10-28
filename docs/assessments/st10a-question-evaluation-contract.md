# ST10-A shared question foundation

Authority: Owner mandate `MOAZEZ-ST10A-SHARED-QUESTION-FOUNDATION`, based on
`db1b4b694852daac12a096f2d7b6628c284afd5d`. ST10-B is not authorized.

## Source-first discovery and permitted production edits

The two Prisma enums currently contain eight values each. Homework has an explicit
eight-type allowlist, DTO validation, authoring/publication/answer guards and
presenter refusal. Grades domain normalization and direct authoring repository
validation also explicitly dispatch eight types. These protections stay intact.

Before implementation, the following concrete gaps were found:

| Source | Existing behavior | Narrow ST10-A correction |
| --- | --- | --- |
| Grades question DTO | `IsEnum(GradeQuestionType)` follows database expansion, including both aliases | Validate an explicit eight-type runtime list |
| Grades type normalizer | Explicit eight-way switch returns the broad persisted enum type; downstream exhaustive switch no longer compiles | Refine its return annotation to the existing eight-type active union; behavior unchanged |
| Shared Grades contract | Exhaustive `Record<GradeQuestionType,...>` assumes persisted equals active | Type the existing mapping against the active union |
| Grades author presenter | Unsupported type still projects author-private key and metadata | Refuse inactive types before projection |
| Grades submission repository | Optional unanswered questions are skipped at submit/finalize; review checks points but not type | Check all current question types after existing transactional authorization/parent locks, before any mutation |
| Homework review use cases/repository | Legacy review path checks only whether an ST09 typed question exists; inactive types can reach writes | Assert the existing allowlist on every current question before review, including the locked transactional snapshot |
| CI planner and retirement inventory tests | Two independent hardcoded 1,034-file totals exclude the seven new ST10-A suites; exact-head run 40724982248 exposed the second assertion | Register exactly those seven expected files/profiles in both tests and increase totals by seven; all owner, historical/manual, routing and Required protections remain unchanged |

Shared pure code belongs in `src/common/question-evaluation`, alongside the existing
shared Rich AST technical foundation. It imports no Nest, Prisma or business
module. It performs no I/O, persistence, grading, lifecycle or authorization.

## Closed contracts and absence

Every object has declared own data properties only. Accessors, proxies, custom
prototypes, symbols, sparse/decorated arrays, extra keys, malformed Unicode and
coercible objects are rejected without calling getters or `toJSON`.

Public definitions use `definitionVersion: 1` and `kind`. Private keys use
`keyVersion: 1` and `kind`. Private keys are never merged into public definitions.
Definitions accept `draft` or `complete`; draft may be incomplete, but supplied
fields remain valid. Student answer validation accepts `draft` or `final` and an
explicit `required` flag. `undefined` or `null` means absent/cleared. Optional
absence is valid; a supplied incomplete final answer is invalid.

Evaluation takes a closed `{state:'manual'}` or `{state:'configured',key:...}`
private key state. Invalid configured keys throw `question_evaluation.invalid`;
they never become manual-only. Invalid student input returns `INVALID_INPUT`.
The other outcomes are `PROVED_EQUIVALENT`, `PROVED_DIFFERENT`,
`UNKNOWN_REQUIRES_MANUAL_REVIEW`, `UNDEFINED_EXPRESSION`. No outcome awards points.

## Ordering

Public items have only `id`, `displayOrder`, `label`; at most 50. IDs are stable
ASCII identifiers (1–64 characters), positions are unique integers 0–1,000,000,
labels are nonempty safe Unicode text of at most 1,000 characters, matching the
stricter existing Homework typed-label limit without importing a business module.
The exact 1,000/1,001 boundary is tested. Normalization
sorts by displayOrder. A complete definition has at least one item. Presentation
positions never imply the private sequence. Configured expectedItemIds must be an
exact permutation of public IDs. Draft answers may be unique subsets; supplied
final answers must be complete permutations. Evaluation is full sequence equality
only, with no partial credit.

## Exact numeric contract

Public numeric definition: `{definitionVersion:1,kind:'numeric',units:{required,
allowedCodes,allowUnitless}}`. At most 16 case-sensitive ASCII codes, each 1–24
characters, unique and canonically sorted. Required means null is forbidden;
otherwise allowUnitless must be true. At least one allowed representation is
required for a complete definition. No unit conversion or global catalog exists.

Student `{value:string,unitCode:string|null}`. Private key `{keyVersion:1,
kind:'numeric',reference:{value,unitCode},policy?:...}`. Missing policy means
manual only. Policies have policyVersion 1 and mode EXACT, ABSOLUTE_TOLERANCE
(`tolerance`), RELATIVE_TOLERANCE (`relativeTolerance`) or EXPLICIT_ACCEPTED_RANGE
(`lower`, `upper`, `includeLower`, `includeUpper`). Bounds use the reference unit.
Tolerance is nonnegative, comparisons inclusive and exact, range nonempty, and
relative reference zero invalid. Different declared units require manual review;
undeclared units are invalid.

Decimal input is at most 64 UTF-16 characters, supports ASCII/Arabic-Indic/Eastern
Arabic-Indic digits, `.`/`٫`, ASCII signs and `e`/`E`. No whitespace or grouping is
accepted. The explicitly written scientific exponent is bounded by ±100. There
must be integer digits before a decimal point and fractional digits after it;
scientific exponents may have leading zeroes within the 64-character input bound.
There are at most 34 significant coefficient digits after removing insignificant
leading/trailing zeroes. Fractional positions contribute to the internal base-10
exponent; e.g. `1.23e-100` remains valid. Normal form is a signed BigInt coefficient
and bounded integer exponent. Canonical strings use decimal/scientific notation
while keeping the written exponent within ±100 and zero is `0`.
All value arithmetic, equality, differences and tolerance products use BigInt.
No Number/parseFloat/toFixed determines correctness. Zero loses its sign.

## Expression grammar and proof envelope

Public `{definitionVersion:1,kind:'math_expression',variables:[...]}`; private
`{keyVersion:1,kind:'math_expression',expression:string}`; student `{expression}`.
Declared variable names are ASCII letters followed by letters/digits/underscore,
at most 32 characters, at most eight unique variables. JavaScript dangerous names
are forbidden. Expression numeric tokens are ASCII exact decimal/scientific
literals subject to the decimal bounds above. ASCII space/tab/newline are allowed.

```text
sum     := product (('+' | '-') product)*
product := unary (('*' | '/') unary)*
unary   := ('+' | '-') unary | power
power   := primary ('^' unary)?
primary := number | declared-variable | '(' sum ')'
```

Power binds more tightly than unary signs and associates right: `-2^2=-4`,
`(-2)^2=4`, `2^3^2=512`, `2^-2=1/4`. Every exponent must itself be a variable-free
exact integer within ±16. Variable exponents and unsupported syntax are invalid.
If a constant exponent exceeds the proof resource envelope, the expression stays
manual-only; no containing power executes without proving an integer within ±16.
This also covers exact cancellation of over-budget intermediates in an exponent.
`0^0`, division by zero and zero to a negative power are undefined. No implicit
multiplication, functions, properties, strings, HTML, compilation or symbolic CAS.

Limits: length 512, tokens 128, AST nodes 256, AST depth 32, parser recursive
nesting 32, variables 8, absolute integer power 16. The token ceiling dominates
the node ceiling in this grammar; both budgets are independently enforced.
The exact rational evaluator independently caps each numerator and denominator
at 4,096 bits and all operations/GCD iterations at 4,096. Growth is checked before
large multiplication/powers. Valid constant input beyond this proof envelope is
manual-only. Variable-bearing equivalence stays manual-only, including `x+x` vs
`2*x` and `x/x` vs `1`, after a bounded definedness check. That check walks the
existing AST and probes fully constant subexpressions with the unchanged exact
rational limits. A division with a provably zero constant denominator, or a
provably zero constant base raised to zero/a negative integer, is undefined even
under a variable-bearing parent. Configured keys are rejected with the existing
fixed input error; student evaluation returns `UNDEFINED_EXPRESSION`.

At most one constant probe per AST node is performed; traversal uses the existing
node/depth bounds, and every probe retains the 4,096-bit/4,096-operation limits.
Budget exhaustion leaves a value unknown, never assumed zero or undefined, while
independent small constant subexpressions can still be checked. No symbolic
definedness proof is attempted for `x/x` or `x/(x-x)`. Undefined input remains
distinct from syntax-invalid input. No random substitution, symbolic rewriting or
canonical-string equality establishes equivalence.

## Transition and migration

Append ORDERING, NUMERIC, MATH_EXPRESSION to both enums using one Prisma-generated
enum-only migration and canonical generated manifest. Replay only in owned
disposable PostgreSQL. Existing 33 migration artifacts remain immutable.

All HTTP authoring aliases, direct repository writes, publication, student
single/bulk save/final submit, review and private read projections must retain the
eight-type boundary. Persisted future values receive safe unsupported projection
or refusal, never legacy interpretation. Both domains are verified with actual
persisted future-type fixtures. No permissions, endpoints, sync scoring, media,
workflow/Required aggregator, or business lifecycle changes are authorized.

The two existing enum-catalog tests are updated to eleven persisted values while
retaining their separate eight-active assertions. This updates storage expectations
without weakening runtime certification. Homework review uses the same parent
serialization lock as structural writers before reading the current type list.
For an ST09 typed review, this check runs after the existing allocation-first
review lock boundary. Legacy review acquires no later allocation lock. The check
therefore never reverses the established allocation-before-assignment lock order.

ST10-B, ST11+, activation, Ready, merge, deploy and Production mutation remain
unauthorized. Independent review and Planning acceptance remain pending.

## Local verification before Draft PR

All selected suites pass without skips: 489 cases in 21 focused unit suites;
264 distinct cases in 12 PostgreSQL/security/HTTP suites; 64 migration, planner,
Required aggregation and strict transaction governance checks. The HTTP suites
include both eight-type lifecycles, ST09 lock/concurrency proofs, ST08 Rich AST,
Grades tenant security, real MinIO media streaming and asset lifetime behavior.
The seven new suites are explicitly registered in both inventory tests. The first
remote CI run exposed the second stale retirement inventory assertion; its narrow
correction is test/documentation-only, with all production code unchanged.
Final pure-foundation checks also enforce the stricter existing 1,000-character
label limit and keep over-budget constant-exponent proofs manual-only. Known
noninteger, variable and out-of-range exponents still fail validation.

The three future values are deliberately persisted in each domain's owned
PostgreSQL fixture. Tests exercise Core/Teacher ingress, aliases, direct create/
update/publication, student single/bulk/final submission, optional unanswered
finalization, single/bulk review and private historical reads. Rejected writes
leave submissions and answers unchanged. The same-school peer may read a shared
assessment but cannot read another student's submission; cross-school reads fail.

Both upgrade from 33 migrations and fresh replay of all 34 pass. Second deploy is
a no-op, both enum catalogs match exactly, every applied checksum matches source,
all 33 historical SQL hashes remain unchanged, captured pre-migration legacy rows
remain byte-for-byte equal after JSON serialization, and Prisma reports no schema
difference. Manifest verification and build including the bootstrap postbuild pass.

Non-mutating lint comparison against the exact approved base uses identical Node,
dependencies, generated Prisma client and configuration for changed TypeScript
files, plus all new TypeScript files: 221 inherited diagnostics before, 216 after,
zero introduced, five removed. Whole-repository lint and full root typecheck are
NOT_CERTIFIED. No lint auto-fix or global cleanup was performed. The CJS planner
test is validated by Node's test runner; it is outside the normal TypeScript lint
surface. Exact-head remote CI and artifact evidence are delivered separately in
the final independent-review handoff; local results do not substitute for them.
