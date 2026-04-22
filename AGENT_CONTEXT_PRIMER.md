# Agent Context Primer

> **This is the first file Claude Code must read at the start of every session.**
> It does not contain everything. It tells you what to read next and when.

---

## What You Are Building

Moazez — a multi-tenant educational SaaS backend (NestJS + PostgreSQL + Prisma + Redis + BullMQ + MinIO + Socket.io + Docker).

Hierarchy: **Platform → Organization → School**. School dashboard is the operational source of truth. Teacher, student, parent apps consume it.

## The Five Non-Negotiables

1. **Modular monolith.** No microservices in V1.
2. **All routes prefixed with `/api/v1/`.** Enforced globally in `main.ts`.
3. **No business logic in controllers.** Controllers → use-cases (application layer) → domain/infrastructure.
4. **No direct Prisma usage in controllers.** Repositories only, accessed from use-cases.
5. **Tenancy is enforced by the Prisma `schoolScope` extension.** Never hand-craft `where: { schoolId }`.

## Required Reading by Tier

### Tier 1 — Read at the start of any non-trivial task

- `CLAUDE.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `ENGINEERING_RULES.md`

### Tier 2 — Read when the task touches that area

| Task involves...                          | Must read                    |
| ----------------------------------------- | ---------------------------- |
| auth, scope, audit, files, rate limits    | `SECURITY_MODEL.md`          |
| schema, migrations, Prisma models         | `PRISMA_CONVENTIONS.md`      |
| creating or modifying an endpoint         | `API_CONTRACT_RULES.md`      |
| throwing or handling errors               | `ERROR_CATALOG.md`           |
| an unfamiliar business term               | `DOMAIN_GLOSSARY.md`         |
| users, auth, roles, memberships           | `USER_TYPES.md`              |
| structuring a new module                  | `MODULES.md`                 |
| considering a feature's inclusion         | `V1_SCOPE.md`                |
| writing tests                             | `TESTING_STRATEGY.md`        |
| adding logs, metrics, traces              | `OBSERVABILITY.md`           |

### Tier 3 — Read during active sprint work

- `SPRINT_1_REVISED.md` — sprint split and goals
- `SPRINT_1A_DAY_BY_DAY.md` — the literal daily checklist
- `adr/ADR-*.md` — architecture decisions, in numerical order

## Decision Flow for Every Request

Before writing any code, silently answer:

1. **Is this in V1 scope?** If unsure, read `V1_SCOPE.md`. If out of scope, stop and ask.
2. **Where does this code go?** Consult `DIRECTORY_STRUCTURE_VISUAL.md` section 6 ("Where Things Go").
3. **Does this touch tenant data?** If yes, read `SECURITY_MODEL.md` sections 2–4 before coding.
4. **Does this create a new endpoint?** Read `API_CONTRACT_RULES.md` and confirm prefix `/api/v1/`.
5. **Does this touch the schema?** Read `PRISMA_CONVENTIONS.md` and add a migration.
6. **Will this throw errors?** Check `ERROR_CATALOG.md` for existing codes; add new ones there first.
7. **Is a test needed?** `TESTING_STRATEGY.md` says yes if it touches auth, permissions, admissions, enrollments, attendance, grades, reinforcement.

## If You Don't Know

Do not invent. Stop and ask the developer. Specifically:

- If the business term is not in `DOMAIN_GLOSSARY.md`.
- If the error code is not in `ERROR_CATALOG.md`.
- If the feature might be out of `V1_SCOPE.md`.
- If the architecture conflict is not resolved in an existing ADR.

Writing an ADR is preferred over improvising a fix.

## What NOT to Do

- Do not add libraries not in `ARCHITECTURE_DECISION.md` without an ADR.
- Do not create a new top-level module without updating `MODULES.md` first.
- Do not bypass guards for convenience.
- Do not store binary files in the database or in a local project folder.
- Do not hardcode route paths without the `/api/v1/` prefix.
- Do not commit without running migrations and tests locally.

## Current Sprint

Currently in **Sprint 1A — Bootstrap & Identity**. Day-by-day plan in `SPRINT_1A_DAY_BY_DAY.md`. Work one day at a time. Commit at the end of each day.
