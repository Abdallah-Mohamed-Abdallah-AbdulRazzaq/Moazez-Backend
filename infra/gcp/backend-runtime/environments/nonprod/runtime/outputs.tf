output "api_service_name" {
  description = "Name of the internal staging API service."
  value       = module.runtime_environment.api_service_name
}

output "api_service_uri" {
  description = "Provider-assigned URI of the internal staging API service."
  value       = module.runtime_environment.api_service_uri
}

output "core_worker_pool_name" {
  description = "Name of the staging Core Worker pool."
  value       = module.runtime_environment.core_worker_pool_name
}

output "media_worker_pool_name" {
  description = "Name of the staging Media Worker pool."
  value       = module.runtime_environment.media_worker_pool_name
}

output "maintenance_scheduler_pool_name" {
  description = "Name of the staging Maintenance Scheduler worker pool."
  value       = module.runtime_environment.maintenance_scheduler_pool_name
}

output "image_reference" {
  description = "Immutable backend image digest configured on all four runtime resources."
  value       = module.runtime_environment.image_reference
}
