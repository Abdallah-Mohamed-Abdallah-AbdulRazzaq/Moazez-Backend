locals {
  staging_secret_ids = {
    api_database_url                = "moazez-staging-api-database-url"
    core_worker_database_url        = "moazez-staging-core-worker-database-url"
    media_worker_database_url       = "moazez-staging-media-worker-database-url"
    migration_database_url          = "moazez-staging-migration-database-url"
    jwt_access_secret               = "moazez-staging-jwt-access-secret"
    jwt_refresh_secret              = "moazez-staging-jwt-refresh-secret"
    smtp_secret_encryption_key      = "moazez-staging-smtp-secret-encryption-key"
    app_device_token_encryption_key = "moazez-staging-app-device-token-encryption-key"
  }
}

module "secret_environment" {
  source = "../../modules/secret-environment"

  project_id           = var.project_id
  environment          = var.environment
  replication_location = var.replication_location
  secret_ids           = local.staging_secret_ids
}
