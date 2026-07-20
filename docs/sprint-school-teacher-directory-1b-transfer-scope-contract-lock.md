# SCHOOL-TEACHER-DIRECTORY-1B-6A — Organization Transfer Scope Contract Lock

## 1. Status, branch, baseline, and scope

| Item                              | Value                                                           |
| --------------------------------- | --------------------------------------------------------------- |
| Status                            | Read-only contract lock complete                                |
| Branch                            | `feat/school-teacher-directory-1b-transfer-scope-contract-lock` |
| Baseline and inspected HEAD       | `11f651240e53930e6827678a60f0762d80a6de3b`                      |
| Inspected `origin/main`           | `11f651240e53930e6827678a60f0762d80a6de3b`                      |
| Runtime changes                   | None                                                            |
| Route/controller/provider changes | None                                                            |
| Schema/migration/seed changes     | None                                                            |
| Database writes                   | None                                                            |

This document resolves the Organization-scope and immediate cross-School
Teacher transfer contract for a later `1B-6` runtime phase. It does not
implement the route. Throughout this document:

- **Verified current behavior** means the statement was checked against the
  merged code at the baseline above.
- **Locked future design** means an exact requirement for the later runtime
  implementation; it does not exist yet.
- **Remaining unresolved blocker** means a decision that would prevent runtime
  authorization. No such blocker remains at the end of this contract.

The transfer addressed here starts from a live source `TeacherProfile`. The
separate 0A case in which all prior Profiles are already archived and there is
no live source is not silently folded into this route.

## 2. Inspected repository paths

The reality inspection opened the relevant methods and surrounding types, not
only search matches:

- `src/main.ts`
- `src/app.module.ts`
- `src/common/context/context.middleware.ts`
- `src/common/context/request-context.ts`
- `src/common/decorators/required-permissions.decorator.ts`
- `src/common/decorators/school-management-only.decorator.ts`
- `src/common/decorators/platform-scope.decorator.ts`
- `src/common/guards/jwt-auth.guard.ts`
- `src/common/guards/scope-resolver.guard.ts`
- `src/common/guards/permissions.guard.ts`
- `src/common/guards/permissions.guard.spec.ts`
- `src/common/exceptions/global-exception.filter.ts`
- `src/infrastructure/database/prisma.service.ts`
- `src/infrastructure/database/prisma.module.ts`
- `src/infrastructure/database/school-scope.extension.ts`
- `src/infrastructure/database/platform-bypass.helper.ts`
- `src/modules/iam/auth/domain/token.service.ts`
- `src/modules/iam/auth/application/login.use-case.ts`
- `src/modules/iam/auth/application/me.use-case.ts`
- `src/modules/iam/auth/infrastructure/auth.repository.ts`
- `src/modules/platform-admin/controller/platform-admin.controller.ts`
- `src/modules/platform-admin/platform-admin-context.ts`
- `src/modules/platform-admin/platform-admin.module.ts`
- `src/modules/platform-admin/infrastructure/platform-admin.repository.ts`
- `src/modules/school-support/controller/platform-support.controller.ts`
- `src/modules/school-support/controller/school-support.controller.ts`
- `src/modules/school-support/school-support.module.ts`
- `src/modules/settings/settings-context.ts`
- `src/modules/settings/users/infrastructure/teacher-lifecycle-user.operations.ts`
- `src/modules/settings/users/infrastructure/teacher-lifecycle-membership.operations.ts`
- `src/modules/academics/academics-context.ts`
- `src/modules/academics/teacher-allocation/application/teacher-allocation-lifecycle-read.service.ts`
- `src/modules/academics/teacher-allocation/domain/teacher-allocation-lifecycle-state.ts`
- `src/modules/academics/teacher-allocation/infrastructure/teacher-allocation-lifecycle-transaction.operations.ts`
- `src/modules/teachers/teachers.module.ts`
- `src/modules/teachers/directory/teacher-directory.context.ts`
- `src/modules/teachers/directory/controller/teachers.controller.ts`
- `src/modules/teachers/directory/dto/teacher-directory.dto.ts`
- `src/modules/teachers/directory/domain/teacher-directory-input.ts`
- `src/modules/teachers/directory/domain/teacher-directory.errors.ts`
- `src/modules/teachers/directory/domain/teacher-directory.types.ts`
- `src/modules/teachers/directory/presenters/teacher-directory.presenter.ts`
- `src/modules/teachers/directory/application/change-teacher-employment-status.use-case.ts`
- `src/modules/teachers/directory/application/archive-teacher.use-case.ts`
- `src/modules/teachers/directory/application/rehire-teacher.use-case.ts`
- `src/modules/teachers/lifecycle/application/teacher-lifecycle-unit-of-work.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle.unit-of-work.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle-transaction.operations.ts`
- `src/modules/teachers/lifecycle/domain/teacher-membership-state.ts`
- `src/modules/teachers/lifecycle/domain/teacher-lifecycle-audit.ts`
- `src/modules/teachers/lifecycle/domain/teacher-lifecycle.errors.ts`
- `src/modules/teachers/lifecycle/infrastructure/teacher-lifecycle-audit.writer.ts`
- `src/modules/teachers/profile/domain/teacher-profile.integrity.ts`
- `src/modules/teachers/profile/infrastructure/teacher-profile-lifecycle.operations.ts`
- `src/modules/iam/auth/infrastructure/teacher-lifecycle-session.operations.ts`
- `src/modules/dismissal/requests/infrastructure/dismissal-requests-expiry.repository.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260710135222_baseline_v1/migration.sql`
- `prisma/migrations/20260718115332_teacher_directory_data_foundation/migration.sql`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `test/security/tenancy.platform-admin.spec.ts`
- `ERROR_CATALOG.md`
- the governance and merged Teacher Directory contract/evidence documents
  named by the phase request.

`DIRECTORY_STRUCTURE.md`, named by the repository agent guide, is absent at
this baseline. `DIRECTORY_STRUCTURE_VISUAL.md` is the present structure
reference and was inspected instead.

## 3. Verified actor and Membership reality

### 3.1 Authentication

**Verified current behavior**

1. `RequestContextMiddleware` opens an `AsyncLocalStorage` context with a
   request id and bypass flags. It does not read tenant identifiers from the
   request.
2. The global `JwtAuthGuard` verifies the Bearer access token, resolves the
   backing `Session`, rejects a missing/revoked/wrong-user Session, re-reads
   the User, and rejects every status other than `UserStatus.ACTIVE`.
3. `AuthRepository.findUserById()` filters `User.deletedAt = null`; therefore a
   deleted User is returned as missing. A disabled, invited, or suspended User
   is rejected by the status check.
4. The access-token payload contains `sub`, `type`, `userType`, and `sid`. It
   contains no Membership id, Organization id, or School id.
5. `JwtAuthGuard` initially writes `payload.userType` into `RequestContext.actor`.
   `ScopeResolverGuard` re-reads the User but does not replace the token-derived
   actor type with the current database `User.userType`.

