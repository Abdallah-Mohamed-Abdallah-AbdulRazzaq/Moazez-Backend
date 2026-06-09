# Sprint 17G — Platform Admin Final Closeout Audit

## 1. Purpose and Scope

Sprint 17G is documentation-only. It closes the Platform Admin foundation delivered across Sprint 17A through Sprint 17F and records the final backend state for organizations, schools, provisioning, entitlements, feature controls, student seat usage, and student seat limit enforcement.

Sprint 17G does not introduce runtime behavior, schema changes, migrations, tests, package scripts, README updates, generated files, ADR updates, or project structure updates.

The only intended changed file for Sprint 17G is:

- `docs/sprint-17g-platform-admin-final-closeout-audit.md`

This audit is factual documentation over the current repository state. It does not implement routes, controllers, DTOs, presenters, use-cases, repositories, tests, Prisma changes, seed changes, billing, payment, invoice, plan, entitlement status/date blocking, feature runtime enforcement, login blocking, or access blocking.

## 2. Verified Baseline

Latest implementation baseline observed from `git log --oneline -20`:

- `a787e45 docs: update project structure after seat limit enforcement`
- `4b27987 feat: enforce student seat limits`
- `7c94f75 docs: update project structure after feature controls`
- `f882151 feat: add platform admin school feature controls`
- `00bbdbc docs: update project structure after school entitlements`
- `c86b016 feat: add platform admin school entitlements`
- `98013fe docs: update project structure after school provisioning`
- `7df9cfd feat: add platform admin school provisioning`
- `d8b9b7a docs: update project structure after platform admin foundation`
- `0769485 feat: add platform admin organizations and schools foundation`
- `fe6daeb docs: update project structure after platform admin audit`
- `364c1f5 docs: add platform admin basic foundation audit`

The mistyped `7df9b7a` provisioning commit was not present in the inspected log. The actual provisioning implementation commit is `7df9cfd`.

`git status --short` returned no output before this Sprint 17G audit file was created.

Project execution history supplied for this closeout records the latest known verification checks as:

- `verify:sprint17f` passed.
- Full security run passed: 28 suites / 681 tests.
- Full unit run passed: 344 suites / 1763 tests.
- The working tree was clean after the Sprint 17F project structure update.

Sprint 17G did not rerun those test suites. The only commands run after writing this document are the requested git/diff validation commands listed in the final handoff.

## 3. Sprint 17A to 17F Summary

### Sprint 17A — Platform Admin Basic Foundation Audit

Sprint 17A was documentation-only. It defined Platform Admin as separate from School Dashboard and planned the runtime foundation for organization management, school management, school provisioning, school entitlements, feature control, student seat usage, and student seat limits.

It confirmed that V1 excludes billing, payments, invoices, finance, wallet, marketplace, advanced rollout rules, and advanced analytics builder scope.

### Sprint 17B — Organizations and Schools Runtime Foundation

Sprint 17B added the Platform Admin runtime foundation:

- `PlatformAdminModule`.
- Platform-only controller shell under `/api/v1/platform-admin/*`.
- Organization create, read, list, update, activate, suspend, and archive flows.
- School create, read, list, update, activate, suspend, and archive flows.
- Platform overview counters.
- Platform permissions.
- Platform actor and permission boundary.
- Platform scope markers and approved platform bypass usage.
- Audit logging for organization and school mutations.

Sprint 17B did not add school provisioning, entitlements, feature-control storage, billing, or student seat enforcement.

Routes introduced:

