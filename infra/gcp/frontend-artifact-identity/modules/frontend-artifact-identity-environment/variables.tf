variable "project_id" {
  description = "Production Google Cloud project that owns the frontend artifact identity resources."
  type        = string

  validation {
    condition     = var.project_id == "moazez-production"
    error_message = "project_id must be moazez-production."
  }
}

variable "project_number" {
  description = "Production project number used in Workload Identity principal identifiers."
  type        = string

  validation {
    condition     = var.project_number == "91001421934"
    error_message = "project_number must be 91001421934."
  }
}

variable "environment" {
  description = "Closed frontend artifact identity environment selector."
  type        = string

  validation {
    condition     = var.environment == "production"
    error_message = "environment must be production."
  }
}

variable "github_owner_name" {
  description = "Approved immutable GitHub repository owner name."
  type        = string

  validation {
    condition     = var.github_owner_name == "Abdallah-Mohamed-Abdallah-AbdulRazzaq"
    error_message = "github_owner_name must match the approved MOAZEZ owner."
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

variable "github_allowed_ref" {
  description = "Only Git ref accepted by the frontend artifact providers."
  type        = string

  validation {
    condition     = var.github_allowed_ref == "refs/heads/main"
    error_message = "github_allowed_ref must be refs/heads/main."
  }
}

variable "workload_identity_pool_id" {
  description = "Existing Production GitHub Workload Identity Pool ID."
  type        = string

  validation {
    condition     = var.workload_identity_pool_id == "moazez-github-production"
    error_message = "workload_identity_pool_id must be moazez-github-production."
  }
}

variable "platform_admin_repository" {
  description = "Approved Platform Admin GitHub repository name with owner."
  type        = string

  validation {
    condition     = var.platform_admin_repository == "Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Platform-Admin"
    error_message = "platform_admin_repository must match the approved repository."
  }
}

variable "platform_admin_repository_id" {
  description = "Approved immutable Platform Admin repository numeric ID."
  type        = string

  validation {
    condition     = var.platform_admin_repository_id == "1335685284"
    error_message = "platform_admin_repository_id must be 1335685284."
  }
}

variable "platform_admin_wif_provider_id" {
  description = "Production GitHub OIDC provider ID for Platform Admin main."
  type        = string

  validation {
    condition     = var.platform_admin_wif_provider_id == "moazez-platform-admin-main"
    error_message = "platform_admin_wif_provider_id must be moazez-platform-admin-main."
  }
}

variable "school_dashboard_repository" {
  description = "Approved School Dashboard GitHub repository name with owner."
  type        = string

  validation {
    condition     = var.school_dashboard_repository == "Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-School-Dashboard"
    error_message = "school_dashboard_repository must match the approved repository."
  }
}

variable "school_dashboard_repository_id" {
  description = "Approved immutable School Dashboard repository numeric ID."
  type        = string

  validation {
    condition     = var.school_dashboard_repository_id == "1335686453"
    error_message = "school_dashboard_repository_id must be 1335686453."
  }
}

variable "school_dashboard_wif_provider_id" {
  description = "Production GitHub OIDC provider ID for School Dashboard main."
  type        = string

  validation {
    condition     = var.school_dashboard_wif_provider_id == "moazez-school-dashboard-main"
    error_message = "school_dashboard_wif_provider_id must be moazez-school-dashboard-main."
  }
}

variable "artifact_builder_service_account_id" {
  description = "Dedicated Production frontend artifact builder account ID."
  type        = string

  validation {
    condition     = var.artifact_builder_service_account_id == "moazez-ui-artifact-builder"
    error_message = "artifact_builder_service_account_id must be moazez-ui-artifact-builder."
  }
}

variable "artifact_registry_project_id" {
  description = "Project containing the governed Production Artifact Registry repository."
  type        = string

  validation {
    condition     = var.artifact_registry_project_id == "moazez-production"
    error_message = "artifact_registry_project_id must be moazez-production."
  }
}

variable "artifact_registry_location" {
  description = "Location of the governed Production Artifact Registry repository."
  type        = string

  validation {
    condition     = var.artifact_registry_location == "me-central2"
    error_message = "artifact_registry_location must be me-central2."
  }
}

variable "artifact_registry_repository_id" {
  description = "Governed Production Artifact Registry repository ID."
  type        = string

  validation {
    condition     = var.artifact_registry_repository_id == "moazez-production-containers"
    error_message = "artifact_registry_repository_id must be moazez-production-containers."
  }
}
