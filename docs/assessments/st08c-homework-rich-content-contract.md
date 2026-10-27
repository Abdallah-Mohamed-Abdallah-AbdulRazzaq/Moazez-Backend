# ST08-C Homework Safe Rich AST V1 — Frontend/Mobile integration contract

Contract version: **1.0**, 2026-10-27. Authorized source baseline:
`8db111993602f89a3baa974436fa102d86eb5350`. ST08-A and ST08-B are accepted,
unchanged dependencies. This contract describes the Homework integration; it
does not authorize a frontend editor rollout, Production media release, migration,
deployment, Ready for review or merge. Independent Backend review and Planning
pre-merge approval remain pending.

## 1. Discovery and implementation boundaries

| Surface / existing consumer | Integration and current authorization |
| --- | --- |
| Core question create/update/list/detail | Existing question DTOs/use cases/repository and explicit author presenter; current School/Organization membership and existing assignment permissions |
| Core assignment list/detail | Existing assignment questions, same optional validated display; existing assignment view permission |
| Teacher questions and independent options | Existing Teacher ownership wrapper carries its route allocation into the Core mutation; ST06 repeats current ownership, membership, permission and lifecycle inside the write transaction |
| Teacher assignment detail | Existing Core composition and Teacher assignment presenter; exact owned route allocation retained |
| Student Homework detail | Existing target-scoped adapter, current Student enrollment/classroom/year/term and PUBLISHED/CLOSED visibility; safe presenter adds no expected answers/correctness |
| Student selected-option display | Existing answer/submission surfaces add validated option display after the same current Student boundary; question prompt visibility and review-release timing stay unchanged |
| Authorized answer review | Existing Teacher/Core prompt and selected-option display receive validated Rich data; answer IDs, marks, comments and review semantics remain authoritative |
| Submission metadata summaries | Existing summaries contain no question display; no question fields are invented |
| Parent Homework/Answer | Existing legacy display remains; no Rich or protected question-media access is introduced, including through shared answer helpers |
| Question assets and bytes | Reuse ST06 bindings, READY provenance, policy and resource routes; no upload or generic File API redesign |
| Grades | Accepted ST08-B runtime and reveal policy remain unchanged; cross-domain and existing Grades regressions verify compatibility |

Existing nullable `HomeworkQuestion.richContent` and
`HomeworkQuestionOption.richContent` columns are sufficient. No schema, migration,
index, permission seed, upload purpose, endpoint, shared grammar or Grades
business-logic change is required.

## 2. Existing endpoints carrying Rich display

All paths retain `/api/v1`, existing authentication, scope headers, methods,
permissions, status/error contracts and response wrappers.

| Core path (relative to `/api/v1`) | Operations / display |
| --- | --- |
| `homework/assignments/:homeworkId/questions` | POST question; GET `{items}` |
| `homework/assignments/:homeworkId/questions/:questionId` | PATCH question; GET `{question}`; existing DELETE |
| `homework/assignments/:homeworkId/questions/:questionId/reorder` | Existing PATCH, preserves Rich |
| `homework/assignments/:homeworkId/questions/:questionId/options` | POST independent option, returns existing `{question}` |
| `homework/assignments/:homeworkId/questions/:questionId/options/:optionId` | PATCH independent option; existing DELETE |
| `homework/assignments/:homeworkId/questions/:questionId/options/:optionId/reorder` | Existing PATCH, preserves Rich |
| `homework/assignments` and `homework/assignments/:homeworkId` | Existing GET assignment question display |

Teacher question/option operations use the same suffixes beneath
`teacher/homeworks/classes/:classId/assignments/:homeworkId`. `classId` is the
owned TeacherSubjectAllocation ID, not a free classroom identifier. Student
question display remains in GET `student/homeworks/:homeworkId` under the
existing `{homework}` wrapper. Student answers remain under
`student/homeworks/:homeworkId/submission/answers`, and existing Teacher answer
review remains under
`teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers`.
No new REST route is introduced.

## 3. Question requests and fallback

The accepted shared types are in `src/common/rich-content/`. Homework uses
`RichQuestionContent` with `contentVersion:1`, `kind:"question"`, required
`stem`, and optional `instructions`. Homework rejects `stemAr`; Arabic/English
can coexist within document fragments. No `promptAr` column or API is added.

Rich-only creation through the existing question POST:

```json
{
  "type": "short_text",
  "richContent": {
    "contentVersion": 1,
    "kind": "question",
    "stem": {
      "language": "und",
      "direction": "auto",
      "blocks": [{"type":"paragraph","children":[
        {"type":"text","text":"احسب ","language":"ar","direction":"rtl"},
        {"type":"math","display":"inline","children":[
          {"type":"fraction","numerator":[{"type":"text","text":"12"}],"denominator":[{"type":"text","text":"3"}]}
        ],"altText":"Twelve divided by three"}
      ]}]
    }
  },
  "points": 2
}
```

