# OR03 template authoring and scope resolution

The platform starter version is immutable and contains the 20/30/50 score
components, a calculated total, a family note, and a protected school note.
Cloning creates school-owned UUIDs for fields and release units, retains source
lineage, and rewrites formula and release references. School templates and
freeform teacher designs materialize the same sheet and student slot model.

A scope assignment pins an activated version. Scope resolution compares
academic, group and reporting-period containment against current school facts.
Incomparable or equivalent-scope rules with different definitions are
conflicts. Explicit classroom lists remain fixed. School and teacher
materialization re-resolves the persisted preview and uses exact tenant and
allocation checks before writing. Receipts bind the actor, key and request.
School grants cover non-term subject and custom-group teacher access.

Draft adoption and school acceptance use separate pointers. A MANAGED teacher
can stage and adopt a personal definition in an allocated classroom while
grade release still requires the applicable acceptance and review. Adoption
validates explicit field IDs, retained values and the preview fingerprint.
Restricted values require trusted authority. The sheet upgrade retains the
raw score when a maximum changes and checks that the retained value fits the
target definition.

## Phase decisions

| Record | Class | Decision |
| --- | --- | --- |
| OR03-01, 2026-11-21 | B | Persist normalized definitions alongside typed field/release records. Keep version provenance and rules on the canonical sheet. Typed cells remain authoritative for grades. |
| OR03-02, 2026-11-21 | B | Fingerprint concrete scope, policy, rules, and exact ordered roster evidence. Natural-key locks serialize duplicate materialization and the database enforces canonical slot identity. |
| OR03-03, 2026-11-21 | B | Permit pre-review draft selection. Teacher mappings protect both the selected and the last school-accepted field metadata. The school reviews the exact content digest. |
| OR03-04, 2026-11-21 | A | Preserve the existing Teacher App route inventory under its prior namespace and verify Official Results routes separately against the catalog. Update IAM regression counts and assert the exact new grants. |

The phase evidence and unresolved cross-phase verification are recorded in the
[implementation ledger](../../verification/implementation-ledger.json) and
[acceptance matrix](../../verification/acceptance-matrix.json).
