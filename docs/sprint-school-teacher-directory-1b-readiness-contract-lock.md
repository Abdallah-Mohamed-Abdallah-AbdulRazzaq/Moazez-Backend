# School Teacher Directory 1B-0 Readiness and Integration Contract Lock

## 1. Status, baseline, and authorization

**Status:** read-only reality inspection and contract-lock phase only
**Runtime implementation:** not authorized
**Runtime changes:** none
**Schema changes:** none
**Migration changes:** none
**Permission or role-seed changes:** none

| Item                        | Locked value                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Branch                      | `feat/school-teacher-directory-1b-readiness-lock`                                                                    |
| Baseline and inspected HEAD | `9b0726edfc90b7f12d6f56b9078d448e9cabe532`                                                                           |
| Baseline subject            | `Merge pull request #23 from Abdallah-Mohamed-Abdallah-AbdulRazzaq/feat/school-teacher-directory-1a-data-foundation` |
| Inspection date             | 2026-07-18                                                                                                           |
| Accepted predecessor        | `docs/sprint-school-teacher-directory-0a-reality-contract-lock.md`                                                   |
| Merged 1A migration         | `prisma/migrations/20260718115332_teacher_directory_data_foundation/migration.sql`                                   |

The starting verification was:

```text
> git branch --show-current
feat/school-teacher-directory-1b-readiness-lock

> git rev-parse HEAD
9b0726edfc90b7f12d6f56b9078d448e9cabe532

> git status --short
[no output]

> git log -1 --oneline
9b0726ed Merge pull request #23 from Abdallah-Mohamed-Abdallah-AbdulRazzaq/feat/school-teacher-directory-1a-data-foundation
```

The merged migration is present. The superseded
`20260718001315_teacher_directory_data_foundation` migration is absent. The
working tree was clean before this document was created.

This document records verified current behavior and locks future 1B contracts.
A `PASS` for a contract or plan means that the decision is unambiguous; it does
not mean that the runtime implementation exists.

## 2. Deployment evidence and post-1A data readiness

### 2.1 Inspected environments

No target, shared, staging, Live, production, or representative environment was
explicitly made available and approved by the operator for this inspection.
No database connection was used to infer deployment state. In particular, the
fresh disposable replay described by the merged 1A implementation evidence is
not deployment evidence.

| Environment label                     | Host classification                        | Migration status | 1A migration present | Classifier mode | Aggregate result | Timestamp                 |
| ------------------------------------- | ------------------------------------------ | ---------------- | -------------------- | --------------- | ---------------- | ------------------------- |
| No operator-approved target available | Not inspected; no host or credentials read | Not run          | Not proven           | Not run         | Not run          | 2026-07-18T17:19:32+03:00 |

```text
1A DEPLOYMENT: NOT PROVEN
```

The merged 1A evidence explicitly says that no shared or Live database received
the migration or backfill. A Git merge, CI replay, local migration status, or an
all-zero disposable seed is insufficient to change this result.

### 2.2 Post-1A classifier evidence

The merged classifier is suitable for an approved read-only run: it uses
bounded deterministic Prisma `findMany` reads, emits aggregate and bounded
opaque-id evidence, does not write, and keeps default successful exit status
zero when anomalies exist. It was not run against a target environment because
none was approved.

| Required category                                            | Target aggregate |
| ------------------------------------------------------------ | ---------------- |
| Operational Teacher Membership without matching live Profile | NOT RUN          |
| Live Profile without exact operational Teacher Membership    | NOT RUN          |
| Live Profile linked to non-Teacher or deleted User           | NOT RUN          |
| Users with multiple live Profiles                            | NOT RUN          |
| Duplicate `(schoolId, userId)` Profile footprint             | NOT RUN          |
| Transferred source Membership with live source Profile       | NOT RUN          |
| Destination active Membership without destination Profile    | NOT RUN          |
| Incomplete live Profile                                      | NOT RUN          |
| Role/User/Membership type mismatch                           | NOT RUN          |

An exact operational Teacher Membership means `status=ACTIVE`, `endedAt=null`,
`deletedAt=null`, non-null school, Membership `userType=TEACHER`, live Role key
`teacher`, and a Role whose school is null or equals the Membership school. A
matching live Profile must have the same User and school.

Incomplete 1A Profiles are an expected managed-remediation category only when
they remain explicitly `INACTIVE` and access is fail-closed. They are not
complete active Teachers. Any operational Teacher with no matching live Profile,
or with an incomplete live Profile while the User and Membership allow access,
is an implementation hard stop.

Before any 1B runtime subphase, an operator must identify an approved target or
representative environment, prove migration status without drift, and run:

```text
node scripts/classify-teacher-directory-reality-0a.cjs \
  --as-of=<operator-approved-timestamp> \
  --sample-limit=20
```

The captured evidence must omit anomaly UUIDs from committed documentation.

## 3. Verified current aggregate boundaries

| Aggregate                | Verified current owner                                                                                        | Evidence                                                             | 1B implication                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| User                     | Login identity, contact identity, credentials, global account state, and required display compatibility names | `prisma/schema.prisma`; Settings Users and IAM Auth                  | Teacher endpoints coordinate User but do not create a second identity or credential store.       |
| Membership               | Organization/school, Role, permission reachability, Membership type/state, start/end history                  | `prisma/schema.prisma`; `AuthRepository`; `ScopeResolverGuard`       | Lifecycle must preserve account, Membership, and employment as separate states.                  |
| TeacherProfile           | School-owned bilingual Directory identity and employment state                                                | 1A schema, migration, domain integrity, repository                   | `teacherId` is always `TeacherProfile.id`.                                                       |
| TeacherSubjectAllocation | Only writable academic assignment truth                                                                       | Academics Teacher Allocation module                                  | 1B reads lifecycle readiness only and never creates parallel assignment persistence.             |
| Session                  | PostgreSQL refresh-session record checked on every authenticated request                                      | `AuthRepository`; `JwtAuthGuard`                                     | Session revocation can be made DB-atomic only if the same transaction client is explicitly used. |
| AuditLog                 | Append-only audit record with unconstrained string action and JSON before/after fields                        | Prisma schema; `AuthRepository`; transactional repository precedents | Teacher lifecycle needs a typed metadata whitelist and same-transaction writer.                  |

`TeachersModule` and `TeacherProfileModule` contain only the 1A repository
foundation and are intentionally absent from `AppModule`. No Teacher Directory
controller or route exists at this baseline.

## 4. IAM aggregate transaction inspection

### 4.1 Current transaction matrix

