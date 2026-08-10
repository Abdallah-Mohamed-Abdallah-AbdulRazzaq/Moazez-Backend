output "project_id" {
  value = var.project_id
}

output "private_bucket_name" {
  value = google_storage_bucket.application["private"].name
}

output "published_bucket_name" {
  value = google_storage_bucket.application["published"].name
}

output "api_runtime_service_account_email" {
  value = google_service_account.storage_critical["api_runtime"].email
}

output "core_worker_service_account_email" {
  value = google_service_account.storage_critical["core_worker"].email
}

output "media_worker_service_account_email" {
  value = google_service_account.storage_critical["media_worker"].email
}

output "gcs_signer_service_account_email" {
  value = google_service_account.storage_critical["gcs_signer"].email
}

output "iac_deployer_service_account_email" {
  value = google_service_account.storage_critical["iac_deployer"].email
}

