# Full Directory Structure (Visual Reference)

This is the complete tree of the Moazez backend. Use it as your mental map. When unsure where a file goes, this file wins.

## 1. Root of the Repository

```text
moazez-backend/
│
│  ═══════════════════════════════════════════════════════════
│  GOVERNANCE FILES (read by agent at every session)
│  ═══════════════════════════════════════════════════════════
│
├── AGENT_CONTEXT_PRIMER.md    ← THE FIRST FILE CLAUDE CODE READS
├── CLAUDE.md                   ← Agent behavior rules
├── README.md                   ← Human-facing project intro
│
│  ─── Tier 1 — Always-on context ───
├── PROJECT_OVERVIEW.md
├── ARCHITECTURE_DECISION.md
├── DIRECTORY_STRUCTURE.md
├── ENGINEERING_RULES.md
│
│  ─── Tier 2 — Task-specific context ───
├── SECURITY_MODEL.md
├── PRISMA_CONVENTIONS.md
├── API_CONTRACT_RULES.md
├── ERROR_CATALOG.md
├── DOMAIN_GLOSSARY.md
├── USER_TYPES.md
├── MODULES.md
├── V1_SCOPE.md
├── TESTING_STRATEGY.md
├── OBSERVABILITY.md
│
│  ─── Tier 3 — Execution context ───
├── SPRINT_ZERO_CHECKLIST.md
├── SPRINT_1_REVISED.md
├── SPRINT_1A_DAY_BY_DAY.md
│
│  ─── Architecture Decision Records ───
├── adr/
│   └── ADR-0001-multi-tenancy-enforcement.md
│
│  ═══════════════════════════════════════════════════════════
│  SOURCE CODE
│  ═══════════════════════════════════════════════════════════
│
├── src/
│   ├── main.ts                 ← Entry point (/api/v1 prefix, pipes, filters)
│   ├── app.module.ts           ← Root module wiring everything
│   │
│   ├── bootstrap/              ← Startup logic pulled out of main.ts
│   │   ├── swagger.setup.ts
│   │   ├── global-filters.setup.ts
│   │   ├── global-pipes.setup.ts
│   │   └── global-interceptors.setup.ts
│   │
│   ├── common/                 ← Framework-level reusable utilities
│   │   ├── context/
│   │   │   ├── request-context.ts          ← AsyncLocalStorage
│   │   │   └── context.middleware.ts
│   │   ├── decorators/
│   │   │   ├── current-actor.decorator.ts
│   │   │   ├── current-school.decorator.ts
│   │   │   ├── required-permissions.decorator.ts
│   │   │   ├── public-route.decorator.ts
│   │   │   └── platform-scope.decorator.ts
│   │   ├── exceptions/
│   │   │   ├── domain-exception.ts         ← Base exception class
│   │   │   └── global-exception.filter.ts  ← Maps to ERROR_CATALOG envelope
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── scope-resolver.guard.ts
│   │   │   └── permissions.guard.ts
│   │   ├── interceptors/
│   │   │   ├── logging.interceptor.ts
│   │   │   └── timing.interceptor.ts
│   │   ├── pipes/
│   │   │   └── parse-uuid.pipe.ts
│   │   ├── i18n/
│   │   │   ├── errors.ar.json
│   │   │   └── errors.en.json
│   │   └── pagination/
│   │       ├── cursor-pagination.helper.ts
│   │       └── offset-pagination.helper.ts
│   │
│   ├── config/                 ← Env + app configuration
│   │   ├── env.validation.ts               ← zod schema
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   ├── storage.config.ts
│   │   ├── jwt.config.ts
│   │   └── redis.config.ts
│   │
│   ├── infrastructure/         ← Technical adapters (no business logic)
│   │   ├── database/
│   │   │   ├── prisma.module.ts
│   │   │   ├── prisma.service.ts
│   │   │   ├── school-scope.extension.ts   ← THE tenancy extension
│   │   │   └── platform-bypass.helper.ts
│   │   ├── storage/
│   │   │   ├── storage.module.ts
│   │   │   ├── storage.service.ts
│   │   │   ├── minio.adapter.ts
│   │   │   └── signed-url.service.ts
│   │   ├── queue/
│   │   │   ├── queue.module.ts
│   │   │   └── bullmq.service.ts
│   │   ├── cache/
│   │   │   ├── cache.module.ts
│   │   │   └── redis-cache.service.ts
│   │   ├── logger/
│   │   │   ├── logger.module.ts
│   │   │   └── pino-logger.service.ts
│   │   ├── realtime/           ← Empty in Sprint 1, built later
│   │   │   └── .gitkeep
│   │   ├── mail/               ← Empty in Sprint 1
│   │   │   └── .gitkeep
│   │   └── sms/                ← Empty in Sprint 1
│   │       └── .gitkeep
│   │
│   ├── modules/                ← All business modules
│   │   │
│   │   │  ──── CORE DOMAINS (source of truth) ────
│   │   ├── platform/           ← Platform admin, orgs, schools, plans
│   │   ├── iam/                ← Auth, users, roles, permissions, memberships, sessions
│   │   ├── settings/           ← Branding, templates, security, audit, backup
│   │   ├── files/              ← Uploads, attachments, file-links
│   │   ├── admissions/         ← Leads, applications, docs, tests, interviews, decisions
│   │   ├── academics/          ← Years, terms, structure, subjects, calendar, timetable
│   │   ├── students/           ← Students, guardians, enrollments, transfers
│   │   ├── attendance/         ← Policies, roll-call, absences, excuses, reports
│   │   ├── grades/             ← Assessments, gradebook, analytics, rules
│   │   ├── reinforcement/      ← Tasks, templates, rewards, review-queue, XP
│   │   ├── communication/      ← Conversations, messages, announcements, notifications
│   │   │
│   │   │  ──── APP-FACING LAYERS (composition only) ────
│   │   ├── teacher-app/
│   │   ├── student-app/
│   │   ├── parent-app/
│   │   └── dashboard/
│   │
│   └── shared/                 ← Cross-module artifacts
│       ├── events/
│       │   └── domain-events.ts            ← Cross-module events (if/when needed)
│       ├── presenters/
│       │   └── base.presenter.ts
│       └── read-models/
│           └── .gitkeep
│
│  ═══════════════════════════════════════════════════════════
│  DATABASE
│  ═══════════════════════════════════════════════════════════
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   │   ├── 20260420_0001_core_identity/
│   │   │   └── migration.sql
│   │   ├── 20260428_0002_settings_baseline/
│   │   └── 20260505_0003_academic_structure/
│   └── seeds/
│       ├── index.ts                        ← Orchestrator
│       ├── 01-permissions.seed.ts
│       ├── 02-system-roles.seed.ts
│       ├── 03-platform-admin.seed.ts
│       └── 04-demo-org.seed.ts             ← Gated by SEED_DEMO_DATA
│
│  ═══════════════════════════════════════════════════════════
│  TESTING
│  ═══════════════════════════════════════════════════════════
│
├── test/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── security/               ← Tenancy isolation tests (CRITICAL)
│   │   └── tenancy.spec.ts
│   └── fixtures/               ← Shared test data helpers
│       ├── school.fixture.ts
│       ├── user.fixture.ts
│       └── enrollment.fixture.ts
│
│  ═══════════════════════════════════════════════════════════
│  OPERATIONAL
│  ═══════════════════════════════════════════════════════════
│
├── docs/
│   ├── erd/                    ← ERD diagrams (generated or hand-drawn)
│   └── contracts/              ← Copies of sis_dashboard-*-backend_handoff_spec.md
│
├── scripts/
│   ├── demo.sh                 ← End-to-end demo script
│   ├── reset-db.sh
│   └── generate-erd.sh
│
├── storage/                    ← Local-only throwaway dir (gitignored)
│
│  ═══════════════════════════════════════════════════════════
│  ROOT CONFIG
│  ═══════════════════════════════════════════════════════════
│
├── .env.example
├── .env                        ← gitignored
├── .gitignore
├── .nvmrc                      ← pin Node version
├── .prettierrc
├── .eslintrc.cjs
├── docker-compose.yml
├── docker-compose.override.yml.example
├── Dockerfile                  ← for production builds (Sprint 2+)
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
└── jest.config.ts
```

