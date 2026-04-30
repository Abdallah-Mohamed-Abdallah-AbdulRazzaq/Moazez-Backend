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

## Sprint 2B Students Runbook

From a clean local setup:

```bash
cp .env.example .env
# Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 16+ characters
# Ensure SEED_DEMO_DATA=true

npm run infra:up
npm run verify:sprint2b
```

`npm run verify:sprint2b` runs the Sprint 2B preflight check, migrations, seed, build, unit tests, security tests, and the high-value Students e2e closeout flow.

For a human demo against a running app:

```bash
npm run start:dev
npm run demo:sprint2b
```

Sprint 2B students verification covers:

- login -> create student -> create guardian -> link guardian -> enforce primary guardian protection
- create enrollment -> verify current/history -> reject placement conflict -> reject inactive academic year
- link a student document -> secure file download -> fetch/update medical profile -> create/update note -> fetch bounded timeline events
- transfer -> withdraw on a fresh active enrollment -> promote on a fresh active enrollment -> verify audit logs and no attendance/grades/reinforcement side effects

Local verification commands:

```bash
npm run build
npm run test -- --runInBand
npm run test:security -- --runInBand
npm run test:e2e:sprint2b
```

Local URLs:

- App: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/v1/docs`

Sprint 2B Students endpoints:

- `POST`, `GET`, `PATCH /api/v1/students-guardians/students`
- `POST`, `GET`, `PATCH`, `DELETE /api/v1/students-guardians/students/:studentId/guardians`
- `POST`, `GET /api/v1/students-guardians/enrollments` and `GET /api/v1/students-guardians/enrollments/current|history|academic-years`
- `POST /api/v1/students-guardians/enrollments/validate|transfer|withdraw|promote`
- `GET`, `POST`, `PATCH`, `DELETE /api/v1/students-guardians/students/:studentId/documents`, `/medical-profile`, `/notes`, `/timeline`
- `GET /api/v1/files/:id/download`

## Sprint 3A Attendance Foundation Runbook

From a clean local setup:

```bash
cp .env.example .env
# Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 16+ characters
# Ensure SEED_DEMO_DATA=true

npm run infra:up
npm run verify:sprint3a
```

`npm run verify:sprint3a` runs the Sprint 2B preflight check, migrations, seed, build, unit tests, security tests, Sprint 2B Students E2E, and the Sprint 3A Attendance closeout E2E.

Sprint 3A attendance verification covers:

- login -> resolve school context -> create isolated academic/student prerequisites
- create a classroom attendance policy -> resolve the effective policy
- resolve a draft roll-call session -> fetch roster -> save present and absent entries
- submit the session -> reject submitted-session entry mutation with `attendance.session.already_submitted`
- verify absences, absence summary, reports summary, daily trend, and scope breakdown
- unsubmit the session -> verify absences and reports no longer include it -> edit the reopened draft

Local verification commands:

```bash
npm run build
npm run test -- --runInBand
npm run test:security -- --runInBand
npm run test:e2e:sprint3a
npm run verify:sprint3a
```

Sprint 3A Attendance endpoints:

- Policies: `GET`, `POST`, `PATCH`, `DELETE /api/v1/attendance/policies`, `GET /api/v1/attendance/policies/effective`, `GET /api/v1/attendance/policies/validate-name`
- Roll-call: `GET /api/v1/attendance/roll-call/roster`, `POST /api/v1/attendance/roll-call/session/resolve`, `GET /api/v1/attendance/roll-call/sessions`, `GET /api/v1/attendance/roll-call/sessions/:id`, `PUT /api/v1/attendance/roll-call/sessions/:id/entries`, `PUT /api/v1/attendance/roll-call/sessions/:id/entries/:studentId`, `POST /api/v1/attendance/roll-call/sessions/:id/submit`, `POST /api/v1/attendance/roll-call/sessions/:id/unsubmit`
- Absences: `GET /api/v1/attendance/absences`, `GET /api/v1/attendance/absences/summary`
- Reports: `GET /api/v1/attendance/reports/summary`, `GET /api/v1/attendance/reports/daily-trend`, `GET /api/v1/attendance/reports/scope-breakdown`

Absences and reports are derived only from `SUBMITTED` attendance sessions. `DRAFT` sessions, including sessions reopened by unsubmit, remain editable but do not affect absence lists, absence summaries, or attendance reports until submitted again.

## Sprint 3B Attendance Excuses & Corrections Runbook

From a clean local setup:

```bash
cp .env.example .env
# Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 16+ characters
# Ensure SEED_DEMO_DATA=true

