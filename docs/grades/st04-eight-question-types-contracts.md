# ST-04 — Eight existing Grades question contracts

Authority: Owner ST-04 order dated 2026-10-24. Verified base
`57b83966b1c57fd7f57cb7fdd62f39b0103a2c81`. Initial isolated checkout is clean.
This document records the source review **before implementation changes**.
Only Q-02/Q-03 and existing-type Q-07/Q-10 are authorized. No schema changes,
backfill, new enum, managed media, Homework change or release-policy change.

## Source-grounded gap matrix (initial)

Legend: AC=ALREADY_CORRECT, RC=REQUIRES_CHANGE, RT=REQUIRES_TEST,
LC=LEGACY_COMPATIBILITY, DR=DECISION_REQUIRED. Each cell includes its source
anchor below. These are findings, not certification claims.

| Type | Authoring | Editing | Publication | Student question | Student answer | Persistence | Reviewer | Lifecycle | Historical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MCQ_SINGLE | AC: >=2 options, exactly 1 correct [A] | RC: retain option identity; validate effective PATCH [B] | RC: final transactional validation [C] | AC/RT: single choice preserved [D] | RC: reject text/JSON alongside exactly 1 option [E] | AC/RC: selected relations; recheck authoritative options/state [F] | AC/RT: manual marks, no private metadata [G] | RT: full HTTP workflow, save/submit races [H] | LC: preserve IDs and submitted selections; safe reads [I] |
| MCQ_MULTI | RC: configured selection bounds [A] | RC: merged limits and stable options [B] | RC: bounds <= active options, final transaction [C] | RC: safe public min/max hints [D] | RC: distinct IDs, min/max, modality isolation [E] | AC/RC: same canonical IDs and single/bulk checks [F] | AC/RT: existing manual review [G] | RT: lifecycle and finalization [H] | LC: defaults for absent limits, no rewrite [I] |
| TRUE_FALSE | RC: two normalized true/false values, no contradictory key [A] | RC: effective definition and IDs [B] | RC: semantic choices, not just count [C] | AC/RC: single selection plus stable boolean semantics [D] | RC: forbid conflicting modalities [E] | AC/RC: existing two-option relations [F] | AC/RT: manual review [G] | RT: HTTP lifecycle [H] | LC: explicit existing boolean author aliases only [I] |
| SHORT_ANSWER | AC/RT: existing prompt/key, private guidance [A] | RC: merged type/key/options validation [B] | RC/RT: complete definition under transaction [C] | AC/RC: distinct short-text limits [D] | RC: bounded text; JSON currently bypasses text [E] | RC: text only, canonical normalization [F] | AC/RT: manual review/points [G] | RT: required progress and terminal states [H] | LC: safe historical reads, malformed JSON not valid progress [I] |
| ESSAY | AC/RT: existing multiline prompt [A] | RC/RT: effective PATCH/type changes [B] | RC/RT: complete definition under transaction [C] | AC/RC: multiline with bounded long-text hint [D] | RC: bound domain-level text, reject JSON/options [E] | AC/RC: text only; no review overwrite [F] | AC/RT: manual review/points [G] | RT: submit/review/finalize [H] | LC: existing 10000-character HTTP limit retained [I] |
| FILL_IN_BLANK | RC: stable bounded blank IDs/order/segments [A] | RC: merge and validate existing definition [B] | RC: require complete, coherent blanks/segments [C] | RC: explicit safe public blanks; metadata is not selected today [D] | RC: canonical per-blank IDs/text; reject unknown/duplicate/missing IDs [E] | RC: typed JSON in existing answerJson [F] | RC/RT: typed submitted values, no accepted-answer leakage [G] | RC/RT: valid-answer progress, complete workflow [H] | LC: explicit safe single-blank text compatibility; undefined legacy structures unavailable [I] |
| MATCHING | RC: explicit public left/right IDs/labels, cardinality [A] | RC: validate merged sides and private pairs [B] | RC: replace nonempty-metadata truthiness [C] | RC: public sides only, no correct-map ordering/linkage [D] | RC: typed real IDs; reject duplicates/reuse/foreign pairs [E] | RC: canonical pairs in existing answerJson [F] | RC/RT: submitted pairing and manual marks [G] | RC/RT: valid-answer progress and full HTTP lifecycle [H] | LC: untyped matchingPairs alone cannot safely define public sides; fail unavailable without fabrication [I] |
| MEDIA | AC: ST-02 HTTPS security; DR: response semantics [A] | RC/RT: effective source definition [B] | RC: source usability and final transaction [C] | RC: allowlisted source distinct from answer; no raw metadata [D] | DR: text or arbitrary nonempty JSON accepted today [E] | DR: canonical permitted response pending Owner decision [F] | AC/DR: manual review, no new scoring [G] | RT/DR: certify only approved existing meaning [H] | LC: safe historical reads; no provider capability resurrection [I] |

