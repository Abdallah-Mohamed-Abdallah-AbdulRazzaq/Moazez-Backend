# Sprint 11A Identity, Credentials, And Email Delivery Audit

Status: planning audit only
Date: 2026-05-11

Sprint 11A is a documentation-only audit. It does not introduce runtime code,
routes, controllers, DTOs, presenters, use-cases, repositories, Prisma schema
changes, migrations, seeds, tests, package scripts, README edits, ADR edits, or
project structure edits.

Sources reviewed for this audit:

- Governance: `AGENT_CONTEXT_PRIMER.md`, `CLAUDE.md`, `PROJECT_OVERVIEW.md`,
  `ARCHITECTURE_DECISION.md`, `ENGINEERING_RULES.md`, `SECURITY_MODEL.md`,
  `API_CONTRACT_RULES.md`, `TESTING_STRATEGY.md`, `MODULES.md`,
  `USER_TYPES.md`, `V1_SCOPE.md`, `DOMAIN_GLOSSARY.md`,
  `PRISMA_CONVENTIONS.md`, `ERROR_CATALOG.md`, `OBSERVABILITY.md`,
  `README.md`, `docs/phase-5-final-closeout-audit.md`,
  `adr/ADR-0001-multi-tenancy-enforcement.md`, and
  `adr/ADR-0002-behavior-core-module-boundary.md`.
- Current IAM/Auth/Settings: `prisma/schema.prisma`,
  `src/modules/iam/**`, `src/modules/settings/**`, `src/common/guards/**`,
  `src/common/context/**`,
  `src/infrastructure/database/school-scope.extension.ts`,
  `prisma/seeds/01-permissions.seed.ts`,
  `prisma/seeds/02-system-roles.seed.ts`,
  `test/security/tenancy.settings.spec.ts`, and `test/security/**`.
- Student/Parent identity: `src/modules/students/**`,
  `src/modules/student-app/**`, `src/modules/parent-app/**`,
  `docs/sprint-8a-student-app-contract-audit.md`,
  `docs/sprint-9a-parent-app-contract-audit.md`, and
  `prisma/migrations/20260506120000_0017_student_user_identity_foundation/migration.sql`.
- Communication/email/queue infrastructure: `src/modules/communication/**`,
  `src/infrastructure/queue/**`, `src/infrastructure/realtime/**`,
  `src/config/env.validation.ts`, `src/infrastructure/storage/**`,
  `docs/sprint-6c-planning-audit.md`,
  `test/e2e/communication-core-chat.e2e-spec.ts`,
  `test/e2e/communication-realtime-announcements-notifications.e2e-spec.ts`,
  and `test/security/tenancy.communication.spec.ts`.
- Phase closeout: `package.json`, `README.md`, and
  `docs/phase-5-final-closeout-audit.md`.

Repository note: the required reading list still names `DIRECTORY_STRUCTURE.md`,
but that file is not present in the current checkout. The live tree, `MODULES.md`,
and prior audit notes were used for structure context.

## 1. Executive Summary

Phase 5 closed Teacher App, Student App, and Parent App as app-facing
composition layers over the operational core. Those apps can now read core
academic, behavior, reinforcement, communication, student, and guardian data,
but all three depend on authenticated users with the correct user type,
membership, and ownership links. Before starting deferred Cores such as
Schedule, Homework, Pickup, or Notification Center, the backend needs a stable
account/login/credential/email-delivery foundation for accounts created by the
school dashboard.

The school dashboard is the operational source of truth for creating teacher,
student, and parent records and accounts. These users should not self-register
from the apps in V1. The dashboard should collect a stable `username`, generate
a school login email from `username + @ + school login domain`, and keep the
user's personal email or contact email as a separate delivery/contact field.

Personal email should not be the login identity because it is user-owned,
mutable, often shared by families, can collide across children or guardians,
and can change independently of the school account lifecycle. Login identity
must be school-owned, predictable, scoped to school policy, auditable, and
decoupled from inbox delivery.

Credential provisioning and email delivery must be centralized. Today a school
admin can create or invite a settings user with a nullable password hash, and
Teacher/Student/Parent app ownership can depend on links such as
`TeacherSubjectAllocation.teacherUserId`, `Student.userId`, and
`Guardian.userId`. Without a provisioning foundation, those accounts can exist
in the data model but fail login. Sprint 11B should therefore start with the
username and login identity foundation after this audit is reviewed and
committed.

## 2. Current Code Findings

### Governance And Phase Closeout

- `PROJECT_OVERVIEW.md`, `ARCHITECTURE_DECISION.md`, and `MODULES.md` confirm
  that the school dashboard is the operational source of truth and app-facing
  modules consume core modules rather than redefining them.
- `SECURITY_MODEL.md` requires actor, user type, active membership/scope,
  permissions, and resource ownership checks. It also requires audit logging for
  auth, role, settings, and user status changes.
- `PRISMA_CONVENTIONS.md` requires UUID primary keys, snake_case mappings,
  tenant scoped `schoolId` where relevant, soft delete where business history is
  needed, and migration-only schema changes.
- `OBSERVABILITY.md` explicitly says passwords are never logged and PII such as
  email should be redacted in application logs.
