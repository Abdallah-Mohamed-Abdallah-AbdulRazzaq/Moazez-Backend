output "api_service_name" {
  description = "Name of the selected environment's internal API service."
  value       = google_cloud_run_v2_service.api.name
}

output "api_service_uri" {
  description = "Provider-assigned URI of the selected environment's internal API service."
  value       = google_cloud_run_v2_service.api.uri
}

output "core_worker_pool_name" {
  description = "Name of the selected environment's Core Worker pool."
  value       = google_cloud_run_v2_worker_pool.core.name
}

output "media_worker_pool_name" {
  description = "Name of the selected environment's Media Worker pool."
  value       = google_cloud_run_v2_worker_pool.media.name
}

output "maintenance_scheduler_pool_name" {
  description = "Name of the selected environment's Maintenance Scheduler worker pool."
  value       = google_cloud_run_v2_worker_pool.maintenance_scheduler.name
}

output "api_image_reference" {
  description = "Immutable backend image digest configured only on the API service."
  value       = var.api_image_reference
}

output "core_worker_image_reference" {
  description = "Immutable backend image digest configured only on the Core Worker pool."
  value       = var.core_worker_image_reference
}

output "media_worker_image_reference" {
  description = "Immutable backend image digest configured only on the Media Worker pool."
  value       = var.media_worker_image_reference
}

output "maintenance_scheduler_image_reference" {
  description = "Immutable backend image digest configured only on the Maintenance Scheduler pool."
  value       = var.maintenance_scheduler_image_reference
}

output "api_traffic_mode" {
  description = "Governed API traffic mode represented by this configuration."
  value       = var.api_traffic_mode
}

output "api_candidate_revision" {
  description = "Deterministic API candidate revision name in candidate modes, otherwise null."
  value       = local.api_candidate_revision
}

output "api_candidate_tag" {
  description = "Deterministic API candidate tag in candidate modes, otherwise null."
  value       = var.api_candidate_tag
}
