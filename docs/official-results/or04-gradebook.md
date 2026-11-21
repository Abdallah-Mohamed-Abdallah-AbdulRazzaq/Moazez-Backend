# OR04 gradebook and roster reconciliation

The grid and per-student view use the same canonical slot. Filter the grid
by student ID for individual editing. Manual requests carry the selected
definition, structural sheet revision and expected version for every cell.
A missing cell begins at version zero. Explicit clear creates a new missing
value revision with the supplied reason. Zero, false and text are their own
recorded values.

A grid mutation validates all changes before applying conditional SQL writes.
Same-cell conflicts abort the batch. Disjoint edits can succeed against the
same structural revision while data generation advances. Shared structural
locks coordinate with roster and schema changes. The current academic tuple,
student placements and current field restrictions are checked inside the write.

## Decisions

| Record | Class | Decision |
| --- | --- | --- |
| OR04-01, 2026-11-21 | B | Use reduced BigInt fractions for arithmetic, one pinned display rounding step and six-place HALF_UP normalized percentages. Thresholds and grade bands compare the unrounded fraction. |
| OR04-02, 2026-11-21 | B | Keep per-cell conditional writes separate from the data-generation counter. Compare explicit zero-version inserts against the database unique constraint and append cell history in the same transaction. |
| OR04-03, 2026-11-21 | B | Reconcile actual placement with a persisted school-reviewed preview and an append-only placement revision. A transfer preserves the slot ID. It carries values only through compatible, explicit field mappings. |
| OR04-04, 2026-11-21 | B | Let a destination sheet materialize eligible unclaimed slots and report pending transfers. A current owner keeps each already-claimed slot until a school reconciliation. |
| OR04-05, 2026-11-21 | B | Keep school-approved group exemption separate from a field-level NOT_APPLICABLE and from academic enrollment. |

The gradebook filters out protected fields and unapproved computed disclosures
before building each response. School-only notes stay in staff projections
where the actor can read them. Change history retains prior values and
attribution after explicit clear or reconciliation.

The [implementation ledger](../../verification/implementation-ledger.json)
and [acceptance matrix](../../verification/acceptance-matrix.json) record the
executed fixture checks and evidence expected from later phases.
