output "migration_job_name" {
  description = "Name of the staging governed Migration Job."
  value       = module.migration_job_environment.migration_job_name
}

output "migration_job_location" {
  description = "Region of the staging governed Migration Job."
  value       = module.migration_job_environment.migration_job_location
}

output "migration_job_service_account" {
  description = "Existing service account used by the staging governed Migration Job."
  value       = module.migration_job_environment.migration_job_service_account
}

output "image_reference" {
  description = "Immutable backend image digest configured on the Migration Job."
  value       = module.migration_job_environment.image_reference
}