- `GET /api/v1/platform-admin/overview`
- `GET /api/v1/platform-admin/organizations`
- `POST /api/v1/platform-admin/organizations`
- `GET /api/v1/platform-admin/organizations/:organizationId`
- `PATCH /api/v1/platform-admin/organizations/:organizationId`
- `POST /api/v1/platform-admin/organizations/:organizationId/activate`
- `POST /api/v1/platform-admin/organizations/:organizationId/suspend`
- `POST /api/v1/platform-admin/organizations/:organizationId/archive`
- `GET /api/v1/platform-admin/schools`
- `POST /api/v1/platform-admin/organizations/:organizationId/schools`
- `GET /api/v1/platform-admin/schools/:schoolId`
- `PATCH /api/v1/platform-admin/schools/:schoolId`
- `POST /api/v1/platform-admin/schools/:schoolId/activate`
- `POST /api/v1/platform-admin/schools/:schoolId/suspend`
- `POST /api/v1/platform-admin/schools/:schoolId/archive`

Permissions introduced:

- `platform.overview.view`
- `platform.organizations.view`
- `platform.organizations.manage`
- `platform.schools.view`
- `platform.schools.manage`

### Sprint 17C — School Provisioning + Primary School Admin Account

Sprint 17C added:

- `POST /api/v1/platform-admin/school-provisioning`.
- Organization creation mode.
- Existing organization mode.
- School creation.
- Login domain setup through `SchoolLoginSettings`.
- Primary school admin `User` creation.
- Active `Membership` creation with the `school_admin` role.
- Generated login email from `username + @ + school login domain`.
- Credential delivery modes:
  - `manual`
  - `activation_link`
  - `temporary_password`
- One-time temporary password reveal only for `temporary_password` mode.
- Password hashing through the existing argon2id password service.
- Sanitized provisioning audit entries.

Provisioning does not store raw passwords. The response can include the generated temporary password only once when `temporary_password` mode is selected. Audit entries do not include temporary passwords or password hashes.

Provisioning does not create subscription, entitlement, feature-control, billing, invoice, payment, or plan records.

### Sprint 17D — School Entitlements + Student Seat Usage

Sprint 17D added migration `20260609120000_0031_school_entitlements` with:

- enum `SchoolEntitlementStatus`
- model `SchoolEntitlement`
- relation from `School` to `SchoolEntitlement`
- relation from `Organization` to `SchoolEntitlement`
- positive `student_seat_limit` check constraint
- indexes on organization, status, and entitlement end date

Routes introduced:

- `GET /api/v1/platform-admin/schools/:schoolId/entitlement`
- `PUT /api/v1/platform-admin/schools/:schoolId/entitlement`

Permissions introduced:

- `platform.entitlements.view`
- `platform.entitlements.manage`

Implemented behavior:

- Reads a school entitlement or returns `entitlement: null`.
- Upserts entitlement status, start date, end date, student seat limit, and notes.
- Computes active student seat usage as a read model.
- Adds entitlement counters to Platform Admin overview.
- Audits entitlement create/update mutations with sanitized metadata.

Seat usage definition:

`active_students` = distinct students with an active enrollment in the school where the enrollment is not deleted, the student status is `ACTIVE`, and the student is not deleted.

Sprint 17D did not enforce student seat limits. Lowered limits could mark a school over limit in the read model, but did not block or mutate students/enrollments in Sprint 17D.

### Sprint 17E — Feature Control Foundation

Sprint 17E added migration `20260609130000_0032_school_feature_controls` with:

- enum `SchoolFeatureControlSource`
- model `SchoolFeatureControl`
- relation from `School` to feature controls
- relation from `Organization` to feature controls
- unique constraint on `[schoolId, featureKey]`
- feature key snake_case check constraint
- indexes on organization, feature key, and enabled state

Routes introduced:

- `GET /api/v1/platform-admin/schools/:schoolId/features`
- `PUT /api/v1/platform-admin/schools/:schoolId/features/:featureKey`
- `PUT /api/v1/platform-admin/schools/:schoolId/features`

Permissions introduced:

- `platform.features.view`
- `platform.features.manage`

Registered feature keys:

- `dashboard`
- `admissions`
- `students`
- `academics`
- `attendance`
- `grades`
- `homework`
- `reinforcement`
- `behavior`
- `communication`
- `teacher_app`
- `student_app`
- `parent_app`
- `applicant_portal`
- `schedule_timetable`

