# Sprint S-IH-1 — Settings/IAM/Health Reality & Security Audit Lock

Status: AUDIT_ONLY / NO_RUNTIME_CHANGES

Baseline commit: 5feab2c feat: add dashboard homework submissions review surface

Audit date: 2026-06-25

## Executive summary

Final verdict: SETTINGS_IAM_HEALTH_PARTIAL_WITH_STRONG_IMPLEMENTATION_AND_SECURITY_HARDENING_REQUIRED

The current backend has implemented far more of the School Dashboard / School Control Panel Settings surface than older planning documents described. Settings now includes real runtime modules for overview, branding/profile, users, login identity, credentials, roles, security settings, SMTP email connection, email templates, credential deliveries, delivery history, and general campaigns.

The strongest areas are direct credential provisioning, SMTP connection secret handling, email template validation, and school-scoped Settings tenancy checks. These are backed by real controllers, use-cases, repositories, presenters, and targeted security tests.

The main production blockers are not missing CRUD. They are security/runtime hardening gaps:

- disabled users are not reliably invalidated across existing sessions and refresh-token flows;
- credential delivery can mutate a user's temporary password before the SMTP send succeeds, which makes retry behavior unsafe;
- `settings/permissions` is authenticated and school-scoped but lacks an explicit `RequiredPermissions` guard;
- email, credential delivery, campaign, and template routes currently reuse broad `settings.security.*` permissions instead of granular permissions;
- security settings are stored but not enforced by IAM/auth/runtime;
- health checks only the database and skips Redis/storage, with no queue, email, or push readiness checks.

Older Sprint 11A-era findings that login identity, credentials, and email delivery were deferred are now partially obsolete. Those surfaces are implemented, but the implementation needs the hardening above before new feature work continues.

## Required reading evidence

Governance and context reviewed:

- `AGENT_CONTEXT_PRIMER.md`
- `CLAUDE.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `API_CONTRACT_RULES.md`
- `PRISMA_CONVENTIONS.md`
- `OBSERVABILITY.md`
- `ERROR_CATALOG.md`
- `TESTING_STRATEGY.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `DOMAIN_GLOSSARY.md`
- `DIRECTORY_STRUCTURE.md` was requested but is not present in this repository; `DIRECTORY_STRUCTURE_VISUAL.md` was reviewed as the closest local structure reference.

ADR and historical docs reviewed:

- `docs/sprint-11a-identity-credentials-email-delivery-audit.md`
- `docs/sprint-17a-platform-admin-basic-foundation-audit.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-permission-action-taxonomy.md`
- `adr/ADR-0003-api-response-envelope-and-error-shape.md`
- `adr/School-Dashboard/sis_dashboard-settings_backend_handoff_spec_v2.md`
- `adr/School-Dashboard/sis_dashboard-school-dashboard-api-handoff.md`
- `adr/School-Dashboard/sis_dashboard-students_guardians_backend_handoff_spec_v2.md`
- `adr/School-Dashboard/sis_dashboard-teachers_backend_handoff_spec.md`
- recent docs covering communication push delivery, app device tokens, Firebase provider foundation, push workers, homework submissions review, grades repairs, and communication enhancements.

Important ADR handling outcome: older docs are treated as product intent and historical context. They are not treated as absolute runtime truth where the code has since implemented more.

## Route inventory

All routes below are effectively prefixed by `/api/v1` through `app.setGlobalPrefix('api/v1')` in `src/main.ts`.

### Settings overview

| Method | Route | Permission evidence |
| --- | --- | --- |
| GET | `/api/v1/settings/overview` | `settings.overview.view` |

### Branding/profile

| Method | Route | Permission evidence |
| --- | --- | --- |
| GET | `/api/v1/settings/branding` | `settings.branding.view` |
| PATCH | `/api/v1/settings/branding` | `settings.branding.manage` |

### Users

| Method | Route | Permission evidence |
| --- | --- | --- |
| GET | `/api/v1/settings/users` | `settings.users.view` |
| POST | `/api/v1/settings/users/invite` | `settings.users.manage` |
| POST | `/api/v1/settings/users` | `settings.users.manage` |
| PATCH | `/api/v1/settings/users/:id` | `settings.users.manage` |
| PATCH | `/api/v1/settings/users/:id/status` | `settings.users.manage` |
| POST | `/api/v1/settings/users/:id/resend-invite` | `settings.users.manage` |
| POST | `/api/v1/settings/users/:id/reset-password` | `settings.users.manage` |

### Login identity

| Method | Route | Permission evidence |
| --- | --- | --- |
| GET | `/api/v1/settings/login-identity` | `settings.users.view` |
| PUT | `/api/v1/settings/login-identity` | `settings.users.manage` |
| GET | `/api/v1/settings/login-identity/preview` | `settings.users.view` |
| GET | `/api/v1/settings/users/usernames/available` | `settings.users.view` |

### Credentials

