# Prisma Conventions

Rules for how Prisma schema, migrations, and client usage are structured.

## Mandatory Migration Reading

Before changing `prisma/schema.prisma`, creating a migration, or reviewing
migration SQL, read `MIGRATION_GOVERNANCE.md`. Its hard-stop, immutability,
fresh-replay, and deployment rules are mandatory and take precedence over
historical examples elsewhere in the repository.

## 1. Schema File Organization

- Single `prisma/schema.prisma` file in V1.
- Sections ordered: `generator`, `datasource`, `enums`, then models grouped by module in the same order as `MODULES.md`.
- Section headers use comment banners:

  ```prisma
  // ============================================================
  // IAM — users, roles, permissions, memberships, sessions
  // ============================================================
  ```

## 2. Model Naming

- Models are **PascalCase, singular**: `User`, `Classroom`, `AttendanceEntry`.
- Fields are **camelCase**: `firstName`, `createdAt`.
- Tables are **snake_case, plural** via `@@map("attendance_entries")`.
- Columns are **snake_case** via `@map("created_at")`.

## 3. Primary Keys

- All models use UUID as `id`.
- Column definition:

  ```prisma
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ```

- Never use auto-increment integers for user-facing IDs.

## 4. Timestamps (Mandatory on All Domain Models)

```prisma
createdAt DateTime @default(now()) @map("created_at")
updatedAt DateTime @updatedAt @map("updated_at")
```

## 5. Soft Delete

- Default strategy: `deletedAt DateTime? @map("deleted_at")` column on models where business logic needs history.
- Models that MUST use soft delete: `User`, `Student`, `Enrollment`, `Role`, `Assessment`, `Mission`, `Classroom`, `Section`, `Grade`.
- Models that use hard delete: `AttendanceEntry` (replaced via upsert), `Session` (auth tokens), `AuditLog` (never deleted, but also never soft-deleted), junction tables.
- The Prisma scope extension automatically adds `deletedAt: null` to every query unless explicitly opted out via `includeSoftDeleted()`.

## 6. Tenancy Columns

- Every tenant-scoped model must include `schoolId String @db.Uuid` with an index.
- Cross-school organizational models include `organizationId String @db.Uuid`.
- Platform-level models (`Organization`, `School`, `Plan`, `PlatformUser`, `GlobalPermission`) have neither.
- The Prisma `schoolScope` extension automatically enforces `schoolId` on queries. See `SECURITY_MODEL.md`.

## 7. Relations

- Relation fields use the referenced model name:

  ```prisma
  school   School @relation(fields: [schoolId], references: [id])
  schoolId String @db.Uuid
  ```

- Relations are named explicitly when there is ambiguity: `@relation("EnrollmentToClassroom")`.
- `onDelete: Restrict` is the default. Use `Cascade` only for clearly-owned child records (e.g., `AttendanceEntry` cascades from `AttendanceSession`).

## 8. Enums

- Enums are PascalCase: `AttendanceStatus`.
- Values are UPPER_SNAKE_CASE: `PRESENT`, `ABSENT`, `LATE`, `EXCUSED`.
- Values are mapped to lowercase strings at the API boundary via presenters when the contract expects lowercase.

## 9. Indexes

- Every foreign key is indexed.
- Every column used in `WHERE` clauses on hot paths is indexed.
- Compound indexes when queries filter on multiple columns together:

  ```prisma
  @@index([schoolId, academicYearId])
  ```

- Unique constraints use per-tenant scoping:

  ```prisma
  @@unique([schoolId, name])
  ```

## 10. Teacher Single-School Constraint

Because a teacher must have exactly one active membership (per `USER_TYPES.md`), the `Membership` model enforces:

```prisma
model Membership {
  // ...
  // Prisma cannot express the required partial uniqueness predicate.
  // The migration SQL owns the database constraint shown below.
}
```

The enforcement logic is:
- Partial unique index in PostgreSQL: `CREATE UNIQUE INDEX ... ON memberships (user_id) WHERE user_type = 'TEACHER' AND status = 'ACTIVE'`.
- Application-level check at membership creation.

## 11. Migrations

- The canonical migration path is:

  ```text
  prisma/migrations/YYYYMMDDHHMMSS_snake_case_description/migration.sql
  ```

- Directory names must match `^\d{14}_[a-z0-9_]+$`.
- The fourteen-digit timestamp is generated at migration creation time. Do not
  use a date-only timestamp, sequence number, or invented historical timestamp.
- Older date-only and sequence-bearing names visible in Git history are legacy
  formats only and must not be reused.
- One migration = one logical change set.
- No destructive changes without explicit ADR.
- `prisma migrate dev --create-only` creates local feature migrations;
  `prisma migrate deploy` applies migrations in CI and production.
- Every schema change requires a new migration. A schema sprint is not ready for
  review until the full active chain replays against an empty PostgreSQL
  database.
- Once committed and merged into `main`, a migration is immutable: never edit,
  rename, delete, or replace it.
- Manual SQL edits are allowed only before the migration is first applied and
  only when Prisma-generated SQL is incomplete or a documented
  PostgreSQL-specific object is required.
- Direct SQL execution, schema push on shared/deployed databases, and
  unapproved migration resolution are not migration-development tools.
- Drift, checksum mismatch, reset request, failed migration, or P3009 is a hard
  stop. Follow `MIGRATION_GOVERNANCE.md`; never bypass it with manual SQL.

## 12. Client Usage

- Prisma client is accessed only through repository classes in each module's `infrastructure/repositories/` directory.
- No service ever imports `PrismaClient` directly.
- No controller ever uses prisma, repositories, or services directly for DB access — controllers delegate to application-layer use cases.

## 13. Seeding

- Seeds are idempotent (safe to re-run).
- Seed files live in `prisma/seeds/` grouped by module:
  - `prisma/seeds/01-permissions.seed.ts`
  - `prisma/seeds/02-system-roles.seed.ts`
  - `prisma/seeds/03-platform-admin.seed.ts`
  - `prisma/seeds/04-demo-org.seed.ts` (gated behind `SEED_DEMO_DATA=true`)
- `npm run seed` runs the full seed pipeline in numerical order.
- Demo data seeds are gated behind `SEED_DEMO_DATA=true` environment variable.

## 14. Query Patterns

- Always use `select` or `include` explicitly. Never return entire models by default.
- Use `findUniqueOrThrow` / `findFirstOrThrow` when absence is an error — produces better stack traces.
- Pagination: cursor-based for infinite scroll, offset-based for admin tables. Both supported via shared helpers in `src/common/pagination/`.
- Transactions (`$transaction`) are required for any multi-step mutation that must be atomic.

## 15. Raw SQL

- Runtime parameterized SQL is allowed for reports, analytics, and complex
  aggregations (e.g., gradebook rollups, dashboard KPIs). This does not
  authorize direct execution of migration DDL.
- Must be encapsulated in a repository method with clear typing.
- Must be parameterized — no string concatenation.

## 16. Audit Logs

- `AuditLog` is append-only. No `updatedAt`, no `deletedAt`.
- `AuditLog.before` and `AuditLog.after` are `Json?` columns for flexible payloads.
- `AuditLog` has indexes on `(schoolId, createdAt DESC)` and `(actorId, createdAt DESC)` for common queries.
