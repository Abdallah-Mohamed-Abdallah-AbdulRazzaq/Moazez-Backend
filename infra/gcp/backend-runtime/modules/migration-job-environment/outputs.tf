output "migration_job_name" {
  description = "Name of the governed Migration Job."
  value       = google_cloud_run_v2_job.migration.name
}

output "migration_job_location" {
  description = "Region of the governed Migration Job."
  value       = google_cloud_run_v2_job.migration.location
}

output "migration_job_service_account" {
  description = "Existing service account used by the governed Migration Job."
  value       = var.migration_service_account
}

output "image_reference" {
  description = "Immutable backend image digest configured on the Migration Job."
  value       = var.image_reference
}
