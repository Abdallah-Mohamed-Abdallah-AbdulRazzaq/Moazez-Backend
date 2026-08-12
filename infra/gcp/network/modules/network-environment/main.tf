resource "google_compute_network" "this" {
  project                 = var.project_id
  name                    = var.vpc_name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
  deletion_policy         = var.deletion_policy
}

resource "google_compute_subnetwork" "runtime" {
  project         = var.project_id
  name            = var.runtime_subnet_name
  region          = var.region
  ip_cidr_range   = var.runtime_subnet_cidr
  network         = google_compute_network.this.id
  deletion_policy = var.deletion_policy
}

resource "google_compute_global_address" "psa" {
  project         = var.project_id
  name            = var.psa_range_name
  purpose         = "VPC_PEERING"
  address_type    = "INTERNAL"
  address         = var.psa_address
  prefix_length   = var.psa_prefix_length
  network         = google_compute_network.this.id
  deletion_policy = var.deletion_policy
}

resource "google_service_networking_connection" "private_service_access" {
  network                 = google_compute_network.this.id
  service                 = var.service_networking_service
  reserved_peering_ranges = [google_compute_global_address.psa.name]
  deletion_policy         = var.deletion_policy
}
