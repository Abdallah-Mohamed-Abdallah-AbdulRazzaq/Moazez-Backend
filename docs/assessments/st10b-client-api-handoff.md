# ST10-B client API handoff V1

This documents backend source support for eleven Homework and eleven Grades interactions under the 2026-10-29 mandate. Frontend/mobile implementations and deployed-client compatibility are not certified here. Production activation, deployment and live migration remain unauthorized. Unknown interactions must be shown as unsupported; never render Ordering/Numeric/Math as an essay, short answer or choice fallback.

All routes retain `/api/v1`, bearer authentication, current School context and existing operation permissions. Examples use illustrative resource IDs; obtain actual IDs from the authorized APIs. No new routes, role grants, upload purpose or media capability is introduced. Render labels/prompts as text or the existing approved Rich AST, never as executable HTML or expressions.

## Author routes and ownership

| Audience | Create | Update / key replacement | Authority |
| --- | --- | --- | --- |
| School Dashboard Homework | POST `/api/v1/homework/assignments/:homeworkId/questions` | PATCH collection + `/:questionId` | Existing Homework management permissions/school scope |
| Teacher Homework | POST `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions` | PATCH collection + `/:questionId` | Existing question-management grant and exact live owned allocation |
| Core Grades | POST `/api/v1/grades/assessments/:assessmentId/questions` | PATCH `/api/v1/grades/questions/:questionId` | Existing Grades question-management/scope authority |

Teacher Homework `classId` is a TeacherSubjectAllocation UUID, not a classroom-wide grant. ST10-B adds no Teacher Grades authoring route or permission. Draft/unlocked/structural guards remain mandatory; published/attempted resources cannot be changed through a new-type escape path. Use the existing publish endpoints after completing definitions: Homework assignment + `/publish`, Teacher assignment + `/publish`, Grades assessment + `/publish`.

## Public definitions and complete answers

The exact same ST10-A definition and answer values are used in each domain:

```json
{
  "definitionVersion": 1,
  "kind": "ordering",
  "items": [
    {"id":"item_a","displayOrder":1,"label":"Step A"},
    {"id":"item_b","displayOrder":2,"label":"Step B"},
    {"id":"item_c","displayOrder":3,"label":"Step C"}
  ]
}
```

```json
{"definitionVersion":1,"kind":"numeric","units":{"required":true,"allowedCodes":["m"],"allowUnitless":false}}
```

```json
{"definitionVersion":1,"kind":"math_expression","variables":["x"]}
```

Complete Student answerJson values:

```json
{"orderedItemIds":["item_b","item_a","item_c"]}
{"value":"12.500","unitCode":"m"}
{"expression":"2*(3+4)"}
```

These are three separate JSON examples. Do not add kind/version/private-key fields to answerJson. Numeric values are strings, not JSON numbers. The canonical saved value for `12.500` is `125e-1`; preserve its exact string representation instead of converting through a binary float. Arabic-Indic/Eastern Arabic-Indic digits and the approved Arabic decimal separator normalize through the same bounded exact rules. No implicit unit conversion exists.

## Author create, replace and clear

Homework create example (Core and Teacher share the body):

```json
{
  "type":"ORDERING","prompt":"Put these steps in order","points":1,"isRequired":true,
  "metadata":{"definitionVersion":1,"kind":"ordering","items":[{"id":"item_a","displayOrder":1,"label":"Step A"},{"id":"item_b","displayOrder":2,"label":"Step B"}]},
  "answerKey":{"state":"value","value":{"keyVersion":1,"kind":"ordering","expectedItemIds":["item_b","item_a"]}}
}
```

For Homework NUMERIC or MATH_EXPRESSION, set type accordingly, use its complete definition above as metadata, and use the matching key below inside the tagged value. Grades create uses the same metadata/key values, `required` instead of `isRequired`, and a plain answerKey:

```json
{
  "type":"NUMERIC","prompt":"Give the distance","points":1,"required":true,
  "metadata":{"definitionVersion":1,"kind":"numeric","units":{"required":true,"allowedCodes":["m"],"allowUnitless":false}},
  "answerKey":{"keyVersion":1,"kind":"numeric","reference":{"value":"12.5","unitCode":"m"},"policy":{"policyVersion":1,"mode":"EXACT"}}
}
```

