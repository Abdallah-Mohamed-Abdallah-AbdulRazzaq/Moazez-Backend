output "workload_identity_pool_name" {
  value = module.deployment_identity_environment.workload_identity_pool_name
}

output "workload_identity_provider_name" {
  value = module.deployment_identity_environment.workload_identity_provider_name
}

output "iac_deployer_service_account_email" {
  value = module.deployment_identity_environment.iac_deployer_service_account_email
}

output "github_repository_id" {
  value = module.deployment_identity_environment.github_repository_id
}

output "github_repository_owner_id" {
  value = module.deployment_identity_environment.github_repository_owner_id
}
