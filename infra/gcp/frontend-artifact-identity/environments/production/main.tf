module "frontend_artifact_identity_environment" {
  source = "../../modules/frontend-artifact-identity-environment"

  project_id     = "moazez-production"
  project_number = "91001421934"
  environment    = "production"

  github_owner_name  = "Abdallah-Mohamed-Abdallah-AbdulRazzaq"
  github_owner_id    = "127324203"
  github_allowed_ref = "refs/heads/main"

  workload_identity_pool_id = "moazez-github-production"

  platform_admin_repository           = "Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Platform-Admin"
  platform_admin_repository_id        = "1335685284"
  platform_admin_wif_provider_id      = "moazez-platform-admin-main"
  school_dashboard_repository         = "Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-School-Dashboard"
  school_dashboard_repository_id      = "1335686453"
  school_dashboard_wif_provider_id    = "moazez-school-dashboard-main"
  artifact_builder_service_account_id = "moazez-ui-artifact-builder"
  artifact_registry_project_id        = "moazez-production"
  artifact_registry_location          = "me-central2"
  artifact_registry_repository_id     = "moazez-production-containers"
}
