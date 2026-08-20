module "migration_job_environment" {
  source = "../../../modules/migration-job-environment"

  project_id                        = "moazez-production"
  region                            = "me-central2"
  network                           = "moazez-production-vpc"
  subnetwork                        = "moazez-production-runtime-me-central2"
  migration_job_name                = "moazez-production-migration"
  migration_service_account         = "moazez-migration-job@moazez-production.iam.gserviceaccount.com"
  migration_job_environment         = "production"
  migration_database_secret_id      = "moazez-production-migration-database-url"
  migration_database_secret_version = var.migration_database_secret_version
  image_reference                   = var.image_reference
}