| Flow                  | Repository method                                | Accepted transaction-client type                                                                                                      | Records written                                                           | Audit placement                                                                                     | Possible partial-success state                                                                                                                           |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active User creation  | `UsersRepository.createUserWithMembership`       | No caller-supplied client. It opens an internal Prisma interactive transaction whose callback client is a `Prisma.TransactionClient`. | User, then active Membership                                              | `CreateUserUseCase` calls `AuthRepository.createAuditLog` after the repository transaction commits. | User and Membership can commit while audit fails; no Profile can participate.                                                                            |
| Invited User creation | Same method                                      | Same                                                                                                                                  | Invited User, active Membership                                           | `InviteUserUseCase` audits after commit.                                                            | Same gap; Teacher role can currently be selected without a Profile.                                                                                      |
| Display update        | `UsersRepository.updateUserAndMembership`        | No caller-supplied client; internal transaction                                                                                       | User first/last compatibility fields                                      | `UpdateUserUseCase` audits after commit.                                                            | User update can commit while audit fails; current audit metadata includes `fullName`.                                                                    |
| Role transition       | `UsersRepository.updateUserAndMembership`        | No caller-supplied client; internal transaction                                                                                       | User `userType`; Membership `roleId` and `userType`                       | `UpdateUserUseCase` audits after commit.                                                            | Role/type changes can commit without Profile lifecycle, audit, allocation gate, or session revocation.                                                   |
| Account status change | `UsersRepository.updateUserAndMembership`        | No caller-supplied client; internal transaction                                                                                       | User status only                                                          | Revocation is awaited after commit; audit is awaited after revocation.                              | Revocation failure leaves the status committed and no success response/audit. Audit failure leaves status and revocation committed but returns an error. |
| Membership creation   | Inside `createUserWithMembership`                | Internal callback client only                                                                                                         | Membership                                                                | Outside transaction                                                                                 | Cannot be composed with Profile or audit by the caller.                                                                                                  |
| Membership update     | Inside `updateUserAndMembership`                 | Internal callback client only                                                                                                         | Role/type only; current status endpoint does not change Membership status | Outside transaction                                                                                 | Cannot be composed with Profile lifecycle or audit.                                                                                                      |
| Credential update     | `UserCredentialsRepository.updateUserCredential` | No transaction-client parameter                                                                                                       | User password hash and credential fields                                  | Revocation and audit are later calls                                                                | Credential can commit before revocation/audit.                                                                                                           |
| Auth password change  | `AuthRepository.updatePasswordCredential`        | No transaction-client parameter                                                                                                       | User credential fields                                                    | Revocation and audit are later calls                                                                | Same sequential gap.                                                                                                                                     |
| Generic audit         | `AuthRepository.createAuditLog`                  | No transaction-client parameter                                                                                                       | AuditLog                                                                  | Standalone base Prisma call                                                                         | It cannot join a lifecycle transaction.                                                                                                                  |

`PrismaService` exposes a base Prisma client and a school-scoped extended client,
but it does not expose a shared Unit of Work abstraction. The current
`TeacherProfileRepository` also has no transaction-client-aware lifecycle
methods. Consequently, the current repository methods cannot produce one
transaction covering User, Membership, TeacherProfile, and AuditLog.

There is nevertheless a verified implementation precedent: Platform Admin
school provisioning opens one repository-owned interactive transaction and
writes Organization, School, login settings, User, Membership, and multiple
AuditLog rows through the same `Prisma.TransactionClient`. School Support also
has a private `createAuditLogInTx(tx, entry)` helper. These are precedents, not a
shared hook usable by Teachers.

### 4.2 Locked 1B transaction hook

`1B-1` must add one typed Teacher lifecycle Unit of Work in the Teachers
infrastructure boundary. It must own the interactive transaction and make the
same `Prisma.TransactionClient` available only to explicit IAM/Profile/Audit
operations. It must not expose a generic unscoped Prisma client to controllers.

The required operation set is:

- lock/read the target User, exact Membership, live or archived Profile, and
  uniqueness footprints needed by the transition;
- write User through IAM-owned field rules;
- create/end/update Membership through IAM-owned role/type/state rules;
- create/update/restore/archive TeacherProfile through Teachers;
- write all successful lifecycle AuditLog entries through that same client;
- revoke PostgreSQL Session rows through that same client for lifecycle paths
  that require revocation.

The implementation may use explicit `...InTransaction(tx, input)` methods or a
typed repository-owned transaction callback. Optional transaction parameters
that silently fall back to the base client are forbidden for lifecycle writes.
All controller/application entry points must call the coordinator, not assemble
independent repository calls.

```text
User + Membership + TeacherProfile + transactional AuditLog
= one database transaction client
```

Current readiness result: **GAP**. The precedent exists, but the reusable hook
and transaction-aware IAM/Audit/Profile methods do not.

## 5. Session revocation contract

### 5.1 Current revocation matrix

| Path                          | Service/repository                                                                            | Ordering                                                                           | Transaction support                                           | Failure and audit behavior                                                                                                                                             | Can success precede revocation?                                      | Retry/log posture                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| Credential generate           | `GenerateUserCredentialUseCase` / credential repository / `AuthRepository.revokeUserSessions` | Hash, credential User update, revoke all sessions, audit, return one-time password | None across steps                                             | Revocation failure leaves new hash committed, returns error, and skips audit; generated plaintext is not returned                                                      | No; revocation is awaited                                            | No retry or sanitized pending marker              |
| Credential regenerate         | Same use case                                                                                 | Same                                                                               | None                                                          | Same; credential version may advance without caller receiving the temporary password                                                                                   | No                                                                   | No retry                                          |
| Credential set                | `SetUserCredentialUseCase`                                                                    | Hash, User update, revoke all sessions, audit, return summary                      | None                                                          | User update can commit before revocation; audit can fail after both                                                                                                    | No                                                                   | No retry                                          |
| Bulk credential generate      | `BulkCredentialGenerateUseCase`                                                               | Per target: update then revoke; one audit after the loop                           | None; no batch transaction                                    | Failure can leave an arbitrary prefix updated/revoked and no batch audit/response                                                                                      | Per target, no; whole-batch partial success is possible              | No retry/compensation                             |
| Email credential delivery     | `ProcessEmailDeliveryRecipientUseCase`                                                        | Send email, update credential, revoke sessions, mark recipient sent                | None across provider, credential, session, and delivery state | Queue retries failed recipients. An emailed temporary credential can precede a failed credential/revocation step; encrypted pending credential metadata supports retry | Job success waits, but email external success can precede revocation | BullMQ recipient retry exists; no lifecycle audit |
| Account disable               | `UpdateUserStatusUseCase`                                                                     | Commit User `DISABLED`, revoke sessions, audit                                     | None across steps                                             | Revocation failure returns error after disable and before audit                                                                                                        | No                                                                   | No retry/operational marker                       |
| Generic role transition       | `UpdateUserUseCase`                                                                           | Commit role/type, audit                                                            | No revocation call                                            | Existing access/refresh sessions remain until normal expiry/logout                                                                                                     | Yes, because revocation is absent                                    | No retry                                          |
| Generic Membership transition | No dedicated status transition exists                                                         | Role/type mutation is the only current Membership transition                       | No revocation call                                            | Same stale-session/userType risk                                                                                                                                       | Yes                                                                  | No retry                                          |
| Auth change password          | `ChangePasswordUseCase`                                                                       | Credential update, revoke all sessions except current, audit                       | None across steps                                             | Credential can commit before revocation/audit                                                                                                                          | No                                                                   | No retry                                          |
| Logout                        | `LogoutUseCase`                                                                               | Find session, revoke exact session                                                 | Standalone calls                                              | Missing/already-revoked session is a successful no-op; update failure propagates                                                                                       | No                                                                   | No audit or retry                                 |
| Refresh rotation              | `RefreshUseCase`                                                                              | Validate, revoke old session, issue/create new session                             | No shared transaction                                         | Old session can be revoked before new session creation fails                                                                                                           | No response before new session                                       | No retry                                          |
| Disabled-account guard path   | `JwtAuthGuard` and `ScopeResolverGuard`                                                       | Re-read User, revoke all sessions, deny                                            | Standalone call                                               | Revocation failure produces an error and access is not granted                                                                                                         | No                                                                   | No audit or retry                                 |

The authoritative refresh session is a PostgreSQL `Session` row. `JwtAuthGuard`
loads the token's `sid` and rejects a missing or revoked session on every
authenticated request. Access tokens contain User type and session id; role
transitions therefore require revocation even though permissions are reloaded
from Membership on requests.

Revocation methods do not log token hashes or refresh tokens. Successful login
currently stores a session id as the AuditLog `resourceId`, and unexpected 5xx
errors are logged with a stack by the global exception filter. Teacher lifecycle
code must catch and normalize operational failures so session ids, token hashes,
refresh tokens, credentials, and raw Prisma errors cannot enter its logs or
AuditLog metadata.

### 5.2 Locked 1B fail-closed behavior