| Method | Route | Permission evidence |
| --- | --- | --- |
| GET | `/api/v1/settings/users/credentials/status` | `settings.users.view` |
| POST | `/api/v1/settings/users/credentials/bulk-preview` | `settings.users.view` |
| POST | `/api/v1/settings/users/credentials/bulk-generate` | `settings.users.manage` |
| POST | `/api/v1/settings/users/:userId/credentials/generate` | `settings.users.manage` |
| POST | `/api/v1/settings/users/:userId/credentials/set` | `settings.users.manage` |
| POST | `/api/v1/settings/users/:userId/credentials/regenerate` | `settings.users.manage` |

### Roles

| Method | Route | Permission evidence |
| --- | --- | --- |
| GET | `/api/v1/settings/roles` | `settings.roles.view` |
| POST | `/api/v1/settings/roles` | `settings.roles.manage` |
| POST | `/api/v1/settings/roles/:id/clone` | `settings.roles.manage` |
| PATCH | `/api/v1/settings/roles/:id` | `settings.roles.manage` |
| DELETE | `/api/v1/settings/roles/:id` | `settings.roles.manage` |
| PUT | `/api/v1/settings/roles/:id/permissions` | `settings.roles.manage` |

### Permissions

| Method | Route | Permission evidence |
| --- | --- | --- |
| GET | `/api/v1/settings/permissions` | Authenticated and scoped by global guards, but no explicit `RequiredPermissions` decorator in the controller |

### Security

| Method | Route | Permission evidence |
| --- | --- | --- |
| GET | `/api/v1/settings/security` | `settings.security.view` |
| PATCH | `/api/v1/settings/security` | `settings.security.manage` |

### Email connection

| Method | Route | Permission evidence |
| --- | --- | --- |
| GET | `/api/v1/settings/email/connection` | `settings.security.view` |
| PUT | `/api/v1/settings/email/connection` | `settings.security.manage` |
| POST | `/api/v1/settings/email/connection/test` | `settings.security.manage` |
| POST | `/api/v1/settings/email/connection/activate` | `settings.security.manage` |
| POST | `/api/v1/settings/email/connection/disable` | `settings.security.manage` |

### Email templates

| Method | Route | Permission evidence |
| --- | --- | --- |
| GET | `/api/v1/settings/email/templates` | `settings.security.view` |
| GET | `/api/v1/settings/email/templates/:key` | `settings.security.view` |
| PUT | `/api/v1/settings/email/templates/:key` | `settings.security.manage` |
| POST | `/api/v1/settings/email/templates/:key/preview` | `settings.security.view` |
| POST | `/api/v1/settings/email/templates/:key/reset-default` | `settings.security.manage` |

### Credential deliveries

| Method | Route | Permission evidence |
| --- | --- | --- |
| POST | `/api/v1/settings/email/credential-deliveries/preview-recipients` | `settings.security.view` |
| POST | `/api/v1/settings/email/credential-deliveries` | `settings.security.manage` |

### Deliveries

| Method | Route | Permission evidence |
| --- | --- | --- |
| GET | `/api/v1/settings/email/deliveries` | `settings.security.view` |
| GET | `/api/v1/settings/email/deliveries/:batchId` | `settings.security.view` |
| GET | `/api/v1/settings/email/deliveries/:batchId/recipients` | `settings.security.view` |
| POST | `/api/v1/settings/email/deliveries/:batchId/cancel` | `settings.security.manage` |

### Campaigns

| Method | Route | Permission evidence |
| --- | --- | --- |
| POST | `/api/v1/settings/email/campaigns/preview-recipients` | `settings.security.view` |
| POST | `/api/v1/settings/email/campaigns/preview` | `settings.security.view` |
| POST | `/api/v1/settings/email/campaigns` | `settings.security.manage` |
| GET | `/api/v1/settings/email/campaigns` | `settings.security.view` |
| GET | `/api/v1/settings/email/campaigns/:batchId` | `settings.security.view` |

### Auth

| Method | Route | Auth evidence |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | Public route |
| POST | `/api/v1/auth/refresh` | Public route |
| GET | `/api/v1/auth/me` | Authenticated route |
| POST | `/api/v1/auth/logout` | Authenticated route |
| POST | `/api/v1/auth/change-password` | Authenticated route |

### Health

| Method | Route | Auth evidence |
| --- | --- | --- |
| GET | `/api/v1/health` | Public route |

## Runtime reality matrix

