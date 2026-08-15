module "artifact_registry_environment" {
  source = "../../modules/artifact-registry-environment"

  project_id    = var.project_id
  environment   = var.environment
  location      = var.location
  repository_id = var.repository_id
}
