locals {
  github_identity = {
    owner_name    = "Abdallah-Mohamed-Abdallah-AbdulRazzaq"
    owner_id      = "127324203"
    repository    = "Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend"
    repository_id = "1217512033"
    allowed_ref   = "refs/heads/main"
  }

  workload_identity_pool_id       = "moazez-github-production"
  workload_identity_provider_id   = "moazez-backend-main"
  iac_deployer_service_account_id = "moazez-iac-deployer"

  artifact_registry_location      = "me-central2"
  artifact_registry_repository_id = "moazez-production-containers"
  terraform_state_bucket          = "moazez-production-91001421934-tfstate"

  runtime_service_account_ids = {
    api_runtime           = "moazez-api-runtime"
    core_worker           = "moazez-core-worker"
    media_worker          = "moazez-media-worker"
    migration_job         = "moazez-migration-job"
    maintenance_scheduler = "moazez-maintenance-scheduler"
  }
}

module "deployment_identity_environment" {
  source = "../../modules/deployment-identity-environment"

  project_id     = var.project_id
  project_number = var.project_number
  environment    = var.environment

  github_owner_name    = local.github_identity.owner_name
  github_owner_id      = local.github_identity.owner_id
  github_repository    = local.github_identity.repository
  github_repository_id = local.github_identity.repository_id
  github_allowed_ref   = local.github_identity.allowed_ref

  workload_identity_pool_id       = local.workload_identity_pool_id
  workload_identity_provider_id   = local.workload_identity_provider_id
  iac_deployer_service_account_id = local.iac_deployer_service_account_id

  artifact_registry_location      = local.artifact_registry_location
  artifact_registry_repository_id = local.artifact_registry_repository_id
  terraform_state_bucket          = local.terraform_state_bucket
  runtime_service_account_ids     = local.runtime_service_account_ids
}
