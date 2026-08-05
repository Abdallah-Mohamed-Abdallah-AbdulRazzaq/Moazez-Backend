# Phase 3 — Database Identities and Least-Privilege Evidence

## Document control

| Field | Value |
| --- | --- |
| Phase | `PHASE_3` |
| Gate | `PRD3-G01` |
| Subgate | `PRD3-G01-C` |
| Baseline commit | `1816a3294be92ac177b6a5e906199a33d9c1912a` |
| Parent B3 commit | `5dba92b120c8d36ad0d5738a522910575138b284` |
| Status | `COMPLETE` |
| Parent gate status | `BASELINE_ONLY` |
| Scope | Versioned PostgreSQL policy and disposable local PostgreSQL 16 proof only |

PRD3-G01-C separates runtime DML authority from governed migration DDL
authority. It changes no production TypeScript, Prisma schema, migration,
application contract, dependency, lockfile, image, workflow, or cloud
resource.

## Inspected production boundary

The source inspection found no contradiction and required no production
TypeScript change.

| Deployment | Entrypoint | Database validation | PostgreSQL login | Application name |
| --- | --- | --- | --- | --- |
| API | `src/main.ts` | `src/config/env.validation.ts` | `moazez_api` | `moazez-api` |
| Core Worker | `src/core-worker.ts` | `src/runtime/runtime-env.validation.ts` | `moazez_core_worker` | `moazez-core-worker` |
| Media Worker | `src/media-worker.ts` | `src/runtime/runtime-env.validation.ts` | `moazez_media_worker` | `moazez-media-worker` |
| Migration Job | governed Prisma CLI | deployment-owned | `moazez_migration` | not an application runtime |
| Maintenance Scheduler | `src/maintenance-scheduler.ts` | database fields rejected | none | none |

API, Core Worker, Media Worker, and the Migration Job continue to receive
different values through the single `DATABASE_URL` variable. The application
runtimes additionally validate their exact `DATABASE_RUNTIME_ROLE`. No
role-specific URL variable exists. The Maintenance Scheduler accepts neither
field, imports no Prisma module, constructs no Prisma client, and opens no
database connection.

## Versioned policy

The idempotent bootstrap policy creates or normalizes these exact login roles:

- `moazez_api`
- `moazez_core_worker`
- `moazez_media_worker`
- `moazez_migration`

Every role is `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`,
`NOREPLICATION`, `NOBYPASSRLS`, and `INHERIT`. None owns the database or
application schema. Runtime roles own no table, sequence, function, index, or
constraint. Catalog proof also found no membership edge between any pair of
Moazez roles.

The target database removes PUBLIC database privileges, and schema `public`
removes PUBLIC `CREATE`. Runtime roles receive only:

- database `CONNECT`;
- schema `USAGE`;
- table `SELECT`, `INSERT`, `UPDATE`, and `DELETE`;
- sequence `USAGE` and `SELECT`.

Runtime roles receive no `CREATE`, `TEMPORARY`, `TRUNCATE`, `REFERENCES`,
`TRIGGER`, grant option, ownership, or administration authority. The Migration
Job receives target-database `CONNECT, CREATE` and application-schema
`USAGE, CREATE`. Target-database `CREATE` is required by the committed
baseline's `CREATE SCHEMA IF NOT EXISTS public` statement and future governed
schema changes; it is not the PostgreSQL `CREATEDB` role attribute. Objects
created by governed Prisma migrations are owned by `moazez_migration`. It remains
unable to create or alter roles, create a database, or become an administrator.

Current runtime privileges on `public._prisma_migrations` are explicitly
revoked after deployment. Migration-owned default privileges grant future
tables the same four DML privileges and future sequences `USAGE, SELECT`.
The one existing public function,
`normalize_learning_media_original_name(text)`, is an immutable, strict,
parallel-safe, security-invoker SQL normalizer with no data access. Its reviewed
PUBLIC execution remains because the `file_upload_sessions` CHECK constraint
requires it for application DML; runtime roles receive no direct function ACL.
Future functions receive no implicit PUBLIC or runtime execution grant. Every
migration that creates an exceptional object, function, or schema requires an
explicit privilege review, and runtime denial on `public._prisma_migrations`
must be reapplied after migration deployment.

## Disposable verification topology

The focused verifier requires the approved Node `v22.23.1` toolchain and the
already-present PostgreSQL `16.14` `postgres:16-alpine` image. It resolves that image to an
immutable image ID before execution and uses `--pull=never`.

One fresh fixture uses:

- a unique run identifier and ownership label;
- one uniquely named container and one uniquely named network;
- PostgreSQL data on tmpfs with no persistent volume;
- one random port bound only to `127.0.0.1`;
- synthetic credentials generated in memory and never printed;
- a disposable bootstrap superuser used only for fixture and catalog work.

The bootstrap and grants policies are each applied twice. Both second
applications complete as idempotent no-ops with the same final catalog state.

## Verification results

`npm run verify:prd3-g01-c-tests` passed 20 focused pure tests with no skipped
or todo test. `npm run verify:prd3-g01-c-final` then reran those tests and
completed the live fixture.

Migration proof:

- first `prisma migrate deploy`: PASS;
- `prisma migrate status`: PASS and schema current;
- second `prisma migrate deploy`: PASS/no-op;
- application tables, indexes, sequences, and the application function are
  owned by `moazez_migration`;
- one uniquely named controlled table plus identity sequence was created by
  the migration role, used to prove future defaults, and removed;
- migration `CREATE ROLE`, administrative `ALTER ROLE`, and `CREATE DATABASE`:
  rejected with unchanged catalog state;
- connection to a separately hardened non-application database: rejected.

Runtime positive proof used Prisma clients carrying the exact runtime role and
application-name configuration:

| Runtime | Representative application DML | Result |
| --- | --- | --- |
| API | Organization read plus insert/update/delete transaction | PASS |
| Core Worker | Import Job insert/update/delete transaction | PASS |
| Media Worker | Learning Media upload-session insert/update/delete transaction | PASS |

All three clients proved connection, exact `application_name`, representative
read, insert/update/delete, rollback, same-client continued use, and zero
runtime-owned objects.

For each runtime identity, all 19 independent negative checks passed:

- create, alter, drop, or truncate an application table;
- create an index, schema, extension, or function;
- grant or revoke object privileges;
- alter object ownership;
- create, alter, or drop a role;
- create a database;
- set role to migration or another runtime;
- read or modify `public._prisma_migrations`.

Every expected rejection was followed by rollback, a same-session usability
query, and an administrator catalog snapshot comparison proving no object,
role, membership, ownership, database, extension, or privilege changed. The
additional cross-role matrix rejected all nine runtime-to-other-Moazez-role
`SET ROLE` attempts.

The existing focused scheduler-negative tests also passed. They prove the
Maintenance Scheduler receives no database configuration, creates no Prisma
client, and opens zero database connections.

All Prisma clients disconnected before teardown. The final application
database session count was zero. Label and exact-name inspection found zero
owned containers and zero owned networks after cleanup.

## Limitations and deferred work

This evidence proves PostgreSQL permissions against one disposable local
PostgreSQL 16 fixture. It does not provision or prove:

- real Cloud SQL users or Cloud SQL IAM authentication;
- Secret Manager, credential rotation, or Terraform;
- private networking, production transport, or regional failover;
- `PRD3-G01-D` provider failover and final G01 closeout;
- `PRD3-G04` governed Migration Job deployment.

Accordingly, `PRD3-G01-C=COMPLETE` while `PRD3-G01=BASELINE_ONLY`.
