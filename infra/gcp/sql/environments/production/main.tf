locals {
  production_sql = {
    instance_name                                 = "moazez-production-postgres-me-central2"
    database_version                              = "POSTGRES_16"
    edition                                       = "ENTERPRISE_PLUS"
    tier                                          = "db-perf-optimized-N-2"
    availability_type                             = "REGIONAL"
    disk_type                                     = "PD_SSD"
    disk_size_gb                                  = 20
    disk_autoresize                               = true
    disk_autoresize_limit_gb                      = 100
    backups_enabled                               = true
    point_in_time_recovery_enabled                = true
    transaction_log_retention_days                = 14
    retained_backups                              = 30
    backup_retention_unit                         = "COUNT"
    backup_location                               = "me-central2"
    max_connections                               = 100
    ipv4_enabled                                  = false
    private_network                               = "projects/moazez-production/global/networks/moazez-production-vpc"
    allocated_ip_range                            = "moazez-production-psa"
    ssl_mode                                      = "ENCRYPTED_ONLY"
    enable_private_path_for_google_cloud_services = false
    terraform_deletion_protection                 = true
    gcp_deletion_protection_enabled               = true
  }
}

module "sql_environment" {
  source = "../../modules/sql-environment"

  project_id                                    = var.project_id
  environment                                   = var.environment
  region                                        = var.region
  instance_name                                 = local.production_sql.instance_name
  database_version                              = local.production_sql.database_version
  edition                                       = local.production_sql.edition
  tier                                          = local.production_sql.tier
  availability_type                             = local.production_sql.availability_type
  disk_type                                     = local.production_sql.disk_type
  disk_size_gb                                  = local.production_sql.disk_size_gb
  disk_autoresize                               = local.production_sql.disk_autoresize
  disk_autoresize_limit_gb                      = local.production_sql.disk_autoresize_limit_gb
  backups_enabled                               = local.production_sql.backups_enabled
  point_in_time_recovery_enabled                = local.production_sql.point_in_time_recovery_enabled
  transaction_log_retention_days                = local.production_sql.transaction_log_retention_days
  retained_backups                              = local.production_sql.retained_backups
  backup_retention_unit                         = local.production_sql.backup_retention_unit
  backup_location                               = local.production_sql.backup_location
  max_connections                               = local.production_sql.max_connections
  ipv4_enabled                                  = local.production_sql.ipv4_enabled
  private_network                               = local.production_sql.private_network
  allocated_ip_range                            = local.production_sql.allocated_ip_range
  ssl_mode                                      = local.production_sql.ssl_mode
  enable_private_path_for_google_cloud_services = local.production_sql.enable_private_path_for_google_cloud_services
  terraform_deletion_protection                 = local.production_sql.terraform_deletion_protection
  gcp_deletion_protection_enabled               = local.production_sql.gcp_deletion_protection_enabled
}