npm run infra:up
npm run verify:sprint3b
```

`npm run verify:sprint3b` runs the Sprint 2B preflight check, migrations, seed, build, unit tests, security tests, Sprint 2B Students E2E, Sprint 3A Attendance E2E, and the Sprint 3B Attendance Excuses & Corrections closeout E2E.

Sprint 3B attendance verification covers:

- excuse request CRUD
- attachment link/list/unlink
- approve/reject workflow
- approved excuses applying `EXCUSED` to matching submitted attendance entries
- submitted-session correction endpoint
- submitted-session lock remains intact for regular roll-call edits
- absences and reports reflect excuse and correction entry changes

Local verification commands:

```bash
npm run build
npm run test -- --runInBand
npm run test:security -- --runInBand
npm run test:e2e:sprint3b
npm run verify:sprint3b
```

Sprint 3B Attendance endpoints:

- `GET /api/v1/attendance/excuse-requests`
- `GET /api/v1/attendance/excuse-requests/:id`
- `POST /api/v1/attendance/excuse-requests`
- `PATCH /api/v1/attendance/excuse-requests/:id`
- `DELETE /api/v1/attendance/excuse-requests/:id`
- `GET /api/v1/attendance/excuse-requests/:id/attachments`
- `POST /api/v1/attendance/excuse-requests/:id/attachments`
- `DELETE /api/v1/attendance/excuse-requests/:id/attachments/:attachmentId`
- `POST /api/v1/attendance/excuse-requests/:id/approve`
- `POST /api/v1/attendance/excuse-requests/:id/reject`
- `POST /api/v1/attendance/roll-call/sessions/:sessionId/entries/:studentId/correct`

## Sprint 4A Grades Foundation Runbook

From a clean local setup:

```bash
cp .env.example .env
# Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 16+ characters
# Ensure SEED_DEMO_DATA=true

npm run infra:up
npm run verify:sprint4a
```

`npm run verify:sprint4a` runs the Sprint 2B preflight check, migrations, seed, build, unit tests, security tests, Sprint 2B/3A/3B E2E flows, and the Sprint 4A Grades Foundation closeout E2E.

Sprint 4A grades verification covers:

- grade rules and effective rule resolution
- score-only assessment CRUD
- publish, approve, and lock workflow
- single and bulk grade item entry
- virtual missing rows
- gradebook read model
- analytics summary and distribution
- student grade snapshot
- security and tenancy test suite

Local verification commands:

```bash
npm run build
npm run test -- --runInBand
npm run test:security -- --runInBand
npm run test:e2e:sprint4a
npm run verify:sprint4a
```

Sprint 4A Grades endpoints:

- `GET /api/v1/grades/rules`
- `GET /api/v1/grades/rules/effective`
- `POST /api/v1/grades/rules`
- `PATCH /api/v1/grades/rules/:ruleId`
- `GET /api/v1/grades/assessments`
- `GET /api/v1/grades/assessments/:assessmentId`
- `POST /api/v1/grades/assessments`
- `PATCH /api/v1/grades/assessments/:assessmentId`
- `DELETE /api/v1/grades/assessments/:assessmentId`
- `POST /api/v1/grades/assessments/:assessmentId/publish`
- `POST /api/v1/grades/assessments/:assessmentId/approve`
- `POST /api/v1/grades/assessments/:assessmentId/lock`
- `GET /api/v1/grades/assessments/:assessmentId/items`
- `PUT /api/v1/grades/assessments/:assessmentId/items/:studentId`
- `PUT /api/v1/grades/assessments/:assessmentId/items`
- `GET /api/v1/grades/gradebook`
- `GET /api/v1/grades/analytics/summary`
- `GET /api/v1/grades/analytics/distribution`
- `GET /api/v1/grades/students/:studentId/snapshot`

Deferred beyond Sprint 4A:

- question-based assessments
- questions, submissions, answers, and corrections
- app-facing student, parent, and teacher APIs
- advanced analytics

No `demo:sprint4a` script is added for this closeout. The focused E2E flow is the verification artifact.

## Sprint 4B Question-Based Grades Runbook

From a clean local setup:

```bash
cp .env.example .env
# Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 16+ characters
# Ensure SEED_DEMO_DATA=true

