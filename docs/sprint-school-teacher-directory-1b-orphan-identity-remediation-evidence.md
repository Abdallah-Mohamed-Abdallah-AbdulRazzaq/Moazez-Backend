# School Teacher Directory 1B-0R Orphan Identity Remediation Evidence

## 1. Execution boundary

- Branch: `feat/school-teacher-directory-1b-identity-remediation-lock`
- Execution HEAD: `9cf92f0eee2b7691da2329d8cc09a2b7e1dc4996`
- Accepted classification-lock baseline: `5b598c69767e2a5d6cb714dc3c774b3d41bcf1a4`
- Environment: `local persistent development`
- Authorized population: 18 unsupported orphan Teacher identities
- Teacher Directory 1B-1: not authorized

The data owner authorized disabling and soft-deleting exactly the accepted 18
orphan identities. The authorization did not permit selecting a School or
Organization, creating tenant or Profile records, changing User type,
hard-deleting identity, changing credentials or allocations, applying the 1A
backfill, or modifying any other environment.

## 2. Protected remediation tool

The remediation tool is:

```text
scripts/remediate-orphan-teacher-identities-1b-0r.cjs
```

It defaults to dry-run. Apply mode requires both `--apply` and the dedicated
environment confirmation. Apply mode is rejected in production. It uses the
locked classifier and a second bounded candidate query to require all of the
following immediately before mutation:

- exactly 18 non-deleted ACTIVE Teacher Users;
- zero Membership rows for every target;
- zero TeacherProfile rows for every target;
- zero TeacherSubjectAllocation rows for every target;
- zero unrevoked, unexpired Sessions at the fixed classification time;
- the accepted credential-presence aggregate remains unchanged; and
- exactly 18 records satisfy the complete remediation predicate.

Candidate reads use deterministic `id ASC` cursor pagination with a maximum
page size of 500. Reports contain aggregates only and never expose target
identifiers or raw database errors.

Apply uses one Prisma interactive transaction at `Serializable` isolation. It
generates one timestamp inside that transaction, executes one guarded
`User.updateMany`, and verifies all 18 rows have `status = DISABLED` and that
same `deletedAt` value before commit. A changed precondition, affected-row
count other than 18, or verification mismatch fails the transaction.

## 3. Pre-apply dry-run evidence

Fixed classification time:

```text
2026-07-18T17:32:34.442Z
```

| Aggregate                          | Count |
| ---------------------------------- | ----: |
| Locked expected target             |    18 |
| Classified target                  |    18 |
| Eligible for remediation           |    18 |
| Targets with no Membership history |    18 |
| Targets with no Profile history    |    18 |
| Targets with no allocation history |    18 |
| Targets with an active Session     |     0 |
| Active Sessions                    |     0 |

Every protected precondition passed. Dry-run returned success and wrote zero
rows.

## 4. Authorized apply evidence

The exact authorized tool was run with both apply confirmations against the
inspected local persistent development environment.

```text
Rows updated: 18
Fixed deletedAt: 2026-07-18T17:34:01.398Z
Transaction isolation: Serializable
```

The mutation changed only:

```text
User.status = DISABLED
User.deletedAt = 2026-07-18T17:34:01.398Z
```

It did not hard-delete rows, change `User.userType`, infer a School or
Organization, create Memberships or TeacherProfiles, change credentials,
change allocations, revoke Sessions, or run the TeacherProfile backfill.

## 5. Post-apply classifier evidence

Both read-only classifiers used this fixed post-apply time:

```text
2026-07-18T17:34:08.960Z
```

### Identity-remediation classifier

The locked 1B-0R classifier reported:

```text
Current unsupported target population: 0
All internal classification invariants: PASS
Target matches former locked evidence of 18: false
Error: data_baseline_moved
Exit code: 1
```

The non-zero exit and `data_baseline_moved` are the classifier's required
fail-closed response because the intentionally remediated population no longer
equals the historical lock of 18. All aggregate cohorts, Profiles,
allocations, Sessions, and remediation-decision counts were zero, with no
identifiers emitted.

### Teacher Directory reality classifier

The existing 0A classifier completed successfully with `sample-limit=0`:

| Aggregate                                                       | Count |
| --------------------------------------------------------------- | ----: |
| Total current Teacher Users                                     |     0 |
| Teacher Users without active Teacher Membership                 |     0 |
| Teacher Users missing a live matching Profile                   |     0 |
| Role/User/Membership mismatch                                   |     0 |
| Active/future allocations with invalid Membership state         |     0 |
| Teacher Users requiring future TeacherProfile backfill          |     0 |
| Backfill eligible                                               |     0 |
| Backfill ambiguous                                              |     0 |
| Live Profiles without exact operational Teacher Membership      |     0 |
| Active Teacher Memberships without matching destination Profile |     0 |

The two classifiers therefore independently establish that the current
unsupported Teacher identity population is zero. Historical soft-deleted User
rows remain preserved and are intentionally outside the current non-deleted
Teacher universe.

## 6. Mutation accounting

| Mutation category                   | Count |
| ----------------------------------- | ----: |
| User rows disabled and soft-deleted |    18 |
| User hard deletes                   |     0 |
| User type changes                   |     0 |
| Membership writes                   |     0 |
| TeacherProfile writes               |     0 |
| Credential writes                   |     0 |
| TeacherSubjectAllocation writes     |     0 |
| Session writes                      |     0 |
| Backfill-created rows               |     0 |
| Schema or migration changes         |     0 |

## 7. Validation and authorization gate

The protected tool has focused coverage for argument and apply gates,
production rejection, exact-count and relationship preconditions, credential
drift, bounded reads, dry-run safety, one Serializable transaction, one fixed
timestamp, affected-row verification, aggregate-only output, generic failure
handling, and source-level mutation scope.

| Validation                                      | Result      |
| ----------------------------------------------- | ----------- |
| Remediation tool syntax                         | PASS        |
| Remediation tool focused tests                  | PASS, 16/16 |
| Identity-remediation classifier tests           | PASS, 37/37 |
| Teacher Directory reality classifier tests      | PASS, 15/15 |
| TeacherProfile backfill tests                   | PASS, 10/10 |
| Migration-governance tests                      | PASS, 39/39 |
| Repository migration-structure check            | PASS        |
| Prisma schema validation and Client generation  | PASS        |
| Nest build                                      | PASS        |
| Prettier check for the three new evidence files | PASS        |
| Tracked files changed                           | 0           |
| Staged files                                    | 0           |

```text
SCHOOL-TEACHER-DIRECTORY-1B-0R REMEDIATION:
COMPLETE

AUTHORIZED POPULATION:
18

DRY RUN:
PASS

ROWS UPDATED:
18

POST-REMEDIATION UNSUPPORTED POPULATION:
0

BACKFILL ROWS WRITTEN:
0

1B-1 AUTHORIZED:
NO

COMMIT AUTHORIZED:
NO

PUSH AUTHORIZED:
NO

PULL REQUEST:
NOT AUTHORIZED
```
