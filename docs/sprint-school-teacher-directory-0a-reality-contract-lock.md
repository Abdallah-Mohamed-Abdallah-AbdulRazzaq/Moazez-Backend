# SCHOOL-TEACHER-DIRECTORY-0A Reality, Data Classification, and Contract Lock

## 1. Scope and status

**Status: contract and classification phase only**

**Runtime changes: none**

**Schema changes: none**

**Migration changes: none**

- Branch: `feat/school-teacher-directory-0a-contract-lock`
- Locked baseline: `de1edba2f17edbe4f219a05997db8fa8aa7d78ca`
- Baseline verification: the branch `HEAD` equaled the locked baseline before this phase began.
- Runtime Teacher Directory implementation is deferred to phases 1A-1F. This phase adds only this contract, a read-only classifier, and pure classifier tests.
- `DIRECTORY_STRUCTURE.md`, named by `CLAUDE.md`, is absent at the baseline. The actual repository replacement, `DIRECTORY_STRUCTURE_VISUAL.md`, was read.
- The frontend handoff was located at `adr/School-Dashboard/sis_dashboard-teachers_backend_handoff_spec.md`. It is evidence of UI intent, not proof of backend reality.

### Verified architectural starting point

| Statement                                                                           | Verdict                                                                                                          | Code evidence                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `User` is login identity, credentials, and global account state.                    | Confirmed.                                                                                                       | `prisma/schema.prisma`; `src/modules/iam/auth/**`; `src/modules/settings/users/credentials/**`                                                   |
| `Membership` is organization/school, role, permissions, and membership state.       | Confirmed, with permissions reached through `Membership.role`.                                                   | `prisma/schema.prisma`; `src/modules/iam/auth/application/membership.mapper.ts`; `src/modules/settings/users/infrastructure/users.repository.ts` |
| `TeacherProfile` is absent.                                                         | Confirmed. The existing Teacher App folder named `profile` is a read composition, not a persisted profile model. | `prisma/schema.prisma`; `src/modules/teacher-app/profile/**`                                                                                     |
| `TeacherSubjectAllocation` is the canonical academic teacher allocation model.      | Confirmed.                                                                                                       | `prisma/schema.prisma`; `src/modules/academics/teacher-allocation/**`                                                                            |
| Teacher App composes teacher `User`, active `Membership`, and allocation ownership. | Confirmed.                                                                                                       | `src/modules/teacher-app/access/**`; `src/modules/teacher-app/profile/**`                                                                        |

## 2. Evidence matrix

