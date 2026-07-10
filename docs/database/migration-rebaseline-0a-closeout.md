# MIGRATION-RECOVERY-0A Closeout

## Outcome

The canonical baseline creates the complete committed Prisma schema from an
empty PostgreSQL database. Migration deployment, status, seed, build,
TypeScript, catalog verification, and the idempotent second deployment all
passed.

- **Migration recovery integrity: PASS**
- **Repository-wide regression debt: OPEN**

The open regression findings are pre-existing feature-contract and test
cleanup debt. They are tracked separately in
`docs/database/post-rebaseline-regression-register.md`; they do not invalidate
the empty-database replay or the canonical migration recovery result.

No commit or push was performed. `moazez_dev`, Live, and the Dashboard Todos
stash were not changed.

## Repository and history

- Baseline source HEAD: `905d67c09c1da3299316dcd37c8480a3a983efb1`
- Baseline implementation commit: not created, as required
- Branch: `fix/prisma-migration-rebaseline`
- Old active migration count: 61
- New active migration count: 1
- New baseline migration: `20260710135222_baseline_v1`
- Old-history safety tag: `migration-history-pre-rebaseline-20260710`
- Safety tag target: `905d67c09c1da3299316dcd37c8480a3a983efb1`

Old migration history remains available through:
`migration-history-pre-rebaseline-20260710`.

## Custom SQL inventory

The forensic inventory found 27 PostgreSQL-specific objects that remain
required and are not guaranteed to be reproduced by `schema.prisma`:

- 14 named partial unique indexes
- 13 named `CHECK` constraints

All 27 names occur exactly once in the canonical baseline. PostgreSQL catalog
verification against the final disposable replay database found all 14 partial
indexes and all 13 constraints. No extension, function, trigger, view,
materialized view, expression index, descending index, GIN/GiST index, or
additional custom foreign-key object required preservation.

See `docs/database/migration-custom-sql-inventory.md` for the object-by-object
source, purpose, schema representation, baseline decision, and protecting
tests.

## Files removed

- 61 legacy `prisma/migrations/*/migration.sql` files and their now-empty
  migration directories
- `prisma/migrations/.gitkeep`

`prisma/migrations/migration_lock.toml` was retained. The removed chain is
preserved by Git and the safety tag.

## Files added

- `.github/workflows/migration-integrity.yml`
- `MIGRATION_GOVERNANCE.md`
- `docs/database/migration-custom-sql-inventory.md`
- `docs/database/prisma-migration-rebaseline-decision.md`
- `docs/database/migration-rebaseline-0a-closeout.md`
- `prisma/migrations/20260710135222_baseline_v1/migration.sql`
- `scripts/authorize-migration-rebaseline-0a.cjs`
- `scripts/check-migration-governance.cjs`
- `scripts/tests/check-migration-governance.test.cjs`
- `scripts/tests/migration-rebaseline-authorization.test.cjs`

## Files modified

- `AGENTS.md`
- `CLAUDE.md`
- `PRISMA_CONVENTIONS.md`
- `README.md`
- `TESTING_STRATEGY.md`
- `package.json`

No feature or runtime source file was modified.

## Governance rules and checker

`MIGRATION_GOVERNANCE.md` adds the 18 non-negotiable rules required by the
incident, including schema/migration coupling, migration immutability,
fourteen-digit folder timestamps, hard stops for drift and failed migrations,
fresh empty-database replay, deploy-only production behavior, rehearsal before
Live changes, and separation of seed data from migration SQL.

The governance checker validates directory structure, timestamps, required and
unexpected files, schema/migration coupling, migration mutation/deletion/rename,
and forbidden executable Prisma commands. Its one-time recovery path is bound
to all of these constants:

- base commit `905d67c09c1da3299316dcd37c8480a3a983efb1`
- safety tag `migration-history-pre-rebaseline-20260710` resolving to that SHA
- exactly one active directory, `20260710135222_baseline_v1`
- a present, non-empty `migration.sql`

The incident path waives only the intentional 61 legacy deletions. Structural,
schema-coupling, and forbidden-command checks stay active. A different base,
tag, directory set, missing/empty SQL, or arbitrary future rebaseline remains a
strict failure even if `MIGRATION_REBASELINE_APPROVED=1` is supplied.

Governance result: 39 tests passed, 0 failed. The real approved local check
passed with exactly 61 waived legacy-deletion findings.

