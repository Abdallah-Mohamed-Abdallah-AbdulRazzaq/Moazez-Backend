# ADR-0020: Homework typed foundation and inactive runtime boundary

## Status and authority

Proposed for independent Backend review, 2026-10-27, under the Owner's approved
ST09-A foundation mandate. ST09-B/C, deployed migration, runtime activation,
automatic marking and Production media release are not authorized.

## Source evidence and decision

Homework has five operational types, generic metadata and explicit question/
answer read selections. Grades has a separate eight-type interaction model.
Homework authoring/publication currently classifies all non-choice types as
text; answer normalization otherwise falls through to choices. Merely adding
enum values would therefore enable incomplete behavior.

Append only FILL_IN_BLANK, MATCHING and MEDIA to the existing Homework enum.
Add only nullable HomeworkQuestion.answerKey and
HomeworkSubmissionAnswer.answerJson JSONB columns. No default, historical DML,
backfill, new relation, index, trigger, permission or Grade schema change.

For these three future types, the **entire existing question metadata value**
is a closed `definitionVersion: 1` public definition, differentiated by
`kind: fill | matching | media`. Legacy five-type metadata remains unchanged.
Future typed authoring replaces a complete validated definition, rather than
merging arbitrary author metadata into a trusted namespace. This needs no
third definition column or later database redesign for the approved types.

Keys are separate `keyVersion: 1` private fill/matching envelopes in answerKey.
If supplied, a key covers all blanks/left items, with no foreign IDs or right
reuse. No MEDIA key or automatic scoring is introduced. Fill/Matching answer
objects use answerJson; MEDIA uses bounded existing textAnswer and SQL NULL
answerJson. Question-local stable IDs and explicit unique order values govern
normalization, independently of input array positions.

Adopt the Grades reference ceilings of 50 structured entries, 1000 characters
per blank/label and 10000 for MEDIA text. Homework owns the contracts, limits,
validators and exceptions; it imports no Grades lifecycle/repository/scorer.
Plain JSON also has a 64 KiB conservative UTF-8 budget, 4096 nodes and depth 12.

MEDIA references only an existing HomeworkQuestionAsset UUID. Syntax and
structural completeness prove neither ownership nor READY state nor access.
Future runtime must reuse ST06 exact assignment/question/tenant authority,
READY/private File provenance and policy, then reauthorize protected bytes.
No raw File/upload/provider identity or permissive URL field is accepted.

Keep explicit original-five runtime allowlists in shared authoring DTOs,
normalizers, repository writes and public presenters. Check all current types
at final submit and publication boundaries, including optional unanswered
questions. Existing selectors exclude the two new fields; no DTO/response is
expanded. New-type input/presentation remains denied until later approval and
client readiness. Never impersonate a new type as text/choice.

The existing publish array transaction cannot inspect current types and abort
before target writes. Replace only that transaction with a bounded callback:
assignment row lock, current active-type read, guard, then the same target and
status mutations. It acquires no allocation lock after assignment and adds no
provider I/O. Other publication rules and target/grading behavior are unchanged.

SQL NULL is absence; stored JSON null or invalid/future JSON is invalid and
withheld. Classifiers require authoritative SQL-null evidence. Explicit tagged
clears map to Prisma.DbNull; raw null is never promoted into a typed value.

## Verification and later dependencies

See `docs/assessments/st09a-homework-typed-foundation-contract.md` and the A1
discovery matrix. Require generated/reviewed immutable migration SQL, canonical
manifest, fresh PostgreSQL replay, no-op second deploy, zero drift, historical
row preservation, privacy and actual HTTP no-activation evidence. Migration
governance, ST05/ST08-A prerequisites and migration-before-compatible-runtime
release order remain mandatory. ST06/ST08/Grades behavior remains protected.
