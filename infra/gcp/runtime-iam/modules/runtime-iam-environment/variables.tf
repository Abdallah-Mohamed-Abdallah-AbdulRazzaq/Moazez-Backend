variable "project_id" {
  description = "Existing Google Cloud project that owns a governed environment's runtime identities and secret IAM memberships."
  type        = string

  validation {
    condition = contains([
      "moazez-nonprod-91001421934",
      "moazez-production",
    ], var.project_id)
    error_message = "project_id must be a governed Staging or Production project."
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

variable "existing_runtime_service_account_ids" {
  description = "Exact logical-key to account-ID map for runtime identities owned by the Storage stack."
  type        = map(string)

  validation {
    condition = (
      length(var.existing_runtime_service_account_ids) == 3 &&
      try(var.existing_runtime_service_account_ids["api_runtime"], "") == "moazez-api-runtime" &&
      try(var.existing_runtime_service_account_ids["core_worker"], "") == "moazez-core-worker" &&
      try(var.existing_runtime_service_account_ids["media_worker"], "") == "moazez-media-worker"
    )
    error_message = "existing_runtime_service_account_ids must contain exactly the approved API, Core Worker, and Media Worker account IDs."
  }
}

variable "managed_runtime_service_accounts" {
  description = "Exact service accounts owned by this Runtime IAM stack."
  type = map(object({
    account_id   = string
    display_name = string
  }))

  validation {
    condition = (
      length(var.managed_runtime_service_accounts) == 2 &&
      try(var.managed_runtime_service_accounts["migration_job"].account_id, "") == "moazez-migration-job" &&
      try(var.managed_runtime_service_accounts["migration_job"].display_name, "") == "Moazez Migration Job" &&
      try(var.managed_runtime_service_accounts["maintenance_scheduler"].account_id, "") == "moazez-maintenance-scheduler" &&
      try(var.managed_runtime_service_accounts["maintenance_scheduler"].display_name, "") == "Moazez Maintenance Scheduler"
    )
    error_message = "managed_runtime_service_accounts must contain exactly the approved Migration Job and Maintenance Scheduler identities."
  }
}

variable "secret_access_grants" {
  description = "Exact logical-key map of governed Staging or Production secret-level Secret Accessor grants."
  type = map(object({
    runtime_identity_key = string
    secret_id            = string
  }))

  validation {
    condition = (
      length(var.secret_access_grants) == 10 &&
      (
        (
          try(var.secret_access_grants["api_database_url"].runtime_identity_key, "") == "api_runtime" &&
          try(var.secret_access_grants["api_database_url"].secret_id, "") == "moazez-staging-api-database-url" &&
          try(var.secret_access_grants["api_jwt_access_secret"].runtime_identity_key, "") == "api_runtime" &&
          try(var.secret_access_grants["api_jwt_access_secret"].secret_id, "") == "moazez-staging-jwt-access-secret" &&
          try(var.secret_access_grants["api_jwt_refresh_secret"].runtime_identity_key, "") == "api_runtime" &&
          try(var.secret_access_grants["api_jwt_refresh_secret"].secret_id, "") == "moazez-staging-jwt-refresh-secret" &&
          try(var.secret_access_grants["api_smtp_secret_encryption_key"].runtime_identity_key, "") == "api_runtime" &&
          try(var.secret_access_grants["api_smtp_secret_encryption_key"].secret_id, "") == "moazez-staging-smtp-secret-encryption-key" &&
          try(var.secret_access_grants["api_app_device_token_encryption_key"].runtime_identity_key, "") == "api_runtime" &&
          try(var.secret_access_grants["api_app_device_token_encryption_key"].secret_id, "") == "moazez-staging-app-device-token-encryption-key" &&
          try(var.secret_access_grants["core_worker_database_url"].runtime_identity_key, "") == "core_worker" &&
          try(var.secret_access_grants["core_worker_database_url"].secret_id, "") == "moazez-staging-core-worker-database-url" &&
          try(var.secret_access_grants["core_worker_smtp_secret_encryption_key"].runtime_identity_key, "") == "core_worker" &&
          try(var.secret_access_grants["core_worker_smtp_secret_encryption_key"].secret_id, "") == "moazez-staging-smtp-secret-encryption-key" &&
          try(var.secret_access_grants["core_worker_app_device_token_encryption_key"].runtime_identity_key, "") == "core_worker" &&
          try(var.secret_access_grants["core_worker_app_device_token_encryption_key"].secret_id, "") == "moazez-staging-app-device-token-encryption-key" &&
          try(var.secret_access_grants["media_worker_database_url"].runtime_identity_key, "") == "media_worker" &&
          try(var.secret_access_grants["media_worker_database_url"].secret_id, "") == "moazez-staging-media-worker-database-url" &&
          try(var.secret_access_grants["migration_job_database_url"].runtime_identity_key, "") == "migration_job" &&
          try(var.secret_access_grants["migration_job_database_url"].secret_id, "") == "moazez-staging-migration-database-url"
        ) ||
        (
          try(var.secret_access_grants["api_database_url"].runtime_identity_key, "") == "api_runtime" &&
          try(var.secret_access_grants["api_database_url"].secret_id, "") == "moazez-production-api-database-url" &&
          try(var.secret_access_grants["api_jwt_access_secret"].runtime_identity_key, "") == "api_runtime" &&
          try(var.secret_access_grants["api_jwt_access_secret"].secret_id, "") == "moazez-production-jwt-access-secret" &&
          try(var.secret_access_grants["api_jwt_refresh_secret"].runtime_identity_key, "") == "api_runtime" &&
          try(var.secret_access_grants["api_jwt_refresh_secret"].secret_id, "") == "moazez-production-jwt-refresh-secret" &&
          try(var.secret_access_grants["api_smtp_secret_encryption_key"].runtime_identity_key, "") == "api_runtime" &&
          try(var.secret_access_grants["api_smtp_secret_encryption_key"].secret_id, "") == "moazez-production-smtp-secret-encryption-key" &&
          try(var.secret_access_grants["api_app_device_token_encryption_key"].runtime_identity_key, "") == "api_runtime" &&
          try(var.secret_access_grants["api_app_device_token_encryption_key"].secret_id, "") == "moazez-production-app-device-token-encryption-key" &&
          try(var.secret_access_grants["core_worker_database_url"].runtime_identity_key, "") == "core_worker" &&
          try(var.secret_access_grants["core_worker_database_url"].secret_id, "") == "moazez-production-core-worker-database-url" &&
          try(var.secret_access_grants["core_worker_smtp_secret_encryption_key"].runtime_identity_key, "") == "core_worker" &&
          try(var.secret_access_grants["core_worker_smtp_secret_encryption_key"].secret_id, "") == "moazez-production-smtp-secret-encryption-key" &&
          try(var.secret_access_grants["core_worker_app_device_token_encryption_key"].runtime_identity_key, "") == "core_worker" &&
          try(var.secret_access_grants["core_worker_app_device_token_encryption_key"].secret_id, "") == "moazez-production-app-device-token-encryption-key" &&
          try(var.secret_access_grants["media_worker_database_url"].runtime_identity_key, "") == "media_worker" &&
          try(var.secret_access_grants["media_worker_database_url"].secret_id, "") == "moazez-production-media-worker-database-url" &&
          try(var.secret_access_grants["migration_job_database_url"].runtime_identity_key, "") == "migration_job" &&
          try(var.secret_access_grants["migration_job_database_url"].secret_id, "") == "moazez-production-migration-database-url"
        )
      )
    )
    error_message = "secret_access_grants must contain exactly the ten approved Staging or Production secret-level memberships."
  }
}
