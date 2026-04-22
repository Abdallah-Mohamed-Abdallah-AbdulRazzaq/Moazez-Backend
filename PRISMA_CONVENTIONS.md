# Prisma Conventions

Rules for how Prisma schema, migrations, and client usage are structured.

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
  @@unique([userId, status], name: "unique_active_teacher_membership")
  // combined with a check constraint:
  // CHECK (user_type != 'teacher' OR (user_type = 'teacher' AND status = 'active'))
}
```

The enforcement logic is:
- Partial unique index in PostgreSQL: `CREATE UNIQUE INDEX ... WHERE user_type = 'teacher' AND status = 'active'`.
- Application-level check at membership creation.

## 11. Migrations

- Migration files are **numbered + descriptive**: `20260420_0001_core_identity.sql`.
- One migration = one logical change set.
- No destructive changes without explicit ADR.
- `prisma migrate dev` for local development, `prisma migrate deploy` for CI and production.
- Manual SQL edits of migration files are allowed (and expected) when Prisma-generated SQL is wrong, incomplete, or when PostgreSQL-specific features are needed (partial indexes, check constraints, RLS later, etc.).

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

- Allowed for reports, analytics, and complex aggregations (e.g., gradebook rollups, dashboard KPIs).
- Must be encapsulated in a repository method with clear typing.
- Must be parameterized — no string concatenation.

## 16. Audit Logs

- `AuditLog` is append-only. No `updatedAt`, no `deletedAt`.
- `AuditLog.before` and `AuditLog.after` are `Json?` columns for flexible payloads.
- `AuditLog` has indexes on `(schoolId, createdAt DESC)` and `(actorId, createdAt DESC)` for common queries.
