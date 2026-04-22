# Sprint 1A — Day-by-Day Execution Guide

This file is the literal, ordered checklist for the first 10 working days. Follow it top to bottom. Claude Code should treat each step as a single unit of work.

---

## Prerequisites (before Day 1)

- Node.js 20+ installed
- Docker Desktop installed and running
- Git installed
- A fresh empty directory: `~/projects/moazez-backend/`
- Claude Code authenticated and ready in that directory

---

## Day 1 — Repository & NestJS bootstrap

### Step 1.1 — Initialize git and copy governance docs

```bash
cd ~/projects/moazez-backend
git init
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
.env
.env.*.local
coverage/
*.log
.DS_Store
storage/
```

Copy ALL root governance files into the repo root:

- README.md
- CLAUDE.md
- PROJECT_OVERVIEW.md
- ARCHITECTURE_DECISION.md
- DIRECTORY_STRUCTURE.md
- MODULES.md
- USER_TYPES.md
- V1_SCOPE.md
- ENGINEERING_RULES.md
- API_CONTRACT_RULES.md
- SECURITY_MODEL.md
- ERROR_CATALOG.md
- DOMAIN_GLOSSARY.md
- PRISMA_CONVENTIONS.md
- SPRINT_ZERO_CHECKLIST.md
- SPRINT_1_REVISED.md
- adr/ADR-0001-multi-tenancy-enforcement.md

```bash
git add -A
git commit -m "chore: add root governance docs"
```

### Step 1.2 — NestJS project init

```bash
npx @nestjs/cli@latest new . --package-manager npm --skip-git
```

When prompted, choose `npm`.

### Step 1.3 — Apply approved folder structure

Create directories:

```bash
mkdir -p src/{bootstrap,common,config,infrastructure,modules,shared}
mkdir -p src/infrastructure/{database,storage,queue,cache,logger,realtime}
mkdir -p prisma/{seeds,migrations}
mkdir -p test/{unit,integration,e2e,security}
mkdir -p docs scripts
```

Commit:

```bash
git add -A
git commit -m "chore: apply approved folder structure"
```

---

## Day 2 — Docker + environment + Prisma init

### Step 2.1 — docker-compose.yml

Create `docker-compose.yml` at the root with postgres 16, redis 7, minio (latest). Bind ports, mount volumes.

### Step 2.2 — .env.example

Define at minimum:

```
APP_PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000

DATABASE_URL=postgresql://moazez:moazez@localhost:5432/moazez_dev
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

STORAGE_PROVIDER=minio
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=moazez-dev
STORAGE_PUBLIC_BUCKET=moazez-dev-public

SEED_DEMO_DATA=true
LOG_LEVEL=debug
```

### Step 2.3 — env validation module

Install `zod`:

```bash
npm install zod
```

Create `src/config/env.validation.ts` with a zod schema that validates all env vars at startup.

### Step 2.4 — Prisma init

```bash
npm install prisma @prisma/client
npx prisma init --datasource-provider postgresql
```

### Step 2.5 — verify docker-compose

```bash
docker compose up -d
docker compose ps
```

All three services must be healthy.

Commit:

```bash
git add -A
git commit -m "feat: docker-compose, env validation, prisma init"
```

---

## Day 3 — First migration (core identity)

### Step 3.1 — Draft schema.prisma

Add models per `PRISMA_CONVENTIONS.md`:

- `Organization`
- `School`
- `User`
- `Membership` (with partial unique index for teacher one-school rule — add the index via manual SQL in the migration)
- `Role`
- `Permission`
- `RolePermission`
- `Session`
- `AuditLog`
- `File` (metadata only)

### Step 3.2 — Generate and edit first migration

```bash
npx prisma migrate dev --name 0001_core_identity --create-only
```

Edit the generated SQL file to add:

- The partial unique index for teacher single-active-membership constraint:

  ```sql
  CREATE UNIQUE INDEX unique_active_teacher_membership
  ON memberships (user_id)
  WHERE status = 'active' AND user_type = 'teacher';
  ```

- Check constraints where needed.

Then apply:

```bash
npx prisma migrate dev
```

Commit:

```bash
git add -A
git commit -m "feat: migration 0001 core identity"
```

---

## Day 4 — Seeds + Prisma module

### Step 4.1 — PrismaModule and PrismaService

Create `src/infrastructure/database/prisma.service.ts` + `prisma.module.ts`. Don't apply the schoolScope extension yet — just get basic connectivity.

### Step 4.2 — Seed files

Create `prisma/seeds/` files in order:

1. `01-permissions.seed.ts` — seed the canonical permission catalog (every code from `ERROR_CATALOG.md` permission entries, plus the full list from settings spec).
2. `02-system-roles.seed.ts` — `platform_super_admin`, `organization_admin`, `school_admin`, `school_principal`, `teacher`, `parent`, `student`.
3. `03-platform-admin.seed.ts` — one platform super admin user.
4. `04-demo-org.seed.ts` — demo organization + demo school + demo school_admin (gated on `SEED_DEMO_DATA=true`).

### Step 4.3 — Seed runner

Add to `package.json`:

```json
"scripts": {
  "seed": "ts-node prisma/seeds/index.ts"
}
```

Run:

```bash
npm run seed
```

Verify in Prisma Studio:

```bash
npx prisma studio
```

Commit:

```bash
git add -A
git commit -m "feat: permission catalog, system roles, demo seeds"
```

---

## Day 5 — Global API configuration + bootstrap

### Step 5.1 — main.ts wiring

Configure in `src/main.ts`:

- `app.setGlobalPrefix('api/v1')` (or enable URI versioning with `app.enableVersioning(...)`)
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
- Global exception filter (see step 5.3)
- CORS (dev permissive, production locked)
- Swagger at `/api/v1/docs`
- Startup log listing all registered routes

