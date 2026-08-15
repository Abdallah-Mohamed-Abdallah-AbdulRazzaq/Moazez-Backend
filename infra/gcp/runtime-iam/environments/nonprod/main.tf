locals {
  existing_runtime_service_account_ids = {
    api_runtime  = "moazez-api-runtime"
    core_worker  = "moazez-core-worker"
    media_worker = "moazez-media-worker"
  }

  managed_runtime_service_accounts = {
    migration_job = {
      account_id   = "moazez-migration-job"
      display_name = "Moazez Migration Job"
    }
    maintenance_scheduler = {
      account_id   = "moazez-maintenance-scheduler"
      display_name = "Moazez Maintenance Scheduler"
    }
  }

  secret_access_grants = {
    api_database_url = {
      runtime_identity_key = "api_runtime"
      secret_id            = "moazez-staging-api-database-url"
    }
    api_jwt_access_secret = {
      runtime_identity_key = "api_runtime"
      secret_id            = "moazez-staging-jwt-access-secret"
    }
    api_jwt_refresh_secret = {
      runtime_identity_key = "api_runtime"
      secret_id            = "moazez-staging-jwt-refresh-secret"
    }
    api_smtp_secret_encryption_key = {
      runtime_identity_key = "api_runtime"
      secret_id            = "moazez-staging-smtp-secret-encryption-key"
    }
    api_app_device_token_encryption_key = {
      runtime_identity_key = "api_runtime"
      secret_id            = "moazez-staging-app-device-token-encryption-key"
    }
    core_worker_database_url = {
      runtime_identity_key = "core_worker"
      secret_id            = "moazez-staging-core-worker-database-url"
    }
    core_worker_smtp_secret_encryption_key = {
      runtime_identity_key = "core_worker"
      secret_id            = "moazez-staging-smtp-secret-encryption-key"
    }
    core_worker_app_device_token_encryption_key = {
      runtime_identity_key = "core_worker"
      secret_id            = "moazez-staging-app-device-token-encryption-key"
    }
    media_worker_database_url = {
      runtime_identity_key = "media_worker"
      secret_id            = "moazez-staging-media-worker-database-url"
    }
    migration_job_database_url = {
      runtime_identity_key = "migration_job"
      secret_id            = "moazez-staging-migration-database-url"
    }
  }
}

module "runtime_iam_environment" {
  source = "../../modules/runtime-iam-environment"

  project_id                           = var.project_id
  environment                          = var.environment
  existing_runtime_service_account_ids = local.existing_runtime_service_account_ids
  managed_runtime_service_accounts     = local.managed_runtime_service_accounts
  secret_access_grants                 = local.secret_access_grants
}