- `docs/phase-5-final-closeout-audit.md` confirms Teacher App, Student App, and
  Parent App are closed out, app modules remain composition layers, and
  Schedule, Homework, Pickup, Notification Center, Add Child, Applicant Portal,
  and related app expansion remain deferred.
- `package.json` confirms `npm run verify:phase5` exists and delegates to
  `npm run verify:sprint9f`.

### CreateUserDto And InviteUserDto

- `src/modules/settings/users/dto/create-user.dto.ts` defines
  `CreateUserDto` with `fullName`, `email`, and `roleId`.
- The same file defines `InviteUserDto` with the same `fullName`, `email`, and
  `roleId` fields.
- Neither DTO accepts `username`, `contactEmail`, `password`, `mustChangePassword`,
  or credential provisioning options.
- Both DTOs validate `email` as an email address, so the current contract treats
  email as the login identifier.

### CreateUserUseCase

- `src/modules/settings/users/application/create-user.use-case.ts` normalizes
  `command.email` using `trim().toLowerCase()`.
- It checks global uniqueness with `UsersRepository.findUserByEmail`.
- It loads an assignable role, splits the full name, derives `userType` from the
  role key, and calls `UsersRepository.createUserWithMembership`.
- It sets `status: UserStatus.ACTIVE` and `passwordHash: null`.
- It records an `iam.user.create` audit log with `invited: false`.
- Result: a user can be active and have an active membership while still having
  no usable password credential.

### InviteUserUseCase

- `src/modules/settings/users/application/invite-user.use-case.ts` follows the
  same email normalization, uniqueness check, role lookup, full-name split, and
  role-key-to-user-type derivation.
- It sets `status: UserStatus.INVITED` and `passwordHash: null`.
- It records an `iam.user.create` audit log with `invited: true`.
- No activation token, invite token, email send, queue job, or credential record
  is created by this use-case.

### Reset Password And Resend Invite

- `src/modules/settings/users/application/reset-password.use-case.ts` is a
  placeholder. It hashes a random `reset:<userId>:<uuid>` string and discards
  the hash. It does not store a token, update `passwordHash`, send email, enqueue
  delivery, or create a usable reset link.
- `src/modules/settings/users/application/resend-invite.use-case.ts` only
  validates that the user is still `INVITED`, touches the user update timestamp,
  records audit, and returns the user presenter. It does not send an invite or
  create a credential token.
- `src/modules/settings/users/controller/users.controller.ts` exposes
  `POST /api/v1/settings/users/:id/reset-password` and
  `POST /api/v1/settings/users/:id/resend-invite`, but the current behavior is
  not a complete credential delivery flow.

### LoginUseCase And Auth

- `src/modules/iam/auth/dto/login.dto.ts` accepts `email` and `password`.
- `src/modules/iam/auth/application/login.use-case.ts` calls
  `AuthRepository.findUserByEmail(command.email)`.
- If no user is found or `user.passwordHash` is null, login records a failed
  audit log and throws `auth.credentials.invalid`.
- Password verification uses `PasswordService.verify`, which wraps argon2id per
  `SECURITY_MODEL.md`.
- If the user is not `ACTIVE`, login throws `auth.account.disabled`.
- The current login response returns `id`, `email`, `firstName`, `lastName`, and
  `userType`; it has no `username`, `contactEmail`, `mustChangePassword`, or
  credential-state field.

### User Type From Role Key

- `src/modules/settings/users/domain/user-type-from-role.ts` maps role key
  `teacher` to `UserType.TEACHER`, `parent` to `UserType.PARENT`, `student` to
  `UserType.STUDENT`, and every other role key to `UserType.SCHOOL_USER`.
- `CreateUserUseCase` and `InviteUserUseCase` both use this mapping.
- `UpdateUserUseCase` also updates `userType` when role changes, using the same
  mapping.

### User Model Fields

- `prisma/schema.prisma` model `User` currently has `id`, `email`, `phone`,
  `passwordHash`, `firstName`, `lastName`, `userType`, `status`, `lastLoginAt`,
  timestamps, and `deletedAt`.
- `email` is globally unique.
- `phone` is globally unique when present.
- `passwordHash` is nullable.
- There is no `username`.
- There is no `contactEmail`.
- There is no `mustChangePassword`.
- There is no `passwordChangedAt`.
- There is no `passwordProvisionedAt`.
- There is no `credentialVersion`.
- There is no `lastCredentialDeliveryAt`.
- There is no activation token, reset token, credential delivery batch, or
  credential delivery recipient model.

### Student, Guardian, And StudentGuardian Identity

- `Student.userId` exists as nullable and unique in `prisma/schema.prisma` and
  was added by
  `prisma/migrations/20260506120000_0017_student_user_identity_foundation/migration.sql`.
- `Guardian.userId` exists as nullable in `prisma/schema.prisma` and is indexed.
  It relates guardians to `User` through relation `GuardianUser`.
- `StudentGuardian` exists as the normalized school-scoped link between
  `Student` and `Guardian`, with unique `[schoolId, studentId, guardianId]`.
- `src/modules/students/students/application/create-student.use-case.ts` creates
  student records without account linkage; the selected student record shape in
  `StudentsRepository` does not include `userId`.
- `src/modules/students/guardians/application/create-guardian.use-case.ts`
  explicitly creates guardians with `userId: null`.
