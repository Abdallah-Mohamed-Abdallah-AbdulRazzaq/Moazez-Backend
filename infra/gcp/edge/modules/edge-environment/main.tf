locals {
  name_prefix                     = "moazez-${var.environment}"
  candidate_smoke_public_path     = "/.well-known/moazez/candidate-readiness"
  candidate_smoke_backend_path    = "/api/v1/auth/me"
  governed_candidate_environments = ["staging", "production"]
  candidate_neg_name              = "${local.name_prefix}-api-${var.candidate_api_tag == null ? "invalid-candidate-tag" : var.candidate_api_tag}-neg"
  candidate_neg_name_valid = (
    length(local.candidate_neg_name) >= 1 &&
    length(local.candidate_neg_name) <= 63 &&
    can(regex("^[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$", local.candidate_neg_name))
  )
  effective_candidate_smoke_route_enabled = (
    var.candidate_smoke_route_enabled == null
    ? var.candidate_edge_enabled
    : var.candidate_smoke_route_enabled
  )
  candidate_resource_contract_valid = var.candidate_edge_enabled ? (
    contains(local.governed_candidate_environments, var.environment) &&
    var.candidate_api_tag != null &&
    can(regex("^candidate-[a-f0-9]{12}(-r[1-9][0-9]{0,14})?$", var.candidate_api_tag))
  ) : var.candidate_api_tag == null
  candidate_smoke_route_contract_valid = (
    !local.effective_candidate_smoke_route_enabled ||
    var.candidate_edge_enabled
  )
  candidate_smoke_route_render_enabled = (
    local.effective_candidate_smoke_route_enabled &&
    var.candidate_edge_enabled
  )
  candidate_edge_contract_valid = (
    local.candidate_resource_contract_valid &&
    local.candidate_smoke_route_contract_valid
  )

  student_inputs_are_null = (
    var.student_hostname == null &&
    var.student_service_name == null
  )
  student_inputs_are_exact = (
    var.student_hostname == "student.moazez.cloud" &&
    var.student_service_name == "moazez-production-student-web"
  )
  student_contract_valid = (
    var.environment == "production"
    ? local.student_inputs_are_exact
    : local.student_inputs_are_null
  )
  student_edge_enabled = (
    var.environment == "production" &&
    local.student_inputs_are_exact
  )

  teacher_inputs_are_null = (
    var.teacher_hostname == null &&
    var.teacher_service_name == null
  )
  teacher_inputs_are_exact = (
    var.teacher_hostname == "teacher.moazez.cloud" &&
    var.teacher_service_name == "moazez-production-teacher-web" &&
    var.project_id == "moazez-production" &&
    var.region == "me-central2"
  )
  teacher_contract_valid = (
    var.environment == "production"
    ? local.teacher_inputs_are_exact
    : local.teacher_inputs_are_null
  )
  teacher_edge_enabled = (
    var.environment == "production" &&
    local.teacher_inputs_are_exact
  )

  hostnames = {
    api     = var.api_hostname
    admin   = var.platform_admin_hostname
    schools = var.school_dashboard_hostname
  }

  cloud_run_services = merge({
    api     = var.api_service_name
    admin   = var.platform_admin_service_name
    schools = var.school_dashboard_service_name
  }, local.student_edge_enabled ? { student = var.student_service_name } : {}, local.teacher_edge_enabled ? { teacher = var.teacher_service_name } : {})
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

resource "google_compute_region_network_endpoint_group" "api_candidate" {
  count = var.candidate_edge_enabled ? 1 : 0

  project               = var.project_id
  region                = var.region
  name                  = local.candidate_neg_name
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.api_service_name
    tag     = var.candidate_api_tag
  }

  lifecycle {
    create_before_destroy = true

    precondition {
      condition = (
        var.candidate_api_tag != null &&
        local.candidate_neg_name_valid
      )
      error_message = "The enabled Candidate NEG requires a non-null canonical tag and a deterministic RFC1035-compatible physical name between 1 and 63 characters."
    }
  }
}

