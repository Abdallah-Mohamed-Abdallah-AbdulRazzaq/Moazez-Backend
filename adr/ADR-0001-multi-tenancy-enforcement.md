# ADR-0001: Multi-Tenancy Enforcement Strategy

## Status

Accepted — 2026-04-16

## Context

Moazez is a multi-school SaaS platform. Every tenant-scoped query must be restricted to the actor's active school (and/or organization). Leakage between tenants is a critical bug.

We evaluated three strategies:

1. **PostgreSQL Row-Level Security (RLS)** — database-enforced via `current_setting('app.current_school_id')`.
2. **Application-level filtering via Prisma extension** — Prisma middleware automatically injects `schoolId` into every query.
3. **Manual filtering** — every service adds `where: { schoolId }` by hand.

## Decision

We adopt **Option 2: application-level filtering via a Prisma extension**, combined with mandatory scope guards at the HTTP layer and a `RequestContext` propagated via AsyncLocalStorage.

## Consequences

### Positive

- Explicit and debuggable. Developers can trace filtering in code, not in database internals.
- Works predictably with Prisma. RLS has known friction with Prisma type generation and introspection.
- Single implementation point: one Prisma extension + one set of guards.
- Easy to add tests that verify scope is always applied.
- Supports complex business logic (e.g., organization-wide queries for `organization_user`) without acrobatics.

### Negative

- Not defense-in-depth. A bug that bypasses the extension leaks data.
- Relies on discipline: any developer using raw SQL must remember to add `WHERE school_id = ...`.
- Cross-tenant leaks are caught only by tests, not by the database.

### Mitigations

- Code review rejects any `prisma.<model>.<method>(...)` call that does not go through a repository class.
- Integration tests simulate cross-tenant access attempts on every major module.
- A planned V2 ADR will layer RLS on top as defense-in-depth once V1 is stable.
- Raw SQL is reviewed for `school_id` predicate presence.

## Implementation

1. A Prisma extension named `schoolScope` is applied globally in `src/infrastructure/database/prisma.module.ts`.
2. The extension reads `schoolId` from the current `RequestContext` (AsyncLocalStorage).
3. Every `findMany`, `findFirst`, `findUnique`, `count`, `update`, `delete`, `aggregate`, `groupBy` automatically receives `where.schoolId = currentContext.schoolId`.
4. Platform-level queries (e.g., listing all schools) must explicitly opt out via a `platformBypassScope()` helper that runs the query against an un-extended client.
5. Models that are NOT tenant-scoped (`Organization`, `School` itself, `Plan`, `PlatformUser`, `GlobalPermission`) are explicitly excluded from the extension's scope.
6. The scope extension also enforces `deletedAt: null` by default.

## Verification

Integration tests in `test/security/tenancy.spec.ts`:

- Create two schools with separate data.
- Log in as school A admin.
- Attempt to read school B data by guessing UUIDs.
- Expect 404 for all such attempts across every module.
- Re-run on every CI build.

## Revisit triggers

This ADR should be revisited if:

- A cross-tenant leak is discovered in production.
- Prisma's extension API materially changes.
- PostgreSQL RLS becomes operationally trivial with Prisma.
- Customer compliance requires database-enforced isolation (SOC2, ISO 27001, or equivalent).