### Exact source anchors

- [A] `src/modules/grades/assessments/dto/grade-assessment-question.dto.ts`:
  Create/UpdateGradeAssessmentQuestionDto; `domain/grade-question-domain.ts`:
  normalizeQuestionPayload, validateQuestionOptionsForType, buildQuestionMetadata.
  TRUE_FALSE accepts boolean/value/answer/correct author aliases. Option DTO
  accepts id, but domain normalization currently discards it.
- [B] `application/update-grade-assessment-question.use-case.ts`: execute and
  resolveOptionsForValidation. `infrastructure/grades-assessment-questions.repository.ts`:
  updateQuestionAndReplaceOptions currently retires/recreates all supplied options.
  Omitted options are preserved, but typed metadata and effective definitions are
  not comprehensively validated at the authoritative mutation boundary.
- [C] `domain/grade-assessment-question-publish-domain.ts`:
  validateQuestionForPublish, assertQuestionOptionsValidForPublish,
  assertQuestionBasedPublishReady. `application/publish-grade-assessment.use-case.ts`
  reads questions before `GradesAssessmentsRepository.publishAssessment`; the
  repository transaction currently rechecks access but not that structure.
- [D] `src/modules/grades/shared/presenters/grade-question-contract.ts`:
  presentGradeQuestionContract preserves all eight canonical values and the ST-02
  aliases. StudentExamsPresenter.presentDetail and StudentGradesPresenter's
  presentQuestions project prompts/options, but lack Fill/Matching definitions.
  Their read adapters do not currently select typed question metadata.
- [E] `domain/grade-submission-domain.ts`: normalizeAnswerPayload,
  validateAnswerPayloadForQuestion, validateSelectedOptionsForQuestion.
  Choice types do not reject other modalities; SHORT/FILL/MEDIA accept arbitrary
  nonempty JSON; MATCHING only tests JSON truthiness. Save DTO text limit=10000.
- [F] `application/grade-submission-use-case.helpers.ts`: prepareSingleAnswerSaveInput;
  SaveGradeSubmissionAnswerUseCase and BulkSaveGradeSubmissionAnswersUseCase.
  `infrastructure/grades-submissions.repository.ts`: upsertAnswerWithSelectedOptions,
  bulkUpsertAnswersWithSelectedOptions, submitSubmission, finalizeSubmission.
  ST-02 transaction-time resource authorization exists and must remain intact;
  current typed answer validation predominantly precedes those transactions.
- [G] `domain/grade-submission-review-domain.ts`, ReviewGradeSubmissionAnswerUseCase,
  BulkReviewGradeSubmissionAnswersUseCase, FinalizeGradeSubmissionReviewUseCase;
  `presenters/grade-submission.presenter.ts` and grade-assessment-question.presenter.ts.
  Existing manual correction semantics and GradeItem synchronization are retained.
- [H] `domain/grade-submission-domain.ts`: calculateSubmissionAnswerProgress and
  isAnswerMeaningfulForQuestion; SubmitGradeSubmissionUseCase;
  `test/e2e/grades-question-based.e2e-spec.ts` and `test/security/tenancy.grades.spec.ts`.
  Existing end-to-end evidence covers important MCQ/text paths, not all eight
  complete typed workflows. Add positive and adversarial transaction/API evidence.