- `src/modules/students/guardians/infrastructure/guardians.repository.ts`
  creates and manages guardian records and `StudentGuardian` links, but does not
  create or link parent login accounts.

### Teacher, Student, And Parent App Ownership

- Teacher App access uses the authenticated actor id as `teacherUserId`, requires
  `UserType.TEACHER`, and validates ownership through
  `TeacherSubjectAllocation.teacherUserId`.
- `TeacherSubjectAllocation` is a core Academics model, not a teacher profile
  table. Teacher allocations remain separate from account creation.
- Student App access resolves `UserType.STUDENT` through
  `StudentAppStudentReadAdapter.findLinkedStudentByUserId`, which requires
  `Student.userId = actor.id`, active `Student`, active `User`, and active
  enrollment.
- Parent App access resolves `UserType.PARENT` through
  `ParentAppGuardianReadAdapter.listCurrentSchoolGuardiansByUserId`, which
  requires `Guardian.userId = actor.id`, then uses `StudentGuardian` and active
  enrollments to establish child ownership.
- Therefore Student and Parent App runtime access is now link-aware, but the
  dashboard has no complete account creation/linking/provisioning workflow for
  those links.

### Settings Users Presentation

- `src/modules/settings/users/presenters/users.presenter.ts` returns `id`,
  `fullName`, `email`, `roleId`, `roleName`, `status`, `lastActiveAt`,
  `invitedAt`, and `lastInviteSentAt`.
- It does not expose username, contact email, credential status, password
  provisioned state, delivery state, or must-change-password state.

### Mail, Queue, And Communication Infrastructure

- No runtime mail provider module, SMTP service, SendGrid/Mailgun/SES adapter,
  school email connection controller, or email campaign controller was found.
- `src/config/env.validation.ts` validates `APP_URL`, `DATABASE_URL`,
  `REDIS_URL`, JWT secrets, storage settings, seed flag, and log level. It does
  not validate SMTP/provider settings or an email secret encryption key.
- `src/infrastructure/queue/bullmq.service.ts` provides a BullMQ queue/worker
  wrapper over `REDIS_URL`.
- `src/modules/communication/application/communication-notification-queue.service.ts`
  enqueues announcement notification generation jobs on the
  `communication-notifications` queue.
- `src/modules/communication/infrastructure/communication-notification-generation.worker.ts`
  creates a queue worker and bridges jobs into `RequestContext`.
- Communication notification generation currently creates in-app notification
  rows and `IN_APP` delivery rows. It does not send external email.

### Templates And Settings

- `prisma/schema.prisma` has `NotificationTemplate` and
  `NotificationTemplateChannelState` models under Settings. `NotificationTemplate`
  includes title/message fields, email subject fields, SMS fields, variables, and
  status.
- `src/modules/settings/settings.module.ts` currently imports Branding, Roles,
  Permissions, Users, Security, and Overview only. There is no Settings
  templates module or email settings module wired at runtime.
- `IntegrationProvider` and `IntegrationConnection` models exist with JSON
  configuration, but no runtime Settings integration/email provider controller is
  wired. The model does not by itself prove encrypted secret storage.
- Notification templates may inform future variable conventions, but account
  access emails and school email campaigns need separate email-specific template
  models because they require external inbox delivery, branding, recipient
  previews, delivery logs, unsubscribe/suppression policy later, and credential
  secrecy rules.

### Permissions And Tests

- `prisma/seeds/01-permissions.seed.ts` contains `settings.users.view` and
  `settings.users.manage`, but no credential-specific settings permissions and
  no settings email/provider/template/campaign permissions.
- `prisma/seeds/02-system-roles.seed.ts` grants school admin broad school-level
  permissions. Teacher, parent, and student roles have narrow app/core read
  permissions and should not manage credentials or email settings.
- `test/security/tenancy.settings.spec.ts` exists and checks settings branding,
  security settings, user status cross-school mutation safety, role mutation
  safety, and permission denial.
- `test/security/tenancy.iam.spec.ts` is not present as a separate file.
- App closeout e2e/security tests create teacher, student, and parent users with
  explicit `passwordHash` in fixtures, proving tests can log in but not proving a
  dashboard provisioning path exists.

## 3. Confirmed Gaps

- Users can be created without usable credentials because Create User and Invite
  User both store `passwordHash: null`.
- Login fails when `passwordHash` is null.
- Teacher, Student, and Parent app accounts may exist but cannot sign in unless
  a password hash was provisioned by seed/test/manual setup.
- Personal/contact emails and login emails are not separated.
- No `username` field or username policy exists.
- No school login domain model exists.
- No login email generation flow exists.
- No dashboard-driven credential generation flow exists.
- No persisted activation/set-password token flow exists.
- No persisted forgot-password or reset-password token flow exists.
- No must-change-password flow exists.
- No one-time temporary credential reveal model exists.
- No bulk credential provisioning or credential status list exists.
- No recipient preview/dry-run exists.
- No school SMTP/provider configuration runtime exists.
- No encrypted school email secrets model exists.
- No Settings email connection/test/activate/disable endpoints exist.
- No account credential delivery model exists.
- No queue-backed external email delivery worker exists.
- No general school email campaign model exists.
- No generic email campaign endpoints exist.
- Existing communication announcements are in-app Communication core; they are
  not external inbox email campaigns.
