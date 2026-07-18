# School Teacher Directory 1B-0M Deployment Evidence

## 1. Branch and baseline

- Branch: `feat/school-teacher-directory-1b-deployment-evidence`
- Baseline and current HEAD: `e4084087fc100f8188f9265802082f8b62b5f836`
- Inspection completed at: `2026-07-18T15:54:36.037Z`
- Starting tracked changes: 0
- Starting staged files: 0
- Allowed untracked file: this evidence document

## 2. Environment classification

- Inspection authorization: authorized
- Environment class: `local persistent development`
- Evidence scope: the configured environment only
- Production deployment inference: none
- Backfill apply authorization: no

No connection coordinates, environment values, personal data, credentials,
session identifiers, or classifier samples are retained in this document.

## 3. Initial migration state

The pre-deploy read-only gate found:

| Evidence | Result |
| --- | ---: |
| Expected active migrations | 4 |
| Applied migrations | 3 |
| Pending migrations | 1 |
| Failed migrations | 0 |
| History-mismatch signal | none |
| Checksum-mismatch signal | none |
| Reset-request signal | none |

The sole pending artifact was the merged and explicitly authorized migration:

```text
20260718115332_teacher_directory_data_foundation
```

The superseded `20260718001315_teacher_directory_data_foundation` artifact was
absent. Repository governance passed with 4 active migrations, 0 new
migrations, and rebaseline disabled.

## 4. Authorized migration and first deploy

The operator authorized exactly:

```text
npx prisma migrate deploy
```

The first deploy exited successfully, reported the authorized 1A migration,
and reported no other newly applied migration.

| First deploy evidence | Result |
| --- | --- |
| Command exit | 0 |
| Authorized migration reported | yes |
| Unexpected migration reported | no |
| Successful application signal | yes |
| Migrations applied in this execution | 1 |

No migration file, schema file, or migration-history record was edited
directly.

## 5. Second deploy no-op

After the first successful deploy, a read-only status check reported 4 applied,
0 pending, 0 failed, and schema up to date. The required second deploy then
reported:

```text
No pending migrations to apply.
```

It exited successfully and reported no newly applied migration.

## 6. Final migration status

| Final evidence | Result |
| --- | ---: |
| Applied migrations | 4 |
| Pending migrations | 0 |
| Failed migrations | 0 |
| Schema status | up to date |
| Unsafe migration-history signal | none |
| Repository active migrations | 4 |
| Repository new migrations | 0 |
| Repository rebaseline | off |

Migration history is `PASS`. `prisma migrate status` is not treated as a
complete drift detector; this evidence records only the signals that command
provides.

## 7. Fixed post-migration classifier timestamp

- Fixed `as-of`: `2026-07-18T15:51:57.079Z`
- Sample limit: 20
- Complete aggregate report: yes
- Command exit: 0
- Identifier samples retained: 0

The same fixed timestamp was used for the post-migration evidence reads.

## 8. Classifier aggregate counts

| Required aggregate | Count |
| --- | ---: |
| Operational Teacher Membership without matching live Profile | 0 |
| Live Profile without exact operational Teacher Membership | 0 |
| Live Profile linked to non-Teacher or deleted User | 0 |
| Users with multiple live Profiles | 0 |
| Duplicate school/User Profile footprint | 0 |
| Transferred source Membership with live source Profile | 0 |
| Destination active Membership without destination Profile | 0 |
| Incomplete live Profile | 0 |
| Role/User/Membership type mismatch | 0 |
| Eligible Teacher Profiles for backfill | 0 |

Additional aggregate evidence needed for the readiness decision:

| Aggregate | Count |
| --- | ---: |
| Total Teacher users | 18 |
| Teacher users missing a live matching Profile | 18 |
| Teacher users without an operational Teacher Membership | 18 |
| Backfill-ambiguous Teacher users | 18 |

## 9. Backfill dry-run aggregate counts