For the current PostgreSQL session store, 1B must add an explicit
`revokeUserSessionsInTransaction(tx, userId)` IAM operation and execute it with
the lifecycle Unit of Work. That makes revocation atomic only for the Session
rows written by that exact transaction client. The response is returned only
after the transaction commits.

If implementation instead keeps revocation after the lifecycle transaction, it
must satisfy all of the following before it can merge:

1. Commit the lifecycle transaction.
2. Complete idempotent session revocation before returning success.
3. On failure, return `teachers.lifecycle.revocation_failed` and never report
   lifecycle success.
4. Persist or enqueue sanitized retryable evidence containing only User/Profile
   UUIDs, operation key, retryability, and stable reason code.
5. Never log session ids, token hashes, refresh tokens, credentials, or raw
   provider/Prisma errors.
6. Never claim distributed or database atomicity.

For a post-commit disable, suspend, inactivate, terminate, archive, demote, or
transfer failure, the committed disabled/non-operational state is retained; it
must never be compensated by re-enabling access. Revocation is retried
idempotently. For activation or promotion, post-commit revocation failure could
expose stale sessions after access was enabled. Therefore those transitions may
not use a post-commit-only revocation design unless a reviewed, tested
fail-closed compensation transaction immediately restores disabled/suspended
state and a durable retry record exists. The transaction-client revocation path
is the locked preferred design because Session is currently in the same
database.

No current durable retryable lifecycle-revocation evidence mechanism exists.
Current readiness result: **GAP**.

## 6. Audit transaction contract

### 6.1 Current audit reality

| Concern                   | Current implementation                                                                                                                        | Readiness result                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Schema                    | `AuditLog` stores actor, scope, module/action/resource strings, optional JSON `before`/`after`, outcome, IP/user agent, and timestamp.        | Adequate additive storage; no enum migration needed. |
| Append-only behavior      | Normal application code creates AuditLog rows. No update/delete API was found for ordinary audit history.                                     | Usable.                                              |
| Shared writer             | `AuthRepository.createAuditLog` uses base Prisma and accepts no transaction client.                                                           | GAP.                                                 |
| Transactional precedent   | Platform provisioning and selected repositories call `tx.auditLog.create` inside their business transaction.                                  | Proven pattern, not shared.                          |
| Metadata validation       | Generic audit input accepts arbitrary `Record<string, unknown>` before/after values. Current User update audit includes a composed full name. | GAP for Teacher metadata whitelist.                  |
| Failure behavior          | Most use cases await audit after business writes. Audit failure returns an error after the business write has committed.                      | GAP.                                                 |
| Rejected transition audit | Current Settings role transitions have no rejected-Teacher audit path.                                                                        | GAP.                                                 |

### 6.2 Locked successful actions

The exact singular action namespace is:

```text
teachers.account.provision
teachers.account.activate
teachers.account.disable
teachers.account.rehire
teachers.account.transfer
teachers.membership.suspend
teachers.membership.transfer
teachers.profile.create
teachers.profile.update
teachers.profile.restore
teachers.profile.archive
teachers.employment_status.change
teachers.role.promote
teachers.role.demote
teachers.role_transition.rejected
```

Every successful action caused by one request is inserted in the same database
transaction as the state it describes. Audit failure rolls back that state.
`resourceType` is singular and stable (`user`, `membership`, or
`teacher_profile`); `resourceId` is its trusted UUID.

Audit metadata is generated by a Teacher-specific typed builder. It may contain
only:

- trusted resource UUIDs;
- changed field keys, never field values for names/contact/notes;
- previous and next enum values;
- allocation dependency counts;
- term-state labels;
- stable reason codes;
- credential booleans/version, never credential material.

It must not contain names, emails, phone numbers, notes, passwords or hashes,
temporary passwords, tokens, session ids, original filenames, storage bucket or
object coordinates, free-text reasons, or raw errors.

### 6.3 Rejected transitions

A rejected transition has no successful business-state transaction to join.
The coordinator must build the intended stable domain error first, then attempt
the sanitized `teachers.role_transition.rejected` AuditLog insert. If that audit
insert fails, it must not replace or mutate the original public error. The
implementation records only a sanitized operational event key and trace id for
audit-delivery investigation; it never logs the attempted sensitive input or raw
database error. There is currently no helper that guarantees this behavior, so
`1B-1` must add and test it.

Current readiness result for transactional audit: **GAP**.

## 7. Generic Settings Teacher-bypass matrix

All paths below are under the global `/api/v1` prefix.