- Existing notification templates cannot be reused wholesale for credential
  delivery because credential emails need stricter password/token handling and
  external delivery audit.

## 4. Proposed Conceptual Model

The future runtime should separate login identity, contact identity, and domain
profiles.

### Login Identity

- `username`: school-collected, normalized, policy-validated login handle.
- Generated login email: `normalizedUsername + @ + schoolLoginDomain`.
- User type: `TEACHER`, `STUDENT`, `PARENT`, or school/admin types.
- Role and membership: active school membership and role key determine
  authorization and app access.
- Credential state: missing, activation pending, temporary password issued,
  must change password, active, disabled, expired, or locked as later needed.

### Contact Identity

- `contactEmail`: personal or delivery email for the user.
- Guardian email: existing `Guardian.email` can remain a contact field for the
  guardian domain profile.
- Teacher contact email: future teacher profile/contact field can be separate
  from login identity.
- Delivery recipient email: resolved recipient address at send time, stored on
  delivery recipient logs for audit and troubleshooting.

### Domain Profile

- Teacher account: a `User` with `UserType.TEACHER`, active membership, teacher
  role, and teacher allocations in Academics. Teacher allocations remain
  separate.
- Student record: core `Student` record linked by nullable unique
  `Student.userId`.
- Guardian record: core `Guardian` record linked by nullable `Guardian.userId`.
- StudentGuardian links: normalized ownership relation from guardian to student.
- Enrollment and classroom ownership: active enrollment remains the source for
  Student App and Parent App classroom/grade/section ownership.

## 5. Username And Login Email Policy

Recommended future schema direction:

- Add `User.username`.
- Add `User.contactEmail`, or an equivalent contact/delivery email field if the
  project chooses a different name.
- Keep `User.email` as the generated login email because it is already globally
  unique and used by LoginUseCase, AuthRepository, presenters, tests, and seeds.
  This is the least-breaking path.
- Generate `User.email` as:

```text
normalizedUsername + "@" + schoolLoginSettings.loginDomain
```

Example:

```text
ahmed.ali@school-domain.sa
```

Policy requirements:

- Do not use the raw Arabic school display name directly as an email domain.
- Require an explicit, validated school login domain setting.
- `SchoolLoginSettings` should hold `schoolId`, `loginDomain`,
  `usernamePolicy`, allowed characters, reserved usernames, and status.
- Login domain status should support at least `DRAFT`, `ACTIVE`, `DISABLED`, and
  potentially `VERIFIED` if domain verification is added later.

Uniqueness:

- `username` should be unique per school or per login domain.
- Generated login email should remain globally unique.
- If login domains can be shared across schools in the same organization, make
  uniqueness `[loginDomain, username]`.
- If each school owns exactly one login domain, `[schoolId, username]` plus
  unique `User.email` is acceptable.

Normalization and validation:

- Lowercase.
- Trim.
- No spaces.
- No unsafe symbols.
- Allow letters, numbers, dots, underscores, and hyphens only if product accepts
  them.
- Reject consecutive dots.
- Reject leading or trailing dot, underscore, or hyphen unless explicitly
  approved.
- Reject reserved words such as `admin`, `root`, `support`, `help`, `security`,
  `postmaster`, `abuse`, `billing`, `finance`, `moazez`, and school/system
  reserved aliases.
- Use deterministic normalization for availability checks and creation.

Future runtime endpoint:

- `GET /api/v1/settings/users/username-availability?username=...`

The availability endpoint should validate policy, normalize the candidate,
return the generated login email preview when possible, and never leak
cross-school user existence beyond the current school scope.

## 6. Account Linking Policy

### Teacher

- Teacher is usually already a `User` through Settings Users.
- Teacher account requires credential provisioning before app login.
- Teacher account requires active membership and teacher role.
- `userTypeFromRoleKey('teacher')` already maps to `UserType.TEACHER`.
- Teacher allocations remain separate in Academics through
  `TeacherSubjectAllocation.teacherUserId`.
- Allocations should not be used as credential state.

### Student

- Student record is created in the Students module.
- Student login account is created or linked later by an approved dashboard flow.
- `Student.userId` links the student domain record to `User`.
- Linked `User.userType` must be `STUDENT`.
- Role key must map to student through the existing role-key mapping.
- Active enrollment still controls Student App ownership and classroom context.
- Student account creation/linking must not infer identity from name, personal
  email, student number, or guardian records alone.

### Parent

- Guardian record is created in the Students/Guardians module.
- Guardian is linked to student through `StudentGuardian`.
- Parent login account is created or linked later by an approved dashboard flow.
- `Guardian.userId` links the guardian domain record to `User`.
- Linked `User.userType` must be `PARENT`.
- Parent App ownership uses `Guardian.userId -> StudentGuardian -> active
  Enrollment`.
- Parent access must support multiple linked students and, when future
  cross-school parent behavior is approved, must not weaken dashboard school
  scope rules.

## 7. Credential Provisioning Policy

Default path:

- Activation/set-password links should be the recommended default.
- The dashboard creates or links the account, then creates a hashed activation
  token, queues delivery to `contactEmail`, and marks credential state as
  activation pending.
- Users set their own password through an activation endpoint before regular
  login.

Temporary generated password option:

- Temporary generated passwords may be supported only as an explicit
  admin-controlled option.
