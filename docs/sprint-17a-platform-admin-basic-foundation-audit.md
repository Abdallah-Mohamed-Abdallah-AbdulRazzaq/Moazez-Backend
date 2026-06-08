# Sprint 17A Platform Admin Basic Foundation Audit

## 1. Purpose and scope

Sprint 17A is a documentation-only audit and implementation plan for the
future Platform Admin foundation.

This sprint does not implement runtime behavior. No runtime code, Prisma
schema, migrations, tests, package scripts, README files, generated files, or
project structure files were changed. The only intended change for this sprint
is this document:

- `docs/sprint-17a-platform-admin-basic-foundation-audit.md`

Platform Admin needs design before implementation because it is the highest
administrative layer in Moazez. It will create and govern organizations,
schools, primary school admin accounts, school activation state, feature
availability, subscription entitlement dates, and student seat limits. Those
capabilities cross tenant boundaries by design, so they must be planned before
any controller, route, repository, migration, permission seed, or guard change
is added.

This audit intentionally separates implemented repository state from proposed
future work. It treats subscription and seat logic as entitlement and quota
control only. It does not plan a V1 billing, invoice, payment, wallet, finance,
or marketplace engine.

## 2. Platform Admin product definition

Platform Admin is separate from School Dashboard.

The approved hierarchy in `PROJECT_OVERVIEW.md`,
`DOMAIN_GLOSSARY.md`, and `SECURITY_MODEL.md` is:

1. Platform
2. Organization / school group
3. School

The platform owns multiple organizations. An organization can represent a
single independent school or a group/brand that owns multiple schools. Each
school remains an independent operational unit with its own school-scoped
academic, admissions, student, attendance, grade, homework, behavior,
reinforcement, communication, and settings data.

