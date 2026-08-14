output "project_id" {
  value = var.project_id
}

output "environment" {
  value = var.environment
}

output "replication_location" {
  value = var.replication_location
}

output "managed_secret_count" {
  value = length(google_secret_manager_secret.managed)
}

output "secret_ids" {
  value = {
    for logical_key, secret in google_secret_manager_secret.managed :
    logical_key => secret.secret_id
  }
}

output "secret_resource_names" {
  value = {
    for logical_key, secret in google_secret_manager_secret.managed :
    logical_key => format("projects/%s/secrets/%s", secret.project, secret.secret_id)
  }
}