- Generated passwords must be cryptographically random and not deterministic.
- Readable prefixes such as school code or year may be allowed for usability,
  but must not be treated as security.
- Never derive passwords only from name, id, academic year, student number,
  phone, national id, or classroom.
- Store only the password hash.
- Show a temporary password once only.
- Do not re-display a generated temporary password.
- Mark `mustChangePassword = true`.
- Require password change on first login or before issuing normal app sessions,
  depending on the final auth policy.

Credential metadata to add in a future runtime sprint:

- `mustChangePassword`.
- `passwordChangedAt`.
- `passwordProvisionedAt`.
- `credentialVersion` or an equivalent session invalidation strategy.
- `lastCredentialDeliveryAt`.

Operational flows to plan:

- Regeneration should revoke old sessions.
- User self-change-password endpoint.
- Admin set-password endpoint.
- Admin generate/regenerate temporary password endpoint.
- Bulk generation.
- Dry-run/preview before bulk generation.
- Credential status list.
- Audit logs for all sensitive credential operations.

## 8. Proposed Credential APIs For Future Runtime

Do not implement these in Sprint 11A. Proposed Settings/IAM endpoints:

- `GET /api/v1/settings/users/credentials/status`
- `POST /api/v1/settings/users/:userId/credentials/generate`
- `POST /api/v1/settings/users/:userId/credentials/set`
- `POST /api/v1/settings/users/:userId/credentials/regenerate`
- `POST /api/v1/settings/users/credentials/bulk-preview`
- `POST /api/v1/settings/users/credentials/bulk-generate`
- `POST /api/v1/auth/change-password`
- `POST /api/v1/auth/activate`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

Account linking endpoints to consider:

- `POST /api/v1/students-guardians/students/:studentId/account`
- `POST /api/v1/students-guardians/guardians/:guardianId/account`

Safer boundary alternative:

- Keep creation/provisioning in Settings/IAM and call Students repositories only
  through explicit use-cases:
  - `POST /api/v1/settings/users/student-accounts`
  - `POST /api/v1/settings/users/parent-accounts`
  - `POST /api/v1/settings/users/:userId/link-student`
  - `POST /api/v1/settings/users/:userId/link-guardian`

The safer boundary is likely Settings/IAM as orchestrator plus Students as the
domain source of truth for `Student.userId`, `Guardian.userId`, and
`StudentGuardian`.

## 9. School Email Provider Settings

Future runtime should add school-specific outbound email provider configuration
from the dashboard.

Design requirements:

- Do not rely only on backend `.env` for school email delivery.
- `.env` should provide only global fallback settings and encryption key
  material.
- Support SMTP first.
- Leave room for SendGrid, Mailgun, SES, or custom provider adapters later.
- Store provider secrets encrypted, not plain JSON.
- Never log provider secrets.
- Enforce school scope for all reads and mutations.
- Audit all provider configuration changes.

Provider state:

- `DRAFT`
- `VERIFIED`
- `ACTIVE`
- `DISABLED`
- `FAILED`

Future endpoints:

- `GET /api/v1/settings/email/connection`
- `PUT /api/v1/settings/email/connection`
- `POST /api/v1/settings/email/connection/test`
- `POST /api/v1/settings/email/connection/activate`
- `POST /api/v1/settings/email/connection/disable`

Implementation notes for future runtime:

- Test-send should enqueue or execute a bounded test path that never exposes
  decrypted secrets to controllers.
- Activation should require a successful verification/test state.
- Disabling a connection should prevent future queued external email sends for
  that school unless a global fallback is explicitly approved.
- Provider changes should record redacted before/after audit details.

## 10. Email Templates And Branding

Future school email templates should be separate from in-app announcement bodies
and separate from generic notification templates unless a shared rendering
engine is introduced behind distinct models.

School-controlled branding:

- Logo.
- Title.
- Subtitle.
- Body.
- Footer.
- Social links.
- Support contact.

Supported variables should include:

- `{{school.name}}`
- `{{school.logoUrl}}`
- `{{user.fullName}}`
- `{{user.username}}`
- `{{user.loginEmail}}`
- `{{credential.activationUrl}}`
- `{{credential.temporaryPassword}}` only when temporary password mode is enabled
- `{{support.email}}`
- `{{social.website}}`
- `{{social.facebook}}`
- `{{social.instagram}}`
- `{{social.x}}`

Requirements:

- Template preview endpoint must be planned.
- Missing variables must be reported before sending.
- Unsafe or unknown variables should fail preview/send validation.
- Temporary password variables must be disabled unless the sending mode
  explicitly includes temporary password delivery.
- Credential templates should never be used to re-render old generated
  passwords after the one-time reveal window closes.

Future endpoints:

- `GET /api/v1/settings/email/templates`
- `GET /api/v1/settings/email/templates/:key`
- `PUT /api/v1/settings/email/templates/:key`
- `POST /api/v1/settings/email/templates/:key/preview`
- `POST /api/v1/settings/email/templates/:key/reset-default`

## 11. Credential Delivery

Credential delivery sends account access information to users' personal/contact
emails. It is distinct from creating the account and distinct from in-app
announcements.

Design requirements:

- Prefer activation links.
- Include temporary password only when explicitly selected by an authorized
  admin and only at first send/reveal time.
