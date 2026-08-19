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
      location                       = var.backup_location

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
    precondition {
      condition = (
        (
          var.project_id == "moazez-nonprod-91001421934" &&
          var.environment == "staging" &&
          var.region == "me-central2" &&
          var.instance_name == "moazez-staging-postgres-me-central2" &&
          var.database_version == "POSTGRES_16" &&
          var.edition == "ENTERPRISE" &&
          var.tier == "db-custom-N4-2-8192" &&
          var.availability_type == "ZONAL" &&
          var.disk_type == "HYPERDISK_BALANCED" &&
          var.disk_size_gb == 20 &&
          var.disk_autoresize == true &&
          var.disk_autoresize_limit_gb == 100 &&
          var.backups_enabled == true &&
          var.point_in_time_recovery_enabled == true &&
          var.transaction_log_retention_days == 7 &&
          var.retained_backups == 8 &&
          var.backup_retention_unit == "COUNT" &&
          var.backup_location == null &&
          var.max_connections == 100 &&
          var.ipv4_enabled == false &&
          var.private_network == "projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc" &&
          var.allocated_ip_range == "moazez-staging-psa" &&
          var.ssl_mode == "ENCRYPTED_ONLY" &&
          var.enable_private_path_for_google_cloud_services == false &&
          var.terraform_deletion_protection == true &&
          var.gcp_deletion_protection_enabled == true
        ) ||
        (
          var.project_id == "moazez-production" &&
          var.environment == "production" &&
          var.region == "me-central2" &&
          var.instance_name == "moazez-production-postgres-me-central2" &&
          var.database_version == "POSTGRES_16" &&
          var.edition == "ENTERPRISE_PLUS" &&
          var.tier == "db-perf-optimized-N-2" &&
          var.availability_type == "REGIONAL" &&
          var.disk_type == "PD_SSD" &&
          var.disk_size_gb == 20 &&
          var.disk_autoresize == true &&
          var.disk_autoresize_limit_gb == 100 &&
          var.backups_enabled == true &&
          var.point_in_time_recovery_enabled == true &&
          var.transaction_log_retention_days == 14 &&
          var.retained_backups == 30 &&
          var.backup_retention_unit == "COUNT" &&
          var.backup_location == "me-central2" &&
          var.max_connections == 100 &&
          var.ipv4_enabled == false &&
          var.private_network == "projects/moazez-production/global/networks/moazez-production-vpc" &&
          var.allocated_ip_range == "moazez-production-psa" &&
          var.ssl_mode == "ENCRYPTED_ONLY" &&
          var.enable_private_path_for_google_cloud_services == false &&
          var.terraform_deletion_protection == true &&
          var.gcp_deletion_protection_enabled == true
        )
      )
      error_message = "The SQL environment must match the complete governed Staging or Production tuple."
    }

    ignore_changes = [
      settings[0].disk_size,
    ]
  }
}
