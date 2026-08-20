locals {
  production_secret_ids = {
    api_database_url                = "moazez-production-api-database-url"
    core_worker_database_url        = "moazez-production-core-worker-database-url"
    media_worker_database_url       = "moazez-production-media-worker-database-url"
    migration_database_url          = "moazez-production-migration-database-url"
    jwt_access_secret               = "moazez-production-jwt-access-secret"
    jwt_refresh_secret              = "moazez-production-jwt-refresh-secret"
    smtp_secret_encryption_key      = "moazez-production-smtp-secret-encryption-key"
    app_device_token_encryption_key = "moazez-production-app-device-token-encryption-key"
  }
}

module "secret_environment" {
  source = "../../modules/secret-environment"

  project_id           = var.project_id
  environment          = var.environment
  replication_location = var.replication_location
  secret_ids           = local.production_secret_ids
}
