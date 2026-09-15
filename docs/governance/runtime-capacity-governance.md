# Runtime capacity governance

This document defines source and control-plane authority for Moazez backend
runtime capacity. It does not authorize a Terraform plan or apply, a Cloud Run
change, a traffic change, a database or Redis change, or an application
artifact rebuild.

## Vocabulary and authority boundaries

- **Release Configuration** selects immutable runtime images, candidate
  identity, and traffic intent for a governed release operation.
- **Service Capacity** is the API Cloud Run service-level minimum and maximum.
- **Revision Capacity** is the API revision maximum, concurrency, timeout,
  session affinity, and per-instance `DATABASE_CONNECTION_LIMIT`.
- **Worker Capacity** is the Core and Media manual instance count. Maintenance
  Scheduler remains exactly one and is not parameterized.
- **Permanent Steady-State Capacity** is the environment root's normal source
  baseline: Staging `1/4`, Production `1/10`, concurrency `40`, API DB limit
  `5`, and Core/Media `1/1`.
- **Emergency Live Capacity** is a freshly discovered, already-live operational
  posture. It is evidence, not a permanent source default.
- **Load-Test Candidate Capacity** is a complete proposed revision profile for
  a new candidate at zero percent normal traffic. It is a hypothesis until
  governed capacity evidence and protected validation pass.
- **Terraform Managed Capacity** contains only explicit desired values. A null
  nullable revision setting means Terraform must preserve absence.
- **Observed Effective Capacity** records read-only live values, including
  provider defaults. It must never be copied into Terraform Managed Capacity
  merely because it was observed.
- **Control Source Authority** is the repository and exact HEAD containing the
  deployment-control and Terraform source.
- **Application Artifact Authority** is the immutable digest-pinned image and
  its provenance. A new control source does not imply a rebuild.

## Environment-owned Terraform baselines

The shared runtime module contains capacity mechanics only. Both runtime roots
explicitly pass these inputs:

```text
api_service_min_instances
api_service_max_instances
api_revision_max_instances
api_max_instance_request_concurrency
api_request_timeout_seconds
api_session_affinity
api_database_connection_limit
core_worker_manual_instance_count
media_worker_manual_instance_count
```

The root defaults are independent:

| Capacity                          | Staging | Production normal |
| --------------------------------- | ------: | ----------------: |
| API service minimum               |       1 |                 1 |
| API service maximum               |       4 |                10 |
| API revision maximum              |    null |              null |
| API concurrency                   |      40 |                40 |
| API timeout                       |    null |              null |
| API session affinity              |    null |              null |
| API database connection limit     |       5 |                 5 |
| Core manual instance count        |       1 |                 1 |
| Media manual instance count       |       1 |                 1 |
| Maintenance manual instance count |       1 |                 1 |

Null revision maximum, timeout, and session affinity are explicitly
unmanaged. The module omits the revision scaling block and passes null for the
nullable provider arguments. Observed provider defaults do not become desired
configuration.

## Capacity specification and lifecycle

`capacitySpecVersion=1` is the common capacity value model. Standalone
capacity changes use a separate `capacityExecutionSchemaVersion=1`; they are
not Release V6 gates. The exact operation identity is
`runtime-capacity-adjustment`.

Schema version 1 is completed in this unmerged change with two closed execution
intents: `standalone-adjustment` and `post-promotion-normalization`. No governed
external Capacity v1 execution existed before this completion, so a version
bump or compatibility migration is neither required nor implied.

The standalone controller accepts exactly `staging` and `production` and binds
each to an allowlisted Terraform root, project, region, API service, Core
Worker, and Media Worker identity. Fresh Terraform lineage and serial are
execution evidence, never environment constants.

Only these fields can change in a standalone execution:

```text
api.serviceMinInstances
api.serviceMaxInstances
workers.coreManualInstanceCount
workers.mediaManualInstanceCount
```

Revision maximum, concurrency, timeout, session affinity, API DB limit,
images, traffic, candidate identity, Edge, IAM, VPC, Redis identity/topology,
secrets, storage, business settings, Prisma, and migrations are forbidden.
The plan reviewer accepts only the matching service scaling paths and the two
worker manual-count paths. It rejects every API template change.

