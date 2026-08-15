locals {
  iac_deployer_service_account_email = format(
    "%s@%s.iam.gserviceaccount.com",
    var.iac_deployer_service_account_id,
    var.project_id,
  )
  iac_deployer_member = "serviceAccount:${local.iac_deployer_service_account_email}"

  github_attribute_condition = format(
    "assertion.repository_id == \"%s\" && assertion.repository_owner_id == \"%s\" && assertion.ref == \"%s\"",
    var.github_repository_id,
    var.github_owner_id,
    var.github_allowed_ref,
  )
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = var.workload_identity_pool_id
  display_name              = "MOAZEZ GitHub staging deploy"
  description               = "MOAZEZ GitHub Actions staging deployment identity pool."
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = var.workload_identity_provider_id
  display_name                       = "MOAZEZ Backend main branch"
  description                        = "MOAZEZ Backend main-branch GitHub Actions OIDC provider."

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner"    = "assertion.repository_owner"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
  }

  attribute_condition = local.github_attribute_condition

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_workload_identity_user" {
  service_account_id = format(
    "projects/%s/serviceAccounts/%s",
    var.project_id,
    local.iac_deployer_service_account_email,
  )
  role = "roles/iam.workloadIdentityUser"
  member = format(
    "principalSet://iam.googleapis.com/projects/%s/locations/global/workloadIdentityPools/%s/attribute.repository_id/%s",
    var.project_number,
    google_iam_workload_identity_pool.github.workload_identity_pool_id,
    var.github_repository_id,
  )

  depends_on = [google_iam_workload_identity_pool_provider.github]
}

resource "google_artifact_registry_repository_iam_member" "artifact_writer" {
  project    = var.project_id
  location   = var.artifact_registry_location
  repository = var.artifact_registry_repository_id
  role       = "roles/artifactregistry.writer"
  member     = local.iac_deployer_member
}

resource "google_storage_bucket_iam_member" "terraform_state_object_admin" {
  bucket = var.terraform_state_bucket
  role   = "roles/storage.objectAdmin"
  member = local.iac_deployer_member
}

resource "google_project_iam_member" "cloud_run_developer" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = local.iac_deployer_member
}

resource "google_service_account_iam_member" "runtime_service_account_user" {
  for_each = var.runtime_service_account_ids

  service_account_id = format(
    "projects/%s/serviceAccounts/%s@%s.iam.gserviceaccount.com",
    var.project_id,
    each.value,
    var.project_id,
  )
  role   = "roles/iam.serviceAccountUser"
  member = local.iac_deployer_member
}