### 3.2 Active Membership selection

**Verified current behavior**

`AuthRepository` uses the `USER_WITH_ACTIVE_MEMBERSHIP` include. It selects
Memberships with only:

```text
status = ACTIVE
deletedAt = null
orderBy startedAt desc
```

`ScopeResolverGuard` then takes `user.memberships[0]`. There is no Membership
selector header, route field, body field, or token claim. The query has no `id`
tie-breaker, does not require `endedAt = null`, does not require the Membership
type to match the User type, and does not filter a deleted or incompatible
Role. Permissions are mapped from that selected Role.

The Prisma schema and migrations do not enforce one active Organization
Membership for an `ORGANIZATION_USER`. The partial unique index
`unique_active_teacher_membership` applies only when
`user_type = 'TEACHER'`. Multiple Organization Membership rows can therefore
exist physically even though `USER_TYPES.md` defines an Organization User as
belonging to one Organization.

### 3.3 Organization and school Membership handling

**Verified current behavior**

- `RequestContext.activeMembership` contains `membershipId`, `organizationId`,
  nullable `schoolId`, `roleId`, and permission codes.
- `ScopeResolverGuard` copies `Membership.organizationId` and `schoolId`
  without an Organization-specific invariant check.
- An Organization-level Membership can have `schoolId = null`, and the
  `organization_admin` test fixture uses that shape. Current code does not
  guarantee it for every `ORGANIZATION_USER`.
- Current school contexts such as `requireTeacherDirectoryScope()`,
  `requireSettingsScope()`, and `requireAcademicsScope()` require a non-null
  `activeMembership.schoolId`. A proper Organization-level actor therefore
  cannot enter the current Teachers, Settings, or Academics use cases through
  those context helpers.
- No current service reads an Organization scope from `req`. The current
  domain context helpers read `AsyncLocalStorage`.
- No current route authorizes an Organization-level actor to operate across
  multiple Schools. Existing cross-School Organization/School administration
  is under `platform-admin` and is reserved for `PLATFORM_USER` actors.

**Current reality result:** Organization identity primitives exist, but active
Organization Membership selection and Role compatibility are not safe enough
for transfer. This is an implementation gap, fully specified by the future
guard contract below rather than an unresolved design decision.

## 4. Verified request-context and guard reality

**Verified current behavior**

The global guards are registered in this exact order in `AppModule`:

1. `JwtAuthGuard`
2. `ScopeResolverGuard`
3. `PermissionsGuard`

`RequiredPermissions` stores `moazez:required_permissions` metadata.
`SchoolManagementOnly` stores `schoolManagementOnly` metadata and permits both
`ORGANIZATION_USER` and `SCHOOL_USER`; it does not validate a specific
Organization. `PlatformScope` stores `moazez:platform_scope`; no guard consumes
that metadata. It is a review marker only.

`PermissionsGuard` reads permission codes from
`activeMembership.permissions`, or from `platformPermissions` for a
membershipless platform actor. Possessing a permission is therefore not an
Organization ownership check.

## 5. Verified Prisma scope reality

**Verified current behavior**

| Question                                                          | Current answer                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Which client injects School scope?                                | Only `PrismaService.scoped`, through `schoolScopeExtension`. The base `PrismaService` does not.                                                                                                  |
| When is `schoolId` injected?                                      | Only when `activeMembership.schoolId` is truthy, the model is listed in `SCHOOL_SCOPED_MODELS`, and bypass is false.                                                                             |
| What happens for an Organization Membership with `schoolId=null`? | No School predicate is injected. A caller that uses `scoped` without an Organization-specific repository can see cross-School rows.                                                              |
| Is `organizationId` injected?                                     | No. There is no Organization-scoped Prisma extension/provider/helper.                                                                                                                            |
| What does `platformBypassScope` do?                               | It toggles `bypassSchoolScope` in the request context. It does not validate a platform actor or Organization ownership.                                                                          |
| Are `Organization`, `School`, and `User` School-scoped?           | No. They are excluded or absent from `SCHOOL_SCOPED_MODELS`; explicit predicates are required.                                                                                                   |
| Do lifecycle transaction clients retain the extension?            | No. `PrismaTeacherLifecycleUnitOfWork` starts `$transaction` on the base `PrismaService` and passes a base `Prisma.TransactionClient`. Every transaction operation supplies explicit predicates. |
| Can same-Organization ownership be proven atomically?             | Yes, but only through new narrow transaction operations that bind both School rows and the source Profile to the trusted Organization inside the existing serializable Unit of Work.             |

`TeacherProfile` is School-scoped and soft-deleted for ordinary scoped calls,
but the existing Teacher lifecycle transaction intentionally uses explicit
`schoolId` predicates on the base transaction client. The current transaction
context is typed and does not expose that client to a controller.

The repository already contains an approved tagged-template `FOR UPDATE`
pattern in `DismissalRequestsExpiryRepository`; it does not use
`$queryRawUnsafe`. That pattern can be reused only inside the narrow future
transfer transaction operations when a row lock cannot be expressed by Prisma
delegates.

### 5.1 Explicitly rejected designs

**Locked future design**

- `platformBypassScope` is not Organization authorization.
- `@PlatformScope()` is forbidden on the Organization transfer controller,
  coordinator, guard, or repository.
- No controller/use case receives `PrismaService`, `Prisma.TransactionClient`,
  an unscoped client, or model delegates.
- No request-supplied `organizationId` or `sourceSchoolId` is trusted.
- School ownership checks and mutations cannot be split across unrelated
  transactions.
- A School Admin context cannot be widened to reach a second School.

## 6. Verified route and namespace reality

**Verified current behavior**

Controller namespaces are domain/surface based: `platform-admin`, `settings`,
`school-support`, `platform-admin/support`, `teachers`, and the singular
app-facing surfaces `teacher`, `student`, `parent`, and `applicant-portal`.
There is no `organization-admin` controller or module. Platform Organization
and School management lives under `PlatformAdminController` at
`/api/v1/platform-admin`; that controller uses `@PlatformScope()` and
platform permissions and is not reusable by an Organization actor.

The current `TeachersController` is explicitly current-School because every
use case calls `requireTeacherDirectoryScope()`. It must remain so.

## 7. Locked route namespace, controller, and modules

**Locked future design**

| Item                      | Locked value                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| HTTP method               | `POST`                                                                                                     |
| Public path               | `/api/v1/organization-admin/teachers/:teacherId/transfer`                                                  |
| Framework controller path | `organization-admin/teachers`                                                                              |
| `teacherId`               | Live source `TeacherProfile.id`                                                                            |
| Destination selector      | Required `destinationSchoolId` in the JSON body                                                            |
| Controller class          | `OrganizationTeacherTransfersController`                                                                   |
| Controller file           | `src/modules/organization-admin/teacher-transfers/controller/organization-teacher-transfers.controller.ts` |
| Feature module            | `OrganizationTeacherTransfersModule`                                                                       |
| Feature module file       | `src/modules/organization-admin/teacher-transfers/organization-teacher-transfers.module.ts`                |
| Surface module            | `OrganizationAdminModule`                                                                                  |
| Surface module file       | `src/modules/organization-admin/organization-admin.module.ts`                                              |
| API tag                   | `organization-admin`                                                                                       |
| Success status            | `200 OK`                                                                                                   |

