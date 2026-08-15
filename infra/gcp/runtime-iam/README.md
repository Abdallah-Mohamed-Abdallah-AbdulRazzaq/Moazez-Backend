# Staging runtime IAM foundation

```text
STAGE_11B_SOURCE_ONLY=YES
```

Stage 11B is repository Terraform source preparation only. It performs no
Google Cloud mutation. Live Terraform plan and apply are later, separately
gated operations.

Stage 11A was point-in-time read-only discovery. It found five of the seven
approved Moazez service accounts already present and two missing. The five
existing accounts remain owned by the Storage Terraform stack:

- `moazez-api-runtime`
- `moazez-core-worker`
- `moazez-media-worker`
- `moazez-iac-deployer`
- `moazez-gcs-signer`

This Runtime IAM stack does not manage, recreate, import, or absorb those five
accounts or their existing project/storage IAM. It owns only the two accounts
that Stage 11A found missing:

- `moazez-migration-job`
- `moazez-maintenance-scheduler`

Stage 11A also found three existing Moazez project IAM bindings, all within the
established Storage boundary. They remain untouched. None of the ten required
runtime Secret Manager memberships existed at that discovery point.

Both managed accounts use two deletion safeguards:

```text
deletion_policy=PREVENT
lifecycle.prevent_destroy=true
```

If later live planning finds either supposedly missing account already
present, that is discovery mismatch or drift requiring a separate governance
decision. This source does not conceal that condition with
`create_ignore_already_exists`.

## Secret access ownership

The Secret Manager Terraform stack owns the eight existing Staging secret
containers. This stack does not recreate those containers, manage versions or
payloads, create aliases, or couple to the Secrets state through
`terraform_remote_state`.

The Runtime IAM stack owns exactly ten additive, secret-level
`roles/secretmanager.secretAccessor` memberships:

| Runtime identity | Secret ID |
| --- | --- |
| `moazez-api-runtime` | `moazez-staging-api-database-url` |
| `moazez-api-runtime` | `moazez-staging-jwt-access-secret` |
| `moazez-api-runtime` | `moazez-staging-jwt-refresh-secret` |
| `moazez-api-runtime` | `moazez-staging-smtp-secret-encryption-key` |
| `moazez-api-runtime` | `moazez-staging-app-device-token-encryption-key` |
| `moazez-core-worker` | `moazez-staging-core-worker-database-url` |
| `moazez-core-worker` | `moazez-staging-smtp-secret-encryption-key` |
| `moazez-core-worker` | `moazez-staging-app-device-token-encryption-key` |
| `moazez-media-worker` | `moazez-staging-media-worker-database-url` |
| `moazez-migration-job` | `moazez-staging-migration-database-url` |

Access is least-privilege and secret-specific. Maintenance Scheduler has no
Stage 9 secret dependency and receives no Secret Manager membership here.
There is no project-wide Secret Accessor grant and no authoritative IAM policy
or binding resource that could replace unrelated secret IAM. Existing secret
IAM remains additive.

Stage 11A found zero user-managed keys on the existing Moazez service
accounts. This stack creates no `google_service_account_key`, credential JSON,
private key, access token, secret payload, or secret version.

## Exact ownership boundary

The reusable module owns exactly two Terraform managed resource types and no
data sources:

```text
google_service_account.runtime                    # 2 expanded instances
google_secret_manager_secret_iam_member.secret_accessor # 10 expanded instances
```

The two static resource blocks expand to exactly 12 managed resource
instances. The module owns no project IAM, service-account IAM, API
enablement, Workload Identity Federation, Artifact Registry IAM, image pull
authorization, deployer impersonation, Cloud Run, Cloud Run Jobs, Cloud SQL,
Redis, networking, storage, KMS, Pub/Sub, secret containers, or Production
resources.

Stage 12 owns GitHub Workload Identity Federation and deployer authorization.
Stage 13 owns backend runtime deployment. Stage 11B does not pull either stage
into this source domain.

## Remote-state governance

```text
REMOTE_STATE_MODEL=GCS
REMOTE_STATE_BUCKET=moazez-nonprod-91001421934-tfstate
REMOTE_STATE_PREFIX=runtime-iam/staging
REMOTE_STATE_BUCKET_MANAGED_BY_THIS_STACK=NO
```

The backend bucket and prefix are external state governance. This stack does
not own the state bucket, state bucket IAM, or state infrastructure. Stage 11B
must validate only with backend-disabled initialization in an isolated
Terraform data directory. It does not initialize or access the real GCS
backend and runs no live plan, apply, import, or state mutation.