## 2. Standard Internal Shape of Every Business Module

Every module inside `src/modules/` follows this exact pattern. Example: `iam/auth/`.

```text
src/modules/iam/auth/
├── auth.module.ts              ← NestJS module declaration
│
├── controller/                 ← HTTP layer only, thin
│   └── auth.controller.ts      ← @Controller('auth'), maps to /api/v1/auth/*
│
├── application/                ← Use-cases / orchestration
│   ├── login.use-case.ts
│   ├── refresh.use-case.ts
│   ├── logout.use-case.ts
│   └── me.use-case.ts
│
├── domain/                     ← Business rules / policies / invariants
│   ├── password.service.ts     ← argon2 hashing
│   └── token.service.ts        ← JWT signing rules
│
├── infrastructure/             ← Repositories, external integrations
│   ├── session.repository.ts
│   └── jwt.strategy.ts         ← passport strategy
│
├── dto/                        ← Request/response contracts
│   ├── login-request.dto.ts
│   ├── login-response.dto.ts
│   └── me-response.dto.ts
│
├── presenters/                 ← Response shaping for frontend contracts
│   └── me.presenter.ts
│
├── validators/                 ← Custom validation schemas
│   └── login.validator.ts
│
└── tests/                      ← Module-local tests
    ├── login.use-case.spec.ts
    └── auth.e2e-spec.ts
```

