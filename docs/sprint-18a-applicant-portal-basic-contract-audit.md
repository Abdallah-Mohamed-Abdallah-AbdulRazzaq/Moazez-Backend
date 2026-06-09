# Sprint 18A — Applicant Portal Basic Contract Audit

## 1. Purpose and Scope

Sprint 18A is documentation-only. It analyzes the future Applicant Portal Basic foundation before runtime code is written.

This audit determines:

- Current repository readiness.
- Intended user type.
- Account model.
- School discovery model.
- Application ownership model.
- Admissions integration model.
- Security and tenancy implications.
- Implementation sprint breakdown.

The only intended changed file is:

- `docs/sprint-18a-applicant-portal-basic-contract-audit.md`

Baseline note: the repository was inspected at latest commit `c074213 docs: update project structure after platform admin closeout`. The requested `DIRECTORY_STRUCTURE.md` file is not present in this checkout; `DIRECTORY_STRUCTURE_VISUAL.md` and `Moazez-Project-Structure.json` were used for directory context.

Explicitly out of scope for Sprint 18A:

- Runtime code.
- Schema changes.
- Migrations.
- Tests.
- Package scripts.
- Route creation.
- Applicant registration implementation.
- Auth implementation.
- School search implementation.
- Application submission implementation.
- Parent conversion/linking implementation.

## 2. ADR Interpretation Policy

The Parent App and Applicant Portal ADR files are product intent and handoff references. They describe a temporary/pre-admission account, school search, required admission documents, admission application submission, applicant portal home, applicant portal requests, applicant portal profile, and applicant logout/session behavior.

They do not override:

- The global `/api/v1` prefix enforced by `app.setGlobalPrefix('api/v1')`.
- Existing Auth DTOs.
- Existing Admissions DTOs.
- Current Admissions status enums.
- Current controller/module boundaries.
- `API_CONTRACT_RULES.md`.
- School-scope and platform-scope rules.

ADR paths such as `/schools`, `/applicants/temporary-account`, `/admission-applications`, and `/applicants/portal/*` must be mapped to backend-native `/api/v1/...` routes in future implementation. They should not be copied as literal backend route paths without review.

This audit must not rename existing school-dashboard Admissions routes. The shipped school-dashboard Admissions API under `/api/v1/admissions/...` remains the current backend contract.

## 3. Product Decision to Validate

Proposed product rule:

A user may create an applicant account before belonging to any school.

This account:

- Is outside the school operational system.
- Has no school membership.
- Is not linked to a student yet.
- Can search public/available schools.
- Can submit admission requests to one or more schools.
- Can view only its own applicant requests.
- May later become linked to a guardian/parent flow after admission acceptance.

Recommended user type:

- `UserType.APPLICANT`

Not:

- `UserType.PARENT`

Reason:

- `parent` is a guardian-side actor with access limited to linked children.
- `applicant` is a temporary pre-admission actor used in applicant portal flows.
- Relationship values such as `father`, `mother`, `guardian`, and `relative` are relationship attributes, not user types.

The repository supports this product distinction conceptually, but not yet as a complete runtime implementation.

## 4. Current Repository Findings

### User Types

`UserType.APPLICANT` exists in `prisma/schema.prisma`.

`USER_TYPES.md` defines `applicant` as a temporary pre-admission actor used in applicant portal flows. It also defines `parent` as a guardian-side actor with access to linked children only.

`DOMAIN_GLOSSARY.md` and `USER_TYPES.md` both support the rule that relationship labels such as `father`, `mother`, `guardian`, and `relative` are attributes, not user types. The current Prisma `Guardian.relation` field is a string attribute on the school-scoped guardian record.

### Auth

The current login request DTO is:

- `email`
- `password`

The current login response includes:

- `accessToken`
- `refreshToken`
- `expiresIn`
- `user`, including `userType`

`LoginUseCase` finds a user by email, verifies `passwordHash`, rejects non-active users, issues tokens using `user.id` and `user.userType`, creates a session, and writes an audit log. It does not explicitly reject `UserType.APPLICANT`, so an active applicant user with a password hash could technically receive tokens.

