# Day-2 D1 runtime release orchestration — DevOps handoff

## Authority and boundary

This handoff resumes the existing Day-2 Staging release contract without
reopening D0 architecture. The historical D1 application artifact digest was:

```text
sha256:1a6b5f41a4dfbb4921a11fe60ccb7d46d89397353dad9aebfcb0df71017986c6
```

That digest is historical release evidence, not a reusable default for a later
candidate. Each new normal v1 context supplies its separately approved
immutable candidate image reference.

No application rebuild, Prisma/schema change, migration, database mutation,
Staging mutation, Production mutation, live Terraform plan, or Terraform apply
was performed by D1, the promoted-baseline remediation, or the successful Edge
continuation remediation. The authoritative release contract, Terraform
runtime semantics, and gate order are unchanged. Deployment control supports
both a normal-v1 promoted baseline and a separate source-bound v3 continuation
for an already passed API Runtime with unresolved retained Candidate Edge.

Use the exact source SHA from the merged and approved deployment-control
source, not a pre-remediation or remembered SHA, when a later release manifest
and saved plans are created.

## Terraform roots

| Purpose                 | Repository-relative root                                 | State prefix                      |
| ----------------------- | -------------------------------------------------------- | --------------------------------- |
| Staging backend runtime | `infra/gcp/backend-runtime/environments/nonprod/runtime` | `backend-runtime/staging/runtime` |
| Staging edge            | `infra/gcp/edge/environments/nonprod`                    | `edge/staging`                    |

The runtime root still owns the same four resource addresses:

```text
module.runtime_environment.google_cloud_run_v2_service.api
module.runtime_environment.google_cloud_run_v2_worker_pool.core
module.runtime_environment.google_cloud_run_v2_worker_pool.media
module.runtime_environment.google_cloud_run_v2_worker_pool.maintenance_scheduler
```

No runtime state/root split was introduced.

## Runtime variables

The old shared runtime image input no longer exists. Supply all four explicit
immutable references on every runtime plan:

```text
api_image_reference
core_worker_image_reference
media_worker_image_reference
maintenance_scheduler_image_reference
```

Each Staging value must match exactly:

```text
me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:<64 lowercase hex>
```

Each Production value is independently restricted to the existing Production
repository. There is no implicit fallback capable of changing every runtime.

The Staging runtime root also continues to require ephemeral Queue and Realtime
Redis host, port, and CA PEM inputs. The CA values are sensitive and must never
be placed in the release manifest.

The API startup probe now has an explicit initialization budget while retaining
the existing management endpoint:

```text
path=/internal/probes/api/startup
port=9090
initial_delay_seconds=10
period_seconds=5
timeout_seconds=2
failure_threshold=12
```

API liveness/readiness and all worker probes are unchanged.

## Normal manifest v1 API traffic contract

Supply these three API release inputs:

```text
api_traffic_mode
api_stable_revision
api_candidate_tag
```

| Mode                   | Stable revision | Candidate tag | Stable normal traffic | Candidate normal traffic |
| ---------------------- | --------------- | ------------- | --------------------- | ------------------------ |
| `normal`               | `null`          | `null`        | Existing behavior     | No explicit candidate    |
| `candidate_no_traffic` | Required        | Required      | 100%                  | 0%                       |
| `candidate_promoted`   | Same value      | Same value    | 0%                    | 100%                     |

These are Terraform operation inputs. Normal manifest v1 construction may
start only from a governed live baseline of `normal` or
`candidate_promoted`. `candidate_no_traffic` remains an in-release state and
is not a permitted normal-v1 starting baseline.

### Consecutive release from a promoted baseline

The emitted live-discovery schema is an exact, mode-discriminated contract. The
existing `normal` manifest shape is unchanged: it requires the top-level
`stableApiRevision` and contains no `promotedBaseline`. A promoted start omits
the top-level `stableApiRevision` and instead requires exactly:

```json
{
  "apiTrafficMode": "candidate_promoted",
  "promotedBaseline": {
    "previousStableRevision": "moazez-staging-api-<previous-stable-revision-suffix>",
    "previousStableTrafficPercent": 0,
    "promotedRevision": "moazez-staging-api-<currently-promoted-revision-suffix>",
    "promotedTrafficPercent": 100,
    "promotedCandidateTag": "candidate-<12-lowercase-hex>[-rN]",
    "promotedImageReference": "<current-promoted-staging-image-by-digest>"
  },
  "candidateEdgeResources": {
    "candidateNegPresent": false,
    "candidateBackendPresent": false,
    "candidateSmokeRoutePresent": false
  }
}
```

This fragment appears inside the normal-v1 `liveDiscovery` object alongside
its evidence reference, discovery timestamp, four exact runtime images, and
independently discovered runtime and edge state lineage/serial values. The
`promotedImageReference` must exactly equal `runtimeImages.api`.

`previousStableRevision`, `promotedRevision`, and the new candidate revision
must be distinct full revision names for `moazez-staging-api`. The previous
stable traffic must be the numeric value `0`, and promoted traffic must be the
numeric value `100`. The promoted revision must equal
`moazez-staging-api-${promotedCandidateTag}`. The promoted tag must belong to
the promoted image's deterministic candidate family: either the image-derived
base tag or that base followed by a canonical `-rN`, where `N` is from `1`
through `999999999999999`.

The promoted image must differ from the new approved candidate image. The old
promoted tag and revision must also differ from the new candidate tag and
revision, including the unlikely case where distinct image references produce
the same 12-character tag prefix. Missing fields, wrong percentages,
wrong-service revisions, a tag/revision mismatch, a tag belonging to another
image, duplicate identities, or contradictory mode fields fail closed.

Promoted-baseline construction also requires fresh evidence that the candidate
NEG, candidate backend, and candidate smoke route are all absent. Omission or
any complete or partial presence stops construction before the Core gate. This
is a preflight blocker only; it never auto-applies Candidate Edge cleanup or
reconciliation.

The top-level `candidate` object continues to identify only the new release
candidate. Its tag is derived only from the new `candidateImageReference`; the
prior promoted identity is immutable live-baseline evidence and is never
copied into the new candidate fields.

For a legacy `normal` start, `stableApiRevision` is the full current revision
discovered from `moazez-staging-api`. For a promoted start,
`previousStableRevision` and `promotedRevision` are both taken from the exact
live traffic tuple. Do not infer any of these revisions from source or reuse
stale evidence.

The operation transition from a promoted baseline is exact:

| Operation window                  | `api_image_reference`         | `api_traffic_mode`     | `api_stable_revision`                     | `api_candidate_tag`                     |
| --------------------------------- | ----------------------------- | ---------------------- | ----------------------------------------- | --------------------------------------- |
| Core and Media promotion          | Current `runtimeImages.api`   | `candidate_promoted`   | `promotedBaseline.previousStableRevision` | `promotedBaseline.promotedCandidateTag` |
| New API candidate at zero traffic | New `candidateImageReference` | `candidate_no_traffic` | `promotedBaseline.promotedRevision`       | New image-derived `candidateTag`        |
| Maintenance promotion             | New `candidateImageReference` | `candidate_no_traffic` | `promotedBaseline.promotedRevision`       | New image-derived `candidateTag`        |
| Final traffic promotion           | New `candidateImageReference` | `candidate_promoted`   | `promotedBaseline.promotedRevision`       | New image-derived `candidateTag`        |

Core and Media plans must therefore preserve the exact existing API traffic
tuple and contain no API resource change. At the new API candidate operation,
the currently serving promoted revision becomes the stable `100%` revision and
the new candidate starts at `0%`. The older previous-stable `0%` target may
leave the explicit traffic list at this operation; that is a governed
`traffic` update, not deletion of the preserved revision. The candidate edge
operation uses only the new candidate tag.

A successfully promoted starting baseline is normal manifest v1, not Recovery
v2. It retains the full Core, Media, API candidate, Maintenance, protected
smoke, and final traffic-promotion order.

The new normal-v1 candidate tag formula is:

```text
candidate-${first 12 lowercase hex characters of sha256(full api_image_reference)}
```

For the historical D1 artifact at its approved Staging repository reference,
the derived base identities were:

```text
candidate tag:      candidate-e1f5a9c9e01b
candidate revision: moazez-staging-api-candidate-e1f5a9c9e01b
```

Recompute and validate the tag from the full image reference rather than
copying this example if the reference changes. Candidate modes reject a
missing or mismatched tag, missing/wrong-service stable revision, or identical
stable and candidate identities.

The transition from `candidate_no_traffic` to `candidate_promoted` must retain
the exact four image inputs, stable revision, candidate tag, candidate revision,
and every unrelated runtime setting. The accepted plan scope is only the API
service's `traffic` attribute.

## Candidate edge contract

The nonprod edge root accepts:

```text
candidate_edge_enabled = false | true
candidate_api_tag      = null | candidate-<12 lowercase hex>[-rN]
```

Disabled requires `false` plus `null`. Enabled requires `true`, Staging, and the
same tag used by the API runtime candidate. Production is hard-wired to
`false`/`null` and has no candidate override.

Enabling the Staging capability adds only:

```text
module.edge_environment.google_compute_region_network_endpoint_group.api_candidate[0]
module.edge_environment.google_compute_backend_service.api_candidate[0]
module.edge_environment.google_compute_url_map.edge
```

The NEG targets the existing `moazez-staging-api` service plus the candidate
Cloud Run tag. The backend reuses the existing API Cloud Armor policy and
trusted client-IP header. The URL map adds one exact path. The normal untagged
API NEG remains unchanged.

No new DNS record, hostname, public IP, certificate, certificate map, HTTPS
proxy, forwarding rule, direct Cloud Run URL exposure, or parallel ingress is
created.

## Successful in-progress Candidate Edge continuation

Use `manifestVersion=3` with
`executionMode=successful-edge-continuation` only when a normal-v1
promoted-baseline release is legitimately in progress at this exact boundary:

```text
Core Worker       passed
Media Worker      passed
API Runtime       passed and live-verified at candidate 0%
Candidate Edge    pending and untouched
Maintenance       pending
Protected smoke   pending
Traffic promotion pending
```

The continuation is a new execution with a new source SHA. It never edits the
old manifest and never represents the passed work as mutable operations. Input
must name the exact external predecessor manifest, its full file SHA256,
previous execution ID, and previous source SHA. Construction and every later
update re-read and re-hash those exact bytes, validate the predecessor as a
normal-v1 manifest, and require the lifecycle boundary above. LF-versus-CRLF
byte hashes of the separately tracked release contract are accepted only when
they are computed from semantically identical current contract text; the
predecessor manifest hash still binds its exact original bytes. A predecessor
`absoluteTerraformRoot` may point at its earlier checkout only when every
Terraform operation ends in its exact governed `terraformRoot` and all such
operations share one checkout root. The controller rebases only a validation
copy to the current checkout and preserves the imported evidence unchanged.

The controller imports durable snapshots of the passed Core, Media, and API
Runtime plan, approval, apply, successor-state, and verification evidence. It
also imports the first six completed contract stages. The three consumed plan
hashes are added to the v3 blocklist. The new manifest contains no
`core-worker-runtime`, `media-worker-runtime`, or `api-candidate-runtime`
operation, so those operations cannot be replayed.

Fresh continuation discovery must prove all of the following:

- the previous promoted revision/tag/image still serves exactly `100%`;
- the unchanged new candidate image/tag/revision is Ready and exactly `0%`;
- API, Core, and Media are on that candidate image while Maintenance remains on
  its exact previous image;
- current Runtime lineage/serial equals the passed API Runtime post-apply
  state;
- current Edge lineage/serial equals the pending predecessor Edge
  precondition;
- Candidate Edge is complete: serverless NEG, backend, and exact existing
  smoke route;
- the NEG targets service `moazez-staging-api` and the previous promoted tag;
- the backend still targets `moazez-staging-api-candidate-neg`, retains the
  primary API Cloud Armor posture and exact trusted client-IP header; and