`organization-admin` is locked as a dedicated actor surface by symmetry with
the established `platform-admin` surface while remaining distinct from it.
The feature delegates business truth to the Teachers lifecycle module; it does
not create a second Teacher aggregate. The route omits `organizationId` and
keeps the current `/teachers` surface School-only.

The destination belongs in the body because the path identifies the source
resource and the request is one transition command with destination-owned
fields. This matches existing command-style POST conventions, avoids an
Organization/School hierarchy in the URL, and allows all destination
existence/ownership failures to share one safe resolver.

## 8. Locked guard/decorator sequence

**Locked future design**

Add these exact framework elements:

- decorator `OrganizationManagementOnly`
- metadata key `moazez:organization_management_only`
- global guard `OrganizationScopeGuard`
- context type `OrganizationScope`
- context setter `setOrganizationScope`

The AppModule global guard order becomes:

1. `JwtAuthGuard`: authenticate User/Session and reject non-active/deleted
   Users under current behavior.
2. `ScopeResolverGuard`: perform the existing general active-Membership load.
3. `OrganizationScopeGuard`: when `OrganizationManagementOnly` metadata is
   present, resolve the exact Organization actor state described below and
   write a trusted `organizationScope` to `RequestContext`.
4. `PermissionsGuard`: enforce
   `@RequiredPermissions('teachers.records.manage')` from the same exact Role.
5. `OrganizationTeacherTransferCoordinator`: inside the serializable Unit of
   Work, revalidate actor scope and resolve resource ownership before reading
   authorized state conflicts.

The controller is class-decorated with `@OrganizationManagementOnly()` and the
method is decorated with
`@RequiredPermissions('teachers.records.manage')`. It is not decorated with
`@SchoolManagementOnly()` or `@PlatformScope()`.

`OrganizationScopeGuard` must resolve from the database and require exactly
one active, non-deleted Membership total for the actor. It must prove:

```text
request actor userType = ORGANIZATION_USER
database User.userType = ORGANIZATION_USER
User.status = ACTIVE
User.deletedAt = null
Membership.userId = actor id
Membership.userType = ORGANIZATION_USER
Membership.status = ACTIVE
Membership.endedAt = null
Membership.deletedAt = null
Membership.organizationId is non-null
Membership.schoolId = null
Organization.status = ACTIVE
Organization.deletedAt = null
Role.key = organization_admin
Role.isSystem = true
Role.schoolId = null
Role.deletedAt = null
Role includes teachers.records.manage
```

The guard must use a narrow Auth repository projection keyed by actor id and
the Membership selected by `ScopeResolverGuard`, query at most two active
Membership rows with deterministic ordering, and reject unless there is
exactly one and it is the selected row. No actor-selected Membership id is
accepted.

The resulting immutable context is:

```typescript
interface OrganizationScope {
  actorId: string;
  membershipId: string;
  organizationId: string;
  roleId: string;
}
```

This context is server-derived. The later transaction receives a branded or
otherwise non-constructible trusted scope value, not four arbitrary strings.
School, Teacher, Applicant, and Platform actors are rejected with the existing
safe `auth.scope.missing` 403 before resource lookup. A custom Role is also
denied in V1: current governance says custom Roles are School-scoped, while an
Organization Membership has no School. A future Organization-scoped custom
Role model requires separate authorization and is not invented here.

## 9. Locked permission decision

```text
PERMISSION DECISION:
REUSE teachers.records.manage
```

**Verified current behavior:** the permission exists. `organization_admin`
receives it through `NON_PLATFORM`; `school_admin` also receives it through
`SCHOOL_LEVEL`; `platform_super_admin` receives it through `ALL`; Teacher and
custom Roles do not receive it automatically.

**Locked future design:** the new Organization actor/Role/Membership guard is
the least-privilege discriminator. A School Admin's permission does not pass
the actor gate, and a Platform actor's broad permissions do not create an
Organization Membership. No new permission or seed change is authorized.

## 10. Locked trusted Organization context

**Locked future design**

| Value                    | Authoritative source                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Organization             | `OrganizationScope.organizationId`, resolved from the exact server-side actor Membership and revalidated transactionally |
| Source School            | The live source Profile's School, resolved under that trusted Organization                                               |
| Destination School       | Validated body `destinationSchoolId`, then resolved under the same trusted Organization inside the transaction           |
| Source User              | Relation from the authorized source Profile                                                                              |
| Source Membership        | The single exact source User/School Teacher Membership footprint selected by state rules, never “latest”                 |
| Destination Teacher Role | Resolved internally with existing deterministic same-School-before-global precedence                                     |

The controller must reject `organizationId`, `sourceSchoolId`, `sourceUserId`,
`sourceMembershipId`, `sourceRoleId`, `destinationOrganizationId`,
`destinationMembershipId`, and `destinationRoleId` as non-whitelisted fields.

## 11. Locked transfer request DTO

The exact future DTO is `TransferTeacherToSchoolDto`.

### 11.1 Required fields

```text
destinationSchoolId UUID
teacherCode string, 1..20 after normalization
firstNameAr string, 1..50 after trim
lastNameAr string, 1..50 after trim
firstNameEn string, 1..50 after trim
lastNameEn string, 1..50 after trim
preferredDisplayLanguage AR | EN
gender MALE | FEMALE
```

### 11.2 Optional nullable destination-owned fields

```text
department string|null, max 120
specialization string|null, max 120
employmentType FULL_TIME|PART_TIME|CONTRACT|null
experienceYears integer|null, 0..60
hireDate valid calendar YYYY-MM-DD|null
workingDays TeacherWorkDay[], unique, max 7
workStartTime valid HH:mm[:ss]|null
workEndTime valid HH:mm[:ss]|null
notesAr string|null, max 500
notesEn string|null, max 500
```

Absence maps to destination-owned empty values, never source values:
`workingDays=[]`; the other optional fields become `null`. Work times are a
nullable pair and end must be after start. Working days are stored in canonical
Sunday-through-Saturday order. Teacher code normalization, date validation,
time validation, completeness projection, and display-name selection reuse the
current Teacher Directory domain functions. No language value is inferred from
the other language.

For an archived destination Profile restore, the command overwrites all listed
managed destination fields using these exact values. The existing destination
avatar relation is outside 1B-6 and is not copied from the source or changed by
this command.

### 11.3 Forbidden fields

Strict global validation (`whitelist`, `forbidNonWhitelisted`) rejects:

```text
employmentStatus, accountStatus, membershipStatus
loginEmail, username, contactEmail, phone
password, passwordHash, temporaryPassword and every credential field
roleId, userType, organizationId, sourceSchoolId
sourceProfile or any source Profile data object
assignments, avatar, deletedAt
```

Employment is forced to `INACTIVE`, User status to `DISABLED`, and destination
Membership status to `SUSPENDED`; none is caller controlled.

## 12. Locked source-state matrix

Ownership is proven before this matrix is evaluated. A foreign or unauthorized
source never reaches a state-specific conflict.

### 12.1 Allowed coherent source tuples

| Profile                     | User       | Membership                                             | Completeness           | Decision                                            |
| --------------------------- | ---------- | ------------------------------------------------------ | ---------------------- | --------------------------------------------------- |
| live `ACTIVE`               | `ACTIVE`   | exact Teacher `ACTIVE`, `endedAt=null`, non-deleted    | complete               | ALLOW                                               |
| live `ACTIVE`               | `INVITED`  | exact Teacher `ACTIVE`, `endedAt=null`, non-deleted    | complete               | ALLOW                                               |
| live `INACTIVE`             | `INVITED`  | exact Teacher `ACTIVE`, `endedAt=null`, non-deleted    | complete               | ALLOW                                               |
| live `ACTIVE` or `INACTIVE` | `DISABLED` | exact Teacher `ACTIVE`, `endedAt=null`, non-deleted    | complete               | ALLOW; account disable is a separate security state |
| live `INACTIVE`             | `DISABLED` | exact Teacher `SUSPENDED`, `endedAt=null`, non-deleted | complete or incomplete | ALLOW; incomplete source data is never copied       |

A missing credential is ALLOW for every allowed tuple. Transfer preserves the
credential state and ends in a disabled/suspended/inactive destination, so it
does not grant access or pretend the credential is ready.

### 12.2 Rejected source states

| State                                                                  | Decision and public reason                                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| live `TERMINATED` Profile                                              | REJECT `transfer_conflict/source_state_conflict`; changing an already-ended episode to `TRANSFERRED` would rewrite termination history                       |
| archived Profile                                                       | safe `transfer_not_found` 404                                                                                                                                |
| User `SUSPENDED` or deleted/non-Teacher User                           | REJECT `source_state_conflict` after ownership, except deleted/missing relationship collapses to safe 404 during composition                                 |
| Membership `INACTIVE` or `TRANSFERRED`                                 | REJECT `source_membership_conflict`                                                                                                                          |
| Membership with non-null `endedAt`                                     | REJECT `source_membership_conflict`                                                                                                                          |
| deleted Membership                                                     | REJECT `source_membership_conflict` after authorized footprint resolution; an absent/deleted source relation that prevents safe composition collapses to 404 |
| wrong Membership/User type or missing/deleted/foreign Teacher Role     | REJECT `source_membership_conflict`                                                                                                                          |
| Profile/User/Membership combination not listed in 12.1                 | REJECT `source_state_conflict`                                                                                                                               |
| incomplete Profile outside the exact disabled/suspended/inactive tuple | REJECT `source_state_conflict`                                                                                                                               |

The repository loads all same-source User/School Membership footprints in
deterministic `startedAt ASC, id ASC` order. Exactly one row must satisfy the
allowed source predicate and no other operational Membership may exist. It
never chooses “latest.” More than one plausible row is
`source_membership_conflict`.

## 13. Locked destination-state matrix

**Verified model values:** `OrganizationStatus` and `SchoolStatus` are each
`ACTIVE | SUSPENDED | ARCHIVED`. Current generic guards do not enforce either
status.

**Locked future design:** immediate transfer is an operational action and
requires the trusted Organization, source School, and destination School all
to be `ACTIVE` and non-deleted. The destination must differ from the source.

| Destination condition                                                                                                                                  | Decision                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| School absent, deleted, non-`ACTIVE`, or outside trusted Organization                                                                                  | safe `transfer_not_found`                                                                                               |
| Source School absent, deleted, non-`ACTIVE`, or moved outside trusted Organization                                                                     | safe `transfer_not_found` or `school_state_moved` when it moves after initial authorization                             |
| Same source and destination School                                                                                                                     | `transfer_conflict/same_school_transfer` after both are proven owned                                                    |
| Compatible live destination Teacher Role found                                                                                                         | continue; current precedence is one live same-School `teacher` Role, else exactly one live global system `teacher` Role |
| Missing/deleted/foreign/ambiguous destination Teacher Role                                                                                             | `teachers.account.teacher_role_required` with `destination_teacher_role_required`                                       |
| Normalized teacher code already used by another destination Profile                                                                                    | `teachers.profile.code_conflict`, details `{field: teacherCode}`                                                        |
| No `(destinationSchoolId,userId)` Profile footprint                                                                                                    | create destination Profile                                                                                              |
| Exactly one archived `(destinationSchoolId,userId)` Profile                                                                                            | restore that exact row                                                                                                  |
| Live destination Profile already exists                                                                                                                | `transfer_conflict/destination_live_profile_exists`                                                                     |
| More than one destination Profile footprint, if integrity is corrupted despite the DB unique constraint                                                | `destination_profile_history_ambiguous`                                                                                 |
| Another live Profile for the User besides the locked source                                                                                            | `destination_live_profile_exists`                                                                                       |
| No destination Membership history                                                                                                                      | create exact destination Membership                                                                                     |
| Exactly one compatible non-deleted historical Teacher Membership in `SUSPENDED`, `INACTIVE`, or `TRANSFERRED` state                                    | restore it to exact destination Teacher state                                                                           |
| Any active destination Membership, incompatible non-deleted destination Membership, or another operational Membership besides an allowed active source | `destination_membership_conflict`                                                                                       |
| More than one plausible or mixed destination Membership history row                                                                                    | `destination_membership_history_ambiguous`                                                                              |

A compatible historical destination Membership must belong to the same User
and destination School and have a Teacher footprint. Restoration overwrites
its Role/type/status/end fields with the locked destination result. A deleted
Membership is retained as history and is not restored; its presence requires
a new row only when no non-deleted ambiguous/incompatible history exists.

## 14. Locked safe-404 resolver

The exact domain exception is:

```text
teachers.lifecycle.transfer_not_found
HTTP 404
details: none
```

### 14.1 Boundary and ordering

1. Authentication, Organization actor scope, and permission run before any
   source/destination lookup.
2. Actor-class failures (`SCHOOL_USER`, `TEACHER`, `PLATFORM_USER`, invalid or
   ambiguous Organization Membership, incompatible Role) return the same
   existing `auth.scope.missing` 403 and perform zero resource queries.
3. Inside the serializable Unit of Work, actor scope is revalidated first.
4. The transfer repository executes the source and destination ownership/status
   reads before deciding whether either failed. It does not return early after
   the first missing row.