- [I] ST-02 sanitizeGradeQuestionContent and existing student adapters/presenters;
  `src/modules/parent-app/grades/` read adapter and ParentGradesPresenter preserve
  published/approved/locked result visibility and child ownership. No question
  detail expansion is authorized. No live historical database is accessed.

## Implementation boundaries and decisions

The existing schema is sufficient. Preserve all routes, legacy type aliases,
error/status conventions, manual grading and GradeItem release/sync behavior.
Share typed domain parsing/validation and explicit public projection builders;
do not return raw metadata or recursively blacklist renamed secret fields.

New typed structured definitions use existing metadata/answerJson. Historical
records are read without rewrite. Only explicitly validated, documented legacy
shapes are normalized; other structures report interaction.supported=false.
Do not count malformed historical answers as valid required progress.

MEDIA decision request was submitted to the Owner before implementing a response
contract: source `validateAnswerPayloadForQuestion` accepts text or arbitrary JSON,
while the authoring fixture only specifies an external video stimulus and
“Watch and answer”. Recommended boundary: approved HTTPS stimulus plus the
already accepted bounded, manually reviewed text response; no new response assets
or undefined JSON mode. The Owner resolved ST04_MEDIA as APPROVED on 2026-10-24:
external HTTPS stimulus; answerText only; the existing 10000-character bound;
manual review; strict rejection of JSON/options/file/audio/video modes on new
writes; safe historical reads without reinterpretation or rewrite. No managed
upload, schema change, migration or operational release is authorized. MEDIA
certification now follows that explicit decision and remains evidence-gated.

## Initial verification plan (recorded before implementation)

Extend real PostgreSQL-backed Nest/Supertest Grades flows for all approved types:
author/edit/publish → both student projections → single/bulk save/retry → submit
→ authorized manual review → finalize/sync → existing Parent result visibility.
Include invalid create/PATCH/publish, wrong/duplicate/deleted references, mixed
modalities, missing required answers, nested secret/URL input, historical rows,
concurrent publish/edit and save/submit/revocation, and marks/terminal-state limits.
Retain SCORE_ONLY, ST-01, ST-02 and disabled ST-03 regressions.

The implemented contracts, endpoint inventory and adversarial evidence below
complete this initial plan; final execution receipts are supplied in the handoff.

## Implemented version-one contracts

The following additions preserve legacy routes, `type`, `canonicalType`,
`interaction.kind/selectionMode/multiline/supported`, and manual scoring.
`interaction.definition` is additive. It is an explicit allowlist, never raw
metadata. Unsupported historical definitions retain their canonical type but
return `supported:false` and `definition:null`; unknown types retain the ST-02
null canonical type and unsupported kind. Unsupported non-choice option data
and untyped answer JSON are not forwarded as alternate interactions.

### Bounds and representations

- SHORT_ANSWER new writes: 1000 Unicode code points; ESSAY and MEDIA: the existing
  10000-code-point HTTP bound. New writes normalize line endings and NFC, trim
  answers, reject empty text, unpaired surrogates and unsafe control characters.
- Stored SHORT_ANSWER text has an explicit compatibility path up to its former
  10000-character bound, provided it has no JSON/options. That path is used only
  for stored reads/progress/submit/review, never new saves; no row is rewritten.
- Fill: 1–50 stable IDs, unique explicit order (array order is the documented
  default), at most 50 ordered segments, exactly one segment reference per blank,
  and at most 1000 characters per blank answer. Text segments preserve spacing.
- Matching: 2–50 left and right items, bounded 1000-character localized labels,
  right count at least left count, no repeated right assignment. Correct pairs
  are private `answerKey` guidance and are never used for automatic scoring.
- Optional questions may be omitted. A saved optional structured response may be
  partial but must contain at least one valid entry. Required structured answers
  must include every defined left/blank ID exactly once.
