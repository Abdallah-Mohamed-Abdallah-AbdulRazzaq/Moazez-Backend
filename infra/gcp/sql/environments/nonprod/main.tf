locals {
  staging_sql = {
    instance_name                                 = "moazez-staging-postgres-me-central2"
    database_version                              = "POSTGRES_16"
    edition                                       = "ENTERPRISE"
    tier                                          = "db-custom-N4-2-8192"
    availability_type                             = "ZONAL"
    disk_type                                     = "HYPERDISK_BALANCED"
    disk_size_gb                                  = 20
    disk_autoresize                               = true
    disk_autoresize_limit_gb                      = 100
    backups_enabled                               = true
    point_in_time_recovery_enabled                = true
    transaction_log_retention_days                = 7
    retained_backups                              = 8
    backup_retention_unit                         = "COUNT"
    max_connections                               = 100
    ipv4_enabled                                  = false
    private_network                               = "projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc"
    allocated_ip_range                            = "moazez-staging-psa"
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
  instance_name                                 = local.staging_sql.instance_name
  database_version                              = local.staging_sql.database_version
  edition                                       = local.staging_sql.edition
  tier                                          = local.staging_sql.tier
  availability_type                             = local.staging_sql.availability_type
  disk_type                                     = local.staging_sql.disk_type
  disk_size_gb                                  = local.staging_sql.disk_size_gb
  disk_autoresize                               = local.staging_sql.disk_autoresize
  disk_autoresize_limit_gb                      = local.staging_sql.disk_autoresize_limit_gb
  backups_enabled                               = local.staging_sql.backups_enabled
  point_in_time_recovery_enabled                = local.staging_sql.point_in_time_recovery_enabled
  transaction_log_retention_days                = local.staging_sql.transaction_log_retention_days
  retained_backups                              = local.staging_sql.retained_backups
  backup_retention_unit                         = local.staging_sql.backup_retention_unit
  max_connections                               = local.staging_sql.max_connections
  ipv4_enabled                                  = local.staging_sql.ipv4_enabled
  private_network                               = local.staging_sql.private_network
  allocated_ip_range                            = local.staging_sql.allocated_ip_range
  ssl_mode                                      = local.staging_sql.ssl_mode
  enable_private_path_for_google_cloud_services = local.staging_sql.enable_private_path_for_google_cloud_services
  terraform_deletion_protection                 = local.staging_sql.terraform_deletion_protection
  gcp_deletion_protection_enabled               = local.staging_sql.gcp_deletion_protection_enabled
}
