locals {
  current_contract = {
    project_id           = var.project_id
    environment          = var.environment
    replication_location = var.replication_location
    secret_ids           = var.secret_ids
  }

  staging_contract = {
    project_id           = "moazez-nonprod-91001421934"
    environment          = "staging"
    replication_location = "me-central2"
    secret_ids = tomap({
      api_database_url                = "moazez-staging-api-database-url"
      core_worker_database_url        = "moazez-staging-core-worker-database-url"
      media_worker_database_url       = "moazez-staging-media-worker-database-url"
      migration_database_url          = "moazez-staging-migration-database-url"
      jwt_access_secret               = "moazez-staging-jwt-access-secret"
      jwt_refresh_secret              = "moazez-staging-jwt-refresh-secret"
      smtp_secret_encryption_key      = "moazez-staging-smtp-secret-encryption-key"
      app_device_token_encryption_key = "moazez-staging-app-device-token-encryption-key"
    })
  }

  production_contract = {
    project_id           = "moazez-production"
    environment          = "production"
    replication_location = "me-central2"
    secret_ids = tomap({
      api_database_url                = "moazez-production-api-database-url"
      core_worker_database_url        = "moazez-production-core-worker-database-url"
      media_worker_database_url       = "moazez-production-media-worker-database-url"
      migration_database_url          = "moazez-production-migration-database-url"
      jwt_access_secret               = "moazez-production-jwt-access-secret"
      jwt_refresh_secret              = "moazez-production-jwt-refresh-secret"
      smtp_secret_encryption_key      = "moazez-production-smtp-secret-encryption-key"
      app_device_token_encryption_key = "moazez-production-app-device-token-encryption-key"
    })
  }

  governed_contract = (
    local.current_contract == local.staging_contract ||
    local.current_contract == local.production_contract
  )
}

resource "google_secret_manager_secret" "managed" {
  for_each = var.secret_ids

  project             = var.project_id
  secret_id           = each.value
  deletion_policy     = "PREVENT"
  deletion_protection = true

  labels = {
    environment = var.environment
  }

  replication {
    user_managed {
      replicas {
        location = var.replication_location
      }
    }
  }

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.governed_contract
      error_message = "The Secret Manager environment must match the complete governed Staging or Production tuple."
    }
  }
}