npm run infra:up
npm run verify:sprint4b
```

Prerequisites:

- `.env` is ready with valid local secrets.
- PostgreSQL, Redis, and MinIO are reachable.
- `npm run infra:up` can start local services, and `npm run verify:sprint2b:preflight` is the fail-fast readiness check used by the verifier chain.

`npm run verify:sprint4b` runs the Sprint 2B preflight check, migrations, seed, build, unit tests, security tests, Sprint 2B/3A/3B/4A E2E flows, and the Sprint 4B Question-Based Grades closeout E2E.

Sprint 4B question-based grades verification covers:

- question-based assessment creation
- question CRUD
- question points and reorder operations
- publish validation
- submission resolve
- answer save
- submission submit
- answer review
- finalize review
- GradeItem sync
- gradebook, analytics, and snapshot projection through GradeItem
- security and tenancy regression

Local verification commands:

```bash
npm run build
npm run test -- --runInBand
npm run test:security -- --runInBand
npm run test:e2e:sprint4b
npm run verify:sprint4b
```

Sprint 4B Grades endpoints:

- `POST /api/v1/grades/assessments/question-based`
- `GET /api/v1/grades/assessments/:assessmentId/questions`
- `POST /api/v1/grades/assessments/:assessmentId/questions`
- `PATCH /api/v1/grades/questions/:questionId`
- `DELETE /api/v1/grades/questions/:questionId`
- `POST /api/v1/grades/assessments/:assessmentId/questions/reorder`
- `POST /api/v1/grades/assessments/:assessmentId/questions/points/bulk`
- `GET /api/v1/grades/assessments/:assessmentId/submissions`
- `POST /api/v1/grades/assessments/:assessmentId/submissions/resolve`
- `GET /api/v1/grades/submissions/:submissionId`
- `PUT /api/v1/grades/submissions/:submissionId/answers/:questionId`
- `PUT /api/v1/grades/submissions/:submissionId/answers`
- `POST /api/v1/grades/submissions/:submissionId/submit`
- `PATCH /api/v1/grades/submissions/:submissionId/answers/:answerId/review`
- `PUT /api/v1/grades/submissions/:submissionId/answers/review`
- `POST /api/v1/grades/submissions/:submissionId/review/finalize`
- `POST /api/v1/grades/submissions/:submissionId/sync-grade-item`
- `GET /api/v1/grades/gradebook`
- `GET /api/v1/grades/analytics/summary`
- `GET /api/v1/grades/analytics/distribution`
- `GET /api/v1/grades/students/:studentId/snapshot`

Deferred beyond Sprint 4B:

- true student-app submission endpoints until `Student.userId` and student identity ownership are resolved
- parent/student app-facing composition endpoints
- bulk GradeItem sync
- re-review/reopen workflow
- advanced analytics
- media/file attachment integration for question answers

No `demo:sprint4b` script is added for this closeout. The focused E2E flow is the verification artifact.

## Sprint 5A Reinforcement Foundation Runbook

From a clean local setup:

```bash
cp .env.example .env
# Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 16+ characters
# Ensure SEED_DEMO_DATA=true

