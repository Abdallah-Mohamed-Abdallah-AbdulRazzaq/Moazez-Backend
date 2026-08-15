resource "google_artifact_registry_repository" "this" {
  project         = var.project_id
  location        = var.location
  repository_id   = var.repository_id
  description     = "Stores Moazez staging container artifacts."
  format          = "DOCKER"
  mode            = "STANDARD_REPOSITORY"
  deletion_policy = "PREVENT"

  labels = {
    environment = var.environment
    component   = "artifact-registry"
    managed_by  = "terraform"
  }

  lifecycle {
    prevent_destroy = true
  }
}
