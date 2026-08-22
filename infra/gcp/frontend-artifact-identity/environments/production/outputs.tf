output "builder_service_account_email" {
  description = "Email of the dedicated Production frontend artifact builder."
  value       = module.frontend_artifact_identity_environment.builder_service_account_email
}

output "platform_admin_wif_provider_name" {
  description = "Full name of the Platform Admin GitHub OIDC provider."
  value       = module.frontend_artifact_identity_environment.platform_admin_wif_provider_name
}

output "school_dashboard_wif_provider_name" {
  description = "Full name of the School Dashboard GitHub OIDC provider."
  value       = module.frontend_artifact_identity_environment.school_dashboard_wif_provider_name
}