- Choices persist selected option relations; text persists only answerText;
  Fill/Matching persist only canonical answerJson. Incompatible modalities and
  extra structured keys are rejected. Historical mixed/uninterpretable JSON is
  unavailable, not a newly invented response format.

### Author, public question and answer examples (all eight)

Every author body also includes `prompt`, positive `points`, `required` and the
existing optional localized fields. Full HTTP examples are fixed in
`test/fixtures/grades-eight-types.fixture.ts`; the HTTP suite exercises them
through actual authoring, student, reviewer and Parent controllers.

| Type | Author definition (in addition to common fields) | Public definition | Valid answer / stored representation | Representative rejection |
| --- | --- | --- | --- | --- |
| MCQ_SINGLE | >=2 options with label/value/order, exactly 1 correct | choice, min=1/max=1; public option IDs/labels | `{"selectedOptionIds":["<own-active-option-uuid>"]}`; selected relation, text/JSON null | two selections, duplicates, foreign/deleted ID, text or JSON |
| MCQ_MULTI | >=2 options, >=1 correct; metadata minSelections/maxSelections | choice with validated current bounds | `{"selectedOptionIds":["<id-a>","<id-b>"]}`; distinct selected relations | too few/many, maximum above active count, duplicates, conflicting modality |
| TRUE_FALSE | `answerKey:true` creates the existing True/False choices, or two explicit true/false options with one correct | single choice with canonical boolean semantics | one selected option ID; selected relation | ambiguous values, contradictory key aliases, two selections or a JSON boolean |
| SHORT_ANSWER | optional private answerKey/guidance, no options | text, maxLength=1000, multiline=false | `{"answerText":"A short response"}`; answerText only | whitespace, >1000 new characters, JSON or options |
| ESSAY | optional private guidance, no options | text, maxLength=10000, multiline=true | `{"answerText":"A multiline\nresponse"}`; answerText only | >10000 characters, JSON, options, unsafe Unicode |
| FILL_IN_BLANK | metadata blanks and segments; optional private accepted answers | ordered public blank IDs/positions, segments, maxAnswerLength=1000 | `{"answerJson":{"blanks":[{"blankId":"capital","text":"Paris"},{"blankId":"river","text":"Seine"}]}}`; canonical ordered JSON, text null | unknown/duplicate/missing required IDs, malformed/oversized entries |
| MATCHING | metadata left/right public items and reuseRight=false; optional private answerKey.pairs | public sides and cardinality; no correct relationships | `{"answerJson":{"pairs":[{"leftId":"l1","rightId":"r2"},{"leftId":"l2","rightId":"r1"}]}}`; ordered pairs, text null | unknown IDs, missing required left, reused right or duplicate left, arbitrary maps |
| MEDIA | approved ordinary external HTTPS mediaUrl with bounded title/mode hints | media source plus separate text answer descriptor, maxLength=10000 | `{"answerText":"A manually reviewed response"}`; answerText only | JSON, options, file/audio/video fields, signed/provider URLs, empty/oversized text |

Fill author metadata example:

```json
{
  "blanks": [{"id":"capital","order":1},{"id":"river","order":2}],
  "segments": [
    {"text":"Capital: "},{"blankId":"capital"},
    {"text":" River: "},{"blankId":"river"}
  ]
}
```

Matching author metadata example (private answerKey is a separate author field):

```json
{
  "left": [{"id":"l1","label":"France"},{"id":"l2","label":"Egypt"}],
  "right": [{"id":"r1","label":"Cairo"},{"id":"r2","label":"Paris"}],
  "reuseRight": false
}
```

MEDIA public interaction example:

```json
{
  "kind":"media","selectionMode":null,"multiline":false,"supported":true,
  "definition":{
    "kind":"media",
    "source":{"url":"https://media.example.org/lesson.mp4","title":"External stimulus","mode":"video"},
    "answer":{"kind":"text","maxLength":10000,"multiline":true}
  }
}
```

The legacy outer MEDIA multiline flag is preserved; the additive answer
descriptor states the actual text response capability. Mode/title are display
hints, not upload, preview, download or READY capabilities. No external URL is
fetched or described as scanned/verified media.

