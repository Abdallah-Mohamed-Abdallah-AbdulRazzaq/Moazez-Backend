# Google Cloud edge Terraform source

This directory owns the existing Staging and Production external Application
Load Balancer source. Source validation is not deployment: it does not create
a plan, apply Terraform, alter DNS, or mutate either environment.

## Existing edge identity

The shared module continues to use one environment hostname set, global IP,
Cloud Armor policy, URL map, managed certificate, certificate map, HTTPS proxy,
and forwarding rule. The normal API serverless NEG remains service-level and
untagged. The candidate capability creates no hostname, DNS record, IP,
certificate, proxy, forwarding rule, or parallel ingress architecture.

## Optional governed candidate route

The two candidate inputs are:

| Input                    | Disabled contract | Enabled contract                                                 |
| ------------------------ | ----------------- | ---------------------------------------------------------------- |
| `candidate_edge_enabled` | `false`           | `true`, for governed Staging or Production only                  |
| `candidate_api_tag`      | `null`            | `candidate-<12 lowercase hex>` or that base plus canonical `-rN` |

Both Staging and Production default to `candidate_edge_enabled=false` and
`candidate_api_tag=null`. Merging this source therefore creates no Candidate
resources. Production activation requires explicit, separately governed
DevOps inputs and a new Saved Plan; this source change is not that operation.
The module rejects an enabled candidate route outside the governed `staging`
and `production` environments, rejects an enabled route without a valid tag,
and rejects a stale tag while the capability is disabled.

The recovery suffix range is `1` through `999999999999999`, with no leading
zero. Edge validates canonical shape only because it does not own the image
reference. Deployment control and the runtime module bind the exact tag to the
approved immutable image where that controller is used.

When explicitly enabled in either governed root, Terraform adds only:

- `module.edge_environment.google_compute_region_network_endpoint_group.api_candidate[0]`, targeting that environment's existing API Cloud Run service plus the exact candidate tag;
- `module.edge_environment.google_compute_backend_service.api_candidate[0]`, retaining the normal API backend's Cloud Armor policy and trusted client-IP request header;
- one exact path rule on `module.edge_environment.google_compute_url_map.edge`.

The Candidate NEG physical identity is tag-derived and is never truncated,
hashed, or replaced:

```text
moazez-${environment}-api-${candidate_api_tag}-neg
```

The canonical tag grammar permits recovery suffixes of up to 15 digits. The
physical-name boundary is environment-specific because Production has a
longer deterministic prefix. Staging supports the 15-digit maximum, producing
a 62-character NEG name. Production supports up to 13 recovery digits,
producing a 63-character name; a canonical 14-digit Production recovery tag is
rejected by the Candidate NEG's resource-level RFC1035/63-character guard.
This physical restriction does not redefine the canonical tag grammar.

For the current Production test fixture, `candidate-cf720dacbc04` produces
`moazez-production-api-candidate-cf720dacbc04-neg`. The Candidate Backend is
`moazez-production-api-candidate-backend`, and the URL map is
`moazez-production-edge-url-map`. For Staging, the corresponding identities
retain the `moazez-staging` prefix. Only the Backend's direct
`api_candidate[0].id` dependency moves to a successor NEG.

The exact public verification path is:

```text
GET https://<governed-api-hostname>/.well-known/moazez/candidate-readiness
```

The URL map rewrites that exact path to the existing protected application
route:

```text
GET /api/v1/auth/me
```

The backend endpoint retains its application authentication and authorization;
the edge adds no public bypass and no arbitrary candidate prefix. The route
therefore exercises the existing ALB, candidate-tagged NEG, zero-normal-traffic
revision, and protected API handler.

## Lifecycle

The Candidate NEG declares `create_before_destroy = true`. A tag change can
therefore create the distinct tag-derived successor before the stable
Candidate Backend switches its group and Terraform removes the predecessor
NEG. This avoids the `resourceInUseByAnotherResource` failure caused by the
historical fixed-name, destroy-first replacement. Cloud Armor, the trusted
client-IP header, and the single candidate smoke route do not change during
the rotation.

The `api-no-traffic-promotion` release gate first creates the tagged API
revision in the backend-runtime root and then enables this edge capability as
an ordered suboperation. After candidate verification and normal traffic
promotion, disabling the candidate inputs removes only the tagged NEG,
candidate backend, and exact route. Cleanup is intentionally outside the six
authoritative release gates and requires separate post-release approval.

Normal manifest v1 reaches this gate after Core and Media promotion. Recovery
manifest v2 treats those stages as passed evidence, binds API Runtime directly
to rediscovered runtime state, then binds this API Edge operation directly to
independently rediscovered edge state. The same candidate NEG, backend security
posture, and single authenticated smoke route are used; no recovery-specific
edge resource or security bypass is introduced.

Native tests live under `environments/nonprod/tests`. Initialize and run them
only with an external `TF_DATA_DIR` and backend-disabled initialization.