- Use queue-backed sending.
- Do not block HTTP requests while sending many emails.
- Add recipient preview/dry-run.
- Add delivery logs.
- Add per-recipient status.
- Do not expose passwords after initial send.
- Skip users without a sendable `contactEmail` unless a custom email recipient
  is intentionally provided.

Supported delivery audiences:

- One user.
- Selected users.
- Teachers only.
- Students only.
- Parents only.
- Missing-password users.
- Users with temporary passwords.
- Role keys.
- User types.
- Classroom, grade, or section based audiences where ownership resolution is
  safe.
- Custom email.

Future endpoints:

- `POST /api/v1/settings/account-delivery/preview-recipients`
- `POST /api/v1/settings/account-delivery/send`
- `GET /api/v1/settings/account-delivery/batches`
- `GET /api/v1/settings/account-delivery/batches/:batchId`
- `GET /api/v1/settings/account-delivery/batches/:batchId/recipients`

## 12. General School Email Campaigns

General school email campaigns should be modeled separately from in-app
Announcements.

Boundary:

- Announcements remain Communication core and are in-app school communication.
- Email Campaigns are external inbox delivery.
- Do not couple email campaigns directly to Communication notifications unless a
  later architecture decision approves the integration.

Design requirements:

- Support preview before send.
- Queue-backed sending.
- Delivery status and failure tracking.
- Recipient list stored or snapshot for audit.
- Campaign content and rendered recipient content should avoid storing sensitive
  credentials.

Supported target audiences:

- Custom email.
- Selected users.
- Teachers.
- Students.
- Parents.
- Classroom, grade, or section audiences.
- Users with `contactEmail`.

Future endpoints:

- `POST /api/v1/settings/email/campaigns/preview`
- `POST /api/v1/settings/email/campaigns`
- `GET /api/v1/settings/email/campaigns`
- `GET /api/v1/settings/email/campaigns/:campaignId`
- `GET /api/v1/settings/email/campaigns/:campaignId/recipients`
- `POST /api/v1/settings/email/campaigns/:campaignId/cancel`

Cancellation should only be allowed for queued or scheduled campaigns that have
not been sent.

## 13. Proposed Data Model For Future Runtime

No schema changes are made in Sprint 11A. Future runtime sprints should use
Prisma conventions: UUID primary keys, snake_case mappings, timestamps,
tenant-scoped `schoolId` where relevant, indexes for hot paths, soft delete only
where business history needs it, and migration-only schema changes.

### Potential User Fields

Purpose: extend the IAM user as login identity and credential state.

Key fields:

- `username String?`
- `contactEmail String? @map("contact_email")`
- `mustChangePassword Boolean @default(false) @map("must_change_password")`
- `passwordChangedAt DateTime? @map("password_changed_at")`
- `passwordProvisionedAt DateTime? @map("password_provisioned_at")`
- `credentialVersion Int @default(1) @map("credential_version")`
- `lastCredentialDeliveryAt DateTime? @map("last_credential_delivery_at")`

Tenancy and constraints:

- `User` itself is not school-scoped today because it can participate in
  memberships. Username uniqueness should be enforced through login domain/school
  settings or a dedicated account identity table if needed.
- Keep `email` globally unique as generated login email.
- Add indexes on `username`, `contactEmail`, credential status fields if used in
  status lists, and `deletedAt`.

Audit:

- Audit username changes, contact email changes, credential provision,
  credential reset/regeneration, and must-change-password state changes.

### SchoolLoginSettings

Purpose: per-school login domain and username policy.

Key fields:

- `id`
- `schoolId`
- `loginDomain`
- `usernamePolicy Json`
- `allowedCharacters String?`
- `reservedUsernames String[]`
- `status`
- `createdAt`, `updatedAt`
- `updatedById`

Tenancy and scope:

- `schoolId` required.
- Register in `SCHOOL_SCOPED_MODELS`.
- Unique `[schoolId]`.
- Unique `loginDomain` if login domains may not be shared.
- Index `[schoolId, status]`.
- No soft delete needed unless domain history is required.

Audit:

- Audit create/update/activate/disable and include redacted policy deltas.

### SchoolEmailConnection

Purpose: school-specific outbound email provider configuration.

Key fields:

- `id`
- `schoolId`
- `provider`
- `status`
- `fromEmail`
- `fromName`
- `replyToEmail`
- `encryptedSecret`
- `configuration Json?` for non-secret settings only
- `lastTestAt`
- `lastTestStatus`
- `lastErrorCode`
- `lastErrorMessage`
- `createdAt`, `updatedAt`
- `updatedById`

Tenancy and scope:

- `schoolId` required.
- Register in `SCHOOL_SCOPED_MODELS`.
- Unique `[schoolId]` for one active connection model, or unique
  `[schoolId, provider]` if multi-provider drafts are allowed.
- Index `[schoolId, status]`.
- No soft delete required if a single connection row is updated; soft delete may
  be useful if multiple connection records are retained.

Audit:

- Audit configuration changes, test-send, activation, disable, and failures.
- Never include decrypted secrets in audit.

### SchoolEmailTemplate

Purpose: external email templates with branding and variable validation.

Key fields:

- `id`
- `schoolId`
- `key`
- `name`
- `subject`
- `htmlBody`
- `textBody`
- `variables String[]`
- `branding Json?`
- `status`
- `createdAt`, `updatedAt`
- `updatedById`