### Editing and option identity

PATCH validates the effective definition again against authoritative data inside
the write transaction. Omitted fields are preserved; explicit answerKey/metadata
null clears the field. Metadata is an atomic replacement when supplied. Existing
top-level MEDIA aliases merge into current metadata at the transaction boundary,
so a title-only edit retains its source. Type changes require explicitly clearing
or replacing incompatible existing options, metadata and keys.

For option PATCH, an explicit existing `id` must belong to this active question;
duplicates/foreign/retired IDs are denied. A legacy option body without IDs keeps
the active option occupying that sort position. Explicit IDs support stable
reorder. Removed options are soft-retired; retained identities are updated rather
than recreated. Structural writes remain prohibited after publication/attempts.

### Actual REST inventory (all paths start with /api/v1)

| Method/path | Existing permission | Behavior |
| --- | --- | --- |
| POST /grades/assessments/question-based | grades.assessments.manage | Existing create; common academic scope and maxScore |
| POST /grades/assessments/:assessmentId/questions | grades.questions.manage | Existing author body above; server option IDs |
| PATCH /grades/questions/:questionId | grades.questions.manage | Existing PATCH; effective typed validation and stable IDs |
| GET /grades/assessments/:assessmentId/questions | grades.questions.view | Existing read; answer keys remain gated by grades.questions.manage; additive public interaction |
| POST /grades/assessments/:assessmentId/publish | grades.assessments.publish | Existing publish; locked authoritative completeness/points check |
| GET /student/exams/:assessmentId | grades.assessments.view | Existing Student Exams envelope/aliases; additive safe definition |
| GET /student/grades/assessments/:assessmentId | grades.assessments.view | Existing Student Grades envelope; same safe definition |
| POST /student/exams/:assessmentId/start | grades.submissions.start | Existing own enrollment/submission start |
| GET /student/exams/:assessmentId/submission | grades.submissions.view | Existing own state; safe typed stored answers |
| PATCH /student/exams/:assessmentId/submission/answers/:questionId | grades.submissions.save | Existing single save; canonical answer payload |
| PUT /student/exams/:assessmentId/submission/answers | grades.submissions.save | Existing atomic bulk `{answers:[{questionId,...payload}]}` |
| POST /student/exams/:assessmentId/submission/submit | grades.submissions.submit | Existing submit; authoritative valid required progress |
| POST /grades/assessments/:assessmentId/submissions/resolve | grades.submissions.submit | Existing staff resolve; school/allocation scope retained |
| PUT /grades/submissions/:submissionId/answers/:questionId | grades.submissions.submit | Existing core save; same rules as Student adapter |
| PUT /grades/submissions/:submissionId/answers | grades.submissions.submit | Existing core bulk save; same rules |
| POST /grades/submissions/:submissionId/submit | grades.submissions.submit | Existing core submit |
| GET /grades/submissions/:submissionId | grades.submissions.view | Existing authorized reviewer projection, no private author keys |
| PATCH /grades/submissions/:submissionId/answers/:answerId/review | grades.submissions.review | Existing manual bounded scoring |
| PUT /grades/submissions/:submissionId/answers/review | grades.submissions.review | Existing atomic bulk manual review |
| POST /grades/submissions/:submissionId/review/finalize | grades.submissions.review | Existing finalization; authoritative reviewed marks/required answers |
| POST /grades/submissions/:submissionId/sync-grade-item | grades.submissions.review | Existing explicit synchronization; no premature GradeItem creation |
| GET /parent/children/:studentId/grades/assessments/:assessmentId | grades.assessments.view + grades.submissions.view | Existing child/release result projection, no question/solution expansion |

No route was introduced or renamed. Existing success statuses and domain error
codes are retained: validation.failed (400), non-disclosing not_found (404),
grades.answer.invalid_option (422 where applicable), grades.question.points_mismatch
(422), grades.submission.already_submitted / grades.submission.locked and review
terminal conflicts (409). Existing HTTP permission guards still return 403;
revocation discovered only at the final mutation boundary denies that resource.

