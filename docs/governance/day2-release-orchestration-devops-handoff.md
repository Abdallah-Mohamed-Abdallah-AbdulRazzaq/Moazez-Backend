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

Deployment control also has a narrow v4 authority for an interrupted,
externally invoked, approved v3 Candidate Edge plan when Edge state advanced to
a same-lineage successor serial but structured state and live evidence prove
that Candidate Edge semantics did not change. V4 is source governance only; it
does not relax v3, reuse Recovery v2, or authorize an apply.

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

The Terraform Candidate Edge capability is available only to the governed
Staging and Production edge roots. Both roots accept:

```text
candidate_edge_enabled        = false | true
candidate_smoke_route_enabled = null | false | true
candidate_api_tag             = null | candidate-<12 lowercase hex>[-rN]
```

`candidate_edge_enabled` owns the Candidate NEG and Backend lifecycle.
`candidate_smoke_route_enabled` owns the smoke-route intent; `null` means
inherit `candidate_edge_enabled`. `candidate_api_tag` is null when Candidate
resources are disabled and is the same tag used by that environment's API
runtime candidate when resources are enabled. Both roots default to
`false`/`null`/`null`, so merging the capability alone creates no Candidate
resources. Existing release manifests may omit the new route input and retain
their historical behavior.

The supported lifecycle matrix is:

| Edge resources | Smoke-route input | Tag | Result |
| -------------- | ----------------- | --- | ------ |
| `false` | `null` (omitted) | `null` | NEG absent, Backend absent, route absent |
| `true` | `null` (omitted) | valid Candidate tag | NEG present, Backend present, route present |
| `true` | `true` | valid Candidate tag | NEG present, Backend present, route present |
| `true` | `false` | current Candidate tag | NEG present, Backend present, route absent (safe cleanup Stage 1) |
| `false` | `false` | `null` | NEG absent, Backend absent, route absent (safe cleanup Stage 2) |
| `false` | `true` | `null` | rejected by the explicit Candidate smoke-route lifecycle precondition |

Enabling the capability through separately governed environment inputs adds
only:

```text
module.edge_environment.google_compute_region_network_endpoint_group.api_candidate[0]
module.edge_environment.google_compute_backend_service.api_candidate[0]
module.edge_environment.google_compute_url_map.edge
```

The NEG targets the environment's existing API service plus the candidate
Cloud Run tag. The backend reuses the existing API Cloud Armor policy and
trusted client-IP header. The URL map adds one exact path. The normal untagged
API NEG remains unchanged. The deterministic Candidate NEG name is guarded at
the resource level for the 63-character RFC1035 limit. The canonical tag
grammar still allows a recovery suffix of up to 15 digits; Staging supports
that maximum, while Production's longer prefix limits its physical NEG name to
13 recovery digits.

`scripts/deployment-control/runtime-release-control.cjs` remains the
Staging-specific execution/controller path described by the historical
Staging procedures below. Production Candidate Edge activation is not added to
that controller by this source remediation. Production R3-F requires its
separate DevOps Production procedure, explicit inputs, and a new Saved Plan.

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

| Address                                                                                 | Required actions | Allowed semantic attributes | Allowed provider-computed values                                                   |
| --------------------------------------------------------------------------------------- | ---------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| `module.edge_environment.google_compute_region_network_endpoint_group.api_candidate[0]` | `delete,create`  | `cloud_run[0].tag`          | `id`, `self_link`, `network`, `psc_data`                                           |
| `module.edge_environment.google_compute_backend_service.api_candidate[0]`               | `update`         | `backend[0].group`          | the seven exact `backend[0].max_*` paths plus the preserved `fingerprint` contract |

The deterministic v3 plan JSON review keeps configured semantic changes,
semantic dependency unknowns, provider-computed unknowns, provider/default
normalizations, and refresh-only drift distinct. Boolean leaf
`after_unknown=true` has precedence over ordinary before/after comparison;
false, empty arrays, and empty objects grant no permission. Null, absent, known
empty values, and unknown values are never collapsed.