## 3. Example: Full Expansion of the `iam/` Module

```text
src/modules/iam/
├── iam.module.ts
├── auth/                       ← (see structure above)
├── users/
│   ├── users.module.ts
│   ├── controller/users.controller.ts
│   ├── application/
│   │   ├── create-user.use-case.ts
│   │   ├── invite-user.use-case.ts
│   │   ├── update-user.use-case.ts
│   │   ├── change-user-status.use-case.ts
│   │   ├── resend-invite.use-case.ts
│   │   └── reset-password.use-case.ts
│   ├── domain/user.entity.ts
│   ├── infrastructure/user.repository.ts
│   ├── dto/
│   ├── presenters/
│   ├── validators/
│   └── tests/
├── roles/
│   ├── roles.module.ts
│   ├── controller/roles.controller.ts
│   ├── application/
│   │   ├── list-roles.use-case.ts
│   │   ├── create-role.use-case.ts
│   │   ├── clone-role.use-case.ts
│   │   ├── update-role.use-case.ts
│   │   ├── delete-role.use-case.ts
│   │   └── update-role-permissions.use-case.ts
│   ├── ...
├── permissions/
│   └── ... (permission catalog access)
├── memberships/
│   └── ... (including teacher single-school enforcement)
└── sessions/
    └── ... (session listing, revocation)
```

## 4. Example: Full Expansion of the `academics/` Module

```text
src/modules/academics/
├── academics.module.ts
├── overview/
├── structure/                  ← The tree: years→terms→stages→grades→sections→classrooms
│   ├── structure.module.ts
│   ├── controller/structure.controller.ts
│   ├── application/
│   │   ├── get-tree.use-case.ts
│   │   ├── create-year.use-case.ts
│   │   ├── create-term.use-case.ts
│   │   ├── create-stage.use-case.ts
│   │   ├── create-grade.use-case.ts
│   │   ├── create-section.use-case.ts
│   │   ├── create-classroom.use-case.ts
│   │   └── reorder-nodes.use-case.ts
│   ├── domain/structure.policy.ts
│   ├── infrastructure/
│   │   ├── year.repository.ts
│   │   ├── term.repository.ts
│   │   ├── stage.repository.ts
│   │   ├── grade.repository.ts
│   │   ├── section.repository.ts
│   │   └── classroom.repository.ts
│   ├── dto/
│   ├── presenters/tree.presenter.ts
│   └── tests/
├── subjects/
├── teacher-allocation/
├── rooms/
├── calendar/
├── curriculum/
├── lesson-plans/
└── timetable/
```

## 5. App-Facing Modules — Different Shape

App-facing modules (`teacher-app/`, `student-app/`, `parent-app/`, `dashboard/`) are **composition layers**. They do NOT own data. They import from core modules and compose responses.

```text
src/modules/teacher-app/
├── teacher-app.module.ts
├── home/
│   ├── home.module.ts
│   ├── controller/home.controller.ts       ← GET /api/v1/teacher/home
│   ├── application/
│   │   └── get-home-screen.use-case.ts     ← orchestrates many core services
│   ├── presenters/home-screen.presenter.ts ← exact shape expected by frontend
│   ├── dto/
│   └── tests/
├── schedule/
├── my-classes/
├── classroom/
├── homeworks/
├── tasks/
├── xp-center/
├── messages/
├── profile/
└── settings/
```

**Rule**: an app-facing module may NOT have its own repositories. If it feels like it needs one, the logic belongs in a core module.

## 6. Where Things Go — Quick Reference

| If you're adding...                  | Put it in...                                       |
| ------------------------------------ | -------------------------------------------------- |
| a new endpoint                       | `modules/<module>/<submodule>/controller/`         |
| business logic for a workflow        | `modules/<module>/<submodule>/application/` (use-case) |
| a domain rule / invariant            | `modules/<module>/<submodule>/domain/`             |
| a Prisma query                       | `modules/<module>/<submodule>/infrastructure/*.repository.ts` |
| a request or response DTO            | `modules/<module>/<submodule>/dto/`                |
| a frontend-specific response shape   | `modules/<module>/<submodule>/presenters/`         |
| a cross-module decorator             | `common/decorators/`                               |
| a custom guard                       | `common/guards/` (global) or module folder (local) |
| a reusable helper                    | `common/` (framework) or `shared/` (domain-ish)    |
| a technical adapter (S3, email, etc.) | `infrastructure/<area>/`                          |
| a cross-module event                 | `shared/events/`                                   |
| a migration                          | `prisma/migrations/`                               |
| a seed                               | `prisma/seeds/`                                    |
| a tenancy isolation test             | `test/security/`                                   |
| an ADR                               | `adr/ADR-NNNN-*.md`                                |
