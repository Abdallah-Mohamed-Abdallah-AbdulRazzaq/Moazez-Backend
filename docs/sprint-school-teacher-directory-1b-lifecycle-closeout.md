# SCHOOL-TEACHER-DIRECTORY-1B-7 Lifecycle and Security Closeout

## 1. Branch and baseline

- Branch: `feat/school-teacher-directory-1b-lifecycle-closeout`
- Baseline and initial HEAD: `f56252ca45b7c906fc786090a51ae0a80c056d63`
- Mode: lifecycle and security closeout
- Target deployment status: not proven by this repository-only execution

Sections 2 through 25 preserve the first blocked closeout discovery as
historical evidence. Section 26 records the authorized 1B-7A/7B correction and
is the authoritative final status for this execution.

## 2. Merged 1B inventory

The inspected baseline contains the shared lifecycle unit of work, directory
reads and managed update, atomic provisioning, employment transitions,
archive/rehire and role demotion, and organization-authorized transfer. No 1C
assignment facade, 1D avatar runtime, or 1E Teacher App adoption was added.

## 3. Final route inventory

The registered Teacher lifecycle surface is:

- `GET /api/v1/teachers`
- `GET /api/v1/teachers/:teacherId`
- `POST /api/v1/teachers`
- `PATCH /api/v1/teachers/:teacherId`
- `PATCH /api/v1/teachers/:teacherId/employment-status`
- `DELETE /api/v1/teachers/:teacherId`
- `POST /api/v1/teachers/:teacherId/rehire`
- `POST /api/v1/organization-admin/teachers/:teacherId/transfer`

No additional Teacher feature route was introduced in closeout.

## 4. Permission and actor matrix

Current-School reads require `teachers.records.view`; mutations require
`teachers.records.manage`. The School and Organization security suites prove
that Teacher and ungranted custom Roles cannot manage records. Organization
transfer remains restricted to the exact V1 Organization Admin actor and does
not admit School, Teacher, Platform, custom Organization, ambiguous, ended,
inactive, deleted, or stale-type actor state. The Teacher system Role continues
to receive neither Teacher record permission.

## 5. School A/B evidence

The disposable-database closeout suite proved current-School provisioning,
list/detail isolation, indistinguishable missing and foreign Profile behavior,
and denial for Teacher, custom School, and Platform actors. These assertions
passed before the lifecycle tests reached the database constraint described in
section 22.

## 6. Organization A/B evidence

The Organization actor, foreign-Organization, School actor, Teacher actor,
Platform actor, custom Organization Role, stale actor type, and ambiguous
Membership tests executed through the real application. Authorization and safe
resource hiding passed. A same-Organization transfer cannot commit because the
destination `SUSPENDED` Membership state is rejected by the committed database
constraint described below.

## 7. Settings bypass matrix

The closeout HTTP matrix proves generic Teacher create, invite, promotion,
display projection edit, and activation are rejected or delegated according to
the merged contracts. It exposed two missing legacy-path checks:

- Teacher resend-invite previously returned success.
- The legacy Teacher reset-password placeholder could proceed to hashing.

The narrow correction makes both paths use the existing sanitized rejected
transition audit before any state, password-hash placeholder, or success-audit
write. The fixed reason codes are `teacher_invite_managed_by_directory` and
`legacy_reset_forbidden`. Focused unit tests pass 15/15 including the existing
Settings bypass suite. Non-Teacher behavior is unchanged.

## 8. Lifecycle state matrix

Real-database provisioning, safe directory reads, archive, termination,
Settings denial, audit sanitization, and classifier fixture coverage executed.
Termination persists `TERMINATED`, `DISABLED`, and an ended `INACTIVE`
Membership. The required `SUSPENDED` plus null `endedAt` state used by
employment inactivation, rehire, and destination transfer is not persistable
under the active migration chain. Those paths roll back and do not produce a
successful lifecycle result.

## 9. Real-database concurrency outcomes

Concurrent rehire and transfer requests used separate real PostgreSQL
connections. Both requests fail at the same committed Membership constraint,
so the required one-winner/one-safe-conflict outcomes cannot be proven.
Database uniqueness still prevented a second live Profile in the classifier
fixture. The broader concurrency gate is therefore failed, not waived.

## 10. Transaction rollback outcomes

The failed inactivation, rehire, and transfer transactions left no partial
successful lifecycle state. Existing unit regression covers the injected User,
Membership, Profile, Session, audit, response-composition, and moved-state
rollback positions. The unit family passed 3463/3463 in the canonical run.