Tenancy and scope:

- `schoolId` required.
- Register in `SCHOOL_SCOPED_MODELS`.
- Unique `[schoolId, key]`.
- Index `[schoolId, status]`.
- Soft delete optional; template history/versioning may be better than soft
  delete.

Audit:

- Audit template create/update/reset-default/activation.
- Avoid storing temporary password render outputs in template audit.

### EmailDeliveryBatch

Purpose: queued external email send batch for credential delivery or campaigns.

Key fields:

- `id`
- `schoolId`
- `type` such as `ACCOUNT_DELIVERY` or `CAMPAIGN`
- `status`
- `templateKey`
- `subjectSnapshot`
- `requestedById`
- `recipientCount`
- `sendableCount`
- `skippedCount`
- `queuedAt`
- `startedAt`
- `completedAt`
- `failedAt`
- `metadata Json?`
- timestamps

Tenancy and scope:

- `schoolId` required.
- Register in `SCHOOL_SCOPED_MODELS`.
- Index `[schoolId, createdAt]`, `[schoolId, status]`, `[schoolId, type]`.
- Soft delete not recommended for delivery audit.

Audit:

- Audit batch preview and send request.
- Do not include raw temporary passwords.

### EmailDeliveryRecipient

Purpose: per-recipient delivery state and provider result.

Key fields:

- `id`
- `schoolId`
- `batchId`
- `userId`
- `recipientEmail`
- `recipientType`
- `status`
- `provider`
- `providerMessageId`
- `errorCode`
- `errorMessage`
- `attemptedAt`
- `sentAt`
- `deliveredAt`
- `failedAt`
- `skippedReason`
- `metadata Json?`
- timestamps

Tenancy and scope:

- `schoolId` required.
- Register in `SCHOOL_SCOPED_MODELS`.
- Unique `[batchId, recipientEmail]` or `[batchId, userId]` depending on custom
  email semantics.
- Index `[schoolId, batchId]`, `[schoolId, status]`, `[userId]`,
  `[providerMessageId]`.
- No soft delete for audit integrity.

Audit:

- Delivery status is operational audit. Do not store raw credential values.

### CredentialDeliveryBatch

Purpose: optional specialized batch if credential delivery needs stricter
metadata than generic email delivery.

Key fields:

- `id`
- `schoolId`
- `emailDeliveryBatchId`
- `mode` such as `ACTIVATION_LINK` or `TEMPORARY_PASSWORD`
- `credentialAction`
- `requestedById`
- `previewSnapshot Json?`
- timestamps

Tenancy and scope:

- `schoolId` required.
- Register in `SCHOOL_SCOPED_MODELS`.
- Index `[schoolId, createdAt]`, `[schoolId, mode]`.
- No soft delete recommended.

Audit:

- Audit requested mode and counts only. No raw passwords.

### AccountActivationToken / PasswordResetToken

Purpose: hashed, expiring activation/reset tokens.

Key fields:

- `id`
- `schoolId`
- `userId`
- `tokenHash`
- `purpose`
- `expiresAt`
- `usedAt`
- `revokedAt`
- `createdById`
- `createdAt`

Tenancy and scope:

- `schoolId` required for school accounts.
- Register in `SCHOOL_SCOPED_MODELS` unless a platform-level token type is
  introduced.
- Unique `tokenHash`.
- Index `[schoolId, userId, purpose]`, `[expiresAt]`, `[usedAt]`, `[revokedAt]`.
- No soft delete; tokens should be invalidated with explicit `usedAt` or
  `revokedAt`.

Audit:

- Audit token creation, use, expiration if surfaced, and revocation.
- Never store raw tokens in DB or logs.

## 14. Security And Privacy Requirements

- No raw passwords in DB.
- No raw passwords in logs.
- No raw passwords in audit details.
- No SMTP/API secrets in logs.
- Email provider secrets encrypted at rest.
- Passwords shown once only.
- Activation/reset tokens hashed in DB.
- Activation/reset tokens expire.
- Activation/reset tokens are single use.
- Rate limiting for activation, reset, forgot-password, and change-password
  endpoints.
- Bulk operations require explicit permission and audit.
- School admins cannot target users outside current school scope.
- Cross-school guessed user IDs return safe 404 where applicable.
- Disabled users are skipped unless explicitly reactivated by an authorized flow.
- Session invalidation on credential reset/regeneration.
- Use `RequestContext` and `schoolScope`.
- No direct Prisma in controllers.
- Repositories/use-cases only.
- Use DTOs and presenters for contracts.
- Redact personal/contact email and provider secrets in application logs.
- Do not expose password hashes, token hashes, provider secret metadata, session
  ids, or raw storage identifiers through Settings user/email APIs.

## 15. Permissions And Roles

Recommended future permission codes:

- `settings.users.credentials.view`
- `settings.users.credentials.manage`
- `settings.users.credentials.bulk_manage`
- `settings.email.connection.view`
- `settings.email.connection.manage`
- `settings.email.templates.view`
- `settings.email.templates.manage`
- `settings.email.delivery.send`
- `settings.email.delivery.view`
- `settings.email.campaigns.create`
- `settings.email.campaigns.view`
- `settings.email.campaigns.manage`

Default role recommendations:

- `school_admin`: all credential and school email permissions.
- `school_principal`: likely view permissions and possibly delivery send,
  depending on school policy.
- `school_registrar`: possibly student/parent credential provisioning only, but
  this needs explicit product approval because current permissions are not
  resource-subtyped by user type.
- `teacher`: no credential or school email settings management.
- `student`: no credential or school email settings management.
- `parent`: no credential or school email settings management.
- `platform_super_admin` and `organization_admin`: follow existing governance,
  but provider secret visibility should remain redacted even for high-level
  actors.

Future design note: if registrar permissions are limited to students/parents,
the backend should enforce user-type restrictions in use-cases, not only by
permission string naming.

## 16. Error Codes

Recommended future additions to `ERROR_CATALOG.md`:

- `iam.user.username_taken`
- `iam.user.username_invalid`
- `iam.user.login_domain_missing`
- `iam.credentials.already_set`
- `iam.credentials.missing_contact_email`
- `iam.credentials.password_policy_failed`
- `iam.credentials.token_expired`
- `iam.credentials.token_invalid`
- `iam.credentials.must_change_password`
- `iam.credentials.delivery_not_allowed`
- `iam.credentials.temporary_password_unavailable`
- `settings.email.connection_missing`
- `settings.email.connection_not_verified`
- `settings.email.connection_test_failed`
- `settings.email.connection_disabled`
- `settings.email.secret_encryption_failed`
- `settings.email.template_invalid`
- `settings.email.template_missing_variable`
- `settings.email.delivery_no_recipients`
- `settings.email.delivery_recipient_not_sendable`
- `settings.email.delivery_batch_not_cancellable`
- `settings.email.campaign_not_cancellable`

Suggested status mapping:

- Invalid username or template variable: 400 or 422 depending on DTO vs semantic
  validation.
- Username taken: 409.
- Missing login domain or connection: 404 or 422 depending on whether setup is
  required before action.
- Token invalid/expired: 401 or 410 depending on final auth semantics.
- Must change password: 403 if normal login cannot continue, or 409 if used as a
  state conflict.
- No recipients: 422.
- Not cancellable: 409.

## 17. Recommended Sprint Breakdown

### Sprint 11B - Username + Login Identity Foundation

- Schema migration for `username`, `contactEmail`, and `SchoolLoginSettings`.
- Login email generation.
- Username normalization and availability endpoint.
- CreateUser/InviteUser contract update.
- Preserve `User.email` as generated login email unless a migration review
  chooses a safer alternative.
- Tests/security for school scope, uniqueness, validation, and backward
  compatibility.

### Sprint 11C - Account Linking + Credential Provisioning

- Student account create/link.
- Guardian parent account create/link.
- Credential generate/set/regenerate.
- Activation/set-password token flow.
- Temporary password option with one-time reveal.
- `mustChangePassword`.
- Change password.
- Credential status and bulk preview/generate.
- Session invalidation strategy through `credentialVersion` or refresh-session
  revocation.
- Tests/security.

### Sprint 11D - School Email Provider + Template Engine

- `SchoolEmailConnection`.
- Encrypted secrets.
- Test/activate/disable provider.
- Template CRUD and preview.
- Branding/logo/social links.
- Missing variable validation.
- Tests/security.

### Sprint 11E - Credential Delivery + Email Campaigns

- Queued external email delivery.
- Account credential delivery.
- Recipient preview.
- Batch/recipient delivery logs.
- Generic school email campaigns.
- No announcement coupling.
- Tests/security.

### Sprint 11F - Closeout

- E2E closeout.
- README runbook.
- `verify:sprint11f`.
- Project structure update.
- Full verification chain.

## 18. Recommended Immediate Next Task

Recommended next task after Sprint 11A is reviewed and committed:

- Sprint 11B - Username + Login Identity Foundation.

Sprint 11B should not begin until this audit is reviewed, because it will require
schema migration design, contract updates, and security tests.

## 19. Explicit Non-Goals

- Do not implement Schedule/Timetable.
- Do not implement Homework Core.
- Do not implement Pickup/Smart Pickup.
- Do not implement Notification Center app policy.
- Do not implement Applicant Portal/Add Child.
- Do not implement new app-facing features.
- Do not implement runtime code in Sprint 11A.
- Do not send real emails in Sprint 11A.
- Do not add dependencies in Sprint 11A.
- Do not store plain SMTP passwords.
- Do not store raw temporary passwords.
- Do not send credentials to users without contact email.
- Do not make username globally tied to personal email.
- Do not use raw school display name as email domain without normalization and
  explicit login domain setting.
- Do not change `LoginUseCase`.
- Do not change `CreateUserUseCase`.
- Do not change Student/Guardian account linking.
- Do not change Teacher/Student/Parent app modules.
- Do not backdoor deferred features through app-facing modules.

## Sprint 11A Verification Commands

Requested verification commands for this audit:

```bash
npm run build
npm run test -- teacher-app --runInBand
npm run test -- student-app --runInBand
npm run test -- parent-app --runInBand
npm run test -- --runInBand
npm run test:security -- --runInBand
npm run verify:phase5
```

Results should be recorded in the final Sprint 11A handoff after the commands
are run. This document is intentionally docs-only and creates exactly one new
file:

- `docs/sprint-11a-identity-credentials-email-delivery-audit.md`
