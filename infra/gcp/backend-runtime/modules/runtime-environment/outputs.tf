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

output "image_reference" {
  description = "Immutable backend image digest configured on all four runtime resources."
  value       = var.image_reference
}