However, the normal protected route path is not safe for a membershipless applicant today. `ScopeResolverGuard` allows membershipless access only for `UserType.PLATFORM_USER`; every other user type without an active membership receives `auth.scope.missing`. The existing global guard pattern therefore assumes that non-platform protected routes have an active membership.

Applicant-specific routes will need custom scope behavior, such as a route-level applicant access service or carefully scoped guard pattern. They should not depend on a school membership and should not activate ordinary school-scoped permissions by default.

### Admissions

Current Admissions is a school-dashboard operational module.

The current application create DTO supports:

- `studentName`
- `requestedAcademicYearId`
- `requestedGradeId`
- `source`
- Optional `leadId`

Current Admissions API statuses are:

- `submitted`
- `documents_pending`
- `under_review`
- `accepted`
- `waitlisted`
- `rejected`

`CreateApplicationUseCase` calls `requireApplicationsScope()`, which requires `RequestContext.activeMembership.schoolId`. It creates an `Application` with `schoolId` and `organizationId` from the active school context and sets the initial status to `DOCUMENTS_PENDING` with `submittedAt = null`.

Current application ownership is school/organization based. There is no `ApplicantProfile`, no `Application.applicantUserId`, and no applicant-owned application relation. `Lead.ownerUserId` exists, but it represents dashboard-side lead ownership, not applicant identity ownership.

Current application document linking uses `fileId`, `documentType`, status, and notes. It does not accept raw file URLs as the core storage contract.

The school-side accepted application handoff is preview-only. `EnrollApplicationHandoffUseCase` validates that an application can prepare enrollment handoff and returns draft student/guardian/enrollment data, but it does not create operational student, guardian, or enrollment records.

Current Admissions routes cannot be safely reused as applicant-facing routes as-is because they require school scope and admissions permissions.

### Parent App

The current Parent App assumes a linked guardian/children model.

`ParentAppAccessService` builds a parent context from the active request context, requires `UserType.PARENT`, requires an active school membership, resolves current-school `Guardian.userId`, follows `StudentGuardian` links, and returns active current-school enrollments. Its guardrail explicitly keeps Parent App access inside `RequestContext.activeMembership.schoolId`.

Applicant accounts must not be treated as Parent App accounts. Applicant tokens must not unlock Parent App child, grade, schedule, homework, behavior, report, announcement, or messaging routes.

Parent App final closeout tests and tenancy tests also assert that deferred add-child and applicant-portal routes are not currently exposed under `/api/v1/parent/...`.

### Students/Guardians

`Student.userId` and `Guardian.userId` exist and support later account linking.

Current Students/Guardians account linking creates or links operational accounts after school-scoped student or guardian records already exist:

- Student account linking creates or links `UserType.STUDENT`.
- Guardian account linking creates or links `UserType.PARENT`.

This is not the same as applicant registration. Future accepted-application conversion may create/link Guardian, Student, StudentGuardian, Enrollment, and parent account data, but that conversion should remain deferred from Applicant Portal Basic unless explicitly scoped.

### Platform Admin / School Status / Feature Controls

`School.status` exists with `ACTIVE`, `SUSPENDED`, and `ARCHIVED`. `SchoolProfile` contains display fields that may be useful for public discovery, including school name, short name, address, formatted address, city, country, and logo URL.

The Platform Admin feature registry includes `applicant_portal`, and `SchoolFeatureControl` stores feature enablement by school. Current Platform Admin closeout documentation states these controls are configuration/governance data and do not yet enforce runtime behavior across modules.

Public school discovery should expose only safe active schools. It must explicitly filter schools and avoid leaking internal tenant fields. `School` is excluded from automatic school-scope injection, so public discovery must be written with explicit visibility/status/deleted filters.

Expected conclusion:

- Applicant Portal Basic should not use school-dashboard Admissions routes directly.
- It should add a bounded portal-facing adapter/layer later.
- It should reuse Admissions core where safe, but preserve applicant ownership and public/safe school discovery boundaries.

## 5. Existing ADR Contract Summary

`adr/Parent-App/parent_applicant_portal.md` describes applicant portal intent for:

- Home response with applicant identity, latest request, stats, and a next action.
- Requests response with request id, school name, child name, grade, status, submitted date, updated date, progress value, and missing items.
- Profile response with full name, phone, email, city, relationship, and account metadata.
- Status expectations: `draft`, `submitted`, `under_review`, `accepted`, `needs_action`, `rejected`.
- Applicant fields such as full name, phone, email, city, and relationship.

`adr/Parent-App/parent_parent_ADD_CHILD_MODEL.md` describes intent for:

- School search.
- Required admission documents.
- Temporary applicant account creation.
- Admission application submission.
- Portal home.
- Portal requests.
- Portal profile.
- Upload/document notes.
- Token/session behavior.

It uses product-facing paths such as `/schools`, `/schools/{school_id}/admission-required-documents`, `/applicants/temporary-account`, `/admission-applications`, and `/applicants/portal/*`. These are not literal backend route contracts until mapped to `/api/v1` and reconciled with module boundaries.

`adr/Parent-App/parent_auth.md` describes intent for:

- Auth/login from the parent-facing client.
- Forgot password.
- Quick apply account creation.
- A temporary applicant account that can later use auth/session behavior.

These ADR request/response examples should be treated as intent, not final DTOs.

## 6. Proposed Applicant Portal Boundary

Recommended future module boundary:

- `src/modules/applicant-portal/**`

Rationale:

- It is a portal-facing composition layer.
- It should not duplicate Admissions business logic.
- It should not become Parent App.
- It should not become School Dashboard.
- It should expose applicant-safe routes.
- It should delegate to Admissions, Files, Schools, and IAM/Auth where appropriate.

Possible future internal layout:

- `application/`
- `controller/`
- `dto/`
- `domain/`
- `infrastructure/`
- `presenters/`
- `tests/`

This is a future recommendation only. Sprint 18A creates no files under `src/` and creates no tests.

## 7. Account and Identity Model Recommendation

Recommended future applicant account model:

- `User.userType = APPLICANT`
- Account status is active or invited according to a future policy.
- No school membership.
- No organization membership.
- Password hash is created at temporary account registration if password registration is supported.
- Contact email is stored safely.
- Relationship is stored separately as applicant profile data.
- Applicant cannot access Parent App child data.
- Applicant cannot access School Dashboard.
- Applicant cannot access Teacher App or Student App.
- Applicant can access only Applicant Portal routes.

Open schema question:

Should the future implementation add:

- `ApplicantProfile`
- `Application.applicantUserId`
- Both
- Another ownership relation

Safest recommended path:

- Add a dedicated `ApplicantProfile` for pre-admission applicant metadata such as full name, phone, contact email, city, and relationship.
- Add direct applicant ownership on admission requests, either through `Application.applicantUserId` or a dedicated applicant-request relation.
- Do not overload `Guardian` as applicant profile before acceptance.
- Do not create `Guardian`, `Student`, `StudentGuardian`, or `Enrollment` records until school-side acceptance/handoff policy says so.

This recommendation requires future schema design and migrations. Sprint 18A does not perform them.

## 8. Public School Discovery Recommendation

Future school discovery should be a public or applicant-authenticated Applicant Portal route category.

Expected future behavior:

- List only safe active schools.
- Exclude deleted, suspended, archived, internal-only, or otherwise hidden schools.
- Do not expose internal tenant fields.
- Do not expose entitlement, billing, feature controls, staff, internal counts, or operational metadata unless explicitly approved as safe.
- Support optional filters such as search, city, grade, page, and limit.
- Return only public fields such as school id, name, address/city, logo, and available grades when source data exists.

Current source fields:

- `School.id`, `School.name`, `School.slug`, and `School.status`.
- `SchoolProfile.schoolName`, `shortName`, `addressLine`, `formattedAddress`, `city`, `country`, and `logoUrl`.
- Grades exist in the academic model, but any public grade listing must be explicitly filtered by selected school and active/safe visibility rules.

ADR fields such as `rating` and `student_count` are not currently guaranteed by a clear safe backend source. They should not be returned unless a real product-approved source exists.

## 9. Required Admission Documents Recommendation

Current Admissions has application document linking, but not a confirmed required-document configuration model for applicant discovery.

