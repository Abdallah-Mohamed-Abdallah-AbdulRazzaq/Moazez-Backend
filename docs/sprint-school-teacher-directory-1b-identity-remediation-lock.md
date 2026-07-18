# School Teacher Directory 1B-0R Identity Remediation Lock

## 1. Branch and baseline

- Branch: `feat/school-teacher-directory-1b-identity-remediation-lock`
- Baseline and current HEAD: `5b598c69767e2a5d6cb714dc3c774b3d41bcf1a4`
- Environment class: `local persistent development`
- Inspection mode: read only
- Database rows written: 0

## 2. Predecessor evidence

The accepted predecessor evidence is recorded in
`docs/sprint-school-teacher-directory-1b-deployment-evidence.md`:

```text
1A migration: APPLIED
Migration history: PASS
Unsupported Teacher identities: 18
Eligible backfill candidates: 0
Backfill rows written: 0
```

This phase independently reproduced that unsupported population. It did not
reinterpret any record as an approved 1A backfill candidate.

## 3. Fixed classification time

All database classifications and the existing-classifier cross-check used:

```text
2026-07-18T16:36:19.198Z
```

No per-record timestamp is retained in this document.

## 4. Target-universe contract

A target record is a non-deleted User whose current type is `TEACHER` and who
has both:

1. zero exact operational Teacher Memberships; and
2. zero non-deleted TeacherProfiles.

An exact operational Teacher Membership requires an active, unended,
non-deleted Membership with a School, Teacher Membership type, a live Teacher
Role, a global or same-School Role boundary, valid School/Organization linkage,
and non-deleted tenant relations.

The target count is computed from bounded reads; it is not hard-coded as the
classification result.

```text
Locked expected target: 18
Computed target: 18
Data baseline moved: NO
```

## 5. Exclusive Membership cohorts

| Cohort                      |  Count |
| --------------------------- | -----: |
| No Membership history       |     18 |
| One Membership history      |      0 |
| Multiple Membership history |      0 |
| **Target population**       | **18** |

Every target entered exactly one cohort.

## 6. One-Membership subtypes

| Subtype                             | Count |
| ----------------------------------- | ----: |
| Tenant-link mismatch                |     0 |
| Schoolless Membership               |     0 |
| Teacher-footprint mismatch          |     0 |
| Exact historical Teacher Membership |     0 |
| Non-Teacher Membership              |     0 |
| **One-Membership total**            | **0** |

## 7. Multiple-Membership subtypes

| Subtype                              | Count |
| ------------------------------------ | ----: |
| Cross-Organization history           |     0 |
| Cross-School history                 |     0 |
| Mixed or mismatched history          |     0 |
| Same-School exact historical history |     0 |
| **Multiple-Membership total**        | **0** |

## 8. User account states

| User status | Count |
| ----------- | ----: |
| ACTIVE      |    18 |
| INVITED     |     0 |
| SUSPENDED   |     0 |
| DISABLED    |     0 |

The account status is described separately from Membership and employment
state. It does not prove current employment.

## 9. Credential readiness aggregates

| Credential signal                    | Count |
| ------------------------------------ | ----: |
| Has username                         |     0 |
| Has contact email                    |     0 |
| Has password                         |     0 |
| Must change password                 |     0 |
| Password provisioned                 |     0 |
| Credential version zero              |    18 |
| Credential version greater than zero |     0 |

Only boolean presence signals and counts were retained. No credential or
contact value was serialized.

## 10. Membership status footprint

All Membership footprint counters are zero because all 18 targets have no
Membership rows. This includes ACTIVE, INACTIVE, TRANSFERRED, SUSPENDED, ended,
soft-deleted, Teacher type, Teacher Role, deleted Role, Schoolless, and
tenant-link mismatch footprints.

## 11. Profile history matrix

| Profile-history classification          | Count |
| --------------------------------------- | ----: |
| No Profile rows                         |    18 |
| Archived same-School Profile            |     0 |
| Archived other-School Profile           |     0 |
| Multiple archived Profiles              |     0 |
| Cross-School archived Profile history   |     0 |
| Users with any archived Profile history |     0 |

No School is inferred when Membership history is absent.

## 12. Allocation exposure

| Exposure                             | Count |
| ------------------------------------ | ----: |
| No allocations                       |    18 |
| Historical allocations only          |     0 |
| Current-inactive allocations         |     0 |
| Current-active allocations           |     0 |
| Future allocations                   |     0 |
| Inconsistent allocations             |     0 |
| Invalid allocations                  |     0 |
| Cross-School allocation relationship |     0 |

Highest-risk allocation classifications:

| Highest risk     | Count |
| ---------------- | ----: |
| Invalid          |     0 |
| Inconsistent     |     0 |
| Cross-School     |     0 |
| Current-active   |     0 |
| Future           |     0 |
| Current-inactive |     0 |
| Historical only  |     0 |
| None             |    18 |

## 13. Session exposure

| Session signal                                       | Count |
| ---------------------------------------------------- | ----: |
| Users with an unrevoked unexpired Session            |     0 |
| Total unrevoked unexpired Sessions                   |     0 |
| ACTIVE Users with an unrevoked unexpired Session     |     0 |
| Non-ACTIVE Users with an unrevoked unexpired Session |     0 |

