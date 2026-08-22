locals {
  current_contract = {
    project_id                          = var.project_id
    project_number                      = var.project_number
    environment                         = var.environment
    github_owner_name                   = var.github_owner_name
    github_owner_id                     = var.github_owner_id
    github_allowed_ref                  = var.github_allowed_ref
    workload_identity_pool_id           = var.workload_identity_pool_id
    platform_admin_repository           = var.platform_admin_repository
    platform_admin_repository_id        = var.platform_admin_repository_id
    platform_admin_wif_provider_id      = var.platform_admin_wif_provider_id
    school_dashboard_repository         = var.school_dashboard_repository
    school_dashboard_repository_id      = var.school_dashboard_repository_id
    school_dashboard_wif_provider_id    = var.school_dashboard_wif_provider_id
    artifact_builder_service_account_id = var.artifact_builder_service_account_id
    artifact_registry_project_id        = var.artifact_registry_project_id
    artifact_registry_location          = var.artifact_registry_location
    artifact_registry_repository_id     = var.artifact_registry_repository_id
  }

  production_contract = {
    project_id                          = "moazez-production"
    project_number                      = "91001421934"
    environment                         = "production"
    github_owner_name                   = "Abdallah-Mohamed-Abdallah-AbdulRazzaq"
    github_owner_id                     = "127324203"
    github_allowed_ref                  = "refs/heads/main"
    workload_identity_pool_id           = "moazez-github-production"
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

  governed_contract = local.current_contract == local.production_contract

  platform_admin_attribute_condition = format(
    "assertion.repository_id == \"%s\" && assertion.repository_owner_id == \"%s\" && assertion.ref == \"%s\"",
    var.platform_admin_repository_id,
    var.github_owner_id,
    var.github_allowed_ref,
  )
  school_dashboard_attribute_condition = format(
    "assertion.repository_id == \"%s\" && assertion.repository_owner_id == \"%s\" && assertion.ref == \"%s\"",
    var.school_dashboard_repository_id,
    var.github_owner_id,
    var.github_allowed_ref,
  )
}

resource "google_iam_workload_identity_pool_provider" "platform_admin" {
  project                            = var.project_id
  workload_identity_pool_id          = var.workload_identity_pool_id
  workload_identity_pool_provider_id = var.platform_admin_wif_provider_id
  display_name                       = "MOAZEZ Platform Admin main branch"
  description                        = "MOAZEZ Platform Admin main-branch GitHub Actions OIDC provider."

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner"    = "assertion.repository_owner"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
  }

  attribute_condition = local.platform_admin_attribute_condition

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The frontend artifact identity environment must match the complete governed Production tuple."
    }
  }
}

resource "google_iam_workload_identity_pool_provider" "school_dashboard" {
  project                            = var.project_id
  workload_identity_pool_id          = var.workload_identity_pool_id
  workload_identity_pool_provider_id = var.school_dashboard_wif_provider_id
  display_name                       = "MOAZEZ School Dashboard main branch"
  description                        = "MOAZEZ School Dashboard main-branch GitHub Actions OIDC provider."

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner"    = "assertion.repository_owner"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
  }

  attribute_condition = local.school_dashboard_attribute_condition

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The frontend artifact identity environment must match the complete governed Production tuple."
    }
  }
}

resource "google_service_account" "artifact_builder" {
  project         = var.project_id
  account_id      = var.artifact_builder_service_account_id
  display_name    = "Moazez UI Artifact Builder"
  deletion_policy = "PREVENT"

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.governed_contract
      error_message = "The frontend artifact identity environment must match the complete governed Production tuple."
    }
  }
}

resource "google_service_account_iam_member" "platform_admin_workload_identity_user" {
  service_account_id = google_service_account.artifact_builder.name
  role               = "roles/iam.workloadIdentityUser"
  member = format(
    "principalSet://iam.googleapis.com/projects/%s/locations/global/workloadIdentityPools/%s/attribute.repository_id/%s",
    var.project_number,
    var.workload_identity_pool_id,
    var.platform_admin_repository_id,
  )

  depends_on = [google_iam_workload_identity_pool_provider.platform_admin]

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The frontend artifact identity environment must match the complete governed Production tuple."
    }
  }
}

resource "google_service_account_iam_member" "school_dashboard_workload_identity_user" {
  service_account_id = google_service_account.artifact_builder.name
  role               = "roles/iam.workloadIdentityUser"
  member = format(
    "principalSet://iam.googleapis.com/projects/%s/locations/global/workloadIdentityPools/%s/attribute.repository_id/%s",
    var.project_number,
    var.workload_identity_pool_id,
    var.school_dashboard_repository_id,
  )

  depends_on = [google_iam_workload_identity_pool_provider.school_dashboard]

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The frontend artifact identity environment must match the complete governed Production tuple."
    }
  }
}

resource "google_artifact_registry_repository_iam_member" "artifact_writer" {
  project    = var.artifact_registry_project_id
  location   = var.artifact_registry_location
  repository = var.artifact_registry_repository_id
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.artifact_builder.member

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The frontend artifact identity environment must match the complete governed Production tuple."
    }
  }
}
