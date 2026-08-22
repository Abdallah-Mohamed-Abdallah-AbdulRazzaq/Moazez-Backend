output "platform_admin_runtime_service_account_email" {
  description = "Email of the Platform Admin runtime identity."
  value       = google_service_account.platform_admin_runtime.email
}

output "school_dashboard_runtime_service_account_email" {
  description = "Email of the School Dashboard runtime identity."
  value       = google_service_account.school_dashboard_runtime.email
}

output "platform_admin_service_name" {
  description = "Name of the Platform Admin Cloud Run service."
  value       = google_cloud_run_v2_service.platform_admin.name
}

output "platform_admin_service_uri" {
  description = "Provider-assigned URI of the Platform Admin Cloud Run service."
  value       = google_cloud_run_v2_service.platform_admin.uri
}

output "school_dashboard_service_name" {
  description = "Name of the School Dashboard Cloud Run service."
  value       = google_cloud_run_v2_service.school_dashboard.name
}

output "school_dashboard_service_uri" {
  description = "Provider-assigned URI of the School Dashboard Cloud Run service."
  value       = google_cloud_run_v2_service.school_dashboard.uri
}
