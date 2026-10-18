# GCS storage fast-path infrastructure

> Current source authority: [ADR-0016 Staging retirement](../../../adr/ADR-0016-staging-retirement-and-production-preservation.md). Staging/nonprod deployment and bootstrap recipes below are historical evidence and cannot be executed. Historical proofs use immutable commit `8449769bcb453dd3ac8436d2b71c133e6369f6fa` only in isolated synthetic tests. Production application/data contracts remain governed by their existing authorities.
>
> `gcs-batch2-readonly-proof.ps1` is historical-only and permanently refuses every target with `LEGACY_STORAGE_PROOF_RETIRED`. Its empty-bucket condition is superseded by ADR-0006 and the unchanged `IN_PLACE_LIVE_PRODUCTION` preservation contract: never clear, move, copy or reseed Production data to satisfy an old proof. `gcs-batch2-preflight.ps1 -Environment production` provides limited read-only inspection and does not replace the retired IAM/CORS compliance proof. No omitted, retired or unknown selector falls back to Production.

This directory contains the storage-only Terraform prepared by Batch 2A. It
does not create projects, configure billing, deploy application runtimes, or
manage Terraform state infrastructure.

`environments/nonprod` and `environments/production` are deliberately separate
Terraform roots. The required promotion order and operator-owned plan/apply
steps are defined in
`docs/production-readiness/phase-5a/01-gcs-iac-and-real-proof-runbook.md`.

Both roots currently use local Terraform state. State, plans, provider working
directories, and crash logs are ignored here. A reviewed remote-state design
requires separate Owner approval; the four application buckets must never be
used for Terraform state.

The module creates exactly two application buckets in one existing project,
the five storage-critical service accounts, additive IAM members, and the four
storage-critical control-plane API service resources. It creates no
service-account keys.

`serviceusage.googleapis.com` is deliberately not part of that managed API
collection. Service Usage must already be enabled by the Owner/bootstrap
operator before Terraform can manage Storage, IAM, IAM Credentials, and Cloud
Resource Manager APIs. The read-only preflight checks that prerequisite and
blocks planning when it is absent; this module does not claim to self-bootstrap
Service Usage.
