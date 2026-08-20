variable "project_id" {
  description = "Existing Google Cloud project that owns governed deployment identity resources."
  type        = string

  validation {
    condition = contains([
      "moazez-nonprod-91001421934",
      "moazez-production",
    ], var.project_id)
    error_message = "project_id must be a governed Staging or Production project."
  }
}

variable "project_number" {
  description = "Existing Google Cloud project number used in Workload Identity principal identifiers."
  type        = string

  validation {
    condition = contains([
      "375161231141",
      "91001421934",
    ], var.project_number)
    error_message = "project_number must be a governed Staging or Production project number."
  }
}

variable "environment" {
  description = "Deployment environment represented by this module instance."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "github_owner_name" {
  description = "Approved immutable GitHub repository owner name."
  type        = string

  validation {
    condition     = var.github_owner_name == "Abdallah-Mohamed-Abdallah-AbdulRazzaq"
    error_message = "github_owner_name must match the approved MOAZEZ repository owner."
  }
}

variable "github_owner_id" {
  description = "Approved immutable GitHub repository owner numeric ID."
  type        = string

  validation {
    condition     = var.github_owner_id == "127324203"
    error_message = "github_owner_id must be 127324203."
  }
}

variable "github_repository" {
  description = "Approved GitHub repository name with owner."
  type        = string

  validation {
    condition     = var.github_repository == "Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend"
    error_message = "github_repository must match the approved MOAZEZ Backend repository."
  }
}

variable "github_repository_id" {
  description = "Approved immutable GitHub repository numeric ID."
  type        = string

  validation {
    condition     = var.github_repository_id == "1217512033"
    error_message = "github_repository_id must be 1217512033."
  }
}

variable "github_allowed_ref" {
  description = "Only Git ref accepted by a governed deployment identity provider."
  type        = string

  validation {
    condition     = var.github_allowed_ref == "refs/heads/main"
    error_message = "github_allowed_ref must be refs/heads/main."
  }
}

variable "workload_identity_pool_id" {
  description = "Persistent governed GitHub Workload Identity Pool ID."
  type        = string

  validation {
    condition = contains([
      "moazez-github-staging",
      "moazez-github-production",
    ], var.workload_identity_pool_id)
    error_message = "workload_identity_pool_id must be a governed Staging or Production pool ID."
  }
}

variable "workload_identity_provider_id" {
  description = "GitHub OIDC provider ID for the approved MOAZEZ Backend main branch."
  type        = string

  validation {
    condition     = var.workload_identity_provider_id == "moazez-backend-main"
    error_message = "workload_identity_provider_id must be moazez-backend-main."
  }
}

variable "iac_deployer_service_account_id" {
  description = "Existing IaC deployer service-account ID owned by the Storage stack."
  type        = string

  validation {
    condition     = var.iac_deployer_service_account_id == "moazez-iac-deployer"
    error_message = "iac_deployer_service_account_id must be moazez-iac-deployer."
  }
}

variable "artifact_registry_location" {
  description = "Location of the existing governed Artifact Registry repository."
  type        = string

  validation {
    condition     = var.artifact_registry_location == "me-central2"
    error_message = "artifact_registry_location must be me-central2."
  }
}

variable "artifact_registry_repository_id" {
  description = "Existing governed Artifact Registry repository ID."
  type        = string

  validation {
    condition = contains([
      "moazez-staging-containers",
      "moazez-production-containers",
    ], var.artifact_registry_repository_id)
    error_message = "artifact_registry_repository_id must be a governed Staging or Production repository ID."
  }
}

variable "terraform_state_bucket" {
  description = "Existing GCS bucket that owns remote Terraform state."
  type        = string

  validation {
    condition = contains([
      "moazez-nonprod-91001421934-tfstate",
      "moazez-production-91001421934-tfstate",
    ], var.terraform_state_bucket)
    error_message = "terraform_state_bucket must be a governed Staging or Production state bucket."
  }
}

variable "runtime_service_account_ids" {
  description = "Exact runtime service-account IDs on which the IaC deployer may actAs."
  type        = map(string)

  validation {
    condition = (
      length(var.runtime_service_account_ids) == 5 &&
      try(var.runtime_service_account_ids["api_runtime"], "") == "moazez-api-runtime" &&
      try(var.runtime_service_account_ids["core_worker"], "") == "moazez-core-worker" &&
      try(var.runtime_service_account_ids["media_worker"], "") == "moazez-media-worker" &&
      try(var.runtime_service_account_ids["migration_job"], "") == "moazez-migration-job" &&
      try(var.runtime_service_account_ids["maintenance_scheduler"], "") == "moazez-maintenance-scheduler"
    )
    error_message = "runtime_service_account_ids must contain exactly the five approved runtime identities."
  }
}