### Step 5.2 — Health endpoint

`GET /api/v1/health` returns `{ status: 'ok', timestamp, checks: { db, redis, storage } }`.

### Step 5.3 — Global exception filter

Create `src/common/exceptions/domain-exception.ts` and a filter that maps `DomainException` to the envelope shape defined in `ERROR_CATALOG.md`.

### Step 5.4 — Verify

```bash
npm run start:dev
curl http://localhost:3000/api/v1/health
```

Must return status OK and all three checks green.

Commit:

```bash
git add -A
git commit -m "feat: global /api/v1 prefix, swagger, health, error envelope"
```

---

## Day 6 — RequestContext + Prisma schoolScope

### Step 6.1 — AsyncLocalStorage RequestContext

Create `src/common/context/request-context.ts` with AsyncLocalStorage.

### Step 6.2 — Context middleware

Middleware applied globally that builds `RequestContext` from the JWT (once we have auth) and populates ALS.

### Step 6.3 — Prisma schoolScope extension

Write the extension that injects `schoolId` from `RequestContext` into every applicable query. See `SECURITY_MODEL.md` section 2.

### Step 6.4 — `platformBypassScope()` helper

For platform-level queries that need to see across schools.

Commit:

```bash
git add -A
git commit -m "feat: RequestContext + Prisma schoolScope extension"
```

---

## Day 7 — Auth module

### Step 7.1 — Auth module scaffolding

Create `src/modules/iam/auth/` with the standard internal module shape.

### Step 7.2 — Endpoints

- `POST /api/v1/auth/login` — email/password → returns `{ accessToken, refreshToken, user }`
- `POST /api/v1/auth/refresh` — rotates refresh, returns new pair
- `POST /api/v1/auth/logout` — revokes current session
- `GET /api/v1/auth/me` — returns actor + active membership + permissions

### Step 7.3 — Password hashing

Install `argon2`:

```bash
npm install argon2
```

Update the demo seed to hash the demo password.

### Step 7.4 — Manual verification

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.moazez","password":"demo123"}'
```

Must return tokens.

```bash
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

Must return actor + membership + permissions list.

Commit:

```bash
git add -A
git commit -m "feat: auth module — login, refresh, logout, me"
```

---

## Day 8 — Guards

### Step 8.1 — JwtAuthGuard

Standard JWT validation. Attaches `actor` to request.

### Step 8.2 — ScopeResolverGuard

Resolves active membership + populates `RequestContext` (schoolId, organizationId, role, permissions).

### Step 8.3 — PermissionsGuard

Reads `@RequiredPermissions('settings.users.manage')` decorator, checks against current permissions.

### Step 8.4 — Decorators

Create:

- `@CurrentActor()`
- `@CurrentSchool()`
- `@RequiredPermissions()`
- `@PublicRoute()`

### Step 8.5 — Apply globally

`app.useGlobalGuards(new JwtAuthGuard, new ScopeResolverGuard, new PermissionsGuard)`.

Exempt `/auth/login`, `/auth/refresh`, `/health` via `@PublicRoute()`.

Commit:

```bash
git add -A
git commit -m "feat: guards — jwt, scope, permissions + decorators"
```

---

## Day 9 — Tenancy isolation test

### Step 9.1 — Test setup

Create `test/security/tenancy.spec.ts`.

### Step 9.2 — Test body

- Seed two schools with distinct users and data.
- Log in as school A admin.
- Attempt to `GET /api/v1/settings/users/<school-B-user-id>`.
- Expect 404 (not 403 — we don't leak existence).
- Repeat for a few other resource types seeded in 1A.

### Step 9.3 — Integration test harness

Set up `@nestjs/testing` with an isolated test database (`moazez_test`).

### Step 9.4 — Run

```bash
npm run test:e2e
```

Commit:

```bash
git add -A
git commit -m "test: tenancy isolation integration test"
```

---

## Day 10 — Polish + demo prep

### Step 10.1 — Swagger quality

- All DTOs have `@ApiProperty` annotations.
- Auth endpoints documented.
- Error envelope documented as a reusable schema.

### Step 10.2 — README update

- "Getting Started" section: clone → `docker compose up` → `npx prisma migrate deploy` → `npm run seed` → `npm run start:dev`.
- Credentials for demo admin.
- Link to `/api/v1/docs`.

### Step 10.3 — Audit log baseline

Wire up basic audit log writes for:

- `auth.login.success`
- `auth.login.failure`

### Step 10.4 — Demo script

Write `scripts/demo.sh` that runs the full login → me → tenancy-check flow so you can demo it.

### Step 10.5 — Tag

```bash
git tag -a v0.1.0-sprint-1a -m "Sprint 1A complete: bootstrap + identity"
```

---

## Sprint 1A exit criteria

Before moving to Sprint 1B, every checkbox must be true:

- [ ] `docker compose up` brings up postgres, redis, minio cleanly
- [ ] `npx prisma migrate deploy` applies from scratch on an empty DB
- [ ] `npm run seed` produces a runnable demo
- [ ] Login works end-to-end
- [ ] `/auth/me` returns actor + active membership + permissions
- [ ] Tenancy isolation test passes
- [ ] Swagger loads at `/api/v1/docs`
- [ ] Health endpoint reports all three dependencies OK
- [ ] No Prisma call in the codebase is outside a repository class
- [ ] No controller contains business logic
- [ ] All endpoints prefixed with `/api/v1/`
- [ ] Governance docs in root match latest versions

If any of these is false, fix it before Sprint 1B — 1B assumes this foundation is solid.