- the URL map remains `moazez-staging-edge-url-map`, with only
  `/.well-known/moazez/candidate-readiness` rewritten to `/api/v1/auth/me`.

Partial Edge presence, wrong tag/service, wrong traffic, `Ready=False`, image
or revision mismatch, state mismatch, altered security posture, or a different
route fails closed.

The v3 gate list is the unchanged unresolved contract remainder:

```text
api-no-traffic-promotion
  api-candidate-edge-reconciliation
maintenance-scheduler-promotion
protected-readiness-and-smoke
traffic-promotion
```

`api-candidate-edge-reconciliation` has this exact takeover contract:

| Address                                                                                 | Required actions | Allowed semantic attributes | Allowed provider-computed values |
| --------------------------------------------------------------------------------------- | ---------------- | --------------------------- | -------------------------------- |
| `module.edge_environment.google_compute_region_network_endpoint_group.api_candidate[0]` | `delete,create`  | `cloud_run[0].tag`          | `id`, `self_link`                |
| `module.edge_environment.google_compute_backend_service.api_candidate[0]`               | `update`         | `backend[0].group`          | `fingerprint`                    |

The URL map is deliberately absent from the reconciliation address allowlist;
its exact existing route must be semantically unchanged. Any DNS, IP,
certificate, HTTPS proxy, forwarding rule, Cloud Armor, trusted-header,
ingress, URL-map, unrelated NEG/backend, or Production change is forbidden.

The Edge operation binds to fresh Edge lineage/serial and must return the same
lineage with a higher serial. Maintenance does not consume that Edge successor;
it binds directly to the current Runtime state proven equal to the imported API
Runtime successor. Traffic promotion binds to the verified Maintenance Runtime
successor. Runtime and Edge authorities therefore remain independent.

Do not apply the separate cleanup plan first, hand-edit either manifest, mark a
passed operation failed, fabricate Recovery evidence, or replay Core, Media,
API Runtime, or migrations. Candidate Edge cleanup remains non-authoritative,
requires separate post-release approval, and is not a v3 gate.

## Protected candidate smoke

The exact externally requested route is:

```text
GET https://staging-api.moazez.cloud/.well-known/moazez/candidate-readiness
```

The existing URL map rewrites only that exact path to:

```text
GET /api/v1/auth/me
```

`/api/v1/auth/me` is an existing authenticated application endpoint; no public
route decorator or authentication bypass was added. Use an active, dedicated
Staging smoke actor and an ephemeral application access token. Do not record
the token or response secrets. Success evidence must include HTTP 200, a
sanitized response reference, the expected image/revision/tag, and Cloud Run
request-log evidence naming the candidate revision.

## External artifact convention

Use external roots such as:

```text
externalTfDataRoot   = %LOCALAPPDATA%\Moazez\tfdata\day2-d1
externalSavedPlanRoot = %LOCALAPPDATA%\Moazez\plans\day2-d1
manifest              = %LOCALAPPDATA%\Moazez\release-control\day2-d1\<execution-id>.json
```

The adapter expands each Terraform operation to:

```text
TF_DATA_DIR=
<externalTfDataRoot>\<execution-id>\staging\<backend-runtime|edge>

SAVED_PLAN=
<externalSavedPlanRoot>\staging\<backend-runtime|edge>\<execution-id>\<ordered-gate-operation>.tfplan
```

The path must be absolute and outside the repository. Before each plan, bind
the exact source SHA, Terraform root, environment, current state lineage, and
current state serial. At registration, hash the actual plan bytes. The reviewed
plan may be applied at most once and is marked consumed after a successful
attempt or invalidated after a failed attempt.

The historical plan hash below is apply-forbidden and reuse-forbidden:

```text
ccc0473c853e0ea2a47e8cb6700acf3a80a454907130ce9992049e7d7ded43e7
```