## 11. Audit outcomes

Successful Teacher audit records observed by the closeout suite used only the
locked action and singular resource namespaces. Metadata assertions permit
fixed changed-field keys but reject personal values, credential material,
Session identifiers, storage coordinates, request bodies, and raw errors. The
new legacy Settings rejections reuse the standalone sanitized rejection helper.

## 12. Session outcomes

Termination and the already merged account-disable behavior revoke only active
target Sessions inside the lifecycle transaction and preserve unrelated or
already revoked Sessions. Inactivation, rehire, and transfer Session outcomes
cannot receive a passing closeout gate until their Membership state can commit.

## 13. Allocation classifier outcomes

No allocation, timetable, lesson-plan, or homework mutation was introduced or
observed. Existing pure and application tests for the six date-first states
remain in the passing unit regression. Employment and transfer paths still use
the Academics-owned aggregate reader; the database constraint prevents complete
end-to-end proof for the affected transitions.

## 14. Profile reality-classifier outcomes

A dedicated disposable-database fixture suite proved complete operational,
incomplete fail-closed, missing Profile, missing operational Membership,
transferred-source/live-Profile, destination-Membership/missing-Profile, and
multiple-live database prevention behavior without identifier output. The
final classifier run against the clean seeded disposable state used
`2026-07-20T12:00:00.000Z` and reported zero Teacher users, zero structural
gaps, and zero incomplete live Profiles.

## 15. Credential preservation

Provisioning returns the missing-credential projection and creates no password.
Termination and failed lifecycle transactions did not alter credential state.
The closeout correction adds no credential writer and prevents the legacy reset
placeholder from hashing for Teacher targets.

## 16. Database safety validation

Every database-backed run parsed connection metadata without printing it,
proved the host local, protected the configured database and system database
names, generated a unique `moazez_1b7_closeout_*` target, and held its URL only
in process memory. No persistent development, shared, staging, or live database
was mutated.

## 17. Disposable lifecycle evidence

Each run created a new empty database, deployed the active migration chain,
ran the approved seed, executed its selected suites, and dropped the exact
database in `finally`. Every reported cleanup verification was `YES`. The final
classifier and migration status checks passed before cleanup.

## 18. Canonical regression

The final canonical `npm run test:regression` result was:

- unit: 497 suites, 3463/3463 tests passed;
- security: 86 suites, 1115/1115 tests passed;
- E2E: 99 suites passed and 3 failed, 516/521 tests passed;
- overall: failed.

The five cached failing E2E cases all passed 5/5 when Jest reran only those
cases against a fresh disposable database. This proves an existing cross-suite
isolation/order defect, but it does not make the canonical command green. The
closeout remains blocked.

## 19. Structural validation

- migration governance: 39/39 passed;
- migration structure: passed with four active and zero new migrations;
- Prisma validate: passed;
- Prisma generate: passed;
- build: passed after the narrow reason-code type correction;
- changed-production ESLint: passed;
- exact changed-file Prettier write and subsequent check: passed;
- `git diff --check`: passed;
- staged files: zero.

No schema, migration, seed, permission, assignment, avatar, or Teacher App
runtime change is present.

## 20. Changed files

Changes are limited to:

- `src/modules/settings/users/application/resend-invite.use-case.ts`
- `src/modules/settings/users/application/reset-password.use-case.ts`
- `src/modules/settings/users/application/teacher-settings-bypass.service.ts`
- `src/modules/settings/users/tests/teacher-legacy-settings-bypass.spec.ts`
- `src/modules/teachers/directory/domain/teacher-directory.errors.ts`
- `test/integration/teacher-lifecycle-closeout.integration.spec.ts`
- `test/integration/teacher-reality-classifier-closeout.integration.spec.ts`
- `test/security/tenancy.teacher-app.spec.ts`
- `test/security/tenancy.teacher-profiles.spec.ts`
- `test/e2e/communication-security-contract.e2e-spec.ts`
- `test/e2e/identity-credentials-email-final-closeout.e2e-spec.ts`
- `test/e2e/teacher-app-final-closeout.e2e-spec.ts`
- `docs/sprint-school-teacher-directory-1b-lifecycle-closeout.md`

## 21. Narrow test-proven fixes

1. Added fail-closed Teacher rejection to Settings resend-invite.
2. Added fail-closed Teacher rejection before the legacy reset-password hash.
3. Updated stale tests for the merged 236-permission catalog, Teacher Directory
   module registration, Organization guard order, exact Teacher App route
   prefix, and non-Teacher credential-flow fixtures.