npm run infra:up
npm run verify:sprint5a
```

Prerequisites:

- `.env` is ready with valid local secrets.
- PostgreSQL, Redis, and MinIO are reachable.
- `npm run infra:up` can start local services, and `npm run verify:sprint2b:preflight` is the fail-fast readiness check used by the verifier chain.

`npm run verify:sprint5a` runs the Sprint 2B preflight check, migrations, seed, build, unit tests, security tests, Sprint 2B/3A/3B/4A/4B E2E flows, and the Sprint 5A Reinforcement Foundation closeout E2E.

Sprint 5A reinforcement verification covers:

- template creation/list
- filter options
- task creation/list/detail
- target expansion and assignment materialization
- task duplication
- task cancellation
- stage submission
- review queue list/detail
- approve/reject
- assignment progress/status recalculation
- XP policy create/effective lookup
- XP grant from approved submission
- manual XP bonus
- XP ledger/summary
- overview/student/classroom summaries
- audit and tenancy/security regression

Local verification commands:

```bash
npm run build
npm run test -- --runInBand
npm run test:security -- --runInBand
npm run test:e2e:sprint5a
npm run verify:sprint5a
```

Sprint 5A Reinforcement endpoints:

- `GET /api/v1/reinforcement/filter-options`
- `GET /api/v1/reinforcement/tasks`
- `POST /api/v1/reinforcement/tasks`
- `GET /api/v1/reinforcement/tasks/:taskId`
- `POST /api/v1/reinforcement/tasks/:taskId/duplicate`
- `POST /api/v1/reinforcement/tasks/:taskId/cancel`
- `GET /api/v1/reinforcement/templates`
- `POST /api/v1/reinforcement/templates`
- `POST /api/v1/reinforcement/assignments/:assignmentId/stages/:stageId/submit`
- `GET /api/v1/reinforcement/review-queue`
- `GET /api/v1/reinforcement/review-queue/:submissionId`
- `POST /api/v1/reinforcement/review-queue/:submissionId/approve`
- `POST /api/v1/reinforcement/review-queue/:submissionId/reject`
- `GET /api/v1/reinforcement/xp/policies`
- `GET /api/v1/reinforcement/xp/policies/effective`
- `POST /api/v1/reinforcement/xp/policies`
- `PATCH /api/v1/reinforcement/xp/policies/:policyId`
- `GET /api/v1/reinforcement/xp/ledger`
- `GET /api/v1/reinforcement/xp/summary`
- `POST /api/v1/reinforcement/xp/grants/reinforcement-review/:submissionId`
- `POST /api/v1/reinforcement/xp/grants/manual`
- `GET /api/v1/reinforcement/overview`
- `GET /api/v1/reinforcement/students/:studentId/progress`
- `GET /api/v1/reinforcement/classrooms/:classroomId/summary`

Deferred beyond Sprint 5A:

- app-facing teacher/student/parent APIs
- Hero Journey
- Behavior domain
- reward catalog/redemption/stock
- notifications
- advanced gamified economy
- task-level progress endpoint
- richer media proof workflow

No `demo:sprint5a` script is added for this closeout. The focused E2E flow is the verification artifact.

## Sprint 5B Hero Journey Foundation Runbook

From a clean local setup:

```bash
cp .env.example .env
# Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 16+ characters
# Ensure SEED_DEMO_DATA=true

