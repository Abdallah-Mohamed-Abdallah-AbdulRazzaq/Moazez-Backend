module "migration_job_environment" {
  source = "../../../modules/migration-job-environment"

  project_id                        = "moazez-nonprod-91001421934"
  region                            = "me-central2"
  network                           = "moazez-staging-vpc"
  subnetwork                        = "moazez-staging-runtime-me-central2"
  migration_job_name                = "moazez-staging-migration"
  migration_service_account         = "moazez-migration-job@moazez-nonprod-91001421934.iam.gserviceaccount.com"
  migration_job_environment         = "staging"
  migration_database_secret_id      = "moazez-staging-migration-database-url"
  migration_database_secret_version = "2"
  image_reference                   = var.image_reference
}