| Route/use case                                 | Permission              | Current behavior                                                                                                       | Teacher bypass risk                                                                                | Locked 1B behavior                                                                                                                                                                                                                                                                                  | Non-Teacher behavior                                                        | Stable Teacher error/audit                                                                                                    |
| ---------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET /settings/users`                          | `settings.users.view`   | Lists active school Memberships and User display/login/contact fields.                                                 | Can present legacy User projections as if they were canonical Teacher Directory data.              | It may remain as an IAM/settings view, but must not claim bilingual/employment truth. Directory reads use `/teachers`.                                                                                                                                                                              | Unchanged.                                                                  | No new error.                                                                                                                 |
| `POST /settings/users/invite`                  | `settings.users.manage` | Accepts any assignable role, including `teacher`; creates invited User and active Membership with no Profile.          | Direct post-cutover Teacher creation bypass.                                                       | Resolve target Role before write. If Role key is `teacher`, reject before any write and direct callers to `POST /teachers`.                                                                                                                                                                         | Existing invite behavior unchanged.                                         | `teachers.account.role_transition_conflict` 409, reason `teacher_directory_provisioning_required`; rejected transition audit. |
| `POST /settings/users`                         | `settings.users.manage` | Accepts Teacher role; creates active credential-less User and active Membership.                                       | Highest-risk creation bypass.                                                                      | Same pre-write rejection for Teacher target.                                                                                                                                                                                                                                                        | Existing active creation unchanged.                                         | Same code/reason and rejected audit.                                                                                          |
| `PATCH /settings/users/:id` display name       | `settings.users.manage` | Splits `fullName` into `User.firstName/lastName`.                                                                      | Creates a second writable Teacher name source and language inference.                              | If current User or target Role is Teacher, reject `fullName`; Teacher record update owns bilingual names and transactionally updates display projections from approved preferred language.                                                                                                          | Existing name edit unchanged.                                               | `teachers.account.role_transition_conflict` 409, reason `teacher_display_projection_managed`.                                 |
| `PATCH /settings/users/:id` promotion          | `settings.users.manage` | Changing to Teacher role atomically changes User/Membership types but creates no Profile and does not revoke sessions. | Creates live Teacher identity without Profile.                                                     | Reject before write because the generic DTO lacks complete Profile input. Managed provisioning/promotion must enter a Teacher lifecycle coordinator that can create the Profile atomically.                                                                                                         | Non-Teacher-to-non-Teacher role change unchanged.                           | `teachers.account.role_transition_conflict` 409, reason `teacher_promotion_requires_profile`; rejected audit.                 |
| `PATCH /settings/users/:id` demotion           | `settings.users.manage` | Changes away from Teacher without allocation or Profile gate and without revocation.                                   | Strands allocations/history and stale Teacher token type.                                          | Delegate to the Teacher role-demotion coordinator. It locks state, blocks active/future allocations, archives the Profile, ends the Teacher Membership, creates the target non-Teacher Membership as needed, updates User type/display compatibility, audits transactionally, and revokes sessions. | Non-Teacher role changes unchanged.                                         | `teachers.lifecycle.active_assignments` or `teachers.account.role_transition_conflict`; successful `teachers.role.demote`.    |
| `PATCH /settings/users/:id/status` to inactive | `settings.users.manage` | Sets only User `DISABLED`, then revokes sessions and audits.                                                           | It can be mistaken for employment inactivation, but security disable itself must remain immediate. | Delegate Teacher targets to the shared account-disable coordinator. Disable User and sessions immediately; do not silently change employment or delete/suspend academic history. Present account state separately.                                                                                  | Existing behavior unchanged.                                                | `teachers.account.disable`; `teachers.lifecycle.revocation_failed` on failure.                                                |
| `PATCH /settings/users/:id/status` to active   | `settings.users.manage` | Sets User `ACTIVE` without Profile, employment, Membership, role, or credential gates.                                 | Re-enables an incomplete or inactive Teacher.                                                      | Reject Teacher target; reactivation uses `PATCH /teachers/:teacherId/employment-status` with all gates.                                                                                                                                                                                             | Existing activation unchanged.                                              | `teachers.lifecycle.invalid_transition` 409, reason `teacher_activation_requires_lifecycle`.                                  |
| `POST /settings/users/:id/resend-invite`       | `settings.users.manage` | For invited User, touches User update time/status and audits; it is not the credential writer.                         | Can mutate a legacy Teacher with no Profile and imply managed provisioning.                        | Reject Teacher targets; use approved credential delivery/generate flows after Profile provisioning.                                                                                                                                                                                                 | Existing invited non-Teacher behavior unchanged.                            | `teachers.account.role_transition_conflict` 409, reason `teacher_invite_managed_by_directory`.                                |
| `POST /settings/users/:id/reset-password`      | `settings.users.manage` | Hashes and discards a random placeholder, audits, returns `queued`; no credential or session change.                   | False reset success.                                                                               | Always reject Teacher targets. It is forbidden for Teacher Directory.                                                                                                                                                                                                                               | Existing non-Teacher placeholder remains unchanged until separate IAM work. | `teachers.account.role_transition_conflict` 409, reason `legacy_reset_forbidden`.                                             |
| Credential status/preview routes               | `settings.users.view`   | Read credential summaries/target previews.                                                                             | No separate Teacher credential owner.                                                              | Remain authoritative and school-scoped.                                                                                                                                                                                                                                                             | Unchanged.                                                                  | Existing IAM credential errors.                                                                                               |
| Credential generate/set/regenerate/bulk        | `settings.users.manage` | Existing hashing, policy, version, one-time response, revocation, and audit flows.                                     | Sequential consistency gaps, but no Profile bypass if targeting is validated.                      | Remain the only credential writers. No Teacher endpoint accepts password. Add exact Profile/Membership targeting gates without duplicating hashing.                                                                                                                                                 | Existing non-Teacher behavior unchanged.                                    | Existing IAM credential errors; no new Teacher password errors.                                                               |

No Settings User hard-delete/archive controller was found. Teacher archive must
exist only at `DELETE /teachers/:teacherId` and must never be added to generic
Settings.

The existing credential repository requires an active Membership and only
allows User status `ACTIVE` or `INVITED` for writes. A same-school rehired User
is locked as `DISABLED` with a `SUSPENDED` Membership until reactivation. If
that User has no credential, the current endpoint cannot satisfy the credential
gate. `1B-1` must add a narrowly authorized lifecycle-aware credential target
policy to the existing IAM/Settings flow; it must not activate the account or
create Teacher password logic.

Settings Teacher bypass map result: **PASS** as a contract. The bypass is still
open in current runtime and must close atomically with provisioning in `1B-3`.

## 8. Credential summary contract

Teacher Directory responses expose exactly:

```text
hasPassword
status
mustChangePassword
passwordProvisionedAt
passwordChangedAt
credentialVersion
```

| Field                   | Source                           | Safe derivation                                                                                                                                                                                                                                      |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hasPassword`           | `User.passwordHash`              | `Boolean(passwordHash)`; never select the hash beyond the repository boundary or return it.                                                                                                                                                          |
| `status`                | Derived                          | `missing` when no hash; `temporary_or_must_change` when hash + must-change + provisioned timestamp + no changed timestamp; `must_change` for the remaining hash + must-change state; otherwise `set`. This matches the current credential presenter. |
| `mustChangePassword`    | Stored `User.mustChangePassword` | Direct boolean.                                                                                                                                                                                                                                      |
| `passwordProvisionedAt` | Stored nullable User timestamp   | ISO timestamp or null.                                                                                                                                                                                                                               |
| `passwordChangedAt`     | Stored nullable User timestamp   | ISO timestamp or null.                                                                                                                                                                                                                               |
| `credentialVersion`     | Stored `User.credentialVersion`  | Direct non-negative integer.                                                                                                                                                                                                                         |

Directory repositories use an explicit select and reduce `passwordHash` to a
boolean before the application/presenter result. They never expose password
hashes, current or previous temporary passwords, credential tokens, session
information, or credential-delivery encrypted metadata. Teacher create, update,
rehire, employment, archive, and transfer requests reject password fields.

Credential summary result: **PASS**. The rehire targeting gap above remains an
implementation prerequisite, not a reason to duplicate credentials.

## 9. Allocation lifecycle gates

### 9.1 Current Academics reality

`TeacherSubjectAllocation` remains the only writable assignment truth. Existing
`/api/v1/academics/allocations` routes use `academics.structure.view` and
`academics.structure.manage` and are unchanged by 1B.

| Concern                       | Current implementation                                                                                                                                                                      | Gap                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Teacher assignment validation | Requires active/non-ended Membership and Teacher User/Membership types, but does not select/check Role key/deletion/school, User account status, or TeacherProfile employment/completeness. | It is weaker than the exact lifecycle Membership predicate. 1C owns write hardening.  |
| Term writeability             | Teacher allocation mutation helper checks only `Term.isActive`.                                                                                                                             | It is not the date-first lifecycle classification.                                    |
| Date-first term state         | Implemented and tested only in the read-only 0A classifier with `future`, `historical`, `current_active`, `current_inactive`, `inconsistent`, `invalid`.                                    | No shared TypeScript runtime service exists.                                          |
| Dependency count              | Repository counts TimetableEntry, live LessonPlan, and live HomeworkAssignment references for allocation deletion/clear.                                                                    | Useful shared logic, but it does not classify a Teacher's allocations by term window. |
| Delete                        | Reads allocation, requires active term, counts dependencies, then deletes.                                                                                                                  | Must not be invoked by Teacher employment transitions.                                |
| Clear subject                 | In one transaction, selects allocations, counts dependencies, and deletes only when counts are zero.                                                                                        | Lifecycle may consult but never bypass or call it as cleanup.                         |

### 9.2 Locked shared lifecycle query

`1B-1` must add a read-only Academics-owned service/repository operation,
conceptually `classifyTeacherAllocationLifecycleState(teacherUserId, asOf)`. It
must use current-school scoped Prisma, explicit selects, and the same date-first
rules already tested by the classifier. It returns only:

- counts by all six term-state labels;
- active count (`current_active`);
- future count (`future`);
- conservative integrity counts (`current_inactive`, `inconsistent`,
  `invalid`);
- dependency counts for the selected blocking allocation ids when required;
- `reassignmentRequired` and a stable integrity reason, without mutation.

The result contains no names or foreign-school identifiers. `historical` is
always preserved and non-blocking. `current_inactive`, `inconsistent`, and
`invalid` are never silently treated as safe-to-delete; demotion/archive fail
closed for manual academic-data remediation when the service cannot prove that
the allocation is historical/non-blocking.

| Lifecycle operation            | Allocation behavior                                                                                          | Blocking rule                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Account disable                | Preserve all allocations; disable immediately.                                                               | Never blocked by allocation or dependency counts.                                             |
| Membership security suspension | Preserve all allocations; suspend immediately.                                                               | Never blocked.                                                                                |
| Employment `INACTIVE`          | Record immediately; retain allocations; return `reassignmentRequired=true` for current-active/future counts. | Not blocked by academic dependencies. Data-integrity states are separately surfaced.          |
| Employment `TERMINATED`        | Record immediately; retain allocations; return reassignment state.                                           | Not blocked by academic dependencies.                                                         |
| Role demotion                  | Preserve historical allocations. Do not call delete/clear as an implicit cleanup.                            | Block current-active/future allocations and fail closed on unclassifiable/inconsistent state. |
| Profile archive                | Preserve historical allocations and every dependent timetable/lesson/homework row.                           | Same gate as demotion.                                                                        |

