# Sprint 11 — Identity, Credentials, And School Email Delivery Plan

Status: Active execution plan  
Created after Phase 5 closeout and Sprint 11A audit.

This file is the execution source for the post-Phase-5 identity, login credentials, and school email delivery work.

It does not replace the governance files. Agents must still read:

- AGENT_CONTEXT_PRIMER.md
- CLAUDE.md
- PROJECT_OVERVIEW.md
- ARCHITECTURE_DECISION.md
- SECURITY_MODEL.md
- PRISMA_CONVENTIONS.md
- ENGINEERING_RULES.md
- API_CONTRACT_RULES.md
- ERROR_CATALOG.md
- TESTING_STRATEGY.md
- MODULES.md
- USER_TYPES.md
- V1_SCOPE.md
- docs/sprint-11a-identity-credentials-email-delivery-audit.md

## 1. Why Sprint 11 Exists

Phase 5 closed the Teacher App, Student App, and Parent App surfaces.

However, Teacher, Student, and Parent users are created by the school dashboard and do not self-register from their apps.

The current backend can create users, memberships, students, guardians, and app ownership links, but a complete login identity and credential provisioning foundation is still required.

The goal of Sprint 11 is to make dashboard-created accounts operational and login-ready without starting deferred Cores such as Schedule, Homework, Pickup, or Notification Center.

## 2. Core Business Decisions

1. The school dashboard is the operational source of truth.
2. Teacher, Student, and Parent app users do not self-register in V1.
3. The personal email is not the login identity.
4. The dashboard collects a username.
5. The backend generates a login email:
   username + "@" + school login domain.
6. User.email remains the login email for compatibility with existing auth.
7. User.contactEmail stores the personal/contact email.
8. Password provisioning is a separate controlled flow.
9. Activation/set-password links are the preferred initial access method.
10. Temporary passwords may be supported only if explicitly approved.
11. Temporary passwords must be one-time reveal, hashed only, and require password change.
12. School-specific outbound email settings are configured from the dashboard.
13. Email provider secrets must be encrypted at rest.
14. Credential delivery and campaigns must be queue-backed.
15. General email campaigns are separate from in-app Communication Announcements.

## 3. Non-Negotiable Architecture Rules

- Modular monolith only.
- No microservices in V1.
- All routes are under `/api/v1`.
- No business logic in controllers.
- No direct Prisma usage in controllers.
- Use use-cases, repositories/adapters, DTOs, presenters, and tests.
- Every schema change must have a migration.
- Do not bypass `schoolScope`.
- Do not hand-craft schoolId filters in repositories unless there is an approved reason.
- Do not modify Teacher App, Student App, or Parent App during Sprint 11 unless explicitly required.
- Do not implement deferred Cores during Sprint 11.
- Do not store raw passwords.
- Do not log passwords, tokens, SMTP secrets, or API keys.
- Do not send real emails outside approved queue-backed delivery flows.

## 4. Current Sprint State

### Sprint 11A — Audit

Status: Done.

Commit:

- docs: add identity credentials email delivery audit

Scope:

- Documentation-only audit.
- Identified current IAM/settings behavior.
- Confirmed gaps in username, contactEmail, credential provisioning, school email provider settings, templates, delivery logs, and campaigns.
- Recommended Sprint 11B as the next task.

### Sprint 11B — Username + Login Identity Foundation

Status: In progress until committed.

Goal:

- Add User.username.
- Add User.contactEmail.
- Add SchoolLoginSettings.
- Generate login email as username@schoolLoginDomain.
- Keep User.email as login email.
- Add username availability and login email preview.
- Update Settings Users create/invite to support username/contactEmail.
- Preserve legacy email-only behavior.
- Do not implement password provisioning or email delivery.

Required closeout before commit:

- All code uses scoped Prisma where applicable.
- SchoolLoginSettings is registered in schoolScope.
- Existing admin login still works.
- Existing tests remain green.
- verify:phase5 passes.
- No password generation, activation, email provider, template, campaign, or account-linking logic is introduced.

### Sprint 11C — Account Linking + Credential Provisioning

Status: Planned.

Goal:

- Make dashboard-created teacher/student/parent accounts login-ready.
- Add credential state and password provisioning foundation.
- Link Student records to User accounts.
- Link Guardian records to Parent User accounts.
- Add controlled password generation/set/regeneration.
- Add mustChangePassword behavior.
- Add auth change-password flow.
- Add credential status and bulk preview/generate.

In scope:

- User credential metadata.
- Account linking use-cases.
- Admin credential provisioning endpoints.
- Student account create/link.
- Guardian parent account create/link.
- Teacher credential provisioning.
- Password hashing only.
- One-time temporary password reveal if approved.
- Session invalidation on reset/regeneration.
- Audit logs.
- Security tests.