Current state:

- `ApplicationDocument` links an application to a `File`.
- The document has `documentType`, `status`, and `notes`.
- The DTO uses `fileId`, not raw uploaded URLs.
- No current Prisma model or runtime endpoint was found for admission required documents per school/grade.

There is handoff intent for admissions document requirements in ADR material, but no implemented runtime source of truth in the inspected Admissions code.

Recommended future path:

- Add a limited required-document read model only after choosing the owning module.
- Prefer a school/grade-aware model if requirements vary by grade.
- If requirements are global per school, keep it school-scoped and simple.
- Expose it through Applicant Portal presenters, not by leaking internal settings records.

File upload policy:

- Use the existing Files module or an applicant-safe adapter over it.
- Do not store raw file URLs in application documents if backend storage uses file ids/metadata.
- Applicant-uploaded documents must be ownership checked by applicant and application.
- Do not expose raw S3/MinIO keys.

## 10. Application Submission Recommendation

ADR application submission expects:

- `school_id`
- `child` object
- `documents` array
- `grade_id`
- `previous_school`
- `notes`

Current Admissions create application supports:

- `studentName`
- `requestedAcademicYearId`
- `requestedGradeId`
- `source`
- Optional `leadId`

Gaps:

- Child details granularity is missing from the current `Application` model.
- Applicant ownership is missing.
- Document attachments are separate and school-scoped.
- Draft/submitted workflow differs from the current create-and-submit school-dashboard flow.
- Required document status is not backed by a required-documents model.
- School selection without school membership is not supported by `requireApplicationsScope()`.
- Grade availability for a public selected school needs a safe read path.
- Applicant status labels differ from current core Admissions status labels.

Recommended minimal implementation path:

- Sprint 18B should establish account/profile/access only.
- Sprint 18C should establish safe school discovery and required document read model.
- Sprint 18D should introduce applicant-owned request creation/list/read/submit after ownership and status mapping are designed.

Do not combine account creation and application submission unless the schema, ownership model, and access tests are already low risk.

## 11. Status Mapping Recommendation

ADR statuses:

- `draft`
- `submitted`
- `under_review`
- `accepted`
- `needs_action`
- `rejected`

Current Admissions API statuses:

- `submitted`
- `documents_pending`
- `under_review`
- `accepted`
- `waitlisted`
- `rejected`

Recommended portal presenter mapping:

- Preserve core Admissions statuses internally.
- Do not change core Admissions statuses just to match ADR labels.
- Map `DOCUMENTS_PENDING` to `draft` when an application has not been submitted yet.
- Map `DOCUMENTS_PENDING` to `needs_action` when the request is submitted but missing required documents or applicant action.
- Map `WAITLISTED` to `under_review` only if product does not want a distinct portal `waitlisted` label.
- Prefer adding a distinct portal `waitlisted` status if product accepts it.

Recommended presenter-derived fields:

- `status_label`
- `status_description`
- `progress_value`
- `missing_items_count`

These should be calculated in the applicant portal presenter layer where possible.

## 12. Security and Tenancy Model

Applicant Portal routes are not school-dashboard routes.

Security rules for future implementation:

- Applicant actor has no school membership.
- Applicant actor must not activate normal schoolScope behavior unless a route explicitly resolves a target school.
- Applicant can access only its own profile and own requests.
- Applicant cannot guess application ids across applicants.
- Applicant cannot read internal school application queues.
- School users cannot use Applicant Portal routes to bypass Admissions permissions.
- School-dashboard Admissions remains school-scoped and permission-gated.
- Public school search must expose only safe public fields.
- File uploads/downloads must enforce applicant ownership or application ownership.
- Any accepted application to parent/guardian/student conversion must be a future explicit workflow.
- Applicant tokens must not grant Parent App access.

The current global guard pattern is not enough for applicant routes because membershipless non-platform users fail `ScopeResolverGuard`. A future implementation should add a portal-specific access pattern, for example:

- `ApplicantPortalAccessService`
- Route-level custom ownership checks
- Optional applicant-specific guard for routes that need authenticated applicant identity

A new global guard is not necessarily required. In fact, changing global school-scope behavior would be higher risk than adding applicant-route-specific access checks.

