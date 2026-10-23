# ST-02 Grades security and additive student question contracts

Scope: approved plan V1.0, DR-01/DR-02, based on remote main
`5a16a5e061c333b1160bc90afa4d391e9a41238e`. No schema, migration,
permission grant, grading algorithm, Homework workflow or deployment change.

## Resource access

Existing JWT/session, live membership, school scope and endpoint permissions
remain required. Grades repositories additionally resolve the authenticated
teacher's live subject/term allocations, using the same active-relation policy
as Teacher App. Assessment access matches its actual `scopeType`/`scopeKey`
against the allocation's SCHOOL/STAGE/GRADE/SECTION/CLASSROOM hierarchy.
Submission and GradeItem reads additionally match active student enrollment
in an allocated classroom. Broader assessments do not grant a whole-school
student roster. The shared gradebook/snapshot reads use the same ownership
filters, including the roster used to compose virtual missing cells. Inaccessible resources return the existing `not_found` error.

Question writes, answer saves/reviews, finalization and GradeItem writes
revalidate access in the mutation transaction. Teacher allocation rows are
held with PostgreSQL share locks during these writes to serialize against
concurrent allocation replacement/deletion. Question writes also recheck
the existing draft, term, submission and locking rules. School/organization
management actors retain their existing school-scoped permission behavior.
Student answer workflows retain the dedicated adapter and own-student boundary.

Question list responses default to a review projection. `answerKey` and option
`isCorrect` are present only for an actor with `grades.questions.manage` and
access to the assessment. Review responses omit these fields, suppress
explanations and arbitrary metadata, and retain an allowlist of safe legacy
MEDIA display fields. Authoring responses preserve safe author content.
Question audits contain IDs, type, points, order, required state and option
counts; they no longer contain prompts, keys, options or arbitrary metadata.
The Homework core actor guard is unchanged and remains covered by regression.

## Content trust boundary

Create/patch normalization and publication inspect question content, options,
answer keys and nested metadata/arrays. Validation accepts the approved ordinary
external HTTPS policy and rejects provider URLs, private/local endpoints,
credential-bearing URLs, unsafe schemes, signed capability parameters and
storage coordinates. URL-like values are inspected even under alternate keys.
Inspection is deterministic and bounded to depth 16, 4096 nodes and 65536
characters per string. No URL fetch or DNS lookup is performed. Errors contain
stable field information, never rejected content or storage coordinates.

Read projections also sanitize previously stored unsafe content. Student and
Parent responses continue to exclude raw question metadata and author secrets.
Safe legacy author metadata and supported external HTTPS fields remain usable.
Unsafe content must be corrected before an update or publication; no historical
database rewrite or migration is performed.

## Additive student API contract

Both Student Exams and Student Grades use the same question contract:

Before (unchanged legacy properties):

```json
{ "id": "question-id", "type": "multiple_choice", "points": 5 }
```

After, single choice:

```json
{
  "id": "question-id",
  "type": "multiple_choice",
  "points": 5,
  "canonicalType": "MCQ_SINGLE",
  "interaction": {
    "kind": "choice",
    "selectionMode": "single",
    "multiline": false,
    "supported": true
  }
}
```

Multiple choice keeps `type: "multiple_choice"`, adds
`canonicalType: "MCQ_MULTI"` and `selectionMode: "multiple"`.

| canonicalType | legacy type | interaction.kind | selectionMode | multiline |
| --- | --- | --- | --- | --- |
| MCQ_SINGLE | multiple_choice | choice | single | false |
| MCQ_MULTI | multiple_choice | choice | multiple | false |
| TRUE_FALSE | true_false | choice | single | false |
| SHORT_ANSWER | essay | text | null | false |
| ESSAY | essay | text | null | true |
| FILL_IN_BLANK | fill_blanks | fill | null | false |
| MATCHING | matching | matching | null | false |
| MEDIA | media | media | null | false |

An unknown future type retains its lowercased legacy value but has
`canonicalType: null`, `kind: "unsupported"` and `supported: false`.
It is never silently presented as another supported interaction. The mapping
is exhaustive at compile time for all current GradeQuestionType values.

Exam cards/details and Grades assessment details add:

```json
{ "deliveryMode": "score_only", "supportsQuestionSubmission": false }
```

Question-based assessments use `question_based` and `true`. This describes
the delivery capability, not permission to start a new attempt. Existing
publication, ownership, status and submission checks still decide whether a
start/save/submit request is allowed. Score-only start requests remain rejected.
Existing routes, aliases, answer-saving payloads and submit flows are unchanged.

## Verification

Focused tests cover all canonical types on both student surfaces, unknown types,
score-only capability semantics, nested unsafe URLs across create/patch/publish,
safe legacy content, bounded input and redacted historical JSON. HTTP security
coverage in `test/security/tenancy.grades.spec.ts` covers default teacher review,
explicit authoring, wrong subject/classroom, revoked allocations, all five
assessment scopes, foreign submissions, bulk review/finalization/sync and writes.
The implementation handoff and Draft PR record final commands, results, exact
feature SHA and GitHub Actions evidence. Final acceptance remains with the Owner.
