# Phase 3 — Database Identities and Least-Privilege Evidence

## Document control

| Field | Value |
| --- | --- |
| Phase | `PHASE_3` |
| Gate | `PRD3-G01` |
| Subgate | `PRD3-G01-C` / `PRD3-G01-C1` |
| G01-C baseline commit | `1816a3294be92ac177b6a5e906199a33d9c1912a` |
| G01-C1 baseline commit | `6e73da066beb79ba59284a7b96260134c0b38df5` |
| Parent B3 commit | `5dba92b120c8d36ad0d5738a522910575138b284` |
| Status | `PRD3-G01-C=COMPLETE`; `PRD3-G01-C1=CANDIDATE_COMPLETE` |
| Parent gate status | `BASELINE_ONLY` |
| Scope | Cloud SQL-compatible bootstrap correction and disposable local PostgreSQL 16 proof only |

PRD3-G01-C separates runtime DML authority from governed migration DDL
authority. It changes no production TypeScript, Prisma schema, migration,
application contract, dependency, lockfile, image, workflow, or cloud
resource.

PRD3-G01-C1 corrects only the administrative mechanism used to establish that
same boundary. It does not change the accepted role attributes, current or
future grants, runtime behavior, schema, migrations, or deployment contract.

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

The idempotent bootstrap policy creates only missing role shells, using
`CREATE ROLE <role> LOGIN` and PostgreSQL's safe administrative defaults, for
these exact identities:

- `moazez_api`
- `moazez_core_worker`
- `moazez_media_worker`
- `moazez_migration`

No credential or explicit administrative attribute is present in the create
statement. After all missing shells exist, the policy queries
`pg_catalog.pg_roles` and requires every identity to be `LOGIN`,
`NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`,
`NOBYPASSRLS`, and `INHERIT`. An absent role, `NOLOGIN`, `SUPERUSER`,
`CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS`, or `NOINHERIT` aborts
with a generic error before password or privilege changes. Unsafe attributes
are not silently repaired.

The same pre-password guard rejects direct or indirect membership between any
pair of Moazez identities. When the Cloud SQL system role
`cloudsqlsuperuser` exists, it also rejects direct or indirect membership of
any Moazez identity in that role; ordinary PostgreSQL safely passes when the
system role is absent. Only after these catalog guards pass does the policy
run one password-only `ALTER ROLE ... PASSWORD` statement per identity using
bound `psql` variables. None of the four roles owns the database or application
schema. Runtime roles own no table, sequence, function, index, or constraint.

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
- a disposable fixture-owner superuser used only to establish and clean the
  bounded evidence fixture;
- `moazez_cloudsql_admin_fixture`, a managed-admin-like `LOGIN`,
  `NOSUPERUSER`, `CREATEDB`, `CREATEROLE`, `NOREPLICATION`, `NOBYPASSRLS`,
  `INHERIT` identity that owns only the disposable database and `public`
  schema and executes the committed bootstrap.

The bootstrap is never executed through the fixture superuser. Its first
application creates the four safe shells and assigns synthetic credentials;
its second application rotates those credentials without changing
administrative attributes, creating duplicate roles, or introducing
membership drift. The grants policy remains unchanged and is applied twice by
the disposable fixture owner after migration deployment because that policy
must govern both database/schema ACLs and migration-owned objects; C1's bounded
managed-administrator simulation targets the role bootstrap that failed on
Cloud SQL.

## Verification results

`npm run verify:prd3-g01-c-tests` passed 25 focused pure tests with no skipped
or todo test. `npm run verify:prd3-g01-c-final` then reran those tests and
completed the live fixture.

C1 bootstrap compatibility proof:

- the committed bootstrap completed through the managed-admin-like
  non-superuser and never through the fixture superuser;
- ordinary local PostgreSQL, where `cloudsqlsuperuser` is absent, completed
  both the initial and idempotent password-rotation applications;
- a fixture-superuser-created `CREATEDB=true` target was rejected before its
  candidate credential or any grant changed;
- static executable-SQL checks cover `NOLOGIN`, `SUPERUSER`, `CREATEDB`,
  `CREATEROLE`, `REPLICATION`, `BYPASSRLS`, and `NOINHERIT`, and reject any
  restricted administrative attribute in executable `ALTER ROLE` statements;
- synthetic direct membership in a fixture-only `cloudsqlsuperuser` group was
  rejected, after which the group and edge were removed;
- a synthetic Moazez cross-role membership edge was rejected and removed by
  fixture cleanup, leaving no accepted boundary edge;
- failure output contained no supplied synthetic credential or database URL.

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

## Managed-provider finding and C1 correction

The second real Cloud SQL apply attempt (R2) proved that the approved
PostgreSQL 16, Enterprise Plus, `db-perf-optimized-N-2`, `me-central2`,
private-only regional topology could reach `RUNNABLE`. The database bootstrap
then stopped before Prisma migrations. Its original combined statement used
`ALTER ROLE ... WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
NOREPLICATION NOBYPASSRLS INHERIT PASSWORD ...`; that normalization depended
on true PostgreSQL-superuser behavior, and Cloud SQL's managed administrator
rejected the restricted role-attribute mutation.

C1 removes that dependency. Missing roles use safe creation defaults,
administrative attributes and both membership boundaries are validated from
catalogs with fail-closed behavior, and accepted roles receive only
password-only rotation. The privilege design and runtime-grants policy are
unchanged. R2 did not run migrations or failover, so it is provider finding
evidence rather than G01-D closeout evidence.

## Limitations and deferred work

This evidence proves PostgreSQL permissions against one disposable local
PostgreSQL 16 fixture. It does not provision or prove:

- real Cloud SQL users or Cloud SQL IAM authentication;
- Secret Manager, credential rotation, or Terraform;
- private networking, production transport, or regional failover;
- `PRD3-G01-D` provider failover and final G01 closeout;
- `PRD3-G04` governed Migration Job deployment.

Accordingly:

```text
PRD3-G01-C=COMPLETE
PRD3-G01-C1=CANDIDATE_COMPLETE
PRD3-G01-D=WAITING_FOR_C1_COMMIT_AND_R3
PRD3-G01=BASELINE_ONLY
```

The corrected bootstrap still requires independent patch review, one bounded
commit, and an authorized R3 run to deploy migrations and complete the real
regional failover proof. Phase 3 and PRD3-G01 are not complete.
