# GCS storage fast-path infrastructure

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
