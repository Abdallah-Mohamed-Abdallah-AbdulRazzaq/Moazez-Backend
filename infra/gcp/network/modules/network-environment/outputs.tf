output "project_id" {
  value = var.project_id
}

output "environment" {
  value = var.environment
}

output "region" {
  value = var.region
}

output "vpc_name" {
  value = google_compute_network.this.name
}

output "vpc_id" {
  value = google_compute_network.this.id
}

output "vpc_self_link" {
  value = google_compute_network.this.self_link
}

output "runtime_subnet_name" {
  value = google_compute_subnetwork.runtime.name
}

output "runtime_subnet_id" {
  value = google_compute_subnetwork.runtime.id
}

output "runtime_subnet_self_link" {
  value = google_compute_subnetwork.runtime.self_link
}

output "runtime_subnet_cidr" {
  value = google_compute_subnetwork.runtime.ip_cidr_range
}

output "psa_range_name" {
  value = google_compute_global_address.psa.name
}

output "psa_address" {
  value = google_compute_global_address.psa.address
}

output "psa_prefix_length" {
  value = google_compute_global_address.psa.prefix_length
}

output "psa_cidr" {
  value = "${google_compute_global_address.psa.address}/${google_compute_global_address.psa.prefix_length}"
}

output "service_networking_service" {
  value = google_service_networking_connection.private_service_access.service
}

output "service_networking_network" {
  value = google_service_networking_connection.private_service_access.network
}

output "service_networking_reserved_ranges" {
  value = google_service_networking_connection.private_service_access.reserved_peering_ranges
}

output "service_networking_peering" {
  value = google_service_networking_connection.private_service_access.peering
}