Implemented behavior:

- Reads all known feature keys for a school.
- Returns unconfigured keys as disabled platform defaults without creating rows.
- Supports single feature-control upsert.
- Supports bulk feature-control upsert.
- Adds feature counters to Platform Admin overview.
- Audits create/update/enable/disable/bulk feature-control mutations with sanitized metadata.

Sprint 17E did not add runtime feature enforcement. Feature-control data is configuration only.

### Sprint 17F — Student Seat Limit Enforcement Integration

Sprint 17F added student seat limit enforcement without Prisma schema or migration changes.

Runtime additions:

- `StudentSeatLimitPolicyService`
- `StudentSeatLimitPolicyRepository`
- shared active-seat usage query helper in `student-seat-usage.query.ts`
- integration into active enrollment creation paths
- error code `platform.entitlement.student_seat_limit_exceeded`
- HTTP 409 conflict behavior through `DomainException`
- safe error details: `schoolId`, `limit`, `used`, `remaining`, and `calculation`

Enforcement points:

- `POST /api/v1/students-guardians/enrollments`
- `POST /api/v1/students-guardians/enrollments/upsert`, only when creating a new active enrollment
- admissions-backed enrollment creation through the students enrollment endpoint when `applicationId` is present

Clarifications:

- `POST /api/v1/admissions/applications/:id/enroll` remains a non-blocking enrollment handoff/preview route when it does not create an active seat.
- Bare student creation is not blocked because it does not create an active enrollment.
- Schools with no entitlement row remain unlimited.
- Schools with `studentSeatLimit: null` remain unlimited.
- Lowering a limit below current usage marks the school over limit but does not mutate existing students or enrollments.
- New active-seat additions are blocked once the limit is reached.
- Enforcement does not check entitlement status.
- Enforcement does not check entitlement dates.
- Enforcement does not block login or access.
- Enforcement does not enforce feature controls.
- Enforcement does not implement billing, payment, invoice, or plan behavior.

## 4. Final Platform Admin Runtime Surface

### Overview

| Method | Path | Permission | Sprint | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/platform-admin/overview` | `platform.overview.view` | 17B | Platform-level organization/school counters; later includes entitlement and feature counters. |

### Organizations

| Method | Path | Permission | Sprint | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/platform-admin/organizations` | `platform.organizations.view` | 17B | Lists organizations with pagination and filters. |
| POST | `/api/v1/platform-admin/organizations` | `platform.organizations.manage` | 17B | Creates an active organization. |
| GET | `/api/v1/platform-admin/organizations/:organizationId` | `platform.organizations.view` | 17B | Reads one organization. |
| PATCH | `/api/v1/platform-admin/organizations/:organizationId` | `platform.organizations.manage` | 17B | Updates organization name/slug. |
| POST | `/api/v1/platform-admin/organizations/:organizationId/activate` | `platform.organizations.manage` | 17B | Sets status to `ACTIVE` when transition is allowed. |
| POST | `/api/v1/platform-admin/organizations/:organizationId/suspend` | `platform.organizations.manage` | 17B | Sets status to `SUSPENDED`; does not cascade school state. |
| POST | `/api/v1/platform-admin/organizations/:organizationId/archive` | `platform.organizations.manage` | 17B | Sets status to `ARCHIVED`; no destructive cascade. |

### Schools

