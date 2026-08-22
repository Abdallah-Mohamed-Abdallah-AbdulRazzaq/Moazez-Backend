output "platform_admin_runtime_service_account_email" {
  description = "Email of the Production Platform Admin runtime identity."
  value       = module.frontend_runtime_environment.platform_admin_runtime_service_account_email
}

output "school_dashboard_runtime_service_account_email" {
  description = "Email of the Production School Dashboard runtime identity."
  value       = module.frontend_runtime_environment.school_dashboard_runtime_service_account_email
}

output "platform_admin_service_name" {
  description = "Name of the internal Production Platform Admin service."
  value       = module.frontend_runtime_environment.platform_admin_service_name
}

output "platform_admin_service_uri" {
  description = "Provider-assigned URI of the internal Production Platform Admin service."
  value       = module.frontend_runtime_environment.platform_admin_service_uri
}

output "school_dashboard_service_name" {
  description = "Name of the internal Production School Dashboard service."
  value       = module.frontend_runtime_environment.school_dashboard_service_name
}

output "school_dashboard_service_uri" {
  description = "Provider-assigned URI of the internal Production School Dashboard service."
  value       = module.frontend_runtime_environment.school_dashboard_service_uri
}