The tool was run without `--apply` and without apply authorization. It returned
a complete `dry_run` report and wrote zero rows.

| Dry-run evidence | Count or value |
| --- | ---: |
| Teacher users inspected | 18 |
| Batches | 1 |
| Eligible | 0 |
| Already satisfied by a same-school live Profile | 0 |
| Skipped | 18 |
| No operational Teacher Membership | 18 |
| Archived same-school Profile requiring restore | 0 |
| Cross-school ambiguity | 0 |
| Deleted or missing User relation | 0 |
| Existing live other-school Profile | 0 |
| Membership without School | 0 |
| Multiple operational Memberships | 0 |
| Role or type mismatch | 0 |
| Role-school mismatch | 0 |
| Unique-index race conflict | 0 |
| Bounded sample count produced but not retained | 18 |
| Rows written | 0 |

For an eligible row, the statically verified proposal remains exactly:

```text
schoolId
userId
employmentStatus = INACTIVE
workingDays = []
```

The dry run proposes no mutation to User, Membership, Role,
TeacherSubjectAllocation, Session, password, or credential state.

## 10. Structural-gap decision

The 18 Teacher users without an operational Teacher Membership also lack a live
matching Profile. They are not eligible under the approved legacy backfill
predicate and are therefore unsupported missing-Profile cases, not valid
backfill candidates.

```text
STRUCTURAL GAPS: 18
POST-1A CLASSIFIER: FAIL
```

No automated repair is authorized or proposed.

## 11. Expected-remediation decision

There are no eligible legacy backfill candidates and no incomplete live
Profiles:

```text
EXPECTED REMEDIATION: 0
BACKFILL REQUIRED: NO
BACKFILL ROWS WRITTEN: 0
```

The structural population requires a separately reviewed data decision. It
must not be relabeled as supported backfill remediation.

## 12. Exact next phase

1B-1 remains unauthorized pending independent audit and managed resolution of
the 18 unsupported Teacher identity records. The next authorized work must
classify why those records have no operational Teacher Membership, select a
contract-compliant remediation, and then repeat the fixed-timestamp classifier
and dry-run evidence. This phase grants no repair, backfill apply, runtime,
commit, push, or pull-request authority.

## 13. Validation evidence

| Command | Result |
| --- | --- |
| `npm run test:migration-governance` | PASS, 39/39 tests |
| `npm run db:migrations:check` | PASS, active 4, new 0, rebaseline off |
| `npx prisma validate` | PASS |
| `npx prisma generate` | PASS |
| Classifier syntax check | PASS |
| Classifier focused tests | PASS, 15/15 tests |
| Backfill syntax check | PASS |
| Backfill focused tests | PASS, 10/10 tests |
| `git diff --check` | PASS |

## 14. Change audit

- Tracked changed files: 0
- Untracked files: this evidence document only
- Staged files: 0
- Runtime files changed: 0
- Schema files changed: 0
- Migration files changed: 0
- Backfill rows written: 0

## 15. Final authorization gate

```text
SCHOOL-TEACHER-DIRECTORY-1B-0M:
BLOCKED

INITIAL MIGRATION STATE:
3 APPLIED / 1 PENDING

AUTHORIZED MIGRATION:
20260718115332_teacher_directory_data_foundation

MIGRATION DEPLOY:
PASS

SECOND DEPLOY:
NO-OP

FINAL MIGRATION STATE:
4 APPLIED / 0 PENDING

MIGRATION HISTORY:
PASS

POST-1A CLASSIFIER:
FAIL

BACKFILL DRY RUN:
PASS

BACKFILL REQUIRED:
NO

STRUCTURAL GAPS:
18

EXPECTED REMEDIATION:
0

MIGRATIONS APPLIED TO DATABASE:
1

BACKFILL ROWS WRITTEN:
0

COMMIT AUTHORIZED:
NO

PUSH AUTHORIZED:
NO

1B-1 AUTHORIZED:
NO
```
