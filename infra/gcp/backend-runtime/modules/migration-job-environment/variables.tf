variable "project_id" {
  description = "GCP project that owns the governed Migration Job."
  type        = string
}

variable "region" {
  description = "GCP region for the governed Migration Job."
  type        = string
}

variable "network" {
  description = "VPC network used by the governed Migration Job."
  type        = string
}

variable "subnetwork" {
  description = "VPC subnetwork used by the governed Migration Job."
  type        = string
}

variable "migration_job_name" {
  description = "Name of the governed Migration Job."
  type        = string
}

variable "migration_service_account" {
  description = "Existing service account used by the governed Migration Job."
  type        = string
}

variable "migration_job_environment" {
  description = "Stable environment identifier persisted on the governed Migration Job."
  type        = string
}

variable "migration_database_secret_id" {
  description = "Secret Manager secret ID containing the Migration Job database URL."
  type        = string
}

variable "migration_database_secret_version" {
  description = "Explicit Secret Manager version used by the governed Migration Job."
  type        = string

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.migration_database_secret_version))
    error_message = "migration_database_secret_version must be a canonical positive numeric version string."
  }
}

variable "image_reference" {
  description = "Immutable backend image digest for the governed Migration Job."
  type        = string

  validation {
    condition = (
      can(regex(
        "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$",
        var.image_reference,
      )) ||
      can(regex(
        "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-backend@sha256:[a-f0-9]{64}$",
        var.image_reference,
      ))
    )
    error_message = "image_reference must use a governed staging or production backend package pinned by a lowercase sha256 digest."
  }
}