## 22. Remaining defects and hard stops

The committed baseline constraint
`memberships_ended_at_required_when_inactive_check` requires every non-`ACTIVE`
Membership to have a non-null `endedAt`. The accepted 1B contract requires a
`SUSPENDED` Membership with `endedAt = null`. Real HTTP tests proved this causes
database rejection for inactivation, rehire, and destination transfer. Fixing
the contradiction requires reviewed schema/migration governance, which was
explicitly forbidden in 1B-7. No runtime workaround was added.

The canonical E2E family also has a cross-suite isolation/order defect: its
five failures pass when rerun against a fresh isolated database. This requires
a separate test-infrastructure correction before the canonical regression gate
can pass.

## 23. Deployment status

Repository implementation closeout is blocked. Target deployment status is
separately `NOT PROVEN`.

## 24. Final 1B authorization gate

`SCHOOL-TEACHER-DIRECTORY-1B` is blocked. No merge, deployment, 1C, 1D, or 1E
authorization is granted by this evidence.

## 25. Deferred scope

Assignments remain in 1C, avatars in 1D, and Teacher App Profile adoption in
1E. None was started.

## 26. 1B-7A/7B Membership constraint correction and recovery

### Constraint correction

The first closeout correctly found that the committed baseline predicate was:

```sql
CHECK ("status" = 'ACTIVE' OR "ended_at" IS NOT NULL)
```

That predicate contradicted the merged lifecycle contract because a
`SUSPENDED` Membership is access-disabled but remains an open lifecycle state
with `endedAt = null`. The governed custom-SQL-only migration is:

```text
prisma/migrations/20260720182221_membership_suspended_open_state/migration.sql
```

It retains the constraint name and changes the active-chain predicate to:

```sql
CHECK (
  "status" IN ('ACTIVE', 'SUSPENDED')
  OR "ended_at" IS NOT NULL
)
```

No Prisma model represents this PostgreSQL `CHECK`, so `schema.prisma` remains
unchanged. The committed baseline migration remains byte-identical; changing
the active chain through one incremental migration preserves migration
history and upgrade safety. The migration contains two `ALTER TABLE`
statements and no DML.

### Upgrade and fresh replay evidence

The upgrade rehearsal used a clean detached worktree at `origin/main` and a
unique local disposable database. It deployed the four committed baseline
migrations, created only old-predicate-compatible synthetic Membership state,
then applied the current chain. Exactly one migration was added, the named
constraint existed exactly once, and the corrected state matrix passed. The
final status reported five applied migrations, and a second deploy reported no
pending migrations. The temporary worktree and database were removed.

A separate fresh empty database replay deployed all five migrations, ran the
approved demo seed, and passed the direct constraint, Teacher lifecycle, and
Teacher reality-classifier suites: 3 suites and 23/23 tests. Its second deploy
was a no-op. The database was dropped and absence was verified.

The direct PostgreSQL constraint matrix is:

| Membership state                      | Result                           |
| ------------------------------------- | -------------------------------- |
| `ACTIVE` plus null `endedAt`          | accepted                         |
| `SUSPENDED` plus null `endedAt`       | accepted                         |
| `INACTIVE` plus non-null `endedAt`    | accepted                         |
| `TRANSFERRED` plus non-null `endedAt` | accepted                         |
| `INACTIVE` plus null `endedAt`        | rejected by the named constraint |
| `TRANSFERRED` plus null `endedAt`     | rejected by the named constraint |

The catalog assertion also proved one named constraint whose normalized
definition contains `ACTIVE`, `SUSPENDED`, and the non-null closed-state
branch. Tests compare structured outcomes and never expose raw PostgreSQL
errors.

### Recovered lifecycle, history, and concurrency evidence

The database-backed HTTP suite now passes all 14 lifecycle closeout tests:

- Inactivation persists Profile `INACTIVE`, User `DISABLED`, Membership
  `SUSPENDED` with null `endedAt`, revokes active Sessions, and commits the
  approved audits.
- Rehire restores the same archived Profile, creates no second Profile,
  returns the fail-closed `INACTIVE`/`DISABLED`/`SUSPENDED` state with null
  `endedAt`, and preserves credentials.
- Transfer archives the source Profile without changing its School, ends the
  source Membership as `TRANSFERRED`, creates or restores one destination
  Profile as `INACTIVE`, leaves the destination Membership `SUSPENDED` with
  null `endedAt`, disables the User, revokes Sessions, and preserves source
  academic and credential history without destination academic copies.
