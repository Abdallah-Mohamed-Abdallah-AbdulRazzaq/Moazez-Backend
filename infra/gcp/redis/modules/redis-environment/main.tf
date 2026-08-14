resource "google_redis_instance" "queue" {
  project                 = var.project_id
  region                  = var.region
  name                    = var.queue_instance_name
  tier                    = var.tier
  memory_size_gb          = var.memory_size_gb
  redis_version           = var.redis_version
  authorized_network      = var.authorized_network
  connect_mode            = var.connect_mode
  transit_encryption_mode = var.transit_encryption_mode
  auth_enabled            = var.auth_enabled
  deletion_protection     = var.deletion_protection
  labels                  = var.queue_labels

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_redis_instance" "realtime" {
  project                 = var.project_id
  region                  = var.region
  name                    = var.realtime_instance_name
  tier                    = var.tier
  memory_size_gb          = var.memory_size_gb
  redis_version           = var.redis_version
  authorized_network      = var.authorized_network
  connect_mode            = var.connect_mode
  transit_encryption_mode = var.transit_encryption_mode
  auth_enabled            = var.auth_enabled
  deletion_protection     = var.deletion_protection
  labels                  = var.realtime_labels

  lifecycle {
    prevent_destroy = true
  }
}
