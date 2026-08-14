# Staging Secret Manager container foundation

Stage 9E is repository Terraform source preparation only. It does not claim
that Deployment Stage 9 is complete, and it performs no Google Cloud mutation.

Authoritative Stage 9D live discovery found zero Secret Manager resources in
`moazez-nonprod-91001421934` before Stage 9E source preparation. That result is
historical pre-source discovery evidence, not a permanent assertion about the
project's current Secret Manager inventory. The Secret Manager API had already been enabled outside this stack; this stack neither enables nor manages APIs.

## Locked Staging design

| Component | Approved value |
| --- | --- |
| Project | `moazez-nonprod-91001421934` |
| Environment | `staging` |
| Resource kind | standard `google_secret_manager_secret` |
| Regional-secret resource | not used |
| Replication | user-managed |
| Replica count per secret | 1 |
| Replica location | `me-central2` |
| Deletion policy | `PREVENT` |
| Provider deletion protection | `true` |
| Terraform lifecycle `prevent_destroy` | `true` |
| Production resources | none |

This stack owns exactly these eight Secret Manager secret containers:

| Logical key | Secret ID | Purpose metadata |
| --- | --- | --- |
| `api_database_url` | `moazez-staging-api-database-url` | API `DATABASE_URL` |
| `core_worker_database_url` | `moazez-staging-core-worker-database-url` | Core Worker `DATABASE_URL` |
| `media_worker_database_url` | `moazez-staging-media-worker-database-url` | Media Worker `DATABASE_URL` |
| `migration_database_url` | `moazez-staging-migration-database-url` | governed Migration Job `DATABASE_URL` |
| `jwt_access_secret` | `moazez-staging-jwt-access-secret` | API `JWT_ACCESS_SECRET` |
| `jwt_refresh_secret` | `moazez-staging-jwt-refresh-secret` | API `JWT_REFRESH_SECRET` |
| `smtp_secret_encryption_key` | `moazez-staging-smtp-secret-encryption-key` | SMTP/email encryption family key material |
| `app_device_token_encryption_key` | `moazez-staging-app-device-token-encryption-key` | application device-token encryption family key material |

The purpose column is documentation only. No secret version, payload, alias,
IAM binding, or runtime configuration is created here.

## Exact ownership boundary

The stack owns only the eight containers instantiated by:

```text
module.secret_environment.google_secret_manager_secret.managed
```

It owns no secret versions or payload bytes, Secret Manager IAM, project IAM,
service accounts, API enablement, Cloud Run, Cloud SQL, database users or
passwords, Redis, storage, networking, Artifact Registry, Workload Identity
Federation, Pub/Sub, Cloud KMS, or Production resources. It contains no
Terraform data sources. Stage 11 owns future runtime Secret Manager IAM and
missing runtime service accounts.

Future consumer access is expected to follow this mapping, but no binding is
implemented by Stage 9E:

- API: `moazez-staging-api-database-url`,
  `moazez-staging-jwt-access-secret`, `moazez-staging-jwt-refresh-secret`,
  `moazez-staging-smtp-secret-encryption-key`, and
  `moazez-staging-app-device-token-encryption-key`.
- Core Worker: `moazez-staging-core-worker-database-url`,
  `moazez-staging-smtp-secret-encryption-key`, and
  `moazez-staging-app-device-token-encryption-key`.
- Media Worker: `moazez-staging-media-worker-database-url`.
- Migration Job: `moazez-staging-migration-database-url`.
- Maintenance Scheduler: no Stage 9 secret dependency.

## Remote-state governance

```text
REMOTE_STATE_MODEL=GCS
REMOTE_STATE_BUCKET=moazez-nonprod-91001421934-tfstate
REMOTE_STATE_PREFIX=secrets/staging
REMOTE_STATE_BUCKET_MANAGED_BY_THIS_STACK=NO
```

The state bucket is external to this stack. Stage 9E does not initialize or
access the real backend, create or import the bucket, query it through
Terraform, create state, or run a Terraform plan or apply.

## Version pinning and operational rotation

Q020 requires every runtime release to select immutable numeric Secret Manager
version references explicitly. The built-in `latest` reference is not an
approved release reference, and this stack configures no version aliases.
Runtime processes do not dynamically refresh secret versions.

The normal 90-day cadence is an operational version-rotation policy with a
staged seven-day active/previous overlap and a retained prior version for the
governed rollback window. Rotation, overlap, and rollback rehearsal remain
future live-deployment evidence and are not claimed complete by Stage 9E. It is
not the Terraform/Secret Manager rotation notification feature. Terraform
Secret Manager rotation scheduling, topics, and Pub/Sub resources are
intentionally unused. A later separately authorized operational gate owns
payload generation, secret-version creation, credential generation or
rotation, numeric version selection, and overlap rehearsal.

```text
ROTATION_REHEARSAL_COMPLETE=NO
```

## Encryption-family separation

Q021 keeps the `smtp-secret` and `app-device-token` AES-256-GCM families
physically separate. They use the two distinct family-specific Secret Manager
resources listed above. Future rotations for each family create versions of
that same family-specific resource; they never share one generic key resource.

The application envelope remains `v2:<keyId>:<iv>:<tag>:<ciphertext>`, with
authenticated context `v2:<family>:<keyId>`. Application key IDs are non-secret
release metadata, not Secret Manager payload containers and not Secret Manager
numeric version numbers. No separate containers are created for active or
previous application key IDs.

The legacy ciphertext inventory remains unknown, so the legacy v1 key remains
deferred pending evidence. No database inspection is performed by this stage:

```text
LEGACY_CIPHERTEXT_INVENTORY_STATUS=UNKNOWN
LEGACY_V1_SECRET_RESOURCE=NOT_CREATED_PENDING_EVIDENCE
```

## Deletion governance

Every container has provider `deletion_policy = "PREVENT"`, provider
`deletion_protection = true`, and Terraform lifecycle `prevent_destroy = true`.
An intentional future deletion requires a separately governed and reviewed
source change. Stage 9E configures no TTL, expiration, or version-destruction
schedule.