### Transaction and historical guarantees

Question writers/publication share an assessment mutex; answer saves, submit,
review and finalization reload authoritative state under assessment/submission
locks. Current membership, existing operation-specific permission, tenant,
student/enrollment and relevant academic relationships are checked/locked.
Teacher allocation share locks remain in place. Relevant question/option rows
are protected while saving. Bulk validation finishes before answer writes.
Review finalization recomputes marks from locked current answers.

Historical incomplete Fill, untyped Matching, undefined MEDIA JSON and mixed
modalities are controlled unavailable records; no data is invented or rewritten.
Known valid text/option relationships and the explicit single-blank text alias
remain readable. Parent results and already finalized GradeItems retain their
existing release policy. Undefined legacy required responses cannot be falsely
counted complete or automatically repaired; that limitation is explicit.

## Evidence status

Local certification passed: 294 affected unit tests; 284 real PostgreSQL/HTTP/security/integration tests across 12 suites; 241 Node governance tests; build/postbuild; Prisma validation; 30 unchanged migrations, status and deploy no-op. Non-fixing lint comparison against the hash-verified base reports 355 baseline diagnostics and 330 candidate diagnostics with zero introduced. Full repository lint was not run; inherited diagnostics remain.

The source ownership planner discovers 1007 files, 997 active and 10 historical/manual exclusions, including the two new explicitly asserted ST-04 test owners. Exact-head CI is a separate delivery gate; final run/attempt, artifact provenance, executed inventory and cleanup receipts are supplied in the implementation handoff and derived from that run rather than assumed from a previous stage.

## Acceptance and adversarial review evidence

The fixed author/request examples are in `test/fixtures/grades-eight-types.fixture.ts`
(`gradeEightAuthor`, `gradeEightAnswer`). The real HTTP/PostgreSQL suite
`test/e2e/grades-eight-question-contracts.e2e-spec.ts` runs both parameterized
workflows for **each** enum value: teacher lifecycle and school-administrator
negative authoring/publication. The teacher workflow reads both Student Exams
and Student Grades, checks actual persistence, exercises both save routes, submits,
reads the reviewer projection, rejects excessive marks, reviews, finalizes,
synchronizes GradeItem and checks both parent release and unrelated-child denial.

| Type | Public definition / canonical persisted answer | Negative and historical evidence |
| --- | --- | --- |
| MCQ_SINGLE | choice 1..1; selected option relation only | Foreign/retired option, two selections, JSON/text conflict; preserved IDs and safe unsupported malformed legacy choices |
| MCQ_MULTI | choice configured min..max; distinct selected relations | Bounds against active count, duplicates, foreign/retired options, mixed modality; no implicit conversion to SINGLE |
| TRUE_FALSE | canonical true/false values, choice 1..1; selected relation | Contradictory key/value, duplicate truth values, mixed modality; old aliases retained |
| SHORT_ANSWER | text max 1000 code points; answerText, null JSON | Blank/oversized/JSON/options rejection; existing valid plain text up to 10000 remains readable/submittable/reviewable without rewrite |
| ESSAY | multiline text max 10000; answerText, null JSON | Blank/oversized/JSON/options rejection; existing valid text preserved |
| FILL_IN_BLANK | explicit ordered blanks and segments; `{blanks:[{blankId,text}]}` | Unknown/duplicate/missing IDs rejected in both HTTP saves; explicit one-blank text alias; undefined old structures unavailable |
| MATCHING | public left/right IDs and labels, reuseRight=false; `{pairs:[{leftId,rightId}]}` | Wrong/duplicate/missing IDs and right reuse denied; private correct pairs never projected; untyped old JSON unavailable |
| MEDIA | approved HTTPS stimulus plus multiline text max 10000; answerText, null JSON | Signed/storage URLs, empty/oversized/JSON/file/options denied in both saves; exact Unicode bound; old undefined JSON unavailable with unchanged DB row |

