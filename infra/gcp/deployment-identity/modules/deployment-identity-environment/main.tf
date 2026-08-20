locals {
  current_contract = {
    project_id                      = var.project_id
    project_number                  = var.project_number
    environment                     = var.environment
    github_owner_name               = var.github_owner_name
    github_owner_id                 = var.github_owner_id
    github_repository               = var.github_repository
    github_repository_id            = var.github_repository_id
    github_allowed_ref              = var.github_allowed_ref
    workload_identity_pool_id       = var.workload_identity_pool_id
    workload_identity_provider_id   = var.workload_identity_provider_id
    iac_deployer_service_account_id = var.iac_deployer_service_account_id
    artifact_registry_location      = var.artifact_registry_location
    artifact_registry_repository_id = var.artifact_registry_repository_id
    terraform_state_bucket          = var.terraform_state_bucket
    runtime_service_account_ids     = var.runtime_service_account_ids
  }

  staging_contract = {
    project_id                      = "moazez-nonprod-91001421934"
    project_number                  = "375161231141"
    environment                     = "staging"
    github_owner_name               = "Abdallah-Mohamed-Abdallah-AbdulRazzaq"
    github_owner_id                 = "127324203"
    github_repository               = "Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend"
    github_repository_id            = "1217512033"
    github_allowed_ref              = "refs/heads/main"
    workload_identity_pool_id       = "moazez-github-staging"
    workload_identity_provider_id   = "moazez-backend-main"
    iac_deployer_service_account_id = "moazez-iac-deployer"
    artifact_registry_location      = "me-central2"
    artifact_registry_repository_id = "moazez-staging-containers"
    terraform_state_bucket          = "moazez-nonprod-91001421934-tfstate"
    runtime_service_account_ids = tomap({
      api_runtime           = "moazez-api-runtime"
      core_worker           = "moazez-core-worker"
      media_worker          = "moazez-media-worker"
      migration_job         = "moazez-migration-job"
      maintenance_scheduler = "moazez-maintenance-scheduler"
    })
  }

  production_contract = {
    project_id                      = "moazez-production"
    project_number                  = "91001421934"
    environment                     = "production"
    github_owner_name               = "Abdallah-Mohamed-Abdallah-AbdulRazzaq"
    github_owner_id                 = "127324203"
    github_repository               = "Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend"
    github_repository_id            = "1217512033"
    github_allowed_ref              = "refs/heads/main"
    workload_identity_pool_id       = "moazez-github-production"
    workload_identity_provider_id   = "moazez-backend-main"
    iac_deployer_service_account_id = "moazez-iac-deployer"
    artifact_registry_location      = "me-central2"
    artifact_registry_repository_id = "moazez-production-containers"
    terraform_state_bucket          = "moazez-production-91001421934-tfstate"
    runtime_service_account_ids = tomap({
      api_runtime           = "moazez-api-runtime"
      core_worker           = "moazez-core-worker"
      media_worker          = "moazez-media-worker"
      migration_job         = "moazez-migration-job"
      maintenance_scheduler = "moazez-maintenance-scheduler"
    })
  }

  governed_contract = (
    local.current_contract == local.staging_contract ||
    local.current_contract == local.production_contract
  )

  iac_deployer_service_account_email = format(
    "%s@%s.iam.gserviceaccount.com",
    var.iac_deployer_service_account_id,
    var.project_id,
  )
  iac_deployer_member = "serviceAccount:${local.iac_deployer_service_account_email}"

  github_attribute_condition = format(
    "assertion.repository_id == \"%s\" && assertion.repository_owner_id == \"%s\" && assertion.ref == \"%s\"",
    var.github_repository_id,
    var.github_owner_id,
    var.github_allowed_ref,
  )

  pool_display_name = (
    var.environment == "production" ?
    "MOAZEZ GitHub production deploy" :
    "MOAZEZ GitHub staging deploy"
  )
  pool_description = (
    var.environment == "production" ?
    "MOAZEZ GitHub Actions production deployment identity pool." :
    "MOAZEZ GitHub Actions staging deployment identity pool."
  )
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = var.workload_identity_pool_id
  display_name              = local.pool_display_name
  description               = local.pool_description

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The Deployment Identity environment must match the complete governed Staging or Production tuple."
    }
  }
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = var.workload_identity_provider_id
  display_name                       = "MOAZEZ Backend main branch"
  description                        = "MOAZEZ Backend main-branch GitHub Actions OIDC provider."

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner"    = "assertion.repository_owner"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
  }

  attribute_condition = local.github_attribute_condition

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The Deployment Identity environment must match the complete governed Staging or Production tuple."
    }
  }
}

resource "google_service_account_iam_member" "github_workload_identity_user" {
  service_account_id = format(
    "projects/%s/serviceAccounts/%s",
    var.project_id,
    local.iac_deployer_service_account_email,
  )
  role = "roles/iam.workloadIdentityUser"
  member = format(
    "principalSet://iam.googleapis.com/projects/%s/locations/global/workloadIdentityPools/%s/attribute.repository_id/%s",
    var.project_number,
    google_iam_workload_identity_pool.github.workload_identity_pool_id,
    var.github_repository_id,
  )

  depends_on = [google_iam_workload_identity_pool_provider.github]

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The Deployment Identity environment must match the complete governed Staging or Production tuple."
    }
  }
}

resource "google_artifact_registry_repository_iam_member" "artifact_writer" {
  project    = var.project_id
  location   = var.artifact_registry_location
  repository = var.artifact_registry_repository_id
  role       = "roles/artifactregistry.writer"
  member     = local.iac_deployer_member

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The Deployment Identity environment must match the complete governed Staging or Production tuple."
    }
  }
}

resource "google_storage_bucket_iam_member" "terraform_state_object_admin" {
  bucket = var.terraform_state_bucket
  role   = "roles/storage.objectAdmin"
  member = local.iac_deployer_member

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The Deployment Identity environment must match the complete governed Staging or Production tuple."
    }
  }
}

resource "google_project_iam_member" "cloud_run_developer" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = local.iac_deployer_member

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The Deployment Identity environment must match the complete governed Staging or Production tuple."
    }
  }
}

resource "google_service_account_iam_member" "runtime_service_account_user" {
  for_each = var.runtime_service_account_ids

  service_account_id = format(
    "projects/%s/serviceAccounts/%s@%s.iam.gserviceaccount.com",
    var.project_id,
    each.value,
    var.project_id,
  )
  role   = "roles/iam.serviceAccountUser"
  member = local.iac_deployer_member

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The Deployment Identity environment must match the complete governed Staging or Production tuple."
    }
  }
}
