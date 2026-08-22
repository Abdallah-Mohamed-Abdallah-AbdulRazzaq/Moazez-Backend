locals {
  current_contract = {
    project_id                           = var.project_id
    environment                          = var.environment
    existing_runtime_service_account_ids = var.existing_runtime_service_account_ids
    managed_runtime_service_accounts     = var.managed_runtime_service_accounts
    secret_access_grants                 = var.secret_access_grants
  }

  staging_contract = {
    project_id  = "moazez-nonprod-91001421934"
    environment = "staging"
    existing_runtime_service_account_ids = tomap({
      api_runtime  = "moazez-api-runtime"
      core_worker  = "moazez-core-worker"
      media_worker = "moazez-media-worker"
    })
    managed_runtime_service_accounts = tomap({
      migration_job = {
        account_id   = "moazez-migration-job"
        display_name = "Moazez Migration Job"
      }
      maintenance_scheduler = {
        account_id   = "moazez-maintenance-scheduler"
        display_name = "Moazez Maintenance Scheduler"
      }
    })
    secret_access_grants = tomap({
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
    })
  }

  production_contract = {
    project_id  = "moazez-production"
    environment = "production"
    existing_runtime_service_account_ids = tomap({
      api_runtime  = "moazez-api-runtime"
      core_worker  = "moazez-core-worker"
      media_worker = "moazez-media-worker"
    })
    managed_runtime_service_accounts = tomap({
      migration_job = {
        account_id   = "moazez-migration-job"
        display_name = "Moazez Migration Job"
      }
      maintenance_scheduler = {
        account_id   = "moazez-maintenance-scheduler"
        display_name = "Moazez Maintenance Scheduler"
      }
    })
    secret_access_grants = tomap({
      api_database_url = {
        runtime_identity_key = "api_runtime"
        secret_id            = "moazez-production-api-database-url"
      }
      api_jwt_access_secret = {
        runtime_identity_key = "api_runtime"
        secret_id            = "moazez-production-jwt-access-secret"
      }
      api_jwt_refresh_secret = {
        runtime_identity_key = "api_runtime"
        secret_id            = "moazez-production-jwt-refresh-secret"
      }
      api_smtp_secret_encryption_key = {
        runtime_identity_key = "api_runtime"
        secret_id            = "moazez-production-smtp-secret-encryption-key"
      }
      api_app_device_token_encryption_key = {
        runtime_identity_key = "api_runtime"
        secret_id            = "moazez-production-app-device-token-encryption-key"
      }
      core_worker_database_url = {
        runtime_identity_key = "core_worker"
        secret_id            = "moazez-production-core-worker-database-url"
      }
      core_worker_smtp_secret_encryption_key = {
        runtime_identity_key = "core_worker"
        secret_id            = "moazez-production-smtp-secret-encryption-key"
      }
      core_worker_app_device_token_encryption_key = {
        runtime_identity_key = "core_worker"
        secret_id            = "moazez-production-app-device-token-encryption-key"
      }
      media_worker_database_url = {
        runtime_identity_key = "media_worker"
        secret_id            = "moazez-production-media-worker-database-url"
      }
      migration_job_database_url = {
        runtime_identity_key = "migration_job"
        secret_id            = "moazez-production-migration-database-url"
      }
    })
  }

  governed_contract = (
    local.current_contract == local.staging_contract ||
    local.current_contract == local.production_contract
  )

  existing_runtime_service_account_members = {
    for logical_key, account_id in var.existing_runtime_service_account_ids :
    logical_key => format(
      "serviceAccount:%s@%s.iam.gserviceaccount.com",
      account_id,
      var.project_id,
    )
  }

  managed_runtime_service_account_members = {
    for logical_key, service_account in google_service_account.runtime :
    logical_key => service_account.member
  }

  runtime_service_account_members = merge(
    local.existing_runtime_service_account_members,
    local.managed_runtime_service_account_members,
  )
}

resource "google_service_account" "runtime" {
  for_each = var.managed_runtime_service_accounts

  project         = var.project_id
  account_id      = each.value.account_id
  display_name    = each.value.display_name
  deletion_policy = "PREVENT"

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.governed_contract
      error_message = "The Runtime IAM environment must match the complete governed Staging or Production tuple."
    }
  }
}

resource "google_secret_manager_secret_iam_member" "secret_accessor" {
  for_each = var.secret_access_grants

  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = local.runtime_service_account_members[each.value.runtime_identity_key]

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The Runtime IAM environment must match the complete governed Staging or Production tuple."
    }
  }
}

resource "google_project_iam_member" "core_worker_firebase_cloud_messaging" {
  project = var.project_id
  role    = "roles/firebasecloudmessaging.admin"
  member  = local.existing_runtime_service_account_members["core_worker"]

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The Runtime IAM environment must match the complete governed Staging or Production tuple."
    }
  }
}
