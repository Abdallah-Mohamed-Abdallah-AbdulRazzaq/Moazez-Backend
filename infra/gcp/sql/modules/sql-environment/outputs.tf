output "project_id" {
  value = var.project_id
}

output "environment" {
  value = var.environment
}

output "region" {
  value = var.region
}

output "instance_name" {
  value = google_sql_database_instance.postgres.name
}

output "connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "database_version" {
  value = var.database_version
}

output "edition" {
  value = var.edition
}

output "tier" {
  value = var.tier
}

output "availability_type" {
  value = var.availability_type
}

output "private_ip_address" {
  value = google_sql_database_instance.postgres.private_ip_address
}

output "private_network" {
  value = var.private_network
}

output "allocated_ip_range" {
  value = var.allocated_ip_range
}

output "ssl_mode" {
  value = var.ssl_mode
}

output "self_link" {
  value = google_sql_database_instance.postgres.self_link
}
