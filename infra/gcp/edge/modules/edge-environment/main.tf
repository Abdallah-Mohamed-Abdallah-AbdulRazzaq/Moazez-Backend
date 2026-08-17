locals {
  name_prefix = "moazez-${var.environment}"

  hostnames = {
    api     = var.api_hostname
    admin   = var.platform_admin_hostname
    schools = var.school_dashboard_hostname
  }

  cloud_run_services = {
    api     = var.api_service_name
    admin   = var.platform_admin_service_name
    schools = var.school_dashboard_service_name
  }
}

resource "google_project_service" "certificate_manager" {
  project = var.project_id
  service = "certificatemanager.googleapis.com"

  disable_on_destroy = false
}

resource "google_compute_global_address" "edge" {
  project      = var.project_id
  name         = "${local.name_prefix}-edge-ip"
  address_type = "EXTERNAL"
  ip_version   = "IPV4"
}

resource "google_compute_security_policy" "edge" {
  project     = var.project_id
  name        = "${local.name_prefix}-edge-armor"
  description = "MOAZEZ ${var.environment} external application edge baseline."
  type        = "CLOUD_ARMOR"

  rule {
    action   = "allow"
    priority = 2147483647

    match {
      versioned_expr = "SRC_IPS_V1"

      config {
        src_ip_ranges = ["*"]
      }
    }

    description = "Default allow rule. Additional blocking and rate rules require separate evidence."
  }
}

resource "google_compute_region_network_endpoint_group" "service" {
  for_each = local.cloud_run_services

  project               = var.project_id
  region                = var.region
  name                  = "${local.name_prefix}-${each.key}-neg"
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = each.value
  }
}

resource "google_compute_backend_service" "service" {
  for_each = local.cloud_run_services

  project               = var.project_id
  name                  = "${local.name_prefix}-${each.key}-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.edge.self_link

  custom_request_headers = each.key == "api" ? [
    "X-Moazez-Client-IP:{client_ip_address}"
  ] : []

  backend {
    group = google_compute_region_network_endpoint_group.service[each.key].id
  }
}

resource "google_compute_url_map" "edge" {
  project = var.project_id
  name    = "${local.name_prefix}-edge-url-map"

  default_service = google_compute_backend_service.service["schools"].id

  host_rule {
    hosts        = [var.api_hostname]
    path_matcher = "api"
  }

  host_rule {
    hosts        = [var.platform_admin_hostname]
    path_matcher = "admin"
  }

  host_rule {
    hosts        = [var.school_dashboard_hostname]
    path_matcher = "schools"
  }

  path_matcher {
    name            = "api"
    default_service = google_compute_backend_service.service["api"].id
  }

  path_matcher {
    name            = "admin"
    default_service = google_compute_backend_service.service["admin"].id
  }

  path_matcher {
    name            = "schools"
    default_service = google_compute_backend_service.service["schools"].id
  }
}

resource "google_certificate_manager_certificate" "edge" {
  project     = var.project_id
  location    = "global"
  name        = "${local.name_prefix}-edge-cert"
  description = "MOAZEZ ${var.environment} Google-managed certificate using load balancer authorization."

  managed {
    domains = values(local.hostnames)
  }

  depends_on = [
    google_project_service.certificate_manager
  ]
}

resource "google_certificate_manager_certificate_map" "edge" {
  project     = var.project_id
  name        = "${local.name_prefix}-edge-cert-map"
  description = "MOAZEZ ${var.environment} external edge certificate map."

  depends_on = [
    google_project_service.certificate_manager
  ]
}

resource "google_certificate_manager_certificate_map_entry" "host" {
  for_each = local.hostnames

  project      = var.project_id
  name         = "${local.name_prefix}-${each.key}-cert-entry"
  map          = google_certificate_manager_certificate_map.edge.name
  certificates = [google_certificate_manager_certificate.edge.id]
  hostname     = each.value
}

resource "google_compute_target_https_proxy" "edge" {
  project = var.project_id
  name    = "${local.name_prefix}-edge-https-proxy"
  url_map = google_compute_url_map.edge.id

  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.edge.id}"

  depends_on = [
    google_certificate_manager_certificate_map_entry.host
  ]
}

resource "google_compute_global_forwarding_rule" "https" {
  project               = var.project_id
  name                  = "${local.name_prefix}-edge-https"
  ip_address            = google_compute_global_address.edge.address
  ip_protocol           = "TCP"
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  network_tier          = "PREMIUM"
  target                = google_compute_target_https_proxy.edge.self_link
}