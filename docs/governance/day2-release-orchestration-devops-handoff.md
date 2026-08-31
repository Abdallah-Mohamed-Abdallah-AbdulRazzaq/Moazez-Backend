# Day-2 D1 runtime release orchestration — DevOps handoff

## Authority and boundary

This handoff resumes the existing Day-2 Staging release contract without
reopening D0 architecture. The application artifact digest remains:

```text
sha256:1a6b5f41a4dfbb4921a11fe60ccb7d46d89397353dad9aebfcb0df71017986c6
```

No application rebuild, Prisma/schema change, migration, database mutation,
Staging mutation, Production mutation, live Terraform plan, or Terraform apply
was performed by D1. The existing contract and release engine were not
changed.

Use the exact source SHA from the merged/approved D1 branch, not the pre-D1
start SHA, when a later release manifest and saved plans are created.

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

## API traffic contract

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

The stable revision is a governed live-discovery input. It must be the full
current revision name from `moazez-staging-api`; do not infer it from source or
reuse stale evidence.

The candidate tag formula is:

```text
candidate-${first 12 lowercase hex characters of sha256(full api_image_reference)}
```

For the existing artifact at the approved Staging repository reference, the
derived identities are:

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
candidate_api_tag      = null | candidate-<12 lowercase hex>
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

Do not use `terraform -target`, `terraform -parallelism=1`, direct `gcloud run`
mutation, or Cloud Console mutation as release orchestration.

## Exact gate mapping

The adapter reads these IDs from the unchanged authoritative contract. Do not
shorten, rename, duplicate, or reorder them.

### 1. `core-worker-promotion`

Operation: `core-worker-runtime`

- Root: backend runtime.
- Images: current API, candidate Core Worker, current Media Worker, current Maintenance Scheduler.
- Traffic: `normal`, stable revision `null`, candidate tag `null`.
- Address allowlist: `module.runtime_environment.google_cloud_run_v2_worker_pool.core`.
- Attribute allowlist: `template[0].containers[0].image`.
- Initial state precondition: live runtime lineage and serial.
- Expected plan: one in-place Core Worker image update only.
- Return: saved-plan path/SHA256/size, source/root/environment/lineage/serial binding, approval, apply evidence and increased same-lineage state serial, then observed candidate image.

### 2. `media-worker-promotion`

Operation: `media-worker-runtime`

- Root: backend runtime.
- Images: current API, already-promoted candidate Core Worker, candidate Media Worker, current Maintenance Scheduler.
- Traffic: `normal`, stable revision `null`, candidate tag `null`.
- Address allowlist: `module.runtime_environment.google_cloud_run_v2_worker_pool.media`.
- Attribute allowlist: `template[0].containers[0].image`.
- State precondition: lineage/serial returned after verified `core-worker-runtime`.
- Expected plan: one in-place Media Worker image update only.
- Return: the standard plan/approval/apply/state evidence, then observed candidate image.

### 3. `api-no-traffic-promotion`

This single authoritative gate has two ordered suboperations.

Operation 1: `api-candidate-runtime`

- Root: backend runtime.
- Images: candidate API, already-promoted candidate Core/Media Workers, current Maintenance Scheduler.
- Traffic: `candidate_no_traffic`, verified stable revision, deterministic candidate tag.
- Address allowlist: `module.runtime_environment.google_cloud_run_v2_service.api`.
- Attribute allowlist: `template[0].containers[0].image`, `template[0].revision`, and `traffic`.
- State precondition: lineage/serial returned after verified `media-worker-runtime`.
- Expected plan: candidate image/revision plus explicit stable 100%, tagged candidate 0%; no worker or unrelated API change.
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
- Traffic: unchanged `candidate_no_traffic` with the same stable revision/tag.
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
- Traffic: `candidate_promoted` with the unchanged stable revision and candidate tag.
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
