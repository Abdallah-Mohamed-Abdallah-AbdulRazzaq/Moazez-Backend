# Homework eight-type runtime API contract V1.0 — ST09-B/C

Authority: approved ST09-B/C combined mandate, 2026-10-28. Core Homework owns
the behavior; Teacher/Student/Parent apps compose it. ADR-0021 and the discovery
matrix document authorization and lock order. ST09-A's closed definitions,
limits and database representation are retained. This is source/API integration
documentation, not Production rollout or DR07 media release approval.

## Routes and permission boundaries

All paths below include `/api/v1`. Existing wrappers/methods remain unchanged.

| Operation | Core | Teacher or Student | Existing permission |
| --- | --- | --- | --- |
| Question list/create | GET/POST `/api/v1/homework/assignments/:homeworkId/questions` | GET/POST `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions` | Core assignments.view/manage; Teacher questions.view/manage |
| Question detail/update/delete | GET/PATCH/DELETE collection + `/:questionId` | Same under Teacher collection | Same operation-specific view/manage |
| Options | Existing POST/PATCH (including sortOrder)/DELETE under question | Same Teacher paths | Existing manage; choice parent only |
| Publish | POST `/api/v1/homework/assignments/:homeworkId/publish` | POST Teacher assignment + `/publish` | assignments.manage |
| Saved answers | — | GET/PUT `/api/v1/student/homeworks/:homeworkId/submission/answers` | submissions.view / answers.manage |
| Single answer | — | PATCH answer collection + `/:questionId` | answers.manage |
| Save submission draft | — | PUT `/api/v1/student/homeworks/:homeworkId/submission`; POST same + `/draft` | submissions.save |
| Final submit aliases | — | POST `/api/v1/student/homeworks/:homeworkId/submit`; POST same + `/submission/submit` | submissions.submit |
| Teacher answer list/review | Existing Core submission routes | GET Teacher assignment + `/submissions/:submissionId/answers`; PATCH same + `/:answerId/review`; PUT same + `/review` | submissions.view/review |
| Complete manual review | POST/PATCH Core assignment + `/submissions/:submissionId/review` | POST/PATCH Teacher assignment + `/submissions/:submissionId/review` | Core assignments.manage; Teacher submissions.review |
| Parent detail | — | GET `/api/v1/parent/children/:studentId/homeworks/:homeworkId` | assignments.view + submissions.view, linked child/target |

Teacher `classId` is an exact owned TeacherSubjectAllocation UUID. It is not
a classroom-wide grant. JWT, live membership, school/organization, allocation,
target/enrollment and lifecycle boundaries remain mandatory. No new permission
or role grant exists. Resource mismatches use the existing non-disclosing 404.

## Eight wire types and author requests

Author input accepts the existing case-normalized enum convention. Responses
use these exact lowercase values:

| Input type | Response type | Answer interaction |
| --- | --- | --- |
| SHORT_TEXT | short_text | textAnswer |
| LONG_TEXT | long_text | textAnswer |
| SINGLE_CHOICE | single_choice | Exactly one selectedOptionIds UUID |
| MULTIPLE_CHOICE | multiple_choice | selectedOptionIds UUIDs |
| TRUE_FALSE | true_false | Exactly one of two option UUIDs |
| FILL_IN_BLANK | fill_in_blank | answerJson.blanks |
| MATCHING | matching | answerJson.pairs |
| MEDIA | media | Bounded textAnswer, ST06 stimulus |

Existing text/choice author bodies are preserved, for example:

```json
{"type":"SHORT_TEXT","prompt":"Answer briefly","points":1,"isRequired":true}
{"type":"LONG_TEXT","prompt":"Explain","points":2,"isRequired":true}
{"type":"SINGLE_CHOICE","prompt":"Choose one","options":[{"text":"A","isCorrect":true},{"text":"B","isCorrect":false}]}
{"type":"MULTIPLE_CHOICE","prompt":"Choose","options":[{"text":"A","isCorrect":true},{"text":"B","isCorrect":true}]}
{"type":"TRUE_FALSE","prompt":"Statement","options":[{"text":"True","isCorrect":true},{"text":"False","isCorrect":false}]}
```

