output "workload_identity_pool_name" {
  value = google_iam_workload_identity_pool.github.name
}

output "workload_identity_provider_name" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "iac_deployer_service_account_email" {
  value = local.iac_deployer_service_account_email
}

output "github_repository_id" {
  value = var.github_repository_id
}

output "github_repository_owner_id" {
  value = var.github_owner_id
}
