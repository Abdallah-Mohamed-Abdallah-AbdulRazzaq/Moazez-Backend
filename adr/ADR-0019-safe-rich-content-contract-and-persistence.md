# ADR-0019: Safe Rich Content V1 and isolated nullable persistence

## Status and authority

Proposed for independent Backend review, 2026-10-26. The Owner's ST08-A
order section 9.1 conditionally authorizes the smallest additive nullable
columns after a source-backed comparison. This ADR precedes schema edits.
It authorizes no deployed migration, API activation, ST08-B/C or media release.

## Evidence and decision

At authorized main `0f28b3ae637670b0db1e5ccab0f90259b25e40e2`,
`homework-question.dto.ts` bounds prompt/instructions/text at 8000/4000/1000;
`grade-assessment-question.dto.ts` bounds prompts/labels at 5000/1000.
`grade-question-interaction.ts` owns blanks, segments, matching IDs and MEDIA
definitions in metadata. `update-grade-assessment-question.use-case.ts` merges
metadata patches, and `grade-question-content-policy.ts` sanitizes public
metadata. Homework metadata remains generic JSON. Neither domain reserves a
collision-free rich namespace. Existing presenters explicitly project legacy
fields; `replaceOptionsPreservingIdentity()` reuses actual option IDs (or the
existing legacy sort-order lookup), retires unused rows and never reassigns IDs.

| Criterion | A: metadata namespace | B: nullable dedicated `richContent` |
| --- | --- | --- |
| Source of truth/version | Competes with interaction metadata | Independent V1 envelope |
| Collisions/validation | Merge/sanitization can overwrite or strip AST | One canonical strict boundary |
| Legacy fields/read validation | Easy accidental metadata exposure | Existing projections unchanged; future reads validate separately |
| Author/Student/Review privacy | Generic metadata is not display-only | Strict display schema rejects answer/correctness fields |
| Option identity | Namespace can move in replacement payload | Column belongs to stable option row; future mutation must bind by ID |
| Partial updates/clear | Generic null/merge behavior is ambiguous | Omit = preserve; DbNull = clear; JsonNull = invalid |
| Transactional writes | Existing merges need special casing | Future domain transactions write text and validated AST atomically |
| Schema parity/release order | No DDL, but unproven isolation | Four nullable JSONB columns, governed manifest/replay before runtime |
| Integrity/compatibility/extensibility | Unsafe collision assumption | No defaults/backfill/new FK or identity changes; versioned extension |

Choose **B**: `richContent Json? @map("rich_content")` on HomeworkQuestion,
HomeworkQuestionOption, GradeAssessmentQuestion and GradeAssessmentQuestionOption.
Question envelopes hold a stem and optional instructions/Arabic stem; option
envelopes hold a label and optional Arabic label. One column per entity avoids
unnecessary columns and keeps associated display documents atomic. Existing
metadata, answers, scoring, IDs and HTTP contracts remain unchanged.

The pure `src/common/rich-content/` library accepts unknown data and reconstructs
only approved shapes. No renderer, TeX runtime, dependency, resource access,
Prisma or Nest import. Scientific content uses finite structured expressions
and element/count/charge/state/reaction data; no macros, solver or scorer.
Limits apply before serialization, cloning and schema recursion. A bounded JSON
parser checks input bytes/depth before native parsing; stored values use the
same canonical validator. Future versions/invalid data are classified without
rewriting the row or returning rejected content.

## Consequences and boundaries

Four additive nullable columns are demonstrably backward compatible: no
default, DML, backfill, historical rewrite, index, permission or route. Schema
introspection/manifest and real PostgreSQL tests must prove parity, historical
rows and SQL NULL versus JSON null. Generate and review one canonical migration
before its first application; all historical SQL bytes remain immutable.
Deployment remains Governed Migration → Verification → Compatible Runtime.

ST08-B/C must implement the documented source-of-truth updates inside existing
authorization transactions. Legacy edits must clear contradictory AST; no
current use case accepts rich input. Asset UUIDs are structural only; exact
question/tenant/audience, active binding, READY provenance and private-byte
reauthorization stay domain-owned. Existing ST05/06/07 retention and Student
term checks remain intact. No new asset endpoints, permissions, file capabilities,
frontend renderer or answer semantics.

See `docs/assessments/st08-safe-rich-ast-contract.md` for schemas, limits,
fallback/update rules, resolver obligations, integration maps and tests.
Reject A until collision-free isolation can actually be proven. A new parser
dependency, wider content grammar, schema rewrite or runtime activation requires
separate authority. Recovery is a compatible forward fix; no reset/resolve.
