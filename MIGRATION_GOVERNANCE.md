# Migration Governance

This document is the authoritative policy for Prisma schema and migration work
in the Moazez backend. It applies to humans, agents, local development, CI, and
deployed environments.

## Non-negotiable rules

1. Every `schema.prisma` change requires a new migration.
2. Committed migrations are immutable.
3. Never edit, rename, delete, or replace a migration already merged into
   `main`.
4. New migration folders must match `^\d{14}_[a-z0-9_]+$`.
5. Migration names must use a full fourteen-digit timestamp.
6. Prisma must generate or validate every new migration.
7. PostgreSQL-specific SQL may be edited only before the migration is first
   applied.
8. `prisma db execute` is forbidden for normal feature development.
9. `prisma db push` is forbidden for shared or deployed databases.
10. `prisma migrate resolve` is incident-recovery only and requires explicit
    human approval.
11. Any drift, checksum mismatch, reset request, failed migration, or P3009 is a
    hard stop.
12. An agent must not bypass a hard stop by applying SQL manually.
13. A schema sprint cannot be `READY FOR REVIEW` unless a fresh empty-database
    replay passes.
14. Production uses `prisma migrate deploy` only.
15. Live migration changes must be rehearsed against a disposable or restored
    database first.
16. No agent may reset or mutate a Live database without explicit human
    approval.
17. Seed operations must remain separate from migration SQL.
18. Migration SQL must remain one logical change set per directory.

## Canonical directory format

```text
prisma/migrations/YYYYMMDDHHMMSS_snake_case_description/migration.sql
```

The timestamp is generated at creation time. Historical date-only or
sequence-bearing formats are legacy artifacts and must not be reused.

## Required feature workflow

1. Start from a clean, current branch.
2. Change `prisma/schema.prisma`.
3. Create a new migration with `npm run db:migration:create -- --name <name>` or
   the equivalent Prisma command.
4. Review all generated SQL before applying it.
5. Add any required PostgreSQL-specific SQL before the first application and
   document why Prisma cannot express it.
6. Run `npm run test:migration-governance` and
   `npm run db:migrations:check`.
7. Replay the complete active chain against an empty disposable PostgreSQL
   database with `prisma migrate deploy`.
8. Run `prisma migrate status`, seed, build, and the affected database/security
   tests.
9. Run `prisma migrate deploy` a second time and prove it is a no-op.

Creating a custom-SQL-only migration is allowed when no Prisma schema change is
needed, but it must still use the canonical directory format, remain one logical
change set, and pass fresh replay.

## Hard-stop response

When Prisma reports drift, a checksum mismatch, a reset request, a failed
migration, or P3009:

1. Stop immediately and preserve the full error output.
2. Do not edit an applied migration or `_prisma_migrations`.
3. Do not use direct SQL, schema push, reset, or migration resolution to keep a
   feature sprint moving.
4. Record the database, branch, commit, and migration involved without exposing
   credentials.
5. Escalate for an explicit incident decision and human approval.

The hard stop applies even when the intended schema change appears harmless.

## Command policy

Normal commands:

```text
prisma migrate dev --create-only
prisma migrate deploy
prisma migrate status
prisma migrate diff
prisma validate
prisma generate
```

The following are not normal migration workflow commands:

- Direct SQL execution through Prisma is forbidden for feature development.
- Schema push is forbidden for shared/deployed databases and is not an
  alternative to migrations.
- Migration resolution requires a separately approved incident runbook.
- Migration reset is never used against Live or shared development databases;
  empty disposable databases are created and destroyed through the database
  platform instead.

## CI and deployment gates

CI must fail for malformed migration directories, missing or unexpected files,
duplicate timestamps, schema changes without a new migration, mutation of
existing migrations, forbidden executable commands, replay failures, pending
migrations, seed/build/smoke-test failures, or a non-idempotent second deploy.

CI sets `MIGRATION_REBASELINE_APPROVED=1` only through the incident-specific
`scripts/authorize-migration-rebaseline-0a.cjs` guard. That guard requires the
exact approved base commit, the matching immutable safety tag, and the sole
non-empty `20260710135222_baseline_v1` migration. The variable cannot authorize
any other history replacement, including a manual workflow run. It does not
waive structural validation, schema/migration coupling, or forbidden-command
checks.

Deployed environments apply migrations with:

```text
prisma migrate deploy
```

No deployment process generates, edits, resolves, or manually executes
migration SQL.

## PostgreSQL-specific SQL

Partial indexes, `CHECK` constraints, expression indexes, extensions, triggers,
functions, views, or other PostgreSQL-specific objects must be inventoried and
tested. The migration must state why the object is not represented by Prisma.
Once first applied, that SQL is immutable like every other migration statement.

## Incident baseline exception

`MIGRATION-RECOVERY-0A` intentionally replaced the corrupted development chain
with one canonical baseline. The prior history is preserved at Git tag:

```text
migration-history-pre-rebaseline-20260710
```

This exception does not authorize another rebaseline. Any future history
replacement requires a new incident, explicit human approval, a safety tag,
forensic inventory, and fresh-database proof.