No Session was revoked or otherwise mutated.

## 14. Remediation decision families

| Decision family                                | Count |
| ---------------------------------------------- | ----: |
| Owner decision: identity retire or reprovision |    18 |
| Same-School historical Teacher review          |     0 |
| IAM identity correction required               |     0 |
| Cross-tenant or multi-history manual review    |     0 |
| Academic dependency review required            |     0 |
| Session security review required               |     0 |
| Historical preserve, no automatic action       |     0 |

The 18 records meet the owner-decision family because they have no Membership,
Profile, or allocation history. This family is a decision gate, not an
automatic mutation instruction.

## 15. Classification invariants

| Invariant                                  | Result |
| ------------------------------------------ | ------ |
| Target matches locked evidence             | PASS   |
| Top-level cohorts sum to target            | PASS   |
| One-Membership subtypes sum correctly      | PASS   |
| Multiple-Membership subtypes sum correctly | PASS   |
| Every target classified exactly once       | PASS   |

The existing classifier cross-check also passed at the same fixed time:

```text
Total Teacher Users: 18
Teacher Users without active Teacher Memberships: 18
Teacher Users missing live matching Profile: 18
Backfill eligible: 0
Backfill ambiguous: 18
Active/future invalid Membership allocations: 0
Invalid allocation term state: 0
Inconsistent allocation term state: 0
Identifier samples: 0
```

## 16. Findings proven by technical evidence

- The locked target count remains 18.
- All 18 Users are non-deleted and currently typed as Teacher.
- All 18 account statuses are ACTIVE.
- None has Membership history, live or archived Profile history, allocation
  history, or an unrevoked unexpired Session at the fixed time.
- None has a username, contact-email presence, password presence, password
  provisioning signal, or positive credential version.
- None qualifies for the approved 1A backfill predicate.
- No cross-tenant, academic-dependency, or Session-security evidence was found.

## 17. Findings unknowable from technical evidence

Technical evidence cannot determine whether these Users are accidental, test
data, intended future Teachers, previously imported identities, or identities
that should be retained for another purpose. It cannot establish a School,
Organization, Role, employment state, or business owner for them.

It also cannot decide whether any User should be retyped, disabled and retained,
soft-deleted, or provisioned as a Teacher. Absence of related rows is not proof
of business intent.

```text
OWNER DECISION REQUIRED
```

## 18. Recommended next decision gate

Before any mutation phase, an authorized owner must establish the intended
identity disposition using evidence outside this classifier. The approved
choice must be explicit for the affected population and must select one of:

- retype through a reviewed IAM correction;
- disable and retain;
- soft-delete only when preservation and dependency rules permit; or
- provision through the atomic Teacher lifecycle with an explicitly selected
  School and required managed Profile data.

After a separately authorized mutation, rerun both classifiers at one fixed
time and require a zero unsupported-population result before considering 1B-1.

## 19. Forbidden automatic repairs

This evidence does not authorize:

- choosing a School or Organization heuristically;
- creating a Membership or TeacherProfile;
- changing User type or account status;
- deleting or soft-deleting a User;
- generating credentials or passwords;
- revoking Sessions;
- creating, changing, or deleting allocations;
- selecting an authoritative identity field by recency or row order;
- using absence of history as proof that deletion is correct; or
- running the 1A backfill in apply mode.

## 20. Classifier safety contract

The new classifier uses Prisma `findMany` reads only, explicit projections,
deterministic `id ASC` cursor pagination, a maximum page size of 500, and an
explicit terminal empty page. Credential/contact values are reduced to booleans
immediately. Output contains aggregate counts only, database failures use one
generic safe code, and Prisma disconnects in a `finally` block.

Calendar-invalid timestamps are rejected without normalization. A coherent
classification whose target count differs from the locked target returns
`data_baseline_moved` with a non-zero exit. Its sanitized aggregate sections
and failed target-match invariant remain available for operator review without
identifiers. Internally inconsistent cohort totals continue to return the
separate `classification_invariant_failed` error.

There is no apply mode, mutation delegate, raw query, migration command, or
identifier sample output.

## 21. Validation evidence

| Validation                                  | Result      |
| ------------------------------------------- | ----------- |
| New classifier syntax                       | PASS        |
| New classifier focused tests                | PASS, 37/37 |
| Authorized read-only classification         | PASS        |
| Existing classifier zero-sample cross-check | PASS        |
| Existing classifier syntax and tests        | PASS        |
| Backfill syntax and tests                   | PASS        |
| Migration governance                        | PASS        |
| Repository migration structure              | PASS        |
| Prisma schema validation                    | PASS        |
| Prisma Client generation                    | PASS        |
| Diff whitespace check                       | PASS        |
| Staged files                                | 0           |

## 22. Final authorization gate

```text
SCHOOL-TEACHER-DIRECTORY-1B-0R:
COMPLETE

DATA BASELINE MOVED:
NO

CLASSIFICATION INVARIANTS:
PASS

EXISTING CLASSIFIER CROSS-CHECK:
PASS

DATABASE MUTATION:
0

DATA REMEDIATION AUTHORIZED:
NO

BACKFILL APPLY AUTHORIZED:
NO

COMMIT AUTHORIZED:
NO

PUSH AUTHORIZED:
NO

1B-1 AUTHORIZED:
NO
```
