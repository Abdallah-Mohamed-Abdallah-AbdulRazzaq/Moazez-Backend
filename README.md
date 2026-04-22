# Moazez Backend

Moazez is a multi-school educational SaaS platform.

This backend is the single source of truth for:

- Platform administration
- Organizations and schools
- Identity and access control
- Admissions
- Academics
- Students and guardians
- Attendance
- Grades
- Reinforcement
- Communication
- Teacher app APIs
- Student app APIs
- Parent app APIs
- Dashboard APIs

## Core Principles

1. This project is a **multi-tenant, multi-school platform**.
2. The hierarchy is:
   - Platform
   - Organization
   - School
3. School dashboard modules are the operational source of truth.
4. Teacher, student, and parent apps consume data from the operational core.
5. Database design must remain normalized.
6. API responses may be aggregated and tailored for frontend needs.
7. Files are stored in external object storage; only metadata is stored in the database.
8. All schema changes must happen through migrations.
9. No business logic is allowed inside controllers.
10. V1 scope is fixed and must not be expanded without an explicit decision.

## Approved Stack

- NestJS
- TypeScript
- PostgreSQL
- Prisma
- Redis
- BullMQ
- S3-compatible object storage
- Socket.io
- Swagger / OpenAPI
- Docker

## Project Status

This repository starts from:

- approved architecture
- approved folder structure
- approved module boundaries
- approved user types
- approved V1 scope

Read these files before implementing anything:

- `CLAUDE.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `DOMAIN_GLOSSARY.md`
- `DIRECTORY_STRUCTURE.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `ERROR_CATALOG.md`
- `SPRINT_1_REVISED.md`
- `SPRINT_1A_DAY_BY_DAY.md`
- `adr/` (all ADRs)

## Non-Negotiables

- Do not introduce microservices in V1.
- Do not break adapter-backed API paths.
- Do not store binary files inside PostgreSQL.
- Do not bypass scope checks.
- Do not implement out-of-scope features without approval.
- Do not redesign the platform-school hierarchy.

## Getting Started

### Prerequisites

| Tool                    | Version               |
| ----------------------- | --------------------- |
| Node.js                 | 20+                   |
| Docker + Docker Compose | latest                |
| `jq`                    | for `scripts/demo.sh` |

### 1. Clone and install

```bash
git clone <repo-url>
cd Backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Review .env and set JWT secrets to 16+ characters before running the app
```

### 3. Start backing services

```bash
npm run infra:up
# Starts PostgreSQL (5433), Redis (6379), and MinIO (9000) and waits for readiness
```

### 4. Run migrations and seed

```bash
npm run db:migrate          # apply all migrations
npm run seed                # load permissions, system roles, and demo data
```

### 5. Start the dev server

```bash
npm run start:dev
# API:     http://localhost:3000/api/v1
# Swagger: http://localhost:3000/api/v1/docs
```

### 6. Run the demo script

```bash
bash scripts/demo.sh
# Exercises login → /me → refresh → logout flow end-to-end
```

## Sprint 1B Local Verification

Official closeout flow from a clean local setup:

```bash
cp .env.example .env
# Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 16+ characters

npm run infra:up
npm run verify:sprint1b
```

`npm run verify:sprint1b` runs the Sprint 1B preflight check, migrations, seed, build, unit tests, and security tests in order.

## Sprint 1C Runbook

From a clean local setup:

```bash
cp .env.example .env
# Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 16+ characters

npm run infra:up
npm run verify:sprint1c
```

`npm run verify:sprint1c` runs preflight, migrations, seed, build, unit tests, security tests, and the three high-value Files e2e flows:

- upload -> secure download
- attachments preview -> delete link -> file still downloads
- imports skeleton -> status -> report

For a human demo against a running app:

```bash
npm run start:dev
npm run demo:sprint1c
```

Sprint 1C Files endpoints:

- `POST /api/v1/files`
- `GET /api/v1/files/:id/download`
- `POST /api/v1/files/attachments`
- `GET /api/v1/files/attachments`
- `DELETE /api/v1/files/attachments/:id`
- `POST /api/v1/files/imports`
- `GET /api/v1/files/imports/:id`
- `GET /api/v1/files/imports/:id/report`

Local URLs:

- App: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/v1/docs`

## Sprint 2A Admissions Runbook

From a clean local setup:

```bash
cp .env.example .env
# Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 16+ characters
# Ensure SEED_DEMO_DATA=true

npm run infra:up
npm run verify:sprint2a
```

`npm run verify:sprint2a` runs the Sprint 2A preflight check, migrations, seed, build, unit tests, security tests, and the high-value admissions e2e closeout flow.

For a human demo against a running app:

```bash
npm run start:dev
npm run demo:sprint2a
```

Sprint 2A admissions verification covers:

- login -> create lead -> create application -> link document -> submit application
- create and complete a placement test and interview
- create a decision, reject duplicate decisions, and reject decisions when prerequisites are missing
- call `POST /api/v1/admissions/applications/:id/enroll` for bounded handoff preview
- confirm non-accepted handoff fails and no student/guardian/enrollment side effects are introduced

Local URLs:

- App: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/v1/docs`

### Seed credentials

| Role         | Email                      | Password     |
| ------------ | -------------------------- | ------------ |
| School Admin | `admin@academy.moazez.dev` | `School123!` |

### Available scripts

| Script                              | Purpose                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run infra:up`                  | Start PostgreSQL, Redis, and MinIO and wait for readiness                                        |
| `npm run infra:status`              | Show local infrastructure status                                                                 |
| `npm run db:migrate`                | Apply Prisma migrations locally                                                                  |
| `npm run start:dev`                 | Dev server with hot-reload                                                                       |
| `npm run build`                     | Production build                                                                                 |
| `npm run test`                      | Unit tests                                                                                       |
| `npm run test:e2e`                  | Integration / e2e tests                                                                          |
| `npm run test:e2e:sprint1c`         | Run the three Sprint 1C Files e2e flows                                                          |
| `npm run test:e2e:sprint2a`         | Run the Sprint 2A Admissions closeout e2e flows                                                  |
| `npm run test:security`             | Tenancy isolation tests                                                                          |
| `npm run verify:sprint1b:preflight` | Fail fast if `.env` or required local services are not ready                                     |
| `npm run verify:sprint1b`           | Run preflight, migrations, seed, build, unit tests, and security tests                           |
| `npm run verify:sprint1c:preflight` | Fail fast if `.env` or required local services are not ready                                     |
| `npm run verify:sprint1c`           | Run preflight, migrations, seed, build, unit tests, security tests, and Sprint 1C Files e2e      |
| `npm run verify:sprint2a:preflight` | Fail fast if `.env` or required local services are not ready                                     |
| `npm run verify:sprint2a`           | Run preflight, migrations, seed, build, unit tests, security tests, and Sprint 2A Admissions e2e |
| `npm run seed`                      | Re-run idempotent seeds                                                                          |
| `bash scripts/demo.sh`              | End-to-end smoke test                                                                            |
| `npm run demo:sprint1c`             | Run the Sprint 1C Files demo flow against a running server                                       |
| `npm run demo:sprint2a`             | Run the Sprint 2A Admissions demo flow against a running server                                  |