The lifecycle is `constructed -> plan-registered -> approved ->
pre-apply-authorized -> applied-awaiting-live-verification -> closed`. The
pre-Apply transition requires fresh caller-supplied source SHA, Terraform
lineage and serial, exact Saved Plan bytes, evidence reference, and timestamp.
It records immutable passed authority for that execution. Apply recording is
forbidden directly from `approved`; it re-hashes the supplied Saved Plan bytes
and requires the registered and pre-Apply hashes to agree before the one Apply
attempt is consumed. The exact source, environment, Terraform root identity,
lineage, serial, and plan are bound. Blocked, duplicate, stale, changed, or
consumed plans fail closed.

A Production decrease to either API service min or max is forbidden under
`standalone-adjustment`. It must use `post-promotion-normalization` and bind a
separate immutable `promotionStabilityEvidenceSchemaVersion=1` artifact stored
outside the repository. Its raw bytes are hashed before JSON parsing. The
artifact must bind Production, approved status, completed traffic promotion,
safe removal of traffic from the former emergency revision, the promoted
revision as the current serving revision, and passed stability validation.
A caller boolean is never authority. Core/Media counts change only when
separately requested in the desired specification; worker-only Production
decreases remain ordinary standalone adjustments. Revision capacity remains
immutable in every Capacity execution.

## DB and Redis envelopes

Steady state uses:

```text
DB = API service max × API DB limit + Core count × 6 + Media count × 3
Queue Redis = API service max × 2 + Core count × 9 + Media count × 4 + 2
Realtime Redis = API service max × 3 + Core count
```

This yields Staging `DB=29`, `Queue=23`, `Realtime=13`, and Production normal
`DB=59`, `Queue=35`, `Realtime=31`. The historical proven Production Realtime
Redis budget is `30`; therefore a newly requested Production profile at
service maximum `10` requires new governed Redis evidence. Preservation of an
already-live setting is not a new capacity approval.

For a tagged zero-traffic candidate, serving and candidate API envelopes are
independent:

```text
serving DB = discovered serving service max × discovered serving revision DB limit
candidate DB = candidate revision max × candidate DB limit
total DB overlap = serving DB + candidate DB + Core count × 6 + Media count × 3

serving Queue = serving service max × 2
candidate Queue = candidate revision max × 2
total Queue overlap = serving Queue + candidate Queue + Core × 9 + Media × 4 + 2

serving Realtime = serving service max × 3
candidate Realtime = candidate revision max × 3
total Realtime overlap = serving Realtime + candidate Realtime + Core
```

The service maximum is not treated as a perfect instantaneous hard cap. Every
evaluator result keeps the calculated governed envelope, evidence authority,
safety-reserve authority, effective approval budget, reserve status, and
approval result separate. No numeric reserve is invented. A new increase or
candidate overlap without sufficient DB, Queue Redis, and Realtime Redis
evidence fails closed.

New budget authority is one external
`capacityBudgetEvidenceSchemaVersion=1` JSON bundle. The caller supplies only
its absolute external path and expected lowercase SHA-256. The controller reads
and hashes the raw bytes before parsing, then requires the exact schema,
environment, `approved` status, evidence identity, all three resource domains,
effective budgets, and safety-reserve authorities. The execution binds the
path, raw-byte hash, schema version, environment, status, evidence identity,
and exact evaluated budgets. The fresh recorded pre-Apply stage reads and
hashes the same file again and rejects deletion, tampering, environment/status
changes, insufficient budgets, or any changed binding. Preservation and
ordinary safe decreases need no capacity-budget artifact.

## Candidate revision capacity and identity

A future `capacity-aware-release` requires a complete non-null candidate
revision specification in this fixed order:

```json
{
  "revisionMaxInstances": 40,
  "concurrency": 200,
  "requestTimeoutSeconds": 3600,
  "sessionAffinity": true,
  "databaseConnectionLimit": 1
}
```

The candidate identity is:

```text
SHA256("capacity-v1\n" + artifactDigest + "\n" + canonicalRevisionCapacityJson)
candidate-<first 12 lowercase hex>
```