The exact Candidate Backend provider-computed paths are
`backend[0].max_connections`,
`backend[0].max_connections_per_endpoint`,
`backend[0].max_connections_per_instance`, `backend[0].max_rate`,
`backend[0].max_rate_per_endpoint`, `backend[0].max_rate_per_instance`, and
`backend[0].max_utilization`. `fingerprint` remains an immutable compatibility
allowance, but it is not asserted as unknown in the representative real-plan
fixture because it was not present in the observed plan shape.

The NEG must replace only because `cloud_run[0].tag` changes from the fresh
serving-baseline tag to the manifest candidate tag. Only its exact same-region
regional self-link to `me-central2` normalization and exact empty-string to
null transitions for `cloud_run[0].url_mask`, `description`,
`psc_target_service`, and `subnetwork` are allowed. The Backend must contain
exactly one backend element; `backend[0].group` remains the governed semantic
dependency change from the known retained NEG identity to unknown after apply.
No wildcard normalization or unknown path exists.

`resource_drift` is reviewed separately. On the Candidate Backend, only
`custom_response_headers: null -> []` and `health_checks: null -> []` may
appear. On exactly the certificate map and the `admin`, `api`, and `schools`
certificate-map entries, only a valid changed `update_time` timestamp may
appear, with no unknown and no corresponding non-noop resource change. The
Backend's simultaneous governed `resource_change` is explicitly allowed and
does not make its drift semantic.

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

## Interrupted v3 Edge state-successor recovery v4

Use `manifestVersion=4` with
`executionMode=successful-edge-state-successor-recovery` only for this exact
classification:

```text
STATE_ADVANCED_WITHOUT_GOVERNED_SEMANTIC_EDGE_CHANGE
```

The prior authority must be an exact external
`successful-edge-continuation` v3 manifest that remains `pending` with no
failed gate. The `api-no-traffic-promotion` gate and every later gate remain
pending. Its
`api-no-traffic-promotion/api-candidate-edge-reconciliation` operation must be
approved with registered and reviewed plan evidence, passed deterministic
review, approved approval evidence, `apply.status=not-applied`,
`apply.attempted=false`, `singleConsumptionStatus=unconsumed`, and pending live
verification. Do not mutate that v3 manifest after an interrupted external
invocation. An already applied, attempted, failed, consumed, unapproved,
unreviewed, live-verified, or completed predecessor is not recoverable by v4.
This is the controller-produced boundary: approval of the first v3 operation
does not pass its gate, so the release has not yet transitioned from `pending`
to `in-progress`. V4 parses the retained bytes and validates the v3 lifecycle as
represented. It may rebase only checkout-root paths in a validation clone; it
does not normalize release, gate, operation, plan, approval, apply, verification,
or state-precondition lifecycle fields.

The v4 recovery object binds these seven distinct external regular files by
absolute path and exact lowercase SHA256:

```text
priorManifestRef / priorManifestSha256
priorSavedPlanRef / priorSavedPlanSha256
priorPlanJsonRef / priorPlanJsonSha256
priorReviewEvidenceRef / priorReviewEvidenceSha256
priorApprovalEvidenceRef / priorApprovalEvidenceSha256
priorPreApplyEvidenceRef / priorPreApplyEvidenceSha256
stateReconciliationEvidenceRef / stateReconciliationEvidenceSha256
```

It also records `priorReleaseExecutionId`. The controller re-reads every file
at construction and validation. It cross-checks the exact Saved Plan path,
hash, and size; Plan JSON; deterministic review evidence; reviewed manifest;
immutable operation specification; and approval reference against the prior v3
operation, then reruns the PR #121 reviewer. Do not copy manifests, Saved Plans,
Plan JSON, approvals, pre-apply evidence, or reconciliation evidence into the
repository.

The retained approval and pre-apply files have stable structured historical
contracts and are semantic authorities rather than opaque archival evidence.
Approval evidence must bind the exact release/source, Candidate Edge gate and
operation, reconstructed pre-approval manifest, Saved Plan, Plan JSON,
deterministic review, approver/time, approved classification, and
`terraformApplyAuthorized=false`. Pre-apply evidence must bind the exact
approved manifest, Saved Plan, Plan JSON, review and approval hashes, Candidate
Edge state precondition, traffic and Edge posture, and must report
`authorizationBoundary.terraformApplyExecuted=false` and
`productionMutation=false`. The historical pre-apply schema has no independent
`gateId` or `operationId`; its exact `edge-final-pre-apply-authority-guard`
classification and those manifest/plan/state/Edge bindings identify the
Candidate Edge boundary. No absent field is invented. A rewritten artifact
fails semantic validation even when its outer metadata SHA is recomputed.