`grade-question-interaction.spec.ts` provides fixed positive/negative domain
examples and boundary assertions. Presenter suites separately verify canonical
aliases, nested private-guidance isolation and unsupported historical projections.
No correctness key or correct-pair relation becomes part of public metadata.

| Red-team question | Source enforcement and regression evidence |
| --- | --- |
| 1. Another question's option? | validateSelectedOptionsForQuestion and final validateAnswerSave; all-type HTTP foreign IDs and ST-02 security cases |
| 2. SINGLE two selections through another field? | normalizeTypedGradeAnswer isolates modalities and 1..1 bounds; domain and both HTTP save routes |
| 3. MULTI limit bypass? | gradeQuestionDefinition validates active-count bounds; strict typed save; administrator negative and teacher workflow |
| 4. Stale/deleted option? | Final current-option query/share locks and ownership validation; single/bulk option-retirement race tests |
| 5. Text via arbitrary JSON? | Typed text parser rejects any nonnull JSON; SHORT/ESSAY domain and HTTP cases |
| 6. Nonexistent blank? | Explicit identifier membership/uniqueness/completeness; Fill structured-ID HTTP cases |
| 7. Matching relation exposure/invalid shape? | Separate public sides from private key; typed pair allowlist; both student views, reviewer privacy and structured-ID cases |
| 8. MEDIA signed URL/asset reference? | Existing content policy plus text-only modality; MEDIA adversarial HTTP tests and ST-02 content security |
| 9. Nested solution exposure? | Explicit public definition/answer allowlists, content sanitization; renamed nested private-guidance assertions across both student and reviewer views |
| 10. Wrong teacher subject/class? | Existing scoped assessment/submission predicates and allocation locks; full tenancy.grades security suite |
| 11. Submitted structure/answer race? | Shared parent mutex, fresh status/publication/question validation; stale publication, submit/save and question-retirement HTTP races |
| 12. Unsupported history presented as usable? | Controlled interaction.supported=false/definition=null and safe answer projection; malformed historical MEDIA/definition test, no DB rewrite |
| 13. Student surfaces disagree? | Same presentGradeQuestionContract and presentSafeGradeAnswer; both surfaces compared for all eight types |
| 14. Parent unreleased detail? | Existing parent child/release policy unchanged; all-type before-release and unrelated-child denial plus Parent closeout regression |
| 15. Earlier-stage interference? | No Homework/File/AssessmentMedia/schema/runtime-gate edits; dedicated ST-01 private-byte and ST-03 lifecycle/security regression suites |
| 16. Bulk/single disagreement? | Shared canonical domain parser and final transactional validation; all-type persisted-answer parity and paired negative/race cases |
| 17. Option replacement orphaning? | Active owned identity retained, removed IDs soft retired; structural changes barred after protected attempts; explicit and legacy option-edit HTTP tests |
| 18. Review marks outside limits/race? | Existing awarded-point bounds rechecked against fresh answer inside mutation; fresh terminal-state check and recomputed final total; all-type excessive-score and concurrent-finalization tests |

Current membership/permission/enrollment revocation after a successful use-case
read is tested independently for both single and bulk saves. The ST02-R01
repository regression now uses owned disposable roles with real existing write
permissions; it still checks that every affected submission is reauthorized
before any write. Its old broad-roster fixture now populates the academic scope
columns and uses valid MCQ option relations, so ownership tests remain meaningful
under final-boundary typed validation. No shared role or IAM seed is changed.

### Client use

Use `canonicalType` with `interaction.supported` and the additive `definition`.
Preserve legacy outer fields for existing clients. Render a controlled unavailable
state for unsupported definitions; do not infer usable blanks, pairs or a MEDIA
answer mode from unknown historical JSON. Use server option/blank/side IDs,
selection bounds, segment order and text limits. Do not send multiple modalities.
Display the MEDIA source as an external stimulus and collect only text; it is not
a managed-file capability or evidence of scanning. Reviewer clients use the
existing manual scoring endpoints and must handle terminal-state conflicts.