| Concern                             | Current implementation                                                                                                                                                                                                            | Exact files                                                                                                                                                                                                                     | Observed behavior                                                                                                                                                              | Risk                                                                                                                                                                 | Locked decision                                                                                                                                                                                  | Future implementation phase |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| User identity                       | `User.email` is the login email; `username` and `contactEmail` are optional; `phone`, names, `userType`, and `status` also live on `User`.                                                                                        | `prisma/schema.prisma`; `src/modules/iam/auth/application/login.use-case.ts`; `src/modules/settings/users/application/user-login-identity.resolver.ts`                                                                          | Login normalizes the submitted identifier and looks up `User.email`. Login responses expose username/login/contact identity separately.                                        | A new teacher table could duplicate login email, phone, or credential state and drift from IAM.                                                                      | IAM `User` remains the sole owner of login identity, contact identity listed in section 3, credentials, and account state.                                                                       | 1A, 1B                      |
| Membership                          | `Membership` links a user to organization, optional school, role, membership `userType`, and status.                                                                                                                              | `prisma/schema.prisma`; `src/modules/settings/users/infrastructure/users.repository.ts`; `src/modules/iam/auth/infrastructure/auth.repository.ts`                                                                               | Auth loads active, non-deleted memberships. Settings user operations target a current-school active membership.                                                                | User, membership, and role types can disagree because they are separate mutable columns.                                                                             | A live Teacher requires one current-school active Teacher membership, Teacher role key, and consistent `User.userType`.                                                                          | 1A, 1B                      |
| Teacher membership uniqueness       | A PostgreSQL partial unique index covers `memberships.user_id` where membership status and membership `user_type` are Teacher/active.                                                                                             | `prisma/schema.prisma`; `prisma/migrations/20260710135222_baseline_v1/migration.sql`; `PRISMA_CONVENTIONS.md`                                                                                                                   | It prevents two active memberships whose membership `userType` is `TEACHER`; it does not prove role key, `User.userType`, `endedAt`, soft-delete state, or school consistency. | Mismatched legacy rows can evade the intended semantic constraint.                                                                                                   | Keep the database constraint; add application invariants and classifier evidence. Do not weaken or replace it.                                                                                   | 1A, 1B                      |
| Teacher role mapping                | Only role key `teacher` maps to `UserType.TEACHER`; unknown/custom keys map to `SCHOOL_USER`.                                                                                                                                     | `src/modules/settings/users/domain/user-type-from-role.ts`; `src/modules/settings/users/infrastructure/users.repository.ts`; `prisma/seeds/02-system-roles.seed.ts`                                                             | Any assignable current-school role can be selected. A role-key transition changes both User and Membership user type.                                                          | A custom role with teacher-like permissions but another key is not a Teacher identity; role/type mismatches remain possible in existing data.                        | Semantic Teacher identity requires all three: `User.userType=TEACHER`, `Membership.userType=TEACHER`, and `Role.key=teacher`.                                                                    | 1B                          |
| Teacher creation                    | Generic `POST settings/users` creates User and Membership in one transaction and accepts the Teacher role. It creates no profile and no password.                                                                                 | `src/modules/settings/users/controller/users.controller.ts`; `src/modules/settings/users/application/create-user.use-case.ts`; `src/modules/settings/users/infrastructure/users.repository.ts`                                  | User is created `ACTIVE`; membership is created `ACTIVE`; `passwordHash` is null.                                                                                              | This is a direct TeacherProfile bypass after profile cutover. An active account can also be credential-incomplete.                                                   | After cutover, generic settings user creation must reject/delegate Teacher targets. User + Membership + TeacherProfile + transactional audit use one DB transaction.                             | 1B                          |
| Teacher update and role transitions | Generic settings update changes `User.firstName`/`lastName` and/or role. Role change updates `User.userType`, `Membership.userType`, and role in a transaction.                                                                   | `src/modules/settings/users/application/update-user.use-case.ts`; `src/modules/settings/users/infrastructure/users.repository.ts`; `src/modules/settings/users/dto/update-user.dto.ts`                                          | There is no TeacherProfile provisioning, bilingual-name classification, archive, completeness, allocation, or dependency check. Existing User names do not prove a language.   | Promotion creates a Teacher without a profile; generic name edits could become a competing name source; demotion can strand active allocations and Teacher App data. | Promotion/demotion use section 5. Canonical bilingual names move to TeacherProfile; User names become lifecycle-managed display projections. Generic settings cannot cross the Teacher boundary. | 1B                          |
| Teacher status                      | Settings maps API `active` to `UserStatus.ACTIVE` and `inactive` to `UserStatus.DISABLED`; it does not change Membership. Disable revokes sessions.                                                                               | `src/modules/settings/users/application/update-user-status.use-case.ts`; `src/modules/settings/users/infrastructure/users.repository.ts`; `src/modules/settings/users/dto/update-user-status.dto.ts`                            | A disabled Teacher can retain an active Teacher membership and allocations.                                                                                                    | Account, membership, and employment states can be mistaken for one status.                                                                                           | Account, membership, and employment status remain separate dimensions. Directory presenters expose all three explicitly.                                                                         | 1B                          |
| Credential generation               | Existing single/bulk generation creates a temporary password, stores only its Argon2id hash, increments credential version, sets `mustChangePassword`, revokes sessions, audits, and returns the plaintext once.                  | `src/modules/settings/users/credentials/application/generate-user-credential.use-case.ts`; `bulk-credential-generate.use-case.ts`; `credential-password.policy.ts`; `src/modules/iam/auth/domain/password.service.ts`           | Manageable statuses are active or invited. Temporary plaintext exists only in the immediate response object.                                                                   | Duplicating the flow under Teachers would create divergent hashing, policy, session, and audit behavior.                                                             | Reuse the existing credential endpoints and policy. Teacher Directory reads return summaries only.                                                                                               | 1B                          |
| Credential setting                  | Admin-provided passwords use the shared 12-character complexity policy, Argon2id hashing, credential version increment, optional forced reset, session revocation, and audit.                                                     | `src/modules/settings/users/credentials/application/set-user-credential.use-case.ts`; `src/modules/settings/users/credentials/infrastructure/user-credentials.repository.ts`; `src/modules/iam/auth/domain/password.service.ts` | Credential update, session revocation, and audit are sequential operations rather than one database transaction.                                                               | A new Teacher implementation could weaken password rules or make the cross-step consistency gap worse.                                                               | No Teacher credential writer. Existing settings credential writes remain authoritative; their transaction hardening is separate IAM work.                                                        | 1B                          |
| Legacy reset-password behavior      | The generic reset endpoint hashes a random placeholder and discards the result. It does not update credentials or revoke sessions.                                                                                                | `src/modules/settings/users/application/reset-password.use-case.ts`; `src/modules/settings/users/controller/users.controller.ts`                                                                                                | It records an audit and returns an accepted response, but performs no credential reset.                                                                                        | Treating it as a real reset would give a false success and leave access unchanged.                                                                                   | It is forbidden for Teacher Directory. Use generate, set, or regenerate under `settings/users/:userId/credentials`.                                                                              | 1B                          |
| TeacherSubjectAllocation            | A row owns teacher User, subject, classroom, and term. The unique tuple is teacher/subject/classroom/term.                                                                                                                        | `prisma/schema.prisma`; `src/modules/academics/teacher-allocation/**`                                                                                                                                                           | It is school-scoped, hard-deleted when allowed, and referenced by timetable entries, lesson plans, and homework assignments.                                                   | Parallel Teacher assignment tables would conflict with existing academics, timetable, Teacher App, and homework truth.                                               | It remains the only writable academic teacher assignment truth.                                                                                                                                  | 1C                          |
| Assignment validation               | Writes require an active term, active/non-ended Teacher membership, Teacher user type on both User and Membership, active subject, current-school classroom hierarchy, and a matching SubjectAllocation grade/subject matrix row. | `src/modules/academics/teacher-allocation/application/teacher-allocation-use-case.helpers.ts`; `infrastructure/teacher-allocation.repository.ts`                                                                                | Validation does not check role key, User account status, or future Teacher employment/profile state.                                                                           | A structurally Teacher-typed but disabled, role-mismatched, or employment-inactive user can be allocated.                                                            | Extend validation in 1C to require a complete, non-archived, employment-active profile and exact Teacher role/type consistency.                                                                  | 1C                          |
| Assignment dependency deletion      | Delete/clear count timetable entries, non-deleted lesson plans, and non-deleted homework assignments. Mutations require an active term and fail on dependencies.                                                                  | `delete-teacher-allocation.use-case.ts`; `clear-teacher-allocations-by-subject.use-case.ts`; `teacher-allocation.repository.ts`                                                                                                 | Dependent allocations cannot be removed; historical or closed-term allocations cannot be deleted through current flows.                                                        | Employment change, role demotion, and archive readiness can be conflated if all require deletion first.                                                              | Employment inactivation/termination records immediately and opens reassignment state; active/future allocations block only demotion/archive readiness. Historical rows remain.                   | 1B, 1C                      |
| Teacher App access                  | Access requires an authenticated Teacher actor and a complete active membership context. Allocation access additionally checks school and teacher ownership.                                                                      | `src/modules/teacher-app/access/teacher-app-access.domain.ts`; `teacher-app-access.service.ts`; `teacher-app-allocation-read.adapter.ts`                                                                                        | `classId` is `TeacherSubjectAllocation.id`; same-school other-teacher access is forbidden and cross-school data is hidden.                                                     | Profile adoption could weaken allocation ownership or trust a route id alone.                                                                                        | Keep the access service and add live TeacherProfile/employment checks without weakening User, Membership, school, or allocation ownership.                                                       | 1E                          |
| Teacher App profile                 | Existing profile reads active Teacher `User` identity, active Membership role, school display, owned allocations, and distinct students.                                                                                          | `src/modules/teacher-app/profile/application/get-teacher-profile.use-case.ts`; `infrastructure/teacher-profile-read.adapter.ts`; `presenters/teacher-profile.presenter.ts`                                                      | Email/phone/names come from User; avatar is always null; class summary comes from allocations.                                                                                 | The folder name can be mistaken for persisted TeacherProfile ownership.                                                                                              | It remains a composition endpoint and later adopts the core TeacherProfile read model.                                                                                                           | 1E                          |
| Teacher App employment profile      | The endpoint returns null fields with status `unsupported`.                                                                                                                                                                       | `src/modules/teacher-app/profile/application/get-teacher-employment-profile.use-case.ts`; `presenters/teacher-profile.presenter.ts`                                                                                             | No employment data source exists.                                                                                                                                              | Pretending current User or Membership fields are an employment profile would invent unsupported truth.                                                               | Future TeacherProfile becomes the employment source; until 1E the unsupported response remains unchanged.                                                                                        | 1E                          |
| Teacher avatar state                | No Teacher avatar relation exists. Teacher App returns `avatarUrl: null`. A Student avatar implementation stores `avatarFileId`, but currently checks declared MIME only and does not clean the replaced/deleted old object.      | `prisma/schema.prisma`; `src/modules/teacher-app/profile/**`; `src/modules/student-app/profile/**`                                                                                                                              | Teacher has no managed upload/download lifecycle. Existing generic upload has compensation for metadata failure; Student avatar has partial compensation.                      | Copying the existing Student path unchanged would miss signature validation and old-file cleanup.                                                                    | Add `TeacherProfile.avatarFileId` and the full contract in section 8.                                                                                                                            | 1D                          |
| File download authorization         | Generic download requires `files.downloads.view` and a school-scoped File lookup, then returns a short-lived signed redirect.                                                                                                     | `src/modules/files/uploads/controller/uploads.controller.ts`; `get-file-download-url.use-case.ts`; `files.repository.ts`; `src/infrastructure/storage/**`                                                                       | Any actor with the permission can access any non-deleted File in the current school. The seeded Teacher role intentionally lacks generic download permission.                  | Granting generic file permission to Teachers would broaden access beyond their avatar.                                                                               | Keep generic File access unchanged. Teacher avatar uses dedicated management/self routes with profile ownership checks.                                                                          | 1D                          |
| Permissions                         | Current catalog has settings, academics, file, and Teacher App permissions, but no `teachers.*` record/assignment permissions.                                                                                                    | `prisma/seeds/01-permissions.seed.ts`; `prisma/seeds/02-system-roles.seed.ts`                                                                                                                                                   | School admin receives the school-level catalog; Teacher receives app permissions and upload, but not generic file download.                                                    | Reusing broad `settings.users.manage` or `academics.structure.manage` would overgrant.                                                                               | Add only the four permissions in section 10 in a later phase; credentials stay under settings permissions.                                                                                       | 1B, 1C                      |
| School-scope extension              | Membership, File, academic structure, SubjectAllocation, and TeacherSubjectAllocation are registered. User is deliberately excluded.                                                                                              | `src/infrastructure/database/school-scope.extension.ts`; `src/infrastructure/database/tests/school-scope.extension.spec.ts`                                                                                                     | Scoped repositories receive current-school filtering for registered models.                                                                                                    | A future model omitted from the explicit set would be cross-tenant readable.                                                                                         | TeacherProfile must be registered in `SCHOOL_SCOPED_MODELS` in the same phase as its schema.                                                                                                     | 1A                          |
| Soft-delete extension               | User, Membership, File, academic structures, and many domain models are registered. TeacherSubjectAllocation has no soft delete.                                                                                                  | `prisma/schema.prisma`; `src/infrastructure/database/school-scope.extension.ts`                                                                                                                                                 | Registered reads exclude `deletedAt != null`; allocation history is protected mainly through restrictive relations and dependency rules.                                       | A future profile with `deletedAt` but no registration would leak archived rows into normal reads.                                                                    | TeacherProfile must have `deletedAt` and be registered in `SOFT_DELETE_MODELS`.                                                                                                                  | 1A                          |
| Audit logging                       | User create/update/status and credential actions audit explicitly. Allocation mutations do not currently call audit. Existing metadata sometimes includes display names or generated-login flags.                                 | `src/modules/settings/users/application/**`; `src/modules/settings/users/credentials/application/**`; `src/modules/academics/teacher-allocation/application/**`; `src/modules/iam/auth/infrastructure/auth.repository.ts`       | Coverage is uneven and no rejected Teacher role-transition event exists.                                                                                                       | Sensitive directory changes and rejected transitions could be untraceable; personal values could enter metadata.                                                     | Use the actions and safe metadata rules in section 12. Assignment mutations gain audit coverage in 1C.                                                                                           | 1B, 1C, 1D                  |

## 3. Canonical ownership matrix

One semantic field has one writable owner. Compatibility projections may be populated during a bounded transition, but are never independently writable.

| Semantic field       | Sole canonical owner                                                                         | Contract                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Login email          | `User.email`                                                                                 | Login identifier only; never copied to TeacherProfile.                                                            |
| Username             | `User.username`                                                                              | School-owned login identity input.                                                                                |
| Contact email        | `User.contactEmail`                                                                          | Communication/delivery address; distinct from login email.                                                        |
| Phone                | `User.phone`                                                                                 | Shared person/contact identity used by auth/app composition; not copied to TeacherProfile.                        |
| Password hash        | `User.passwordHash`                                                                          | Written only by IAM credential services.                                                                          |
| Credential state     | `User.mustChangePassword`, `passwordProvisionedAt`, `passwordChangedAt`, `credentialVersion` | Teacher APIs expose a summary only.                                                                               |
| Account status       | `User.status`                                                                                | Login eligibility; not employment or membership state.                                                            |
| Membership status    | `Membership.status`, `startedAt`, `endedAt`, `deletedAt`                                     | School access state.                                                                                              |
| Teacher code         | `TeacherProfile.teacherCode`                                                                 | Unique per school after normalization.                                                                            |
| Arabic names         | `TeacherProfile.firstNameAr`, `TeacherProfile.lastNameAr`                                    | Canonical Arabic Teacher Directory names; no derived full-name columns.                                           |
| English names        | `TeacherProfile.firstNameEn`, `TeacherProfile.lastNameEn`                                    | Canonical English Teacher Directory names; no derived full-name columns.                                          |
| Gender               | `TeacherProfile.gender`                                                                      | Teacher personal record.                                                                                          |
| Employment status    | `TeacherProfile.employmentStatus`                                                            | Independent from User and Membership status.                                                                      |
| Department           | `TeacherProfile.department`                                                                  | Bounded V1 text; this is not an HR module.                                                                        |
| Specialization       | `TeacherProfile.specialization`                                                              | Bounded V1 text.                                                                                                  |
| Employment type      | `TeacherProfile.employmentType`                                                              | Teacher employment enum.                                                                                          |
| Experience           | `TeacherProfile.experienceYears`                                                             | Integer 0-60.                                                                                                     |
| Hire date            | `TeacherProfile.hireDate`                                                                    | Date-only value.                                                                                                  |
| Working days         | `TeacherProfile.workingDays`                                                                 | `TeacherWorkDay[]`; at most seven unique values in canonical weekday order; empty means not configured.           |
| Working time         | `TeacherProfile.workStartTime`, `TeacherProfile.workEndTime`                                 | Nullable pair; end must be after start.                                                                           |
| Teacher notes        | `TeacherProfile.notesAr`, `TeacherProfile.notesEn`                                           | Bounded teacher-management notes; excluded from ordinary audit metadata and exports unless explicitly authorized. |
| Avatar file relation | `TeacherProfile.avatarFileId` -> private `File`                                              | URL/object coordinates are never profile state.                                                                   |
| Academic assignments | `TeacherSubjectAllocation`                                                                   | Arrays and hierarchy labels are derived projections only.                                                         |

