resource "google_sql_database_instance" "postgres" {
  project          = var.project_id
  name             = var.instance_name
  region           = var.region
  database_version = var.database_version

  deletion_protection = var.terraform_deletion_protection

  settings {
    tier              = var.tier
    edition           = var.edition
    availability_type = var.availability_type

    disk_type             = var.disk_type
    disk_size             = var.disk_size_gb
    disk_autoresize       = var.disk_autoresize
    disk_autoresize_limit = var.disk_autoresize_limit_gb

    deletion_protection_enabled = var.gcp_deletion_protection_enabled

    backup_configuration {
      enabled                        = var.backups_enabled
      point_in_time_recovery_enabled = var.point_in_time_recovery_enabled
      transaction_log_retention_days = var.transaction_log_retention_days

      backup_retention_settings {
        retained_backups = var.retained_backups
        retention_unit   = var.backup_retention_unit
      }
    }

    ip_configuration {
      ipv4_enabled = var.ipv4_enabled

      private_network    = var.private_network
      allocated_ip_range = var.allocated_ip_range
      ssl_mode           = var.ssl_mode

      enable_private_path_for_google_cloud_services = var.enable_private_path_for_google_cloud_services
    }

    database_flags {
      name  = "max_connections"
      value = tostring(var.max_connections)
    }
  }

  lifecycle {
    ignore_changes = [
      settings[0].disk_size,
    ]
  }
}
