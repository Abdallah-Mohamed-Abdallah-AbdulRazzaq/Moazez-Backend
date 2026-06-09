# ADR-0003: Applicant Portal Pre-Admission Account Boundary

## Status

Accepted — 2026-06-09

## Context

Moazez supports multiple actor types across platform, organization, school, teacher, student, parent, and applicant surfaces.

`UserType.PARENT` is the guardian-side actor for operational parent accounts linked to children through Guardian, StudentGuardian, active Enrollment, and school context.

`UserType.APPLICANT` is already defined as a temporary pre-admission actor. Applicant Portal is an optional path for new external users who are not yet attached to any school, organization, student, guardian, or enrollment.

Existing school-managed parent/guardian creation remains the primary operational path for many schools. School Dashboard may create or link Guardian/Parent accounts, and those accounts become `UserType.PARENT` with access limited to linked children.

The project needs a clear boundary before implementing Applicant Portal runtime behavior. Membershipless authenticated non-platform actors are sensitive because existing route protection commonly assumes active membership, school scope, and permissions. Applicant Portal must not weaken school tenancy, Parent App ownership rules, global guards, or Prisma `schoolScope`.

## Decision

1. Applicant Portal pre-admission accounts use `UserType.APPLICANT`.
2. Applicant accounts are membershipless before acceptance.
3. Applicant accounts are not `UserType.PARENT`.
4. Relationship labels such as `father`, `mother`, `guardian`, and `relative` remain relationship/profile attributes, not user types.
5. Applicant Portal is an optional onboarding/acquisition channel.
6. Existing school-created Guardian/Parent account flows remain valid and unchanged.
7. Applicant Portal routes must use route-local applicant access checks such as `ApplicantPortalAccessService` or a narrowly scoped applicant guard.
8. Implementation must not loosen global `ScopeResolverGuard`, `PermissionsGuard`, or Prisma `schoolScope`.
9. Applicant-owned data must be protected by explicit applicant ownership checks.
10. Applicant-to-parent/guardian/student/enrollment conversion is deferred to a later explicit accepted-application workflow.

## Consequences

### Positive

- Clean separation between pre-admission applicants and operational parents.
- Existing Parent App ownership model remains intact.
- School-created parent accounts remain unchanged.
- Applicant Portal can be implemented without giving applicants school membership.
- Public/safe school discovery can be designed without leaking tenant internals.
- Future accepted-application conversion can be explicitly audited and tested.

### Negative

- Applicant Portal cannot reuse ordinary school-scoped route assumptions directly.
- Applicant routes need dedicated access checks.
- Applicant-owned application/file ownership needs explicit schema and tests later.
- Some flows may require additional schema such as `ApplicantProfile` and applicant-owned application relation.
- Conversion from applicant to parent remains a separate product/security decision.

## Implementation Guidance

- Future Applicant Portal runtime should live under `src/modules/applicant-portal/**`.
- It should be a portal-facing composition layer, not Parent App and not School Dashboard.
- It may delegate to IAM/Auth, Admissions, Files, Schools, and Settings where safe.
- It must not duplicate Admissions decision logic.
- It must not expose school-dashboard Admissions queues to applicants.
- It must not allow applicants to mutate school decisions.
- It must not allow applicants to create operational Students, Guardians, StudentGuardian links, or Enrollments directly.
- It must not require every parent account to originate from Applicant Portal.
- It must not migrate existing parent accounts to applicant accounts.
- It must not grant applicants school permissions or memberships before acceptance.
- It must preserve `/api/v1` route conventions.
- ADR route examples from Parent App files must be treated as product intent, not literal backend contracts.

## Security Rules

- Applicant tokens must not grant Parent App access.
- Applicant tokens must not grant Student App, Teacher App, School Dashboard, or Platform Admin access.
- Applicant routes must reject cross-applicant access by guessed ids.
- Public school discovery must expose safe active school fields only.
- Applicant-owned uploads/documents must not expose raw storage keys.
- Applicant file access must be tied to applicant/request ownership.
- School users must not use Applicant Portal routes to bypass Admissions permissions.
- Applicant access must not bypass tenant isolation for school-scoped data.
- Global guards and Prisma schoolScope must not be weakened for Applicant Portal.

## Deferred Work

- Exact `ApplicantProfile` schema.
- Exact applicant-owned application relation.
- Exact required admission document model.
- Exact applicant file upload/linking model.
- Exact school discovery route response.
- Exact application submission route shape.
- Exact accepted-application conversion to Guardian/Parent/Student/Enrollment.
- Whether applicant login uses global `POST /api/v1/auth/login` or applicant-specific login route.
- Notification/email behavior for applicants.
- Public school visibility policy details beyond safe active-only principle.

## Verification Expectations

Future implementation must include tests for:

- Applicant account has no school or organization membership.
- Applicant can access only Applicant Portal routes.
- Applicant cannot access Parent App child routes.
- Applicant cannot access school-scoped Admissions dashboard routes.
- Applicant cannot access Teacher App, Student App, School Dashboard, or Platform Admin routes.
- Cross-applicant request access is denied.
- Public school discovery leaks no internal fields.
- Existing school-managed parent/guardian account flow remains unchanged.

## Revisit Triggers

This ADR should be revisited if:

- Applicant-to-parent conversion is implemented.
- Cross-school applicant identity behavior is expanded.
- Public school discovery exposes richer operational fields.
- Applicant-owned files/documents are added.
- Global guard or schoolScope behavior must change.
- Applicants receive school membership before acceptance.
- Applicant Portal becomes mandatory for all parent onboarding, which is not the current decision.