The Teachers lifecycle coordinator depends on this Academics service; it may not
copy its query, call Prisma for allocations directly, or bypass shared delete
dependency logic. Current readiness result: **GAP**, because the reusable
runtime classifier/query does not exist yet.

## 10. Organization authorization and transfer route decision

### 10.1 Verified current convention

- An organization actor is `UserType.ORGANIZATION_USER` with an active
  Membership whose `organizationId` is set and `schoolId` is null.
- The global system Role key is `organization_admin`. Its seed receives all
  non-platform permissions.
- `ScopeResolverGuard` can place that organization Membership in request
  context. School-scoped Settings helpers reject it because they require a
  non-null school.
- `SchoolManagementOnly` admits organization and school users, but it does not
  itself prove a path Organization id or authorize cross-school access.
- Existing cross-tenant organization/school routes are under
  `/api/v1/platform-admin`. Their use cases require a `PLATFORM_USER` and
  platform permissions; they are not an Organization Admin convention.
- No organization-management controller namespace, Organization-scope
  decorator/guard, organization-scoped repository, or transfer coordinator was
  found.
- `platformBypassScope` only toggles request scope. Its `@PlatformScope`
  annotation is a review marker, not an Organization authorization policy. It
  must not be reused ad hoc for transfer.

### 10.2 Locked data and coordinator behavior

The data/lifecycle contract remains:

- require an `ORGANIZATION_USER` with an active organization-level Membership
  for the exact organization and `teachers.records.manage`;
- resolve source and destination School ids explicitly inside one narrow
  Organization-authorized repository/coordinator;
- prove both non-deleted Schools belong to that same Organization;
- return indistinguishable `teachers.lifecycle.transfer_not_found` 404 for
  unauthorized, foreign-school, cross-organization, deleted, archived, or
  guessed resources;
- give regular School Admins no foreign-school discovery or mutation path;
- lock the global User, live source Profile/Membership, uniqueness footprint,
  and destination archived Profile as needed;
- mark source Membership `TRANSFERRED` with an end timestamp and archive the
  source Profile without changing its school;
- create or restore the destination Profile with destination-owned code and
  employment data; do not copy source teacherCode, department, hire date,
  schedule, or employment state;
- create the destination Membership as `SUSPENDED`, set Profile `INACTIVE`, set
  User `DISABLED`, preserve credentials, and leave no second live Profile or
  operational Teacher Membership;
- preserve source Profile, Membership, allocation, timetable, lesson-plan,
  homework, and audit history;
- use one reviewed lifecycle transaction and fail-closed session revocation.

The route path is **not proposed** in this document. There is no current
Organization-management namespace to verify, and placing the operation under
`platform-admin` or broadening a current-school controller would contradict the
actor and security contract. `1B-6` is blocked until a separate reviewed
Organization-scope convention locks the namespace, guard/decorator, resolver,
safe-404 policy, and repository. Current result: **GAP**.

## 11. Directory read and write contracts

Only the following 1B routes are in scope. Assignment routes are 1C, avatar
routes are 1D, and Teacher App adoption is 1E.

### 11.1 Shared response and security rules

`teacherId` is `TeacherProfile.id`, never User id or Membership id. Every route
first resolves a non-deleted current-school Profile through scoped Prisma. A
missing, archived, cross-school, or inaccessible target returns the same
`teachers.profile.not_found` response without foreign ids or existence clues.

Every Teacher response presents these dimensions separately:

- `accountStatus` from User;
- `membershipStatus` and `membershipEndedAt` from the relevant Membership;
- `employmentStatus` from TeacherProfile;
- Profile completeness projection;
- the exact credential summary in section 8.

No response includes password/credential material, session data, Role tenant
ids, foreign School/Organization ids, audit metadata, or storage coordinates.
School A receives the same safe 404 whether a guessed School B id exists or not.

### 11.2 Field ownership and exact request/response shape

