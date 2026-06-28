# ADM-REG-1B — Registration Contract Decision Lock

Date: 2026-06-28

Baseline verified from `git log --oneline -10`: `4d9ec5c docs: audit admissions registration reality`.

Sprint type: Documentation-only decision-lock sprint.

Runtime change status: none. This sprint intentionally does not change source code, Prisma schema, migrations, DTOs, presenters, tests, packages, generated files, seeds, permissions, Parent App behavior, Student App behavior, or runtime contracts.

## 1. Executive Decision

V1 registration should proceed in this order:

1. Option C — Shared Foundation First.
2. Option A — School Registration Wizard First.
3. Option B — Accepted Applicant Conversion later, implemented as handoff-to-school-registration-wizard, not automatic conversion.

Locked decisions:

- Repair Student and Guardian profile persistence before building a registration wizard.
- Build a school-controlled registration workflow before applicant conversion.
- Do not mutate `UserType.APPLICANT` into `UserType.PARENT`.
- Do not grant applicant users school membership automatically.
- Use accepted applications to prefill a school-side registration workflow after explicit school confirmation.
- Parent App visibility remains blocked until the full operational parent/guardian/student/enrollment chain exists.
- Student App visibility remains blocked until the full operational student account/student/enrollment chain exists.

Reason: ADM-REG-1A proved the backend already has manual Students, Guardians, accounts, links, and enrollments, but rich Student/Guardian DTO fields are not fully persisted and accepted-applicant conversion is intentionally deferred by ADR-0003. Building conversion before repairing those contracts would bake in silent data loss and unresolved identity semantics.

Final V1 direction: small, explicit, auditable, school-controlled registration.

## 2. Source Evidence Reviewed

Required governance and audit inputs:

- `docs/sprint-adm-reg-1a-registration-reality-audit.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `MODULES.md`
- `DOMAIN_GLOSSARY.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `PRISMA_CONVENTIONS.md`
- `API_CONTRACT_RULES.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `docs/sprint-18n-applicant-portal-final-closeout-audit.md`

Current backend contract evidence:

- `prisma/schema.prisma`
- `src/modules/students/students/dto/student.dto.ts`
- `src/modules/students/students/presenters/student.presenter.ts`
- `src/modules/students/students/application/create-student.use-case.ts`
- `src/modules/students/guardians/dto/guardian.dto.ts`
- `src/modules/students/guardians/presenters/guardian.presenter.ts`
- `src/modules/students/guardians/application/create-guardian.use-case.ts`
- `src/modules/students/enrollments/application/create-enrollment.use-case.ts`
- `src/modules/admissions/applications/presenters/application.presenter.ts`
- `src/modules/applicant-portal/infrastructure/applicant-portal.repository.ts`
- `src/modules/parent-app/access/parent-app-guardian-read.adapter.ts`
- `src/modules/student-app/access/student-app-student-read.adapter.ts`

Frontend repository note: this backend repository does not include the frontend codebase. These decisions are therefore locked against backend reality, backend DTOs, backend presenters, Prisma models, ADRs, and backend audit docs only.

## 3. Decision 1 — V1 Registration Path

Evaluated options:

| Option | Description | Decision | Reason |
| --- | --- | --- | --- |
| Option A — School Registration Wizard First | School staff create/link Student, Guardians, StudentGuardian links, optional Parent/Student accounts, and Enrollment through a controlled workflow. | Accepted after profile repair | This matches the current operational ownership model and avoids hidden applicant identity mutation. |
| Option B — Accepted Applicant Conversion First | Accepted Admissions application directly creates operational records and accounts. | Rejected as first implementation | ADR-0003 defers conversion; identity, profile persistence, and rollback semantics are not locked enough for direct conversion. |
| Option C — Shared Foundation First | Repair Student/Guardian profile persistence and formalize contracts before either wizard or conversion. | Locked as immediate next path | Current DTOs accept fields that are not persisted. This must be fixed before a registration workflow can be trusted. |

Locked V1 order:

1. Shared foundation first: Student/Guardian profile persistence repair.
2. School Registration Wizard second: controlled school-side registration.
3. Accepted Applicant Conversion third: handoff into the school wizard, not direct automatic conversion.

What is intentionally not implemented yet:

- No applicant-to-parent conversion.
- No accepted-application operational record creation.
- No automatic account creation from acceptance.
- No one-shot registration mega sprint.
- No frontend assumptions beyond current backend contracts.

Future sprint dependency:

- `ADM-REG-1C` depends on this decision for which fields become durable.
- `ADM-REG-1D` depends on `ADM-REG-1C` so the wizard does not preserve data into null-only fields.
- `ADM-REG-1E` and `ADM-REG-1F` depend on the wizard contract.

## 4. Decision 2 — Student V1 Contract

Student V1 rule:

- V1 must persist V1-safe Student profile fields that are already accepted by DTOs and expected in responses.
- V1 must not keep accepting fields that are silently discarded.
- English and Arabic name parts should be durable after profile repair.
- Gender, nationality, and contact fields should be durable after profile repair.
- `student_id` is not a real external student code in V1 and must remain explicitly null-only or be removed only through an approved breaking-contract process.
- `applicationId` and `userId` remain internal operational links, not general Student profile response fields.

Student V1 Field Decision Table:

| Field | Current DTO accepts? | Current Prisma stores? | Current Presenter returns? | V1 decision | Reason | Future sprint |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | No | Yes, `Student.id` | Yes | SUPPORTED_NOW | Stable internal/public Student identifier in current response. | None |
| `student_id` | No | No | Yes, always `null` | REMOVE_OR_MARK_NULL_ONLY | No external student-code policy or storage exists. Do not pretend it is durable. | Deferred backlog |
| `name` | Yes | Derived from `firstName`/`lastName` only | Yes, derived | SUPPORTED_NOW | Useful display/compatibility alias, not canonical storage. | None |
| `first_name_en` | Yes | Yes, `firstName` | Yes | SUPPORTED_NOW | Current canonical first-name storage. | None |
| `father_name_en` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted today but discarded; should be persisted as V1-safe profile data. | ADM-REG-1C |
| `grandfather_name_en` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted today but discarded; should be persisted as V1-safe profile data. | ADM-REG-1C |
| `family_name_en` | Yes | Yes, `lastName` | Yes | SUPPORTED_NOW | Current canonical family-name storage. | None |
| `first_name_ar` | Yes | No Arabic column | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Arabic names are V1 registration profile data and should not be silently lost. | ADM-REG-1C |
| `father_name_ar` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Arabic name part should be durable if accepted. | ADM-REG-1C |
| `grandfather_name_ar` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Arabic name part should be durable if accepted. | ADM-REG-1C |
| `family_name_ar` | Yes | No Arabic column | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Arabic family name should be durable if accepted. | ADM-REG-1C |
| `full_name_en` | Yes | No single full-name column | Yes, derived | SUPPORTED_AFTER_PROFILE_REPAIR | Should remain derived from durable English name parts, with input accepted as compatibility. | ADM-REG-1C |
| `full_name_ar` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Should be derived from durable Arabic name parts or stored only if a deliberate denormalized field is chosen. | ADM-REG-1C |
| `dateOfBirth` | Yes | Yes, `birthDate` | Yes | SUPPORTED_NOW | Current durable date field. | None |
| `date_of_birth` | Yes | Yes, `birthDate` | Yes | SUPPORTED_NOW | Current snake_case compatibility alias for `birthDate`. | None |
| `gender` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted today but discarded; V1 registration needs durable value. | ADM-REG-1C |
| `nationality` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted today but discarded; V1 registration needs durable value. | ADM-REG-1C |
| `status` | Yes | Yes, `status` | Yes | SUPPORTED_NOW | Operational Student lifecycle field already persists. | None |
| `contact.address_line` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted today but discarded; should be durable profile contact data. | ADM-REG-1C |
| `contact.city` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted today but discarded; should be durable profile contact data. | ADM-REG-1C |
| `contact.district` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted today but discarded; should be durable profile contact data. | ADM-REG-1C |
| `contact.student_phone` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted today but discarded; should be durable if V1 collects it. | ADM-REG-1C |
| `contact.student_email` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted today but discarded; should be durable if V1 collects it. | ADM-REG-1C |
| `created_at` | No | Yes, `createdAt` | Yes | SUPPORTED_NOW | Output-only timestamp. | None |
| `updated_at` | No | Yes, `updatedAt` | Yes | SUPPORTED_NOW | Output-only timestamp. | None |
| `applicationId` | No in Student DTO | Yes, nullable `Student.applicationId` | No | INTERNAL_ONLY | Source/idempotency link for future registration, not a general Student profile field. | ADM-REG-1D / ADM-REG-1F |
| `userId` | No in Student DTO | Yes, nullable unique `Student.userId` | No | INTERNAL_ONLY | Account linkage field used by Student App activation and account endpoints. | ADM-REG-1D |

Explicit Student contract locks:

- V1 should persist Arabic names after profile repair.
- V1 should persist full name parts after profile repair.
- V1 should persist gender and nationality after profile repair.
- V1 should persist Student contact fields after profile repair.
- `student_id` is not a real external code in V1.
- `applicationId` is internal-only for registration source/idempotency and must not be added casually to app-facing Student responses.

## 5. Decision 3 — Guardian / Parent V1 Contract

Guardian V1 rule:

- V1 must persist V1-safe Guardian profile fields already accepted by DTOs.
- V1 primary guardian truth belongs to the `StudentGuardian` relationship, not the standalone Guardian profile.
- Parent account creation/linking is optional at registration time, but recommended when Parent App activation is desired.

Guardian V1 Field Decision Table:

| Field | Current DTO accepts? | Current Prisma stores? | Current Presenter returns? | V1 decision | Reason | Future sprint |
| --- | --- | --- | --- | --- | --- | --- |
| `guardianId` | No | Yes, `Guardian.id` | Yes | SUPPORTED_NOW | Stable Guardian identifier in current response. | None |
| `full_name` | Yes | Derived from `firstName`/`lastName` only | Yes, derived | SUPPORTED_NOW | Useful display/compatibility alias, not canonical single-field storage. | None |
| `first_name` | Yes | Yes, `firstName` | No direct field; included in `full_name` | SUPPORTED_NOW | Current canonical first-name storage. | None |
| `last_name` | Yes | Yes, `lastName` | No direct field; included in `full_name` | SUPPORTED_NOW | Current canonical last-name storage. | None |
| `relation` | Yes | Yes, `relation` | Yes | SUPPORTED_NOW | Current durable relation field. | None |
| `phone_primary` | Yes | Yes, `phone` | Yes | SUPPORTED_NOW | Current durable primary phone field. | None |
| `phone_secondary` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted today but discarded; should be durable if V1 collects it. | ADM-REG-1C |
| `email` | Yes | Yes, `email` | Yes | SUPPORTED_NOW | Current durable email field. | None |
| `national_id` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted PII must not be silently discarded; persistence requires redaction discipline in logs/responses. | ADM-REG-1C |
| `job_title` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted today but discarded; should be durable if V1 collects it. | ADM-REG-1C |
| `workplace` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Accepted today but discarded; should be durable if V1 collects it. | ADM-REG-1C |
| `is_primary` | Yes | Yes, `Guardian.isPrimary`; relationship APIs use `StudentGuardian.isPrimary` | Yes | SUPPORTED_NOW | Canonical V1 meaning is relationship-level primary guardian for a student. Profile-level flag is not the ownership truth. | ADM-REG-1D cleanup if needed |
| `can_pickup` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Should persist as a V1 registration permission flag only; no advanced pickup behavior is implied. | ADM-REG-1C |
| `can_receive_notifications` | Yes | No | Yes, `null` | SUPPORTED_AFTER_PROFILE_REPAIR | Should persist as a V1 communication preference flag only; no notification engine change is implied. | ADM-REG-1C |
| `userId` | Account link DTO accepts it in link mode | Yes, nullable `Guardian.userId` | No | INTERNAL_ONLY | Operational Parent account linkage for Parent App activation. | ADM-REG-1D |

Explicit Guardian/Parent contract locks:

- V1 should persist `national_id` after profile repair, with PII logging/redaction discipline.
- V1 should persist `job_title` and `workplace` after profile repair.
- V1 should persist `phone_secondary` after profile repair.
- V1 should persist `can_pickup` after profile repair as a registration permission flag only.
- V1 should persist `can_receive_notifications` after profile repair as a communication preference flag only.
- `is_primary` belongs canonically to `StudentGuardian` for a specific student. `Guardian.isPrimary` may remain as a backward-compatible/default field until cleaned up, but it must not replace relationship-level truth.
- Parent account is optional during registration, but recommended when Parent App access should be activated immediately.

## 6. Decision 4 — Applicant Identity and Parent Transition

Evaluated options:

| Option | Description | Decision |
| --- | --- | --- |
| Option A — Applicant remains separate forever | Applicant is only pre-admission; school creates operational accounts separately. | Too rigid as a permanent rule, but safe as current behavior. |
| Option B — Applicant user becomes Parent | Same `User` changes from `APPLICANT` to `PARENT`. | Rejected for V1. |
| Option C — Applicant links to Parent account | Applicant remains historical identity, with separate Parent user created/linked. | Possible later, but must be explicit and audited. |
| Option D — Applicant owns conversion workflow but school confirms | Applicant data pre-fills school-controlled registration; school action creates/links operational identities. | Locked V1 direction. |

Locked V1 identity rule:

- Applicant remains `UserType.APPLICANT` during and after Admissions review unless a future explicit workflow says otherwise.
- Applicant does not automatically become `PARENT`.
- Applicant does not automatically receive a school membership.
- Operational Parent and Student users are created or linked by school-controlled registration action.
- If a future applicant-to-parent link is required, it must be explicit, audited, and probably modeled as a link rather than `UserType` mutation.

ADR-0003 implications:

- ADR-0003 allows future conversion only as a later explicit accepted-application workflow.
- Any conversion work must preserve route-local applicant access and must not weaken global guards or Prisma schoolScope.

Security implications:

- No applicant token may gain Parent App, Student App, School Dashboard, Admissions dashboard, Teacher App, or Platform Admin access.
- No applicant identity may gain school membership without explicit school action and an ADR revisit if the rule changes.

Audit implications:

- Any future conversion or link must audit who confirmed the registration, what source application/request was used, and which operational identities were created or linked.

Parent App implications:

- Parent App must continue to depend on `UserType.PARENT`, active membership, `Guardian.userId`, `StudentGuardian`, active Student, and active Enrollment.
- Applicant login must not activate Parent App visibility.

Future ADR revisit triggers:

- Mutating `UserType.APPLICANT`.
- Granting applicants school membership.
- Making Applicant Portal mandatory for parent onboarding.
- Adding applicant-to-parent link semantics that affect authentication or app access.

## 7. Decision 5 — Accepted Application Conversion

Locked V1 decision: accepted application conversion is handoff-to-school-registration-wizard.

It is not automatic.

It is not direct manual-only forever.

It is not implemented in this sprint.

Meaning:

1. Admissions accepted application provides prefilled student/guardian/enrollment draft data.
2. School staff confirms or edits that data in a school-side registration workflow.
3. Only the school-side registration workflow creates or links:
   - Student
   - Guardian(s)
   - StudentGuardian link(s)
   - Enrollment
   - Parent account(s), if requested
   - Student account, if requested
4. Applicant identity remains separate unless a future explicit link workflow is approved.

Current endpoint limitation:

- `POST /api/v1/admissions/applications/:id/enroll` is not enough for V1 registration because `presentApplicationEnrollmentHandoff` returns draft data only, including `guardianDrafts: []`, and does not create operational records.
- Enrollment with `applicationId` only validates handoff compatibility for an existing `studentId`.

## 8. Decision 6 — Parent App Activation

Locked required chain before a parent can see a child:

1. Active `UserType.PARENT` user.
2. Active school membership in current request context.
3. `Guardian.userId = parent user id`.
4. Guardian not deleted.
5. `StudentGuardian` link exists.
6. Student is active and not deleted.
7. Enrollment is active and not deleted.
8. Current school scope matches the operational records.

Evidence: `ParentAppGuardianReadAdapter` filters parent guardians by active parent user and linked active students, then filters active owned enrollments.

Registration wizard decision:

- Parent account create/link should be optional but recommended during school registration.
- Parent App visibility must not activate without the full operational chain.
- If parent account creation/linking is skipped, registration can still create Student, Guardian, link, and Enrollment, but Parent App access remains unavailable until account linking is completed.

## 9. Decision 7 — Student App Activation

Locked required chain before a student can access Student App:

1. Active `UserType.STUDENT` user.
2. Active school membership in current request context.
3. `Student.userId = student user id`.
4. Student is active and not deleted.
5. Enrollment is active and not deleted.
6. Current school scope matches the operational records.

Evidence: `StudentAppStudentReadAdapter` resolves a linked active Student by `userId`, active `UserType.STUDENT`, and active Enrollment.

Registration wizard decision:

- Student account create/link is optional in the registration wizard.
- Student record and Enrollment are required for registration.
- Student App activation remains unavailable until Student account linkage exists.

## 10. Decision 8 — School Registration Wizard Direction

Locked direction: V1 should have a school-side unified registration command, but only after Student/Guardian profile persistence repair.

Intended future wizard, high level only:

Input:

- Student profile.
- Guardian profiles.
- Student-guardian relationships, including primary guardian.
- Enrollment placement.
- Optional Parent account create/link requests.
- Optional Student account create/link request.
- Optional `applicationId` source.

Output:

- Created or linked Student.
- Created or linked Guardian(s).
- Created StudentGuardian link(s).
- Created Enrollment.
- Created or linked accounts if requested.
- Warnings or skipped optional steps.

Locked non-goals for wizard:

- No finance.
- No HR.
- No transport.
- No advanced smart pickup.
- No bulk import.
- No automatic applicant conversion.
- No mobile-app direct registration.
- No detailed DTO design in this decision-lock sprint.

## 11. Decision 9 — Persistence Repair Before Wizard

Locked data persistence decision:

- Choose A: persist the rich V1-safe fields currently accepted by Student and Guardian DTOs.
- Do not choose B as the default because removing shipped fields may break frontend contracts without a separate approved contract change.
- Do not choose C as the default because continuing null-only behavior for collected registration fields preserves silent data loss.

Exception:

- `student_id` remains null-only/deferred because no student-code policy exists.

Owning sprint:

- `ADM-REG-1C — Student Guardian Profile Persistence Repair`

Minimum 1C outcome:

- Durable Student English/Arabic name parts.
- Durable Student gender, nationality, and contact fields.
- Durable Guardian secondary phone, national id, job/workplace, pickup flag, and notification preference.
- Presenter no longer returns null for fields that V1 officially collects.
- Clear handling for full-name derived fields.
- No applicant conversion and no registration wizard in 1C.

## 12. Decision 10 — Transaction, Idempotency, Audit

Locked high-level rules for future wizard:

- Registration must be transactional where possible.
- No partial Student without required Guardian and Enrollment unless the command explicitly allows a draft/incomplete registration state.
- Duplicate handling must be explicit for Student, Guardian, Parent user, Student user, and application source.
- Application-source registration must be idempotent by `applicationId` if used.
- Account creation/linking must have clear rollback or recovery rules.
- Audit logs must be written after durable changes.
- Audit logs must identify actor, school, source application when present, created/linked resources, and skipped optional steps.
- Password or credential material must not be written into audit logs.

No implementation is authorized by these rules in ADM-REG-1B.

## 13. Security and Tenancy Lock

Locked security posture:

- School-scoped only.
- No cross-school registration.
- No applicant route bypass.
- No global guard weakening.
- No schoolScope weakening.
- No raw `passwordHash`, `roleId`, `membershipId`, `deletedAt`, storage keys, or unnecessary internal ids in app-facing responses.
- Parent App visibility only through operational Parent/Guardian/StudentGuardian/Student/Enrollment ownership chain.
- Student App visibility only through operational Student user/Student/Enrollment ownership chain.
- Applicant Portal remains route-local and membershipless before explicit accepted-application workflow changes.
- Future conversion that changes ADR-0003 requires ADR update first.

Additional security expectation for future implementation:

- Because ADM-REG-1A found applicant-owned models are protected by explicit filters rather than automatic `SCHOOL_SCOPED_MODELS`, any future school-side direct access to applicant request/document models must add focused tenancy tests or revisit scope registration.

## 14. Explicit Non-Goals

ADM-REG-1B does not implement:

- New APIs.
- New DTOs.
- New presenters.
- New Prisma fields.
- New migrations.
- New use cases.
- New repositories.
- New tests.
- New permissions.
- New seeds.
- New frontend contracts.
- Accepted applicant conversion.
- Registration wizard runtime.
- Student profile persistence.
- Guardian profile persistence.
- Account linking changes.
- Parent App changes.
- Student App changes.

V1 registration non-goals:

- Automatic applicant-to-parent conversion.
- Implicit applicant membership creation.
- Automatic Parent App activation from acceptance.
- Automatic Student App activation from acceptance.
- Finance.
- HR.
- Wallet.
- Marketplace.
- Advanced smart pickup.
- Advanced analytics builder.
- Enterprise billing engine.
- Bulk import.
- Mobile-app direct registration.

## 15. Deferred Backlog

Deferred beyond the immediate implementation sequence:

- External student code policy for `student_id`.
- Applicant-to-parent historical link model, if product later needs it.
- Applicant notifications during conversion/handoff.
- Rich applicant-to-guardian draft extraction beyond safe handoff expansion.
- Parent duplicate resolution across schools and organizations.
- Student duplicate detection policy.
- Bulk registration/import.
- Advanced pickup authorization behavior tied to `can_pickup`.
- Notification routing behavior tied to `can_receive_notifications`.
- Public/frontend-backed contract audit against the actual frontend repository.

## 16. Future ADR Revisit Triggers

Create a new ADR or update ADR-0003 before implementation if any future sprint:

- Mutates `UserType.APPLICANT` into `UserType.PARENT` or `UserType.STUDENT`.
- Grants applicants school or organization memberships.
- Allows applicants to create operational Students, Guardians, StudentGuardian links, Enrollments, or accounts directly.
- Changes global `ScopeResolverGuard`, `PermissionsGuard`, or Prisma `schoolScope`.
- Makes Applicant Portal mandatory for all parent onboarding.
- Adds a cross-school applicant identity/linking model.
- Exposes richer public school or operational data through Applicant Portal.
- Converts accepted applications without school staff confirmation.

## 17. Recommended Next Sprints

| Sprint | Type | Goal | Scope | Non-goals | Dependencies | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| `ADM-REG-1C — Student Guardian Profile Persistence Repair` | Implementation | Make current Student/Guardian V1-safe fields durable. | Prisma migration, DTO/use-case/presenter repair, tests for field persistence and no null-only loss. | No wizard, no applicant conversion, no account behavior changes. | ADM-REG-1B | Prevents registration workflow from storing incomplete profiles. |
| `ADM-REG-1D — School Registration Wizard Foundation` | Implementation | Add school-controlled registration orchestration. | Transactional create/link Student, Guardians, StudentGuardian links, Enrollment, optional accounts, audit, idempotency rules. | No automatic applicant conversion, no mobile registration, no finance/HR/transport. | ADM-REG-1C | Creates the operational path that Parent App and Student App can trust. |
| `ADM-REG-1E — Accepted Applicant Conversion Audit / Handoff Expansion` | Audit/decision-lock | Define how accepted applicant data maps into the wizard. | Application/request/document evidence, prefill fields, source/idempotency policy, applicant identity/link decision review. | No runtime conversion. | ADM-REG-1D design known | Keeps applicant conversion from smuggling in identity or tenancy changes. |
| `ADM-REG-1F — Accepted Application Handoff-to-Wizard Implementation` | Implementation | Implement accepted-application prefill into the school wizard. | Expand handoff data, route school staff through wizard, create operational records only through school-confirmed workflow. | No automatic applicant user mutation, no implicit membership, no direct applicant-created operational records. | ADM-REG-1E and likely ADR confirmation if identity semantics change | Safely connects Admissions to registration without bypassing operational ownership chains. |

Recommended immediate next sprint:

`ADM-REG-1C — Student Guardian Profile Persistence Repair`

## 18. Final Verdict

ADM_REG_1B_CONTRACT_DECISIONS_LOCKED

The backend evidence is sufficient to lock conservative V1 decisions. V1 should repair persisted Student/Guardian profile contracts first, then build a school-controlled registration wizard, then connect accepted applications to that wizard through explicit handoff. Applicant users must not automatically become Parents, must not receive school memberships automatically, and must not activate Parent App or Student App access without the existing operational ownership chains.