The new v4 execution ID must differ from the interrupted v3 execution ID. Its
source SHA must equal the current repository HEAD; v4 does not impose an
artificial requirement that this SHA differ from the prior v3 source SHA.

The exact reconciliation evidence records schema version `1`, the
classification above, prior release ID, prior and current Edge lineage/serial,
structured state and live copies of the Candidate NEG, Backend, and smoke
route, serving revision and `100%` traffic, candidate revision/tag and `0%`
traffic, `candidateReady=true`, the desired Candidate tag,
`urlMapSemanticStatus=unchanged`, and
`productionMutationObserved=false`. Unknown fields fail. A boolean
`semanticEqual=true` is not evidence.

That structured schema remains the normal V4 format and its exact-key validator
is unchanged. There is one incident-specific adapter for the original retained
State-10 evidence bytes; it is not a general legacy schema and cannot be chosen
by an operator. The dispatcher recognizes only reconciliation SHA256
`b2cce07f342b69d72819bf134b28861a07bfc59b42526e1f3c112ecf7a7cb5c9`
and then requires prior release
`day2-staging-edge-continuation-20260913163120` with this complete chain:

```text
manifest 0e695d4a901f54410eb0b0d638d4175e9ee2e8ce79a828915b726c68131519d8
Saved Plan 013f65d45916d5f4e28a259104d1369348312a6075aaf9d26b2f3f1efb126e32
Plan JSON 5500a3c861c06924e8211b7715c9e035dec434ed9672f27d69d9ab2622b4b607
review 1011575cdce145d9e0fc692b998e7fbe66f7f813a233025c2c93f89085df6fb2
approval d4e7e7e16b7d5cb6bcf2ce46052b0a1c7c22971cad53199ca594aec117775da8
pre-apply f6b383c4990f9bfba4f8d5bded9a686e3f85d3195828c3de9cbd40f921585eb4
```

The exact retained manifest uses the already-authorized CRLF byte hash of the
unchanged release contract, and its reviewed operation digest includes its
original checkout root. Only for this complete incident profile, validation
proves that original digest and the contract loader's explicit LF/CRLF
equivalence before adapting a memory-only validation copy to the current
checkout. The retained manifest and review bytes and hashes remain untouched
and are still checked in their original forms.

The loader hashes the untouched original bytes before parsing. It never
rewrites, normalizes, reserializes, or replaces the historical file. The legacy
validator enforces exact keys for the discovered top-level, `state`, `live`,
and `comparisons` objects; exact safe flags; State-10 lineage and serial; the
old NEG tag and service; the full exact Backend-group project/region/NEG URL;
state/live NEG and Backend identity equivalence; and the recorded provider-shape
counts. The historical State counts for response headers and health checks are
`0/0`, while its retained Live counts are `1/1`; the current V4 semantic
snapshot has no corresponding count fields, so these remain exact historical
observations rather than being falsely attributed to fresh discovery.

The legacy file has no prior-release field, prior Edge snapshot, smoke-route
snapshot, traffic structure, candidate Ready flag, desired-tag field, or
production-specific mutation flag. The exact incident profile supplies the
predecessor identity, while the unchanged strict fresh-live validator supplies
those current safety facts. Represented NEG/Backend identities are cross-bound
to fresh discovery, the legacy State identity must be exact same-lineage serial
10 over predecessor serial 9, and the old tag must differ from the exact desired
tag. Any other legacy bytes, hash, prior release, artifact chain, schema, or
semantic value fails closed. Fresh live discovery remains mandatory.

V4 permits only this state-identity difference:

```text
current Edge lineage == prior v3 Edge lineage
current Edge serial > prior v3 Edge serial
```

The existing v3 equality rule is unchanged: v3 continues to require its
current lineage and serial to equal the pending predecessor Edge precondition.
V4 separately requires the current state, current live discovery, and prior-v3
pre-attempt semantic snapshots to be deeply equal. That comparison includes:

- complete `moazez-staging-api-candidate-neg` serverless topology in
  `me-central2`, still targeting `moazez-staging-api` at the previous serving
  tag rather than the desired tag;
