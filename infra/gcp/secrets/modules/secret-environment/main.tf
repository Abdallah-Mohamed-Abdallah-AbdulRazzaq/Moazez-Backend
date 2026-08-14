resource "google_secret_manager_secret" "managed" {
  for_each = var.secret_ids

  project             = var.project_id
  secret_id           = each.value
  deletion_policy     = "PREVENT"
  deletion_protection = true

  labels = {
    environment = var.environment
  }

  replication {
    user_managed {
      replicas {
        location = var.replication_location
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}
