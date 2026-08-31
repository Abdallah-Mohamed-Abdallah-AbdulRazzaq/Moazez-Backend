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

## Optional staging candidate route

The two candidate inputs are:

| Input                    | Disabled contract | Enabled contract               |
| ------------------------ | ----------------- | ------------------------------ |
| `candidate_edge_enabled` | `false`           | `true`, Staging only           |
| `candidate_api_tag`      | `null`            | `candidate-<12 lowercase hex>` |

Production passes `false` and `null` explicitly and exposes no override. The
module also rejects an enabled candidate route unless `environment` is
`staging`, rejects an enabled route without a valid tag, and rejects a stale
tag while the capability is disabled.

When enabled in the nonprod root, Terraform adds only:

- `module.edge_environment.google_compute_region_network_endpoint_group.api_candidate[0]`, targeting the existing `moazez-staging-api` Cloud Run service plus the exact candidate tag;
- `module.edge_environment.google_compute_backend_service.api_candidate[0]`, retaining the normal API backend's Cloud Armor policy and trusted client-IP request header;
- one exact path rule on `module.edge_environment.google_compute_url_map.edge`.

The exact public verification path is:

```text
GET https://staging-api.moazez.cloud/.well-known/moazez/candidate-readiness
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

The `api-no-traffic-promotion` release gate first creates the tagged API
revision in the backend-runtime root and then enables this edge capability as
an ordered suboperation. After candidate verification and normal traffic
promotion, disabling the candidate inputs removes only the tagged NEG,
candidate backend, and exact route. Cleanup is intentionally outside the six
authoritative release gates and requires separate post-release approval.

Native tests live under `environments/nonprod/tests`. Initialize and run them
only with an external `TF_DATA_DIR` and backend-disabled initialization.