npm run infra:up
npm run verify:sprint5b
```

Prerequisites:

- `.env` is ready with valid local secrets.
- PostgreSQL, Redis, and MinIO are reachable.
- `npm run infra:up` can start local services, and `npm run verify:sprint2b:preflight` is the fail-fast readiness check used by the verifier chain.

`npm run verify:sprint5b` runs the Sprint 2B preflight check, migrations, seed, build, unit tests, security tests, Sprint 2B/3A/3B/4A/4B/5A E2E flows, and the Sprint 5B Hero Journey Foundation closeout E2E.

Sprint 5B Hero Journey verification covers:

- badge catalog create/list/detail/update
- mission create/list/detail/update
- mission publish/archive
- student progress before and after start
- required objective completion
- mission completion
- Hero Journey events
- Hero XP grant with `HERO_MISSION` ledger source
- XP grant idempotency
- badge awarding
- badge award idempotency
- student rewards summary
- overview, map, stage, classroom, and badge read models
- audit and tenancy/security regression

Local verification commands:

```bash
npm run build
npm run test -- --runInBand
npm run test:security -- --runInBand
npm run test:e2e:sprint5b
npm run verify:sprint5b
```

Sprint 5B Hero Journey endpoints:

- `GET /api/v1/reinforcement/hero/badges`
- `GET /api/v1/reinforcement/hero/badges/:badgeId`
- `POST /api/v1/reinforcement/hero/badges`
- `PATCH /api/v1/reinforcement/hero/badges/:badgeId`
- `DELETE /api/v1/reinforcement/hero/badges/:badgeId`
- `GET /api/v1/reinforcement/hero/missions`
- `GET /api/v1/reinforcement/hero/missions/:missionId`
- `POST /api/v1/reinforcement/hero/missions`
- `PATCH /api/v1/reinforcement/hero/missions/:missionId`
- `POST /api/v1/reinforcement/hero/missions/:missionId/publish`
- `POST /api/v1/reinforcement/hero/missions/:missionId/archive`
- `DELETE /api/v1/reinforcement/hero/missions/:missionId`
- `GET /api/v1/reinforcement/hero/students/:studentId/progress`
- `GET /api/v1/reinforcement/hero/progress/:progressId`
- `POST /api/v1/reinforcement/hero/students/:studentId/missions/:missionId/start`
- `POST /api/v1/reinforcement/hero/progress/:progressId/objectives/:objectiveId/complete`
- `POST /api/v1/reinforcement/hero/progress/:progressId/complete`
- `POST /api/v1/reinforcement/hero/progress/:progressId/grant-xp`
- `POST /api/v1/reinforcement/hero/progress/:progressId/award-badge`
- `GET /api/v1/reinforcement/hero/students/:studentId/rewards`
- `GET /api/v1/reinforcement/hero/overview`
- `GET /api/v1/reinforcement/hero/map`
- `GET /api/v1/reinforcement/hero/stages/:stageId/summary`
- `GET /api/v1/reinforcement/hero/classrooms/:classroomId/summary`
- `GET /api/v1/reinforcement/hero/badge-summary`

Deferred beyond Sprint 5B:

- app-facing teacher/student/parent APIs
- rewards redemption/catalog/stock
- Behavior domain
- notifications
- leaderboard
- wallet/marketplace
- advanced gamified economy
- richer curriculum/lesson integration
- automatic XP grant/badge award on mission completion
- combined rewards claim endpoint

No `demo:sprint5b` script is added for this closeout. The focused E2E flow is the verification artifact.

## Sprint 5C Rewards Foundation Runbook

From a clean local setup:

```bash
cp .env.example .env
# Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 16+ characters
# Ensure SEED_DEMO_DATA=true

npm run infra:up
npm run verify:sprint5c
```

Prerequisites:

- `.env` is ready with valid local secrets.
- PostgreSQL, Redis, and MinIO are reachable.
- `npm run infra:up` can start local services, and `npm run verify:sprint2b:preflight` is the fail-fast readiness check used by the verifier chain.

`npm run verify:sprint5c` runs the Sprint 2B preflight check, migrations, seed, build, unit tests, security tests, Sprint 2B/3A/3B/4A/4B/5A/5B E2E flows, and the Sprint 5C Rewards Foundation closeout E2E.

Sprint 5C rewards verification covers:

- reward catalog create/list/detail/update/publish/archive
- unlimited reward behavior
- limited stock reward behavior
- redemption request/list/detail/cancel
- duplicate open redemption rejection
- insufficient XP rejection
- approve/reject/fulfill lifecycle
- limited stock decrement at approval
- no XP deduction
- no XpLedger redemption writes
- dashboard overview
- student rewards summary
- catalog summary
- audit and tenancy/security regression

Sprint 5C Rewards endpoints:

- `GET /api/v1/reinforcement/rewards/catalog`
- `GET /api/v1/reinforcement/rewards/catalog/:rewardId`
- `POST /api/v1/reinforcement/rewards/catalog`
- `PATCH /api/v1/reinforcement/rewards/catalog/:rewardId`
- `POST /api/v1/reinforcement/rewards/catalog/:rewardId/publish`
- `POST /api/v1/reinforcement/rewards/catalog/:rewardId/archive`
- `GET /api/v1/reinforcement/rewards/redemptions`
- `GET /api/v1/reinforcement/rewards/redemptions/:redemptionId`
- `POST /api/v1/reinforcement/rewards/redemptions`
- `POST /api/v1/reinforcement/rewards/redemptions/:redemptionId/cancel`
- `POST /api/v1/reinforcement/rewards/redemptions/:redemptionId/approve`
- `POST /api/v1/reinforcement/rewards/redemptions/:redemptionId/reject`
- `POST /api/v1/reinforcement/rewards/redemptions/:redemptionId/fulfill`
- `GET /api/v1/reinforcement/rewards/overview`
- `GET /api/v1/reinforcement/rewards/students/:studentId/summary`
- `GET /api/v1/reinforcement/rewards/catalog-summary`

Deferred beyond Sprint 5C:

- app-facing teacher/student/parent reward APIs
- XP deduction / spendable XP
- wallet
- marketplace
- leaderboard
- advanced economy
- Behavior domain/rules integration
- notifications
- inventory movement ledger
- shipping/delivery/payment workflows
- automatic reward creation from Reinforcement tasks or Hero missions
- linking RewardCatalogItem to ReinforcementTask or HeroMission

No `demo:sprint5c` script is added for this closeout. The focused Rewards E2E flow is the verification artifact.

## Sprint 6A Behavior Foundation Runbook

From a clean local setup:

```bash
cp .env.example .env
# Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 16+ characters
# Ensure SEED_DEMO_DATA=true