Core and Teacher POST use the same typed body:

```json
{
  "type":"FILL_IN_BLANK","prompt":"Capital","points":1,"isRequired":true,
  "metadata":{
    "definitionVersion":1,"kind":"fill",
    "blanks":[{"id":"capital","order":1}],
    "segments":[{"text":"Capital: "},{"blankId":"capital"}],
    "maxAnswerLength":1000
  },
  "answerKey":{"state":"value","value":{
    "keyVersion":1,"kind":"fill",
    "blanks":[{"blankId":"capital","acceptedAnswers":["Cairo","القاهرة"]}]
  }}
}
```

```json
{
  "type":"MATCHING","prompt":"Match","points":2,
  "metadata":{
    "definitionVersion":1,"kind":"matching","reuseRight":false,
    "left":[{"id":"l1","order":1,"label":"One","labelAr":"واحد"},{"id":"l2","order":2,"label":"Two"}],
    "right":[{"id":"r1","order":1,"label":"1"},{"id":"r2","order":2,"label":"2"},{"id":"r3","order":3,"label":"Distractor"}]
  },
  "answerKey":{"state":"value","value":{
    "keyVersion":1,"kind":"matching",
    "pairs":[{"leftId":"l1","rightId":"r1"},{"leftId":"l2","rightId":"r2"}]
  }}
}
```

New-type metadata is the entire closed definition. It is never an arbitrary
bag/merge. Stable IDs are question-local ASCII identifiers, not positions;
orders are explicit unique integers 1..50. Fill segments reference each blank
exactly once in canonical order. Matching has at least two items per nonempty
side, right >= left, no right reuse. Optional labels normalize null. Text is
NFC-normalized and bounded as in the accepted ST09-A contract: 50 entries,
1000 code points for blanks/labels, 5000 for segments, at most 10000 MEDIA
characters, 64 KiB UTF-8 JSON budget, 4096 nodes, depth 12. Unknown keys,
versions, foreign/duplicate identities, unsafe text and oversized values fail.

Draft authoring permits the accepted structurally empty Fill/Matching
definitions, for example `{"definitionVersion":1,"kind":"fill"}`. Partial
structures must still obey association/cardinality rules. Such questions cannot
publish. No options/expectedAnswer may accompany a new type. A supplied private
Fill/Matching key is complete for the entire definition; MEDIA has no key.

## Definition/key updates and transitions

PATCH replaces the complete provided metadata. Omitted metadata preserves the
current definition. Omitted answerKey preserves only a compatible current key.
These are actual tagged key operations:

```json
{"answerKey":{"state":"value","value":{"keyVersion":1,"kind":"matching","pairs":[{"leftId":"l1","rightId":"r2"},{"leftId":"l2","rightId":"r1"}]}}}
{"answerKey":{"state":"clear"}}
```

A definition change removing/renaming an ID must supply a valid replacement key
or explicit clear. Otherwise the entire PATCH rolls back. Raw `answerKey:null`
is invalid. Clearing maps to SQL NULL. Typed `metadata:null` is invalid; supply
a structurally valid draft definition instead.

Only DRAFT questions are mutable. Type changes preserve questionId and recheck
current state inside the transaction. Current or historical options, answers
or asset relationships block an unsafe typed transition; records are never
deleted to accommodate it. Typed-to-legacy changes require explicit metadata
replacement/clear and deliberate clearing of a remaining private key. Legacy
choice operations reject typed parents at use-case and repository boundaries.

An authorized author response is reconstructed:

```json
{"question":{"questionId":"question-uuid","homeworkId":"homework-uuid","type":"fill_in_blank","prompt":"Capital","instructions":null,"points":1,"sortOrder":0,"isRequired":true,"metadata":{"definitionVersion":1,"kind":"fill","blanks":[{"id":"capital","order":1}],"segments":[{"text":"Capital: "},{"blankId":"capital"}],"maxAnswerLength":1000},"answerKey":{"keyVersion":1,"kind":"fill","blanks":[{"blankId":"capital","acceptedAnswers":["Cairo"]}]},"options":[],"createdAt":"2026-10-28T00:00:00.000Z","updatedAt":"2026-10-28T00:00:00.000Z"}}
```