The three private key values are:

```json
{"keyVersion":1,"kind":"ordering","expectedItemIds":["item_b","item_a","item_c"]}
{"keyVersion":1,"kind":"numeric","reference":{"value":"12.5","unitCode":"m"},"policy":{"policyVersion":1,"mode":"EXACT"}}
{"keyVersion":1,"kind":"math_expression","expression":"2*(3+4)"}
```

PATCH follows the same domain-specific key convention. Homework key replacement is `{"answerKey":{"state":"value","value":...}}`; clear is `{"answerKey":{"state":"clear"}}`. Grades replacement is `{"answerKey":...}`; clear is `{"answerKey":null}`. A key omitted on create is manual-only; omission on update retains only a key valid for the locked final definition. Numeric missing policy is manual-only; malformed policy is an error. Metadata PATCH is a whole closed replacement for new types. Changing item IDs/units/variables must retain a compatible key or explicitly replace/clear it in the same request. No silent key clearing, legacy metadata merging, or choice options is allowed.

Existing author response wrappers are preserved: Homework `{question:{questionId,type,metadata,...,answerKey?}}`; Grades `{id,type,canonicalType,interaction,metadata,...,answerKey?}`. Author-private keys are reconstructed only on the existing authorized author surface. General Student, Parent and review-only projections do not acquire private keys.

## Student Homework

GET `/api/v1/student/homeworks/:homeworkId` retains `{homework:...}`. Questions have distinct lowercase types `ordering`, `numeric`, `math_expression`, closed public metadata, and the existing prompt/Rich/asset fields. The other eight lowercase type identities remain unchanged.

Use PATCH `/api/v1/student/homeworks/:homeworkId/submission/answers/:questionId`:

```json
{"answerJson":{"orderedItemIds":["item_b"]},"isDraft":true}
{"answerJson":{"value":"12.5"},"isDraft":true}
{"answerJson":{},"isDraft":true}
```

The last example is a valid empty Math Draft. Supplied values must always be valid. A complete answer uses the complete answerJson above; `isDraft:false` requests complete answer validation. Optional unanswered questions remain valid, but an optional supplied partial Final answer is invalid. Required absence blocks Final submission.

Explicit clear is `{"clearAnswer":true}` and conflicts with supplied answer fields. Raw `answerJson:null` is invalid in Homework. Omitted answerJson in a partial PATCH preserves a valid stored value. Do not send textAnswer/selectedOptionIds as an alternative representation for these types.

PUT `/api/v1/student/homeworks/:homeworkId/submission/answers`:

```json
{"answers":[{"questionId":"00000000-0000-4000-8000-000000000001","answerJson":{"orderedItemIds":["item_b","item_a","item_c"]}},{"questionId":"00000000-0000-4000-8000-000000000002","answerJson":{"value":"12.5","unitCode":"m"}},{"questionId":"00000000-0000-4000-8000-000000000003","answerJson":{"expression":"14"}}]}
```

The existing result is `{items:[...]}` with answerId, questionId, type, answerJson and isDraft. Single save retains `{answer:...}`. Existing submission-draft aliases remain. Final POST `/api/v1/student/homeworks/:homeworkId/submit` and `/submission/submit` retain the existing body/inline-answers contract and response. An empty body can submit already-saved complete answers; existing body/file-only and empty-submission rules remain unchanged. All mixed typed/legacy answers and first-draft creation are atomic. A later invalid entry rolls back the whole request.

## Student Exams and Core Grades

GET `/api/v1/student/exams/:assessmentId` retains stages/questions. Each new question has exactly these identities, with definition matching its closed metadata:

```json
{"type":"ordering","canonicalType":"ORDERING","interaction":{"kind":"ordering","selectionMode":null,"multiline":false,"supported":true,"definition":{"definitionVersion":1,"kind":"ordering","items":[{"id":"item_a","displayOrder":1,"label":"Step A"}]}}}
```

NUMERIC uses type/kind `numeric`, canonicalType `NUMERIC`; MATH_EXPRESSION uses `math_expression`, canonicalType `MATH_EXPRESSION`. Neither is mapped to essay/text. Existing eight mappings remain unchanged. Student Grades uses the same shared interaction contract at GET `/api/v1/student/grades/assessments/:assessmentId`.