- complete `moazez-staging-api-candidate-backend`, still targeting that exact
  NEG with `HTTP`, `EXTERNAL_MANAGED`, matching primary API Cloud Armor, and
  exactly `X-Moazez-Client-IP:{client_ip_address}`;
- the unchanged `moazez-staging-edge-url-map` route from
  `/.well-known/moazez/candidate-readiness` to the candidate Backend with
  rewrite `/api/v1/auth/me`;
- unchanged serving revision/tag/image at `100%`, the exact approved Ready
  candidate at `0%`, and distinct serving and candidate identities; and
- API, Core, and Media on the candidate image, Maintenance on its exact prior
  image, and Runtime state equal to the passed API Runtime authority.

Any partial Edge, another NEG/Backend/route, desired tag already live, altered
Cloud Armor or trusted headers, URL-map semantic change, unexpected Runtime
state/image, traffic contradiction, or Production mutation fails closed even
if the Edge serial increased.

The v4 executable window is exactly:

```text
api-no-traffic-promotion
  api-candidate-edge-reconciliation
maintenance-scheduler-promotion
protected-readiness-and-smoke
traffic-promotion
```

There is no migration, Core Worker, Media Worker, or API Runtime operation.
Those stages remain imported immutable evidence. The interrupted v3 Saved Plan
is stale forensic evidence, never new authority. V4 builds its plan blocklist
as a deduplicated union of the prior v3 blocklist and that exact interrupted
plan hash; re-registering its bytes fails with `PLAN_REUSE_FORBIDDEN`. The sole
hard-coded incident profile above authorizes only historical evidence parsing;
it does not make the old plan reusable or accept an operator-supplied hash.

The fresh v4 Candidate Edge plan must pass the exact v3 PR #121 reviewer. The
only non-noop resources remain the Candidate NEG (`delete,create`, with only
`cloud_run[0].tag` changing) and Candidate Backend (`update`, with only
`backend[0].group` becoming the replacement NEG identity). Provider identity,
replacement cause, computed unknown, normalization, drift, duplicate,
provenance, Backend-cardinality, and no-op rules are identical to v3. The URL
map must remain no-op; Cloud Armor, headers, DNS, addresses, certificates,
proxies, forwarding rules, ingress, unrelated resources, and Production are
outside the immutable allowlist.

Recovery v2 remains solely for a failed zero-traffic API candidate with
Candidate Edge absent. It cannot express or authorize this retained-Edge
state-successor condition.

After the v4 source change is independently reviewed, owner-authorized,
merged, and exact-main CI passes, begin with fresh read-only source, Runtime,
Edge-state, and state/live reconciliation discovery. Create a new v4 execution,
manifest, current-serial precondition, and Saved Plan. Hash that plan before
and after `terraform show -json` of the exact same file and require equality;
then run `review-plan`, `register-plan`, independent `approve-plan`, and only a
separately authorized apply. The interrupted plan remains blocked forever.

Do not use Terraform state push, manual state edits, a Terraform refresh
workaround, `-refresh=false`, `-target`, manual Candidate NEG/Backend/URL-map
mutation, or automatic traffic promotion.

## Failed v4 Apply State11 successor recovery v5

The exact v4 execution
`day2-staging-edge-state-successor-recovery-20260914151653` reached its approved
Candidate Edge Apply boundary. The Apply process started, failed with
`resourceInUseByAnotherResource`, and advanced the same Edge lineage from
serial 10 to serial 11. The fixed Candidate NEG remained
`moazez-staging-api-candidate-neg` at the prior serving tag, the stable
Candidate Backend still targeted it, the serving/candidate traffic remained
`100/0`, and Cloud Armor, the trusted header, and smoke route were unchanged.
The failed replacement tried to delete that still-referenced NEG before
creating its successor.

The source repair gives each Candidate NEG a deterministic physical identity:

```text
moazez-staging-api-${candidate_api_tag}-neg
```

It also declares `create_before_destroy=true`. For the current candidate, the
successor is
`moazez-staging-api-candidate-5377bd0c7d84-neg`. Terraform can create it,
update the unchanged `moazez-staging-api-candidate-backend` group, and only
then remove the predecessor. The `moazez-staging-edge-url-map` identity and
semantics remain stable.