5. Missing, deleted, archived/ineligible, or foreign-Organization resources all
   collapse to `transfer_not_found` with the same response envelope and no ids.
6. State-specific 409/422 errors are evaluated only after both Schools and the
   source Profile have been proven inside the trusted Organization.

The phase request listed School and Platform actors among safe-resource
failures while also requiring them never to enter the resolver. The locked
interpretation is the security-order-preserving one: they are indistinguishable
pre-resource 403s, not resource 404s. This prevents resource discovery and is
consistent with the mandatory guard hierarchy.

The repository uses the same bounded query shapes for missing and foreign
resources, resolves both source and destination before classification, emits
the same code/body/details, and performs no condition-specific follow-up read.
Application code does not claim cryptographic constant-time database behavior;
it removes data-dependent application short-circuiting and exposes no stable
existence signal through status, code, details, or query count.

## 15. Locked narrow Organization transfer repository

The exact boundary is
`OrganizationTeacherTransferTransactionOperations`, implemented at:

```text
src/modules/organization-admin/teacher-transfers/infrastructure/
  organization-teacher-transfer-transaction.operations.ts
```

It is instantiated behind the Teacher lifecycle Unit of Work and is exposed to
the coordinator only as `context.organizationTransfer`. It is never exported
to a controller and never exposes Prisma.

Conceptual operations are locked as:

```typescript
revalidateActorScope(scope: TrustedOrganizationScope): Promise<boolean>

resolveAndLockOwnedResources(input: {
  scope: TrustedOrganizationScope;
  sourceTeacherProfileId: string;
  destinationSchoolId: string;
}): Promise<OwnedTransferResources | null>

listAndLockSourceMembershipFootprints(input: {
  source: OwnedTransferSource;
}): Promise<SourceMembershipFootprint[]>

listAndLockProfileFootprints(input: {
  source: OwnedTransferSource;
  destination: OwnedTransferDestination;
}): Promise<ProfileFootprint[]>

listAndLockMembershipFootprints(input: {
  source: OwnedTransferSource;
  destination: OwnedTransferDestination;
}): Promise<MembershipFootprint[]>
```

The first two operations include Organization/School status and ownership. The
repository takes the branded trusted scope, not an arbitrary Organization id.
Where Prisma cannot issue row locks, the implementation uses only parameterized
tagged-template `$queryRaw` with explicit actor/User/Organization/School
predicates and `FOR UPDATE`; `$queryRawUnsafe` is forbidden. Every subsequent
read uses explicit selects.

Ownership by module remains:

| Concern                                     | Owner                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Actor Organization scope before transaction | IAM Auth narrow Organization-scope projection used by `OrganizationScopeGuard`                       |
| Cross-School ownership and lock reads       | `OrganizationTeacherTransferTransactionOperations`                                                   |
| Transaction orchestration                   | extended `TeacherLifecycleUnitOfWork` and `TransferTeacherBetweenSchoolsCoordinator`                 |
| User and Membership state writes            | existing IAM/Settings Teacher lifecycle operations, extended with expected-state transfer predicates |
| Profile archive/create/restore              | existing TeacherProfile lifecycle operations, extended with expected-state transfer predicates       |
| Destination Teacher Role                    | existing exact Teacher Role resolver                                                                 |
| Allocation summary                          | existing Academics transaction lifecycle classifier                                                  |
| Session revocation                          | existing IAM transaction Session operation                                                           |
| Audit                                       | existing Teacher lifecycle audit writer/contract                                                     |
| Safe response                               | Organization transfer presenter using transaction-returned projections                               |

There is no generic `findSchoolById`, arbitrary cross-School query helper,
unscoped delegate, or platform bypass in this boundary.

## 16. Locked transaction and concurrency contract

The future coordinator uses the existing Teacher lifecycle Unit of Work at
`Serializable` isolation. It captures one `lifecycleAt` before opening the
transaction and uses it for source Membership `endedAt`, source Profile
`deletedAt`, Session `revokedAt`, response `effectiveAt`, and any audit
transition timestamp if a future approved metadata field represents it.
`AuditLog.createdAt` remains database-owned and is not duplicated in metadata.

### 16.1 Exact sequence

1. Revalidate the actor's exact active Organization Membership and Role.
2. Resolve and lock the live source Profile/User/School.
3. Resolve and lock the destination School.
4. Prove both Schools belong to the same trusted active Organization.
5. Revalidate the source tuple and Profile completeness rule.
6. Lock the exact source Membership and Role.
7. Classify source allocations through the existing Academics transaction
   operation; do not mutate them.
8. Lock every live Profile uniqueness footprint for the User.
9. Lock the exact destination live/archived Profile footprint.
10. Lock all operational and destination Membership footprints.
11. Resolve the exact destination Teacher Role.
12. Normalize and validate the full destination-owned command and code
    uniqueness.
13. Set the source Membership to `TRANSFERRED` with the fixed timestamp using
    expected id, User, School, status, `endedAt`, `deletedAt`, and observed
    state predicates.
14. Archive the source Profile using expected id, User, School,
    `employmentStatus`, `deletedAt`, and observed-state predicates. Do not
    change `schoolId` or any Profile field.
15. Restore the exact archived destination Profile or create one new Profile.
16. Restore the exact compatible destination Membership or create one new
    Membership.
17. Force destination Membership `SUSPENDED`, `endedAt=null`, non-deleted,
    `userType=TEACHER`, and the resolved Role.
18. Force destination Profile `INACTIVE`, live, complete, and destination-owned.
19. Update User display projections from the destination preferred language,
    then set User `DISABLED` with expected-state predicates. Preserve type and
    identity.
20. Revoke all unrevoked Sessions using the same transaction and fixed time.
21. Write all successful audits using the same transaction.
22. Build and validate the complete safe response inside the callback.
23. Commit, then return success.

### 16.2 Fail-closed mapping

| Moved/raced condition                                        | Result                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Actor Membership/Role/Organization moved after guard         | rollback; `transfer_conflict/actor_scope_moved`                                                                                 |
| School ownership/status moved                                | rollback; `transfer_conflict/school_state_moved` without ids                                                                    |
| Source employment/archive/demotion or Membership state moved | rollback; `source_state_conflict` or `source_membership_conflict`                                                               |
| Concurrent destination Profile create/restore                | one transaction succeeds; loser rolls back as `transfer_concurrency_conflict` or the more specific destination Profile conflict |
| Concurrent destination Membership create/restore             | one succeeds; loser rolls back as `destination_membership_conflict` or `transfer_concurrency_conflict`                          |
| Concurrent teacherCode use                                   | rollback; `destination_teacher_code_conflict` for the raced transfer; no value/id                                               |
| Serializable failure/P2034                                   | rollback; `transfer_concurrency_conflict`; no automatic partial retry                                                           |
| Session revocation failure                                   | rollback; `teachers.lifecycle.revocation_failed`                                                                                |
| Any successful audit failure                                 | rollback all state and Session writes                                                                                           |
| Response composition failure                                 | callback throws; rollback all state/audits                                                                                      |

