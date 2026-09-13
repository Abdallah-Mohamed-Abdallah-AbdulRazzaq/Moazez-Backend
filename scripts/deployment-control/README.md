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

The example above is the unchanged `normal` starting baseline. Its
`liveDiscovery.stableApiRevision` is required, and `promotedBaseline` must be
absent.

A later normal v1 release may instead begin from the successful promoted
end-state of the preceding release. Keep the surrounding context unchanged and
use this exact `liveDiscovery` variant:

```json
{
  "evidenceRef": "<live-discovery-evidence-reference>",
  "discoveredAt": "<ISO-8601-UTC-timestamp>",
  "apiTrafficMode": "candidate_promoted",
  "promotedBaseline": {
    "previousStableRevision": "moazez-staging-api-<previous-stable-revision-suffix>",
    "previousStableTrafficPercent": 0,
    "promotedRevision": "moazez-staging-api-<currently-promoted-revision-suffix>",
    "promotedTrafficPercent": 100,
    "promotedCandidateTag": "candidate-<12-lowercase-hex>[-rN]",
    "promotedImageReference": "<current-promoted-staging-image-by-digest>"
  },
  "runtimeImages": {
    "api": "<same-current-promoted-staging-image-by-digest>",
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
  },
  "candidateEdgeResources": {
    "candidateNegPresent": false,
    "candidateBackendPresent": false,
    "candidateSmokeRoutePresent": false
  }
}
```

The emitted normal-v1 live-discovery shapes are mode-discriminated and exact.
`apiTrafficMode` may be only `normal` or `candidate_promoted` at construction;
`candidate_no_traffic` is an in-release state, not a permitted starting
baseline. Existing `normal` input compatibility is unchanged, while the
promoted input requires the exact `promotedBaseline` shape above and omits the
top-level `stableApiRevision`. Extra, missing, or contradictory promoted fields
are rejected.

For a promoted baseline, `previousStableRevision`, `promotedRevision`, and the
new candidate revision must be distinct full revision names for
`moazez-staging-api`, and the two traffic percentages must be the numeric values
`0` and `100` shown above. `promotedRevision` must equal
`moazez-staging-api-${promotedCandidateTag}`. The promoted tag must be derived
from `promotedImageReference`; it may be the image-derived base tag or that
base followed by a canonical `-rN` recovery suffix, where `N` is from `1`
through `999999999999999`. The promoted image must equal
`runtimeImages.api` and must differ from the new `candidateImageReference`.
The previous promoted tag/revision and the new release candidate tag/revision
must also be distinct. These checks prevent a prior promoted candidate from
being reused as, or conflated with, the new candidate.

Promoted-baseline construction now requires the exact
`candidateEdgeResources` preflight shown above. Missing evidence, a complete
retained Candidate Edge, or any partial combination of NEG, backend, and smoke
route stops construction before Core, Media, or API can change. The controller
does not clean up or reconcile these resources automatically. Cleanup remains
a separately reviewed and approved operation.

The controller maps a valid promoted start to these exact API inputs while
retaining the authoritative gate order:

| Operation window                  | `api_image_reference`         | `api_traffic_mode`     | `api_stable_revision`                     | `api_candidate_tag`                     |
| --------------------------------- | ----------------------------- | ---------------------- | ----------------------------------------- | --------------------------------------- |
| Core and Media promotion          | `runtimeImages.api`           | `candidate_promoted`   | `promotedBaseline.previousStableRevision` | `promotedBaseline.promotedCandidateTag` |
| New API candidate at zero traffic | New `candidateImageReference` | `candidate_no_traffic` | `promotedBaseline.promotedRevision`       | New image-derived `candidateTag`        |
| Maintenance promotion             | New `candidateImageReference` | `candidate_no_traffic` | `promotedBaseline.promotedRevision`       | New image-derived `candidateTag`        |
| Final traffic promotion           | New `candidateImageReference` | `candidate_promoted`   | `promotedBaseline.promotedRevision`       | New image-derived `candidateTag`        |

Core and Media therefore preserve the exact existing API traffic tuple and
must produce no API resource change. At the new API candidate operation, the
currently serving promoted revision becomes the stable revision at `100%`, and
the new candidate begins at `0%`. The older previous-stable `0%` traffic target
may leave the explicit traffic list at that operation; this is a governed
`traffic` update, not revision deletion. The edge operation uses only the new
candidate tag.

Terraform state lineage is treated as an opaque exact identity token. The
deployment controller does not interpret UUID version or variant semantics.
Lineage is preserved exactly and compared for exact equality, without
normalization or mutation. State serial remains a non-negative safe integer
and must increase after a successful apply.

The new normal-v1 candidate tag formula is exact:

```text
candidate-${sha256(full api image reference)[0:12]}
```

The expected revision is:

```text
moazez-staging-api-${candidateTag}
```