| Area | Runtime status | Evidence files | Notes | Next action |
| --- | --- | --- | --- | --- |
| Settings module composition | COMPLETE | `src/modules/settings/settings.module.ts`, `src/modules/settings/settings-context.ts` | Real module composition exists for overview, branding, users, login identity, credentials, roles, permissions, security, and email. | Keep modular boundaries; add missing generic surfaces only when in scope. |
| School profile / branding | PARTIAL | `src/modules/settings/branding/**`, `prisma/schema.prisma` (`SchoolProfile`) | GET/PATCH implemented; presenter avoids IDs/secrets. Logo is a raw URL, not object-storage upload. Profile fields are narrower than the full handoff intent. | Add storage-backed logo workflow and richer profile fields in a scoped sprint. |
| Settings overview | PARTIAL | `src/modules/settings/overview/**` | Returns profile completeness, active users, pending invites, and recent audit events only. | Extend overview with email/security/integration/queue/backup readiness after runtime checks exist. |
| Settings users | PARTIAL / NEEDS_FIX | `src/modules/settings/users/**` | User and membership lifecycle exists. Teacher/student/parent domain records are not created or linked. Status changes do not revoke sessions. Reset-password is placeholder behavior. | Revoke sessions on disable; add real invite/reset flows; decide domain-record linking strategy. |
| Login identity | PARTIAL | `src/modules/settings/login-identity/**`, `SchoolLoginSettings` | Username policy, generated login email, availability, and domain settings exist. Domain uniqueness/ownership is not enforced. Auth still logs in by email field only. | Normalize login input; decide username-only login and domain uniqueness/ownership rules. |
| Credentials | COMPLETE / HARDEN | `src/modules/settings/users/credentials/**` | Direct generate/set/regenerate and bulk generate work with one-time reveal responses, password hashing, `mustChangePassword`, credential version increment, and session revocation. | Add transaction/idempotency tests around bulk and delivery interactions. |
| IAM/Auth | PARTIAL / NEEDS_FIX | `src/modules/iam/auth/**`, `src/common/guards/**` | Login/refresh/me/logout/change-password exist. Login allows `mustChangePassword=true`, and change-password clears it. Existing sessions are not fully invalidated when user status changes. | Enforce active users in access/refresh/scope flows; normalize login email; add missing reset/activation flows. |
| Roles and permissions | PARTIAL / NEEDS_FIX | `src/modules/settings/roles/**`, `src/modules/settings/permissions/**`, `prisma/seeds/01-permissions.seed.ts`, `prisma/seeds/02-system-roles.seed.ts` | Role CRUD and permission assignment exist. System role mutation is blocked. Permission catalog route lacks explicit permission guard. Email/credential surfaces use broad security permissions. | Add granular permissions, guard `settings/permissions`, add self-lockout protections. |
| Security settings | PARTIAL / NEEDS_FIX | `src/modules/settings/security/**`, `SecuritySetting` | Settings are stored and audited, but not enforced by IAM/auth/runtime. | Either enforce each setting or mark unsupported fields as configuration-only until enforced. |
| Email connection | COMPLETE / PARTIAL PROVIDERS | `src/modules/settings/email/controller/email-connection.controller.ts`, `src/modules/settings/email/application/*connection*`, `src/modules/settings/email/domain/email-secret-crypto.ts`, `src/modules/settings/email/infrastructure/**`, `SchoolEmailConnection` | SMTP config is implemented with encryption/decryption and no secret presenter exposure. Non-SMTP providers are enum/model-only at runtime. | Keep SMTP; add provider-specific implementations only when product-scoped. |
| Email templates | COMPLETE / PARTIAL WORKFLOWS | `src/modules/settings/email/controller/email-template.controller.ts`, `src/modules/settings/email/application/*template*`, `SchoolEmailTemplate` | Template CRUD/preview/reset-default exists with variable validation. Password reset template exists without a matching auth reset-token flow. | Add reset-token workflow or keep template dormant. |
| Credential delivery | NEEDS_FIX | `src/modules/settings/email/delivery/**`, `SchoolEmailDeliveryBatch`, `SchoolEmailDeliveryRecipient` | Queue-backed delivery exists. Recipient processing mutates credentials before successful send, making retry behavior unsafe. | Redesign credential material generation/send as idempotent per recipient and avoid repeated regeneration on retry. |
| Email campaigns | PARTIAL | `src/modules/settings/email/delivery/**` | General campaigns exist using `GENERAL_MESSAGE` templates and reject credential variables. They are separate from Communication module notifications. | Add granular permissions and health/readiness visibility. |
| Integrations | MODEL_ONLY | `IntegrationProvider`, `IntegrationProviderField`, `IntegrationConnection` in `prisma/schema.prisma` | Generic integrations have schema but no Settings API/runtime. Email connection is a separate implemented integration surface. | Defer until integration product scope is approved. |
| Backup/import/export | MODEL_ONLY | `BackupJob` in `prisma/schema.prisma` | Backup jobs are modeled; no Settings backup/import/export API/runtime found. | Defer or build in a dedicated data operations sprint. |
| Notification templates | MODEL_ONLY / SEPARATE_RUNTIME | `NotificationTemplate`, `NotificationTemplateChannelState`, Communication module files | Generic notification template schema exists. Settings notification template runtime is absent. `SchoolEmailTemplate` is separate and implemented. | Decide whether Communication templates move into Settings. |
| Health | NEEDS_FIX | `src/modules/health/**` | Public health checks DB only. Redis and storage are hard-coded as skipped. No queue/email/push readiness. | Implement production health checks for Redis, storage, BullMQ queues/workers, email, Firebase/push, and sanitized failures. |

## Deep findings

### Users and account lifecycle

ADR/planning expectation: School Dashboard settings needs user management for school staff and school-facing accounts, with safe identity/credential handling and no controller business logic.

Current runtime behavior:

- `UsersController` delegates to use-cases; Prisma is not used directly in controllers.
- List/create/invite/update/status/resend-invite/reset-password routes are implemented.
- Create and invite create `User` and `Membership` records.
- `roleKeyToUserType` maps `teacher`, `parent`, and `student` roles to their user type; everything else becomes `SCHOOL_USER`.
- User presenters expose `id`, `fullName`, `username`, `email`, `loginEmail`, `contactEmail`, `roleId`, `roleName`, `status`, and activity/invite timestamps.
- No `passwordHash`, refresh token hash, or provider secret is returned.

Remaining gap:

- Teacher/student/parent account creation does not create or link Teacher, Student, or Guardian domain records. It creates only IAM users and memberships.
- Invite and resend-invite do not send an email or create an activation token.
- Reset-password hashes a generated placeholder password and discards it, then returns a queued-style response. It is not a real reset-token or email workflow.
- Disabling a user does not revoke their sessions. Existing access tokens and refresh sessions can continue unless another flow revokes them.

Recommended next action:

- Add session revocation on user disable and enforce active user status in access-token, refresh-token, and scope resolution flows before new feature work.
- Convert invite/resend/reset into real token/email workflows or rename UI/API behavior so it does not imply completed delivery.
- Decide whether Settings user creation should link to Teacher/Student/Guardian records or remain pure IAM membership management.

### Login identity

ADR/planning expectation: Older Sprint 11A material described login identity as deferred. School Dashboard handoff expected school-specific login settings and username/domain flows.

Current runtime behavior:

- `SchoolLoginSettings` exists with `schoolId`, `loginDomain`, enablement, reserved usernames, username policy, and timestamps.
- Runtime routes support get/update/preview/username availability.
- Username normalization lowercases input and rejects `@`, whitespace, unsafe characters, consecutive dots, and edge punctuation.
- Reserved username checks include default and school-configured reserved usernames.
- Update validates domain-like values and rejects protocols, paths, query strings, hashes, ports, non-ASCII, and embedded `@`.
- When login identity is enabled, users can be created with a username and generated login email stored in `User.email`.

Remaining gap:

- `SchoolLoginSettings.loginDomain` is not globally unique in the schema.
- Domain ownership/DNS verification is not implemented.
- Auth login still accepts an `email` field, not a username-only alias. Login works through the generated login email because it is stored in `User.email`.
- IAM login lookup does not normalize/trim/lowercase the submitted email before repository lookup.

Recommended next action:

- Normalize login identifiers in IAM login.
- Decide whether login domain must be globally unique and verified.
- Decide whether the product should support username-only login in addition to generated login email.

### Credentials

ADR/planning expectation: Old audits marked credentials and first-login password setup as missing. Current code has implemented direct credential provisioning.

Current runtime behavior:

- Credential status list, generate, set, regenerate, bulk-preview, and bulk-generate are implemented.
- Generated temporary passwords are returned only in immediate generate/regenerate/bulk-generate responses.
- Password hashes are never presented.
- Generate/regenerate sets `mustChangePassword=true`, `passwordProvisionedAt`, clears `passwordChangedAt`, increments `credentialVersion`, and revokes active sessions.
- Set password uses a stronger admin-set password policy and can force password change on next login.
- Audit logs store counts and action metadata, not raw passwords.

Remaining gap:

- Bulk generation is sequential and can partially mutate users if a later item fails.
- Credential delivery uses a separate path that generates or regenerates credentials inside the worker before SMTP send succeeds. That is covered under credential delivery because it is the riskier flow.

Recommended next action:

- Add tests for direct credential one-time reveal/no-leak guarantees.
- Add idempotency/transaction hardening where bulk and delivery workflows intersect.

### IAM/Auth

ADR/planning expectation: IAM must enforce authentication, sessions, password changes, and tenant/school context safely.

Current runtime behavior:

- Login, refresh, me, logout, and change-password routes exist.
- Login returns access token, refresh token, user, active membership, permissions, and `mustChangePassword`.
- Login is allowed while `mustChangePassword=true`; the response flags the required change.
- Change-password verifies the current password, validates policy, clears `mustChangePassword`, increments `credentialVersion`, and revokes other sessions.
- Logout revokes the current session.

Remaining gap:

- Refresh does not re-check `User.status`.
- JWT/access guard verifies the token/session but does not re-check `User.status` or credential version.
- Scope resolution loads a user and active membership but does not block disabled users.
- Disabling a user through Settings does not revoke existing sessions.
- Login lookup is not normalized before repository lookup.
- Missing auth flows: activate account, forgot-password, reset-password token flow.

Recommended next action:

- Treat user disable as immediate session revocation.
- Re-check active user status on access-token, refresh-token, and scope resolution paths.
- Normalize login identifiers.
- Add missing auth-token flows or keep them explicitly out of V1 and remove placeholder behavior from user-facing routes.

### Roles and permissions

ADR/planning expectation: Permission-driven access, system role safety, school tenancy isolation, and no cross-school role mutation.

Current runtime behavior:

- Role list/create/clone/update/delete/replace-permissions is implemented.
- System role mutation and deletion are rejected.
- Custom role delete is soft delete and rejects roles with active memberships.
- Visible role queries are school-scoped plus allowed system roles.
- Role permission assignment uses existing permission catalog records.
- `school_admin` is seeded with current non-platform/school-level permissions through the seed rules.