answerKey appears only on the explicit question author surface after an
independent live management check. General view or submission-review permission
alone does not include it. General assignment, Student and Parent projections
never acquire the private field. Mutation audits contain identities/type/order/
counts only, not definitions, keys or Student answer payloads.

## MEDIA two-step authoring and current-resource authority

Create a valid incomplete DRAFT:

```json
{"type":"MEDIA","prompt":"Watch and explain","metadata":{"definitionVersion":1,"kind":"media","source":null,"answer":{"kind":"text","maxLength":500,"multiline":true}}}
```

Bind an existing authorized managed READY upload or an approved external HTTPS
source through the existing ST06 question asset API. Then PATCH:

```json
{"metadata":{"definitionVersion":1,"kind":"media","source":{"kind":"homeworkQuestionAsset","assetId":"1cfa9aae-0bb7-4c8d-a359-b9a0d2162fd1"},"answer":{"kind":"text","maxLength":500,"multiline":true}}}
```

A raw File UUID, upload UUID, URL, object key or Grades asset is invalid as a
stimulus. The exact active asset must belong to this question/assignment and
tenant. Managed stimuli require current private File/READY session/security
evidence, owner, purpose/context, MIME/category and policy. External sources
remain the existing validated ST06 binding; no arbitrary host fetch occurs.
Incomplete sources cannot publish. Publication and Student writes recheck
current resource evidence in their transaction without provider/network I/O.

Existing byte routes remain the only path:

```text
GET/HEAD /api/v1/student/homeworks/:homeworkId/questions/:questionId/assets/:assetId/preview
GET/HEAD /api/v1/student/homeworks/:homeworkId/questions/:questionId/assets/:assetId/download
```

Core/Teacher equivalents remain under their existing question asset collections.
Use returned ST06 access paths; do not construct generic `/files` access. Actual
GET/HEAD independently verifies membership, target, enrollment, question,
binding, READY and policy, including revocation. Existing secure headers,
private storage, no-store caching, abort handling and Range 200/206/416 rules
remain. A reference is not a capability. Unusable/unauthorized MEDIA sources
are omitted from presentation; Parent receives no source or new byte path.
Submission-only permission does not grant media GET/HEAD.

## Student read and answers

Student detail retains `{ "homework": ... }`, with distinct question types,
public normalized metadata, safe Rich content, existing authorized assets and
stable IDs. Keys, accepted Fill strings, expected Matching pairs, expectedAnswer,
correctness and storage coordinates are absent. Current saved answers remain
in the existing submission/answer wrappers. New answerJson is additive and is
validated before presentation. Invalid stored structured content is withheld
as null, without changing the row.

Fill draft PATCH may contain a subset:

```json
{"answerJson":{"blanks":[{"blankId":"capital","text":"القاهرة"}]}}
```

Final/single-answer validation uses `isDraft:false` where appropriate. A final
required Fill answer covers all blanks. Matching uses stable identities:

```json
{"answerJson":{"pairs":[{"leftId":"l2","rightId":"r1"},{"leftId":"l1","rightId":"r2"}]},"isDraft":false}
```

Output order normalizes by the definition, not request position. Duplicate
left/right assignments or foreign identities are rejected. MEDIA uses:

```json
{"textAnswer":"My manually reviewed response","isDraft":false}
```

MEDIA enforces its definition maxLength and keeps answerJson SQL NULL.
Structured new types reject unrelated text or selected options. Legacy types
retain textAnswer/selectedOptionIds and reject answerJson. No answer-media
uploads, new upload purposes, media analysis or automatic grading exist.

| Request state | Typed behavior |
| --- | --- |
| answerJson omitted in partial PATCH | Preserve a valid existing structured value; never silently clear |
| answerJson object | Normalize against actual current question/definition |
| answerJson null | Invalid JSON null; not a clear |
| `{"clearAnswer":true}` | Explicit clear; structured SQL NULL and/or null MEDIA text; conflicts with supplied answer fields |
| Required final absence/clear | Rejected |
| Optional final absence | Allowed |
| Optional supplied final subset | Rejected; a supplied answer must be complete |

