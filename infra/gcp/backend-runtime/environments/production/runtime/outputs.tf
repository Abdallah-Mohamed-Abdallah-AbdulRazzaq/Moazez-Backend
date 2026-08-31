output "api_service_name" {
  description = "Name of the internal Production API service."
  value       = module.runtime_environment.api_service_name
}

output "api_service_uri" {
  description = "Provider-assigned URI of the internal Production API service."
  value       = module.runtime_environment.api_service_uri
}

output "core_worker_pool_name" {
  description = "Name of the Production Core Worker pool."
  value       = module.runtime_environment.core_worker_pool_name
}

output "media_worker_pool_name" {
  description = "Name of the Production Media Worker pool."
  value       = module.runtime_environment.media_worker_pool_name
}

output "maintenance_scheduler_pool_name" {
  description = "Name of the Production Maintenance Scheduler worker pool."
  value       = module.runtime_environment.maintenance_scheduler_pool_name
}

output "api_image_reference" {
  description = "Immutable backend image digest configured only on the Production API service."
  value       = module.runtime_environment.api_image_reference
}

output "core_worker_image_reference" {
  description = "Immutable backend image digest configured only on the Production Core Worker pool."
  value       = module.runtime_environment.core_worker_image_reference
}

output "media_worker_image_reference" {
  description = "Immutable backend image digest configured only on the Production Media Worker pool."
  value       = module.runtime_environment.media_worker_image_reference
}

output "maintenance_scheduler_image_reference" {
  description = "Immutable backend image digest configured only on the Production Maintenance Scheduler pool."
  value       = module.runtime_environment.maintenance_scheduler_image_reference
}

output "api_traffic_mode" {
  description = "Governed Production API traffic mode."
  value       = module.runtime_environment.api_traffic_mode
}

output "api_candidate_revision" {
  description = "Deterministic Production API candidate revision in candidate modes."
  value       = module.runtime_environment.api_candidate_revision
}

output "api_candidate_tag" {
  description = "Deterministic Production API candidate tag in candidate modes."
  value       = module.runtime_environment.api_candidate_tag
}