For a `normal` start, `stableApiRevision` must be the full revision discovered
from the live `moazez-staging-api` service. For a `candidate_promoted` start,
both `previousStableRevision` and `promotedRevision` must come from the exact
live traffic tuple. None of these identities may be a source default, guessed
value, or stale evidence.

A successful `candidate_promoted` starting baseline remains a normal manifest
v1 execution with the full Core-first sequence. It is not Recovery v2.

## Successful Candidate Edge continuation manifest v3

`manifestVersion=3` and
`executionMode="successful-edge-continuation"` are reserved for a successful
in-progress normal-v1 release whose Core, Media, and API Runtime operations
already passed, while `api-candidate-edge` is still pending because a complete
Candidate Edge from the preceding release targets the preceding promoted tag.
This is a new execution and source binding. It is neither a mutation of the
old manifest nor failed-runtime Recovery v2.

The strict external construction context has this shape:

```json
{
  "executionMode": "successful-edge-continuation",
  "executionId": "day2-staging-<new-unique-continuation-id>",
  "repository": "Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend",
  "sourceSha": "<exact-new-40-character-HEAD>",
  "environment": "staging",
  "resumeGateId": "api-no-traffic-promotion",
  "resumeOperationId": "api-candidate-edge-reconciliation",
  "continuation": {
    "previousReleaseExecutionId": "<exact-predecessor-execution-id>",
    "previousManifestRef": "<absolute-path-to-the-immutable-external-predecessor-manifest>",
    "previousManifestSha256": "<exact-64-lowercase-hex-SHA256-of-those-file-bytes>",
    "previousSourceSha": "<exact-predecessor-40-character-source-SHA>"
  },
  "liveDiscovery": {
    "evidenceRef": "<fresh-live-discovery-evidence-reference>",
    "discoveredAt": "<ISO-8601-UTC-timestamp>",
    "apiTrafficMode": "candidate_no_traffic",
    "servingBaseline": {
      "revision": "moazez-staging-api-<previous-promoted-revision-suffix>",
      "candidateTag": "candidate-<previous-12-lowercase-hex>[-rN]",
      "imageReference": "<previous-promoted-image-by-digest>",
      "trafficPercent": 100
    },
    "candidate": {
      "imageReference": "<unchanged-current-candidate-image-by-digest>",
      "tag": "candidate-<current-12-lowercase-hex>",
      "revision": "moazez-staging-api-candidate-<current-12-lowercase-hex>",
      "trafficPercent": 0,
      "ready": true
    },
    "runtimeImages": {
      "api": "<same-current-candidate-image-by-digest>",
      "coreWorker": "<same-current-candidate-image-by-digest>",
      "mediaWorker": "<same-current-candidate-image-by-digest>",
      "maintenanceScheduler": "<unchanged-predecessor-maintenance-image-by-digest>"
    },
    "runtimeState": {
      "lineage": "<exact-current-runtime-lineage>",
      "serial": 0
    },
    "edgeState": {
      "lineage": "<exact-current-edge-lineage>",
      "serial": 0
    },
    "candidateEdgeResources": {
      "completeness": "complete",
      "neg": {
        "present": true,
        "name": "moazez-staging-api-candidate-neg",
        "region": "me-central2",
        "networkEndpointType": "SERVERLESS",
        "cloudRunService": "moazez-staging-api",
        "cloudRunTag": "candidate-<previous-12-lowercase-hex>[-rN]"
      },
      "backend": {
        "present": true,
        "name": "moazez-staging-api-candidate-backend",
        "negName": "moazez-staging-api-candidate-neg",
        "protocol": "HTTP",
        "loadBalancingScheme": "EXTERNAL_MANAGED",
        "securityPolicyMatchesPrimaryApi": true,
        "customRequestHeaders": ["X-Moazez-Client-IP:{client_ip_address}"]
      },
      "smokeRoute": {
        "present": true,
        "urlMapName": "moazez-staging-edge-url-map",
        "publicPath": "/.well-known/moazez/candidate-readiness",
        "backendName": "moazez-staging-api-candidate-backend",
        "backendPath": "/api/v1/auth/me"
      }
    }
  },
  "externalTfDataRoot": "<absolute-external-tfdata-root>",
  "externalSavedPlanRoot": "<absolute-external-saved-plan-root>"
}
```

At construction and every later manifest update, the controller reads the
referenced predecessor manifest, hashes its exact bytes, and requires the hash,
execution ID, and previous source SHA above. The previous and new execution IDs
and source SHAs must differ. The predecessor itself must remain a valid normal
v1 promoted-baseline manifest in this exact lifecycle state:

- `core-worker-runtime`, `media-worker-runtime`, and
  `api-candidate-runtime` are passed with registered reviewed plans, approval,
  successful apply evidence, same-lineage successor state, and passed live
  verification;