`TeacherProfile.firstNameAr`/`lastNameAr` and `firstNameEn`/`lastNameEn` are the sole writable bilingual Teacher Directory name source. Existing required `User.firstName`/`lastName` fields remain IAM/display compatibility projections only. The Teacher lifecycle application service derives those projections from the approved preferred display language and updates them in the same database transaction as the canonical Profile change; generic settings cannot edit them independently for a Teacher after cutover.

## 4. Target domain model

The following is a future target, not a Prisma change in 0A. The first additive migration may temporarily make backfill-sensitive fields nullable; hardening is deferred until section 13 gates pass.

```prisma
model TeacherProfile {
  id               String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  schoolId         String                  @map("school_id") @db.Uuid
  userId           String                  @map("user_id") @db.Uuid
  teacherCode      String                  @map("teacher_code") @db.VarChar(20)
  firstNameAr      String?                 @map("first_name_ar") @db.VarChar(50)
  lastNameAr       String?                 @map("last_name_ar") @db.VarChar(50)
  firstNameEn      String?                 @map("first_name_en") @db.VarChar(50)
  lastNameEn       String?                 @map("last_name_en") @db.VarChar(50)
  gender           TeacherGender
  employmentStatus TeacherEmploymentStatus
    @default(INACTIVE)
    @map("employment_status")
  department       String?                 @db.VarChar(120)
  specialization   String?                 @db.VarChar(120)
  employmentType   TeacherEmploymentType?  @map("employment_type")
  experienceYears  Int?                    @map("experience_years")
  hireDate         DateTime?                @map("hire_date") @db.Date
  workingDays      TeacherWorkDay[]         @default([]) @map("working_days")
  workStartTime    DateTime?                @map("work_start_time") @db.Time(0)
  workEndTime      DateTime?                @map("work_end_time") @db.Time(0)
  notesAr          String?                  @map("notes_ar") @db.VarChar(500)
  notesEn          String?                  @map("notes_en") @db.VarChar(500)
  avatarFileId     String?                  @map("avatar_file_id") @db.Uuid

  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  school     School @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  user       User   @relation(fields: [userId], references: [id], onDelete: Restrict)
  avatarFile File?  @relation(fields: [avatarFileId, schoolId], references: [id, schoolId], onDelete: Restrict)

  @@unique([id, schoolId])
  @@unique([schoolId, userId])
  @@unique([schoolId, teacherCode])
  @@index([schoolId])
  @@index([schoolId, employmentStatus])
  @@index([avatarFileId])
  @@index([deletedAt])
  @@map("teacher_profiles")
}
```

Required target properties:

- School-scoped with UUID primary key.
- School-specific relation to User. The future inverse is `User.teacherProfiles: TeacherProfile[]`, not a globally one-to-one relation.
- Database uniqueness permits at most one Profile, live or archived, for a given `(schoolId, userId)` pair. A separate partial unique index permits at most one non-deleted Profile per User globally.
- Soft deleted and registered in both explicit Prisma extension model sets.
- Teacher code normalized to uppercase/no whitespace and unique within school, not globally.
- Teacher-specific canonical Arabic/English names and personal/employment fields only. Bilingual fields remain nullable for explicitly incomplete legacy backfills; activation requires the approved completeness policy.
- The database default is fail-closed `INACTIVE`, but application workflows never rely on it: every complete new provisioning explicitly writes the approved intended employment status, and every incomplete legacy backfill explicitly writes `INACTIVE`.
- `workingDays` has at most seven non-duplicated enum values in canonical weekday order; `[]` means not configured. `workStartTime` and `workEndTime` are either both null or both present, and end must be after start.
- Private `avatarFileId`; never `avatarUrl`, bucket, or object key.
- No email, username, phone, password, credential, account-status, or membership-status duplicate.
- `User.firstName`/`lastName` remain required derived IAM/display projections, never a second writable Teacher name source.
- No assignment arrays and no derived full-name columns.
- No `subjectIds`, `stageIds`, `gradeIds`, `sectionIds`, or `classroomIds` storage.

Prisma cannot express the required partial uniqueness in this proposed model. A reviewed future 1A migration must add this exact PostgreSQL index as custom migration SQL:

```sql
CREATE UNIQUE INDEX teacher_profiles_one_live_per_user_idx
ON teacher_profiles (user_id)
WHERE deleted_at IS NULL;
```

This SQL is contract evidence only in 0A; no migration is created or executed in this phase. Together, the composite constraint and partial index lock these cardinalities:

- A User may have historical archived TeacherProfiles in different schools.
- A User may have at most one non-deleted TeacherProfile globally.
- A User may have at most one TeacherProfile, live or archived, for the same school.

### Organization ownership decision

`organizationId` is **not necessary** on TeacherProfile. Current school-owned core records such as Student, Subject, Classroom, and TeacherSubjectAllocation carry `schoolId` and derive organization through School. Each TeacherProfile is one school's employment record even though the global User may move between schools. Adding both identifiers would duplicate the School -> Organization relation and create a drift invariant. Organization is resolved through each Profile's `TeacherProfile.school.organizationId`; a transfer coordinator resolves and verifies both source and destination Schools and their common Organization explicitly.

## 5. Identity and lifecycle invariants

### Global invariants

1. Every User with an operationally active Teacher Membership has exactly one non-deleted TeacherProfile in that Membership's school after cutover. A Teacher User between employment episodes may have only archived Profiles.
2. Every non-deleted TeacherProfile links to a non-deleted `UserType.TEACHER` User.
3. A live Teacher has exactly one operationally active Teacher Membership: `status=ACTIVE`, `endedAt=null`, `deletedAt=null`, membership `userType=TEACHER`, and role key `teacher` in the same school as the profile.
4. TeacherProfile school and active Membership school must match.
5. Only Teacher lifecycle application services may cross into or out of Teacher identity.
6. `User + Membership + TeacherProfile + transactional audit` changes execute through one database transaction client. Session revocation is a separate required use-case step unless it is explicitly implemented through that same database transaction client: it must complete before success is returned, failure is closed, and retryable sanitized operational evidence is recorded without session/token data.
7. Security suspension can take effect immediately; business lifecycle changes never destroy historical identity or allocations.
8. A User has at most one non-deleted TeacherProfile globally, at most one Profile for the same school across live and archived rows, and may have multiple archived Profiles only when they belong to different schools.

