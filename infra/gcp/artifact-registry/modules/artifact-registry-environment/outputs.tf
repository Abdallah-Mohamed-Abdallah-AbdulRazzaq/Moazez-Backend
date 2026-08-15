output "repository_id" {
  value = google_artifact_registry_repository.this.repository_id
}

output "repository_name" {
  value = google_artifact_registry_repository.this.name
}

output "repository_resource_id" {
  value = google_artifact_registry_repository.this.id
}

output "repository_location" {
  value = google_artifact_registry_repository.this.location
}

output "repository_format" {
  value = google_artifact_registry_repository.this.format
}

output "repository_mode" {
  value = google_artifact_registry_repository.this.mode
}

output "registry_uri" {
  value = google_artifact_registry_repository.this.registry_uri
}
