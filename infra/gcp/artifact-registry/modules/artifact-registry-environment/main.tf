locals {
  current_contract = {
    project_id    = var.project_id
    environment   = var.environment
    location      = var.location
    repository_id = var.repository_id
  }

  staging_contract = {
    project_id    = "moazez-nonprod-91001421934"
    environment   = "staging"
    location      = "me-central2"
    repository_id = "moazez-staging-containers"
  }

  production_contract = {
    project_id    = "moazez-production"
    environment   = "production"
    location      = "me-central2"
    repository_id = "moazez-production-containers"
  }

  governed_contract = (
    local.current_contract == local.staging_contract ||
    local.current_contract == local.production_contract
  )

  repository_descriptions = {
    staging    = "Stores Moazez staging container artifacts."
    production = "Stores Moazez production container artifacts."
  }
}

resource "google_artifact_registry_repository" "this" {
  project         = var.project_id
  location        = var.location
  repository_id   = var.repository_id
  description     = local.repository_descriptions[var.environment]
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

    precondition {
      condition     = local.governed_contract
      error_message = "The Artifact Registry environment must match the complete governed Staging or Production tuple."
    }
  }
}