Database unique constraints remain the final concurrency backstop:
`(schoolId,userId)`, the partial one-live-Profile index, destination School/code
uniqueness, and the active Teacher Membership partial index. No partial source
archive or destination identity may survive.

## 17. Locked persisted source result

### Source Profile

```text
same row and id
same source schoolId
same userId
deletedAt = lifecycleAt
employmentStatus preserved exactly
all managed fields and avatar relation preserved exactly
```

### Source Membership

```text
same historical row and id
status = TRANSFERRED
endedAt = lifecycleAt
deletedAt = null
userType = TEACHER
Role preserved
source schoolId and organizationId preserved
```

No source row is hard-deleted and the source Profile's School is never mutated.

## 18. Locked persisted destination and User result

### User

```text
same global row and id
status = DISABLED
userType = TEACHER
deletedAt unchanged
login/contact identity unchanged
password/credential fields and credentialVersion unchanged
display firstName/lastName projected only from approved destination language
```

### Destination Profile

- If one exact archived `(destinationSchoolId,userId)` Profile exists, restore
  that row.
- Otherwise create one new Profile.

The result has the destination School, same User, complete destination-owned
fields, `employmentStatus=INACTIVE`, and `deletedAt=null`. It does not contain
copied source employment facts.

### Destination Membership

- If one exact compatible historical destination Teacher Membership exists,
  restore it.
- If no destination history exists, create one new Membership.

The result uses the destination School, trusted Organization, exact destination
Teacher Role, `status=SUSPENDED`, `endedAt=null`, `deletedAt=null`, and
`userType=TEACHER`.

The committed aggregate must have exactly one live Profile, zero operational
Teacher Memberships, zero active access, and one unchanged global credential
state.

## 19. Locked allocation and academic-history behavior

**Verified current behavior:** `TeacherSubjectAllocation` references the global
Teacher User and its School. Timetable entries, Lesson Plans, and Homework
Assignments reference both the allocation and the same User/School. The shared
Academics transaction classifier returns aggregate term/dependency counts and
does not mutate rows.

**Locked future design:** no allocation state blocks transfer. This decision is
different from ordinary Profile archive/demotion because transfer is a
dedicated Organization lifecycle operation, preserves all source rows, closes
access, and needs the source identity closed even while academic reassignment
is operationally pending.

- `current_active` or `future` sets `reassignmentRequired=true`.
- `current_inactive`, `inconsistent`, or `invalid` sets
  `integrityReviewRequired=true` and returns the classifier's stable
  `integrityReason`; it does not trigger mutation or unsafe access.
- `historical` is preserved and non-blocking.

The exact persisted policy is:

```text
source allocations, timetable, lesson plans, homework, and academic audits preserved
destination receives no copied allocation, timetable, lesson plan, or homework row
allocation deletes/clears/reassignments = 0
```

Only aggregate counts are returned. Allocation, term, subject, classroom,
School, and Teacher identifiers are forbidden from the allocation result.

## 20. Locked Session contract

The existing transaction-aware
`revokeTeacherLifecycleUserSessionsInTransaction()` operation is reused.

```text
transaction = the exact lifecycle transaction
target = trusted global User id
predicate = revokedAt is null
write = revokedAt = lifecycleAt
result = aggregate affected count only
zero rows = success
```

Failure maps to `teachers.lifecycle.revocation_failed`, HTTP 503, details
`{retryable:true, reasonCode:'revocation_failed'}` and rolls back source
Membership transfer, source Profile archive, destination Profile/Membership,
User disable, and all successful audits. Session ids, token hashes, refresh
tokens, credential material, and raw errors are never returned or audited.

## 21. Locked successful audit matrix

Every row uses module `teachers`, outcome `SUCCESS`, the trusted Organization,
the School owning the audited resource, and the same transaction client.

| Path                                   | Action                         | Resource type/id                                    | School recorded | Occurs                              |
| -------------------------------------- | ------------------------------ | --------------------------------------------------- | --------------- | ----------------------------------- |
| Source Profile                         | `teachers.profile.archive`     | `teacher_profile` / source Profile id               | source          | always                              |
| Source Membership                      | `teachers.membership.transfer` | `membership` / source Membership id                 | source          | always                              |
| Destination Profile new                | `teachers.profile.create`      | `teacher_profile` / new destination Profile id      | destination     | create path only                    |
| Destination Profile restored           | `teachers.profile.restore`     | `teacher_profile` / restored destination Profile id | destination     | restore path only                   |
| Destination Membership new or restored | `teachers.membership.transfer` | `membership` / destination Membership id            | destination     | always; records the destination leg |
| Global account                         | `teachers.account.transfer`    | `user` / global User id                             | destination     | always                              |

No new audit action is required. Metadata is limited to trusted User,
Membership, and Profile UUIDs; fixed changed-field keys; previous/next enums;
safe allocation aggregates/term labels; fixed reason codes; and credential
booleans/version. It cannot include names, teacher code value, emails,
username, phone, notes, School/Organization names, passwords/hashes, Session or
allocation ids, source/destination field values, request bodies, or raw errors.

The audit contract's reason-code allowlist must be extended only with the
public stable transfer reasons locked in section 23. Audit failure is a
transaction failure.

## 22. Locked response contract

The response is `200 OK` with exactly:

```json
{
  "teacher": {
    "id": "destination TeacherProfile UUID",
    "userId": "global User UUID",
    "loginEmail": "safe managed identity value",
    "username": null,
    "contactEmail": null,
    "phone": null,
    "teacherCode": "destination code",
    "firstNameAr": "destination value",
    "lastNameAr": "destination value",
    "firstNameEn": "destination value",
    "lastNameEn": "destination value",
    "displayName": {
      "firstName": "approved projection",
      "lastName": "approved projection",
      "fullName": "approved projection"
    },
    "gender": "MALE or FEMALE",
    "department": null,
    "specialization": null,
    "accountStatus": "DISABLED",
    "membershipStatus": "SUSPENDED",
    "membershipEndedAt": null,
    "employmentStatus": "INACTIVE",
    "profileCompleteness": {
      "isComplete": true,
      "missingFields": []
    },
    "credentialSummary": {
      "hasPassword": false,
      "status": "missing or existing safe status",
      "mustChangePassword": false,
      "passwordProvisionedAt": null,
      "passwordChangedAt": null,
      "credentialVersion": 0
    },
    "createdAt": "ISO timestamp",
    "updatedAt": "ISO timestamp",
    "employmentType": null,
    "experienceYears": null,
    "hireDate": null,
    "workingDays": [],
    "workStartTime": null,
    "workEndTime": null,
    "notesAr": null,
    "notesEn": null
  },
  "transfer": {
    "sourceArchived": true,
    "effectiveAt": "ISO lifecycle timestamp",
    "revokedSessionCount": 0,
    "reassignmentRequired": false,
    "integrityReviewRequired": false,
    "allocationSummary": {
      "currentActiveCount": 0,
      "futureCount": 0,
      "historicalCount": 0,
      "currentInactiveCount": 0,
      "inconsistentCount": 0,
      "invalidCount": 0,
      "integrityRiskCount": 0,
      "integrityReason": "none"
    }
  }
}
```

