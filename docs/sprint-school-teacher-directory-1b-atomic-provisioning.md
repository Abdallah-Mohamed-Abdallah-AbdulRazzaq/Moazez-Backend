# SCHOOL-TEACHER-DIRECTORY-1B-3 — Atomic Teacher Provisioning

## 1. Baseline and scope

- Branch: `feat/school-teacher-directory-1b-atomic-provisioning`
- Baseline and current HEAD: `f24ad0263698199fa5135d8657eabe60f9698049`
- Predecessor evidence: Teacher Directory GET/PATCH, `teachers.records.view/manage`, the Teacher lifecycle Unit of Work, transactional User/Membership/Profile/Audit operations, and the zero unsupported-identity population were merged before this work.
- Implemented runtime surface: `POST /api/v1/teachers` only.
- Deferred: employment transitions, archive, rehire, transfer, assignments, avatars, Teacher credential routes, demotion interception, account-status interception, and 1B-4 behavior.

## 2. POST contract

| Contract    | Locked behavior                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Route       | `POST /api/v1/teachers`                                                                               |
| Permission  | `teachers.records.manage`                                                                             |
| Scope       | Current School from trusted request context; the caller cannot supply a School or Organization id     |
| Identifier  | The returned `id` is `TeacherProfile.id`                                                              |
| Success     | HTTP 201 with the same safe composed record shape as Teacher Directory detail                         |
| Conflicts   | Stable Teacher profile, identity, role-required, or role-transition codes with fixed safe detail keys |
| Credentials | No password input, password creation, credential token, credential delivery, or credential endpoint   |
| Sessions    | No Session creation or revocation                                                                     |

The controller reuses the existing Teachers controller and module. It adds no second controller and no route outside the global `/api/v1` prefix.

## 3. Request ownership

IAM-owned input is limited to `loginEmail`, `username`, `contactEmail`, and `phone`. Profile-owned input is limited to `teacherCode`, the four bilingual name fields, `preferredDisplayLanguage`, `gender`, explicit `employmentStatus`, department, specialization, employment type, experience, hire date, working days, work times, and bilingual notes.

The strict global validation contract rejects unknown properties, including password and credential material, lifecycle status fields other than provisioning employment status, role/type/scope fields, assignments, avatar state, and deletion state.

Provisioning requires `teacherCode`, all four managed name fields, `gender`, `preferredDisplayLanguage`, and an explicit employment status of `ACTIVE` or `INACTIVE`. `TERMINATED`, a missing employment status, and an incomplete Profile are rejected before the first state write. No language value is inferred from the other language.

## 4. Atomic aggregate result

One successful transaction creates:

- a non-deleted `User` with `status=INVITED` and `userType=TEACHER`;
- a non-deleted current-School `Membership` with `userType=TEACHER`, `status=ACTIVE`, `endedAt=null`, and the resolved exact Teacher Role;
- one complete live `TeacherProfile` in the current School with the explicitly requested `ACTIVE` or `INACTIVE` employment state;
- `teachers.account.provision` and `teachers.profile.create` audit records.

The response presents account, Membership, employment, Profile completeness, and credential state separately. It does not expose Role, Membership, School, or Organization ids, credential material, Session state, or audit metadata. A newly provisioned User is presented from its persisted credential projection; the initial tested projection is `hasPassword=false`, `status=missing`, `mustChangePassword=false`, null provisioning/change timestamps, and credential version `0`.

## 5. Exact Teacher Role resolution

Role resolution occurs inside the lifecycle transaction and does not accept a request Role id. It considers only a live `teacher` Role whose School is the current School or null. A deterministic current-School Role has precedence; otherwise exactly one live global system Teacher Role is accepted. Missing, deleted, foreign-School, wrong-key, or ambiguous Role state fails with `teachers.account.teacher_role_required` and a stable reason.

## 6. IAM identity reuse

The existing `UserLoginIdentityResolver` remains authoritative. Its normalization step is now reusable without performing the old pre-transaction uniqueness read. It preserves username policy, current-School login-domain resolution, generated login email, explicit login override policy, and contact-email normalization. Uniqueness is checked through the lifecycle transaction and still relies on the database constraints for races. Safe conflict translation returns only fixed field keys and never attempted values or owning identifiers.