The control source SHA is deliberately excluded. The same artifact and same
revision capacity produce the same identity; any revision-capacity change
produces a different identity. Historical V1–V5 image-derived identities are
unchanged. In particular, the imported Staging tag
`candidate-5377bd0c7d84` and revision
`moazez-staging-api-candidate-5377bd0c7d84` are not recomputed.

During a Production emergency live posture of `5/40`, creation of a new
candidate preserves service `5/40`; it must not normalize to `1/10` while the
emergency revision serves traffic. The tagged candidate receives its own
complete revision specification and is counted independently. Optional
service-level normalization to a governed baseline is available only after
traffic promotion and stability validation. Revision normalization after
promotion is not supported.

The emergency-like Production revision profile `40 / 200 / 3600 / true / 1`
is only a future load-test candidate hypothesis. It is not a permanent
Production baseline and has not passed Production-shaped load testing.

## Production validation targets only

These are targets only, not achieved or passed results:

```text
TENANTS=10
TOTAL_USERS=25,000
PEAK_HTTP_RPS=200
CONCURRENT_WEBSOCKETS=5,000
12_MONTH_GROWTH=3x
```

Redis remains cross-instance synchronization authority. Session affinity is
an optimization, not a correctness boundary. This governance source does not
change Socket.IO, the Redis adapter, presence, typing, reconnect, WebSocket
contracts, application Redis behavior, Cloud SQL settings, Core DB limit `6`,
or Media DB limit `3`.

## Release V6 and the active Staging continuation

Release manifests use `releaseManifestVersion=6` independently from capacity
execution schema version 1. The supported modes are `capacity-aware-release`
and `post-edge-source-continuation`.

The active post-Edge continuation is bound to predecessor execution
`d2-v5-edge-20260915011016`, original manifest SHA-256
`2f778f8fadfa99002be545ccd1a1ccfdc5333eaffaa27cc600f3c6f401013b49`,
and predecessor source `3cc5a5275d6a4bd3e8b0ffb057f10db4da399edc`. The original bytes are hashed
before parsing and are never rewritten.

Its new control source must equal the current repository HEAD. Its Application
Artifact Authority remains the inherited image digest
`sha256:a256576ef34bf301c4677f367a8df1868925ffdcb88492ced1babfc5e74af240`
with no rebuild. Its candidate identity authority is
`imported-from-predecessor`.

The only executable continuation is:

```text
maintenance-scheduler-promotion / maintenance-scheduler-runtime
protected-readiness-and-smoke / protected-candidate-smoke
traffic-promotion / api-traffic-promotion
```

Migration, Core, Media, API candidate Runtime, and Candidate Edge cannot be
replayed. Their passed states appear only as immutable imported evidence.
Fresh discovery must bind all runtime images, candidate/stable identity and
traffic, independent Runtime and Edge state, service capacity, managed and
observed revision capacity, and worker counts.

For this exact V6 `post-edge-source-continuation`, fresh Runtime lineage and
serial must exactly equal the predecessor API Runtime post-Apply state, and
fresh Edge lineage and serial must exactly equal the predecessor Edge
post-Apply state. A same-lineage serial successor is a contradiction, not an
acceptable descendant; it requires a separately governed reconciliation
contract. This restriction does not change V1-V5 semantics.

The rejected Maintenance Saved Plan
`0cdff09279b0965a185b935ef4c961da5185d6cd92f81c7939f6543000febfd3`
is classified `BLOCKED_SCOPE_MISMATCH`, is added to the inherited blocklist,
and may never be registered, approved, applied, reused, or copied as fresh
authority.

A fresh continuation Maintenance plan must be `0 add / 1 change / 0 destroy`.
Its sole non-noop resource is Maintenance Scheduler and its sole semantic path
is `template[0].containers[0].image`, from the predecessor artifact to the
inherited candidate artifact. API, Core, and Media must be no-op. Capacity and
traffic changes fail the deterministic reviewer.

Future Release V6 non-capacity operations pass every Terraform-managed
capacity value explicitly and reject capacity drift. Only new API candidate
creation may authorize the complete revision-capacity fields, and only while
creating the capacity-derived candidate at zero normal traffic. Traffic
promotion remains blocked until protected candidate validation passes.