Use `manifestVersion=5` with
`executionMode=failed-edge-apply-state-successor-recovery` only for this exact
incident. The context must bind current HEAD as both `sourceSha` and
`sourceRemediationSha`, and must name eight distinct retained external files by
exact lowercase SHA256: the failed v4 manifest, failed Saved Plan, Plan JSON,
review evidence, pre-Apply evidence, Apply stdout, Apply stderr, and the exact
State11 reconciliation file. Original bytes are hashed before parsing and are
never rewritten. The retained manifest is validated under the unchanged v4
contract, then the failed/attempted/invalidated lifecycle and blocked later
gates are derived only in memory.

The State11 evidence must prove the exact failure code and resource pair,
State10-to-State11 strict same-lineage successor, no live or state semantic
mutation, no traffic mutation, no state lock, no Production or Staging mutation
by the reconciliation gate, and no plan/retry authorization. Fresh live
discovery remains mandatory and must independently reproduce the exact
State11 runtime, traffic, Candidate NEG, Backend, security, header, and route
boundary. V5 is not a generic failed-Terraform recovery mechanism.

The v5 remainder is exactly:

```text
api-no-traffic-promotion
  api-candidate-edge-reconciliation
maintenance-scheduler-promotion
protected-readiness-and-smoke
traffic-promotion
```

Migration, Core Worker, Media Worker, and API Runtime are imported passed
authority; do not recreate or replay them. The Candidate Edge operation binds
serial 11 and requires a fresh Saved Plan. Its only non-noop resources are:

| Resource                 | Exact v5 plan contract                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate NEG            | `create,delete`; old fixed name to exact tag-derived name; old serving tag to desired tag; replacement paths exactly `name` and `cloud_run[0].tag` |
| Stable Candidate Backend | `update`; exact project/name/self-link preserved; old exact NEG group becomes the governed unknown successor dependency                            |

The URL map must not mutate. The post-Apply verification evidence must name the
successor NEG, Cloud Run service/tag, stable Backend and successor group, stable
URL map with unchanged semantics, matching primary API security posture, and
the exact trusted client-IP header.

Both historical plans are permanently non-reusable: the interrupted v3 plan
`013f65d45916d5f4e28a259104d1369348312a6075aaf9d26b2f3f1efb126e32`
and failed State11 v4 plan
`bdacfaf2a7aafb53e76111fb1a741b3a5da947b90cc2c3107c345324fb9f2230`.
Do not copy, register, approve, or Apply either plan. After this source repair
is merged and exact-main CI passes, repeat fresh source, state, runtime, and
live discovery and create a new v5 manifest and fresh Saved Plan. There is no
automatic Apply retry; review, registration, approval, pre-Apply checks, and
any Apply remain separate DevOps authorities.

The historical V3/V4 deterministic reviewer remains `delete,create` with only
`cloud_run[0].tag` as a replacement path. V5 alone accepts `create,delete` with
both tag and name replacement. Never reinterpret a historical Plan JSON under
the v5 contract.

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
blocker, preventing their reuse in the continuation. State-successor recovery
v4 inherits that complete blocklist and dynamically adds the exact interrupted
v3 Edge Saved Plan hash.

Do not use `terraform -target`, `-refresh=false`, Terraform state push, manual
state edits, `terraform refresh`, `terraform -parallelism=1`, direct
`gcloud run` mutation, or Cloud Console mutation as release orchestration.

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
- Variables: `candidate_edge_enabled=true`, same `candidate_api_tag`; `candidate_smoke_route_enabled` remains omitted and therefore inherits `true`.
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

Live Candidate cleanup is two separate DevOps transitions. Do not represent or
execute it as one plan or apply.

### Safe cleanup Stage 1

```text
candidate_edge_enabled        = true
candidate_smoke_route_enabled = false
candidate_api_tag             = <current candidate tag>
```

Stage 1 removes only the Candidate path rule from the existing URL map. The
Candidate Backend and Candidate NEG remain present, and their outputs remain
non-null. The two smoke-route outputs become null because the route is no
longer rendered. Stage 1 must be separately planned, reviewed, approved,
applied, and verified before Stage 2 begins.

### Safe cleanup Stage 2