Nullable/example values above are shape examples, not hard-coded credential or
Profile defaults; actual safe persisted values are presented. A dedicated
Organization transfer presenter composes this from transaction projections. It
does not call the current-School presenter through a fabricated School context.

`destinationSchoolId` is not echoed. The response also omits Organization id,
source School id, both Membership ids, both Role ids, Session rows, allocation
ids, source Profile/state, credential material, audit metadata, and lock state.

## 23. Locked errors and public reasons

**Verified current behavior:** `ERROR_CATALOG.md` contains
`teachers.lifecycle.revocation_failed`, `teachers.profile.code_conflict`,
`teachers.profile.incomplete`, `teachers.account.teacher_role_required`, and
`teachers.account.role_transition_conflict`. It does not yet contain
`teachers.lifecycle.transfer_not_found` or
`teachers.lifecycle.transfer_conflict`; those are future runtime catalog/code
additions. The global exception filter currently emits English exception
messages and does not load catalog localization.

| Error                                       | HTTP | Safe details                                                                                                    |
| ------------------------------------------- | ---: | --------------------------------------------------------------------------------------------------------------- |
| `teachers.lifecycle.transfer_not_found`     |  404 | none                                                                                                            |
| `teachers.lifecycle.transfer_conflict`      |  409 | one stable `reasonCode` only                                                                                    |
| `teachers.lifecycle.revocation_failed`      |  503 | `retryable=true`, `reasonCode=revocation_failed`                                                                |
| `teachers.profile.code_conflict`            |  409 | `field=teacherCode` only                                                                                        |
| `teachers.profile.incomplete`               |  409 | fixed destination `missingFields` only                                                                          |
| `teachers.account.teacher_role_required`    |  422 | stable `reasonCode` only                                                                                        |
| `teachers.account.role_transition_conflict` |  409 | stable `reasonCode` only; lower-level invariant failures must be translated to transfer errors where applicable |

The exact transfer reason-code allowlist is:

```text
same_school_transfer
source_state_conflict
source_membership_conflict
destination_live_profile_exists
destination_profile_history_ambiguous
destination_membership_conflict
destination_membership_history_ambiguous
destination_teacher_role_required
destination_teacher_code_conflict
actor_scope_moved
school_state_moved
transfer_concurrency_conflict
```

`destination_teacher_role_required` is emitted with
`teachers.account.teacher_role_required`. A known teacher-code conflict uses
the existing `teachers.profile.code_conflict` field-only contract; the
`destination_teacher_code_conflict` reason is used for a race translated to
`teachers.lifecycle.transfer_conflict` and in sanitized operational/audit
classification. No conflict is evaluated before same-Organization ownership
is proven.

## 24. Concurrency matrix

| Race/failure                                                  | Required proof                                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Two transfers of one source                                   | one commit; all losers roll back with stable conflict                                   |
| Destination Profile created/restored                          | partial one-live and school/User constraints plus serializable transaction reject loser |
| Destination Membership created/restored                       | locked footprint plus expected-state write rejects loser                                |
| Destination teacher code claimed                              | unique constraint rejects loser; no value/id leaks                                      |
| Actor Membership revoked                                      | transaction revalidation fails before resource mutation                                 |
| Organization/School suspended, archived, deleted, or re-owned | locked status/ownership predicate fails; no state mutation                              |
| Source employment/archive/demotion changes                    | expected-state Profile and Membership writes fail                                       |
| Session revocation fails                                      | entire transaction rolls back                                                           |
| Any audit fails                                               | entire transaction rolls back                                                           |
| Response composition fails                                    | callback throws before commit                                                           |

The implementation must test that all participants receive the exact same
transaction object and that no retry path writes duplicate audits. A
serialization conflict is a safe client-retryable 409, not an internally
partially retried workflow.

## 25. Future executable test matrix

### 25.1 Actor and scope

1. Exact `ORGANIZATION_USER` plus sole active Organization Membership and
   `organization_admin` succeeds.
2. Inactive Membership is denied.
3. Deleted Membership is denied.
4. School-level Membership is denied.
5. School Admin is denied before foreign-resource discovery.
6. Teacher is denied.
7. Platform actor is denied from the Organization route.
8. Actor without `teachers.records.manage` is denied.
9. A custom Role with the permission is denied under the locked V1
   `organization_admin`-only Role compatibility policy.
10. Caller-supplied `organizationId` is rejected by DTO validation.
11. Multiple active Memberships, equal `startedAt` values, ended ACTIVE rows,
    stale token User type, deleted Role, and Role/scope mismatch all fail closed.

### 25.2 Same-Organization resolution

12. Source and destination in actor Organization succeed.
13. Foreign-Organization source is safe 404.
14. Foreign-Organization destination is safe 404.
15. Both foreign is the same safe 404.
16. Deleted/inactive source School is safe 404.
17. Deleted/inactive destination School is safe 404.
18. Missing and foreign source responses are identical.
19. Missing and foreign destination responses are identical.
20. Same-School transfer conflicts only after ownership proof.
21. Source and destination reads both execute before a resource 404 decision.

### 25.3 Source state

22. Every allowed tuple in section 12 succeeds.
23. Every rejected tuple returns its exact conflict.
24. Archived source is safe 404.
25. Ambiguous source Membership fails closed.
26. Moved source Profile fails closed.
27. Moved source Membership fails closed.
28. Missing credential remains allowed only in an otherwise allowed tuple.
29. Incomplete source is allowed only in the exact fail-closed tuple.

### 25.4 Destination state

30. New destination Profile path.
31. Exact archived destination Profile restore path.
32. No second live Profile remains.
33. Destination live Profile conflict.
34. Corrupt/ambiguous Profile history fails closed.
35. Exact destination Membership restore path.
36. New destination Membership path.
37. Operational Membership conflict.
38. Ambiguous/incompatible Membership history fails closed.
39. Missing, deleted, foreign, and ambiguous Teacher Role fail safely.
40. Teacher-code conflict is safe.
41. Incomplete destination input is rejected.
42. Omitted optional fields reset to destination null/empty values and never
    copy source fields.

### 25.5 Atomicity

43. Source Membership write failure rolls back.
44. Source Profile archive failure rolls back.
45. Destination Profile create failure rolls back.
46. Destination Profile restore failure rolls back.
47. Destination Membership create failure rolls back.
48. Destination Membership restore failure rolls back.
49. User display/disable failure rolls back.
50. Session revocation failure rolls back.
51. Each of the five audit positions can fail and rolls back everything.
52. Response composition failure rolls back.
53. Exact same transaction object reaches every operation.