## CI behavior

The migration-integrity workflow starts fresh PostgreSQL and Redis services,
installs dependencies, tests the checker, evaluates the incident-only guard,
always runs the governance checker, validates and deploys Prisma, checks
status, generates the client, seeds, builds, runs database/security smoke
tests, deploys a second time, verifies the second deploy is a no-op without a
migration-count change, and checks final migration status.

For pull requests, `MIGRATION_BASE_REF` is the PR base SHA. For pushes it is the
event's previous SHA. A manual dispatch has no approval boolean and resolves
the default branch as its normal strict comparison base. Only the separate
incident authorizer can write `MIGRATION_REBASELINE_APPROVED=1`, and only after
the exact constants and active migration contents above are verified.

## Disposable replay evidence

- Final replay database: `moazez_migration_replay_20260710154337079`
- Endpoint: local PostgreSQL only; credentials are intentionally omitted
- First deploy: applied `20260710135222_baseline_v1`; all migrations applied
- Migrate status: one migration found; database schema up to date
- Prisma generate: passed with Prisma Client 6.19.3
- Seed: passed; 232 permissions, 7 system roles, platform admin, demo
  organization/school/admin, and demo academics baseline seeded
- Build: `nest build` passed
- TypeScript: `tsc -p tsconfig.build.json --noEmit` passed
- Second deploy: `No pending migrations to apply.`
- Applied migration count: 1 before and 1 after the second deployment
- Final migrate status: database schema up to date
- Cleanup: database dropped and verified absent

Catalog results before the test matrix:

| Object                                             | Expected | Actual |
| -------------------------------------------------- | -------: | -----: |
| Application tables, excluding `_prisma_migrations` |      139 |    139 |
| Named partial unique indexes                       |       14 |     14 |
| All partial indexes in `public`                    |       14 |     14 |
| Named `CHECK` constraints                          |       13 |     13 |
| All `CHECK` constraints in `public`                |       13 |     13 |
| Inventoried custom object names                    |       27 |     27 |
| Successfully applied Prisma migrations             |        1 |      1 |

## Database-backed test results

Passing selected coverage:

- Authentication/security and tenancy: 2 suites, 11 tests passed
- Admissions, students/enrollments, attendance, and grades: 4 suites, 49 tests
  passed
- Dismissal golden-path security: 1 suite, 4 tests passed
- Dashboard read-only contracts: 9 suites, 50 tests passed

Open regression findings from broader, non-migration coverage:

- Homework final-closeout e2e: 1 of 2 tests failed because the test still
  requires `GET /api/v1/parent/smart-pickup` to be absent although that existing
  route is registered at the current HEAD.
- Communication core-chat e2e: its functional assertion passed, but suite
  teardown failed while deleting a user referenced by
  `communication_notifications_recipient_user_id_fkey`.

Additional diagnostics, without code changes:

- `test/e2e/admissions-flow.e2e-spec.ts` has an exact-object assertion that
  omits the existing `documentsSummary` response property.
- The homework security suite expected a 403 for a role request that currently
  returns 201; the combined homework/communication/dismissal security run
  reported 89 passed and 9 failed tests across three suites.
- A combined long-lived e2e invocation did not exit after its configured test
  windows. It was terminated, and its uniquely named disposable database was
  force-dropped and verified absent. The final matrix ran suites independently
  with `--forceExit` to guarantee cleanup; the assertions above still returned
  their real pass/fail status.

These failures are not caused by migration application or schema replay. They
remain visible as repository-wide regression debt and must be resolved before
the Live rebuild. Fixing feature authorization, route-contract expectations,
or test cleanup is explicitly outside this migration-only task.

## Prohibited operations and protected state

- No `prisma migrate resolve` was used.
- No `prisma db execute` was used.
- No `prisma db push` was used.
- `moazez_dev` was not reset or mutated.
- Live was not accessed or mutated.
- Dashboard Todos remains in `stash@{0}` and was not applied or popped.
- No commit or push was performed.

## Known issues

The five post-rebaseline findings, classifications, and required follow-ups are
recorded in `docs/database/post-rebaseline-regression-register.md`. They are
not part of the migration rebaseline change set and must not be silently
ignored.

## Final verdict

**READY FOR REVIEW — canonical migration recovery passed.**

Pre-existing feature/test regressions are tracked separately and must be
resolved before the Live rebuild. The closeout does not claim that all
repository tests are green.
