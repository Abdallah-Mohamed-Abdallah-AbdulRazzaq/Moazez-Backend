variable "project_id" {
  description = "Existing Google Cloud project that owns the governed secret containers."
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

variable "replication_location" {
  description = "Google Cloud location for the single user-managed replica."
  type        = string

  validation {
    condition     = var.replication_location == "me-central2"
    error_message = "replication_location must be me-central2."
  }
}

variable "secret_ids" {
  description = "Exact logical-key to Secret Manager secret-ID map for a governed environment."
  type        = map(string)

  validation {
    condition = (
      (
        length(var.secret_ids) == 8 &&
        lookup(var.secret_ids, "api_database_url", "") == "moazez-staging-api-database-url" &&
        lookup(var.secret_ids, "core_worker_database_url", "") == "moazez-staging-core-worker-database-url" &&
        lookup(var.secret_ids, "media_worker_database_url", "") == "moazez-staging-media-worker-database-url" &&
        lookup(var.secret_ids, "migration_database_url", "") == "moazez-staging-migration-database-url" &&
        lookup(var.secret_ids, "jwt_access_secret", "") == "moazez-staging-jwt-access-secret" &&
        lookup(var.secret_ids, "jwt_refresh_secret", "") == "moazez-staging-jwt-refresh-secret" &&
        lookup(var.secret_ids, "smtp_secret_encryption_key", "") == "moazez-staging-smtp-secret-encryption-key" &&
        lookup(var.secret_ids, "app_device_token_encryption_key", "") == "moazez-staging-app-device-token-encryption-key"
      ) ||
      (
        length(var.secret_ids) == 8 &&
        lookup(var.secret_ids, "api_database_url", "") == "moazez-production-api-database-url" &&
        lookup(var.secret_ids, "core_worker_database_url", "") == "moazez-production-core-worker-database-url" &&
        lookup(var.secret_ids, "media_worker_database_url", "") == "moazez-production-media-worker-database-url" &&
        lookup(var.secret_ids, "migration_database_url", "") == "moazez-production-migration-database-url" &&
        lookup(var.secret_ids, "jwt_access_secret", "") == "moazez-production-jwt-access-secret" &&
        lookup(var.secret_ids, "jwt_refresh_secret", "") == "moazez-production-jwt-refresh-secret" &&
        lookup(var.secret_ids, "smtp_secret_encryption_key", "") == "moazez-production-smtp-secret-encryption-key" &&
        lookup(var.secret_ids, "app_device_token_encryption_key", "") == "moazez-production-app-device-token-encryption-key"
      )
    )
    error_message = "secret_ids must contain exactly the eight approved Staging or Production secret containers."
  }
}