| Method | Path | Permission | Sprint | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/platform-admin/schools` | `platform.schools.view` | 17B | Lists schools across organizations with filters. |
| POST | `/api/v1/platform-admin/organizations/:organizationId/schools` | `platform.schools.manage` | 17B | Creates an active school under an active organization. |
| GET | `/api/v1/platform-admin/schools/:schoolId` | `platform.schools.view` | 17B | Reads one school. |
| PATCH | `/api/v1/platform-admin/schools/:schoolId` | `platform.schools.manage` | 17B | Updates school name/slug. |
| POST | `/api/v1/platform-admin/schools/:schoolId/activate` | `platform.schools.manage` | 17B | Sets status to `ACTIVE` when transition is allowed. |
| POST | `/api/v1/platform-admin/schools/:schoolId/suspend` | `platform.schools.manage` | 17B | Sets status to `SUSPENDED`; does not block login/access. |
| POST | `/api/v1/platform-admin/schools/:schoolId/archive` | `platform.schools.manage` | 17B | Sets status to `ARCHIVED`; mutation routes reject archived school updates where implemented. |

### Provisioning

| Method | Path | Permission | Sprint | Notes |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/platform-admin/school-provisioning` | `platform.schools.manage` | 17C | Atomically creates/selects organization, creates school, configures login domain, creates primary admin user and membership. |

### Entitlements

| Method | Path | Permission | Sprint | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/platform-admin/schools/:schoolId/entitlement` | `platform.entitlements.view` | 17D | Reads school entitlement and active student seat usage. |
| PUT | `/api/v1/platform-admin/schools/:schoolId/entitlement` | `platform.entitlements.manage` | 17D | Upserts entitlement fields; does not mutate existing students/enrollments. |

### Feature Controls

| Method | Path | Permission | Sprint | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/platform-admin/schools/:schoolId/features` | `platform.features.view` | 17E | Reads all registered feature keys, defaulting missing rows to disabled platform defaults. |
| PUT | `/api/v1/platform-admin/schools/:schoolId/features/:featureKey` | `platform.features.manage` | 17E | Upserts one registered school feature control. |
| PUT | `/api/v1/platform-admin/schools/:schoolId/features` | `platform.features.manage` | 17E | Bulk upserts registered school feature controls transactionally. |

No Platform Admin billing, invoice, payment, plan, organization entitlement, feature-enforcement, or login-blocking routes exist in the inspected controller.

## 5. Final Platform Admin Schema Surface

Actual Platform Admin schema additions:

- `SchoolEntitlementStatus`
  - `ACTIVE`
  - `TRIAL`
  - `SUSPENDED`
  - `EXPIRED`
  - `ARCHIVED`
- `SchoolEntitlement`
  - `schoolId`
  - `organizationId`
  - `status`
  - `startsAt`
  - `endsAt`
  - `studentSeatLimit`
  - `notes`
  - `createdAt`
  - `updatedAt`
- `SchoolFeatureControlSource`
  - `PLATFORM`
  - `ENTITLEMENT`
  - `SYSTEM`
- `SchoolFeatureControl`
  - `schoolId`
  - `organizationId`
  - `featureKey`
  - `enabled`
  - `source`
  - `notes`
  - `createdAt`
  - `updatedAt`

Relations added to `School`:

- `entitlement SchoolEntitlement?`
- `featureControls SchoolFeatureControl[]`

Relations added to `Organization`:

- `schoolEntitlements SchoolEntitlement[]`
- `schoolFeatureControls SchoolFeatureControl[]`

Schema boundaries:

- No billing tables were added.
- No payment tables were added.
- No invoice tables were added.
- No plan catalog tables were added.
- No subscription automation tables were added.
- No denormalized active student seat counter field was added.
- Seat usage is computed from active `Enrollment` and active `Student` state.

Provisioning reuses existing identity and settings schema, including `Organization`, `School`, `SchoolLoginSettings`, `User`, `Membership`, `Role`, and credential fields. Sprint 17C did not add a provisioning-specific schema.

## 6. Permissions and Roles

Final Platform Admin permission set:

- `platform.overview.view`
- `platform.organizations.view`
- `platform.organizations.manage`
- `platform.schools.view`
- `platform.schools.manage`
- `platform.entitlements.view`
- `platform.entitlements.manage`
- `platform.features.view`
- `platform.features.manage`

Role posture:

- `platform_super_admin` receives Platform Admin permissions through the existing system role seed behavior because it receives `ALL` permission codes.
- `organization_admin` receives `NON_PLATFORM`, which filters out `platform.*` permissions.
- `school_admin` receives `SCHOOL_LEVEL`, which is the non-platform permission set.
- `teacher`, `parent`, and `student` roles use explicit narrower permission arrays and do not receive Platform Admin permissions.
- School, teacher, student, parent, applicant, pickup, and ordinary organization actors do not gain Platform Admin access from their role seeds.

Runtime access requires:

- authenticated actor
- platform user type boundary
- explicit Platform Admin permission through the resolved platform permission bundle

`ScopeResolverGuard` resolves `platform_super_admin` permission codes for membershipless `PLATFORM_USER` actors. `PermissionsGuard` then checks `@RequiredPermissions(...)` against the resolved platform permission bundle.

## 7. Security and Tenancy Posture

Platform Admin is separate from School Dashboard.

Security and tenancy posture:

- Platform Admin routes live under `/api/v1/platform-admin/*`.
- Platform Admin use cases call `requirePlatformAdminScope()`.
- Non-platform actors are denied from Platform Admin scope.
- Platform Admin routes declare explicit `@RequiredPermissions(...)`.
- Platform reads/writes intentionally cross school tenancy only through `platformBypassScope(...)`.
- Platform-scope controllers, services, and repositories are annotated with `@PlatformScope()` where cross-tenant behavior is intentional.
- School-scoped student seat enforcement runs inside existing school-scoped Students/Enrollments flows.
- The Prisma `schoolScope` extension includes `SchoolEntitlement` and `SchoolFeatureControl` as school-scoped models.
- Platform Admin repositories bypass school scope only for platform-level cross-school administration.
- Responses are shaped by presenters and do not return raw Prisma rows.
- Responses avoid leaking password hashes, temporary passwords beyond one-time provisioning reveal, token data, email provider secrets, or raw internal payloads.
- Seat-limit conflict errors use safe structured details.
- Feature-control data is configuration only and is not runtime enforcement.

School status and entitlement status/date behavior:

- School status can be stored and transitioned by Platform Admin.
- Sprint 17F does not block login or access based on school status.
- Sprint 17F does not block login or access based on entitlement status or dates.
- Student seat enforcement reads only the applicable `studentSeatLimit` and active-seat usage.

## 8. Audit Logging Posture

Implemented audit logging:

- Organization create/update/status lifecycle mutations are audited.
- School create/update/status lifecycle mutations are audited.
- School provisioning is audited across organization selection/creation, school creation, login identity setup, primary admin creation, membership creation, and credential provisioning.
- Entitlement create/update mutations are audited.
- Feature-control create/update/enable/disable/bulk mutations are audited.
- Student enrollment creation remains audited in the Students module.

Audit payload posture:

- Sensitive metadata is sanitized.
- Temporary passwords are one-time response values only and are not logged.
- Password hashes are not logged.
- Token values are not logged.
- Email provider secrets are not logged.
- Billing/payment/invoice/plan fields are not logged because those features are not implemented.
- Entitlement audit snapshots use safe fields such as status, dates, seat limit, changed fields, and `notesPresent`.
- Feature-control audit snapshots use safe fields such as feature key, enabled state, source, changed fields, and `notesPresent`.

## 9. Verification Matrix