Remaining gap:

- `GET /settings/permissions` has no explicit `RequiredPermissions` decorator.
- No self-lockout protection was found for changing one's own role, disabling oneself, or removing permissions from a role currently held by the actor.
- Email, credential delivery, template, and campaign actions are protected by broad `settings.security.*` permissions.
- Granular permissions do not exist for email connection/templates/deliveries/campaigns or separate credential delivery management.

Recommended next action:

- Add `settings.permissions.view` or protect the route with `settings.roles.view`.
- Add granular email and credential-delivery permissions.
- Update seeds and system roles.
- Add self-lockout tests and guards/use-case checks.

### Security settings enforcement

ADR/planning expectation: Security settings should either be enforced or clearly marked as configuration-only.

Current runtime behavior:

- Security settings can be read and updated.
- Stored fields include `passwordMinLength`, `passwordRotationDays`, `sessionTimeoutMinutes`, `enforceTwoFactor`, `ipAllowlistEnabled`, `ipAllowlist`, and `suspiciousLoginAlerts`.
- Audit summaries avoid logging the raw IP allowlist and instead log counts and scalar setting values.

Remaining gap:

- `passwordMinLength` is not used by IAM password validation or credential provisioning policy.
- `passwordRotationDays` is not enforced.
- `sessionTimeoutMinutes` does not control session/JWT TTL.
- `enforceTwoFactor` has no matching 2FA flow.
- `ipAllowlistEnabled` and `ipAllowlist` are not enforced by a guard.
- `suspiciousLoginAlerts` has no alerting/runtime detection integration.

Recommended next action:

- Either enforce each setting in IAM/auth/runtime or mark unsupported fields as stored-only until an enforcement sprint lands.

### Email connection and secrets

ADR/planning expectation: School email connection should support external email configuration without leaking provider secrets.

Current runtime behavior:

- `SchoolEmailConnection` is implemented for SMTP runtime.
- SMTP password/API key material is encrypted with `EmailSecretCrypto` using AES-256-GCM.
- `SETTINGS_SECRET_ENCRYPTION_KEY` is required outside local/test-like environments. Local/test fallback exists for development.
- Presenters return `hasPassword` and `hasApiKey`; encrypted or decrypted secret material is not returned.
- Audit logs summarize connection changes without secret values.
- Test/activate/disable flows exist.

Remaining gap:

- Non-SMTP provider values are enum/schema-level only. Runtime rejects non-SMTP providers.
- The test flow validates config/decryptability but does not perform a real provider send.
- Failure reasons are returned to the dashboard. Current reasons are controlled and non-secret, but this should remain sanitized if provider-specific clients are added.

Recommended next action:

- Keep SMTP as the only supported provider in UI/API contracts until provider-specific runtimes are added.
- Preserve no-secret presenter/audit patterns when adding providers.

### Email templates

ADR/planning expectation: Templates should be configurable per school and safe to render with expected variables.

Current runtime behavior:

- `SchoolEmailTemplate` is implemented separately from generic notification templates.
- Template keys include `ACCOUNT_CREDENTIALS`, `PASSWORD_RESET`, and `GENERAL_MESSAGE`.
- List/get/update/preview/reset-default are implemented.
- Renderer blocks unsafe variable paths and unknown variables.
- Campaign/general message rendering rejects credential variables.
- Template update audit logs high-level fields and does not log body HTML/text/footer HTML.

Remaining gap:

- `PASSWORD_RESET` template exists without a real auth reset-token workflow.
- Preview can render sample credential variables for `ACCOUNT_CREDENTIALS`; it does not re-render stored real temporary passwords.

Recommended next action:

- Add reset-token runtime or keep password reset templates dormant until the workflow exists.

### Credential delivery, queue, worker, and retry

ADR/planning expectation: Credential delivery must not leak generated credentials and must preserve one-time reveal semantics.

Current runtime behavior:

- Credential delivery preview and create routes exist.
- Delivery batch list/detail/recipients/cancel routes exist.
- General campaigns share the delivery infrastructure.
- BullMQ queue name is `school-email-delivery`; jobs use retry attempts and exponential backoff.
- Worker processes recipient jobs through `ProcessEmailDeliveryRecipientUseCase`.
- Batch and recipient presenters hide raw metadata.
- Failure reasons are sanitized for temporary password-like values and emails.
- Credential delivery audit metadata stores counts and mode, not raw passwords.

Remaining gap:

- For credential modes that generate credentials, recipient processing mutates the user's password hash and credential fields before SMTP send succeeds.
- If SMTP send fails after mutation, `GENERATE` mode can leave the user with an unrevealed password and then fail retry because the user now has a password.
- In `REGENERATE` mode, a retry can generate a different temporary password and invalidate the prior one. If the original send was delivered but the provider response failed, retry can create a new credential unexpectedly.
- This is the highest-risk credential-specific gap found in the audit.

Recommended next action:

- Make credential delivery credential material idempotent per recipient.
- Avoid mutating the user's active credential until a successful send, or persist a one-time encrypted pending credential payload with strict no-response/no-audit exposure and apply it exactly once.
- Add tests proving retry does not regenerate a new temporary password and does not leave unrevealed credentials active after failed delivery.

