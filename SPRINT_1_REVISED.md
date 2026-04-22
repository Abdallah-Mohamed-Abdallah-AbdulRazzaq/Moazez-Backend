# Sprint 1 — Revised for Solo Developer + Claude Code

## Reality check

The original 14-day Sprint 1 is not realistic for a single developer working with Claude Code. The actual work involved (bootstrap + infra + IAM + settings + academic structure + files + imports + tests + polish) spans **25–27 working days** realistically, even with heavy agent assistance.

We split Sprint 1 into three shippable sub-sprints. Each is demo-able on its own and produces a runnable, testable slice.

---

## Sprint 1A — Bootstrap & Identity

**Duration: 9–10 working days**

### Goal

A running NestJS app with Docker-composed PostgreSQL + Redis + MinIO, first migrations applied, seed data loaded, and working authentication end-to-end. `POST /api/v1/auth/login` + `GET /api/v1/auth/me` both work.

### In Scope

- Repo initialization + `.gitignore` + all root governance files
- NestJS project bootstrap with `src/` structure per `DIRECTORY_STRUCTURE.md`
- `docker-compose.yml` with postgres, redis, minio
- `.env.example` + env validation (zod or joi)
- Prisma init + `schema.prisma` scaffolding
- Global URI versioning (`/api/v1`)
- Global pipes (validation), filters (exception), interceptors (logging)
- Migration batch 1 — core identity:
  - `organizations`
  - `schools`
  - `users`
  - `memberships` (with partial unique index for teacher one-school rule)
  - `roles`
  - `permissions`
  - `role_permissions`
  - `user_roles` (if separate from memberships)
  - `sessions`
  - `audit_logs`
  - `files` (metadata only)
- `RequestContext` built from AsyncLocalStorage
- Prisma `schoolScope` extension
- Auth module: `login`, `refresh`, `me`, `logout`
- Guards: `JwtAuthGuard`, `ScopeResolverGuard`, `PermissionsGuard`
- Seeds:
  - Canonical permissions list
  - System roles (`platform_super_admin`, `school_admin`, `teacher`, `parent`, `student`)
  - One platform super admin
  - One demo organization + one demo school + one demo school_admin
- Swagger at `/api/v1/docs`
- Health at `/api/v1/health`
- First tenancy isolation integration test
- README updated with `docker-compose up` instructions

### Out of Scope

- Any business module (settings, academics, admissions)
- File upload endpoints
- Teacher/student/parent app endpoints
- Notifications
- Imports

### Definition of Done

- `docker-compose up` brings everything up
- `npx prisma migrate deploy` applies cleanly from scratch
- `npm run seed` runs successfully
- `curl POST /api/v1/auth/login` returns access + refresh tokens
- `curl GET /api/v1/auth/me` returns actor + active membership
- Tenancy isolation test passes (cross-school read returns 404)
- Swagger loads

---

## Sprint 1B — Settings & Academic Structure

**Duration: 9–10 working days**

### Goal

The school dashboard's settings tab and academic structure tab work end-to-end on real data.

### In Scope

- Migration batch 2 — settings + academic structure:
  - `branding`
  - `school_profile`
  - `notification_templates`
  - `notification_preferences`
  - `security_settings`
  - `integration_providers`
  - `integration_connections`
  - `backup_jobs`
  - `academic_years`
  - `terms`
  - `stages`
  - `grades`
  - `sections`
  - `classrooms`
  - `subjects`
  - `teacher_subjects`
  - `rooms`
- Settings module submodules:
  - Branding (GET/PATCH)
  - Roles (GET, POST, PATCH, DELETE, clone, update permissions)
  - Permissions (GET catalog)
  - Users (GET, invite, create, patch, status change, resend invite, reset password)
  - Security (GET, PATCH)
  - Overview (GET)
- Academic structure submodules:
  - Years (GET, POST, PATCH)
  - Terms (GET, POST, PATCH)
  - Tree (GET)
  - Stages / Grades / Sections / Classrooms (full CRUD)
  - Subjects (GET, POST, PATCH, DELETE)
  - Teacher-subject allocations (GET, POST, DELETE)
  - Rooms (GET, POST, PATCH, DELETE)
  - Reorder endpoints for structure nodes
- Seed: default roles per demo school, demo academic year + term + basic structure
- Unit tests for core settings/academics services
- Audit log integration for sensitive settings actions

### Out of Scope

- Admissions
- Students
- Attendance
- Files upload (metadata-only in 1A is enough)
- App-facing modules

### Definition of Done

- All settings endpoints match `sis_dashboard-settings_backend_handoff_spec_v2.md`
- All academic structure endpoints match `sis_dashboard-academics_backend_handoff_spec.md`
- Role creation → permission assignment → user assignment flow works end-to-end
- Structure tree endpoint returns full hierarchy
- Audit logs are written for role changes and security changes

---

## Sprint 1C — Files & Import Skeleton

**Duration: 6–7 working days**

### Goal

Files can be uploaded to MinIO with metadata in Postgres, attachments can be linked to admissions records (preview), and the import pipeline skeleton exists for future use.

### In Scope

- Files module:
  - Upload endpoint (multipart)
  - Metadata persistence
  - Signed URL generation
  - Download endpoint (re-checks authorization)
  - MinIO adapter
  - File size + MIME validation
- Attachments module:
  - Join table `attachments` linking `file_id` to `(resource_type, resource_id)`
  - Reusable `AttachmentsService`
- Import skeleton:
  - Upload import file endpoint
  - Parse + validate stub (no actual commit)
  - Validation report endpoint
  - BullMQ queue setup
  - Job status endpoint
- Notification templates basic (admin can list + read seeded templates)
- First end-to-end test: login → upload file → download via signed URL
- Code quality pass: lint, format, docstrings
- Sprint 1 demo preparation

### Out of Scope

- Actual import commit logic (just validation skeleton)
- Notification sending
- Realtime / socket layer

### Definition of Done

- `curl POST /api/v1/files` uploads to MinIO, returns metadata
- `curl GET /api/v1/files/:id/download` returns signed URL after auth check
- Import file can be uploaded; validation report can be fetched
- Full Sprint 1A–1C demo script runs without manual intervention
- Baseline test coverage ≥ 40% for core modules

---

## Total Timeline

- **Sprint 1A**: ~2 weeks
- **Sprint 1B**: ~2 weeks
- **Sprint 1C**: ~1.5 weeks

**Realistic total: 5.5 weeks for Sprint 1 (vs. original 14 days).**

After Sprint 1, the next realistic sequencing is:

- **Sprint 2** — Admissions + Students (5 weeks)
- **Sprint 3** — Attendance + Grades (5 weeks)
- **Sprint 4** — Reinforcement + Communication (4 weeks)
- **Sprint 5** — Teacher app APIs (3 weeks)
- **Sprint 6** — Student app APIs (3 weeks)
- **Sprint 7** — Parent app APIs (3 weeks)
- **Sprint 8** — Dashboard aggregations + polish (2 weeks)

Total V1 realistic: **~7 months of solo work with heavy Claude Code assistance**. Plan accordingly.
