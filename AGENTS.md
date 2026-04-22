# Codex Code Instructions for Moazez Backend

You are working on the Moazez backend.

You must treat this file as a high-priority implementation guide.

## Mission

Build a production-ready backend for a multi-school educational SaaS platform using:
- NestJS
- PostgreSQL
- Prisma
- Redis
- BullMQ
- S3-compatible object storage

## Architecture Rules

1. Use **modular monolith** architecture.
2. Respect the hierarchy:
   - Platform
   - Organization
   - School
3. Keep core domain modules as the source of truth.
4. Treat app-facing modules as composition / read-model modules only.
5. Keep database storage normalized.
6. Build custom API response shapes in the application/presenter layer, not in the database schema.

## Required Reading Order

Before making changes, always read:

1. `PROJECT_OVERVIEW.md`
2. `ARCHITECTURE_DECISION.md`
3. `SECURITY_MODEL.md`
4. `DOMAIN_GLOSSARY.md`
5. `DIRECTORY_STRUCTURE.md`
6. `MODULES.md`
7. `USER_TYPES.md`
8. `V1_SCOPE.md`
9. `PRISMA_CONVENTIONS.md`
10. `ENGINEERING_RULES.md`
11. `API_CONTRACT_RULES.md`
12. `ERROR_CATALOG.md`
13. All `adr/ADR-*.md` files in numerical order

## Implementation Rules

- Never put business logic inside controllers.
- Never use Prisma in controllers directly.
- Use services / use-cases in the application layer.
- Use presenters for frontend-specific response shaping.
- Use DTOs for all request/response contracts.
- Use guards for auth/scope/permission enforcement.
- Use interceptors and filters for cross-cutting behavior.
- Use migrations only for schema changes.
- Use external storage for files.
- Use queues for async work.
- Use audit logging for sensitive actions.

## V1 Scope Discipline

You must not implement these in V1 unless explicitly approved:
- platform billing engine
- finance module
- HR module
- wallet
- marketplace
- advanced smart pickup
- advanced analytics builder

## Adapter-backed Contracts

If a frontend contract is marked as adapter-backed, do not change:
- path
- method
- base route naming

Only implement the backend behind it.

## Code Quality Rules

- Prefer clear code over clever code.
- Prefer explicit names over short names.
- Prefer small services over giant service files.
- Prefer domain boundaries over convenience imports.
- Prefer typed DTOs and typed return objects.
- Prefer testable units.

## Migration Rules

- Every schema change must be a migration.
- Do not edit production schema manually.
- Prefer incremental migrations.
- Keep seed data separate from migrations.

## Output Style

When generating code:
- generate complete files
- keep imports correct
- keep naming consistent
- include minimal helpful comments
- avoid placeholders when possible
- do not leave architecture TODOs unresolved unless explicitly noted

## If Unsure

If something is ambiguous:
1. choose the safer architecture path
2. preserve backward compatibility
3. do not expand scope
4. leave a short note in code comments only if necessary

## Version and URL Prefix (Mandatory)

All routes are prefixed with `/api/v1/`. This is enforced at the framework level via `app.setGlobalPrefix('api/v1')` in `main.ts`. Never register a route without this prefix. Never hardcode a route path in a test without the prefix.