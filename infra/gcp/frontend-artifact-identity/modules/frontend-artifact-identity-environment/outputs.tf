output "builder_service_account_email" {
  description = "Email of the dedicated frontend artifact builder."
  value       = google_service_account.artifact_builder.email
}

output "platform_admin_wif_provider_name" {
  description = "Full name of the Platform Admin GitHub OIDC provider."
  value       = google_iam_workload_identity_pool_provider.platform_admin.name
}

output "school_dashboard_wif_provider_name" {
  description = "Full name of the School Dashboard GitHub OIDC provider."
  value       = google_iam_workload_identity_pool_provider.school_dashboard.name
}
