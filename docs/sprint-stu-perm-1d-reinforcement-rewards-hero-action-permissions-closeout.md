# STU-PERM-1D - Reinforcement / Rewards / Hero Action Permissions Closeout

## Sprint Name

STU-PERM-1D - Reinforcement / Rewards / Hero Action Permissions

## Baseline Commit

Expected baseline:

```text
5ec5a782 feat: enforce student homework exam permissions
```

Actual starting HEAD matched the expected baseline:

```text
5ec5a782 feat: enforce student homework exam permissions
```

## Files Changed

```text
src/modules/student-app/tasks/controller/student-tasks.controller.ts
src/modules/student-app/rewards/controller/student-rewards.controller.ts
src/modules/student-app/hero/controller/student-hero.controller.ts
test/security/tenancy.student-app.spec.ts
docs/sprint-stu-perm-1d-reinforcement-rewards-hero-action-permissions-closeout.md
```

No permission seeds, Prisma schema, migrations, common guards/decorators, Student App access/shared/application/infrastructure/presenter files, IAM files, Files module files, package files, or environment files were changed.

## Controllers Updated

Updated only the Student App controllers in this sprint scope:

```text
src/modules/student-app/tasks/controller/student-tasks.controller.ts
src/modules/student-app/rewards/controller/student-rewards.controller.ts
src/modules/student-app/hero/controller/student-hero.controller.ts
```

The changes add route permission metadata only. Controller method bodies, DTOs, response contracts, ownership checks, use cases, and persistence behavior were not changed.

## Task Action Permission Added

```text
POST /api/v1/student/tasks/:taskId/stages/:stageId/submit
handler: submitStage
permission: reinforcement.submissions.submit
```

Read-only task route decorators from STU-PERM-1B remain unchanged.

## Reward Action Permission Added

```text
POST /api/v1/student/rewards/:rewardId/redeem
handler: redeemReward
permission: reinforcement.rewards.redemptions.request
```

The route uses the narrow self-service redemption request permission. No broad reward management, redemption review, or fulfillment permission was added.

Read-only reward route decorators from STU-PERM-1B remain unchanged.

## Hero Action Permissions Added

```text
POST /api/v1/student/hero/missions/:missionId/start
handler: startMission
permission: reinforcement.hero.missions.start

POST /api/v1/student/hero/missions/:missionId/complete
handler: completeMission
permission: reinforcement.hero.missions.complete

POST /api/v1/student/hero/missions/:missionId/objectives/:objectiveId/complete
handler: completeObjective
permission: reinforcement.hero.objectives.complete
```

The sprint does not use `reinforcement.hero.progress.manage`. Hero action routes use narrow student self-service permissions.

Read-only Hero route decorators from STU-PERM-1B remain unchanged.

## Routes Intentionally Left For 1E

The following Student App action route categories were not changed in this sprint:

```text
profile avatar upload/delete
profile correction request create/cancel
conversation create
message send
conversation mark-read
announcement mark-read
notification mark-all-read
notification mark-read
notification archive
notification preferences update
device token register/unregister
```

Routes already covered by STU-PERM-1B and STU-PERM-1C were not modified.

## Tests Added/Updated

Updated:

```text
test/security/tenancy.student-app.spec.ts
```

Added a static metadata inventory for all 5 STU-PERM-1D handlers:

```text
submitStage -> reinforcement.submissions.submit
redeemReward -> reinforcement.rewards.redemptions.request
startMission -> reinforcement.hero.missions.start
completeMission -> reinforcement.hero.missions.complete
completeObjective -> reinforcement.hero.objectives.complete
```

Added runtime missing-permission coverage using the existing no-permission student role fixture:

```text
reinforcement.submissions.submit -> task stage submit returns 403 auth.scope.missing
reinforcement.rewards.redemptions.request -> reward redeem returns 403 auth.scope.missing
reinforcement.hero.missions.start -> Hero mission start returns 403 auth.scope.missing
reinforcement.hero.missions.complete -> Hero mission complete returns 403 auth.scope.missing
reinforcement.hero.objectives.complete -> Hero objective complete returns 403 auth.scope.missing
```

Existing Student App security/e2e coverage continues to prove normal seeded student happy paths and safe not-found behavior for hidden or cross-school task, reward, mission, and objective resources.

## Verification Commands And Results

```text
git status --short --untracked-files=all
```

Initial result: clean working tree.

```text
git log --oneline -10
```

Initial HEAD matched `5ec5a782 feat: enforce student homework exam permissions`.

```text
npx prisma validate
```

Result: passed. Prisma schema is valid.

```text
npm run build
```

Result: passed.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
```

Result: passed.

```text
Test Suites: 1 passed, 1 total
Tests:       30 passed, 30 total
Snapshots:   0 total
```

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts
```

Result: passed.

```text
Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
Snapshots:   0 total
```

Final git hygiene commands were run after this document was added.

## No-Leak / Behavior Preservation Notes

The sprint adds only `@RequiredPermissions()` metadata to task, reward, and Hero action handlers.

Permission checks remain additive:

```text
JwtAuthGuard authenticates the actor.
ScopeResolverGuard resolves active school membership and membership permissions.
PermissionsGuard now enforces task/reward/Hero action permissions on decorated handlers.
StudentAppAccessService still resolves the linked student and active enrollment.
Task/reward/Hero use cases still enforce ownership, visibility, school scope, status constraints, point balance, mission availability, objective membership, and safe not-found behavior.
```

No presenters, DTOs, use cases, repositories, response contracts, file flows, or no-leak response shapes were changed. This sprint does not expose storage bucket names, object keys, raw signed URLs, actor internals, membership IDs, role IDs, deleted fields, password hashes, tenant internals, reward review/admin internals, or Hero progress internals.

## Known Follow-Up Sprints

```text
STU-PERM-1E - Communication / Notifications / Profile Action Permissions
STU-PERM-1F - Final Security Closeout + Regression Audit
```

## Final Verdict

```text
READY FOR REVIEW
```