Draft may be incomplete/absent. New typed submission-draft requests may omit
bodyText when supplying answers; both draft aliases retain the same behavior.
Body-only legacy drafts and existing final body/attachment-only behavior remain.
Raw SQL NULL facts accompany private key/structured-answer reads. Prisma JS
null alone never establishes absence. Definitions are mandatory for new types,
so both null forms are invalid definitions. No historical read-time repair.

Bulk save example:

```json
{"answers":[{"questionId":"fill-question-uuid","answerJson":{"blanks":[{"blankId":"capital","text":"Cairo"}]}},{"questionId":"matching-question-uuid","answerJson":{"pairs":[{"leftId":"l1","rightId":"r2"},{"leftId":"l2","rightId":"r1"}]}},{"questionId":"media-question-uuid","textAnswer":"Explanation"}]}
```

For inline submission, send that same answers array with optional bodyText to
either final-submit alias. Requests involving typed content use one governed
transaction. All answers and a first draft roll back on a late error; inline
answers roll back with failed final validation. Duplicate question IDs and
oversized batches (>100) are rejected. The live target serializes simultaneous
saves/clears/submits, including when no submission exists. Final validation
reads current persisted answers and definitions, verifies required and optional
completeness, eligible attachments and current deadline, then commits target
and submission together. Current due date determines SUBMITTED/LATE; replay or
post-SUBMITTED/LATE/REVIEWED writes retain the existing conflict behavior.

## Manual Teacher review, Parent and Grade Sync

Teacher answer GET returns the actual normalized submitted blank/pair mapping
or MEDIA text. Review-only actors receive no private keys. Fill/Matching public
definition data may accompany the review prompt; protected MEDIA source access
still requires the existing question/media surface and permission.

```json
{"awardedPoints":1,"teacherComment":"Manually reviewed"}
{"answers":[{"answerId":"answer-uuid","awardedPoints":1,"teacherComment":"Manually reviewed"}]}
{"reviewNote":"Release completed review"}
```

These bodies apply respectively to individual review, bulk review and final
submission review. Existing point bounds, exact answer/submission identity,
live Teacher allocation, required review completion and manual rollup remain.
Typed review serializes concurrent operations and recomputes current marks;
omitted points/comments preserve a concurrent review. No private key comparison
or new partial-credit/scoring policy exists. Existing Homework Grade Sync still
copies the manually reviewed score to an eligible existing Grades assessment.

Parent responses retain the existing linked-child/target boundary. Draft
answers are withheld. Submitted child answers may contain normalized answerJson;
teacher comments/marks remain withheld until REVIEWED. Parent receives no
private key, Rich AST, MEDIA source, new asset path or private bytes.

## Errors, Rich coexistence and rollout

Malformed/unknown DTO fields use existing validation.failed responses. Typed
definition/key errors map to homework.question.invalid_type_payload; invalid
answers to homework.answer.invalid_payload; required final absence to
homework.answer.missing_required. Ownership mismatches retain 404 and terminal
mutations retain existing 409 codes. Errors/audits never echo rejected private
key or answer values. Invalid stored JSON/version/associations fail closed.

ST08 Rich AST remains independent display-only content. Existing text fallback,
clear/preservation rules and exact authorized Rich asset references remain;
Rich cannot contain private answer keys. Submit-only successful responses do
not require unrelated view/save permission. Existing Student downloads and
assignment/submission attachments are preserved.

Clients must explicitly recognize all eight lowercase response types and new
structured payloads before rollout. An old client must treat an unknown type
as unsupported, never silently render Matching/MEDIA as text or choice. Backend
merge does not authorize frontend/mobile deployment or Production activation.
No new feature-flag architecture is introduced. All 33 migrations/schema/
manifest remain unchanged. DR07 remains pending/Production media disabled;
governed migrations -> verified DB -> compatible runtime remains release order.