Normal v1 contains that one blocker. Recovery v2 also requires the exact full
lowercase 64-character failed-plan SHA256 from DevOps evidence. The supplied
`19cc9769...` value is only a prefix; source does not guess, complete, or
hard-code it. Recovery plan registration rejects either hash in the manifest's
two-entry blocklist, as well as duplicate plan bytes within the new manifest.
Successful-continuation v3 instead adds the exact already-consumed Core, Media,
and API Runtime plan hashes from the predecessor evidence to the historical
blocker, preventing their reuse in the continuation.

Do not use `terraform -target`, `terraform -parallelism=1`, direct `gcloud run`
mutation, or Cloud Console mutation as release orchestration.

## Recovery manifest v2 — API-first governed window

Recovery does not reuse the failed manifest or execution ID. Create a new
external context with `executionMode="recovery"`, a new `executionId`, the
exact merged and approved deployment-control `sourceSha`, and
`resumeGateId="api-no-traffic-promotion"`. No other resume gate is supported,
and no top-level/operator `candidateTag` is accepted.

This v2 schema and API-first recovery window are unchanged by promoted-baseline
support. Recovery remains limited to an explicitly failed zero-traffic
candidate; it must not be used to normalize or resume a successful
`candidate_promoted` baseline.

The strict `recovery` object contains only:

```text
recoveryAttempt
failedReleaseExecutionId
failedManifestRef
failedGateId=api-no-traffic-promotion
failedOperationId=api-candidate-runtime
failedPlanSha256=<exact full lowercase SHA256>
failureEvidenceRef
```

The new execution ID must differ from `failedReleaseExecutionId`. The failed
plan hash must be 64 lowercase hexadecimal characters and must differ from the
preserved historical blocker.

Supply six exact ordered passed predecessor records:

```text
artifact-and-checksum-preflight
backup-and-data-authority-checkpoint
migration-job
migration-status-and-drift-verification
core-worker-promotion
media-worker-promotion
```

Each requires durable evidence. These stages are not replayed: recovery v2
contains no Core or Media Terraform operation.

Rediscover both Terraform states independently and record their exact opaque
lineage and live serial. The runtime serial is evidence, not a reusable source
constant; do not assume the incident's observed serial `9` remains current.
The recovery live baseline must prove stable API traffic is exactly 100%, the
failed candidate is exactly 0%, and the candidate NEG/backend/smoke route are
all absent.

The live API, Core Worker, and Media Worker images must equal the approved
immutable artifact reference. Maintenance may retain its independently
discovered pre-promotion image. The failed candidate image must equal the same
approved image, its revision must equal `moazez-staging-api-${failedTag}`, and
the failed revision must remain preserved.

Provide a complete revision inventory for service `moazez-staging-api` and the
exact image-derived base tag. Each entry requires `revision` and
`imageReference`; `tag` is optional because an existing revision may no longer
have a traffic tag. Reject duplicate revisions, different-image family
entries, and an inventory omitting the failed revision.

Candidate family ordinals are base=`0`, `-r1`=`1`, `-r2`=`2`, and so on. The
new `recoveryAttempt` must be the maximum existing ordinal plus one, from `1`
through `999999999999999`. The controller derives:

```text
baseTag=candidate-${first 12 lowercase hex of sha256(full image reference)}
candidateTag=${baseTag}-r${recoveryAttempt}
candidateRevision=moazez-staging-api-${candidateTag}
```

Existing, smaller, noncanonical, over-limit, timestamp, UUID, and arbitrary
identities are rejected.

Recovery v2 has four mutable authoritative gates in this order:

```text
api-no-traffic-promotion
  api-candidate-runtime
  api-candidate-edge
maintenance-scheduler-promotion
protected-readiness-and-smoke
traffic-promotion
```

`api-candidate-runtime` binds directly to rediscovered runtime lineage/serial.
Its required image variables retain the approved API/Core/Media image and the
discovered Maintenance image. Its resource address is only the API service,
and its exact recovery attribute allowlist is:

```text
template[0].revision
traffic
template[0].containers[0].startup_probe[0].initial_delay_seconds
template[0].containers[0].startup_probe[0].period_seconds
template[0].containers[0].startup_probe[0].timeout_seconds
template[0].containers[0].startup_probe[0].failure_threshold
```

