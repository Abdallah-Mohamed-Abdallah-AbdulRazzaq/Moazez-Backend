# Governed runtime release control

`runtime-release-control.cjs` translates the unchanged authoritative contract
at `config/deployment/release-sequence.contract.json` into deterministic
Terraform operation specifications and records later governance evidence.

It is staging-only. It never invokes Terraform, Google Cloud, a database, or a
smoke request. In particular, `record-apply` records evidence for an apply that
was separately authorized and executed; it does not perform an apply.

## Normal manifest v1 release context

Prepare a JSON context outside the source repository with this shape. Values
shown in angle brackets must come from governed live discovery or owner
evidence. Do not put Redis CA payloads, tokens, credentials, or other secrets
in this file. Normal construction omits `executionMode`, produces
`manifestVersion=1`, and retains the existing Core-first sequence.

```json
{
  "executionId": "day2-staging-<unique-id>",
  "repository": "Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend",
  "sourceSha": "<exact-40-character-HEAD>",
  "environment": "staging",
  "candidateImageReference": "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:<64-lowercase-hex>",
  "candidateTag": "candidate-<first-12-hex-of-sha256-of-the-full-image-reference>",
  "externalTfDataRoot": "<absolute-external-tfdata-root>",
  "externalSavedPlanRoot": "<absolute-external-saved-plan-root>",
  "completedPredecessorStages": [
    {
      "id": "artifact-and-checksum-preflight",
      "status": "passed",
      "evidenceRef": "<evidence-reference>"
    },
    {
      "id": "backup-and-data-authority-checkpoint",
      "status": "passed",
      "evidenceRef": "<evidence-reference>"
    },
    {
      "id": "migration-job",
      "status": "passed",
      "evidenceRef": "<evidence-reference>"
    },
    {
      "id": "migration-status-and-drift-verification",
      "status": "passed",
      "evidenceRef": "<evidence-reference>"
    }
  ],
  "liveDiscovery": {
    "evidenceRef": "<live-discovery-evidence-reference>",
    "discoveredAt": "<ISO-8601-UTC-timestamp>",
    "apiTrafficMode": "normal",
    "stableApiRevision": "moazez-staging-api-<verified-live-revision-suffix>",
    "runtimeImages": {
      "api": "<current-staging-image-by-digest>",
      "coreWorker": "<current-staging-image-by-digest>",
      "mediaWorker": "<current-staging-image-by-digest>",
      "maintenanceScheduler": "<current-staging-image-by-digest>"
    },
    "runtimeState": {
      "lineage": "<opaque-runtime-state-lineage>",
      "serial": 0
    },
    "edgeState": {
      "lineage": "<opaque-edge-state-lineage>",
      "serial": 0
    }
  }
}
```

Terraform state lineage is treated as an opaque exact identity token. The
deployment controller does not interpret UUID version or variant semantics.
Lineage is preserved exactly and compared for exact equality, without
normalization or mutation. State serial remains a non-negative safe integer
and must increase after a successful apply.

The tag formula is exact:

```text
candidate-${sha256(full api image reference)[0:12]}
```

The expected revision is:

```text
moazez-staging-api-${candidateTag}
```

The stable revision must be the full revision discovered from the live
`moazez-staging-api` service, not a source default or guessed value.

## Recovery manifest v2 context

Recovery is an explicit, separately authorized execution. Set
`executionMode="recovery"`; use a new `executionId` that differs from the
failed release execution ID; and set
`resumeGateId="api-no-traffic-promotion"`. Recovery input is strict and must
not contain an operator-supplied top-level `candidateTag`. The controller
derives the identity from the immutable image and attempt.

The exact recovery metadata object is:

```json
{
  "recoveryAttempt": 1,
  "failedReleaseExecutionId": "<failed-execution-id>",
  "failedManifestRef": "<durable-failed-manifest-reference>",
  "failedGateId": "api-no-traffic-promotion",
  "failedOperationId": "api-candidate-runtime",
  "failedPlanSha256": "<exact-64-character-lowercase-sha256>",
  "failureEvidenceRef": "<durable-failure-evidence-reference>"
}
```

`recoveryAttempt` is a safe integer from `1` through `999999999999999`.
Given base tag `candidate-${sha256(full image reference)[0:12]}`, attempt `N`
derives `${baseTag}-rN` and revision
`moazez-staging-api-${baseTag}-rN`. The controller does not accept timestamps,
UUIDs, numeric strings, leading-zero ordinals, or arbitrary discriminators.

Recovery predecessor evidence contains these six exact ordered passed records,
each with a non-empty durable `evidenceRef`:

```text
artifact-and-checksum-preflight
backup-and-data-authority-checkpoint
migration-job
migration-status-and-drift-verification
core-worker-promotion
media-worker-promotion
```

Core and Media are historical predecessor evidence in v2. They are not mutable
recovery gates and have no Terraform operation objects. The four v2 gates are
API Runtime then API Edge, Maintenance Scheduler, protected smoke, and traffic
promotion.

The strict recovery `liveDiscovery` records:

- `apiTrafficMode="failed_zero_traffic_candidate"`, the stable revision at
  exactly 100%, and the failed candidate image/tag/revision at exactly 0%;
- exact API, Core Worker, Media Worker, and Maintenance Scheduler images;
- independently discovered runtime and edge lineage/serial values;
- absence of the candidate NEG, backend, and smoke route;
- a `complete-base-family` revision inventory for service
  `moazez-staging-api` and the exact image-derived base tag.

Every inventory entry requires `revision` and `imageReference`. A live `tag`
is optional because preserved Cloud Run revisions need not remain traffic-tagged.
Duplicate revisions, different-image family entries, or omission of the failed
revision are rejected. The attempt must equal the maximum existing family
ordinal plus one, and its derived revision must not already exist.