### 25.6 Concurrency

54. Two concurrent transfers produce one success.
55. Destination Profile create/restore race fails closed.
56. Destination Membership create/restore race fails closed.
57. Teacher-code race fails closed.
58. Actor Membership revocation race fails closed.
59. Organization/School status or ownership race fails closed.
60. Source employment/archive/demotion race fails closed.
61. No partial source or destination state survives.

### 25.7 Preservation

62. Source Profile School and employment state remain unchanged except
    `deletedAt`.
63. Source Membership history and Role remain preserved.
64. Credentials and version remain byte-for-byte unchanged.
65. Allocations remain unchanged.
66. Timetable history remains unchanged.
67. Lesson-plan history remains unchanged.
68. Homework history remains unchanged.
69. Destination receives no copied academic rows.
70. No hard delete occurs.
71. Destination receives no copied source employment facts.

### 25.8 Response and leakage

72. Exact 200 response snapshot.
73. No Organization or School id.
74. No Membership or Role id.
75. No Session data.
76. No credential material.
77. No source Profile values.
78. No allocation or dependency-row ids.
79. Errors contain only locked details.
80. School/Platform actor responses do not vary with guessed resource ids.

### 25.9 Regression

81. Current-School Teacher routes remain School-only.
82. School A cannot discover School B through `/teachers`.
83. Archive and rehire remain same-School.
84. Employment transitions remain unchanged.
85. Settings Teacher bypasses remain closed.
86. Credential writers remain authoritative.
87. Allocation mutation remains unchanged.
88. Teacher lifecycle UoW/audit/Session tests remain green.
89. Migration governance, Prisma validation/generation, and build remain green.

Database-writing security/repository tests must use an explicitly authorized
disposable database, never the persistent development database.

## 26. Future runtime file allowlist

The later `1B-6` implementation is limited to these categories and exact
module areas:

- `src/modules/organization-admin/organization-admin.module.ts`
- `src/modules/organization-admin/teacher-transfers/**` for the dedicated
  controller, DTO, presenter, module, scope-safe repository, and focused tests
- `src/common/decorators/organization-management-only.decorator.ts`
- `src/common/guards/organization-scope.guard.ts`
- narrow `RequestContext` and `AppModule` registration changes required for the
  exact guard and surface module
- narrow IAM Auth projection needed by the guard
- `src/modules/teachers/lifecycle/**` for the transfer coordinator, typed Unit
  of Work port/context, transfer error translation, audits, and tests
- narrow transaction-operation extensions under
  `src/modules/settings/users/infrastructure/**` and
  `src/modules/teachers/profile/infrastructure/**`
- reuse-only wiring to the Academics allocation classifier and IAM Session
  operation; no mutation changes
- `ERROR_CATALOG.md` only to add the two missing locked transfer codes/messages
- focused unit, security, repository, concurrency, and regression tests
- one later implementation evidence document.

Forbidden runtime areas and behaviors:

```text
platform-admin authorization or platformBypassScope reuse
current-school TeachersController broadening
generic Settings transfer route
Prisma schema or migrations
permission/role seeds without separate reauthorization
credential hashing, generation, delivery, or storage
allocation/timetable/lesson/homework mutation
Teacher App and avatar modules
source Profile schoolId update
automatic source employment-field copying
hard delete
generic unscoped repository/client/delegate
caller-supplied organizationId/sourceSchoolId
```

## 27. Validation evidence

The docs-only phase produced these results:

```text
Focused guard/platform/Teacher lifecycle/Profile/directory tests:
10 suites passed; 121 tests passed; 0 failed

npm run test:migration-governance:
39 passed; 0 failed

npm run db:migrations:check:
PASS; base=origin/main (11f651240e53); active=4; new=0; rebaseline=off

npx prisma validate:
PASS

npx prisma generate:
PASS; Prisma Client v6.19.3 generated

npm run build:
PASS

npx prettier --write docs/sprint-school-teacher-directory-1b-transfer-scope-contract-lock.md:
PASS

npx prettier --check docs/sprint-school-teacher-directory-1b-transfer-scope-contract-lock.md:
PASS

git diff --check:
PASS

git status --short:
?? docs/sprint-school-teacher-directory-1b-transfer-scope-contract-lock.md

git diff --cached --name-only:
empty; staged files = 0

tracked changed files:
0
```

The first build invocation exceeded the command wrapper's 120-second timeout
while its child process continued. A concurrent retry encountered the generated
`dist` directory in use. After that child process exited, a clean retry of the
same `npm run build` command passed without source or configuration changes.

No database-writing security fixture suite is authorized in this phase. The
executed focused suites were pure/mocked. Runtime implementation remains
responsible for the disposable-database tests in section 25.

## 28. Remaining blockers

**Remaining unresolved blocker: none at contract level.**

The current repository lacks the Organization route, exact Organization scope
guard, Organization context, and narrow cross-School repository. These are
known runtime outputs with exact names, order, ownership, and tests above—not
unresolved design choices. Runtime work must stop if it cannot implement any
locked item without schema, permission, platform-bypass, or broader scope
changes.

## 29. Final runtime authorization gate

```text
SCHOOL-TEACHER-DIRECTORY-1B-6A: COMPLETE
MODE: READ-ONLY CONTRACT LOCK
ROUTE NAMESPACE: LOCKED
LOCKED ROUTE: POST /api/v1/organization-admin/teachers/:teacherId/transfer
CONTROLLER AND MODULE: LOCKED
GUARD/DECORATOR STACK: LOCKED
PERMISSION DECISION: REUSE teachers.records.manage
PLATFORM-SCOPE SUBSTITUTION: REJECTED
SAFE 404 RESOLVER: LOCKED
NARROW ORGANIZATION REPOSITORY: LOCKED
SOURCE STATE MATRIX: LOCKED
DESTINATION STATE MATRIX: LOCKED
REQUEST DTO: LOCKED
TRANSACTION AND LOCK ORDER: LOCKED
CONCURRENCY FAIL-CLOSED: LOCKED
SOURCE HISTORY PRESERVATION: LOCKED
DESTINATION DISABLED/SUSPENDED/INACTIVE: LOCKED
AUDIT MATRIX: LOCKED
SESSION REVOCATION: LOCKED
RESPONSE CONTRACT: LOCKED
ERROR CONTRACT: LOCKED
FUTURE TEST MATRIX: LOCKED
RUNTIME FILE ALLOWLIST: LOCKED
DATABASE MUTATION: 0
RUNTIME FILES CHANGED: 0
1B-6 RUNTIME IMPLEMENTATION: AUTHORIZED AFTER INDEPENDENT REVIEW OF THIS CONTRACT
RUNTIME IMPLEMENTATION BRANCH: NOT CREATED
1B-7 AUTHORIZED: NO
```