npm run infra:up
npm run verify:sprint6a
```

Prerequisites:

- `.env` is ready with valid local secrets.
- PostgreSQL, Redis, and MinIO are reachable.
- `npm run infra:up` can start local services, and `npm run verify:sprint2b:preflight` is the fail-fast readiness check used by the verifier chain.

`npm run verify:sprint6a` runs the Sprint 2B preflight check, migrations, seed, build, unit tests, security tests, Sprint 2B/3A/3B/4A/4B/5A/5B/5C E2E flows, and the Sprint 6A Behavior Foundation closeout E2E.

Sprint 6A behavior verification covers:

- behavior category create/list/detail/update/delete
- positive and negative categories
- behavior record create/list/detail/update/submit/cancel
- review queue list/detail
- approve/reject lifecycle
- BehaviorPointLedger write on approve only
- no BehaviorPointLedger write on reject/cancel/submit
- no XpLedger writes
- no XP grants
- no Rewards integration
- overview read model
- student behavior summary
- classroom behavior summary
- audit and tenancy/security regression

Sprint 6A Behavior endpoints:

- `GET /api/v1/behavior/categories`
- `GET /api/v1/behavior/categories/:categoryId`
- `POST /api/v1/behavior/categories`
- `PATCH /api/v1/behavior/categories/:categoryId`
- `DELETE /api/v1/behavior/categories/:categoryId`
- `GET /api/v1/behavior/records`
- `GET /api/v1/behavior/records/:recordId`
- `POST /api/v1/behavior/records`
- `PATCH /api/v1/behavior/records/:recordId`
- `POST /api/v1/behavior/records/:recordId/submit`
- `POST /api/v1/behavior/records/:recordId/cancel`
- `GET /api/v1/behavior/review-queue`
- `GET /api/v1/behavior/review-queue/:recordId`
- `POST /api/v1/behavior/records/:recordId/approve`
- `POST /api/v1/behavior/records/:recordId/reject`
- `GET /api/v1/behavior/overview`
- `GET /api/v1/behavior/students/:studentId/summary`
- `GET /api/v1/behavior/classrooms/:classroomId/summary`

Deferred beyond Sprint 6A:

- app-facing teacher/student/parent behavior APIs
- parent acknowledgements
- notifications
- intervention plans
- attendance/grades automation
- XP bridge from Behavior
- Rewards eligibility/blocking from Behavior
- leaderboard
- wallet
- marketplace
- advanced economy
- Behavior exports/reporting beyond current read models

No `demo:sprint6a` script is added for this closeout. The focused Behavior E2E flow is the verification artifact.

### Seed credentials

| Role         | Email                      | Password     |
| ------------ | -------------------------- | ------------ |
| School Admin | `admin@academy.moazez.dev` | `School123!` |

### Available scripts

| Script                              | Purpose                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run infra:up`                  | Start PostgreSQL, Redis, and MinIO and wait for readiness                                                       |
| `npm run infra:status`              | Show local infrastructure status                                                                                |
| `npm run db:migrate`                | Apply Prisma migrations locally                                                                                 |
| `npm run start:dev`                 | Dev server with hot-reload                                                                                      |
| `npm run build`                     | Production build                                                                                                |
| `npm run test`                      | Unit tests                                                                                                      |
| `npm run test:e2e`                  | Integration / e2e tests                                                                                         |
| `npm run test:e2e:sprint1c`         | Run the three Sprint 1C Files e2e flows                                                                         |
| `npm run test:e2e:sprint2a`         | Run the Sprint 2A Admissions closeout e2e flows                                                                 |
| `npm run test:e2e:sprint2b`         | Run the Sprint 2B Students closeout e2e flows                                                                   |
| `npm run test:e2e:sprint3a`         | Run the Sprint 3A Attendance closeout e2e flow                                                                  |
| `npm run test:e2e:sprint3b`         | Run the Sprint 3B Attendance Excuses & Corrections closeout e2e flow                                            |
| `npm run test:e2e:sprint4a`         | Run the Sprint 4A Grades Foundation closeout e2e flow                                                           |
| `npm run test:e2e:sprint4b`         | Run the Sprint 4B Question-Based Grades closeout e2e flow                                                       |
| `npm run test:e2e:sprint5a`         | Run the Sprint 5A Reinforcement Foundation closeout e2e flow                                                    |
| `npm run test:e2e:sprint5b`         | Run the Sprint 5B Hero Journey Foundation closeout e2e flow                                                     |
| `npm run test:e2e:sprint5c`         | Run the Sprint 5C Rewards Foundation closeout e2e flow                                                          |
| `npm run test:e2e:sprint6a`         | Run the Sprint 6A Behavior Foundation closeout e2e flow                                                         |
| `npm run test:security`             | Tenancy isolation tests                                                                                         |
| `npm run verify:sprint1b:preflight` | Fail fast if `.env` or required local services are not ready                                                    |
| `npm run verify:sprint1b`           | Run preflight, migrations, seed, build, unit tests, and security tests                                          |
| `npm run verify:sprint1c:preflight` | Fail fast if `.env` or required local services are not ready                                                    |
| `npm run verify:sprint1c`           | Run preflight, migrations, seed, build, unit tests, security tests, and Sprint 1C Files e2e                     |
| `npm run verify:sprint2a:preflight` | Fail fast if `.env` or required local services are not ready                                                    |
| `npm run verify:sprint2a`           | Run preflight, migrations, seed, build, unit tests, security tests, and Sprint 2A Admissions e2e                |
| `npm run verify:sprint2b:preflight` | Fail fast if `.env` or required local services are not ready                                                    |
| `npm run verify:sprint2b`           | Run preflight, migrations, seed, build, unit tests, security tests, and Sprint 2B Students e2e                  |
| `npm run verify:sprint3a`           | Run preflight, migrations, seed, build, unit/security tests, Sprint 2B e2e, and Sprint 3A e2e                   |
| `npm run verify:sprint3b`           | Run preflight, migrations, seed, build, unit/security tests, Sprint 2B/3A e2e, and Sprint 3B e2e                |
| `npm run verify:sprint4a`           | Run preflight, migrations, seed, build, unit/security tests, Sprint 2B/3A/3B e2e, and Sprint 4A e2e             |
| `npm run verify:sprint4b`           | Run preflight, migrations, seed, build, unit/security tests, Sprint 2B/3A/3B/4A e2e, and Sprint 4B e2e          |
| `npm run verify:sprint5a`           | Run preflight, migrations, seed, build, unit/security tests, Sprint 2B/3A/3B/4A/4B e2e, and Sprint 5A e2e       |
| `npm run verify:sprint5b`           | Run preflight, migrations, seed, build, unit/security tests, Sprint 2B/3A/3B/4A/4B/5A e2e, and Sprint 5B e2e    |
| `npm run verify:sprint5c`           | Run preflight, migrations, seed, build, unit/security tests, Sprint 2B/3A/3B/4A/4B/5A/5B e2e, and Sprint 5C e2e |
| `npm run verify:sprint6a`           | Run preflight, migrations, seed, build, unit/security tests, Sprint 2B/3A/3B/4A/4B/5A/5B/5C e2e, and Sprint 6A e2e |
| `npm run seed`                      | Re-run idempotent seeds                                                                                         |
| `bash scripts/demo.sh`              | End-to-end smoke test                                                                                           |
| `npm run demo:sprint1c`             | Run the Sprint 1C Files demo flow against a running server                                                      |
| `npm run demo:sprint2a`             | Run the Sprint 2A Admissions demo flow against a running server                                                 |
| `npm run demo:sprint2b`             | Run the Sprint 2B Students demo flow against a running server                                                   |