The API, Core Worker, and Media Worker live images must already equal the
approved immutable candidate image. Recovery API variables retain that image;
Maintenance keeps its discovered pre-promotion image. The recovery API
operation binds directly to the discovered runtime state. API Edge binds
directly to the independently discovered edge state. Maintenance binds to the
verified API Runtime successor state, and traffic promotion binds to the
verified Maintenance successor state.

The recovery API resource allowlist is exactly:

```text
template[0].revision
traffic
template[0].containers[0].startup_probe[0].initial_delay_seconds
template[0].containers[0].startup_probe[0].period_seconds
template[0].containers[0].startup_probe[0].timeout_seconds
template[0].containers[0].startup_probe[0].failure_threshold
```

It intentionally excludes `template[0].containers[0].image` and all broad
container/template/probe paths. Normal v1 retains its existing API image
permission for the initial promotion. Recovery never deletes the failed
revision and never automatically creates a later attempt after failure.

## External artifact convention

A recommended root convention is:

```text
TF data root:    %LOCALAPPDATA%\Moazez\tfdata\day2-d1
Saved-plan root: %LOCALAPPDATA%\Moazez\plans\day2-d1
Manifest:        %LOCALAPPDATA%\Moazez\release-control\day2-d1\<execution-id>.json
```

For each operation the adapter deterministically expands these roots to:

```text
TF_DATA_DIR=
<tfdata-root>\<execution-id>\staging\<backend-runtime|edge>

SAVED_PLAN=
<saved-plan-root>\staging\<backend-runtime|edge>\<execution-id>\<gate-and-operation>.tfplan
```

All paths are rejected unless absolute and outside the repository. The
historical saved-plan SHA256
`ccc0473c853e0ea2a47e8cb6700acf3a80a454907130ce9992049e7d7ded43e7`
is permanently rejected, as is any duplicate plan hash in one manifest.
Normal v1 contains that one blocker. Recovery v2 additionally requires the
exact full lowercase SHA256 of the failed plan from DevOps evidence and places
both hashes in `blockedSavedPlanHashes`. Prefix-only evidence such as
`19cc9769...` is invalid and is never completed or hard-coded by source. Plan
registration checks the manifest blocklist.

## Exact CLI surface

Run commands from the repository root. These commands create or update only an
external JSON manifest; none executes Terraform or sends a request.

Create the deterministic operation specification:

```powershell
node scripts/deployment-control/runtime-release-control.cjs create-spec --input <external-context.json> --output <external-manifest.json>
```

Revalidate source, contract, immutable operation fields, external paths, and
lifecycle consistency:

```powershell
node scripts/deployment-control/runtime-release-control.cjs validate-spec --manifest <external-manifest.json>
```

After a separately created saved plan has been reviewed against the operation's
address and attribute allowlists, bind its actual bytes and state precondition:

```powershell
node scripts/deployment-control/runtime-release-control.cjs register-plan --manifest <external-manifest.json> --gate <gate-id> --operation <operation-id> --recorded-at <ISO-UTC> --plan <exact-external.tfplan> --source-sha <exact-source-sha> --environment staging --terraform-root <repository-relative-root> --lineage <pre-plan-lineage> --serial <pre-plan-serial>
```

Record the independent approval:

```powershell
node scripts/deployment-control/runtime-release-control.cjs approve-plan --manifest <external-manifest.json> --gate <gate-id> --operation <operation-id> --recorded-at <ISO-UTC> --approver <identity> --approval-ref <evidence-reference>
```

Record one successful apply attempt and its successor state. This command is
record-only:

```powershell
node scripts/deployment-control/runtime-release-control.cjs record-apply --manifest <external-manifest.json> --gate <gate-id> --operation <operation-id> --recorded-at <ISO-UTC> --result succeeded --evidence-ref <apply-evidence> --post-lineage <lineage> --post-serial <increased-serial>
```

Record a failed apply attempt without successor state:

```powershell
node scripts/deployment-control/runtime-release-control.cjs record-apply --manifest <external-manifest.json> --gate <gate-id> --operation <operation-id> --recorded-at <ISO-UTC> --result failed --evidence-ref <failure-evidence>
```

Record live verification. Supply precisely the observations declared by the
operation's `verificationExpectation`:

```powershell
node scripts/deployment-control/runtime-release-control.cjs record-verification --manifest <external-manifest.json> --gate <gate-id> --operation <operation-id> --recorded-at <ISO-UTC> --result passed --evidence-ref <verification-evidence> [--observed-image <digest-reference>] [--observed-revision <revision>] [--observed-candidate-tag <tag>] [--observed-public-path <path>] [--observed-backend-path <path>] [--observed-stable-percent <0-100>] [--observed-candidate-percent <0-100>] [--http-status <100-599>]
```

For a failed verification, use `--result failed` and return sanitized observed
values where available. The first failed apply or verification consumes or
invalidates the applicable plan, fails its gate, blocks later suboperations and
gates, and permits no automatic retry.

## Plan review boundary

The adapter produces the exact `requiredVariables`, Terraform root, state
lineage/serial precondition, resource-address allowlist, allowed attribute
changes, expected change type, and saved-plan path for each Terraform
operation. DevOps must create the plan separately with the manifest's external
`TF_DATA_DIR`, inspect the plan JSON/text, and reject any address or attribute
outside those allowlists before `register-plan` and `approve-plan`.

Sensitive Queue and Realtime Redis inputs remain ephemeral operator inputs.
The manifest contains their names and sensitivity flags only, never their
values.

Run the source-level adapter tests with:

```powershell
node --test scripts/deployment-control/tests/runtime-release-control.test.cjs
```
