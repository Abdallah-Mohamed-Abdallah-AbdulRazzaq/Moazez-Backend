module "migration_job_environment" {
  source = "../../../modules/migration-job-environment"

  image_reference = var.image_reference
}
