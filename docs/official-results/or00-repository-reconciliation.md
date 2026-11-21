# OR00 — Repository reconciliation

Verified 2026-11-21 from
`Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend`.

| Evidence | Value |
| --- | --- |
| Starting repository | `Back-end/Backend-1`, branch `main` |
| Starting HEAD | `a8a8f160e8c85d1dd8364e055ada69cee61cd7e5` |
| Refreshed and remotely confirmed `origin/main` | `a8a8f160e8c85d1dd8364e055ada69cee61cd7e5` |
| Attached reference | `a8a8f160e8c85d1dd8364e055ada69cee61cd7e5` |
| Relevant source comparison | No differences across Prisma, runtime source, tests, ADRs, lockfile or governing documents |
| Implementation directory | `Back-end/worktrees/moazez-be-official-results` |
| Implementation branch | `codex/moazez-be-official-results` |
| Implementation start divergence | Ahead 0, behind 0 |
| Implementation start status | Clean, tracked changes 0, untracked files 0 |
| Runtime | Node 22.23.1, npm 11.14.1, package-lock.json, Prisma 6.19.3 |
| Review access | GitHub reports ADMIN for the configured repository |
| Governing sources | AGENTS, workspace hygiene, security, API/exception, migration and Prisma conventions, numbered ADRs |

## Integration evidence and decisions

| Boundary | Source observation | Feature integration and proof |
| --- | --- | --- |
| Independent storage | `GradeItem.assessmentId` is required. Assessment routes and adapters use their own persisted records. | No assessment/homework/behavior/reinforcement grade dependency. T001 and T088 verify independent writes and existing reads. |
| Academic targeting | `SubjectAllocation` identifies grade/year/term/subject. `Enrollment.termId` is nullable and enrollment has an interval. `Term` exposes activity, not a reporting lifecycle state. | Resolve placement by full hierarchy and interval. Canonical slots survive transfers. Period closure belongs to Official Results. T002–T005 and OR04 roster tests cover it. |
| Teacher authority | `TeacherAppAccessService.findOwnedTeacherAllocation` passes the old `classId` as `allocationId`. `PrismaTeacherAllocationOperationalWriteGate` locks the exact live row. | Explicit physical classroom and allocation IDs, exact tuples, no cross-product. R08/T007, T013–T015. |
| Family identity | `Student.userId` is globally unique and the parent link has school-bound composite FKs. `EnrollmentsRepository` changes enrollment/placement without moving that identity. Existing student/parent context filters active students and enrollments. `ScopeResolverGuard` resolves live user and active membership. | Dedicated historical read port and a revocable, verified continuity entitlement where required. OR06 owns V02 with T049–T053 and lifecycle/entitlement tests. |
| Tenant scope | `school-scope.extension.ts` injects school filters on registered operations only when a scoped membership exists and bypass is off. Only registered reads receive soft-delete predicates. | Explicit same-school checks for creates, raw SQL, nested relations and background jobs. Tests cover composite FKs, scoped reads and revocation. |
| File access | Generic URL and content use the same `FilesRepository.findScopedFileById` resolution. It excludes credential-secret links and assessment artifacts before providing storage access. | Reserve a feature-specific private artifact association and authenticated content path. Validate alternate routes in OR07/OR12. |
| Worker ownership | `CoreWorkerConsumersModule` owns import validation consumption. Student registration/credentials implement durable validation and execution behind queue transport. `MaintenanceSchedulesModule` owns import reconciliation scheduling. | Add results-specific DB-certified jobs and leases behind these runtime roles. T074–T079, T091 and T094. |
| Permissions | `permission-catalog.ts` and `system-role-catalog.ts` own reference data. `reference-data-bootstrap.ts` implements the controlled bootstrap, with seeds separated from schema SQL. | Add independent permission codes, default draft rights and explicit publish opt-in. Verify template coverage never grants authority. The historical “permission requires migration” sentence does not govern catalog reconciliation. |
| Contracts | `configureHttpApplication` sets one prefix. `configureSwagger` generates from Nest metadata. `GlobalExceptionFilter` supplies the structured error envelope and does not localize existing errors. | Localize new feature errors at the feature boundary. Keep existing envelopes and adapter routes. T048, T056, T085, T088 and T095 cover rendered contracts. |
| Migration governance | Immutable chain, isolated fresh replay, status and second deploy required. Production image workflow uses manual dispatch restricted to main. | Use local PostgreSQL 16 fixtures and new migration directories. Schema and runtime acceptance evidence are separate. No production workflow dispatch is part of this task. |

## Route ownership

No existing Official Results namespace appears in the current controllers,
contract docs or adapter-backed route inventories. The new catalog assigns
management to `/api/v1/official-results`, teacher to
`/api/v1/teacher/official-results`, and immutable family results to
`/api/v1/student/official-results` and
`/api/v1/parent/children/:studentId/official-results`.

Existing routes observed in the source controllers and app adapter contracts:

- `GET /api/v1/student/grades`, `/summary`, `/assessments/:assessmentId`
- `GET /api/v1/parent/children/:studentId/grades`, `/summary`, `/assessments/:assessmentId`
- `GET /api/v1/teacher/classroom/:classId/grades/assessments`, `/assessments/:assessmentId`, `/gradebook`

The [operation inventory](contracts/endpoint-catalog.json) and
[DTO dictionary](contracts/DTO_DICTIONARY.md) are the preserved v1.0 handoff
targets. Their numbered-document references point into the owner handoff.
Keep the catalog operation IDs explicit in Swagger and compare generated spec
and HTTP behavior against these contracts at implementation time.

## Reproducible verification

| Check | Configuration |
| --- | --- |
| Compile and formatting | `npm run build`, `npm run lint:check` or ESLint on exact touched files. Standard lint has `--fix`. |
| Focused suites | `npm test -- --runInBand <paths>`; `npx jest --config test/jest-e2e.json --runInBand --runTestsByPath <paths>` |
| Full non-deployment regression | `npm run test:regression` invokes `scripts/universal-regression.cjs`; `npm run test:e2e` includes the app suite. |
| Migration policy | `npm run test:migration-governance`, `npm run db:migrations:check` |
| Migration workflow | Prisma validate/generate; `npm run db:migration:create -- --name <name>`; review SQL; fresh `npm run db:migrations:deploy`; status; separate reference data/seed; second deploy. |
| Reference data | `npm run build` compiles the bootstrap; `npm run bootstrap:reference-data` is the controlled CLI from the production build. `npm run seed` uses the Prisma seed entry point on disposable databases. |

Read actual results in the [implementation ledger](../../verification/implementation-ledger.json).
The [acceptance matrix](../../verification/acceptance-matrix.json) records
application coverage by test ID. Baseline observations and package examples
do not satisfy application acceptance cases.