### Email campaigns

ADR/planning expectation: General outbound school email should not be confused with credentials or Communication module notifications.

Current runtime behavior:

- Campaign preview, preview-recipients, create, list, and detail are implemented.
- Campaigns use the `GENERAL_MESSAGE` template path.
- Credential variables are rejected for general campaigns.
- Campaign delivery is queue-backed and separate from Communication notifications.

Remaining gap:

- Campaign routes use broad `settings.security.*` permissions.
- Campaign content and preview data are stored as campaign metadata/content. This is expected for campaign rendering, but should not be reused for secrets.

Recommended next action:

- Add granular campaign permissions and health/queue readiness visibility.

### Integrations

ADR/planning expectation: Settings handoff references integrations as a School Control Panel surface.

Current runtime behavior:

- `IntegrationProvider`, `IntegrationProviderField`, and `IntegrationConnection` schemas exist.
- No generic settings integrations controller/use-case/repository was found.
- Email connection is implemented as a separate email-specific surface, not through the generic integration models.

Remaining gap:

- Generic integrations are model-only.

Recommended next action:

- Defer until an integration product slice is approved.

### Backup/import/export

ADR/planning expectation: Settings handoff references backup/import/export surfaces.

Current runtime behavior:

- `BackupJob` schema exists.
- No Settings backup/import/export controller/use-case/repository was found.
- File import infrastructure elsewhere in the backend is separate from Settings backup/export management.

Remaining gap:

- Backup/import/export settings are model-only.

Recommended next action:

- Defer or implement in a dedicated data operations sprint.

### Notification templates

ADR/planning expectation: Settings may eventually expose notification template controls.

Current runtime behavior:

- `NotificationTemplate` and `NotificationTemplateChannelState` schemas exist.
- Communication notifications have runtime modules.
- Settings notification template runtime was not found.
- `SchoolEmailTemplate` is a separate implemented surface for Settings email.

Remaining gap:

- Generic notification templates are model-only from the Settings perspective.

Recommended next action:

- Decide whether Communication notification templates belong in Settings or remain Communication-owned.

### Health

ADR/planning expectation: Production health should reflect meaningful runtime dependencies.

Current runtime behavior:

- `GET /api/v1/health` is public.
- Health checks only database connectivity with `SELECT 1`.
- Redis and storage are hard-coded as `skipped`.
- No queue, email, push, Firebase, or app-device-token readiness is checked.
- Overall status is effectively based on DB only.

Remaining gap:

- Redis became operationally important for BullMQ queues.
- S3-compatible object storage is a platform dependency.
- School email delivery depends on Redis/BullMQ, SMTP configuration, and the email worker.
- Communication push delivery depends on Redis/BullMQ and Firebase provider readiness.
- App device token features depend on their crypto/config path.
- Public raw dependency error messages should be sanitized if new checks are added.

Recommended next action:

- Implement production health/readiness checks for DB, Redis, storage, BullMQ queues/workers, school email queue, communication notification queue, push queue, Firebase/FCM readiness, and sanitized email readiness signals.

## Security and no-leak findings

### Confirmed safe areas

- Settings users and credentials presenters do not return `passwordHash`.
- Direct credential generate/regenerate/bulk-generate return temporary passwords only in the immediate one-time response.
- Credential audit logs avoid temporary passwords and admin-set passwords.
- Email connection presenters do not expose `encryptedPassword`, `encryptedApiKey`, decrypted SMTP password, decrypted API keys, or raw provider secret material.
- Email connection audit summaries avoid provider secrets.
- Email delivery batch/detail/recipient presenters do not expose raw batch or recipient metadata.
- Delivery failure reasons are sanitized for temporary-password-like values and email addresses.
- General campaigns reject credential variables.
- Template rendering validates allowed variables and blocks unsafe prototype/constructor-style paths.

### Suspected leak or runtime safety risks

- Credential delivery retry can rotate or activate unrevealed credentials before a successful send. This is a safety/integrity risk more than a direct response leak.
- `/auth/me` returns internal scope identifiers such as membership, organization, school, and role IDs. This may be intended for dashboard scope state, but it should remain an explicit contract decision.
- Settings users and credential status responses expose user IDs and role IDs. This is operationally useful for dashboard actions, but should remain intentional.
- `settings/permissions` can be enumerated by any authenticated scoped user because the controller has no explicit permission decorator.
- Health currently returns dependency error messages publicly for DB failure. New checks must sanitize provider and connection details.
- Login failure audit records the attempted email for unknown users. This is PII, not a secret, but retention and visibility should be intentional.
- Campaign preview data is stored as raw campaign rendering data. Credential variables are rejected, but future extensions should not allow provider secrets or generated credentials there.

### Required tests to add

- Disabled users cannot use existing access tokens after status change.
- Disabled users cannot refresh sessions after status change.
- Settings user disable revokes sessions.
- `settings/permissions` requires an explicit permission.
- Email/credential routes reject users who have security permission but lack future granular email/credential permissions.
- Credential delivery retry does not regenerate temporary passwords and does not leave unrevealed credentials active after failed SMTP send.
- Health returns sanitized failure data for Redis/storage/queue/email/push checks.
- Security settings enforcement tests, once product decides which fields are enforced in V1.