Only after the applied Stage 1 is live-verified:

```text
candidate_edge_enabled        = false
candidate_smoke_route_enabled = false
candidate_api_tag             = null
```

Stage 2 removes the Candidate Backend and Candidate NEG. The Backend's existing
reference to the NEG preserves Terraform's natural Backend-before-NEG destroy
dependency. The URL map must have no semantic change in Stage 2. Stage 2 must
be separately planned, reviewed, approved, applied, and verified.

The two transitions are therefore two separately planned, two separately
reviewed, two separately approved, two separately applied, and two separately
verified DevOps operations. Neither transition uses `-target`, manual resource
deletion, Terraform state surgery, an old Saved Plan, or the previously
rejected targeted plan.

The manifest's historical `candidateEdgeCleanupTemplate` remains
non-authoritative, requires separate post-release approval, and describes a
legacy one-step shape. It is not execution authority and must not be used to
bypass the repaired two-stage cleanup. Cleanup remains outside the six
authoritative release gates and must not be treated as a seventh gate.

## Adapter commands and execution boundary

The exact command forms are documented in
`scripts/deployment-control/README.md`:

```text
create-spec
validate-spec
review-plan
register-plan
approve-plan
record-apply
record-verification
```

`create-spec` and `validate-spec` are specification-only. For the exact v3 or
v4 Candidate Edge operation, `review-plan` reads the immutable manifest, Saved
Plan, and plan JSON and atomically creates only sanitized external review
evidence. It does not run Terraform or mutate the manifest. `register-plan`
then requires that exact plan JSON and review evidence, reruns the same
deterministic review, and binds the exact previously reviewed Saved Plan bytes;
`approve-plan` remains a separate independent authorization. `record-apply`
and `record-verification` record evidence only. None is apply-capable.

The reviewer hashes both files but cannot prove that plan JSON was derived
from the Saved Plan because it never invokes Terraform. DevOps owns one guarded
export operation:

```text
hash Saved Plan before export
-> terraform show -json exact Saved Plan
-> hash Saved Plan after export
-> require unchanged
-> invoke review-plan using those exact files
```

The exact v3/v4 command is:

```text
node scripts/deployment-control/runtime-release-control.cjs review-plan --manifest <exact-external-manifest.json> --gate api-no-traffic-promotion --operation api-candidate-edge-reconciliation --plan <exact-external-saved-plan.tfplan> --plan-json <exact-external-plan.json> --review-evidence <new-external-review-evidence.json>
```

The matching exact v3/v4 registration is:

```text
node scripts/deployment-control/runtime-release-control.cjs register-plan --manifest <exact-external-manifest.json> --gate api-no-traffic-promotion --operation api-candidate-edge-reconciliation --recorded-at <ISO-UTC> --plan <exact-external-saved-plan.tfplan> --plan-json <exact-external-plan.json> --review-evidence <exact-external-review-evidence.json> --source-sha <exact-source-sha> --environment staging --terraform-root infra/gcp/edge/environments/nonprod --lineage <pre-plan-lineage> --serial <pre-plan-serial>
```

Before registration, the controller re-hashes the pre-registration manifest,
Saved Plan, plan JSON, and review evidence; reruns the pure deterministic
reviewer; reconstructs the complete expected evidence; and requires deep exact
equality. Thus review evidence is a cached report rather than a trust root. Any
release, source, manifest, operation, digest, path, Saved Plan bytes, plan JSON
bytes, version, count, or passed-status mismatch fails closed. Registration
retains a compact binding to the review evidence hash, reviewed manifest hash,
immutable operation digest, plan JSON hash, and Saved Plan hash without changing
approval semantics. The controller still cannot prove that the JSON originated
from the binary Saved Plan; the guarded DevOps export above remains mandatory.

After a state-successor repair changes the source SHA, the interrupted v3
manifest and Saved Plan are evidence-only: do not register, approve, or apply
them. The required continuation is merged repaired source; fresh source,
Runtime, Edge-state, and state/live reconciliation discovery; a new v4
execution and manifest; a new Saved Plan; guarded exact-plan JSON export;
deterministic review; registration of the exact reviewed plan; independent
approval; and only then a separately authorized apply.

The superseded evidence identities that exposed this source gap are:

```text
OLD_SOURCE_SHA=11602e319088129694aca3a5d724c34d05bd335a
OLD_MANIFEST_SHA256=24290164ca0626952b6e0682ba50dba6273af0fccf4df18a576207c7b1b265a6
OLD_SAVED_PLAN_SHA256=b513bda853ccc0bebff2fe94809038b88c7d376235baa1ef89ffac1cc82c4601
OLD_MANIFEST=EVIDENCE_ONLY
OLD_SAVED_PLAN=EVIDENCE_ONLY
REGISTER_OLD_PLAN=NO
APPROVE_OLD_PLAN=NO
APPLY_OLD_PLAN=NO
```

The two Terraform roots are technically plan/apply-capable only in a later,
separately authorized DevOps execution. D1 used backend-disabled validation and
mocked Terraform tests only. No saved plan produced during D1 is valid because
none was created.

After every transition, return the updated external manifest plus the evidence
fields described above. Stop after the first failure, do not retry
automatically, and never edit immutable manifest operation fields; validation
reconstructs and rejects any changed root, variables, allowlist, expected
change type, path, source binding, or candidate identity.

## Runtime capacity and V6 continuation addendum

Capacity is now a separate governance authority, not a seventh release gate.
Use `capacityExecutionSchemaVersion=1` and the
`runtime-capacity-adjustment` operation for service-level changes only:

```text
API service min/max
Core Worker manual count
Media Worker manual count
```

Do not use a standalone capacity execution to change API revision max,
concurrency, timeout, session affinity, `DATABASE_CONNECTION_LIMIT`, an image,
candidate identity, traffic, or any Edge or platform resource. Those
revision-owned fields may change only through governed creation of a new API
candidate at 0% normal traffic. Preserve a managed `null` as absence; do not
materialize a provider-observed default.

Both Staging and Production capacity executions must bind the exact environment
map, current source SHA, and freshly discovered Runtime state lineage/serial.
The deterministic reviewer, exact Saved Plan hash, independent approval,
recorded fresh pre-Apply authority, single apply attempt, replay blocklist, live
verification, and close transition are mandatory. Apply recording cannot skip
the `pre-apply-authorized` state and must re-hash the supplied Saved Plan bytes.
Database, Queue Redis, and Realtime Redis envelopes must be calculated before a
plan is accepted. New budget authority is an external
`capacityBudgetEvidenceSchemaVersion=1` artifact whose raw bytes, environment,
approval status, three domains, budgets, and reserve authorities are bound and
reverified at pre-Apply; free-form caller claims are not authority.

A Production API service min/max decrease is forbidden as a generic
`standalone-adjustment`. `post-promotion-normalization` requires a separate
external `promotionStabilityEvidenceSchemaVersion=1` artifact, hashed before
parsing, that proves completed Production traffic promotion, removal of the
former emergency revision's traffic, the promoted current serving revision,
and passed stability. A worker-only Production decrease does not require this
traffic evidence. Capacity executions never normalize revision-owned fields.

For the interrupted Staging release, use only V6 execution mode
`post-edge-source-continuation`. It must hash and import the exact immutable V5
predecessor and preserve its already-passed Core, Media, API, and Candidate Edge
evidence. It must use the predecessor's exact immutable application digest and
candidate identity without rebuilding the application artifact. Fresh discovery
must prove the passed Edge successor state and managed Runtime values; observed
provider defaults remain diagnostic only.

For this V6 continuation, fresh Runtime state must exactly equal the
predecessor API Runtime post-Apply lineage and serial, and fresh Edge state must
exactly equal the predecessor Edge post-Apply lineage and serial. A serial `+1`
with the same lineage is rejected and requires a separate reconciliation
contract; V1-V5 state semantics are unchanged.

The only executable continuation operations are:

```text
Maintenance Scheduler promotion
smoke checks
traffic promotion
```

The rejected Maintenance Saved Plan is evidence-only and belongs on the V6
blocked-plan list. Never register, approve, or apply it. The replacement
Maintenance plan must be new, exact, and deterministically reviewed to show only
the one allowed Maintenance image transition while preserving the API service
capacity, worker counts, candidate capacity, candidate identity, and Edge
state. Full field definitions and formulas are in
[`runtime-capacity-governance.md`](runtime-capacity-governance.md).