| API field                                     | Canonical owner               | Accepted by                                              | Locked rule                                                                                                                                             |
| --------------------------------------------- | ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loginEmail`                                  | `User.email`                  | POST, PATCH                                              | Optional explicit login override under the existing IAM login-identity policy; never copied to Profile.                                                 |
| `username`                                    | `User.username`               | POST, PATCH                                              | Normalized and checked by existing IAM rules.                                                                                                           |
| `contactEmail`                                | `User.contactEmail`           | POST, PATCH                                              | Contact/delivery identity, distinct from login email.                                                                                                   |
| `phone`                                       | `User.phone`                  | POST, PATCH                                              | IAM/contact identity; never copied to Profile.                                                                                                          |
| `teacherCode`                                 | `TeacherProfile.teacherCode`  | POST, PATCH, rehire                                      | Normalized uppercase/no whitespace, non-empty for a complete Profile, unique per school.                                                                |
| `firstNameAr`, `lastNameAr`                   | TeacherProfile                | POST, PATCH, rehire                                      | Canonical Arabic Directory names; no inference from User names.                                                                                         |
| `firstNameEn`, `lastNameEn`                   | TeacherProfile                | POST, PATCH, rehire                                      | Canonical English Directory names; no inference from User names.                                                                                        |
| `preferredDisplayLanguage`                    | Command-only lifecycle policy | POST; required on PATCH/rehire when managed names change | `AR` or `EN`; derives required `User.firstName/lastName` projections in the same transaction and is not a second name store.                            |
| `gender`                                      | TeacherProfile                | POST, PATCH, rehire                                      | `MALE` or `FEMALE`; required for completeness.                                                                                                          |
| `employmentStatus`                            | TeacherProfile                | POST and employment-status route only                    | POST requires explicit `ACTIVE` or `INACTIVE`; never relies on schema default and cannot provision `TERMINATED`. Other changes use the dedicated route. |
| `department`, `specialization`                | TeacherProfile                | POST, PATCH, rehire                                      | Nullable bounded school-owned employment text.                                                                                                          |
| `employmentType`                              | TeacherProfile                | POST, PATCH, rehire                                      | Nullable `FULL_TIME`, `PART_TIME`, or `CONTRACT`.                                                                                                       |
| `experienceYears`                             | TeacherProfile                | POST, PATCH, rehire                                      | Nullable integer 0-60.                                                                                                                                  |
| `hireDate`                                    | TeacherProfile                | POST, PATCH, rehire                                      | Nullable date-only value.                                                                                                                               |
| `workingDays`                                 | TeacherProfile                | POST, PATCH, rehire                                      | At most seven unique enum values, normalized to canonical Sunday-Saturday order; empty means unconfigured.                                              |
| `workStartTime`, `workEndTime`                | TeacherProfile                | POST, PATCH, rehire                                      | Nullable pair; when set, end is later than start.                                                                                                       |
| `notesAr`, `notesEn`                          | TeacherProfile                | POST, PATCH, rehire                                      | Nullable, at most 500 characters each; never copied into audit metadata.                                                                                |
| `accountStatus`                               | User                          | No ordinary record request                               | Forced by the coordinator; never accepted by POST/PATCH/rehire.                                                                                         |
| `membershipStatus`                            | Membership                    | No ordinary record request                               | Forced by the coordinator; never accepted by POST/PATCH/rehire.                                                                                         |
| `password`, `passwordHash`, credential fields | User/IAM                      | No Teacher request                                       | Rejected as non-whitelisted input; existing credential endpoints remain the only writers.                                                               |
| Assignments/avatar fields                     | Academics/File lifecycle      | No 1B request                                            | Out of scope and rejected as non-whitelisted input.                                                                                                     |

POST requires a complete final Profile: normalized teacherCode, all four managed
name fields, and gender. PATCH and rehire use managed partial input but validate
the final composed Profile whenever the operation requires completeness. Rehire
forces employment `INACTIVE`, User `DISABLED`, and Membership `SUSPENDED`
regardless of attempted status input.

List items contain `id` (Profile id), `userId` (needed only to address the
existing credential endpoints), teacherCode, managed names/display projection,
gender, safe employment labels, account/Membership/employment states,
completeness, credential summary, and safe timestamps. They omit notes and the
full employment schedule unless the detail endpoint is used. Detail adds the
remaining authorized Profile employment fields and notes. Neither shape contains
assignments, avatar delivery, password material, sessions, internal Membership
or Role tenant ids, School/Organization ids, or storage state.

### 11.3 Endpoint matrix

| Endpoint                                              | Permission and scope                      | Input owner and validation                                                                                                                                                                                                                                                                                                                                                                                                    | Output                                                                                                                                            | Errors/conflicts                                                                                                                        | Transaction, audit, and revocation                                                                                                                                                                                                      |
| ----------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/teachers`                                | `teachers.records.view`; current school   | Bounded search; account, Membership, employment, gender, and completeness filters; deterministic pagination. No assignment/avatar filters in 1B.                                                                                                                                                                                                                                                                              | Paginated Profile summaries, bilingual managed names, User login/contact fields as authorized, separate states, completeness, credential summary. | `validation.failed`; no foreign-resource detail.                                                                                        | Read only; no audit or revocation. Composition uses explicit selects and a consistent read snapshot when multiple queries are needed.                                                                                                   |
| `GET /api/v1/teachers/:teacherId`                     | `teachers.records.view`; current school   | UUID Profile id.                                                                                                                                                                                                                                                                                                                                                                                                              | One composed Directory record; no assignments or avatar delivery.                                                                                 | `teachers.profile.not_found`; incomplete state is represented, and operations requiring completeness use `teachers.profile.incomplete`. | Read only; no audit or revocation.                                                                                                                                                                                                      |
| `POST /api/v1/teachers`                               | `teachers.records.manage`; current school | IAM-owned: optional legacy login override under existing resolver policy, username, contact email, phone. Profile-owned: teacherCode, four bilingual names, gender, employment fields. `preferredDisplayLanguage` selects the User display projection. Exact Teacher Role is resolved internally. No password, role id, userType, status, assignments, or avatar. Complete input and intended employment status are explicit. | Invited User + active exact Teacher Membership + complete live Profile + separate states and credential summary.                                  | Code/identity conflict, incomplete, Teacher Role required.                                                                              | One DB transaction creates User, Membership, Profile, `teachers.account.provision`, and `teachers.profile.create`. New User has no prior sessions, so no revocation. Generic Settings creation rejection ships in the same safe deploy. |
| `PATCH /api/v1/teachers/:teacherId`                   | `teachers.records.manage`; current school | Patch IAM-owned username/contact/phone and Profile-owned record fields. Bilingual names plus preferred display language update required User display projections in the transaction. Excludes password, statuses, role, assignments, and avatar.                                                                                                                                                                              | Updated composed record and credential summary.                                                                                                   | Safe not found; code/identity conflict; incomplete when an operation requires complete result; role consistency conflict.               | One transaction updates User/Profile and writes `teachers.profile.update` with changed field keys only. No session revocation unless a reviewed IAM identity rule explicitly requires it.                                               |
| `PATCH /api/v1/teachers/:teacherId/employment-status` | `teachers.records.manage`; current school | `employmentStatus` is `ACTIVE`, `INACTIVE`, or `TERMINATED`; optional effective timestamp where valid; optional bounded stable reason code, never free text. `ACTIVE` is reactivation from `INACTIVE`; `TERMINATED` cannot reactivate here.                                                                                                                                                                                   | Exact Profile/User/Membership states and `reassignmentRequired`; no allocation rows.                                                              | Not found, incomplete, role/credential/Membership gate, active-allocation integrity result, invalid transition, revocation failed.      | Transaction applies exact rules below and writes `teachers.employment_status.change` plus the applicable account/Membership actions. Required Session revocation completes transactionally or before success.                           |
| `POST /api/v1/teachers/:teacherId/rehire`             | `teachers.records.manage`; current school | Archived same-school Profile id; managed complete Profile fields; teacherCode decision; preferred display language. No password/assignments/avatar.                                                                                                                                                                                                                                                                           | Restored Profile `INACTIVE`, User `DISABLED`, exact Membership `SUSPENDED`, and credential summary.                                               | Safe not found; code/identity/role conflict; another live Profile/operational Membership; incomplete input; revocation failure.         | Lock User/Profile; one transaction restores exact Profile, restores/creates Membership, updates compatibility type/projections, writes `teachers.profile.restore` and `teachers.account.rehire`, and revokes stale sessions.            |
| `DELETE /api/v1/teachers/:teacherId`                  | `teachers.records.manage`; current school | Live Profile id; optional stable reason code/effective timestamp only. Means archive, never hard delete.                                                                                                                                                                                                                                                                                                                      | `204` with no body, or a minimal archived state response if the repository-wide convention requires a body; choose once and snapshot-test.        | Safe not found; active assignments; archive conflict; revocation failed.                                                                | Read-only Academics gate first; one transaction soft-deletes Profile, ends Teacher Membership, disables User, writes `teachers.profile.archive` and `teachers.account.disable`, and revokes sessions. Historical rows remain.           |

### 11.4 Exact employment transitions

