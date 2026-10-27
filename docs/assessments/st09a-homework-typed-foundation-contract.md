# ST09-A Homework typed foundation contract V1.0

Authority: approved ST09-A mandate; source base
`0bf87c83d7617038df33b6fdfd7b40e63d2948ba`. See ADR-0020.
Foundation contracts and persistence only. **ST09-B/C and runtime activation
are NOT ACTIVE / NOT AUTHORIZED.** No new operational endpoint is provided.

## Types and source of truth

Declared Homework types: SHORT_TEXT, LONG_TEXT, SINGLE_CHOICE, MULTIPLE_CHOICE,
TRUE_FALSE, FILL_IN_BLANK, MATCHING, MEDIA, preserving the original five order.
Only the original five remain accepted by operational DTOs, normalizers,
publication, Student answers and public presentation. Unknown types fail closed.
Swagger continues advertising only those five operational authoring types.

For the three new types, the entire existing `HomeworkQuestion.metadata` value
is the closed public definition below. It is not an arbitrary metadata bag or
an unreserved nested namespace. Legacy metadata remains untouched. The new
nullable `answerKey` maps to `answer_key`; `answerJson` on answers maps to
`answer_json`. Both are JSONB, with no default/backfill or legacy field removal.
Existing `expectedAnswer`, `textAnswer`, `selectedOptionIds` and Rich persistence
retain their existing contracts.

## Bounds and text

Homework-owned limits explicitly adopt Grades V1 reference ceilings: 50 entries
per structured collection, 1000 Unicode code points per blank answer or label,
5000 per fill text segment, 10000 per MEDIA text answer. Each whole JSON value
also has a conservative 65536-byte UTF-8 budget, 4096 nodes and depth 12; maxima
need not be simultaneously attainable. Stable IDs use ASCII letters/digits
followed by letters/digits/underscore/hyphen, length 1..64, case sensitive and
question local. No display index is an identity. Orders are explicit unique
integers 1..50 within a side/blank collection; output sorts ascending.

Strings normalize CRLF to LF and NFC. Answer/label/key strings trim outside
whitespace and must be nonempty; source segments preserve spacing. Invalid
surrogates, unsafe controls/bidi overrides, executable markup/schemes and
encoded markup are rejected. JSON must be finite, dense, plain data: no sparse
arrays, extra properties, getters, custom prototypes, cycles, poison keys,
functions or unbounded recursion. Validators emit fixed internal reasons and
never echo keys, answers, asset IDs or rejected payloads.

## Public and private definitions — FUTURE / NOT ACTIVE API integration

All examples are domain/persisted contracts. They do not describe accepted
current HTTP input. New-type metadata is replaced as one validated unit.

Fill public metadata:

```json
{
  "definitionVersion": 1,
  "kind": "fill",
  "blanks": [{ "id": "blank_1", "order": 1 }],
  "segments": [{ "text": "العاصمة / Capital: " }, { "blankId": "blank_1" }],
  "maxAnswerLength": 1000
}
```

Each segment has exactly text or blankId. Every blank is referenced exactly
once, in canonical blank order; foreign/duplicate/missing references are invalid.
The answer-length ceiling may be reduced to a positive value <=1000. An empty
blanks/segments definition is structurally valid only in draft mode, and is
never complete. Supplied null collections are invalid; omission in a draft
normalizes to empty collections. A provided key is complete, optional as a
whole, and stored only in answerKey:

```json
{
  "keyVersion": 1,
  "kind": "fill",
  "blanks": [{ "blankId": "blank_1", "acceptedAnswers": ["Cairo", "القاهرة"] }]
}
```

Each blank has 1..50 unique normalized accepted strings within its configured
bound. All blank IDs must belong to this definition and occur exactly once.
Keys are validation/reference material only, never an automatic marking engine.

Matching public metadata:

```json
{
  "definitionVersion": 1,
  "kind": "matching",
  "left": [
    { "id": "l1", "order": 1, "label": "One", "labelAr": "واحد" },
    { "id": "l2", "order": 2, "label": "Two", "labelAr": null }
  ],
  "right": [
    { "id": "r1", "order": 1, "label": "1", "labelAr": null },
    { "id": "r2", "order": 2, "label": "2", "labelAr": null }
  ],
  "reuseRight": false
}
```

Each nonempty side has at least two and at most 50 items. Right cardinality is
at least left cardinality, permitting distractors. IDs/orders are unique within
each side; side namespaces may overlap because relations use leftId/rightId.
Both empty sides are draft-only; one populated side or a conflicting cardinality
is invalid. labelAr is optional/nullable. Reuse is always false; no many-to-one
policy is authorized. A complete private key is separate:

```json
{
  "keyVersion": 1,
  "kind": "matching",
  "pairs": [
    { "leftId": "l1", "rightId": "r1" },
    { "leftId": "l2", "rightId": "r2" }
  ]
}
```

All left items occur exactly once; right IDs may not repeat. Foreign IDs,
incomplete/conflicting keys and additional metadata are rejected. Pair order
normalizes by left definition order. Public metadata never contains key pairs.

MEDIA public metadata:

```json
{
  "definitionVersion": 1,
  "kind": "media",
  "source": {
    "kind": "homeworkQuestionAsset",
    "assetId": "1cfa9aae-0bb7-4c8d-a359-b9a0d2162fd1"
  },
  "answer": { "kind": "text", "maxLength": 10000, "multiline": true }
}
```