| Sprint | Unit tests | Focused security tests | E2E tests | Verify script | Final status |
| --- | --- | --- | --- | --- | --- |
| 17B | Platform Admin use-case and presenter tests under `src/modules/platform-admin/tests`. | `test/security/tenancy.platform-admin.spec.ts`. | `test/e2e/platform-admin-organizations-schools-foundation.e2e-spec.ts`. | `verify:sprint17b` | Covered by Sprint 17B verification history; not rerun in Sprint 17G. |
| 17C | Provisioning use-case and presenter coverage under `src/modules/platform-admin/tests`. | `test/security/tenancy.platform-admin.spec.ts` provisioning access cases. | `test/e2e/platform-admin-school-provisioning.e2e-spec.ts`. | `verify:sprint17c` | Covered by Sprint 17C verification history; not rerun in Sprint 17G. |
| 17D | Entitlement use-case and presenter tests under `src/modules/platform-admin/tests`. | `test/security/tenancy.platform-admin.spec.ts` entitlement permission cases. | `test/e2e/platform-admin-entitlements-seat-usage.e2e-spec.ts`. | `verify:sprint17d` | Covered by Sprint 17D verification history; not rerun in Sprint 17G. |
| 17E | Feature registry, feature-control use-case, and presenter tests under `src/modules/platform-admin/tests`. | `test/security/tenancy.platform-admin.spec.ts` feature permission cases. | `test/e2e/platform-admin-feature-control-foundation.e2e-spec.ts`. | `verify:sprint17e` | Covered by Sprint 17E verification history; not rerun in Sprint 17G. |
| 17F | `StudentSeatLimitPolicyService` tests, Platform Admin tests, Students tests, and Admissions tests through the focused verify script. | `test/security/tenancy.platform-admin.spec.ts`, `test/security/tenancy.students.spec.ts`, and `test/security/tenancy.admissions.spec.ts`. | Sprint 17B through 17F E2E suites, including `test/e2e/platform-admin-student-seat-limit-enforcement.e2e-spec.ts`. | `verify:sprint17f` | Project execution history supplied for this closeout records `verify:sprint17f` as passed. |

Latest known verification summary from project execution history supplied for this closeout:

- `verify:sprint17f` passed.
- Full security passed: 28 suites / 681 tests.
- Full unit passed: 344 suites / 1763 tests.

Sprint 17G itself only creates this audit and runs git/diff validation commands. It does not rerun build, Prisma generation, unit tests, E2E tests, or security tests.

## 10. Explicit Non-Goals and Deferred Work

Deferred or out of scope:

- billing engine
- invoices
- payments
- wallet
- marketplace
- finance
- plan catalog
- subscription renewal automation
- entitlement date/status access blocking
- automatic suspension based on entitlement
- login/access blocking based on school status or entitlement
- runtime feature-control enforcement inside School Dashboard
- runtime feature-control enforcement inside Teacher App
- runtime feature-control enforcement inside Student App
- runtime feature-control enforcement inside Parent App
- background entitlement jobs
- quota warning emails
- organization-level entitlements
- plan-to-feature automation
- advanced rollout rules
- experiments
- A/B testing
- per-user feature flags
- per-role feature flags

These are not missing pieces of Sprint 17A through Sprint 17F. They require explicit future scope approval and, where schema or security behavior changes are involved, separate design and verification.

## 11. Remaining Risks and Follow-Up Recommendations

Recommendations for future planning:

- Sprint 18 planning should decide whether to continue Platform Admin audit/read-model hardening or return to school-facing V1 modules.
- Future feature enforcement should be designed as a separate sprint with clear behavior per module and app surface.
- Future entitlement status/date enforcement should be separately approved and tested.
- Future billing, invoice, payment, and finance work remains out of V1 unless product scope changes.
- School suspension/access blocking should be a dedicated security sprint if approved.
- Organization-level commercial metadata or a plan catalog should require schema planning and ADR-level decision.
- Any future runtime blocking must define safe behavior for existing users, active sessions, school admins, applicants, parents, students, and teachers before implementation.

## 12. Final Closeout Conclusion

The Platform Admin foundation is complete for V1 backend foundation scope:

- organizations and schools
- organization and school lifecycle storage
- school provisioning
- primary school admin account creation
- school login domain setup
- school entitlements
- active student seat usage
- feature controls
- student seat limit enforcement on active enrollment creation
- platform-only security boundary
- explicit Platform Admin permissions
- approved platform-scope tenancy bypass usage
- sanitized audit logging
- focused unit, security, and E2E verification coverage recorded through Sprint 17F

This foundation is intentionally not a billing system, not a payment system, not an invoice system, not a plan catalog, and not a runtime feature enforcement system.