The backend derives `prompt` from the normalized stem (maximum 8000 display
characters) and `instructions` from the optional Rich instructions (maximum
4000; absent maps to legacy null). It stores the complete normalized envelope
and fallback together. An explicitly supplied legacy display value must agree
with the generated fallback. Contradictions fail with the existing sanitized
validation error and no partial write.

Legacy-only clients continue sending required nonempty `prompt`; a missing/null
Rich field does not waive legacy creation requirements. Existing type, points,
required, metadata, expected-answer and question-structure validation remains.

## 4. Independent option requests and UUIDs

Rich-only option POST, either nested in question creation or through its existing
independent option route:

```json
{
  "richContent": {
    "contentVersion": 1,
    "kind": "option",
    "label": {
      "language": "en",
      "direction": "ltr",
      "blocks": [{"type":"paragraph","children":[{"type":"text","text":"Choice A"}]}]
    }
  },
  "isCorrect": true,
  "sortOrder": 0
}
```

The backend derives mandatory legacy `text` (maximum 1000 characters).
`labelAr` is unsupported in Homework. Existing authoring correctness and metadata
rules remain separate from display. Never put `isCorrect`, expected answers,
feedback or other answer metadata inside the AST.

Use the returned `optionId` for independent update/reorder/delete. Rich content
belongs to that persisted option UUID and its exact active parent question.
It never follows array position, label text, or a coincident sort order. Foreign
and retired IDs fail. Reorder preserves the envelope and correctness/metadata;
retirement retains stored history while active Student reads exclude the option.
Homework does not acquire Grades' bulk option replacement API.

## 5. Omission, replacement, null and genuine legacy edits

| Write | Result |
| --- | --- |
| `richContent` omitted | Preserve, unless a genuine legacy prompt/instructions/text edit clears its envelope |
| Complete non-null V1 envelope | Normalize and replace the entire envelope and its associated fallback |
| `richContent:null` | Clear JSONB to SQL NULL (`Prisma.DbNull`); retain legacy text unless explicitly patched |
| Explicit unchanged legacy display | Preserve the existing envelope |
| Genuine prompt/instructions edit | Clear the question's whole envelope |
| Genuine option text edit | Clear that exact option's envelope |
| Points/order/required/correctness/metadata only | Preserve Rich |
| Invalid/future/contradictory incoming AST | Reject without a coupled partial write |

The backend distinguishes omitted fields from explicit null even after DTO
transformation. Updates use the original command and current locked row, rather
than a preliminary read's fallback. Rich JSON never changes expected answers,
grading metadata, answer selection, question interactions or scoring.

## 6. Final write authorization and lock order

Protected Rich creation/replacement/clear/retirement reuses ST06's current
School/Organization, membership/role/permission, academic hierarchy, allocation,
assignment owner, DRAFT, active question and option checks. Teacher wrappers'
earlier successful reads are not authorization for the final write.

The established order remains earlier scope/membership locks, allocation,
assignment, question/option and asset/READY File resources. No nested transaction
or external media processing is introduced. The private bucket is an immutable
constructor lookup; no storage capability or bytes are obtained under these locks.

A genuine legacy edit can discover stored Rich JSON only after taking its
ordinary assignment/question locks. That discovery attempt writes nothing and
rolls back. One fresh transaction acquires ST06 locks first, revalidates the
original actor/route and current lifecycle, then recomputes the plan from the
original command. Stored JSON null is protected JSON; SQL-null legacy rows retain
their ordinary behavior. Authorization is never escalated while retaining the
discovery attempt's assignment lock. No sleep or retry loop implements safety.

## 7. Read presence, history and privacy

Only repository-authorized objects receive an internal validated projection.
Presenters add explicit fields and never spread raw Prisma JSON. SQL-null
evidence and Rich JSON are read together in parameterized exact-school,
assignment/question batches of at most 200 questions, with active option joins.
Current persisted fallback and previously selected display fields are checked
against the envelope. A concurrent mismatch withholds Rich.

| Stored/authorized state | Public `richContent` |
| --- | --- |
| Valid compatible V1 envelope, authorized references | Present as a normalized object |
| SQL NULL | Omitted |
| JSON null, malformed JSON, unsupported version | Omitted |
| Stale/deleted/ineligible/unauthorized managed reference | Omitted |
| Inconsistent current or selected fallback | Omitted |