Stimulus and answer interaction are separate. Source may be absent/null only
for an incomplete structural draft. The bounded text answer contract is always
required; complete definitions require a syntactically valid asset UUID.
Structural completeness is **not publication authorization**. No key is defined
for MEDIA. No audio, answer asset, upload purpose, URL or File relation is added.

The authoritative relationship is HomeworkAssignment -> HomeworkQuestion ->
HomeworkQuestionAsset. A UUID alone does not establish membership in that graph.
ST09-B must call the existing ST06 scoped resolver on the current transaction,
verify the exact active question/assignment/tenant and active binding, READY
private File/session provenance, policy and audience; byte requests must still
reauthorize. Grade asset IDs, File IDs, upload IDs and foreign question assets
are not substitutes. Existing external-HTTPS assets may be referenced only via
that same authorized Question Asset relation. No permissive mediaUrl is added.

## Typed answers — FUTURE / NOT ACTIVE API integration

Fill answerJson is `{ "blanks": [{ "blankId": "blank_1", "text": "القاهرة" }] }`.
Matching answerJson is `{ "pairs": [{ "leftId": "l1", "rightId": "r1" }] }`.
Both are closed and normalize by the owning definition's order. MEDIA uses
existing textAnswer, bounded by its definition; its answerJson remains SQL NULL.
The pure MEDIA answer input is `{ "textAnswer": "A manually reviewed response" }`.
No selected options or automatic scoring applies to the three future types.

Draft answers may be absent or contain an incomplete valid subset (including
an empty collection). Final required answers must be complete. An actually
absent optional answer remains absent; any supplied final answer, even optional,
must be complete. Empty text entries are not supplied answers: omit the entry
in a draft. Explicit top-level JSON null is invalid. The normalizer accepts
undefined as absence and returns a tagged normalized type or null for absence.
Callers must bind the actual question before passing its definition; IDs are
question local and do not grant cross-question access.

## SQL NULL and privacy

SQL NULL is absence. Stored JSON null, malformed JSON, future versions or
definition-incompatible answers/keys are invalid and withheld without rewriting
history. Read classifiers require an authoritative `column IS NULL` boolean
alongside the stored value; Prisma JavaScript null alone is insufficient.
The opt-in persistence helpers validate values and reconstruct explicit fields.
Only a tagged `{state:'clear'}` maps to Prisma.DbNull; raw null is invalid as a
typed value. Existing runtime selects and unchecked input aliases do not acquire
answerKey/answerJson automatically. No current response/DTO field is added.

| Audience                   | ST09-A / future boundary                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| School/Organization author | Existing manage authority, tenancy and lifecycle remain required; no new-type HTTP authoring or key response yet   |
| Teacher author             | Existing exact live allocation and owned Homework authority; no new permission/grant or broad Grades authoring     |
| Student                    | Existing enrollment/target/publication checks; no private key, metadata bag, correctness or new typed HTTP payload |
| Teacher reviewer           | Existing review/release fields unchanged; review permission alone does not make structured keys public author data |
| Parent                     | Existing linked-child ownership and legacy/release projection only; no key, Rich or private media expansion        |

Public definition projection revalidates a closed definition and reconstructs
allowed fields. It never spreads an author key or arbitrary metadata record.
ST08 Rich AST remains display-only and unchanged; it must not contain keys.

## Later integration and transactional obligations — FUTURE / NOT ACTIVE

- Core `/api/v1/homework/assignments/:homeworkId/questions` and existing question/
  option PATCH paths, plus equivalent Teacher owned-allocation routes, require
  explicit later type activation, full definition/key validation and atomic
  metadata/key writes. Never use a generic metadata merge for these types.
- Existing Core/Teacher `POST .../:homeworkId/publish` needs later complete typed
  publication rules and client readiness. ST09-A only adds a current-type guard
  before mutation under an assignment lock. It never takes an allocation lock
  afterwards; ST06/ST08 allocation-before-assignment mutation order remains.
- Student `/api/v1/student/homeworks/:homeworkId/submission/answers` PUT, answer
  PATCH, submission PUT/draft POST and both submit POST aliases require later
  opt-in typed payloads, final transactional revalidation and no partial writes.
  They currently reject unsupported types and new answerJson input.
- Submission final mutation rechecks all current active question types, including
  optional unanswered questions; unsupported values cannot fall through to text/
  choice. No existing five-type grading, replay, terminal state or Grade Sync
  behavior is redesigned.
- Clients must explicitly declare readiness for a future new type. Never label
  Matching/MEDIA as a legacy text/choice interaction. ST09-B/C must coordinate
  type transitions, stable IDs, private selections, Rich fallback and review.

## Migration and operational gate

One real-timestamp Prisma-generated create-only migration adds exactly three
enum values and two nullable JSONB columns. Inspect before first application;
applied SQL and all prior migrations are immutable. Canonical manifest hashes
are generated by the repository tool. Require fresh full replay, no-op second
deploy, status/catalog/SQL-null/historical/FK proof and zero read-only drift.

Release sequence remains Governed Migrations -> Verified Database State ->
Compatible Backend Runtime. ST05/ST08-A migration dependencies remain mandatory;
the ST09 migration must precede any separately approved compatible runtime.
DR07 remains pending/Production media disabled, DR08 QA-only, DR10 mandatory.
No Production mutation, live migration, deployment, Terraform apply, physical
File deletion, ST09-B/C or ST10 implementation is authorized by this document.
