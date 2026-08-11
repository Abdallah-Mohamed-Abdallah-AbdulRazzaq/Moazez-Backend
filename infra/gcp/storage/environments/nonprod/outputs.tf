output "project_id" {
  value = module.storage_environment.project_id
}

output "private_bucket_name" {
  value = module.storage_environment.private_bucket_name
}

output "published_bucket_name" {
  value = module.storage_environment.published_bucket_name
}

output "api_runtime_service_account_email" {
  value = module.storage_environment.api_runtime_service_account_email
}

output "core_worker_service_account_email" {
  value = module.storage_environment.core_worker_service_account_email
}

output "media_worker_service_account_email" {
  value = module.storage_environment.media_worker_service_account_email
}

output "gcs_signer_service_account_email" {
  value = module.storage_environment.gcs_signer_service_account_email
}

output "iac_deployer_service_account_email" {
  value = module.storage_environment.iac_deployer_service_account_email
}