| Transition                                       | Locked invariant and side effects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teacher User creation                            | Create `User` as `INVITED`, with User type Teacher and no plaintext credential. Login email/username/contact identity are resolved by existing IAM rules. Do not create an active credential-less Teacher User through generic settings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Teacher Membership creation                      | In the same transaction, create one active current-school membership with membership type Teacher and exact role key `teacher`. Enforce the existing partial unique index plus application checks for ended/deleted/mismatched rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| TeacherProfile creation                          | In the same transaction, create a complete school-matching profile and explicitly write its intended employment status; provisioning never relies on the `INACTIVE` schema default. No successful provisioning result may expose a User without its profile.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Teacher role promotion                           | Lock target User and memberships; require no conflicting active membership; create the profile, update User/Membership type and role, and write audit through one database transaction. Session revocation must complete before success; it is not described as transactionally atomic unless it uses the same transaction client. A promotion without profile provisioning is rejected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Teacher role demotion                            | Reject while active/future allocations remain. Otherwise archive the profile, end/deactivate the Teacher membership, change role/type, update compatibility projections, and write audit through one database transaction. Session revocation must complete before success and fails closed; it is not assumed atomic with that transaction. Soft-deleted profile history may retain the User relation.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Account activation                               | Require complete live Profile with `employmentStatus=ACTIVE`, exact active Teacher Membership/role/type consistency, and a provisioned credential that satisfies IAM gates. Set `User.status=ACTIVE`; do not silently repair Profile or Membership state in this account-only transition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Account disabling                                | Set User disabled and revoke all sessions immediately. Do not delete Profile/Membership/allocations. Security disable is not blocked by academic dependencies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Membership suspension                            | Set Membership suspended, retain dates/history, and revoke sessions immediately. Do not change credentials or delete allocations. Active/future allocation reassignment becomes a management remediation item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Employment reactivation (`INACTIVE` -> `ACTIVE`) | Require a complete live Profile; exactly one same-school, non-ended Membership with Teacher type and exact role key `teacher`; consistent User Teacher type; and a provisioned credential satisfying IAM activation policy. In one DB transaction set Profile employment `ACTIVE`, Membership `ACTIVE`, User `ACTIVE`, compatibility projections, and transactional audit. Revoke stale sessions before success and fail closed. This transition cannot restore a `TERMINATED`/archived Profile; that uses rehire.                                                                                                                                                                                                                                                                                                                                      |
| Employment inactivation                          | Record Profile `INACTIVE`, set `User.status=DISABLED`, set the exact current Teacher Membership to `SUSPENDED` with `endedAt=null`, retain all allocations, and emit `reassignmentRequired=true` when active/future allocations exist. These DB changes and transactional audit share one transaction. Revoke sessions before success and fail closed. This closes Teacher App access before phase 1E because authentication/account and active-membership controls already reject access.                                                                                                                                                                                                                                                                                                                                                              |
| Employment termination                           | Record Profile `TERMINATED`, set `User.status=DISABLED`, and end the exact current Teacher Membership using the locked policy `status=INACTIVE` plus `endedAt=terminationEffectiveAt`. Retain all allocations and emit `reassignmentRequired=true` when active/future allocations exist. These DB changes and transactional audit share one transaction. Revoke sessions before success and fail closed. Preserve identity/history; later return uses rehire.                                                                                                                                                                                                                                                                                                                                                                                           |
| Same-school rehire / archived Profile restore    | Lock User and the archived Profile for the requested school. Restore that exact school-specific Profile; never create a second Profile for the same `(schoolId, userId)`. Preserve its school association, clear `deletedAt`, update only managed employment fields, validate/update destination teacherCode, and restore or create the exact school Membership while retaining ended historical rows. Keep `User.status=DISABLED`, explicit Profile employment `INACTIVE`, and the non-ended Membership `SUSPENDED` until separate reactivation/credential gates pass. Preserve allocations/audits, write restore audit transactionally, revoke stale sessions before success, and fail closed. Other archived school Profiles remain untouched.                                                                                                       |
| Cross-school transfer / new-school employment    | A dedicated organization-authorized coordinator locks the User, source Profile/Membership, and any archived destination Profile. In one reviewed lifecycle transaction it closes the source Membership with `status=TRANSFERRED` and `endedAt=transferEffectiveAt`, archives the source Profile, then creates or restores the destination-school Profile and creates/restores the exact destination Teacher Membership. The destination Profile is explicitly `INACTIVE`, destination Membership is `SUSPENDED` with `endedAt=null`, and User is `DISABLED` until separate reactivation and credential gates pass. Revoke stale sessions before success and fail closed. No other live Profile or active Teacher Membership may remain. Preserve every source Profile, Membership, allocation, audit, timetable, lesson-plan, and homework history row. |
| Archive                                          | `DELETE /teachers/:teacherId` means archive, never hard delete. Reject active/future allocations; soft-delete Profile, end the exact Teacher Membership with `status=INACTIVE` and `endedAt=archiveEffectiveAt`, disable User, and write transactional audit. Revoke sessions before success and fail closed. Do not hard-delete User, File history, audit, or academic history.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Session revocation                               | Mandatory after credential set/generate/regenerate, account disable, membership suspension/end, employment inactivation/reactivation/termination, role promotion/demotion, rehire, and archive. It must complete before success, fail closed on error, and record retryable sanitized operational evidence. It is not called transactionally atomic unless executed by the same DB transaction client.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Historical data preservation                     | User id, archived profile, memberships, historical allocations, timetable/lesson/homework references, and audits remain resolvable for authorized historical views. Presenters may display a stable archived label without exposing credentials or PII beyond permission.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

The phase 1B access bridge is mandatory: until phase 1E adds direct TeacherProfile checks to Teacher App composition, `INACTIVE` and `TERMINATED` transitions deny access through the already-enforced disabled User and non-active Membership controls. Profile remains the employment truth; User/Membership changes are coordinated access projections, not competing employment state.

TeacherProfile stores current employment state, not duplicate employment history. Rehire never appends embedded history rows or arrays to Profile. A separately designed future employment-event/history model may preserve richer employment episodes without changing Profile identity or existing allocation/audit history.

The cutover must explicitly prevent:

- Teacher User without TeacherProfile.
- Live TeacherProfile linked to a non-Teacher User.
- Generic settings user creation or update bypassing Teacher provisioning/lifecycle.
- Role demotion with active/future allocations.
- Role promotion without profile provisioning.
- A second non-deleted TeacherProfile for one User, or a second Profile for the same User and school.
- Hard deletion of historical Teacher identity.

### Same-school rehire versus cross-school movement

Same-school rehire restores the archived Profile already owned by that school. It never changes that Profile's `schoolId`, never creates a duplicate `(schoolId, userId)` row, and never erases the User's other archived school histories.

Cross-school transfer or new-school employment preserves the global User and credential identity but treats employment facts as destination-owned. It must not mutate the archived source Profile's `schoolId`, and it must not automatically copy `teacherCode`, department, hire date, working schedule, or employment state to the destination. The destination receives a destination-school teacherCode and managed destination employment data.

For an immediate transfer, the coordinator archives the currently live source Profile and marks its Membership `TRANSFERRED` before creating/restoring the destination Profile. For new-school employment after an earlier employment episode was already closed, there is no live source row to mutate: the coordinator proves that every prior Profile is archived and no active Teacher Membership exists, preserves those rows unchanged, and performs only the destination create/restore path.

Cross-school movement is a dedicated organization-authorized lifecycle operation, not a School Admin route with widened scope. The future coordinator must:

- Resolve source and destination explicitly and verify both Schools belong to the same Organization.
- Require an organization-authorized actor; a regular School Admin cannot discover, inspect, or mutate another school's Profile.
- Preserve the ordinary safe 404 contract for unauthorized actors, without revealing whether a foreign Profile or school relationship exists.
- Use one reviewed lifecycle coordinator and explicit repositories/policies rather than ad hoc school-scope bypass.
- Preserve the source school Profile, Membership, allocations, audit, timetable, lesson-plan, and homework history.

The exact transfer endpoint path is intentionally deferred until phase 1B verifies existing organization-management route conventions. Phase 1A must nevertheless implement the data constraints and repositories needed by this coordinator.

## 6. Academic source of truth

`TeacherSubjectAllocation` is locked as the **only writable academic assignment truth**.

Directory/API fields are projections:

| Projection     | Derivation                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| `subjectIds`   | Distinct `TeacherSubjectAllocation.subjectId` for the selected term/filter. |
| `classroomIds` | Distinct `TeacherSubjectAllocation.classroomId`.                            |
| `sectionIds`   | Allocation classroom -> section.                                            |
| `gradeIds`     | Allocation classroom -> section -> grade.                                   |
| `stageIds`     | Allocation classroom -> section -> grade -> stage.                          |

The directory never accepts these arrays as TeacherProfile writes. Assignment mutations delegate to Academics and validate the selected term, school hierarchy, Teacher state, and SubjectAllocation matrix.

Permission compatibility is locked:

- Existing `/api/v1/academics/allocations` routes retain `academics.structure.view` and `academics.structure.manage`. Those decorators are not replaced by Teacher Directory permissions.
- A future Teacher Directory facade exposes the routes below with `teachers.assignments.view` or `teachers.assignments.manage`, resolves `teacherId` to the canonical Teacher User, and delegates to the same shared allocation application services and repositories.
- The facade contains no duplicate validation, dependency checking, persistence, or allocation business logic. `TeacherSubjectAllocation` remains the only writable truth.

```http
GET    /api/v1/teachers/:teacherId/assignments
PUT    /api/v1/teachers/:teacherId/assignments/bulk
POST   /api/v1/teachers/:teacherId/assignments/apply-to-grade
POST   /api/v1/teachers/:teacherId/assignments/clear-subject
DELETE /api/v1/teachers/:teacherId/assignments/:allocationId
```

The following proposed parallel tables are explicitly rejected:

- `teacher_assignment_subjects`
- `teacher_assignment_stages`
- `teacher_assignment_grades`
- `teacher_assignment_sections`
- A `teacher_term_assignments` aggregate that duplicates TeacherSubjectAllocation

Current deletion checks count timetable entries, lesson plans, and homework assignments. Consequently:

- Employment `INACTIVE` or `TERMINATED` may be recorded immediately, retains allocations, blocks Teacher App access, and creates a reassignment-required operational state.
- Active/future allocations must be reassigned/removed before role demotion or archive. A dependency conflict blocks those readiness transitions; the lifecycle service must not bypass the shared Academic use case or delete dependent rows.
- Closed/historical-term allocations remain historical truth and do not need deletion for archive once no active/future allocations remain.
- Security account disable or membership suspension remains immediate and does not delete allocations.

## 7. Credential contract

Credential writes remain under the existing endpoints:

- `POST /api/v1/settings/users/:userId/credentials/generate`
- `POST /api/v1/settings/users/:userId/credentials/set`
- `POST /api/v1/settings/users/:userId/credentials/regenerate`
- Existing collection status/preview/bulk endpoints remain available under settings permissions.

Locked rules:

- No Teacher password column or credential table.
- No Teacher-specific hashing or password policy.
- No plaintext password persistence, logging, audit metadata, classifier output, or later retrieval.
- Do not use `POST /api/v1/settings/users/:id/reset-password`; its current implementation is a placeholder that does not change credentials.
- Teacher create/update endpoints do not accept a password.
- Teacher responses return a credential summary only: `hasPassword`, `status`, `mustChangePassword`, `passwordProvisionedAt`, `passwordChangedAt`, and `credentialVersion` as authorized. They never return `passwordHash` or a prior temporary password.
- A one-time generated temporary password is returned only by the existing credential generation response.

## 8. Avatar contract

The stored relation is `TeacherProfile.avatarFileId`, referencing a private, same-school File. A URL is a delivery result, never stored profile state.

### Upload and replacement