- Concurrent rehire commits one request and returns one safe conflict while
  preserving one live Profile.
- Concurrent transfer commits one request and returns one safe 409 conflict,
  with one destination result and one success audit.

The real concurrent transfer test first exposed that PostgreSQL serialization
failure `40001` can arrive through Prisma `P2010`, and that a destination
school/User uniqueness race can arrive as `P2002`. The narrow correction maps
only these proven transaction/uniqueness states to
`teachers.lifecycle.transfer_conflict`; it does not expose database metadata.
The affected production files are limited to the transfer error mapper and the
shared lifecycle serialization classifier. Focused transfer tests pass 27/27.

No Profile School mutation, allocation mutation, credential logic change, or
hard delete was introduced. The Profile reality classifier tests pass 2/2 and
the final clean disposable state has zero unexplained structural gaps.

### E2E isolation recovery and remaining canonical blocker

The five previously reported failures in the communication, identity
credentials, and Teacher App suites were caused by running canonical evidence
after earlier fixture-writing evidence on the same disposable database. The
reproducible discriminator was database lifecycle, not a remaining collision
inside those three suites. Creating a new unique database and applying the
demo seed immediately before the combined runs removed the leaked prior-run
state. The three suites pass in both orders on one fresh database:

- communication, identity credentials, Teacher App: 3 suites, 15/15 tests;
- Teacher App, identity credentials, communication: 3 suites, 15/15 tests.

No retry, skip, sleep, weakened assertion, or global destructive fixture
cleanup was added.

The required canonical run nevertheless remains red for a separate,
baseline-identical root test. It passed 685 suites and 5101 tests, then
`test/app.e2e-spec.ts` failed its single test during `app.close()` because an
ioredis connection was already closed. The root test, `BullmqService`, and
`AppModule` are byte-for-byte unchanged from `origin/main`, and none is inside
the authorized correction allowlist. The disposable database was dropped and
residue was zero. A second canonical run was not used as a retry to erase this
failure. Per the closeout hard stop, this unrelated regression keeps the final
repository status `BLOCKED`.

### Final validation and safety gate

- Migration governance: 39/39 passed.
- Migration structure: `active=5`, `new=1`, `rebaseline=off`.
- Prisma validate: passed.
- Prisma generate: passed.
- Build: passed.
- Upgrade rehearsal: passed; second deploy was a no-op.
- Fresh empty replay: passed; second deploy was a no-op.
- Direct/focused database tests: 3 suites, 23/23 tests.
- Transfer coordinator tests: 27/27 tests.
- Combined E2E order runs: 15/15 and 15/15.
- Canonical regression run 1: failed, 685/686 suites and 5101/5102 tests.
- Canonical regression run 2: not run after the unresolved hard stop.
- All 23 task-created disposable databases were dropped; final residue is
  zero.
- Persistent development and shared/live database writes: zero.
- Staged files: zero.

Final result: the Membership constraint correction and the affected Teacher
lifecycle paths pass, but `SCHOOL-TEACHER-DIRECTORY-1B-7` remains `BLOCKED`
because the canonical regression is not green. Target deployment remains
`NOT PROVEN`. No 1C, 1D, or 1E authorization is granted.

## 27. 1B-7C BullMQ shared Redis shutdown race correction

This section preserves and supersedes the second historical blocker recorded
above. The root failure was reproduced before correction by running the real
`AppModule`: the request passed, but `test/app.e2e-spec.ts` failed from its
real `app.close()` with ioredis `Connection is closed.`. The shutdown owner was
`BullmqService.shutdown()` in
`src/infrastructure/queue/bullmq.service.ts`, specifically the awaited
`this.connection.quit()` for the service-owned shared Redis connection after
BullMQ worker and queue shutdown.

The race was:

1. central BullMQ shutdown began and the shared connection status was active;
2. worker and queue lifecycle completion closed the underlying connection;
3. the already-selected shared `quit()` path rejected with a recognized
   connection-closure error;
4. the completed shutdown was exposed as an `app.close()` failure.

The root test was not changed. It continues to initialize the real
`AppModule`, assert the real HTTP result, and await the real `app.close()`.
`QueueModule`, package scripts, Redis configuration, worker ownership, queue
ownership, and retry behavior were also unchanged.

### Narrow production behavior

