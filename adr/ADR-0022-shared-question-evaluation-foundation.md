# ADR-0022: Inactive shared Ordering, Numeric and Expression foundation

Status: implementation authorized for ST10-A; independent review pending.

Use a pure technical foundation in `src/common/question-evaluation`. Keep public
definitions, private keys, student answers, syntax validity and proof outcomes
separate. Use bounded BigInt decimal/rational arithmetic, a closed expression
grammar and manual outcomes outside the constant proof subset. Do not award marks.

Append the three values to each independent domain enum through one governed
migration. Database representation does not grant runtime capability. Existing
eight-type dispatch remains authoritative until separate ST10-B approval.

The source-first change reasons, exact contracts, limits and no-activation matrix
are in [the ST10-A contract](../docs/assessments/st10a-question-evaluation-contract.md).
No dependency, new business module, public API, permissions, storage, lifecycle or
Production release is introduced.