Out of scope:

- Email provider settings.
- Credential email delivery.
- Templates.
- Campaigns.
- Schedule.
- Homework.
- Pickup.
- Notification Center.

### Sprint 11D — School Email Provider + Template Engine

Status: Planned.

Goal:

- Allow each school to configure outbound email settings from the dashboard.
- Add encrypted provider secrets.
- Add test-send/activate/disable provider flow.
- Add school-branded email templates.
- Add template preview.
- Add logo/social/support fields.

In scope:

- SchoolEmailConnection.
- Encrypted SMTP/API credentials.
- Provider status.
- Test send.
- Template CRUD/preview.
- Branding fields.
- Audit logs.
- Security tests.

Out of scope:

- Bulk delivery.
- Credential delivery batches.
- General campaigns.
- Notification Center.
- In-app announcements changes.

### Sprint 11E — Credential Delivery + General Email Campaigns

Status: Planned.

Goal:

- Send account access information to personal/contact emails.
- Support recipient previews and dry-runs.
- Support queued delivery.
- Support general school email campaigns separately from announcements.

In scope:

- Account credential delivery.
- Activation link delivery.
- Optional temporary password delivery if approved.
- Recipient selection:
  - single user
  - selected users
  - teachers
  - students
  - parents
  - role/user type
  - class/grade/section where safe
  - users missing credentials
  - custom email
- Delivery batch logs.
- Per-recipient status.
- Queue workers.
- General email campaigns.
- Campaign preview.
- Campaign recipient preview.
- Security tests.

Out of scope:

- Push notifications.
- SMS providers.
- In-app Notification Center policy.
- Announcement management changes.
- Schedule/Homework/Pickup.

### Sprint 11F — Closeout

Status: Planned.

Goal:

- Add final E2E closeout for Sprint 11.
- Add verification script.
- Add README runbook.
- Update project structure after review.
- Confirm no deferred Cores were backdoored.

In scope:

- test:e2e:sprint11f
- verify:sprint11f
- README Sprint 11 runbook
- closeout E2E
- security regression
- docs/project structure update if required

Out of scope:

- New runtime behavior beyond closing the implemented Sprint 11 work.

## 5. Deferred Cores After Sprint 11

Do not implement these until Sprint 11F is closed:

1. Schedule / Timetable / Period / durable scheduleId
2. Full Homework Core
3. Pickup / Smart Pickup
4. App-facing Notification Center policy
5. Add Child claim/approval
6. Applicant Portal identity ownership
7. Contact discovery / new conversations
8. Message attachment/audio app-facing routes
9. Profile mutations / avatar / preferences / support / CMS
10. XP grants / reward redemption / mission mutations
11. Cross-school Parent aggregation

## 6. Execution Workflow

Every task follows this workflow:

1. Assistant writes a strict execution prompt.
2. User sends prompt to the agent.
3. Agent implements without committing.
4. User sends:
   - implementation summary
   - verification results
   - git status --short
   - git diff --name-only
   - relevant diffs if requested
5. Assistant reviews.
6. If needed, assistant requests patches.
7. User applies patch through agent.
8. Assistant approves commit.
9. User commits.
10. User pushes to GitHub.
11. User sends final git log/status.
12. Assistant marks sprint/task closed.

No sprint is closed without:

- clean working tree after commit
- verification results
- no unintended scope expansion
- explicit assistant approval

## 7. Standard Verification Commands

For schema/runtime tasks:

```bash
npx prisma validate
npx prisma generate
npm run db:migrate
npm run build
npm run test -- settings --runInBand
npm run test -- auth --runInBand
npm run test -- --runInBand
npm run test:security -- --runInBand
npm run verify:phase5
```

For docs-only tasks:

```bash
npm run build
npm run test -- --runInBand
npm run test:security -- --runInBand
npm run verify:phase5
```

For closeout tasks:

```bash
npm run build
npm run test -- --runInBand
npm run test:security -- --runInBand
npm run test:e2e:sprint11f
npm run verify:sprint11f
```

## 8. Commit Rules

Do not commit until assistant review.

Recommended commit style:

docs: add identity credentials email delivery audit
feat: add username login identity foundation
feat: add account credential provisioning
feat: add school email provider templates
feat: add credential delivery email campaigns
test: add identity credentials closeout
docs: update project structure after identity credentials closeout

## 9. Current Immediate Next Action

Finish Sprint 11B.

Before committing Sprint 11B:

Patch LoginIdentityRepository create path to use scopedPrisma.
Verify status preservation behavior.
Review preview use-case, DTO, presenter, and exceptions.
Run targeted verification.
Send outputs for assistant approval.