This is a significant architecture boundary. A short ADR is recommended before runtime implementation if the team formalizes membershipless authenticated actors, applicant-owned file access, cross-school application ownership, or applicant-to-parent conversion policy.

## 13. Future Route Surface Recommendation

The following routes are proposed only. They do not exist today.

Public or semi-public:

- `GET /api/v1/applicant-portal/schools`
- `GET /api/v1/applicant-portal/schools/:schoolId`
- `GET /api/v1/applicant-portal/schools/:schoolId/admission-required-documents`

Applicant account/auth:

- `POST /api/v1/applicant-portal/accounts`
- `POST /api/v1/applicant-portal/login` or reuse `POST /api/v1/auth/login`
- `POST /api/v1/applicant-portal/logout` or reuse auth logout
- `GET /api/v1/applicant-portal/profile`

Requests:

- `POST /api/v1/applicant-portal/requests`
- `GET /api/v1/applicant-portal/requests`
- `GET /api/v1/applicant-portal/requests/:requestId`
- Optional `PATCH /api/v1/applicant-portal/requests/:requestId`
- Optional `POST /api/v1/applicant-portal/requests/:requestId/submit`

Documents:

- Future safe document upload/link flow, preferably through the Files module or an applicant-safe adapter over it.

Do not expose:

- School-dashboard admissions queue.
- Decision mutation by applicant.
- Enrollment handoff by applicant.
- Direct student creation by applicant.
- Parent-child link mutation before acceptance policy.
- Platform-admin data.

## 14. Data Model Gap Matrix

| Concern | Current state | Gap | Recommended future change | Requires migration? | Risk level |
| --- | --- | --- | --- | --- | --- |
| Applicant profile metadata | `User` has identity fields, but no `ApplicantProfile` | Relationship/city/applicant-specific data has no safe home | Add `ApplicantProfile` owned by `UserType.APPLICANT` | Yes | High |
| Applicant account ownership | Auth can issue tokens for active users, but normal protected routes require membership | No formal membershipless applicant access pattern | Add applicant-specific access service/guard pattern | Maybe | High |
| Application ownership by applicant | `Application` is school/organization scoped only | Applicant cannot own/list/read only own requests | Add `Application.applicantUserId` or dedicated applicant request relation | Yes | High |
| School discovery public fields | `School` and `SchoolProfile` have candidate display fields | No public safe discovery route or visibility policy | Add Applicant Portal school presenter with explicit active/safe filters | No for basic fields | Medium |
| Required documents | `ApplicationDocument` stores linked submitted docs | No required-document config per school/grade | Add required-document model/read endpoint after owner is chosen | Likely yes | Medium |
| Document upload/linking | Files module stores metadata and signed download flow | Existing file routes are permission/school-scoped, not applicant-owned | Add applicant-safe file ownership/linking policy | Maybe | High |
| Status presentation | Admissions core has canonical statuses | ADR portal labels differ | Add portal presenter mapping | No | Medium |
| Notifications count | ADR mentions portal stats/requests signals | No applicant notification engine/source | Defer or derive from request status/missing docs | No initially | Low |
| Accepted application conversion | Enrollment handoff is preview-only | No automatic Guardian/Student/Enrollment creation | Keep deferred; define explicit school-side workflow | Likely yes | High |
| Parent/guardian linking | `Guardian.userId` and `Student.userId` support operational linking | No applicant-to-parent conversion policy | Convert only after accepted/handoff policy | Maybe | High |
| schoolScope handling | School-scoped models inject `schoolId` from active membership | Applicant has no active membership | Avoid normal schoolScope for applicant routes unless target school is explicit | Maybe | High |
| Permissions/roles | Seeded permissions cover admissions/files/students/platform, no applicant portal role | Applicant should not receive school role permissions | Use applicant route ownership checks, not school role permissions | No initially | Medium |
| Security tests | Existing tests cover school tenancy, parent ownership, absent deferred routes | No applicant ownership/security tests yet | Add applicant-specific E2E and security tests in implementation sprints | No | High |

## 15. Recommended Sprint Breakdown