resource "google_compute_backend_service" "api_candidate" {
  count = var.candidate_edge_enabled ? 1 : 0

  project               = var.project_id
  name                  = "${local.name_prefix}-api-candidate-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.edge.self_link

  custom_request_headers = [
    "X-Moazez-Client-IP:{client_ip_address}"
  ]

  backend {
    group = google_compute_region_network_endpoint_group.api_candidate[0].id
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

  dynamic "host_rule" {
    for_each = local.student_edge_enabled ? [var.student_hostname] : []

    content {
      hosts        = [host_rule.value]
      path_matcher = "student"
    }
  }

  dynamic "host_rule" {
    for_each = local.teacher_edge_enabled ? [var.teacher_hostname] : []

    content {
      hosts        = [host_rule.value]
      path_matcher = "teacher"
    }
  }

  path_matcher {
    name            = "api"
    default_service = google_compute_backend_service.service["api"].id

    dynamic "path_rule" {
      for_each = local.candidate_smoke_route_render_enabled ? [local.candidate_smoke_public_path] : []

      content {
        paths   = [path_rule.value]
        service = google_compute_backend_service.api_candidate[0].id

        route_action {
          url_rewrite {
            path_prefix_rewrite = local.candidate_smoke_backend_path
          }
        }
      }
    }
  }

  path_matcher {
    name            = "admin"
    default_service = google_compute_backend_service.service["admin"].id
  }

  path_matcher {
    name            = "schools"
    default_service = google_compute_backend_service.service["schools"].id
  }

  dynamic "path_matcher" {
    for_each = local.student_edge_enabled ? ["student"] : []

    content {
      name            = path_matcher.value
      default_service = google_compute_backend_service.service["student"].id
    }
  }

  dynamic "path_matcher" {
    for_each = local.teacher_edge_enabled ? ["teacher"] : []

    content {
      name            = path_matcher.value
      default_service = google_compute_backend_service.service["teacher"].id
    }
  }

  lifecycle {
    precondition {
      condition     = local.candidate_edge_contract_valid
      error_message = "Candidate Edge resources are limited to governed environments, require candidate_api_tag when enabled, and require a null tag when disabled. The Candidate smoke route cannot be enabled without Candidate Edge resources."
    }

    precondition {
      condition     = local.student_contract_valid
      error_message = "Student Edge requires the exact governed hostname and service in Production and null Student inputs in staging."
    }

    precondition {
      condition     = local.teacher_contract_valid
      error_message = "Teacher Edge requires teacher.moazez.cloud and moazez-production-teacher-web in moazez-production/me-central2, and null Teacher inputs in staging."
    }
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

resource "google_certificate_manager_certificate" "student" {
  count       = local.student_edge_enabled ? 1 : 0
  project     = var.project_id
  location    = "global"
  name        = "${local.name_prefix}-student-cert"
  description = "MOAZEZ Production Student Web Google-managed certificate using load balancer authorization."

  managed {
    domains = [var.student_hostname]
  }

  depends_on = [
    google_project_service.certificate_manager
  ]
}

resource "google_certificate_manager_certificate" "teacher" {
  count       = local.teacher_edge_enabled ? 1 : 0
  project     = var.project_id
  location    = "global"
  name        = "${local.name_prefix}-teacher-cert"
  description = "MOAZEZ Production Teacher Web Google-managed certificate using load balancer authorization."

  managed {
    domains = [var.teacher_hostname]
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

resource "google_certificate_manager_certificate_map_entry" "student" {
  count = local.student_edge_enabled ? 1 : 0

  project      = var.project_id
  name         = "${local.name_prefix}-student-cert-entry"
  map          = google_certificate_manager_certificate_map.edge.name
  certificates = [google_certificate_manager_certificate.student[0].id]
  hostname     = var.student_hostname
}

resource "google_certificate_manager_certificate_map_entry" "teacher" {
  count = local.teacher_edge_enabled ? 1 : 0

  project      = var.project_id
  name         = "${local.name_prefix}-teacher-cert-entry"
  map          = google_certificate_manager_certificate_map.edge.name
  certificates = [google_certificate_manager_certificate.teacher[0].id]
  hostname     = var.teacher_hostname
}

resource "google_compute_target_https_proxy" "edge" {
  project = var.project_id
  name    = "${local.name_prefix}-edge-https-proxy"
  url_map = google_compute_url_map.edge.id

  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.edge.id}"

  depends_on = [
    google_certificate_manager_certificate_map_entry.host,
    google_certificate_manager_certificate_map_entry.student,
    google_certificate_manager_certificate_map_entry.teacher
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
