module "edge_environment" {
  source = "../../modules/edge-environment"

  project_id  = "moazez-nonprod-91001421934"
  region      = "me-central2"
  environment = "staging"

  api_hostname              = "staging-api.moazez.cloud"
  platform_admin_hostname   = "staging-admin.moazez.cloud"
  school_dashboard_hostname = "staging-schools.moazez.cloud"

  api_service_name              = "moazez-staging-api"
  platform_admin_service_name   = "moazez-staging-platform-admin"
  school_dashboard_service_name = "moazez-staging-school-dashboard"

  candidate_edge_enabled = var.candidate_edge_enabled
  candidate_api_tag      = var.candidate_api_tag
}