1. Management route requires `teachers.records.manage`; self delivery uses the existing Teacher App self permission, but no self-upload route is introduced by this contract.
2. Require multipart field `file`.
3. Resolve the target live TeacherProfile inside the current school before storage access.
4. Allow only `image/png` and `image/jpeg` in V1. WebP is rejected until a separately verified decoder and structural validator are approved.
5. Maximum size is 5 MiB.
6. Validate declared MIME **and** content signature/decodable structure; extension is not authoritative.
7. Save bytes to private object storage with a generated key. Never accept a client object key.
8. Persist File metadata and link `avatarFileId` in a database transaction with same-school verification.
9. If storage succeeds but database work fails, delete the new object; if File metadata exists, soft-delete it. Return `teachers.avatar.service_unavailable` if compensation cannot make the operation safe and queue cleanup for retry.
10. On replace, commit the new relation before cleanup. Then soft-delete the old File metadata and remove the old object. Cleanup failure is queued/retried and audited without exposing storage coordinates.

### Delete and delivery

- The Profile/File foreign key uses `onDelete: Restrict`. Replace/delete must explicitly unlink `avatarFileId` before File soft deletion; neither database deletion nor relation behavior silently clears the link.
- Delete clears `avatarFileId` and soft-deletes the old File metadata transactionally, then removes the old object with retryable cleanup.
- Management GET checks `teachers.records.view`, current school, live/authorized profile, and same-school private File.
- Self GET `/api/v1/teacher/profile/avatar` checks current Teacher actor, active matching membership, live employment-active profile, and exact `profile.userId = actor.id`.
- Delivery is locked to the dedicated authorized Teacher avatar endpoint followed by a short-lived HTTP `307` signed redirect. Streaming is not the V1 contract. The endpoint resolves TeacherProfile first, resolves its linked private File internally, and only then creates the signed redirect.
- Teacher users are not granted generic school-file access. The seeded Teacher role currently lacks `files.downloads.view`; this remains intentional.
- Management access is current-school record access. Self access is exact User/Profile ownership. Neither delivery path accepts or trusts a File id supplied by the client.
- Neither delivery endpoint returns a permanent/direct object URL in JSON; the signed target exists only in the authorized HTTP `307` redirect response.
- Audit metadata may contain resource/File UUIDs, MIME classification, byte count, and action result, but never original filename, name, email, bucket, object key, signed URL, checksum, or image bytes.

## 9. API contract proposal

These are future contracts only. The global prefix makes every route `/api/v1/...`.

### Common response and scope rules