Image mutation is forbidden in recovery, and no broad template/container/probe
path is allowed. The old failed revision may lose an explicit zero-percent
traffic target when the new candidate allocation replaces it; that is not
revision deletion.

`api-candidate-edge` remains blocked until API Runtime passes and binds directly
to rediscovered edge lineage/serial. It uses only the existing candidate NEG,
candidate backend, and URL map address allowlist. Maintenance then binds to the
verified API Runtime successor state and may change only the Maintenance image.
Traffic promotion binds to the verified Maintenance successor state and may
change only `traffic`; it must preserve the recovered image, revision, tag, and
startup probe settings.

The protected smoke request remains authenticated `GET` through the exact
public and rewritten paths documented above. The first failed apply or live
verification consumes or invalidates its plan, fails the current operation and
gate, and blocks all later work. There is no automatic `r2`; any later attempt
requires another newly authorized execution, fresh live discovery, a complete
new inventory, and new saved plans.

## Normal manifest v1 exact gate mapping

The adapter reads these IDs from the unchanged authoritative contract. Do not
shorten, rename, duplicate, or reorder them.

### 1. `core-worker-promotion`

Operation: `core-worker-runtime`

- Root: backend runtime.
- Images: current API, candidate Core Worker, current Media Worker, current Maintenance Scheduler.
- Traffic for a `normal` start: `normal`, stable revision `null`, candidate tag `null`.
- Traffic for a promoted start: unchanged `candidate_promoted`, previous stable revision, and previous promoted candidate tag from `promotedBaseline`.
- Address allowlist: `module.runtime_environment.google_cloud_run_v2_worker_pool.core`.
- Attribute allowlist: `template[0].containers[0].image`.
- Initial state precondition: live runtime lineage and serial.
- Expected plan: one in-place Core Worker image update only; any API address or traffic change is forbidden.
- Return: saved-plan path/SHA256/size, source/root/environment/lineage/serial binding, approval, apply evidence and increased same-lineage state serial, then observed candidate image.

### 2. `media-worker-promotion`

Operation: `media-worker-runtime`

- Root: backend runtime.
- Images: current API, already-promoted candidate Core Worker, candidate Media Worker, current Maintenance Scheduler.
- Traffic for a `normal` start: `normal`, stable revision `null`, candidate tag `null`.
- Traffic for a promoted start: the same unchanged `candidate_promoted` tuple used by Core.
- Address allowlist: `module.runtime_environment.google_cloud_run_v2_worker_pool.media`.
- Attribute allowlist: `template[0].containers[0].image`.
- State precondition: lineage/serial returned after verified `core-worker-runtime`.
- Expected plan: one in-place Media Worker image update only; any API address or traffic change is forbidden.
- Return: the standard plan/approval/apply/state evidence, then observed candidate image.

### 3. `api-no-traffic-promotion`

This single authoritative gate has two ordered suboperations.

Operation 1: `api-candidate-runtime`

- Root: backend runtime.
- Images: candidate API, already-promoted candidate Core/Media Workers, current Maintenance Scheduler.
- Traffic: `candidate_no_traffic`, the new release's verified stable revision, and its new deterministic candidate tag. The stable revision is `liveDiscovery.stableApiRevision` after a `normal` start or `liveDiscovery.promotedBaseline.promotedRevision` after a promoted start.
- Address allowlist: `module.runtime_environment.google_cloud_run_v2_service.api`.
- Attribute allowlist: `template[0].containers[0].image`, `template[0].revision`, and `traffic`.
- State precondition: lineage/serial returned after verified `media-worker-runtime`.
- Expected plan: the new candidate image/revision plus explicit stable 100% and tagged candidate 0%; no worker or unrelated API change. From a promoted baseline, the previously serving promoted revision becomes stable and the older zero-percent traffic target may leave the explicit tuple.
- Return: standard plan/approval/apply/state evidence, then observed candidate image, revision, tag, stable percent `100`, and candidate percent `0`.