`BullmqService.shutdown()` now calls one private
`closeSharedConnection()` operation before awaiting tracked shared-stream
settlement. The operation retains the existing active-status decision:

- `ready`, `connect`, or `reconnecting` calls `quit()` exactly once;
- other statuses call `disconnect()` exactly once.

Only an error classified by the existing shutdown classifier is suppressed,
and only while central shutdown is active for this owned shared connection.
The accepted closure forms remain the exact message `Connection is closed.`
or the existing socket codes `ECONNABORTED`, `ECONNREFUSED`, `ECONNRESET`, and
`EPIPE`. No generic catch, retry, delay, forced worker close, new client, or
second connection owner was added. An unexpected shared `quit()` error is
re-thrown unchanged, and every later `onModuleDestroy()` call returns the same
rejected single-flight shutdown promise.

### Deterministic and real shutdown evidence

The BullMQ lifecycle suite passes 13/13. Its three new cases prove:

- a `ready` connection whose `quit()` moves to `end` and rejects with
  `Connection is closed.` resolves shutdown, closes each worker and queue once,
  calls `quit()` once, never calls `disconnect()` as a second owner, remains
  single-flight, and emits no expected-error log;
- an `EPIPE` rejection during owned shared shutdown resolves without logging;
- an unexpected `shared redis shutdown failed` rejection remains the original
  observable failure through the same cached shutdown promise.

Ten independent Jest processes then ran the unchanged root E2E. Runs 1 through
10 all passed, each exited naturally, all open-handle warning counts were zero,
and no owned Node/Jest process remained.

Two accepted canonical regressions used two different, newly created,
demo-seeded disposable databases:

- run 1: 686/686 suites and 5105/5105 tests passed; the final root family was
  1/1, the process exited naturally, and open-handle warnings were zero;
- run 2: 686/686 suites and 5105/5105 tests passed; the final root family was
  1/1, the process exited naturally, and open-handle warnings were zero.

An intervening second-run execution lost its evidence channel during task
steering. It had no recorded failure, was not counted as a canonical result,
and its disposable database was absent before the accepted replacement run.
Across 1B-7C, three disposable databases were created, all three were dropped,
and final residue was zero. Persistent development and shared/live database
writes remained zero.

Final structural validation passed: migration governance 39/39, migration
structure `active=5` and `new=1`, Prisma validate, Prisma generate, build,
changed-production ESLint, exact changed-file Prettier write/check, and
`git diff --check`. The final index remains empty.

### Final 1B-7C changed-file inventory

The final changed set contains exactly 21 paths:

- `docs/database/migration-custom-sql-inventory.md`
- `docs/sprint-school-teacher-directory-1b-lifecycle-closeout.md`
- `prisma/migrations/20260720182221_membership_suspended_open_state/migration.sql`
- `src/infrastructure/queue/bullmq.service.ts`
- `src/infrastructure/queue/bullmq.service.spec.ts`
- `src/modules/organization-admin/teacher-transfers/application/transfer-teacher-between-schools.coordinator.ts`
- `src/modules/organization-admin/teacher-transfers/tests/transfer-teacher-between-schools.coordinator.spec.ts`
- `src/modules/settings/users/application/resend-invite.use-case.ts`
- `src/modules/settings/users/application/reset-password.use-case.ts`
- `src/modules/settings/users/application/teacher-settings-bypass.service.ts`
- `src/modules/settings/users/tests/teacher-legacy-settings-bypass.spec.ts`
- `src/modules/teachers/directory/domain/teacher-directory.errors.ts`
- `src/modules/teachers/lifecycle/application/teacher-lifecycle-transaction-error.ts`
- `test/e2e/communication-security-contract.e2e-spec.ts`
- `test/e2e/identity-credentials-email-final-closeout.e2e-spec.ts`
- `test/e2e/teacher-app-final-closeout.e2e-spec.ts`
- `test/integration/membership-ended-at-constraint.integration.spec.ts`
- `test/integration/teacher-lifecycle-closeout.integration.spec.ts`
- `test/integration/teacher-reality-classifier-closeout.integration.spec.ts`
- `test/security/tenancy.teacher-app.spec.ts`
- `test/security/tenancy.teacher-profiles.spec.ts`

Final 1B-7C result: the Membership correction, Teacher lifecycle closeout, and
BullMQ shutdown correction pass. Repository implementation status is
`COMPLETE`; target deployment remains separately `NOT PROVEN`. Completion does
not authorize commit, push, pull-request creation, 1C, 1D, or 1E.