- API Runtime verification names the immutable candidate image, tag, revision,
  stable traffic `100`, and candidate traffic `0`;
- `api-candidate-edge` is untouched and pending;
- Maintenance, protected smoke, and traffic promotion are pending; and
- the predecessor release is active and has no failure.

The v3 manifest imports immutable evidence snapshots for the three passed
operations and the first six contract stages. Their plan hashes are placed in
the new manifest blocklist. They are evidence only: v3 contains no Core, Media,
or API Runtime operation that could replay them. A predecessor manifest whose
release-contract hash differs only because the same JSON text was checked out
with LF versus CRLF is accepted for import; its own manifest SHA256 still must
match its exact original bytes, and every semantic contract field remains
strictly validated. Recorded `absoluteTerraformRoot` values may name the
predecessor checkout rather than the current worktree only when every value
ends in its exact governed `terraformRoot` and every Terraform operation shares
one checkout root. Only the validation copy is rebased to the current checkout;
the imported evidence snapshot retains the predecessor value.

Fresh live discovery is independently cross-bound to the predecessor:

- the current candidate must be Ready, immutable, and exactly `0%`;
- the previous promoted revision/tag/image must remain exactly `100%`;
- API, Core, and Media images must equal the current candidate, while
  Maintenance retains its previous image;
- current Runtime lineage/serial must equal the successful API Runtime
  post-apply state;
- current Edge lineage/serial must equal the still-pending predecessor Edge
  precondition; and
- Candidate Edge must be complete, target the previous promoted tag, reuse the
  normal API Cloud Armor/trusted-client-IP posture, and expose only the exact
  existing smoke route. Partial or contradictory evidence fails closed.

The first and only v3 Edge operation is
`api-candidate-edge-reconciliation`. Its plan contract is exact:

| Resource                                                                                | Actions         | Semantic attributes | Provider-computed after apply |
| --------------------------------------------------------------------------------------- | --------------- | ------------------- | ----------------------------- |
| `module.edge_environment.google_compute_region_network_endpoint_group.api_candidate[0]` | `delete,create` | `cloud_run[0].tag`  | `id`, `self_link`             |
| `module.edge_environment.google_compute_backend_service.api_candidate[0]`               | `update`        | `backend[0].group`  | `fingerprint`                 |

The URL map is not in the resource allowlist because its existing path and
rewrite must remain semantically unchanged. DNS, addresses, certificates,
HTTPS proxies, forwarding rules, Cloud Armor, trusted client-IP headers,
Cloud Run ingress, unrelated backend/NEG attributes, and Production are never
permitted by this contract.

The unresolved order remains the authoritative order:

```text
Candidate Edge reconciliation
-> Maintenance Scheduler Promotion
-> Protected Candidate Readiness / Smoke
-> Traffic Promotion
```

Edge reconciliation binds directly to the freshly discovered Edge state and
must return the same lineage with a higher serial. That Edge successor is not
used as Runtime state. Maintenance binds directly to the freshly discovered
Runtime state imported from the passed API Runtime operation. Traffic promotion
then binds to the verified Maintenance Runtime successor. This keeps Runtime
and Edge state authorities separate and deterministic.

Do not hand-edit the predecessor or continuation manifest, replay a passed
operation, manufacture failure evidence, use Recovery v2, or apply the cleanup
plan to create a new Edge serial before v3 binds its state. The cleanup template
remains non-authoritative and requires separate post-release approval.

## Recovery manifest v2 context

Recovery is an explicit, separately authorized execution. Set
`executionMode="recovery"`; use a new `executionId` that differs from the
failed release execution ID; and set
`resumeGateId="api-no-traffic-promotion"`. Recovery input is strict and must
not contain an operator-supplied top-level `candidateTag`. The controller
derives the identity from the immutable image and attempt.

The promoted-baseline extension does not change this schema or its API-first
window. Recovery remains limited to an explicitly failed zero-traffic
candidate and must not be used for a successfully promoted baseline.

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
registration checks the manifest blocklist. Successful-continuation v3 also
blocklists the three exact predecessor plan hashes imported for Core, Media,
and API Runtime so passed work cannot be reused as a new operation.

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
lineage/serial precondition, resource-address allowlist, expected resource
actions where applicable, semantic attribute allowlist, provider-computed
after-apply allowlist where applicable, expected change type, and saved-plan
path for each Terraform operation. DevOps must create the plan separately with
the manifest's external `TF_DATA_DIR`, inspect the plan JSON/text, and reject
any action, address, semantic attribute, or computed-unknown attribute outside
those allowlists before `register-plan` and `approve-plan`.

Sensitive Queue and Realtime Redis inputs remain ephemeral operator inputs.
The manifest contains their names and sensitivity flags only, never their
values.

Run the source-level adapter tests with:

```powershell
node --test scripts/deployment-control/tests/runtime-release-control.test.cjs
```
