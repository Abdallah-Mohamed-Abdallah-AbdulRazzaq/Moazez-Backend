locals {
  approved_environment = {
    nonprod = {
      project_id       = "moazez-nonprod-91001421934"
      private_bucket   = "moazez-nonprod-91001421934-private"
      published_bucket = "moazez-nonprod-91001421934-published"
      cors_origins = [
        "https://staging-schools.moazez.cloud",
        "https://staging-admin.moazez.cloud",
      ]
    }
    production = {
      project_id       = "moazez-production"
      private_bucket   = "moazez-production-91001421934-private"
      published_bucket = "moazez-production-91001421934-published"
      cors_origins = [
        "https://schools.moazez.cloud",
        "https://admin.moazez.cloud",
      ]
    }
  }

  selected = local.approved_environment[var.environment]
  buckets = {
    private   = local.selected.private_bucket
    published = local.selected.published_bucket
  }
  service_accounts = {
    api_runtime = {
      account_id   = "moazez-api-runtime"
      display_name = "Moazez API runtime"
    }
    core_worker = {
      account_id   = "moazez-core-worker"
      display_name = "Moazez Core Worker"
    }
    media_worker = {
      account_id   = "moazez-media-worker"
      display_name = "Moazez Media Worker"
    }
    gcs_signer = {
      account_id   = "moazez-gcs-signer"
      display_name = "Moazez dedicated GCS signer"
    }
    iac_deployer = {
      account_id   = "moazez-iac-deployer"
      display_name = "Moazez IaC deployer boundary"
    }
  }
  runtime_members = {
    api_runtime  = google_service_account.storage_critical["api_runtime"].member
    core_worker  = google_service_account.storage_critical["core_worker"].member
    media_worker = google_service_account.storage_critical["media_worker"].member
  }
}

resource "google_project_service" "approved" {
  for_each = toset([
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "storage.googleapis.com",
    "iamcredentials.googleapis.com",
  ])

  project                    = var.project_id
  service                    = each.value
  disable_on_destroy         = false
  disable_dependent_services = false
}

resource "google_service_account" "storage_critical" {
  for_each = local.service_accounts

  project      = var.project_id
  account_id   = each.value.account_id
  display_name = each.value.display_name

  depends_on = [google_project_service.approved]
}

resource "google_storage_bucket" "application" {
  for_each = local.buckets

  project                     = var.project_id
  name                        = each.value
  location                    = "ME-CENTRAL2"
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  soft_delete_policy {
    retention_duration_seconds = 604800
  }

  cors {
    origin = local.selected.cors_origins
    method = [
      "GET",
      "HEAD",
      "PUT",
    ]
    response_header = [
      "Content-Type",
      "Content-Disposition",
      "Range",
      "Content-Range",
      "ETag",
      "x-goog-generation",
    ]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.approved]

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = var.project_id == local.selected.project_id
      error_message = "The selected environment and project_id do not match the locked topology."
    }
  }
}

resource "google_storage_bucket_iam_member" "private_runtime_object_user" {
  for_each = local.runtime_members

  bucket = google_storage_bucket.application["private"].name
  role   = "roles/storage.objectUser"
  member = each.value
}

resource "google_project_iam_custom_role" "bucket_metadata_reader" {
  project     = var.project_id
  role_id     = "moazezStorageBucketMetadataReader"
  title       = "Moazez storage bucket metadata reader"
  description = "Read-only bucket availability permission for protected readiness."
  permissions = ["storage.buckets.get"]

  depends_on = [google_project_service.approved]
}

resource "google_project_iam_member" "runtime_bucket_metadata_reader" {
  for_each = local.runtime_members

  project = var.project_id
  role    = google_project_iam_custom_role.bucket_metadata_reader.name
  member  = each.value
}

resource "google_storage_bucket_iam_member" "private_signer_viewer" {
  bucket = google_storage_bucket.application["private"].name
  role   = "roles/storage.objectViewer"
  member = google_service_account.storage_critical["gcs_signer"].member
}

resource "google_storage_bucket_iam_member" "private_signer_creator" {
  bucket = google_storage_bucket.application["private"].name
  role   = "roles/storage.objectCreator"
  member = google_service_account.storage_critical["gcs_signer"].member
}

resource "google_storage_bucket_iam_member" "published_signer_viewer" {
  bucket = google_storage_bucket.application["published"].name
  role   = "roles/storage.objectViewer"
  member = google_service_account.storage_critical["gcs_signer"].member
}

resource "google_service_account_iam_member" "api_runtime_signer" {
  service_account_id = google_service_account.storage_critical["gcs_signer"].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = google_service_account.storage_critical["api_runtime"].member
}
