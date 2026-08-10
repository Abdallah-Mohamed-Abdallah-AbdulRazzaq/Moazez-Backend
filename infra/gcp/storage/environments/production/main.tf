module "storage_environment" {
  source = "../../modules/storage-environment"

  environment = "production"
  project_id  = var.project_id
}