## 7. Transaction sequence

The Teacher lifecycle Unit of Work opens one serializable Prisma interactive transaction. Its narrow context performs this sequence:

1. resolve trusted request scope before the transaction;
2. normalize and validate request-owned data before any write;
3. resolve and validate the exact Teacher Role in the transaction;
4. check provisioning identity conflicts in the transaction;
5. create the invited Teacher User;
6. create the exact active Teacher Membership;
7. create the complete TeacherProfile;
8. write `teachers.account.provision`;
9. write `teachers.profile.create`;
10. compose and present the safe response before the transaction callback returns.

Every state and successful audit write receives the same `Prisma.TransactionClient`. No lifecycle write has a base-client fallback.

## 8. Audit contract

The successful actions are exactly `teachers.account.provision` on resource type `user` and `teachers.profile.create` on resource type `teacher_profile`. Metadata is passed through the merged allowlisted audit builder and contains only trusted UUIDs, fixed changed-field keys, fixed state keys, and the reduced credential booleans/version. It contains no names, login/contact values, phone, teacher-code value, notes, password material, request body, or raw error.

Rejected Settings transitions use the merged standalone `teachers.role_transition.rejected` helper with a stable reason code only. If rejected-audit delivery fails, the original public DomainException is thrown unchanged and operational logging contains only the fixed event key and trace id.

## 9. Rollback matrix

| Failure point                     | Result                                                                  |
| --------------------------------- | ----------------------------------------------------------------------- |
| Role/input validation             | No User, Membership, Profile, or success audit write starts             |
| User create                       | No later operation runs; transaction rejects                            |
| Membership create                 | User write rolls back                                                   |
| Profile create or uniqueness race | User and Membership writes roll back; safe conflict translation applies |
| First success audit               | Entire aggregate rolls back                                             |
| Second success audit              | Entire aggregate and first success audit roll back                      |
| Safe response composition         | Transaction callback rejects, so no partial aggregate commits           |

Focused tests cover every row of this matrix and verify operation ordering.

## 10. Settings bypass closure

| Generic Settings path                | Teacher condition                                           | Result before state mutation                          |
| ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------- |
| `POST /api/v1/settings/users/invite` | resolved target Role key is `teacher`                       | reject with `teacher_directory_provisioning_required` |
| `POST /api/v1/settings/users`        | resolved target Role key is `teacher`                       | reject with `teacher_directory_provisioning_required` |
| `PATCH /api/v1/settings/users/:id`   | non-Teacher target is assigned the Teacher Role             | reject with `teacher_promotion_requires_profile`      |
| `PATCH /api/v1/settings/users/:id`   | current User is Teacher and `fullName` is supplied          | reject with `teacher_display_projection_managed`      |
| `PATCH /api/v1/settings/users/:id`   | requested target Role is Teacher and `fullName` is supplied | reject with `teacher_display_projection_managed`      |

Create and invite retain their existing IAM identity normalization order, then resolve the assignable Role and reject a Teacher target before any aggregate write. Non-Teacher invite, active creation, and update paths preserve their existing application behavior. Teacher demotion, account activation/disable, resend invite, legacy reset-password, and credential writers are unchanged and remain later-phase work.

## 11. Validation and normalization

- Teacher code is trimmed, all whitespace is removed, uppercased, validated, and translated to a school-safe conflict on uniqueness races.
- Bilingual names are independently bounded and must all be present after normalization.
- `preferredDisplayLanguage` is command policy only and selects the approved AR or EN names for `User.firstName/lastName`.
- Gender and employment type use the existing Prisma enum values.
- Experience is an integer from 0 through 60.
- Hire date rejects calendar normalization.
- Working days reject duplicates and persist in canonical Sunday-through-Saturday order.
- Work times must be null together or supplied together, and end must be later than start.
- Notes are nullable and bounded to 500 characters; their values never enter audit metadata.

## 12. Tests and results

Final focused and regression execution:

- New provisioning and Settings-bypass suites: 51/51 passed.
- Full relevant set: 22/22 suites and 239/239 tests passed.
- New assertions across new and extended suites: 58/58 passed.
- Relevant pre-existing regression assertions: 181/181 passed.
- Changed production TypeScript ESLint: pass across 18 files.
- Migration governance: 39/39 passed.
- Migration structure: pass, active migrations 4, new migrations 0, rebaseline off.
- Prisma validation: pass.
- Prisma Client generation: pass.
- Nest build: pass with a 4096 MB Node heap limit for this workspace.

The relevant suite includes Directory GET/PATCH and repository contracts, lifecycle Unit of Work/audit/operations, TeacherProfile integrity, Settings create/invite/status and login identity, credential policy/writers, IAM auth behavior, and the school-scope extension.

Database-writing E2E or fixture tests were not run: the configured environment is persistent development, and this phase authorizes database-writing tests only against an explicitly disposable test database. No database rows were written by this work.

## 13. Module wiring

`CreateTeacherUseCase` is registered in the existing Teacher Directory module and controller. The Settings Users module imports the existing Teacher lifecycle module only to use the narrow rejected-transition helper. The Directory module reuses the exported IAM identity resolver. Lifecycle infrastructure is not exposed globally, and no AppModule change was required.

## 14. Changed files

- `src/modules/settings/users/application/create-user.use-case.ts`
- `src/modules/settings/users/application/invite-user.use-case.ts`
- `src/modules/settings/users/application/teacher-settings-bypass.service.ts`
- `src/modules/settings/users/application/update-user.use-case.ts`
- `src/modules/settings/users/application/user-login-identity.resolver.ts`
- `src/modules/settings/users/infrastructure/teacher-lifecycle-membership.operations.ts`
- `src/modules/settings/users/infrastructure/teacher-lifecycle-user.operations.ts`
- `src/modules/settings/users/tests/create-user.use-case.spec.ts`
- `src/modules/settings/users/tests/invite-user.use-case.spec.ts`
- `src/modules/settings/users/tests/teacher-settings-bypass.spec.ts`
- `src/modules/settings/users/users.module.ts`
- `src/modules/teachers/directory/application/create-teacher.use-case.ts`
- `src/modules/teachers/directory/application/update-teacher.use-case.ts`
- `src/modules/teachers/directory/controller/teachers.controller.ts`
- `src/modules/teachers/directory/domain/teacher-directory-input.ts`
- `src/modules/teachers/directory/domain/teacher-directory.errors.ts`
- `src/modules/teachers/directory/dto/teacher-directory.dto.ts`
- `src/modules/teachers/directory/teacher-directory.module.ts`
- `src/modules/teachers/directory/tests/create-teacher.use-case.spec.ts`
- `src/modules/teachers/directory/tests/teacher-directory-contract.spec.ts`
- `src/modules/teachers/directory/tests/teacher-directory-input.spec.ts`
- `src/modules/teachers/lifecycle/application/teacher-lifecycle-unit-of-work.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle-transaction.operations.ts`
- `src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle.unit-of-work.ts`
- `src/modules/teachers/lifecycle/tests/teacher-lifecycle-operations.spec.ts`
- `src/modules/teachers/lifecycle/tests/teacher-lifecycle-unit-of-work.spec.ts`
- `docs/sprint-school-teacher-directory-1b-atomic-provisioning.md`

No Prisma schema, migration, seed, permission, package, credential writer, Session behavior, allocation mutation, or unrelated module file changed.

## 15. Deferred 1B-4 work

1B-4 retains ownership of employment-status routes and coordinated account/Membership access changes, session revocation requirements for those lifecycle transitions, account activation/disable integration, and any additional reviewed Settings interception. This phase does not authorize 1B-4.

## 16. Final authorization gate

```text
SCHOOL-TEACHER-DIRECTORY-1B-3: COMPLETE
POST TEACHER PROVISIONING: PASS
ONE TRANSACTION: PASS
TRANSACTIONAL AUDITS: PASS
SETTINGS TEACHER CREATE/INVITE/PROMOTION/DISPLAY BYPASS: CLOSED
DATABASE MUTATION: 0
SCHEMA CHANGED: 0
MIGRATIONS CHANGED: 0
SEEDS CHANGED: 0
STAGED FILES: 0
COMMIT AUTHORIZED: NO
PUSH AUTHORIZED: NO
PULL REQUEST: USER-OWNED
1B-4 AUTHORIZED: NO
```