- `teacherId` is `TeacherProfile.id`, not User id and not allocation id.
- All management routes require an authenticated active school-management actor and automatic school scope.
- Missing, cross-school, deleted, archived, or inaccessible Teacher, allocation, academic year, term, subject, grade, section, or classroom resources return `teachers.assignments.not_found` (or the repository's generic safe 404 envelope) before relationship validation.
- `teachers.assignments.invalid_scope` is evaluated only after every referenced resource is proven visible in the current school; it means those visible same-school resources have an invalid relationship to one another.
- Assignment error responses never echo foreign ids or tenant identifiers and never reveal which hidden resource existed.
- Teacher records present User-owned and Profile-owned fields through a presenter; no tenant ids, hashes, object coordinates, or persisted full-name columns are returned.
- Assignment lists require an explicit/active term policy and project from TeacherSubjectAllocation.

| Endpoint                                                       | Permission                                                                                  | Scope                                 | Input                                                                                                                                                            | Output                                                                                                                     | Errors                                                                                                                                          | Audit event                                                                                                 | Ownership checks                                                                                                 | Transaction boundary                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/teachers`                                         | `teachers.records.view`                                                                     | Current school                        | Search; account/membership/employment/gender filters; assignment filters plus term; page/limit                                                                   | Paginated Teacher record summaries, explicit lifecycle states, credential summary, derived assignment labels/counts        | `validation.failed`; safe `teachers.assignments.not_found` for referenced assignment filters; `invalid_scope` only after same-school visibility | None for ordinary read                                                                                      | School-scoped Profile plus same User/Membership; assignment enrichments must match Profile User and school       | No write; one consistent read snapshot when composing multiple repositories                                                                                          |
| `GET /api/v1/teachers/:teacherId`                              | `teachers.records.view`                                                                     | Current school                        | UUID; optional term context                                                                                                                                      | One composed Teacher record with lifecycle and credential summary                                                          | `teachers.profile.not_found`; `teachers.profile.incomplete`; safe assignment not-found or same-school invalid relationship for term context     | None                                                                                                        | Profile school, User relation, active/historical Membership policy; safe 404 cross-school                        | No write; consistent read snapshot                                                                                                                                   |
| `POST /api/v1/teachers`                                        | `teachers.records.manage`                                                                   | Current school                        | User-owned login/contact fields plus Profile-owned bilingual names/code/personal/employment fields; preferred display language; no password or assignment arrays | Created invited Teacher record, lifecycle-managed User display projection, and credential summary                          | `teachers.profile.code_conflict`; `teachers.profile.incomplete`; `teachers.account.identity_conflict`; `teachers.account.teacher_role_required` | `teachers.account.provision`; `teachers.profile.create`                                                     | Role must be exact assignable Teacher role in school; identity uniqueness is global/current IAM policy           | One DB transaction for User + Membership + Profile + transactional audit; storage and credentials excluded                                                           |
| `PATCH /api/v1/teachers/:teacherId`                            | `teachers.records.manage`                                                                   | Current school                        | Patch of User-owned identity/contact fields and Profile-owned record fields; excludes statuses, credentials, assignments, avatar bytes                           | Updated composed record                                                                                                    | Not found; code/identity conflict; incomplete; role transition conflict                                                                         | `teachers.profile.update`; identity action only when User-owned fields change                               | Current-school live Profile; linked User must remain Teacher; no cross-Teacher update                            | One DB transaction for User/Profile and audits                                                                                                                       |
| `PATCH /api/v1/teachers/:teacherId/employment-status`          | `teachers.records.manage`                                                                   | Current school                        | `ACTIVE` reactivation from `INACTIVE`, `INACTIVE`, or `TERMINATED`; optional non-sensitive reason code                                                           | Explicit Profile/User/Membership states plus `reassignmentRequired` derived from retained active/future allocations        | Profile not found; incomplete; credential/role/membership gate; invalid transition                                                              | `teachers.employment_status.change`; exact account/membership actions                                       | Current-school live Profile; allocation state is read for remediation, not a write gate                          | One DB transaction writes exact section 5 Profile/User/Membership states and transactional audit; stale-session revocation completes before success and fails closed |
| `POST /api/v1/teachers/:teacherId/rehire`                      | `teachers.records.manage`                                                                   | Current school                        | Archived current-school TeacherProfile UUID, managed Profile fields, teacherCode decision, exact Teacher role; no password or assignments                        | Restored Profile with disabled account, explicit `INACTIVE` employment, exact suspended Membership, and credential summary | Safe profile not found; code/identity/role/membership/live-profile conflict; incomplete managed input                                           | `teachers.profile.restore`; `teachers.account.rehire`                                                       | Lock User and exact archived current-school Profile; reject another live Profile or active Teacher Membership    | One DB transaction restores the same-school Profile and exact Membership while preserving every school history; revoke stale sessions before success and fail closed |
| `DELETE /api/v1/teachers/:teacherId`                           | `teachers.records.manage`                                                                   | Current school                        | UUID; optional non-sensitive archive reason code                                                                                                                 | `{ success: true, archivedAt }`                                                                                            | Not found; active assignments; archive conflict                                                                                                 | `teachers.profile.archive`; account/membership lifecycle actions                                            | Current-school live Profile; no active/future allocations; historical references retained                        | One DB transaction for soft archive, membership end, User disable, audits; revoke sessions before success                                                            |
| `GET /api/v1/teachers/reference-data`                          | `teachers.assignments.view`                                                                 | Current school and selected year/term | `yearId`, `termId`                                                                                                                                               | Safe subjects/stages/grades/sections/classrooms derived from Academics                                                     | Safe `teachers.assignments.not_found`; `teachers.assignments.invalid_scope` only for visible same-school relationship defects                   | None                                                                                                        | Resolve every resource through current-school visibility before hierarchy validation                             | No transaction/write                                                                                                                                                 |
| `GET /api/v1/teachers/:teacherId/assignments`                  | `teachers.assignments.view`                                                                 | Current school and term               | Teacher UUID; term; optional subject/classroom filters                                                                                                           | Allocation rows plus derived hierarchy; no parallel profile arrays                                                         | Safe `teachers.assignments.not_found`; visible same-school `teachers.assignments.invalid_scope`                                                 | None                                                                                                        | Resolve Profile/User/resources in current school before validating their relationships                           | No write; consistent read snapshot                                                                                                                                   |
| `PUT /api/v1/teachers/:teacherId/assignments/bulk`             | `teachers.assignments.manage`                                                               | Current school and active term        | Teacher UUID, term UUID, bounded subject/classroom allocation inputs; no profile assignment arrays                                                               | Canonical allocation rows and derived validation summary                                                                   | Safe `teachers.assignments.not_found`; visible same-school `teachers.assignments.invalid_scope`; shared dependency/conflict errors              | `teachers.assignment.bulk_save`; per-row creates use `teachers.assignment.create`; counts/opaque ids only   | Resolve Profile and all resources through current-school visibility before relationship validation               | Delegate to the existing shared bulk allocation service and its transaction; facade adds no persistence                                                              |
| `POST /api/v1/teachers/:teacherId/assignments/apply-to-grade`  | `teachers.assignments.manage`                                                               | Current school and active term        | Teacher UUID, term UUID, subject UUID, grade UUID; shared service derives eligible classrooms                                                                    | Created/existing canonical allocations and bounded summary                                                                 | Safe `teachers.assignments.not_found`; visible same-school `teachers.assignments.invalid_scope`; shared matrix/dependency conflicts             | `teachers.assignment.apply_to_grade`; created rows use `teachers.assignment.create`; counts/opaque ids only | Resolve Profile/resources through current-school visibility before matrix/relationship validation                | Delegate to the existing shared apply-to-grade service and its transaction                                                                                           |
| `POST /api/v1/teachers/:teacherId/assignments/clear-subject`   | `teachers.assignments.manage`                                                               | Current school and active term        | Teacher UUID, term UUID, subject UUID                                                                                                                            | Deleted/retained counts from canonical allocations                                                                         | Safe `teachers.assignments.not_found`; visible same-school `teachers.assignments.invalid_scope`; `teachers.assignments.dependency_conflict`     | `teachers.assignment.clear_subject` with counts/opaque ids only                                             | Resolve Profile/resources through current-school visibility before relationship validation                       | Delegate to the existing shared clear-subject service; dependency checks and transaction remain shared                                                               |
| `DELETE /api/v1/teachers/:teacherId/assignments/:allocationId` | `teachers.assignments.manage`                                                               | Current school and active term        | Teacher UUID and allocation UUID; no User/File ids                                                                                                               | `{ success: true }` after canonical allocation deletion                                                                    | Safe `teachers.assignments.not_found`; visible same-school `teachers.assignments.invalid_scope`; `teachers.assignments.dependency_conflict`     | `teachers.assignment.delete` with opaque allocation/teacher ids only                                        | Resolve Profile/allocation through current-school visibility, then validate Teacher ownership                    | Delegate to the existing shared delete allocation service; dependency checks and transaction remain shared                                                           |
| `GET /api/v1/teachers/export`                                  | `teachers.records.view`; also `teachers.assignments.view` when assignment columns requested | Current school                        | Same bounded filters as list; explicit allowed columns and term                                                                                                  | Streamed CSV or generated export artifact with authorized columns only                                                     | Validation; safe assignment not-found; visible same-school invalid relationship; service unavailable                                            | `teachers.records.export` with counts/column keys only                                                      | Current-school records only; notes/contact columns require explicit allowed export policy                        | Read-only snapshot; any heavy artifact creation is queued and File-owned, not part of Profile transaction                                                            |
| `POST /api/v1/teachers/:teacherId/avatar`                      | `teachers.records.manage`                                                                   | Current school                        | One multipart image; no File id                                                                                                                                  | Safe avatar metadata (MIME, size, updatedAt) and authorized Teacher avatar route, never File/storage URL                   | Not found; file required; MIME/content/size/service errors                                                                                      | `teachers.avatar.upload` or `teachers.avatar.replace`                                                       | Current-school live Profile; new File private and same school                                                    | External storage plus DB transaction and compensation as section 8                                                                                                   |
| `DELETE /api/v1/teachers/:teacherId/avatar`                    | `teachers.records.manage`                                                                   | Current school                        | Teacher UUID                                                                                                                                                     | `{ success: true, avatar: null }`                                                                                          | Not found; service unavailable                                                                                                                  | `teachers.avatar.delete`                                                                                    | Current-school live Profile and currently linked same-school File only                                           | DB unlink/File soft-delete transaction; object cleanup after commit with retry                                                                                       |
| `GET /api/v1/teachers/:teacherId/avatar`                       | `teachers.records.view`                                                                     | Current school                        | Teacher UUID only; no File id                                                                                                                                    | Authorized short-lived HTTP `307` signed redirect; no URL JSON                                                             | Profile/file not found; service unavailable                                                                                                     | None                                                                                                        | Resolve current-school Profile first, then its linked private File internally; never generic/guessed File access | No write; signed target created only after all checks                                                                                                                |
| `GET /api/v1/teacher/profile/avatar`                           | `teacher.profile.view`                                                                      | Current Teacher self context          | No id or File id                                                                                                                                                 | Authorized short-lived HTTP `307` signed redirect; no URL JSON                                                             | Profile/file not found; `teacher_app.actor.required_teacher`; service unavailable                                                               | None                                                                                                        | Exact actor User -> active Membership -> live employment-active Profile -> internally linked private File        | No write; signed target created only after all checks                                                                                                                |

Existing Academics allocation routes keep `academics.structure.view/manage`. The 1C Teacher Directory facade alone uses `teachers.assignments.view/manage`, and delegates every read/write to shared Academics services and repositories without a second writable model or TeacherProfile assignment writer.

No cross-school transfer route is proposed in 0A. Its path, organization authorization permission, and presenter contract are locked during 1B only after existing organization-management route conventions are re-verified. It cannot be implemented by broadening any current-school endpoint above.

## 10. Permissions

Minimum future permission set:

| Permission                    | Purpose                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `teachers.records.view`       | List/detail/export-authorized Teacher records and management avatar delivery.      |
| `teachers.records.manage`     | Provision/update/lifecycle/archive Teacher records and management avatar mutation. |
| `teachers.assignments.view`   | View allocations/reference data through the Teacher Directory facade.              |
| `teachers.assignments.manage` | Invoke shared allocation mutations through the Teacher Directory facade.           |

Credential status remains under `settings.users.view`; credential writes remain under `settings.users.manage`.

Role-seed impact, deferred from 0A:

- Add catalog rows and seed constants only with the implementation phase and required migration/catalog governance.
- `school_admin` receives all four through the existing school-level catalog composition.
- The Teacher system role receives none of the management directory permissions. Its self profile/avatar continues through `teacher.profile.view`, and owned classes continue through Teacher App permissions.
- Any academic manager role receives assignment permissions only by explicit product decision; record manage is not implied by assignment manage.
- Do not grant `files.downloads.view` to Teacher merely for avatar delivery.

No permission seed is modified in 0A.

## 11. Error catalog proposal

| Code                                        | HTTP | Stable meaning                                                                                                                                                                                                                                         |
| ------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `teachers.profile.not_found`                | 404  | Profile does not exist, is archived, or is outside scope.                                                                                                                                                                                              |
| `teachers.profile.code_conflict`            | 409  | Normalized teacher code exists in current school.                                                                                                                                                                                                      |
| `teachers.profile.incomplete`               | 409  | Required cutover/profile fields are missing. Safe details contain field keys only.                                                                                                                                                                     |
| `teachers.account.identity_conflict`        | 409  | Login email, username-derived identity, contact policy, or phone conflicts with IAM uniqueness. Safe details contain field keys only.                                                                                                                  |
| `teachers.account.teacher_role_required`    | 422  | Target role is not the exact Teacher role.                                                                                                                                                                                                             |
| `teachers.account.role_transition_conflict` | 409  | Promotion/demotion violates profile, membership, or allocation invariants.                                                                                                                                                                             |
| `teachers.lifecycle.active_assignments`     | 409  | Active/future allocations block role demotion or archive readiness, not immediate employment-state recording. Details contain counts, term-state labels, and bounded allocation UUIDs only.                                                            |
| `teachers.lifecycle.archive_conflict`       | 409  | Profile cannot be archived due to lifecycle/dependency state.                                                                                                                                                                                          |
| `teachers.assignments.not_found`            | 404  | A Teacher, allocation, academic year, term, subject, grade, section, or classroom is missing, cross-school, deleted, archived, or inaccessible. The safe response does not identify which condition/resource matched and exposes no foreign/tenant id. |
| `teachers.assignments.invalid_scope`        | 422  | All referenced resources are already proven visible in the same school, but their same-school Teacher/term/subject/grade/section/classroom relationship is invalid. Hidden resources are resolved by safe 404 before this code.                        |
| `teachers.assignments.dependency_conflict`  | 409  | Timetable, lesson-plan, or homework references prevent removal/reassignment.                                                                                                                                                                           |
| `teachers.avatar.file_required`             | 400  | Multipart `file` is absent.                                                                                                                                                                                                                            |
| `teachers.avatar.mime_not_allowed`          | 415  | Declared/detected type is not an allowed image.                                                                                                                                                                                                        |
| `teachers.avatar.invalid_content`           | 400  | Signature or decoded image structure is invalid/mismatched.                                                                                                                                                                                            |
| `teachers.avatar.size_exceeded`             | 413  | Image exceeds 5 MiB.                                                                                                                                                                                                                                   |
| `teachers.avatar.service_unavailable`       | 503  | Storage or safe compensation/cleanup is temporarily unavailable.                                                                                                                                                                                       |

These are proposals for a later `ERROR_CATALOG.md` change. 0A does not modify the runtime catalog.

## 12. Audit contract

Required successful actions:

- `teachers.profile.create`
- `teachers.profile.update`
- `teachers.profile.archive`
- `teachers.profile.restore`
- `teachers.employment_status.change`
- `teachers.avatar.upload`
- `teachers.avatar.replace`
- `teachers.avatar.delete`
- `teachers.account.provision`
- `teachers.account.activate`
- `teachers.account.disable`
- `teachers.account.rehire`
- `teachers.account.transfer`
- `teachers.membership.transfer`
- `teachers.membership.suspend`
- `teachers.role.promote`
- `teachers.role.demote`
- `teachers.assignment.create`
- `teachers.assignment.bulk_save`
- `teachers.assignment.apply_to_grade`
- `teachers.assignment.clear_subject`
- `teachers.assignment.delete`
- `teachers.role_transition.rejected`

The endpoint matrix and this audit contract use only the singular assignment action namespace above; plural `teachers.assignments.*` strings are permissions/error codes, never audit actions. Every mutation records actor/user type/organization/school from trusted context, module `teachers` or `academics`, resource type/id, outcome, and timestamp. Rejected transitions record `DENIED`/`FAILURE` with a stable reason code and counts only.

The cross-school coordinator emits `teachers.account.transfer` and `teachers.membership.transfer` plus the applicable source `teachers.profile.archive` and destination `teachers.profile.create` or `teachers.profile.restore` actions. Metadata contains trusted source/destination resource UUIDs and status keys only, never employment field values or PII.

Audit metadata may include:

- Resource UUIDs already needed for correlation.
- Changed field **keys**, not values.
- Previous/next enum status labels.
- Allocation/dependency counts and term-state labels.
- MIME class and size band/byte count.
- Credential boolean/version summary, never credential material.

Audit metadata must not include names, emails, phone numbers, notes, passwords/hashes, temporary passwords, tokens, original filenames, checksums, image bytes, bucket names, object keys, direct/signed URLs, or free-text reasons that can contain PII.

Assignment mutation audit is missing today and must be added in 1C. Rejected role-transition audit is added in 1B.

## 13. Migration and backfill strategy

No migration is generated in 0A. Future work is additive and non-destructive:

1. **Pre-migration classification:** run the 0A classifier in default mode, retain the aggregate JSON artifact securely, and resolve drift/checksum/failed-migration hard stops before feature work.
2. **Additive nullable foundation:** add TeacherProfile table, relations, enums, extension registration, `@@unique([schoolId, userId])`, and the reviewed custom partial unique index `teacher_profiles_one_live_per_user_idx` over `user_id WHERE deleted_at IS NULL`. Fields that lack a trustworthy legacy source begin nullable. The partial index is future migration SQL, never a 0A command. Do not alter or replace existing User/Membership/Allocation rows.
3. **Idempotent backfill:** for each non-deleted Teacher User, resolve the exact operational Teacher membership and its school. Insert only when no Profile exists for that `(schoolId, userId)` and no other non-deleted Profile exists for the User. Ambiguous multiple-school or conflicting live-profile cases are classified for managed remediation rather than guessed. Re-runs update no already-classified complete record and create no duplicate. Existing User names are retained only as a legacy display fallback: do not classify them as Arabic or English, do not copy the same value into both languages, and leave unverified Profile bilingual fields nullable/incomplete for managed remediation. No code, gender, or employment fact is invented.
4. **Profile completeness handling:** backfilled rows missing human-owned fields are incomplete and explicitly write `employmentStatus=INACTIVE`; backfill code does not rely on the schema default. Reads use an explicit completeness projection; activation and Teacher role lifecycle writes fail with `teachers.profile.incomplete` until remediated. Complete new provisioning also writes its intended employment status explicitly rather than relying on the default.
5. **Dual-read compatibility:** directory and Teacher App can temporarily compose Profile when present and the current User/Membership path otherwise. All new Teacher writes use the new aggregate; generic settings Teacher bypass is closed in the same deploy boundary.
6. **Drift detection:** compare classifier counts before/after; measure duplicate `(schoolId, userId)` Profiles, Users with multiple non-deleted Profiles, live Profile/active Membership school mismatches, transferred Memberships whose source Profile remains live, and destination active Memberships without a matching live Profile. Any migration drift, checksum mismatch, failed migration, or reset request is a hard stop under `MIGRATION_GOVERNANCE.md`.
7. **Later hardening after zero-gap evidence:** only after every live Teacher has one complete matching profile may required columns, uniqueness, and checks be tightened in a new incremental migration.
8. **Fresh empty-database replay:** the full active migration chain must deploy successfully to a disposable empty PostgreSQL database, followed by seed, build, and focused tests.
9. **Backfill rehearsal:** rehearse against a disposable/restored representative database; prove counts, idempotency, bounded runtime, safe rollback posture, and no PII in logs/output.
10. **Second deploy no-op:** run deployment a second time and prove no pending or repeated change. Run the backfill a second time and prove zero new rows/changes.

The classifier never repairs anomalies. Remediation is a separately reviewed implementation/data operation.

## 14. Test plan

### Unit

- Teacher code/name/phone ownership normalization and field validation.
- Lifecycle transition policy for every state pair.
- Exact `INACTIVE` and `TERMINATED` Profile/User/Membership projections, `reassignmentRequired`, and gated reactivation policy.
- Same-school rehire restores the exact archived school-specific Profile and never constructs a duplicate `(schoolId, userId)` Profile or embedded employment history.
- Cross-school transfer state machine archives the source, preserves source history, creates/restores the destination fail-closed, and rejects concurrent live Profile or active Membership state.
- Promotion/demotion guards and active/future allocation gates.
- Credential-summary presenter excludes hashes and temporary values.
- Assignment projection deduplicates subjects/stages/grades/sections/classrooms.
- Avatar MIME/signature/size validators and compensation decisions.
- Classifier membership, mismatch, credential, term-state, safe-output, and strict-exit functions.

### Repository/integration

- One-transaction User + Membership + Profile + transactional audit provisioning; session revocation completion/fail-closed behavior is tested separately.
- Composite User/school Profile and school-scoped teacher-code conflicts.
- One-live-Profile-per-User enforcement under concurrent same-school rehire and cross-school transfer attempts.
- Role/type/profile/school consistency under concurrent attempts.
- Archived same-school Profile rehire lock/restore, teacherCode conflict handling, ended-Membership preservation, and other-school archived Profile preservation.
- Cross-school coordinator atomically transfers the source Membership, archives the source Profile, creates/restores the destination Profile/Membership, and fails closed on revocation.
- Soft-delete default and explicit historical reads.
- School-scope and soft-delete extension registration.
- TeacherSubjectAllocation validation against profile employment and role state.
- Avatar same-school File relation, replace/unlink transaction, and cleanup queue/outbox behavior.
- Explicit audit rows with safe metadata.

### E2E

- Every endpoint in section 9: happy path, invalid input, missing permission, lifecycle conflict, and safe response shape.
- Provision -> credential generate/set -> activation -> login -> self avatar read.
- Employment inactive/terminated/archive flows with and without active/future allocations.
- Before phase 1E adoption, employment `INACTIVE`/`TERMINATED` denies login and Teacher App access through disabled User, non-active Membership, and completed session revocation; reactivation proves profile/membership/role/credential gates.
- Rehire restores the archived Profile, preserves allocations/audits, leaves access disabled, and requires separate gated reactivation.
- Cross-school transfer preserves the global User/credential identity and all source histories, does not copy school-owned employment facts, and leaves destination access disabled until reactivation.
- Directory filters/export/reference data/assignment projections.
- Avatar upload/replace/delete/delivery and storage outage compensation.
- Generic settings Teacher creation/promotion/demotion bypass is rejected.
- Legacy reset placeholder is not used.

### Security

For **every** future Teacher endpoint, create School A and School B records, authenticate as School A, submit School B Teacher/Profile/User/allocation/File/term ids where accepted, and expect safe 404. Also cover:

- Same-school actor without each required permission -> 403.
- Teacher self avatar can access only own linked avatar.
- Same-school Teacher cannot access another Teacher avatar through self or generic Files.
- Cross-school File id cannot be used during avatar link/delivery.
- Management routes reject Teacher/Parent/Student actors without management permissions.
- Responses/audits/logs contain no tenant ids when the contract excludes them, hashes, tokens, object coordinates, or direct URLs.
- Guessing archived Teacher ids does not reveal existence.
- For every assignment resource type, missing/cross-school/deleted/archived/inaccessible ids produce the indistinguishable safe 404; only visible same-school relationship defects produce `teachers.assignments.invalid_scope` 422.
- School A Admin cannot inspect or initiate transfer from School B, including by guessing User/Profile ids.
- An organization-authorized actor can transfer only when source and destination belong to that actor's Organization.
- A cross-organization destination is rejected with the safe contract and no foreign-school or Profile disclosure.
- The archived source historical Profile remains inaccessible to unauthorized destination-school actors after transfer.

### Migration

- Structural governance and schema/migration coupling.
- Fresh empty-database replay.
- Representative backfill counts and idempotent second run.
- Incomplete backfills explicitly persist `INACTIVE`, complete provisioning explicitly persists its intended status, and neither path relies on the schema default.
- Duplicate/mismatch fixtures fail safely.
- The partial unique live-profile index permits multiple archived Profiles for one User across different schools and rejects two simultaneous non-deleted Profiles.
- The composite unique constraint rejects duplicate `(schoolId, userId)` Profiles whether live or archived.
- Same-school rehire restores the existing archived Profile; cross-school transfer preserves the source Profile and creates/restores a distinct destination Profile.
- Zero-gap classifier strict mode passes only after fully remediated fixtures.
- Second migration deploy is no-op.
- Fresh replay installs both Profile uniqueness constraints and passes the same rehire/transfer fixtures.

### Regression

- Existing settings user flows for non-Teachers.
- Existing IAM login/change-password/credential endpoints.
- Teacher App ownership and `classId=TeacherSubjectAllocation.id`.
- Academics allocation workflows and dependency conflicts.
- Files generic upload/download permission boundaries.
- Timetable, lesson plans, homework, attendance, grades, reinforcement, and communication Teacher ownership behavior.

## 15. Phased implementation plan

| Phase                                  | Entry criteria                                                                                                                                                       | Outputs                                                                                                                                                                                                                                                                                                                                                  | Forbidden changes                                                                                                                                                                                                                                                                                                                                         | Exit gates                                                                                                                                                                                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1A Data foundation and integrity**   | 0A accepted; classifier run captured; no migration hard stop; target fields/enums approved                                                                           | Additive schema/migration; school-specific TeacherProfile repository and User list relation; composite User/school uniqueness; custom partial one-live-Profile index; scope/soft-delete registration; nullable backfill foundation; transfer-capable data model; classifier compatibility                                                                | Runtime routes or transfer coordinator; generic bypass closure without provisioning path; assignment/avatar writes; destructive history changes                                                                                                                                                                                                           | Governance checks; both uniqueness constraints; multiple archived cross-school fixture; simultaneous-live rejection; fresh replay; idempotent backfill; classifier deltas explained; second deploy/backfill no-op                                                                     |
| **1B Directory and account lifecycle** | 1A deployed; every operational Teacher has a matching live school Profile or explicit incomplete state; shared IAM hooks and organization route conventions verified | Directory create/update/employment/reactivation/same-school rehire/archive; organization-authorized cross-school transfer coordinator and contract; exact Profile/User/Membership access projections close the pre-1E gap; one-transaction domain/audit changes; fail-closed revocation; generic bypass closed; permissions/errors; credential summaries | New password flow; ad hoc scope bypass; School Admin cross-school discovery/mutation; changing archived source `schoolId`; copying school employment facts; treating session revocation as DB-atomic without same client; duplicate same-school/live Profile; embedded employment history; assignment parallel writes; avatar bytes; Teacher App mutation | Unit/integration/E2E/security pass; inactive/terminated/transferred users cannot reach Teacher App before 1E; same-school restore and cross-school preservation proven; organization boundary and safe 404 proven; demotion/archive gates proven; revocations complete before success |
| **1C Academic composition**            | 1B lifecycle stable; profile identity mapping proven; allocation classifier clean enough for rollout                                                                 | Teacher Directory assignment facade using `teachers.assignments.*`; delegation to shared Academics allocation services/repositories; validation extensions and audits; existing Academics routes retain `academics.structure.*`; derived arrays only                                                                                                     | Duplicate facade validation/persistence; changing existing Academics permissions; assignment arrays/parallel tables; bypassing matrix/dependency checks; changing Teacher App `classId`                                                                                                                                                                   | All projections match canonical allocations; facade/shared-service parity; cross-school matrix; mutation audits; active/future invalid allocation count zero                                                                                                                          |
| **1D Managed teacher avatar**          | 1B record ownership stable; File/storage failure policy approved                                                                                                     | Profile File relation adoption; management upload/delete/get; signature validation; compensation/cleanup; dedicated authorization                                                                                                                                                                                                                        | Stored URLs; public objects; generic Teacher file permission; client object keys; copying incomplete Student cleanup behavior                                                                                                                                                                                                                             | Upload/replace/delete/outage/security tests; zero orphaned test objects/metadata; no direct URL/object-coordinate exposure                                                                                                                                                            |
| **1E Teacher App adoption**            | 1B-1D stable; profiles complete for enabled Teachers; compatibility telemetry shows no gaps                                                                          | Teacher App profile/employment/avatar reads adopt core profile; access requires User + Membership + Profile employment; existing allocation ownership preserved                                                                                                                                                                                          | App-facing persistence/repository ownership; Teacher App profile mutation; weakened allocation ownership                                                                                                                                                                                                                                                  | Existing Teacher App regression plus self-avatar and employment tests; no unsupported employment response for complete profiles; no cross-user access                                                                                                                                 |
| **1F Final closeout**                  | All prior phase gates green; strict classifier candidate defined                                                                                                     | Remove bounded dual-read fallback; hardening migration if zero-gap; final docs/runbooks; full regression evidence                                                                                                                                                                                                                                        | Premature non-null hardening; deletion of history; hiding unresolved classifier gaps                                                                                                                                                                                                                                                                      | Strict classifier zero anomalies under approved policy; complete School A/B matrix; fresh replay; second deploy no-op; full regression; zero PII/secret/storage leaks                                                                                                                 |

## 16. Definition of done

### 0A measurable completion

- Exact baseline and required branch recorded and verified.
- Current code, schema, extensions, seeds, Teacher App, files/storage, relevant security/E2E coverage, and real handoff inspected.
- Contract includes all sections and locks one owner per semantic field.
- Read-only classifier performs only bounded, deterministic Prisma `findMany` cursor reads (`take <= 500`) plus disconnect.
- Default successful classifier execution exits 0 even with anomalies; `--strict` alone may exit 2 for anomalies.
- Output contains only aggregate counts, term/status labels, role-key counts, and bounded opaque ids.
- Pure tests cover membership, role/type, credential, all six date-first term states, equality boundaries, PII-safe formatting, strict exit, multiple/empty pages, stable cursor progression, sample limits, and duplicate-count prevention.
- No runtime, schema, migration, permission-seed, or existing migration change.

### Future zero-gap closeout

- `live Teacher Users - live matching TeacherProfiles = 0`.
- `Users with more than one non-deleted TeacherProfile = 0`.
- `duplicate (schoolId, userId) TeacherProfiles, including archived rows = 0`.
- `live TeacherProfiles linked to non-Teacher/deleted Users = 0`.
- `live TeacherProfiles whose school differs from the exact active Teacher Membership school = 0`.
- `transferred Memberships whose source-school TeacherProfile remains non-deleted = 0`.
- `destination active Teacher Memberships without a matching live destination-school TeacherProfile = 0`.
- `Teacher users with zero or more than one operational active Teacher membership = 0` for enabled Teachers.
- `Teacher role/User/Membership userType mismatches = 0`.
- `duplicate normalized (schoolId, teacherCode) = 0`.
- `active enabled Teacher profiles incomplete = 0`.
- `INACTIVE or TERMINATED TeacherProfiles with User ACTIVE, Membership ACTIVE, or unrevoked pre-transition sessions = 0` before and after phase 1E.
- `active/future allocations with invalid Teacher membership/profile/employment/school relationship = 0`.
- `Teacher endpoints capable of bypassing Profile provisioning/lifecycle = 0`.
- `parallel assignment truth tables/arrays = 0`.
- `hard-deleted historical Teacher identities caused by this feature = 0`.
- `avatar relations to non-private, deleted, or cross-school Files = 0`.
- `orphaned avatar objects/File rows after tested compensation and cleanup = 0`.
- Every section 9 endpoint has School A vs School B, same-school permission, and ownership coverage.
- Every hidden assignment resource condition uses the indistinguishable safe 404; 422 assignment scope errors contain only visible same-school relationship failures and no foreign/tenant identifiers.
- Assignment mutation audits use only the exact singular `teachers.assignment.*` action set locked in section 12.
- Every required mutation/rejection has an audit event with zero sensitive values.
- Fresh migration replay passes; backfill and second deploy are no-ops; strict classifier exits 0.

## Classifier operation and category definitions

The implementation is `scripts/classify-teacher-directory-reality-0a.cjs`.

```text
node scripts/classify-teacher-directory-reality-0a.cjs
node scripts/classify-teacher-directory-reality-0a.cjs --strict
node scripts/classify-teacher-directory-reality-0a.cjs --as-of=2026-07-18T12:00:00.000Z --sample-limit=20
```

Definitions used by the classifier:

- Teacher User universe: non-deleted Users whose `userType` is `TEACHER`.
- Operational active membership: status active, `endedAt` null, and `deletedAt` null.
- Active Teacher membership: operational active membership whose membership `userType` is Teacher.
- Role/type mismatch footprint: any active membership involving Teacher User type, Teacher membership type, or role key `teacher` where all three are not consistent.
- Allocation `future`: usable start/end dates, `startDate > as-of`, and the term is not incorrectly marked active.
- Allocation `historical`: usable start/end dates, `endDate < as-of`, and the term is not incorrectly marked active.
- Allocation `current_active`: inclusive current window (`startDate <= as-of <= endDate`) with active term and active, non-deleted academic year flags.
- Allocation `current_inactive`: inclusive current window where one or both active flags are false, excluding the explicit inconsistent cases below.
- Allocation `inconsistent`: future/historical window marked active, reversed date window, deleted term marked active, or active term with inactive/deleted academic year.
- Allocation `invalid`: missing required Term/AcademicYear relation, missing required boundary, unusable date value, or unusable `as-of`.
- Invalid allocation membership: no operational active same-school membership for the allocated User with both Teacher types and exact role key `teacher`, or the User is absent/deleted/non-Teacher.
- Invalid allocation school relationship: term/year, subject, classroom, section, grade, or stage school does not equal allocation school or a required relation is absent.
- Future TeacherProfile backfill: every Teacher User in the universe because the baseline has no TeacherProfile model. A separate remediation count covers membership/type blockers.

Every User, Membership, and TeacherSubjectAllocation table read uses deterministic `id ASC` cursor pagination with `take=500`, `cursor.id`, and `skip=1` after the first page. Processing continues through an explicit empty final page, validates strictly increasing ids, aggregates counts incrementally, and retains only page-bounded join state plus anomaly samples capped by `sample-limit`; no full table snapshot is accumulated.

The script selects nullable username/contact-email/password-hash values only within one bounded User page and immediately converts them to booleans. It never selects or serializes User names or phone, and its allowlisted report never serializes email, username, password hash, tokens, storage coordinates, or raw User values. Query failures print a generic message without database error text. It never repairs data.

## Remaining evidence uncertainty

- The corrected paginated read-only classifier run against the current local database at `2026-07-18T12:00:00.000Z` found zero Teacher users, memberships, allocations, and anomalies. Populated-environment counts remain unknown until an authorized operator runs the same classifier there; the empty local result is not evidence of production completeness.
- Bilingual Teacher Directory names, teacher code, gender, and employment facts have no trustworthy current source and require managed backfill input. Existing User names are an unclassified display fallback and must not be inferred as Arabic or English or duplicated into both languages.
- Existing credentials and session/audit updates are sequential rather than one transaction; reuse is locked, while any hardening belongs to IAM scope and must not be improvised in Teacher Directory.
- Existing Student avatar code is useful precedent but does not satisfy this locked signature and old-file cleanup contract by itself.