| Requested state        | Required result                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INACTIVE`             | Set Profile `INACTIVE`, User `DISABLED`, exact non-ended Teacher Membership `SUSPENDED` with `endedAt=null`; retain allocations; return reassignment state; audit employment, account disable, and Membership suspend; revoke sessions.                                                                                                     |
| `TERMINATED`           | Set Profile `TERMINATED`, User `DISABLED`, exact Teacher Membership `INACTIVE` with `endedAt=effectiveAt`; retain allocations; return reassignment state; audit employment and account/Membership changes; revoke sessions.                                                                                                                 |
| Reactivate to `ACTIVE` | Require complete live Profile, User/Membership/Profile school and type consistency, exact Teacher Role, a non-ended suspended Membership, and provisioned credential. Set Profile, User, and Membership `ACTIVE` in one transaction; update display projections; audit employment/account activation; revoke stale sessions before success. |

Security account disable and Membership suspension are not blocked by allocation
dependencies. Employment inactivation/termination records immediately. Role
demotion and archive remain blocked until current-active/future allocations are
remediated, while historical allocations are always retained.

Directory contract result: **PASS**.

## 12. Permission and seed plan

Only these permissions enter 1B:

```text
teachers.records.view
teachers.records.manage
```

`teachers.assignments.view` and `teachers.assignments.manage` are deferred to
1C. Credential reads/writes retain `settings.users.view/manage`. No broad
Settings or Files permission substitutes for Teacher records.

The catalog is the `PERMISSIONS` array in
`prisma/seeds/01-permissions.seed.ts`, applied by idempotent Permission upsert.
System-role composition is in `prisma/seeds/02-system-roles.seed.ts`:

- `platform_super_admin` receives all catalog permissions;
- `organization_admin` receives all non-platform permissions;
- `school_admin` receives the school-level/non-platform set;
- `teacher` receives only the explicit `TEACHER_PERMISSIONS` array and must not
  receive either management permission;
- custom roles receive neither permission until explicitly granted by an
  authorized role-management flow.

Thus adding the two catalog entries automatically grants both to the three
admin system roles after the idempotent role seed rebuilds their joins. Current
school endpoints still require a school context; possession by a platform role
does not create a school scope. A future Organization transfer route must also
require the Organization actor policy, not permission alone.

Permission data is seed-governed at this repository baseline; no Prisma schema
migration is needed. Deployment must run the approved idempotent seed after
migrations. `migrate deploy` alone does not install catalog rows or grants and
is a hard stop for route enablement.

Required tests prove catalog uniqueness, School Admin view/manage access,
Organization Admin possession without School B discovery, Teacher system-role
exclusion, custom-role denial by default, safe 403 behavior, idempotent second
seed, and that no assignment permission entered 1B.

Permission plan result: **PASS**.

## 13. Error catalog plan

The stable code is never translated. The repository error catalog specifies
translated human messages, but the current `GlobalExceptionFilter` returns the
English `DomainException.message` directly and has no `Accept-Language`
translation integration. Each 1B code must be added to `ERROR_CATALOG.md`,
implemented as a domain exception, and snapshot-tested. Localized Arabic/English
messages cannot be claimed until the runtime localization mechanism exists.

| Code                                        | HTTP | Safe meaning                                                                               | Allowed detail keys                                                        | Forbidden details                                                           | Localization                                             |
| ------------------------------------------- | ---- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| `teachers.profile.not_found`                | 404  | Profile is missing, archived, foreign-school, or inaccessible.                             | None, or `resource=teacher_profile` only.                                  | Profile/User/Membership/School/Organization ids and existence distinctions. | Catalog EN/AR required when runtime localization exists. |
| `teachers.profile.code_conflict`            | 409  | Normalized teacher code conflicts in current school.                                       | `field=teacherCode`.                                                       | Conflicting code value, Profile/User/School ids.                            | Required.                                                |
| `teachers.profile.incomplete`               | 409  | Managed Profile lacks activation/provisioning fields.                                      | `missingFields` from the fixed completeness-key enum.                      | Names or attempted field values.                                            | Required.                                                |
| `teachers.account.identity_conflict`        | 409  | Login/contact identity violates current IAM uniqueness policy.                             | `fields` containing fixed field keys only.                                 | Email, username, phone, User ids, owning tenant.                            | Required.                                                |
| `teachers.account.teacher_role_required`    | 422  | Exact live Teacher Role cannot be resolved or is incompatible.                             | `reasonCode`.                                                              | Role id, Role school id, foreign tenant ids.                                | Required.                                                |
| `teachers.account.role_transition_conflict` | 409  | Generic or lifecycle role transition is unsafe.                                            | Stable `reasonCode`; dependency counts when relevant.                      | Target identity, Role/tenant ids, free text.                                | Required.                                                |
| `teachers.lifecycle.active_assignments`     | 409  | Current-active/future allocations block demotion/archive.                                  | `currentActiveCount`, `futureCount`, dependency counts, term-state labels. | Allocation ids, names, foreign ids.                                         | Required.                                                |
| `teachers.lifecycle.archive_conflict`       | 409  | Profile cannot be archived in its current lifecycle state.                                 | Stable `reasonCode`.                                                       | Foreign ids or free text.                                                   | Required.                                                |
| `teachers.lifecycle.invalid_transition`     | 409  | Requested account/Membership/employment transition is not allowed.                         | Previous/next enum values and stable `reasonCode`.                         | Notes, personal values, raw state object.                                   | Required.                                                |
| `teachers.lifecycle.revocation_failed`      | 503  | Required session revocation did not complete; no success is reported.                      | `retryable=true`, stable `reasonCode`.                                     | Session ids, token/hash, User email, raw error.                             | Required.                                                |
| `teachers.lifecycle.transfer_not_found`     | 404  | Transfer source/destination is missing or not authorized in the actor organization.        | None.                                                                      | Which resource existed; any School/Organization/Profile/User id.            | Required.                                                |
| `teachers.lifecycle.transfer_conflict`      | 409  | Authorized same-organization transfer conflicts with live Profile/Membership/target state. | Stable `reasonCode`; safe counts.                                          | Foreign ids, source employment values, free text.                           | Required.                                                |

All cross-school and transfer guesses use safe 404 before relationship
validation. `422` is never used to reveal a resource outside authorized scope.

Error catalog plan result: **PASS**.

## 14. Ordered 1B implementation decomposition

No subphase may start until 1A deployment and target classifier evidence are
proven. Each subphase must be independently deployable and leave no new bypass.

### 14.1 1B-1 Shared lifecycle infrastructure

**Entry criteria**

- Approved target shows 1A migration applied with no drift/failed migration.
- Classifier shows no unexplained structural gap; incomplete Profiles are
  explicitly fail-closed remediation state.

**Allowed files/modules**

- Teachers shared lifecycle domain/application/infrastructure foundation;
- narrowly scoped IAM transaction/audit/session interfaces;
- Academics read-only allocation lifecycle classifier/query;
- focused unit/repository/security tests and docs.

**Outputs**

- typed lifecycle Unit of Work using one `Prisma.TransactionClient`;
- transaction-aware User/Membership/Profile/Audit/Session operations;
- Teacher audit metadata whitelist and rejection-audit behavior;
- shared date-first allocation lifecycle read service;
- lifecycle-aware credential target authorization for disabled/suspended rehire
  without new hashing/storage logic.

**Forbidden changes**

- controllers/routes, CRUD DTOs/presenters, transfer scope bypass, allocation
  mutation, avatar, Teacher App adoption, password logic, parallel assignment
  storage.

**Migration/seed impact**

- none.

**Tests and exit gates**

- transaction rollback on each write/audit/session failure;
- explicit proof all aggregate writes use the same transaction client;
- sanitized rejected-audit failure preserves the intended public error;
- term-state boundaries and unclassifiable fail-closed behavior;
- no route changes; build/security regression green.

### 14.2 1B-2 Directory reads and record update

**Entry criteria:** 1B-1 merged and deployed; transaction/audit hooks proven.

**Allowed files/modules:** Teachers Profile/Directory controller, DTO,
application, presenter, repository methods, module registration, error classes,
the two records permission catalog/role-seed entries, and focused tests.

**Outputs:** list/detail/PATCH record routes; explicit field ownership;
credential summary; current-school safe 404; bilingual names drive User display
projections transactionally.

**Forbidden changes:** POST provisioning, Settings bypass changes, employment,
rehire/archive/transfer, assignments, avatar, Teacher App, credential writes.

**Migration/seed impact:** no schema migration; exactly two permission catalog
entries and reviewed system-role grants applied through approved seed procedure.

**Tests/exit gates:** School A/B matrix for all three routes; pagination/filter
tests; Profile incomplete representation; no credential material; seed
idempotency and Teacher-role exclusion; non-Teacher APIs unchanged.

### 14.3 1B-3 Atomic Teacher provisioning and Settings bypass closure

**Entry criteria:** 1B-2 deployed; permission rows/grants proven; IAM identity
rules and exact Teacher Role resolver tested.

**Allowed files/modules:** Teachers POST provisioning; Settings create/invite
and role/display interception; shared IAM resolver/repository hooks; audit/errors
and tests.

**Outputs:** one-transaction User + Membership + Profile + audit provisioning;
User `INVITED`; exact Teacher Membership; complete Profile; generic Teacher
create/invite/promotion and display-name bypass rejected before write.

**Forbidden changes:** new credential endpoint/hash logic, active
credential-less account, employment transitions, allocations, transfer/avatar,
non-Teacher Settings behavior changes.

**Migration/seed impact:** none beyond already deployed records permissions.

**Tests/exit gates:** injected failure after each aggregate write rolls back all;
identity races; missing Teacher Role; Settings Teacher bypass E2E; non-Teacher
create/invite/update regression; no interval where generic Teacher creation is
enabled without provisioning.

### 14.4 1B-4 Employment transitions and session revocation

**Entry criteria:** 1B-3 deployed; session transaction hook and shared Academics
read service proven.

**Allowed files/modules:** employment-status application/DTO/controller,
lifecycle coordinator, IAM status/Membership/session operations, audit/errors,
and tests.

**Outputs:** exact ACTIVE/INACTIVE/TERMINATED transitions; separate statuses;
immediate fail-closed access bridge before 1E; reassignment state; generic
Teacher account disable delegation and activation rejection.

**Forbidden changes:** allocation mutation, role demotion/archive, rehire,
transfer, Teacher App/Profile access changes, new credential logic.

**Migration/seed impact:** none.

**Tests/exit gates:** every transition and invalid edge; incomplete/credential/
role gates; session failure rollback/compensation proof; active/future and
historical allocation behavior; existing IAM credentials/login/Settings green;
School A/B isolation.

### 14.5 1B-5 Same-school rehire and archive

**Entry criteria:** 1B-4 deployed; archived Profile locking and global live
uniqueness behavior proven under concurrency.

**Allowed files/modules:** same-school rehire, archive, role-demotion coordinator,
Settings demotion delegation, audit/errors/tests.

**Outputs:** restore exact archived `(schoolId,userId)` Profile; fail-closed
disabled/suspended/inactive state; archive/role-demotion active/future gates;
historical preservation; no second Profile.

**Forbidden changes:** cross-school transfer, Profile school mutation, automatic
source employment copying, hard delete, allocation cleanup, embedded employment
history.

**Migration/seed impact:** none.

**Tests/exit gates:** concurrent rehire/live conflict; archived same-school
restore; other-school archived preservation; credential-missing rehire path;
demotion/archive gates and dependency preservation; revocation failures;
School A/B safe 404.

### 14.6 1B-6 Organization-authorized cross-school transfer

**Entry criteria:** 1B-5 deployed; a separate review has resolved and tested the
Organization route namespace, actor guard/decorator, exact organization
permission use, safe-404 resolver, and narrow repository. This criterion is
currently unmet.

**Allowed files/modules:** dedicated Organization transfer controller/DTO only
after convention approval; one transfer coordinator; narrow source/destination
repositories; lifecycle/audit/session integrations and security tests.

**Outputs:** same-Organization source/destination transfer with source history
preservation and destination disabled/suspended/inactive state; exact audit
actions; no second live Profile/Membership.

**Forbidden changes:** platform-scope substitution, School Admin foreign-school
access, generic bypass, source Profile school mutation, automatic source-field
copy, allocation mutation, cross-organization transfer.

**Migration/seed impact:** no schema migration expected. No new permission is
approved beyond `teachers.records.manage`; if review determines a distinct
organization-transfer permission is required, 1B scope must be re-authorized
before implementation.

**Tests/exit gates:** School A and B Admin denial/no discovery; Organization
actor same-org success only; cross-org safe 404; concurrent source/destination
locking; histories byte/state preserved; revocation and transaction failure
matrix.

### 14.7 1B-7 Lifecycle closeout and complete security matrix

**Entry criteria:** 1B-1 through 1B-6 deployed with their evidence. If 1B-6
remains blocked, 1B cannot be declared fully closed.

**Allowed files/modules:** tests, contract/evidence docs, narrowly scoped fixes
for defects proven by tests.

**Outputs:** complete route, Settings bypass, transaction, audit, revocation,
permission, error, classifier, and School A/B/Organization security evidence.

**Forbidden changes:** 1C assignments facade/mutations, 1D avatars, 1E Teacher
App adoption, opportunistic refactors or schema expansion.

**Migration/seed impact:** none unless a separately authorized correction is
proven necessary.

**Tests/exit gates:** target classifier has zero unexplained structural gaps;
incomplete Profiles are explicitly remediated/fail-closed; no Settings bypass;
all lifecycle failures are atomic/fail-closed; all routes safe across tenants;
full IAM/Settings/Academics/Teacher App regression; build and migration
governance green.

1B subphase plan result: **PASS**.

## 15. Risks and hard stops

The following prevent authorization of 1B runtime implementation now:

1. 1A deployment to an approved target or representative environment is not
   proven.
2. The post-1A classifier was not authorized/run against such an environment.
3. Current IAM/User/Profile/Audit repositories do not accept one shared
   lifecycle transaction client.
4. Generic audit is outside User/Membership transactions and accepts arbitrary
   metadata.
5. Lifecycle session revocation has no transaction hook or durable sanitized
   retry evidence; role transitions do not revoke at all.
6. Generic Settings can still create/promote/demote Teacher identities and edit
   display names without Profile lifecycle gates.
7. No shared runtime date-first Academics lifecycle allocation classifier exists.
8. No Organization-management route/guard/repository convention exists for
   transfer; `platformBypassScope` is not an acceptable substitute.
9. Existing credential targeting cannot provision a missing credential for the
   locked disabled/suspended rehire state.
10. Error-message localization described by `ERROR_CATALOG.md` is not wired
    into the current global exception filter.

Any migration drift, checksum mismatch, reset request, failed migration, P3009,
or migration-history mismatch discovered in a future approved environment is an
immediate additional hard stop. No reset, resolve, push, direct DDL, or
`_prisma_migrations` edit is authorized.

## 16. Validation evidence

The following commands are the required read-only/static validation set for
this document. Results are recorded after execution; no lint or formatter
`--fix` command is permitted.

| Command                                                                    | Result                                                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run test:migration-governance`                                        | PASS: 39/39 tests                                                                                     |
| `npm run db:migrations:check`                                              | PASS: base `origin/main` at inspected HEAD; 4 active; 0 new; rebaseline off                           |
| `npx prisma validate`                                                      | PASS                                                                                                  |
| `npx prisma generate`                                                      | PASS: Prisma Client 6.19.3 generated                                                                  |
| `npm run build`                                                            | PASS on clean rerun; the first timed-out run left ignored `dist` output that was removed before rerun |
| `node --check scripts/classify-teacher-directory-reality-0a.cjs`           | PASS                                                                                                  |
| `node --test scripts/tests/classify-teacher-directory-reality-0a.test.cjs` | PASS: 15/15 tests                                                                                     |
| Focused IAM/Settings/audit/session/Academics unit tests                    | PASS: 11 suites, 52 tests                                                                             |
| `git diff --check`                                                         | PASS: no output; the untracked document was independently Prettier-checked                            |
| `git status --short`                                                       | Expected single untracked document; staged files 0                                                    |