All existing legacy fields and wrappers remain. Reads do not repair, normalize,
backfill or rewrite historical rows. Internal classifications/null flags and
reasons are not public response data.

Student question and selected-option display never adds `expectedAnswer`,
`isCorrect`, answer keys, author metadata or unauthorized review fields. Existing
Teacher/Core authoring/review reveal rules remain. Parent consumers explicitly
omit Rich even if a shared answer helper is handed a validated object; existing
Parent legacy Homework behavior is retained.

## 8. Managed references and private bytes

Keep the sequence **Create Question → Bind authorized ST06 Question Asset →
Update Rich AST**. A reference is an actual `HomeworkQuestionAsset.assetId`, not
a File, upload session, Grade asset, provider object/key or signed URL:

```json
{
  "type": "assetReference",
  "assetId": "00000000-0000-4000-8000-000000000011",
  "kind": "document",
  "altText": "Worked example",
  "caption": "Read the reference before answering"
}
```

This node belongs inside the existing approved document fragments. The resolver
checks the trusted audience, exact active school/assignment/question and active
option when relevant, active managed binding, matching kind/category, real READY
private File/session provenance and current media policy/actions. It reuses ST06
authorization and READY verification. External HTTPS asset metadata remains an
existing separate ST06 feature; it is not an embedded READY managed reference.

Homework assets are question-owned. An option may reference an authorized asset
of its own question after the option's actual parent is verified. No option-to-
asset FK or uniqueness rule is invented. Cross-school, cross-assignment,
cross-question, raw File/upload, cross-domain and retired-option substitutions
fail atomically. Stale references withhold the envelope; they do not delete or
rewrite assets, Files or historical AST.

The AST is display metadata only. Obtain protected bytes through existing
resource-bound ST06 routes, for example
`/api/v1/student/homeworks/:homeworkId/questions/:questionId/assets/:assetId/preview`
or `/download`, and the corresponding existing Core/Teacher routes. Authentication,
current ownership, GET/HEAD, Range/If-Range, 200/206/416, secure headers, no-store
caching and abort behavior remain authoritative. An AST ID grants no byte access.
No generic File download permission, signed storage URL or Parent media route is added.

## 9. Rendering and compatibility guidance

Use the unchanged shared closed V1 grammar for text/emphasis, independent
Arabic/English fragments, RTL/LTR isolation, supported numerals, script/fraction/
radical/math structures, chemical species/reactions and accessible media
descriptions. Render structured nodes with escaped text and explicit direction
isolation; honor `altText` and captions. Do not execute HTML, SVG, iframe,
JavaScript, TeX commands or provider URLs. This is display-only, with no equation
solver, chemistry grading or new interaction engine.

Old clients can keep using legacy display. New clients should use a present
validated envelope and otherwise render the original legacy fields. No new
frontend editor deployment is required by this unit. Use stable question/option
IDs, preserve existing submission/review flows, and handle the existing sanitized
validation, non-disclosing resource 404 and read-only 409 responses.

## 10. Verification ownership and release boundary

New unit tests cover DTO conditional requirements, mapping, omission/null/edit,
domain limits, scientific fragments, hostile data, projection and Parent isolation.
New PostgreSQL tests prove atomic persistence, actual UUIDs, SQL-null evidence,
rollback, live permission/membership/allocation, publication/authorization lock
waits, stale snapshot withholding, managed provenance and cross-domain separation.
New actual HTTP/security tests cover Core/Teacher/Student/Review/Parent and real
private GET/HEAD/Range/If-Range/416 bytes. Existing Homework, ST06 assets, shared
AST and accepted Grades/ST08-B regressions remain required verification owners.
Final executed counts and same-head CI/artifact provenance belong in the delivery
receipt; this document does not self-issue an independent Reviewer Receipt.

`NEW_SCHEMA_CHANGE=NO; NEW_MIGRATION=NO; NEW_PERMISSIONS=NO`.
`SHARED_RICH_AST_V1=UNCHANGED; GRADES_RUNTIME=UNCHANGED`.
`READY_FOR_REVIEW=NO; MERGE=NO; DEPLOYMENT=NO; PRODUCTION_MUTATION=NO`.
ST05 and ST08-A migrations must precede any later separately authorized compatible
runtime deployment through Governed Migrations → Verified Database State →
Compatible Runtime. This implementation performs no live migration.
DR07 operational release remains pending, Assessment Media Production release is
disabled, DR08 is QA-only and DR10 migration governance remains mandatory.
Parent media remains deferred; physical File deletion is not authorized.
ST08-C final closeout and ST08 final acceptance remain pending. ST09–ST14 are not authorized.