### Sprint 18B - Applicant Account and Portal Access Foundation

- Applicant account/profile foundation.
- `UserType.APPLICANT` identity handling.
- Route-level applicant access boundary.
- Profile read.
- No application submission yet.

### Sprint 18C - School Discovery and Required Documents

- Safe school search.
- Safe school details.
- Required documents/read model.
- No admissions mutation yet if required documents need schema work.

### Sprint 18D - Applicant Application Submission Foundation

- Create/list/read own requests.
- Link documents.
- Submit application.
- Reuse Admissions core safely.
- Preserve applicant ownership.
- Add applicant portal status presenter.

### Sprint 18E - Applicant Portal Final Closeout Audit

- Documentation-only closeout.
- Verification matrix.
- Deferred conversion/linking policy.

Alternative:

If schema changes are small and safe, Sprint 18B may combine account/profile and school discovery. Do not combine account creation and application submission unless ownership, school discovery, documents, and security tests are low risk.

## 16. Testing Requirements for Future Implementation

Future unit tests:

- Applicant account normalization.
- Relationship validation.
- Applicant profile presenter.
- School discovery presenter.
- Status mapping.
- Request ownership policy.

Future E2E tests:

- Create applicant account.
- Login as applicant.
- Read profile.
- Search schools.
- Get required documents.
- Create application for a school.
- List own requests.
- Reject cross-applicant request access.
- School dashboard can see submitted request if implemented.
- Applicant cannot access Parent App child routes.
- Applicant cannot access School Dashboard routes.

Future security tests:

- Applicant has no school membership.
- Applicant cannot guess another applicant request id.
- Applicant cannot access school-scoped dashboard Admissions routes.
- School user cannot use applicant routes to bypass permission checks.
- File ownership is enforced.
- Applicant token does not become parent token.
- Public school discovery leaks no internal fields.

## 17. Explicit Non-Goals

- No runtime implementation in Sprint 18A.
- No parent conversion implementation.
- No student creation by applicant.
- No direct enrollment by applicant.
- No school decision mutation by applicant.
- No public exposure of internal Admissions queue.
- No platform-admin integration.
- No billing/payment/seat-limit changes.
- No feature-control runtime enforcement.
- No Smart Pickup.
- No Add Child claim approval.
- No cross-school parent dashboard.
- No notifications engine unless separately scoped.
- No external email delivery unless separately scoped.
- No changes to core Auth login contract in this audit.

## 18. ADR Recommendation

Existing ADRs and `USER_TYPES.md` are enough to justify this documentation audit and the product distinction between `APPLICANT` and `PARENT`.

For a narrow Sprint 18B that only creates an applicant account/profile foundation and uses route-local applicant access checks without changing global school-scope behavior, a new ADR is not strictly required.

A new ADR is recommended before runtime implementation if the team decides to introduce or formalize any of these:

- Membershipless authenticated actors as a general access pattern.
- Applicant-to-parent conversion policy.
- Cross-school applicant identity ownership rules.
- Public school discovery policy.
- Applicant-owned file access policy.
- Any change to global guard or school-scope behavior.

If Sprint 18B changes the global guard model, it should not proceed without an ADR.

## 19. Final Recommendation

Proceed to Sprint 18B, but keep it narrow.

Sprint 18B should include:

- Applicant account/profile foundation for `UserType.APPLICANT`.
- No school membership or organization membership for the applicant account.
- Applicant-only route access boundary, preferably through an `ApplicantPortalAccessService`.
- Applicant profile read.
- Explicit tests proving applicant tokens do not grant Parent App, Student App, Teacher App, School Dashboard, or school-scoped Admissions access.

Sprint 18B must defer:

- Application submission.
- Document upload/linking.
- Required document configuration.
- Public school discovery if visibility policy is not ready.
- Applicant-to-parent conversion.
- Guardian/student/enrollment creation.
- Any decision or enrollment handoff mutation by the applicant.

No ADR is mandatory before a narrow 18B that leaves global guards untouched. A short ADR is recommended before any implementation that formalizes membershipless access beyond Applicant Portal routes, adds applicant-owned application/file data, exposes public school discovery, or defines accepted-application conversion.
