module "storage_environment" {
  source = "../../modules/storage-environment"

  environment = "nonprod"
  project_id  = var.project_id
}
