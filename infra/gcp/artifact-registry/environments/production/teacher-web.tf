resource "google_artifact_registry_repository" "teacher_web" {
  project         = var.project_id
  location        = var.location
  repository_id   = "moazez-production-teacher-web"
  description     = "Stores immutable Moazez Production Teacher Web container artifacts."
  format          = "DOCKER"
  mode            = "STANDARD_REPOSITORY"
  deletion_policy = "PREVENT"

  docker_config {
    immutable_tags = true
  }

  labels = {
    environment = var.environment
    component   = "artifact-registry"
    managed_by  = "terraform"
  }

  lifecycle {
    prevent_destroy = true
  }
}