### Exact files/use-cases needing hardening

- `src/modules/settings/users/application/update-user-status.use-case.ts`
- `src/modules/iam/auth/application/refresh.use-case.ts`
- `src/modules/iam/auth/application/login.use-case.ts`
- `src/common/guards/jwt-auth.guard.ts`
- `src/common/guards/scope-resolver.guard.ts`
- `src/modules/settings/permissions/controller/permissions.controller.ts`
- `src/modules/settings/email/controller/*`
- `src/modules/settings/email/delivery/application/process-email-delivery-recipient.use-case.ts`
- `src/modules/health/**`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`

## Settings permissions findings

Is `settings/permissions` protected with `RequiredPermissions`?

- No. It is protected by global authentication/scope/permission guard infrastructure, but the controller does not declare a required permission. Any authenticated scoped user can enumerate the permission catalog.

Are email/credential actions using overly broad `settings.security.*` permissions?

- Yes. Email connection, email templates, credential deliveries, delivery history, and campaigns use `settings.security.view` and `settings.security.manage`.

Are there missing granular permissions?

- Yes. The current seed set has `settings.overview.*`, `settings.users.*`, `settings.roles.*`, `settings.branding.*`, and `settings.security.*`, but no granular permissions for:
  - `settings.permissions.view`
  - `settings.email.connection.view/manage`
  - `settings.email.templates.view/manage`
  - `settings.email.deliveries.view/manage`
  - `settings.email.campaigns.view/manage`
  - `settings.email.credential_deliveries.view/manage`
  - optional separate `settings.credentials.view/manage` if credential provisioning should be separated from user management.

Are system roles seeded with the permissions required by current routes?

- `school_admin` receives the broad non-platform/school-level permission set, so it has the permissions required by current guarded routes.
- Teacher, parent, and student system roles do not receive Settings management permissions, which is appropriate.
- Because granular email/credential permissions do not exist yet, they cannot be seeded or assigned.

## Health findings

What does health check today?

- Database connectivity only, using `SELECT 1`.

What is skipped?

- Redis is hard-coded as `skipped`.
- Storage is hard-coded as `skipped`.
- Queues, workers, email readiness, Firebase/FCM readiness, app device token configuration, and push delivery readiness are not checked.

Why is this insufficient after queue/storage/email/push additions?

- Redis is now required for BullMQ-backed email and communication/push delivery.
- Object storage is part of the production architecture and can affect file-backed workflows.
- School email delivery has queue, worker, SMTP, and secret-decryption dependencies.
- Communication push delivery has queue and Firebase provider dependencies.
- App device token support adds runtime config/crypto sensitivity.
- A DB-only public health endpoint can report healthy while core async delivery and storage paths are nonfunctional.

Exact health checks to implement next:

- DB check with sanitized error output.
- Redis ping/readiness check.
- BullMQ queue readiness for `school-email-delivery`.
- BullMQ queue readiness for communication notification queues, including push delivery.
- Worker liveness/readiness signal for critical queues where feasible.
- Storage bucket/config readiness check that does not write user data or expose bucket secrets.
- Email readiness summary that checks active connection decryptability/config presence without exposing provider secrets.
- Firebase/FCM provider readiness/config check with sanitized failure.
- App device token crypto/config readiness if token encryption keys are required at runtime.
- Overall status should degrade when required dependencies fail, not when optional unconfigured providers are intentionally disabled.

## Deferred and optional features

### Must fix now

- Disable-user/session invalidation across access tokens, refresh tokens, and scope resolution.
- Protect `settings/permissions` with an explicit permission.
- Fix credential delivery retry semantics before using it for production credential distribution.
- Replace broad email/credential `settings.security.*` permissions with granular permissions and seed them.
- Implement production-accurate health checks for Redis, storage, queues, email, and push readiness.

### Should fix soon

- Normalize login identifiers in IAM login.
- Add self-lockout protection for user status, role assignment, and role permission changes.
- Decide and document whether security settings are enforceable or configuration-only.
- Add real invite, activate, forgot-password, and reset-password token/email flows.
- Extend Settings overview with readiness/status data after health checks exist.

### Safe to defer

- Generic integrations API/runtime.
- Backup/import/export Settings runtime.
- Non-SMTP email providers.
- Storage-backed logo upload if raw logo URL remains acceptable for the current dashboard milestone.
- Generic notification template Settings runtime, if Communication remains the owner.

### Product decision needed

- Whether School Login Domains must be globally unique and ownership-verified.
- Whether users can log in with username alone or only generated login email.
- Whether Settings user creation should create/link Teacher, Student, or Guardian domain records.
- Whether `/auth/me` should expose internal IDs or a presenter-shaped dashboard scope contract.
- Whether security settings should be enforced in V1 or visibly marked as planned controls.

## Proposed next implementation sprint

Sprint name: Sprint S-IH-2 — Settings/IAM Security Hardening & Health Readiness

Objective: Close the security and runtime-readiness blockers in Settings, IAM, email credential delivery, permissions, and health before adding new feature work.

Files likely to change:

- `src/modules/settings/permissions/controller/permissions.controller.ts`
- `src/modules/settings/email/controller/*`
- `src/modules/settings/users/application/update-user-status.use-case.ts`
- `src/modules/iam/auth/application/login.use-case.ts`
- `src/modules/iam/auth/application/refresh.use-case.ts`
- `src/common/guards/jwt-auth.guard.ts`
- `src/common/guards/scope-resolver.guard.ts`
- `src/modules/settings/email/delivery/application/process-email-delivery-recipient.use-case.ts`
- `src/modules/health/**`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `test/security/tenancy.settings.spec.ts`
- new `test/security/tenancy.iam.spec.ts`
- new or updated e2e tests for Settings, IAM, and Health.

Exact fixes:

1. Revoke sessions on user disable.
2. Reject disabled users in access-token, refresh-token, and scope resolution paths.
3. Normalize login email/identifier before auth lookup.
4. Add explicit permission protection for `settings/permissions`.
5. Add granular email, credential-delivery, campaign, and permission-catalog permissions.
6. Update seeds and system role assignment for the new permissions.
7. Add self-lockout protection for role/user changes.
8. Redesign credential delivery so retries are idempotent and do not regenerate or activate unrevealed credentials.
9. Implement production health/readiness checks for DB, Redis, storage, queues, email, Firebase/push, and sanitized failure output.
10. Decide whether security settings are enforced or marked as stored-only, then update behavior/tests accordingly.

Tests to add/update:

- `test/security/tenancy.iam.spec.ts` for disabled-user access/refresh invalidation and session revocation.
- Settings security tests for permission catalog protection and granular email/credential permissions.
- Credential delivery worker tests for retry idempotency and no temporary-password leakage.
- Health e2e/unit tests for DB/Redis/storage/queue/email/push status and sanitized failures.
- Auth login tests for identifier normalization.
- Self-lockout tests for role/user changes.

Verification commands for the next sprint:

- `git status --short --untracked-files=all`
- `git diff --name-only`
- `git diff --stat`
- `git diff --check`
- `npx prisma validate`
- `npx prisma generate`
- `npm run build`
- `npm run test -- settings --runInBand`
- `npm run test -- iam --runInBand`
- `npm run test -- health --runInBand`
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/settings.e2e-spec.ts`
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/iam.e2e-spec.ts`
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/health.e2e-spec.ts`
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.settings.spec.ts`
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.iam.spec.ts`

Expected final verdict after Sprint S-IH-2: SETTINGS_IAM_HEALTH_HARDENED_FOR_FEATURE_WORK

## Verification evidence

### Pre-audit worktree

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS - clean before audit document creation |

### Required verification commands

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS - only `?? docs/sprint-sih-1-settings-iam-health-reality-security-audit.md` |
| `git diff --name-only` | PASS - no output because the only changed file is untracked |
| `git diff --stat` | PASS - no output because the only changed file is untracked |
| `git diff --check` | PASS - no whitespace errors reported |
| `npx prisma validate` | PASS - Prisma schema is valid |
| `npx prisma generate` | PASS - Prisma Client v6.19.3 generated to `node_modules/@prisma/client`; Prisma printed a non-blocking 7.8.0 update notice |
| `npm run build` | PASS - `nest build` completed |
| `npm run test -- settings --runInBand` | PASS - 23 suites, 72 tests |
| `npm run test -- iam --runInBand` | PASS - 1 suite, 3 tests |
| `npm run test -- health --runInBand` | FAIL - no matching health specs found; Jest exited code 1 with "No tests found" |
| `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/settings.e2e-spec.ts` | NOT_FOUND - requested file is absent |
| settings e2e fallback: `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/identity-credentials-email-final-closeout.e2e-spec.ts` | FAIL - 3 passed, 1 failed; stale route-inventory assertion expected `GET /api/v1/teacher/notifications` to be absent, but notification routes now exist |
| `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/iam.e2e-spec.ts` | NOT_FOUND - requested file is absent |
| iam e2e fallback: `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/identity-credentials-email-final-closeout.e2e-spec.ts` | FAIL - same fallback run as above; failure is stale absent-route expectation after notification route additions |
| `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/health.e2e-spec.ts` | NOT_FOUND - requested file is absent |
| health e2e fallback: `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.spec.ts` | PASS - 1 suite, 7 tests; includes basic public health route coverage |
| `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.settings.spec.ts` | PASS - 1 suite, 31 tests |
| `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.iam.spec.ts` | NOT_FOUND - requested file is absent |
| iam security fallback: `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.spec.ts` | PASS - same fallback run as above; 1 suite, 7 tests |

### Post-audit worktree

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS - final state shows only `?? docs/sprint-sih-1-settings-iam-health-reality-security-audit.md` |
| `git diff --name-only` | PASS - no output because the only changed file is untracked |
| `git diff --stat` | PASS - no output because the only changed file is untracked |
| `git diff --check` | PASS - no whitespace errors reported |
