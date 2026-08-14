output "project_id" {
  value = module.secret_environment.project_id
}

output "environment" {
  value = module.secret_environment.environment
}

output "replication_location" {
  value = module.secret_environment.replication_location
}

output "managed_secret_count" {
  value = module.secret_environment.managed_secret_count
}

output "secret_ids" {
  value = module.secret_environment.secret_ids
}

output "secret_resource_names" {
  value = module.secret_environment.secret_resource_names
}