POST exam + `/start` uses the existing attempt/enrollment rules. PATCH exam + `/submission/answers/:questionId` and PUT exam + `/submission/answers` accept the same answerJson values/bulk envelope above. Valid partial objects are IN_PROGRESS drafts; no Homework isDraft field exists here. New-type save requires an explicit answerJson field. An explicit `{"answerJson":null}` clears to SQL NULL; `{}` is not an implicit clear. Complete/optional rules are rechecked on POST exam + `/submission/submit`.

Exam write/read state retains `{assessmentId,status,submission}`; saved answers appear under submission.answers with answerId, questionId, canonicalType, interaction and answerJson. No private key or technical correctness outcome is returned. Replay and post-submit writes retain their existing conflicts. Teacher-assignment category eligibility and Exam category eligibility remain independently governed.

Core Grades retains PUT `/api/v1/grades/submissions/:submissionId/answers/:questionId`, PUT the answer collection, and POST submission + `/submit`. The same ST10 answer contracts apply. No new Core or app route is introduced.

## Manual review and Parent

Teacher Homework retains its existing assignment/submission answer GET, PATCH individual answer + `/review`, PUT answer collection + `/review` with `{"answers":[{"answerId":"...","awardedPoints":1}]}`, and POST submission + `/review` for release. Core Grades uses PATCH submission + `/answers/:answerId/review`, PUT submission + `/answers/review` with `{"reviews":[{"answerId":"...","awardedPoints":1}]}`, and POST submission + `/review/finalize`.

Existing Teacher Classroom Grades routes remain under `/api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId`: GET detail, PATCH `/answers/:answerId/review`, PUT `/answers/review`, POST `/review/finalize`. They retain exact allocation/subject/term/category and existing permission checks. New-type rows additionally provide canonicalType and interaction, while keeping `studentAnswer:{text:null,json:typedAnswer,selectedOptions:[]}`. The historical eight response shapes remain unchanged. Core/Teacher review authority does not grant author-private key access.

Marks, comments, bounds, rollup and review completion are manual. A technical match/difference/undefinedness does not write full/zero/partial marks or trigger synchronization. Homework Grade Sync and Grades Grade Item Sync remain existing explicit, separately authorized operations. No new evaluator-result field is persisted or exposed.

Parent endpoints remain GET `/api/v1/parent/children/:studentId/homeworks/:homeworkId` and `/grades/assessments/:assessmentId`, with the existing linked-child, permissions and release policy. Submitted Homework answers may contain safe normalized typed JSON under the existing release rules; Grades Parent views do not gain structured-answer/authoring capabilities. No Parent Rich/Media access, downloads or private keys are added.

## Errors and stored-data handling

Homework definition/key errors retain `homework.question.invalid_type_payload` (422), answer errors `homework.answer.invalid_payload` (422), and required final absence `homework.answer.missing_required` (422). Grades structured errors retain `validation.failed` (400), with fixed metadata/answerKey/answerJson field details; existing option errors retain their own 422 code. DTO errors remain 400, resource mismatches 404 and terminal/lifecycle conflicts use the established codes. Do not infer resource existence from validation responses.

SQL NULL is absence. Persisted JSON null, future versions and malformed supplied values are withheld/refused; reads never repair them or return raw JSON/text fallbacks. Grades reports unsupported/definition=null for invalid interaction data. A malformed optional supplied value cannot silently become an unanswered Final answer. Retrying an unchanged invalid payload cannot resolve it. Error/audit payloads do not echo private keys, expressions or Student answers.

## Rollout status

`BACKEND_SOURCE_SUPPORT`: eleven explicit types per domain, subject to the final engineering/independent review receipt.

`CLIENT_IMPLEMENTATION_STATUS`: not established by this backend change; no frontend/mobile repository was modified.

`PRODUCTION_ACTIVATION_STATUS`: unauthorized. Governed migrations → verified DB → compatible runtime remains mandatory. DR07 media release remains pending/disabled. No CI outcome, Draft PR or backend source support grants deployment authority.