No database migration status or classifier command was run against an
unidentified connection. That omission is deliberate and is recorded as
deployment/classifier `NOT PROVEN` rather than converted into local evidence.

## 17. Final authorization gate

```text
SCHOOL-TEACHER-DIRECTORY-1B-0:
COMPLETE

BASELINE:
9b0726edfc90b7f12d6f56b9078d448e9cabe532

1A MERGED:
PASS

1A DEPLOYMENT:
NOT PROVEN

POST-1A CLASSIFIER:
NOT RUN

IAM TRANSACTION HOOKS:
GAP

TRANSACTIONAL AUDIT:
GAP

SESSION REVOCATION FAIL-CLOSED:
GAP

SETTINGS TEACHER BYPASS MAP:
PASS

CREDENTIAL SUMMARY:
PASS

ALLOCATION LIFECYCLE GATES:
GAP

ORGANIZATION TRANSFER CONVENTION:
GAP

DIRECTORY CONTRACT:
PASS

PERMISSION PLAN:
PASS

ERROR CATALOG PLAN:
PASS

1B SUBPHASE PLAN:
PASS

RUNTIME FILES CHANGED:
0

SCHEMA CHANGED:
0

MIGRATIONS ADDED:
0

PERMISSION SEEDS CHANGED:
0

EXISTING MIGRATIONS MODIFIED:
0

COMMIT AUTHORIZED:
NO

PUSH AUTHORIZED:
NO

PR AUTHORIZED:
NO

1B RUNTIME IMPLEMENTATION AUTHORIZED:
NO
```