School Dashboard is the operational source of truth for school-level work. Its
implemented foundation lives in `src/modules/dashboard/**` and exposes:

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/alerts`
- `GET /api/v1/dashboard/activity-feed`

Platform Admin is SaaS/operator control. It must not be mixed into School
Dashboard routes, route names, permissions, or scope resolution. Future
Platform Admin routes should live under `/api/v1/platform-admin/*`.

## 3. ADR interpretation policy

Files under `adr/` are product intent references for this sprint. They are not
literal backend API contracts for Platform Admin.

Use ADR files to understand:

- school dashboard separation and school operational expectations
- parent/applicant portal school discovery and application expectations
- school settings, identity, email, and account creation expectations
- future app-facing feature availability expectations

Do not use ADR files to:

- rename stable backend APIs
- copy old frontend route paths literally
- reshape unrelated payloads
- denormalize database tables for frontend screens
- put business logic inside controllers
- bypass backend-native security boundaries

The School Dashboard ADRs under `adr/School-Dashboard/` helped confirm that
School Dashboard is school operational. The Parent App ADRs, especially
`adr/Parent-App/parent_applicant_portal.md`,
`adr/Parent-App/parent_auth.md`,
`adr/Parent-App/parent_onboarding.md`, and
`adr/Parent-App/parent_parent_ADD_CHILD_MODEL.md`, helped confirm that future
parent/applicant flows need safe school discovery and application submission,
not Platform Admin route reuse.

## 4. Current implementation baseline

Latest known commit after Dashboard closeout:

```text
61d92a3 docs: update project structure after dashboard foundation closeout
```

`git log --oneline -5` during this sprint showed `61d92a3` as the latest commit.
The initial `git status --short` returned no output before this document was
created.

Dashboard foundation is closed through Sprint 16D. The closeout audit in
`docs/sprint-16d-dashboard-foundation-final-closeout-audit.md` states that
Dashboard Summary, Dashboard Alerts, and Dashboard Activity Feed are closed for
their V1 backend-native foundation, and recommends Platform Admin as the next
foundation sprint.

This Sprint 17A audit did not run build, Prisma generation, unit tests, E2E
tests, or security tests. It inspected repository files and ran only the git and
diff validation commands listed in the final agent response.

One repository note: `CLAUDE.md` references `DIRECTORY_STRUCTURE.md`, but that
file is not present in the current root. The available structure references are
`DIRECTORY_STRUCTURE_VISUAL.md` and `Moazez-Project-Structure.json`.

## 5. Current schema/readiness assessment

### `Organization`

Implemented state:

- `prisma/schema.prisma` defines `Organization` with `id`, `name`, `slug`,
  `status`, `createdAt`, `updatedAt`, and `deletedAt`.
- `slug` is globally unique.
- It has relations to schools, memberships, audit logs, files, leads,
  applications, students, and guardians.

Can support:

- single-school organizations
- multi-school school groups
- platform-level organization listing and detail
- activation, suspension, and archive status storage
- soft archive through `deletedAt` when future code intentionally uses it

Cannot support yet:

- organization profile/contact metadata beyond `name` and `slug`
- organization-level subscription/billing profile
- organization-level feature inheritance
- organization owner assignment as a first-class concept

Migration needed later:

- Not for basic organization CRUD/status.
- Yes if future V1 requires organization profile/contact fields or
  organization-level entitlements. This sprint recommends school-level
  entitlements first.

### `School`

Implemented state:

- `prisma/schema.prisma` defines `School` with `organizationId`, `name`,
  `slug`, `status`, timestamps, and `deletedAt`.
- `@@unique([organizationId, slug])` supports unique school slugs within one
  organization.
- `School` has relations to all school-domain data, including settings,
  academics, students, admissions, attendance, grades, homework,
  reinforcement, behavior, communication, files, imports, and audit logs.

Can support:

- multiple independent schools
- multiple schools under one organization/group
- platform-level school listing and detail
- school activation, suspension, and archive status storage
- safe separation between platform school identity and school operational data

Cannot support yet:

- subscription period/duration
- student seat limit
- feature entitlement flags
- direct timezone/locale fields on `School`
- automatic school provisioning workflow

Migration needed later:

- Not for basic school CRUD/status.
- Yes for school entitlement/subscription and feature entitlement models.
- Optional for platform-level school profile fields if future product decides
  they do not belong in existing `SchoolProfile`.

### `OrganizationStatus`

Implemented state:

- `OrganizationStatus` has `ACTIVE`, `SUSPENDED`, and `ARCHIVED`.

Can support:

- V1 organization status transitions.

Cannot support yet:

- Runtime behavior tied to status, such as blocking organization users or
  cascading school suspension. No current guard checks organization status.

Migration needed later:

- No enum migration is needed for the requested V1 statuses.
- A migration would be needed only if additional statuses are approved later.

### `SchoolStatus`

Implemented state:

- `SchoolStatus` has `ACTIVE`, `SUSPENDED`, and `ARCHIVED`.

Can support:

- V1 school activation, suspension, and archive status storage.

Cannot support yet:

- Login blocking or request blocking for suspended/archived schools. Current
  scope resolution in `src/common/guards/scope-resolver.guard.ts` resolves
  active memberships but does not load or enforce school status.

Migration needed later:

- No enum migration is needed for requested V1 statuses.

### `User`

Implemented state:

- `User` includes `email`, `username`, `contactEmail`, `phone`,
  `passwordHash`, `firstName`, `lastName`, `userType`, `status`,
  `lastLoginAt`, `mustChangePassword`, `passwordChangedAt`,
  `passwordProvisionedAt`, `credentialVersion`, timestamps, and soft delete.
- `email` is globally unique.
- `phone` is globally unique when present.
- `username` is indexed but not globally unique.
- `src/modules/iam/auth/domain/password.service.ts` uses argon2id.
- Credential generation in
  `src/modules/settings/users/credentials/application/generate-user-credential.use-case.ts`
  hashes a generated temporary password, sets `mustChangePassword`, increments
  `credentialVersion`, revokes sessions, audits the action, and returns the
  temporary password only in the response.

Can support:

- primary school admin account creation
- generated login email through `email`
- username/contact email distinction
- temporary password provisioning with `mustChangePassword`
- credential versioning and session revocation after credential changes

Cannot support yet:

- Platform Admin-specific provisioning orchestration.
- One-time activation links as a first-class model.
- Direct platform user permission binding, because current platform users can
  exist without membership and current permissions are membership-derived for
  non-platform users.

Migration needed later:

- Not for basic school admin user/password provisioning.
- Possibly for activation tokens or a platform-role assignment model.

### `UserType`

Implemented state:

- `UserType` includes `PLATFORM_USER`, `ORGANIZATION_USER`, `SCHOOL_USER`,
  `TEACHER`, `PARENT`, `STUDENT`, `APPLICANT`, `PICKUP_DELEGATE`, and
  `SERVICE_ACCOUNT`.

Can support:

- strict separation between platform actors, organization actors, school
  administrators, teachers, parents, students, applicants, pickup delegates,
  and service accounts.

Cannot support yet:

- Authorization by itself. The project rule is that user type, role,
  membership, scope, and permissions are different concepts.

Migration needed later:

- No migration needed for the requested Platform Admin user type.

### `Membership`

Implemented state:

- `Membership` links `userId`, `organizationId`, optional `schoolId`, `roleId`,
  `userType`, `status`, `startedAt`, `endedAt`, timestamps, and soft delete.
- Teacher single-active-membership is enforced by a PostgreSQL partial unique
  index documented in `prisma/schema.prisma`.

Can support:

- school admin membership for a primary school admin.
- organization user membership with `schoolId` nullable.
- school-scoped permissions through the active membership role.

Cannot support yet:

- A pure platform membership because `organizationId` is required.
- Current `ScopeResolverGuard` allows `PLATFORM_USER` without membership.
  `PermissionsGuard` currently bypasses permission checks for `PLATFORM_USER`.
  That means explicit platform permissions are not currently enforced.

Migration needed later:

- Likely yes if future implementation wants first-class platform membership or
  user-to-platform-role assignment.
- No migration if a future guard uses another approved explicit permission
  representation, but that representation must be designed before runtime.

### `Role`

Implemented state:

- `Role` has optional `schoolId`, `key`, `name`, `description`, `isSystem`,
  timestamps, and soft delete.
- `prisma/seeds/02-system-roles.seed.ts` seeds system roles with `schoolId:
  null`, including `platform_super_admin`, `organization_admin`,
  `school_admin`, `teacher`, `parent`, and `student`.

Can support:

- a reusable `platform_super_admin` permission bundle.
- a reusable `school_admin` role for a primary school admin membership.
- custom school-scoped roles.

Cannot support yet:

- Assigning `platform_super_admin` to the seeded platform admin user without a
  membership or another user-role binding.
- Platform Admin permissions, because the current permission catalog has no
  `platform_admin.*` permissions.

Migration needed later:

- Not for the role table itself unless a direct user-role join is added.

### `Permission`

Implemented state:

- `Permission` stores `code`, `module`, `resource`, `action`, and
  `description`.
- Current permissions cover settings, admissions, academics, attendance,
  grades, homework, reinforcement, behavior, communication, files, students,
  and dashboard.
- The only platform-named permission codes currently present are
  `communication.platform.view` and `communication.platform.manage`.

Can support:

- future explicit Platform Admin permission codes through seeds.

Cannot support yet:

- Platform Admin route authorization because no `platform_admin.*` or
  equivalent permission codes exist yet.

Migration needed later:

- No schema migration for new permission rows.
- Future seed changes are needed in runtime sprints. The project governance
  says new permissions are versioned and should be handled deliberately.

### `RolePermission`

Implemented state:

- `RolePermission` is a composite join table between roles and permissions.

Can support:

- assigning future Platform Admin permission codes to `platform_super_admin`.

Cannot support yet:

- User-specific platform permissions without a way to bind a platform user to a
  role.

Migration needed later:

- Not for the join table itself.

### `SchoolLoginSettings`

Implemented state:

- `SchoolLoginSettings` has a unique `schoolId`, `loginDomain`,
  username length policy, allowed/reserved username settings, status, and
  timestamps.
- `src/modules/settings/login-identity/**` supports school-scoped login domain
  configuration, username preview, username availability, and generated login
  emails.
- `UserLoginIdentityResolver` builds login emails as
  `username@loginDomain` and checks `User.email` uniqueness.

Can support:

- provisioning a login domain for a school.
- creating a school admin with a generated login email.
- duplicate login email detection through global `User.email`.

Cannot support yet:

- Platform Admin provisioning directly, because current use cases depend on
  `requireSettingsScope()` and a school membership.
- Global uniqueness of `loginDomain` at the schema level.

Migration needed later:

- Not strictly required for first provisioning if the use case validates
  collisions.
- Consider a unique index on `loginDomain` later if product requires one domain
  per school.

### `SchoolEmailConnection`

Implemented state:

- `SchoolEmailConnection` supports provider type, from/reply-to identity, SMTP
  or API credential storage, encrypted password/API key fields, status,
  testing metadata, and timestamps.
- `src/modules/settings/email/**` supports connection update, test, activate,
  disable, and sanitized presenters.

Can support:

- school-scoped outbound email configuration before credential delivery.
- safe secret storage patterns for email provider credentials.

Cannot support yet:

- Platform Admin default email provisioning without calling a school-scoped
  settings flow or writing a platform-native provisioning use case.
- Sending credential email unless a school connection is `ACTIVE`.

Migration needed later:

- No schema migration for basic provisioning integration.

### Email delivery/template foundations

Implemented state:

- `SchoolEmailTemplate` supports `ACCOUNT_CREDENTIALS`, `PASSWORD_RESET`, and
  `GENERAL_MESSAGE`.
- `SchoolEmailDeliveryBatch` and `SchoolEmailDeliveryRecipient` support queued
  credential delivery and general campaigns.
- `src/modules/settings/email/delivery/**` uses a queue service backed by
  BullMQ through `SchoolEmailDeliveryQueueService`.
- `SchoolEmailRendererService` renders credential emails and can include a
  temporary password.

Can support:

- optional credential email delivery after a primary school admin has been
  created and credentials have been generated.
- sanitized batch and recipient monitoring in school settings.

Cannot support yet:

- Platform Admin orchestration of credential delivery.
- Activation links as a complete flow.
- Delivery if the school email connection is missing or inactive.

Migration needed later:

- No migration for queued credential email.
- Migration may be needed for activation-token based onboarding if approved.

### `AuditLog`

Implemented state:

- `AuditLog` has nullable `actorId`, nullable `userType`, nullable
  `organizationId`, nullable `schoolId`, `module`, `action`, `resourceType`,
  nullable `resourceId`, JSON `before`/`after`, `outcome`, `ipAddress`,
  `userAgent`, and `createdAt`.
- It indexes `[schoolId, createdAt]`, `[organizationId, createdAt]`,
  `[actorId, createdAt]`, `[module, action]`, and `[resourceType, resourceId]`.
- `src/modules/iam/auth/infrastructure/auth.repository.ts` exposes
  `createAuditLog(...)`.
- Existing modules audit sensitive actions such as admissions decisions,
  enrollment lifecycle, grade actions, homework review/sync, communication
  mutations, and settings/email/credential changes.

Can support:

- platform status transition audit rows.
- school provisioning audit rows.
- entitlement and feature-control audit rows.
- initial platform audit list filtering by organization, school, actor, module,
  action, resource, and date.

Cannot support yet:

- `DENIED` audit outcomes. `AuditOutcome` currently has `SUCCESS` and
  `FAILURE`, while `SECURITY_MODEL.md` mentions denied outcomes.
- A dedicated audit service abstraction. Current code uses
  `AuthRepository.createAuditLog(...)`.
- Safe platform audit presentation. Platform audit must not expose raw secrets,
  token metadata, password hashes, or unsafe PII expansion.

Migration needed later:

- Not for initial read/write audit rows.
- Yes if `AuditOutcome.DENIED` is required.

### Platform bypass and school scope helpers

Implemented state:

- `src/infrastructure/database/school-scope.extension.ts` injects school scope
  on school-scoped models when the request context has an active school
  membership.
- It excludes platform/global models such as `Organization`, `School`,
  `Permission`, `Session`, `AuditLog`, `User`, and `RolePermission`.
- `src/infrastructure/database/platform-bypass.helper.ts` wraps
  `withBypassSchoolScope(...)`.
- `src/common/decorators/platform-scope.decorator.ts` provides
  `@PlatformScope()` as a marker for code-review visibility.

Can support:

- explicit cross-school reads for Platform Admin repositories.
- platform-level organization and school queries.
- platform audit reads against `AuditLog` with explicit filters.

Cannot support yet:

- Automatic proof that a bypass caller is annotated with `@PlatformScope()`.
- Platform authorization. Bypass is a database scope mechanism, not an auth
  decision.

Migration needed later:

- No schema migration.
- Runtime guard/test work is needed before Platform Admin implementation.

## 6. Platform Admin access model

Future Platform Admin routes should require platform-level scope.

Required access policy:

- Route namespace: `/api/v1/platform-admin/*`.
- Actor must be authenticated.
- Actor must have `UserType.PLATFORM_USER`.
- Actor must have explicit Platform Admin permissions.
- Access must not depend on role name only.
- School Dashboard routes must not become Platform Admin routes.
- Platform Admin must not depend on school dashboard active membership scope.

The existing `platform_super_admin` system role in
`prisma/seeds/02-system-roles.seed.ts` is suitable as a permission bundle name,
but the current assignment path is incomplete. `prisma/seeds/03-platform-admin.seed.ts`
creates `admin@moazez.dev` as a `PLATFORM_USER`, but it does not attach any
role or membership. Current `PermissionsGuard` bypasses permission checks for
all `PLATFORM_USER` actors, so future Platform Admin implementation must close
that gap before shipping protected routes.

Actors that must be denied unless a future explicit policy says otherwise:

- `ORGANIZATION_USER`
- `SCHOOL_USER`
- `TEACHER`
- `PARENT`
- `STUDENT`
- `APPLICANT`
- `PICKUP_DELEGATE`
- ordinary `SERVICE_ACCOUNT`

Recommended future runtime additions:

- Add explicit Platform Admin permission codes, such as
  `platform_admin.organizations.view`,
  `platform_admin.organizations.manage`,
  `platform_admin.schools.view`,
  `platform_admin.schools.manage`,
  `platform_admin.provisioning.manage`,
  `platform_admin.entitlements.view`,
  `platform_admin.entitlements.manage`,
  `platform_admin.features.view`,
  `platform_admin.features.manage`,
  `platform_admin.audit.view`, and
  `platform_admin.overview.view`.
- Add a `requirePlatformAdminScope()` helper that verifies
  `UserType.PLATFORM_USER` and returns an actor-only platform scope.
- Update permission resolution so platform users are checked against explicit
  platform permissions.
- Use `@PlatformScope()` and `platformBypassScope(...)` only for repository
  operations that intentionally cross schools.
- Add tests proving school admins, organization admins, teachers, parents,
  students, applicants, and pickup delegates cannot access Platform Admin.

## 7. Platform Admin module proposal

Preferred future structure:

```text
src/modules/platform-admin/
  platform-admin.module.ts
  platform-admin-context.ts
  organizations/
    application/
    controller/
    dto/
    infrastructure/
    presenters/
    tests/
  schools/
    application/
    controller/
    dto/
    infrastructure/
    presenters/
    tests/
  provisioning/
    application/
    controller/
    dto/
    infrastructure/
    presenters/
    tests/
  entitlements/
    application/
    controller/
    dto/
    infrastructure/
    presenters/
    tests/
  features/
    application/
    controller/
    dto/
    infrastructure/
    presenters/
    tests/
  overview/
    application/
    controller/
    dto/
    infrastructure/
    presenters/
    tests/
  audit/
    application/
    controller/
    dto/
    infrastructure/
    presenters/
    tests/
```

Reasoning:

- Platform Admin is not a School Dashboard read model. It is a platform-level
  management surface.
- Organizations and Schools can be implemented first using existing schema.
- Provisioning composes Organization, School, IAM, login identity, credentials,
  email, and audit behavior, so it should be isolated from basic CRUD.
- Entitlements and features require new schema later, so they should have
  separate submodules.
- Overview and audit are read surfaces and should not own write-side business
  rules.

First runtime sprint can start with a smaller folder set:

- `platform-admin.module.ts`
- `platform-admin-context.ts`
- `organizations/**`
- `schools/**`

Then add provisioning, entitlements, features, overview, and audit in later
sprints.

## 8. Organization management plan

Future capabilities:

- list organizations
- get organization detail
- create organization
- update organization profile fields available in V1
- activate organization
- suspend organization
- archive organization
- show total schools count
- show active schools count
- support single-school organizations and school groups

Suggested future routes:

- `GET /api/v1/platform-admin/organizations`
- `POST /api/v1/platform-admin/organizations`
- `GET /api/v1/platform-admin/organizations/:organizationId`
- `PATCH /api/v1/platform-admin/organizations/:organizationId`
- `POST /api/v1/platform-admin/organizations/:organizationId/activate`
- `POST /api/v1/platform-admin/organizations/:organizationId/suspend`
- `POST /api/v1/platform-admin/organizations/:organizationId/archive`

Status behavior:

- `ACTIVE` means the organization is operational.
- `SUSPENDED` means the organization is paused from a platform operations
  standpoint.
- `ARCHIVED` means the organization is no longer operational but remains
  retained.
- Runtime status transitions must audit before/after values.
- Archive should be soft and safe. It must not delete organization, school, or
  school-domain data.

What should not happen automatically in the first runtime sprint:

- Do not cascade-suspend schools when an organization is suspended.
- Do not block logins automatically unless a separate auth/scope sprint
  implements and tests it.
- Do not delete memberships, users, students, applications, files, or audit
  logs.
- Do not add billing/payment behavior.

## 9. School management plan

Future capabilities:

- list schools across organizations
- filter schools by organization, status, search text, and created date
- get school detail
- create school under an organization
- update school basic platform profile
- activate school
- suspend school
- archive school
- distinguish platform-level school identity from school dashboard settings
- avoid deleting school data when suspended

Suggested future routes:

- `GET /api/v1/platform-admin/schools`
- `POST /api/v1/platform-admin/organizations/:organizationId/schools`
- `GET /api/v1/platform-admin/schools/:schoolId`
- `PATCH /api/v1/platform-admin/schools/:schoolId`
- `POST /api/v1/platform-admin/schools/:schoolId/activate`
- `POST /api/v1/platform-admin/schools/:schoolId/suspend`
- `POST /api/v1/platform-admin/schools/:schoolId/archive`

Platform school identity should use `School.name`, `School.slug`,
`School.organizationId`, and `School.status`.

School Dashboard settings should remain school-scoped operational settings:

- `SchoolProfile` for branding/location-like school profile data.
- `SchoolLoginSettings` for login domain and username policy.
- `SchoolEmailConnection` and templates for email delivery.
- Settings routes under `/api/v1/settings/*` should not become Platform Admin
  routes.

Suspension and archive must not delete school data. Initial implementation can
store/expose status first, then later add deliberate login/scope enforcement.

## 10. School provisioning and primary admin account plan

Recommended future route:

- `POST /api/v1/platform-admin/school-provisioning`

Future provisioning flow:

1. Create or select organization.
2. Create school under that organization.
3. Create `SchoolProfile` if initial profile fields are supplied.
4. Configure `SchoolLoginSettings` if a login domain is supplied.
5. Create primary school admin `User`.
6. Create active `Membership` for that user with the new `schoolId` and
   `organizationId`.
7. Assign the `school_admin` role, preferably the existing system role unless a
   school-specific role is explicitly created.
8. Generate login email from username and login domain, or use a direct email
   identity when username mode is not used.
9. Provision a temporary password or activation flow.
10. Set `mustChangePassword`.
11. Optionally queue credential delivery if school email is configured and
    active.
12. Audit all sensitive actions.

Recommended future payload shape:

```json
{
  "organization": {
    "mode": "create",
    "organizationId": null,
    "name": "Moazez International Group",
    "slug": "moazez-international"
  },
  "school": {
    "name": "Moazez Primary School",
    "slug": "primary",
    "timezone": "Africa/Cairo",
    "locale": "en"
  },
  "loginIdentity": {
    "loginDomain": "primary.moazez.school"
  },
  "primaryAdmin": {
    "fullName": "School Admin",
    "contactEmail": "admin@example.com",
    "username": "school.admin",
    "phone": "+201000000000"
  },
  "credentials": {
    "deliveryMode": "temporary_password_reveal"
  },
  "entitlement": {
    "studentSeatLimit": 500,
    "startsAt": "2026-09-01T00:00:00.000Z",
    "endsAt": "2027-08-31T23:59:59.000Z"
  }
}
```

Allowed organization modes:

- `create`
- `existing`

Credential delivery modes:

- `temporary_password_reveal`
- `email_if_configured`
- `activation_link` if a future activation-token model is approved

Security requirements:

- Never store raw passwords.
- Hash temporary passwords using the same argon2id policy used by
  `PasswordService`.
- Reveal a temporary password only once in the provisioning response if that
  mode is selected.
- Set `mustChangePassword` for temporary passwords.
- Revoke existing sessions if credentials are regenerated.
- Do not expose `passwordHash`, token data, email provider secrets, or raw
  delivery metadata.

Generated login email conventions:

- Existing settings logic builds login emails as
  `normalizedUsername@normalizedLoginDomain`.
- Duplicate handling must check global `User.email` uniqueness.
- Because `SchoolLoginSettings.loginDomain` is not unique in the current
  schema, provisioning must validate domain and login-email collision before
  commit.
- If contact email is separate from login email, store it in `contactEmail`.

Email delivery readiness:

- `SchoolEmailConnection` must exist and be `ACTIVE` before queued credential
  delivery can run.
- `SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS` exists.
- Credential delivery is school-scoped today, so Platform Admin provisioning
  needs a platform-native orchestration adapter rather than calling
  school-scoped settings use cases blindly.

Audit logging:

- Audit organization creation/update.
- Audit school creation/update.
- Audit login domain configuration.
- Audit primary admin user creation.
- Audit membership/role assignment.
- Audit credential generation.
- Audit email delivery queueing, if used.

## 11. Subscription entitlement and student seat limit plan

This is entitlement/quota control, not billing.

Schools subscribe based on active student seat count. Platform Admin sets:

- allowed student seats
- subscription/entitlement start date
- subscription/entitlement end date
- entitlement status

Out of V1:

- invoices
- payments
- collections
- finance module
- wallet
- marketplace
- enterprise billing engine

Recommended future model:

- `SchoolEntitlement` or `SchoolSubscription`

`SchoolEntitlement` is the preferred V1 name because it avoids implying a
payment engine.

Recommended fields:

- `id`
- `schoolId`
- `status`
- `startsAt`
- `endsAt`
- `studentSeatLimit`
- `gracePeriodEndsAt` optional
- `notes`
- `createdById`
- `updatedById`
- `createdAt`
- `updatedAt`

Recommended status values:

- `TRIALING`
- `ACTIVE`
- `EXPIRED`
- `SUSPENDED`
- `ARCHIVED`

Migration needed:

- Yes. No current `SchoolEntitlement`, `SchoolSubscription`, or equivalent
  model exists in `prisma/schema.prisma`.

Active student count policy:

- Count active seats from current active enrollment state, not historical
  student rows alone.
- Use `Enrollment.status = ACTIVE` as the primary source.
- Also require `Student.status = ACTIVE` and `deletedAt = null` when joining
  students.
- Withdrawn, transferred, completed, archived, or deleted historical
  enrollments should not consume seats if the data supports that safely.
- If a student exists without active enrollment, the future policy must decide
  whether direct active student creation consumes a seat. For V1 enforcement,
  active enrollment is the safer operational source.

Suggested future routes:

- `GET /api/v1/platform-admin/schools/:schoolId/entitlement`
- `PUT /api/v1/platform-admin/schools/:schoolId/entitlement`
- `GET /api/v1/platform-admin/schools/:schoolId/usage`

## 12. Student seat limit enforcement plan

Future enforcement points:

- direct student creation if it creates an active, seat-consuming student state
- enrollment creation
- admissions enroll from accepted application
- transfer or promotion if it creates/activates a new enrollment
- future bulk import/enrollment flow

Current runtime files that will likely need integration later:

- `src/modules/students/students/application/create-student.use-case.ts`
- `src/modules/students/enrollments/application/create-enrollment.use-case.ts`
- `src/modules/students/enrollments/application/shared.ts`
- `src/modules/admissions/applications/application/enroll-application-handoff.use-case.ts`
- `src/modules/students/transfers-withdrawals/application/transfer-student-enrollment.use-case.ts`
- `src/modules/students/transfers-withdrawals/application/promote-student-enrollment.use-case.ts`
- future import commit flows

Phased enforcement:

1. Expose entitlement and usage.
2. Add read-only over-limit reporting.
3. Integrate enforcement into Students, Admissions, Enrollment, and lifecycle
   flows.
4. Add future bulk import enforcement before imports can create active seats.

Lowering entitlement:

- Do not silently deactivate, delete, withdraw, or block existing active
  students when a limit is lowered.
- Report over-limit status.
- Block new active seat additions until usage is at or below the limit or the
  entitlement is increased.

Future error code candidates:

- `platform.entitlement.student_limit_exceeded`
- `platform.entitlement.expired`
- `platform.entitlement.feature_disabled`

These codes are not currently in `ERROR_CATALOG.md`. They should be added only
in the runtime sprint that throws them.

## 13. Feature control plan

Feature control should start as basic school feature entitlement, not advanced
rollout or billing logic.

Recommended feature keys:

- `dashboard`
- `admissions`
- `students`
- `academics`
- `attendance`
- `grades`
- `homework`
- `communication`
- `reinforcement`
- `behavior`
- `teacher_app`
- `student_app`
- `parent_app`
- `applicant_portal`
- `smart_pickup`

Recommended future model:

- `SchoolFeatureEntitlement`

Recommended fields:

- `schoolId`
- `featureKey`
- `enabled`
- `source`
- `createdById`
- `updatedById`
- `createdAt`
- `updatedAt`

Suggested `source` values:

- `PLATFORM_MANUAL`
- `DEFAULT`
- `MIGRATED`

Suggested future routes:

- `GET /api/v1/platform-admin/features`
- `GET /api/v1/platform-admin/schools/:schoolId/features`
- `PATCH /api/v1/platform-admin/schools/:schoolId/features`

Clarifications:

- No percentage rollout in V1.
- No audience rules in V1.
- No A/B testing in V1.
- No plan inheritance complexity in V1.
- Feature display/control should come first.
- Enforcement should be integrated later through explicit guards or services in
  each affected module.

Migration needed:

- Yes. No current `SchoolFeatureEntitlement` model exists.

## 14. Platform Admin overview/dashboard plan

Future Platform Admin overview should be platform-level, not school dashboard
summary.

Suggested future route:

- `GET /api/v1/platform-admin/overview`

Future overview metrics:

- total organizations
- total schools
- active schools
- suspended schools
- archived schools
- total active students
- schools near seat limit
- schools over limit
- schools expiring soon
- feature distribution summary
- recent platform audit activity

This route must be separate from:

- `GET /api/v1/dashboard/summary`

`/api/v1/dashboard/summary` is the school Dashboard read model. Platform Admin
overview is the SaaS/operator overview across organizations and schools.

## 15. Platform audit plan

Suggested future route:

- `GET /api/v1/platform-admin/audit-logs`

Future capability:

- read-only sanitized audit list
- filters by organization
- filters by school
- filters by actor
- filters by module/source
- filters by action
- filters by resource
- filters by date range
- pagination

Safety requirements:

- No raw secrets.
- No passwords, password hashes, temporary passwords, tokens, refresh token
  metadata, or email provider credentials.
- No unsafe PII expansion.
- Do not expose raw `before`/`after` JSON by default.
- Provide a sanitized summary and allow carefully scoped detail only if product
  approves it.

Current `AuditLog` sufficiency:

- Sufficient for an initial read-only platform audit list because it already
  stores actor, user type, organization, school, module, action, resource,
  outcome, and timestamp.
- Needs improved platform action coverage once Platform Admin mutations are
  implemented.
- May need `AuditOutcome.DENIED` later if denied-access audit visibility is
  required.

## 16. Suspension and activation behavior

Expected behavior:

- Organization suspension must not delete data.
- School suspension must not delete data.
- Archive must be soft and safe.
- Status transitions must be audited.
- First runtime sprint may only store and expose status.
- Login/scope blocking for suspended schools should be a deliberate later
  sprint unless the current auth layer is updated and tested safely.

Current gap:

- `OrganizationStatus` and `SchoolStatus` already exist.
- Current guards do not enforce organization/school status.
- Existing tests mostly create active organizations and schools for fixtures.
  They do not establish suspended-school login or route blocking behavior.

Recommended first policy:

- `activate`: set status to `ACTIVE`.
- `suspend`: set status to `SUSPENDED`, retain all data.
- `archive`: set status to `ARCHIVED`, optionally set `deletedAt` only if the
  runtime design explicitly chooses that soft-delete behavior.

Do not cascade destructive changes.

## 17. Security and tenancy plan

Platform Admin security rules:

- Platform routes are platform-scoped.
- Platform routes must not accidentally use school dashboard scope.
- School-scoped users must be denied.
- Organization users must be denied unless a later explicit organization admin
  surface is approved.
- `schoolId` and `organizationId` may appear in Platform Admin payloads because
  Platform Admin manages these resources.
- Secrets must never leak.
- Presenters must avoid raw Prisma payloads.
- Platform bypass must be explicit and tested.
- Platform Admin must not bypass authorization checks.

Implementation implications:

- Create `requirePlatformAdminScope()` instead of reusing
  `requireDashboardScope()` or `requireSettingsScope()`.
- Use `platformBypassScope(...)` only in Platform Admin repositories that need
  cross-school reads/writes.
- Keep controllers thin and use DTOs/presenters.
- Add explicit `@RequiredPermissions(...)` metadata on every Platform Admin
  route.
- Close the current `PLATFORM_USER` permission bypass before relying on route
  permissions.
- Add tests that assert Platform Admin routes require `UserType.PLATFORM_USER`
  and the correct platform permission.

## 18. Testing strategy

Future tests required before Platform Admin can be considered runtime-ready:

- unit tests for presenters
- unit tests for use cases and status transition policies
- security tests denying school admins, organization admins, teachers, parents,
  students, applicants, and pickup delegates
- security tests proving platform permission boundaries
- security tests proving `platformBypassScope(...)` is used only for intended
  cross-school queries
- E2E tests for organization management
- E2E tests for school management
- E2E tests for school provisioning
- E2E tests for primary school admin account creation
- E2E tests for entitlement read/update and usage
- E2E tests for feature control read/update
- tests for student seat enforcement once integrated
- audit tests for all sensitive Platform Admin mutations
- route inventory assertions for deferred billing/payment/invoice routes

Recommended route inventory assertions:

- No `/api/v1/platform-admin/billing/*`
- No `/api/v1/platform-admin/invoices/*`
- No `/api/v1/platform-admin/payments/*`
- No `/api/v1/finance/*`
- No wallet or marketplace routes

## 19. Proposed sprint breakdown

### Sprint 17B - Platform Admin Runtime Shell + Organizations/Schools Management

Goal:

- Add Platform Admin module shell and basic organization/school management.

Expected files/modules:

- `src/modules/platform-admin/platform-admin.module.ts`
- `src/modules/platform-admin/platform-admin-context.ts`
- `src/modules/platform-admin/organizations/**`
- `src/modules/platform-admin/schools/**`
- `src/app.module.ts` import
- platform permission seed updates
- platform access/security tests

Likely migrations:

- None for basic Organization/School CRUD/status.
- Possibly a migration only if platform user role assignment cannot be solved
  safely with current membership/role schema.

Tests:

- organization/school use-case and presenter tests
- E2E organization and school management
- security tests for platform-only access and denied school users

Risks:

- Current `PLATFORM_USER` permission bypass.
- Missing platform user role assignment.
- Accidental use of school dashboard scope.

Dependencies:

- Existing `Organization`, `School`, `Role`, `Permission`, `AuditLog`, and
  platform bypass helpers.

### Sprint 17C - School Provisioning + Primary School Admin Account

Goal:

- Implement atomic school provisioning and primary school admin account
  creation.

Expected files/modules:

- `src/modules/platform-admin/provisioning/**`
- provisioning DTOs and presenters
- platform-native credential creation helper or adapter
- integration with school login identity and user/membership creation patterns

Likely migrations:

- None if using existing `SchoolProfile`, `SchoolLoginSettings`, `User`,
  `Membership`, `Role`, and credential fields.
- Optional migration for activation tokens or login domain uniqueness if
  approved.

Tests:

- provisioning E2E happy path
- duplicate organization/school slug tests
- duplicate username/login email tests
- primary admin membership/role tests
- temporary password one-time response tests
- audit tests

Risks:

- Reusing school-scoped settings use cases that depend on `requireSettingsScope`.
- Exposing temporary passwords beyond the one-time response.
- Missing email connection causing delivery assumptions.

Dependencies:

- Sprint 17B platform route shell and access model.
- Existing settings identity, credentials, email, IAM, and audit foundations.

### Sprint 17D - Subscription Entitlements + Student Seat Usage

Goal:

- Add school entitlement storage and usage reporting.

Expected files/modules:

- `src/modules/platform-admin/entitlements/**`
- entitlement DTOs, use cases, repository, presenter
- usage repository counting active student seats

Likely migrations:

- Add `SchoolEntitlement` and entitlement status enum.
- Add indexes on `schoolId`, `status`, `startsAt`, and `endsAt`.

Tests:

- entitlement CRUD/update E2E
- usage count E2E
- over-limit reporting tests
- platform access/security tests

Risks:

- Incorrect active student count policy.
- Confusing entitlement with billing.
- Lowering limit causing accidental data mutation.

Dependencies:

- Sprint 17B platform route shell.
- Stable Students/Enrollments schema.

### Sprint 17E - Feature Control Foundation

Goal:

- Add basic school feature entitlement display and mutation.

Expected files/modules:

- `src/modules/platform-admin/features/**`
- feature catalog constant or seed
- feature entitlement repository/use cases/presenter

Likely migrations:

- Add `SchoolFeatureEntitlement`.
- Add `SchoolFeatureKey` enum or string field with validation.

Tests:

- feature catalog E2E
- school feature read/update E2E
- security tests
- route inventory tests for no rollout/billing routes

Risks:

- Overbuilding rollout rules.
- Accidentally enforcing features before modules are ready.
- Feature key drift across app-facing modules.

Dependencies:

- Sprint 17B platform shell.
- Approved feature key catalog.

### Sprint 17F - Student Seat Limit Enforcement Integration

Goal:

- Integrate entitlement enforcement into student and enrollment creation flows.

Expected files/modules:

- entitlement checking service
- integration points in Students, Enrollments, Admissions handoff, transfer,
  promotion, and future import commit flows
- error catalog updates

Likely migrations:

- None if Sprint 17D already added entitlement schema.

Tests:

- enforcement unit tests
- Students E2E
- Admissions enroll E2E
- transfer/promotion E2E
- over-limit lowered-entitlement tests
- security and tenancy tests

Risks:

- Blocking existing students after entitlement is lowered.
- Counting historical enrollments as active seats.
- Missing bulk/import entry points.

Dependencies:

- Sprint 17D entitlement model and usage policy.
- Stable student/enrollment lifecycle flows.

### Sprint 17G - Platform Admin Overview/Audit + Final Closeout

Goal:

- Add Platform Admin overview and sanitized platform audit logs, then close the
  Platform Admin foundation.

Expected files/modules:

- `src/modules/platform-admin/overview/**`
- `src/modules/platform-admin/audit/**`
- final closeout audit doc

Likely migrations:

- None for initial overview/audit if existing `AuditLog` is sufficient.
- Possible enum migration if `AuditOutcome.DENIED` is approved.

Tests:

- overview E2E
- platform audit list E2E
- audit sanitization tests
- platform access/security tests
- route inventory tests for deferred billing/payment features

Risks:

- Exposing raw audit JSON with secrets or excessive PII.
- Mixing platform overview with school dashboard summary.
- Treating read-only overview as an analytics builder.

Dependencies:

- Sprints 17B through 17E for organization/school/entitlement/feature data.

## 20. Recommended immediate next sprint

Recommended next sprint:

```text
Sprint 17B - Platform Admin Runtime Shell + Organizations/Schools Management
```

Why:

- It uses the existing `Organization`, `School`, `User`, `Role`,
  `Permission`, and `AuditLog` foundations.
- It establishes the `/api/v1/platform-admin/*` route surface.
- It forces the platform access model and permission gap to be solved before
  sensitive provisioning work begins.
- It avoids prematurely adding subscription schema before module boundaries are
  validated.
- It creates the base for school provisioning, entitlements, features, overview,
  and audit.

## 21. Closeout decision

Sprint 17A does not close Platform Admin implementation.

Sprint 17A defines the implementation contract and phased plan for Platform
Admin Basic. Runtime work has not started. The next sprint should implement the
Platform Admin runtime shell and basic organizations/schools management while
preserving the separation from School Dashboard and avoiding billing scope.
