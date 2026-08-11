# Storage Cutover release decision — GitHub CI runtime deferral

## Document control

| Field                     | Value                                                  |
| ------------------------- | ------------------------------------------------------ |
| Record type               | Storage Cutover release-governance decision            |
| Record status             | `ACTIVE_DEFERRED_RUNTIME_VALIDATION`                   |
| Repository                | `Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend` |
| Branch                    | `feat/storage-gcs-cutover`                             |
| Pull request              | `#66`                                                  |
| Storage source checkpoint | `648af406a1e9ba1f36493df2e9abe67d6189d0a7`             |
| CI architecture rebuild   | `e49aacdb22986916ec83ca55008597883d4b4fbd`             |
| GitHub Actions run        | `31480247411`                                          |
| Approver                  | Abdallah                                               |
| Approval date             | 2026-08-11                                             |
| Timezone                  | Africa/Cairo                                           |
| Exact approval time       | Not recorded; no timestamp is claimed                  |

## Owner decision

Abdallah explicitly decided to continue the Storage Cutover release using the
already-established manual/local verification evidence while GitHub-hosted
Actions runtime validation is unavailable. The Owner does not intend to renew
or increase GitHub Actions capacity at this time.

```text
approval_date=2026-08-11
timezone=Africa/Cairo
approver=Abdallah

GITHUB_CI_RUNTIME_VALIDATION=DEFERRED_NON_BLOCKING_OWNER_DECISION
GITHUB_CI_RUNTIME_DEFERRAL_REASON=GITHUB_ACTIONS_BILLING_LIMIT_EXHAUSTED
MANUAL_RELEASE_VERIFICATION_REQUIRED=YES
```

This decision is a reopenable release-governance deferral. It is not a test
waiver, a CI pass, a product acceptance, or authorization for production data.

## GitHub runtime evidence

The first real GitHub Actions runtime attempt for CI rebuild commit
`e49aacdb22986916ec83ca55008597883d4b4fbd` was:

```text
run_id=31480247411
workflow=CI
event=pull_request
PR=66

steps=[]
runner_id=0
runner_name=""
```

GitHub annotated the job:

> The job was not started because recent account payments have failed or your
> spending limit needs to be increased.

No runner was allocated. No checkout, Node setup, planner, preflight, test,
regression shard, or cleanup stage executed. The run is classified only as:

```text
GITHUB_CI_RUN_RESULT=BLOCKED_BY_BILLING_BEFORE_RUNNER_ALLOCATION
```

It is not classified as a product, test, orchestrator, workflow, or flake
failure because none of those surfaces executed.

## Source review and runtime validation remain distinct

```text
CI_ARCHITECTURE_SOURCE_REVIEW=PASS

GITHUB_CI_RUNTIME_VALIDATION=DEFERRED_NON_BLOCKING_OWNER_DECISION
GITHUB_CI_RUNTIME_PASS=NOT_CLAIMED

GITHUB_CI_RUNTIME_FAILURE_CAUSED_BY_PRODUCT=NO
GITHUB_CI_RUNTIME_FAILURE_CAUSED_BY_TESTS=NO
GITHUB_CI_RUNTIME_FAILURE_CAUSED_BY_WORKFLOW=NOT_PROVEN
```

The final Storage Batch 3 source candidate checkpoint
`648af406a1e9ba1f36493df2e9abe67d6189d0a7` had already passed its final
Universal Regression with this evidence:

```text
87 PASS
0 FAIL
0 BLOCKED

784/784 Jest suites
6263/6263 Jest tests
69/69 TAP tests
6332 total observed tests

cleanup=PASS
source_drift=NO
```

That Universal Regression belongs only to source checkpoint
`648af406a1e9ba1f36493df2e9abe67d6189d0a7`. It did not run on the later CI
architecture rebuild `e49aacdb22986916ec83ca55008597883d4b4fbd`; the two
SHAs and their evidence must remain distinguishable.

## Locked release state

The GitHub runtime deferral does not complete the Storage Cutover and does not
permit production use:

```text
STORAGE_CUTOVER_READY_FOR_REAL_DATA=NO
REAL_DATA=FORBIDDEN

PRODUCTION_UPLOADS_ALLOWED=NO
PRODUCTION_TRAFFIC_ALLOWED=NO
PRODUCTION_LAUNCH_AUTHORIZED=NO
```

The mandatory release sequence remains:

```text
merge PR #66
→ production read-only provider-URL audit
→ deploy exact merged source
→ production smoke verification
→ Owner final storage-cutover acceptance
```

Only after every step succeeds and the Owner records final storage-cutover
acceptance may readiness for real data be reconsidered.

## Reopen condition

The deferred GitHub runtime validation remains open. When GitHub Actions
capacity becomes available, PR #66 or the exact applicable merged candidate
must receive a real runner-backed validation, and its result must be recorded
without rewriting this billing-blocked attempt. Until that evidence exists,
the runtime pass remains unclaimed and manual release verification remains
mandatory.
