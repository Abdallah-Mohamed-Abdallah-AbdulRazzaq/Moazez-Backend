# Production Readiness Phase 0A — Evidence Baseline

## Document control

| Field | Value |
|---|---|
| Task | `PRODUCTION-READINESS-0A-R1` |
| Status | `PHASE_0A_R1_READY_FOR_ARCHITECTURE_REVIEW` after final validation; Phase 0B remains not started |
| Evidence captured | 2026-07-27 (Africa/Cairo) |
| Repository | `Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend` |
| Working branch | `chore/production-readiness-0a` |
| Approved and verified baseline | `fb6066f3a2c106b23bf9a248d57b70eaf4e55e29` |
| Scope | Documentation only |

This is not a Phase 0 closeout. Phase 0 closes only after owner review, approved
answers, ADR creation, and the separate Phase 0B closeout.

## Baseline verdict

All hard-stop R1 checks passed before the five existing untracked documents
were revised:

| Check | Direct evidence | Result |
|---|---|---|
| Intended R1 input | `git status --short` returned exactly the five allowed untracked Phase 0A documents | VERIFIED |
| Staged paths | `git diff --cached --name-only` returned no entries | VERIFIED |
| Current branch | `git branch --show-current` | `chore/production-readiness-0a` |
| Local `HEAD` | `git rev-parse HEAD` | approved baseline |
| Local `origin/main` | `git rev-parse origin/main` | approved baseline |
| Live remote `main` | `git ls-remote origin refs/heads/main` | approved baseline |
| Default branch | `git ls-remote --symref origin HEAD` and GitHub repository metadata | `main` |
| PR #44 | GitHub PR metadata | `MERGED` |
| PR #44 merge commit | GitHub PR metadata | approved baseline |

The owner performed fetch/pull and branch creation before the agent run. The
agent performed no additional Git mutation after the owner prepared and
verified the branch. Live remote evidence from the earlier Phase 0A capture is
retained as historical evidence and is not represented as an R1 network
re-observation.

## Pull request and exact CI evidence

PR #44 was inspected through authenticated GitHub CLI/API access:

- Title: `test(learning-media): close phase 1g functional regression`
- Base: `main`
- Head: `chore/learning-content-media-1g-full-closeout`
- State: `MERGED`
- Merged at: `2026-07-24T04:29:10Z`
- Merge commit: `fb6066f3a2c106b23bf9a248d57b70eaf4e55e29`

The following baseline workflow runs and their job details were inspected, not
inferred from badges or historical closeouts:

| Workflow | Run ID | Conclusion | Relevant job | Job ID | Relevant successful evidence |
|---|---:|---|---|---:|---|
| Migration Integrity | `30066914639` | `success` | Fresh PostgreSQL replay | `89399583152` | governance tests/check, Prisma validation, empty-database deploy, status, generation, seed, build, DB/security smoke, second deploy proved no-op, final status |
| Learning Content Integrity | `30066914676` | `success` | Lesson Content atomicity and visibility | `89399583140` | migration check, Prisma validate/deploy/status/generate, seed, build, focused unit contracts, PostgreSQL integration, exact MinIO startup, E2E visibility, security boundaries |
| Learning Media Integrity | `30066914643` | `success` | `learning-media-integrity` | `89399583125` | migration check, Prisma validation/deploy/status/generate, seed, build, exact MinIO, canonical runtime and media-test images, ffprobe contract/startup/non-root/Prisma checks, MIME matrix, unit/contracts, playback/download, PostgreSQL lifecycle/migration, CORS/cleanup, HTTP/tenancy, affected regressions/security |

These runs prove the listed baseline checks passed at that commit. They do not
prove production topology, capacity, availability, security posture, backup
recovery, or observability.

## Relevant commands and tool versions

Read-only commands used included:

- `git status --short`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git ls-remote origin refs/heads/main`
- `git ls-remote --symref origin HEAD`
- `git log`, `git show`, `git grep`, and `rg`-based repository inspection
- `gh repo view`, `gh pr view 44`, `gh run view`, and `gh api` reads

Tool versions observed:

| Tool | Version |
|---|---|
| Git | `2.54.0.windows.1` |
| Node.js | `v22.21.1` |
| npm | `11.14.1` |
| GitHub CLI | `2.96.0` |

No command that connects to Prisma, PostgreSQL, Redis, object storage, Docker,
or GCP was run. CI evidence was inspected remotely; CI was not re-run.

### Phase 0A-R1 local validation results

| Command/check | Result |
|---|---|
| R1 baseline/scope precheck | PASS — branch and exact `HEAD`; only five allowed untracked paths; zero staged paths |
| `git diff --check` with intent-to-add | PASS — exit 0, no whitespace errors; Windows emitted LF-to-CRLF normalization warnings for all five documents |
| Intent-to-add cleanup | PASS — exact five entries removed from index with `git update-index --force-remove`; worktree copies retained |
| generated-document trailing-whitespace scan | PASS — 0 matches |
| generated-document credential/secret-pattern scan | PASS — 0 private-key or credential-bearing PostgreSQL/Redis URL matches; no secret value recorded |
| ID and reference checks | PASS — 85 EVD, 53 D, 48 Q, 74 gates, 38 unique risks; sequential definitions; no unresolved references |
| baseline evidence path checks | PASS — 114 CODE/TEST/SCHEMA/MIGRATION/CONFIG/DOCKER/CI path tokens checked against approved `HEAD`; 0 missing |
| prerequisite check | PASS — 0 prerequisite columns with a bare `Gnn` reference |
| phase/conditional checks | PASS — corrected Phase 0B/1/2/3/4/5A/5B/6/7/8/9 sequence; clean-start and migration branches use conditional evidence |
| multipart/storage inventory checks | PASS — six multipart controllers use `FileInterceptor`; Learning Media controller does not; 20 production `StorageService` consumers |
| final Git scope check | PASS — exactly five allowed untracked documents; 0 tracked modifications; 0 staged files; branch and baseline unchanged |

No global Git configuration was changed and no `.gitattributes` file was
created. The LF-to-CRLF notices are recorded evidence, not a request to
normalize or rewrite line endings in this task.

## Governance and historical context read

The following committed sources were read before forming recommendations:

- `AGENT_CONTEXT_PRIMER.md`
- `AGENTS.md`
- `CLAUDE.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `ENGINEERING_RULES.md`
- `SECURITY_MODEL.md`
- `TESTING_STRATEGY.md`
- `API_CONTRACT_RULES.md`
- `PRISMA_CONVENTIONS.md`
- `MIGRATION_GOVERNANCE.md`
- `OBSERVABILITY.md`
- `ERROR_CATALOG.md`
- `MODULES.md`
- `V1_SCOPE.md`
- `DOMAIN_GLOSSARY.md`
- `USER_TYPES.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `adr/ADR-0001-multi-tenancy-tenant-ownership-and-scope-resolution.md`
- `adr/ADR-0002-behavior-boundary-and-domain-ownership.md`
- `adr/ADR-0003-applicant-portal-account-boundary.md`
- `docs/phase-5-final-closeout-audit.md`
- `docs/sprint-16d-dashboard-foundation-final-closeout-audit.md`
- `docs/sprint-learning-content-discovery-media-1g-full-security-storage-performance-closeout.md`
- `docs/database/prisma-migration-rebaseline-decision.md`
- `docs/database/migration-custom-sql-inventory.md`
- `docs/database/migration-rebaseline-0a-closeout.md`
- `docs/database/post-rebaseline-regression-register.md`

`AGENTS.md` additionally requires `DIRECTORY_STRUCTURE.md`, but that path does
not exist at the baseline. `DIRECTORY_STRUCTURE_VISUAL.md` exists and was read;
it is not silently substituted as the missing file. This is evidence limitation
`LIM-001`.

## Source-of-truth hierarchy

Conflicts in this evidence set are resolved in this order:

1. Current source code
2. Current tests
3. Current Prisma schema
4. Current committed migrations
5. Current seeds and permissions
6. Merged closeout documents
7. Current engineering and governance documents
8. Historical plans and handoffs

Governance and closeouts constrain the work and establish history. They are not
treated as proof that a runtime behavior exists.

## Evidence register

The detailed observations and implications for these records are in
`01-runtime-and-dependency-inventory.md`. This index establishes the exact
85-record evidence set used by the decision and risk documents.

| ID | Class | Exact path or remote object | Symbol / evidence locator | Confidence |
|---|---|---|---|---|
| EVD-001 | GIT | repository `.git` metadata | branch, `HEAD`, worktree status | VERIFIED |
| EVD-002 | GIT_REMOTE | repository `origin` and GitHub repository metadata | `refs/heads/main`, default branch | VERIFIED_HISTORICAL_CAPTURE |
| EVD-003 | GIT_REMOTE | GitHub PR #44 | state, base/head, mergedAt, merge commit | VERIFIED_HISTORICAL_CAPTURE |
| EVD-004 | CI | `.github/workflows/migration-integrity.yml`; GitHub Actions run `30066914639` | Migration Integrity / Fresh PostgreSQL replay | VERIFIED |
| EVD-005 | CI | `.github/workflows/learning-content-integrity.yml`; GitHub Actions run `30066914676` | Learning Content Integrity / Lesson Content atomicity and visibility | VERIFIED |
| EVD-006 | CI | `.github/workflows/learning-media-integrity.yml`; GitHub Actions run `30066914643` | Learning Media Integrity / `learning-media-integrity` | VERIFIED |
| EVD-007 | LOCAL_TOOL | `package.json`; `package-lock.json`; local executable version output | Git, Node.js, npm, GitHub CLI versions | VERIFIED |
| EVD-008 | GOVERNANCE | required root governance files listed above | complete reading set | VERIFIED |
| EVD-009 | GOVERNANCE | `DIRECTORY_STRUCTURE.md` | required path absent | VERIFIED |
| EVD-010 | CLOSEOUT | required closeouts listed above | current program status | VERIFIED |
| EVD-011 | CODE | `src/main.ts` | `bootstrap` | VERIFIED |
| EVD-012 | CODE | `src/app.module.ts` | `AppModule` | VERIFIED |
| EVD-013 | CODE | non-test `src/**/*.ts` files declaring `@Controller` | 167 declarations; declaration count is not per-controller runtime-reachability proof | VERIFIED |
| EVD-014 | CODE | `src/infrastructure/realtime/realtime.gateway.ts` | `RealtimeGateway` | VERIFIED |
| EVD-015 | CODE | `src/infrastructure/database/prisma.service.ts` | `PrismaService` lifecycle | VERIFIED |
| EVD-016 | CODE | `src/main.ts` and repository-wide lifecycle search | shutdown-hook absence | VERIFIED |
| EVD-017 | CODE | `src/**` | all `OnModuleInit` / startup providers | VERIFIED |
| EVD-018 | CODE | `src/infrastructure/queue/bullmq.service.ts` | queue/worker factory and shutdown | VERIFIED |
| EVD-019 | CODE | `src/modules/communication/application/communication-notification-queue.service.ts`; `src/modules/communication/application/communication-notification-generation.service.ts`; `src/modules/communication/infrastructure/communication-notification-generation.worker.ts`; `src/modules/communication/domain/communication-notification-generation-domain.ts` | notification generation queue/domain/worker | VERIFIED |
| EVD-020 | CODE | `src/modules/communication/application/communication-notification-push-queue.service.ts`; `src/modules/communication/application/communication-notification-push-delivery.service.ts`; `src/modules/communication/infrastructure/communication-notification-push.worker.ts`; `src/modules/communication/domain/communication-notification-generation-domain.ts` | push queue/delivery/worker | VERIFIED |
| EVD-021 | CODE | `src/modules/settings/email/delivery/application/school-email-delivery-queue.service.ts`; `src/modules/settings/email/delivery/infrastructure/school-email-delivery.worker.ts`; `src/modules/settings/email/delivery/domain/email-delivery.constants.ts` | school email queue, exact job-ID builder, worker | VERIFIED |
| EVD-022 | CODE | `src/modules/files/imports/application/create-import-job.use-case.ts`; `src/modules/files/imports/infrastructure/import-validation.worker.ts` | import validation queue and worker | VERIFIED |
| EVD-023 | CODE | `src/modules/dismissal/requests/worker/dismissal-request-expiry.worker.ts`; `src/modules/dismissal/requests/application/dismissal-request-queue-scope.ts` | dismissal expiry queue and worker | VERIFIED |
| EVD-024 | CODE | `src/modules/files/uploads/application/learning-media-cleanup.service.ts`; `src/modules/files/uploads/infrastructure/learning-media.repository.ts` | learning-media cleanup queue, claims, and persistence | VERIFIED |
| EVD-025 | CODE | `src/modules/settings/branding/**` | branding cleanup queue, worker, reconciler | VERIFIED |
| EVD-026 | CODE | `src/infrastructure/realtime/realtime-presence.service.ts` | refresh interval and destroy hook | VERIFIED |
| EVD-027 | SCHEMA | `prisma/schema.prisma` and `prisma.config.ts` | PostgreSQL datasource / `DATABASE_URL` | VERIFIED |
| EVD-028 | CODE | `src`, `prisma`, `scripts`, and `test` | all `new PrismaClient` sites | VERIFIED |
| EVD-029 | CODE | `src/**` | `$transaction` and unit-of-work patterns | VERIFIED |
| EVD-030 | MIGRATION | `prisma/migrations/**`, `package.json`, `.github/workflows/migration-integrity.yml` | migration set and execution controls | VERIFIED |
| EVD-031 | CODE | `src/infrastructure/queue/bullmq.service.ts` | BullMQ Redis client | VERIFIED |
| EVD-032 | CODE | `src/infrastructure/realtime/realtime.gateway.ts` | Socket.IO publisher/subscriber clients | VERIFIED |
| EVD-033 | CODE | `src/infrastructure/realtime/realtime-state-store.service.ts` | realtime state client | VERIFIED |
| EVD-034 | CODE | `src/infrastructure/realtime/**` | in-memory fallback behavior | VERIFIED |
| EVD-035 | CONFIG | `src/config/env.validation.ts` and Redis constructors | shared `REDIS_URL` | VERIFIED |
| EVD-036 | CODE | `src/infrastructure/storage/storage.module.ts`; `src/infrastructure/storage/storage.service.ts`; `src/infrastructure/storage/signed-url.service.ts` | direct MinioAdapter bindings and MinIO-derived capability types | VERIFIED |
| EVD-037 | CODE | `src/infrastructure/storage/minio.adapter.ts`; `src/modules/settings/branding/domain/branding-logo.errors.ts` | provider operations, request-path bucket creation, in-adapter X-Amz expiry parsing, and out-of-adapter provider-code interpretation | VERIFIED |
| EVD-038 | CODE | `src/**` | all direct `StorageService` consumers | VERIFIED |
| EVD-039 | SCHEMA | `prisma/schema.prisma` | `File` and metadata relations | VERIFIED |
| EVD-040 | CODE | `src/modules/academics/curriculum/controller/learning-media.controller.ts`; `src/modules/files/uploads/controller/uploads.controller.ts` | learning-media routes versus separate generic upload/download routes | VERIFIED |
| EVD-041 | CODE | `src/modules/files/uploads/application/learning-media-upload.use-cases.ts` | upload intent/direct upload | VERIFIED |
| EVD-042 | CODE | `src/modules/files/uploads/application/learning-media-upload.use-cases.ts` | synchronous completion/finalization | VERIFIED |
| EVD-043 | CODE | `src/modules/files/uploads/application/media-verifier.service.ts`; `src/modules/files/uploads/application/media-runtime-startup.guard.ts`; `scripts/media-runtime-contract.cjs`; `scripts/verify-media-runtime.cjs`; `Dockerfile` | temp disk, checksum, ffprobe identity/startup/runtime packaging | VERIFIED |
| EVD-044 | CODE | `src/modules/academics/curriculum/app-facing/lesson-content-playback/**` | playback transaction/signing | VERIFIED |
| EVD-045 | CODE | `src/modules/files/uploads/controller/uploads.controller.ts`; `src/modules/files/uploads/application/get-file-download-url.use-case.ts`; `src/modules/communication/application/communication-message-attachment-download.use-case.ts`; `src/modules/parent-app/files/application/get-parent-child-file-download-url.use-case.ts`; `src/modules/academics/curriculum/app-facing/lesson-content-playback/` | upload/download/playback capability contracts | VERIFIED |
| EVD-046 | CODE | `src/modules/health/health.controller.ts`; `src/modules/health/health.service.ts` | public health report | VERIFIED |
| EVD-047 | CODE | `src/modules/health/health.service.ts` | HTTP semantics and incomplete queue coverage | VERIFIED |
| EVD-048 | CODE | `src/common/context/context.middleware.ts` and `src/common/exceptions/global-exception.filter.ts` | request/trace identifiers | VERIFIED |
| EVD-049 | CODE | `src/main.ts`; `src/infrastructure/queue/bullmq.service.ts`; `src/common/exceptions/global-exception.filter.ts` | current bootstrap, queue, and exception logging | VERIFIED |
| EVD-050 | CODE | `src/`; `package.json`; `OBSERVABILITY.md` | metrics/tracing/heartbeat implementation search and governance comparison | VERIFIED |
| EVD-051 | CONFIG | `src/config/env.validation.ts` | accepted environment variables | VERIFIED |
| EVD-052 | CONFIG | `src/main.ts`; `src/infrastructure/realtime/realtime.gateway.ts`; `src/modules/app-device-tokens/domain/app-device-token-crypto.ts`; `src/modules/settings/email/domain/email-secret-crypto.ts`; `src/modules/dismissal/requests/worker/dismissal-request-expiry.worker.ts` | direct `process.env` reads | VERIFIED |
| EVD-053 | CODE | `src/infrastructure/push/firebase/firebase-admin.service.ts` | Firebase credential strategies | VERIFIED |
| EVD-054 | CODE | `src/modules/app-device-tokens/domain/app-device-token-crypto.ts`; `src/modules/settings/email/domain/email-secret-crypto.ts` | AES-GCM envelopes and key-rotation limitations | VERIFIED |
| EVD-055 | CODE | `src/modules/settings/email/delivery/transport/nodemailer-email.transport.ts` | SMTP credential use | VERIFIED |
| EVD-056 | DOCKER | `Dockerfile`, `package-lock.json` | build/runtime stages and Node compatibility | VERIFIED |
| EVD-057 | DOCKER | `docker-compose.yml` and `.dockerignore` | local services/build context | VERIFIED |
| EVD-058 | CI | `.github/workflows/*.yml` | complete workflow set | VERIFIED |
| EVD-059 | CI | `.github/workflows/`; `Dockerfile`; repository root `.` | production deployment/IaC implementation search | VERIFIED |
| EVD-060 | CODE | `src/main.ts`; `src/infrastructure/realtime/realtime.gateway.ts`; `src/modules/health/health.controller.ts`; `src/modules/academics/curriculum/controller/learning-media.controller.ts`; `src/modules/files/uploads/controller/uploads.controller.ts` | compatibility-sensitive prefix, realtime, health, learning-media, and generic-file contracts | VERIFIED |
| EVD-061 | GOVERNANCE | `ARCHITECTURE_DECISION.md` and `MODULES.md` | modular-monolith constraint | VERIFIED |
| EVD-062 | GOVERNANCE | `MIGRATION_GOVERNANCE.md` and `PRISMA_CONVENTIONS.md` | immutable migration constraints | VERIFIED |
| EVD-063 | CLOSEOUT | `docs/sprint-16d-dashboard-foundation-final-closeout-audit.md` | Dashboard V1 closure | VERIFIED |
| EVD-064 | CLOSEOUT | `docs/sprint-learning-content-discovery-media-1g-full-security-storage-performance-closeout.md` | Learning Content and Media 1G functional closeout / operational deferral | VERIFIED |
| EVD-065 | TEST | `src/modules/files/uploads/tests/`; `src/modules/academics/curriculum/`; `test/integration/`; `test/security/`; `.github/workflows/migration-integrity.yml`; `.github/workflows/learning-content-integrity.yml`; `.github/workflows/learning-media-integrity.yml` | baseline test/workflow scope and limitation | VERIFIED |
| EVD-066 | CODE | `src/modules/files/uploads/infrastructure/files.repository.ts`; `src/modules/files/uploads/application/register-file-metadata.use-case.ts`; `src/modules/files/uploads/application/upload-file.use-case.ts` | centralized File metadata and generic upload compensation | VERIFIED |
| EVD-067 | CODE | `src/modules/files/uploads/controller/uploads.controller.ts`; `src/modules/files/imports/controller/imports.controller.ts`; `src/modules/students/documents/controller/student-documents.controller.ts`; `src/modules/applicant-portal/controller/applicant-portal.controller.ts`; `src/modules/settings/branding/controller/branding.controller.ts`; `src/modules/student-app/profile/controller/student-profile.controller.ts` | exact six multipart entry families | VERIFIED |
| EVD-068 | CODE | `src/modules/files/uploads/domain/file-upload.constraints.ts`; `src/modules/files/uploads/application/upload-file.use-case.ts` | generic 10 MiB declared-MIME-only policy and SHA-256 | VERIFIED |
| EVD-069 | CODE | `src/modules/files/imports/domain/import-upload.constraints.ts`; `src/modules/files/imports/application/create-import-job.use-case.ts` | import 10 MiB declared CSV MIME policy, compensation, and enqueue-failure retention | VERIFIED |
| EVD-070 | CODE | `src/modules/students/documents/application/create-student-document.use-case.ts`; `src/modules/students/documents/infrastructure/student-documents.repository.ts` | student-document File linking and replacement retention | VERIFIED |
| EVD-071 | CODE | `src/modules/applicant-portal/application/upload-applicant-document.use-case.ts`; `src/modules/applicant-portal/application/replace-applicant-document.use-case.ts`; `src/modules/applicant-portal/application/delete-applicant-document.use-case.ts`; `src/modules/applicant-portal/infrastructure/applicant-portal.repository.ts` | applicant validation, compensation, supersession, and soft-delete lifecycle | VERIFIED |
| EVD-072 | CODE | `src/modules/settings/branding/application/upload-branding-logo.use-case.ts`; `src/modules/settings/branding/application/process-branding-logo-cleanup.use-case.ts`; `src/modules/settings/branding/domain/branding-logo-signature.ts` | branding deep validation and specialized cleanup | VERIFIED |
| EVD-073 | CODE | `src/modules/student-app/profile/application/upload-student-avatar.use-case.ts`; `src/modules/student-app/profile/application/delete-student-avatar.use-case.ts`; `src/modules/student-app/profile/domain/student-avatar.constraints.ts` | avatar declared MIME/size policy, compensation, and retained replaced object | VERIFIED |
| EVD-074 | CODE | `src/modules/academics/curriculum/controller/learning-media.controller.ts`; `src/modules/files/uploads/application/learning-media-upload.use-cases.ts`; `src/modules/files/uploads/application/media-verifier.service.ts`; `src/modules/files/uploads/application/media-runtime-startup.guard.ts`; `src/modules/files/uploads/application/learning-media-cleanup.service.ts`; `src/modules/files/uploads/infrastructure/learning-media.repository.ts` | specialized managed Learning Media lifecycle | VERIFIED |
| EVD-075 | TEST | `src/modules/academics/curriculum/app-facing/lesson-content-playback/`; `test/integration/learning-media-playback-range.integration.spec.ts` | authorized inline playback and object-store Range behavior | VERIFIED |
| EVD-076 | CODE | `src/modules/communication/application/communication-message.use-cases.ts`; `src/modules/communication/application/communication-message-attachment.use-cases.ts`; `src/modules/communication/application/communication-message-attachment-download.use-case.ts` | communication relation validation, authorization, and download ownership | VERIFIED |
| EVD-077 | CODE | `src/modules/homework/`; `src/modules/attendance/excuses/`; `src/modules/reinforcement/` | managed File relations without feature-owned storage clients | VERIFIED |
| EVD-078 | CODE | `src/modules/reinforcement/tasks/domain/reinforcement-task-domain.ts`; `src/modules/student-app/tasks/application/submit-student-task-stage.use-case.ts`; `src/modules/student-app/tasks/infrastructure/student-tasks-read.adapter.ts` | proof types, non-NONE file requirement, scoped private ownership, and missing proof-type/MIME enforcement | VERIFIED |
| EVD-079 | CODE | `prisma/seeds/02-system-roles.seed.ts`; `src/modules/parent-app/messages/controller/parent-messages.controller.ts`; `src/modules/parent-app/messages/application/send-parent-conversation-message.use-case.ts` | Parent can send messages but lacks default upload permission and has no multipart upload route | VERIFIED |
| EVD-080 | CODE | `src/modules/grades/assessments/dto/grade-assessment-question.dto.ts`; `src/modules/grades/assessments/domain/grade-question-domain.ts`; `prisma/schema.prisma` | bounded Grade MEDIA textual URL stored in question metadata | VERIFIED |
| EVD-081 | CODE | `src/modules/settings/branding/application/resolve-school-logo-url.service.ts`; `src/modules/settings/branding/domain/legacy-branding-logo-url.ts`; `prisma/schema.prisma` | managed branding File plus safe legacy `SchoolProfile.logoUrl` fallback | VERIFIED |
| EVD-082 | CODE | `src/modules/admissions/documents/`; `src/modules/reinforcement/hero-journey/`; `src/modules/behavior/`; `prisma/schema.prisma` | application-document and Hero File relations; Behavior has no File relation | VERIFIED |
| EVD-083 | TEST | `src/modules/settings/branding/tests/`; `src/modules/applicant-portal/tests/applicant-portal-documents.spec.ts`; `src/modules/student-app/profile/tests/student-avatar.use-case.spec.ts` | feature-specific validation/lifecycle regression evidence | VERIFIED |
| EVD-084 | CODE | `src/modules/settings/email/delivery/application/school-email-delivery-queue.service.ts`; `package-lock.json` | builder emits `school-email-delivery:<batchId>:<recipientId>`; real-BullMQ acceptance outcome remains unverified | VERIFIED_CODE / UNVERIFIED_RUNTIME_OUTCOME |
| EVD-085 | GOVERNANCE | the five Phase 0A-R1 documents | corrected phase sequence, conditional migration model, and architecture-review gates | VERIFIED_DOCUMENT |

R1 register totals are 85 evidence records, 53 decisions, 48 owner questions,
74 acceptance gates, and 38 unique risks. The final prerequisite validator must
report zero ambiguous bare gate references.

## Preserved project status

- Dashboard V1 remains closed and is not reopened.
- Learning Content and Media remains functionally complete.
- Production Operational Readiness remains deferred and is the subject of this
  program.
- The codebase remains one modular monolith.
- Future runtime separation means deployment roles built from one repository;
  it does not authorize distributed domain microservices.
- No API, tenancy, permission, business-logic, schema, or migration behavior
  changed in this task.

## Limitations

- `LIM-001`: required `DIRECTORY_STRUCTURE.md` is absent; the visual document
  was available and read. Phase 0B must either create and approve a canonical
  `DIRECTORY_STRUCTURE.md` or update authoritative reading references to the
  actual canonical visual path.
- `LIM-002`: CI proves baseline behavior in GitHub-hosted test environments,
  not production-equivalent GCP operation.
- `LIM-003`: no production project, region, capacity, workload, RTO/RPO,
  budget, domain, or frontend-origin decisions have owner approval in the
  inspected context.
- `LIM-004`: no live database, Redis, bucket, Docker daemon workload, or cloud
  resource was inspected. Operational data volumes, lag, pool usage, and
  recovery times therefore remain unverified.
- `LIM-005`: code absence was established by repository-wide searches at the
  baseline. It cannot prove behavior implemented outside this repository.

## Scope and safety attestation

This Phase 0A-R1 correction revised only the same five documentation files. It
did not change application behavior. No database, Redis instance,
object-storage bucket, Docker workload, or cloud resource was connected to or
mutated. No `.env` file was read. No secret value was copied into these
documents. Intent-to-add is used only for `git diff --check` and is cleared
before handoff; nothing is committed, pushed, tagged, or submitted as a pull
request. Phase 0B, GCS design, file lifecycle, and asynchronous media remain
unapproved.
