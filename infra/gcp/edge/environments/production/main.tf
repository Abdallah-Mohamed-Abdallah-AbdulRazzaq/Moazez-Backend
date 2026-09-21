module "edge_environment" {
  source = "../../modules/edge-environment"

  project_id  = "moazez-production"
  region      = "me-central2"
  environment = "production"

  api_hostname              = "api.moazez.cloud"
  platform_admin_hostname   = "admin.moazez.cloud"
  school_dashboard_hostname = "schools.moazez.cloud"

  api_service_name              = "moazez-production-api"
  platform_admin_service_name   = "moazez-production-platform-admin"
  school_dashboard_service_name = "moazez-production-school-dashboard"

  candidate_edge_enabled        = var.candidate_edge_enabled
  candidate_smoke_route_enabled = var.candidate_smoke_route_enabled
  candidate_api_tag             = var.candidate_api_tag
}
