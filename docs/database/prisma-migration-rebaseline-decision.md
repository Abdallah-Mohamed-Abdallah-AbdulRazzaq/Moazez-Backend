# Prisma Migration Rebaseline Decision

## Status

Accepted for implementation under incident `MIGRATION-RECOVERY-0A` on
2026-07-10.

## Incident summary

The repository's Prisma migration chain no longer described a single,
replayable history. Prisma reported drift and checksum conflicts, while later
features continued adding migration files and applying their SQL directly to
development or deployed databases. Database objects, migration files, and
`_prisma_migrations` therefore ceased to agree.

The active chain is replaced by one canonical, from-empty baseline representing
the complete committed `prisma/schema.prisma` model plus the PostgreSQL-specific
objects recorded in `migration-custom-sql-inventory.md`.

## Root cause

After Prisma Migrate reported drift/checksum/reset failures, multiple schema
changes were applied with direct SQL rather than being successfully applied and
recorded by Prisma Migrate. Later closeouts also document migrations being
marked applied after manual execution. This allowed objects to exist while
their migration records were pending, failed, absent, or checksum-divergent.

The incident is a process and history-integrity failure, not a feature-schema
design failure.

## Why data-preserving reconciliation was rejected

- Both local and currently deployed Live database contents are test data and
  may be deleted.
- Row-by-row repair of `_prisma_migrations` would preserve an unreliable chain
  and require unverifiable assumptions about which SQL ran where.
- `prisma migrate resolve` cannot prove that a database matches the complete
  committed schema and is explicitly prohibited for this incident.
- Replaying a canonical baseline against an empty database is simpler,
  auditable, and provides a stronger proof than reconciling corrupted history.

No old data or migration rows are migration inputs to the new baseline.

## Why a full clean rebuild is safe

The project is in development, all affected database contents are test-only,
and product behavior is defined by committed schema, seed, and application
code. A clean rebuild preserves those sources of truth while discarding only
non-production data and corrupt migration bookkeeping.

The Dashboard Todos stash is outside this incident and remains unapplied. The
committed schema contains no `DashboardTodo` persistence artifact.

## Databases in scope

- A uniquely named disposable local PostgreSQL database is created solely for
  baseline replay and destroyed after verification.
- The existing `moazez_dev` database is not reset or mutated in this incident.
- The currently deployed Live test-data database is a future destructive
  rebuild target after human review and approval. This incident does not connect
  to, mutate, or reset it.
- No production-content database is in scope.

## Old history preservation

Old migration history remains available through:

```text
migration-history-pre-rebaseline-20260710
```

The safety tag points to `905d67c0`, the repository state immediately before
the rebaseline. Old migration directories are intentionally removed only from
the active `prisma/migrations` path; they remain inspectable through the tag.

## Canonical migration naming

The single active migration directory is named at execution time:

```text
prisma/migrations/YYYYMMDDHHMMSS_baseline_v1/
```

The timestamp is the actual fourteen-digit local execution timestamp. Date-only
names, sequence-only names, and invented historical timestamps are forbidden.

## Baseline generation method

1. Finish and review the custom SQL inventory before deleting legacy
   directories.
2. Preserve `prisma/migrations/migration_lock.toml`.
3. Remove all 61 legacy migration directories from the active path.
4. Generate from-empty SQL with the repository-pinned Prisma CLI and committed
   schema.

Prisma 6.19.3 exposes the schema-datamodel option under this command name:

```powershell
npx prisma migrate diff `
  --from-empty `
  --to-schema-datamodel prisma/schema.prisma `
  --script `
  --output "$baselineDirectory/migration.sql"
```

This is the installed-version equivalent of the incident's documented
`--to-schema` form. It does not connect to or mutate a database.

5. Review the complete generated SQL.
6. Append the exact still-required custom objects.
7. Replay with `prisma migrate deploy` against a fresh empty database.

## Custom SQL preservation strategy

The forensic inventory found exactly 27 unsupported but required objects:

- 14 PostgreSQL partial unique indexes;
- 13 PostgreSQL `CHECK` constraints.

They are copied verbatim, with stable names, after the schema-generated objects
exist. Historical enum alterations, constraint/index renames, drift-masking
`IF NOT EXISTS` statements, and schema-represented hardening indexes are not
copied. Fresh replay verifies all 27 names through PostgreSQL catalogs.

## Local rebuild strategy

- Validate that local Docker PostgreSQL is the expected `moazez-postgres`
  container and that the configured base URL points to local port 5433 and
  protected database `moazez_dev`.
- Derive a process-only `DATABASE_URL` for a fresh database named
  `moazez_migration_replay_<YYYYMMDDHHMMSS>` without printing credentials.
- Create only that validated database with PostgreSQL `createdb`.
- Run governance approval for the one-time history replacement, Prisma
  validation/deploy/status/generate, seed, build, TypeScript, and selected
  database/security suites.
- Run `prisma migrate deploy` again and prove it is a no-op.
- Drop only the validated disposable database in a `finally` cleanup path.
- Never use `prisma migrate reset`, `prisma db push`, `prisma db execute`, or
  `prisma migrate resolve`.

## Live test database rebuild strategy

After this change is reviewed and intentionally released, an authorized human
operator may schedule a destructive rebuild of the Live test-data database:

1. Confirm again that it contains no production or required data.
2. Take an operational snapshot only if desired for incident evidence.
3. Drop and recreate the database through the hosting provider's approved
   database lifecycle mechanism, not Prisma reset or direct schema SQL.
4. Point the release process at the newly empty database.
5. Run `prisma migrate deploy`, `prisma migrate status`, seed, and smoke tests.
6. Run a second `prisma migrate deploy` and confirm no pending migrations.

The application release path remains `prisma migrate deploy`. This repository
change performs none of the Live actions above.

## Rollback strategy

Because data preservation is not required, rollback is repository- and
database-recreation based:

- Stop rollout before mutating any database if validation fails.
- Restore the previous repository state from
  `migration-history-pre-rebaseline-20260710` if the baseline itself must be
  abandoned.
- Drop only the failed disposable/rebuilt test database and create another
  empty database for the selected migration history.
- Do not attempt to mix the legacy and canonical histories or edit
  `_prisma_migrations` manually.

## Future governance requirements

- Every schema change has a new fourteen-digit migration directory.
- Merged migrations are immutable.
- Direct execution, shared-database push, and unapproved resolution are
  forbidden.
- Drift, checksum mismatch, failed migration, reset request, or P3009 is a hard
  stop.
- A fresh empty-database replay is required before schema work is reviewable.
- CI validates directory structure, schema/migration coupling, immutable
  history, fresh deploy, seed/build/smoke tests, and a second no-op deploy.
- Production and deployed environments use `prisma migrate deploy` only.
- Live changes require rehearsal and explicit human authority.

The complete non-negotiable policy lives in `MIGRATION_GOVERNANCE.md`.