Operation 2: `api-candidate-edge`

- Root: Staging edge.
- Variables: `candidate_edge_enabled=true`, same `candidate_api_tag`.
- Address allowlist: candidate NEG, candidate backend, existing URL map (the three addresses listed above).
- Attribute scope: create the NEG, create the backend, and add only `path_matcher[api].path_rule`.
- State precondition: live edge lineage and serial.
- Expected plan: the isolated candidate resources and exact protected route only.
- Return: standard plan/approval/apply/state evidence, then observed tag, public path, and rewritten backend path.

The edge suboperation cannot register or apply before the runtime suboperation
has passed live verification. Failure of either blocks the rest of this gate
and every later gate.

### 4. `maintenance-scheduler-promotion`

Operation: `maintenance-scheduler-runtime`

- Root: backend runtime.
- Images: candidate image for API, Core Worker, Media Worker, and Maintenance Scheduler.
- Traffic: unchanged `candidate_no_traffic` with the new release's stable revision and candidate tag.
- Address allowlist: `module.runtime_environment.google_cloud_run_v2_worker_pool.maintenance_scheduler`.
- Attribute allowlist: `template[0].containers[0].image`.
- State precondition: lineage/serial returned after verified `api-candidate-runtime`.
- Expected plan: one in-place Maintenance Scheduler image update only.
- Return: standard plan/approval/apply/state evidence, then observed candidate image.

### 5. `protected-readiness-and-smoke`

Operation: `protected-candidate-smoke` (verification only).

- No Terraform plan and no runtime image deployment.
- Preconditions: every earlier authoritative gate passed.
- Request: authenticated `GET` to the exact candidate smoke URL above.
- Expected identity: same candidate image, revision, and tag.
- Expected result: HTTP 200 through the existing ALB and candidate-tagged NEG.
- Return: evidence reference, UTC timestamp, sanitized observations, public and backend paths, image/revision/tag, HTTP status, and candidate request-log reference.

### 6. `traffic-promotion`

Operation: `api-traffic-promotion`

- Root: backend runtime.
- Images: unchanged candidate image on all four runtimes.
- Traffic: `candidate_promoted` with the unchanged new-release stable revision and candidate tag.
- Address allowlist: `module.runtime_environment.google_cloud_run_v2_service.api`.
- Attribute allowlist: `traffic` only.
- State precondition: lineage/serial returned after verified `maintenance-scheduler-runtime`.
- Preconditions: API candidate gate, Maintenance Scheduler gate, and protected smoke evidence passed; candidate image/revision/tag identities unchanged.
- Expected plan: stable 0%, candidate 100%, with no image, revision, worker, or unrelated API setting change.
- Return: standard plan/approval/apply/state evidence, then observed unchanged image/revision/tag, stable percent `0`, and candidate percent `100`.

## Candidate edge cleanup

The manifest contains a non-authoritative cleanup template for a separately
approved post-release operation:

```text
candidate_edge_enabled = false
candidate_api_tag      = null
```

Its only accepted scope is removal of the candidate NEG/backend and the narrow
URL-map path rule. Do not treat cleanup as a seventh contract gate and do not
run it without separate approval.

## Adapter commands and execution boundary

The exact command forms are documented in
`scripts/deployment-control/README.md`:

```text
create-spec
validate-spec
register-plan
approve-plan
record-apply
record-verification
```

`create-spec` and `validate-spec` are specification-only. `register-plan` and
`approve-plan` bind/review an already-created external plan. `record-apply` and
`record-verification` record evidence only. None is apply-capable.

The two Terraform roots are technically plan/apply-capable only in a later,
separately authorized DevOps execution. D1 used backend-disabled validation and
mocked Terraform tests only. No saved plan produced during D1 is valid because
none was created.

After every transition, return the updated external manifest plus the evidence
fields described above. Stop after the first failure, do not retry
automatically, and never edit immutable manifest operation fields; validation
reconstructs and rejects any changed root, variables, allowlist, expected
change type, path, source binding, or candidate identity.
