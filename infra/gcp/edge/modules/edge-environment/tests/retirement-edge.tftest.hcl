mock_provider "google" {
  override_during = plan

  mock_resource "google_compute_security_policy" {
    defaults = {
      self_link = "https://example.invalid/securityPolicies/moazez-production-edge-armor"
    }
  }

  mock_resource "google_compute_region_network_endpoint_group" {
    defaults = {
      id = "https://example.invalid/networkEndpointGroups/mock-neg"
    }
  }

  mock_resource "google_compute_backend_service" {
    defaults = {
      id = "https://example.invalid/backendServices/mock-backend"
    }
  }

  mock_resource "google_certificate_manager_certificate" {
    defaults = {
      id = "projects/mock/locations/global/certificates/mock-certificate"
    }
  }
}

variables {
  project_id                    = "moazez-production"
  region                        = "me-central2"
  environment                   = "production"
  api_hostname                  = "api.moazez.cloud"
  platform_admin_hostname       = "admin.moazez.cloud"
  school_dashboard_hostname     = "schools.moazez.cloud"
  api_service_name              = "moazez-production-api"
  platform_admin_service_name   = "moazez-production-platform-admin"
  school_dashboard_service_name = "moazez-production-school-dashboard"
  student_hostname              = "student.moazez.cloud"
  student_service_name          = "moazez-production-student-web"
  teacher_hostname              = "teacher.moazez.cloud"
  teacher_service_name          = "moazez-production-teacher-web"
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: historical_disabled_route_omitted
run "module_contract__historical_disabled_route_omitted" {
  command = plan


  assert {
    condition     = length(google_compute_region_network_endpoint_group.api_candidate) == 0 && length(google_compute_backend_service.api_candidate) == 0
    error_message = "Candidate-only resources must default to absent."
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.service["api"].cloud_run[0].service == "moazez-production-api" && google_compute_region_network_endpoint_group.service["api"].cloud_run[0].tag == null
    error_message = "The normal API service-level NEG must remain untagged and unchanged."
  }

  assert {
    condition     = length(google_compute_url_map.edge.path_matcher[0].path_rule) == 0
    error_message = "The API URL map must have no candidate route by default."
  }

  assert {
    condition     = output.candidate_serverless_neg_name == null && output.candidate_backend_service_name == null && output.candidate_smoke_public_path == null && output.candidate_smoke_backend_path == null
    error_message = "Historical disabled mode must expose no Candidate resource or smoke-route outputs."
  }
  assert {
    condition     = keys(google_compute_region_network_endpoint_group.service) == ["admin", "api", "schools", "student", "teacher"] && keys(google_compute_backend_service.service) == ["admin", "api", "schools", "student", "teacher"] && length(google_certificate_manager_certificate.teacher) == 1 && length(google_certificate_manager_certificate_map_entry.teacher) == 1 && output.teacher_certificate_name == "moazez-production-teacher-cert"
    error_message = "Staging must have no Teacher NEG, backend, certificate, entry or output."
  }

  assert {
    condition     = length(google_compute_url_map.edge.host_rule) == 5 && length(google_compute_url_map.edge.path_matcher) == 5
    error_message = "Staging must retain exactly the API, Admin and Schools routes."
  }

}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: historical_enabled_route_omitted_targets_tagged_revision_and_reuses_security_posture
run "module_contract__historical_enabled_route_omitted_targets_tagged_revision_and_reuses_security_posture" {
  command = plan


  variables {
    candidate_edge_enabled = true
    candidate_api_tag      = "candidate-be1b01ce47ad"
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].cloud_run[0].service == "moazez-production-api" && google_compute_region_network_endpoint_group.api_candidate[0].cloud_run[0].tag == var.candidate_api_tag
    error_message = "The candidate NEG must target the same API service plus the exact candidate tag."
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].name == "moazez-production-api-candidate-be1b01ce47ad-neg"
    error_message = "The base Candidate NEG physical name must be derived from the exact candidate tag."
  }

  assert {
    condition     = google_compute_backend_service.api_candidate[0].name == "moazez-production-api-candidate-backend" && one(google_compute_backend_service.api_candidate[0].backend).group == google_compute_region_network_endpoint_group.api_candidate[0].id
    error_message = "The Candidate Backend identity must remain stable and directly reference the rotating Candidate NEG."
  }

  assert {
    condition     = google_compute_backend_service.api_candidate[0].security_policy == google_compute_backend_service.service["api"].security_policy && google_compute_backend_service.api_candidate[0].custom_request_headers == google_compute_backend_service.service["api"].custom_request_headers
    error_message = "The isolated candidate backend must reuse the normal API Cloud Armor and trusted-client-IP posture."
  }

  assert {
    condition     = google_compute_url_map.edge.path_matcher[0].path_rule[0].paths == toset(["/.well-known/moazez/candidate-readiness"])
    error_message = "Candidate routing must expose exactly one narrow public path."
  }

  assert {
    condition     = google_compute_url_map.edge.name == "moazez-production-edge-url-map"
    error_message = "The shared URL Map physical identity must remain stable during Candidate NEG rotation."
  }

  assert {
    condition     = google_compute_url_map.edge.path_matcher[0].path_rule[0].route_action[0].url_rewrite[0].path_prefix_rewrite == "/api/v1/auth/me"
    error_message = "The public smoke path must rewrite only to the existing authenticated GET /api/v1/auth/me endpoint."
  }

  assert {
    condition     = output.candidate_serverless_neg_name != null && output.candidate_backend_service_name != null && output.candidate_smoke_public_path == "/.well-known/moazez/candidate-readiness" && output.candidate_smoke_backend_path == "/api/v1/auth/me"
    error_message = "Omitting the route variable while Candidate Edge is enabled must preserve every historical Candidate output."
  }
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: safe_cleanup_stage_one_removes_route_and_preserves_candidate_resources
run "module_contract__safe_cleanup_stage_one_removes_route_and_preserves_candidate_resources" {
  command = plan


  variables {
    candidate_edge_enabled        = true
    candidate_smoke_route_enabled = false
    candidate_api_tag             = "candidate-be1b01ce47ad"
  }

  assert {
    condition     = length(google_compute_region_network_endpoint_group.api_candidate) == 1 && length(google_compute_backend_service.api_candidate) == 1
    error_message = "Stage 1 must preserve the Candidate NEG and Candidate Backend."
  }

  assert {
    condition     = length(google_compute_url_map.edge.path_matcher[0].path_rule) == 0
    error_message = "Stage 1 must remove the Candidate path rule."
  }

  assert {
    condition     = output.candidate_serverless_neg_name != null && output.candidate_backend_service_name != null
    error_message = "Stage 1 Candidate resource outputs must remain non-null."
  }

  assert {
    condition     = output.candidate_smoke_public_path == null && output.candidate_smoke_backend_path == null
    error_message = "Stage 1 smoke-route outputs must be null because the route is not rendered."
  }
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: safe_cleanup_stage_two_removes_candidate_resources_after_route_removal
run "module_contract__safe_cleanup_stage_two_removes_candidate_resources_after_route_removal" {
  command = plan


  variables {
    candidate_edge_enabled        = false
    candidate_smoke_route_enabled = false
    candidate_api_tag             = null
  }

  assert {
    condition     = length(google_compute_region_network_endpoint_group.api_candidate) == 0 && length(google_compute_backend_service.api_candidate) == 0 && length(google_compute_url_map.edge.path_matcher[0].path_rule) == 0
    error_message = "Stage 2 must represent Candidate NEG, Backend, and route as absent."
  }

  assert {
    condition     = output.candidate_serverless_neg_name == null && output.candidate_backend_service_name == null && output.candidate_smoke_public_path == null && output.candidate_smoke_backend_path == null
    error_message = "Stage 2 must expose no Candidate resource or smoke-route outputs."
  }
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: candidate_route_without_candidate_resources_fails_explicit_contract
run "module_contract__candidate_route_without_candidate_resources_fails_explicit_contract" {
  command = plan


  variables {
    candidate_edge_enabled        = false
    candidate_smoke_route_enabled = true
    candidate_api_tag             = null
  }

  expect_failures = [google_compute_url_map.edge]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: recovery_attempt_one_targets_exact_candidate_tag
run "module_contract__recovery_attempt_one_targets_exact_candidate_tag" {
  command = plan


  variables {
    candidate_edge_enabled = true
    candidate_api_tag      = "candidate-be1b01ce47ad-r1"
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].name == "moazez-production-api-candidate-be1b01ce47ad-r1-neg" && google_compute_region_network_endpoint_group.api_candidate[0].cloud_run[0].tag == "candidate-be1b01ce47ad-r1" && google_compute_region_network_endpoint_group.service["api"].cloud_run[0].tag == null
    error_message = "Recovery attempt one must rotate to its exact tag-derived Candidate NEG identity."
  }

  assert {
    condition     = google_compute_backend_service.api_candidate[0].security_policy == google_compute_backend_service.service["api"].security_policy && google_compute_url_map.edge.path_matcher[0].path_rule[0].paths == toset(["/.well-known/moazez/candidate-readiness"])
    error_message = "Recovery routing must preserve the candidate backend security policy and exact smoke route."
  }
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: recovery_attempt_two_targets_exact_candidate_tag
run "module_contract__recovery_attempt_two_targets_exact_candidate_tag" {
  command = plan


  variables {
    candidate_edge_enabled = true
    candidate_api_tag      = "candidate-be1b01ce47ad-r2"
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].cloud_run[0].service == "moazez-production-api" && google_compute_region_network_endpoint_group.api_candidate[0].cloud_run[0].tag == "candidate-be1b01ce47ad-r2"
    error_message = "Recovery attempt two must reach the exact tagged candidate revision."
  }
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: maximum_recovery_attempt_produces_valid_rfc1035_candidate_neg_name
run "module_contract__maximum_recovery_attempt_produces_valid_rfc1035_candidate_neg_name" {
  command = plan


  variables {
    candidate_edge_enabled = true
    candidate_api_tag      = "candidate-be1b01ce47ad-r9999999999999"
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].name == "moazez-production-api-candidate-be1b01ce47ad-r9999999999999-neg"
    error_message = "The maximum supported recovery tag must produce the exact deterministic Candidate NEG name."
  }

  assert {
    condition     = length(google_compute_region_network_endpoint_group.api_candidate[0].name) == 63 && can(regex("^[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$", google_compute_region_network_endpoint_group.api_candidate[0].name))
    error_message = "The maximum Candidate NEG name must be 62 characters and RFC1035-shaped."
  }
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: production_candidate_route_defaults_disabled_and_normal_api_neg_is_unchanged
run "module_contract__production_candidate_route_defaults_disabled_and_normal_api_neg_is_unchanged" {
  command = plan


  variables {
    project_id                    = "moazez-production"
    environment                   = "production"
    api_hostname                  = "api.moazez.cloud"
    platform_admin_hostname       = "admin.moazez.cloud"
    school_dashboard_hostname     = "schools.moazez.cloud"
    api_service_name              = "moazez-production-api"
    platform_admin_service_name   = "moazez-production-platform-admin"
    school_dashboard_service_name = "moazez-production-school-dashboard"
    student_hostname              = "student.moazez.cloud"
    student_service_name          = "moazez-production-student-web"
    teacher_hostname              = "teacher.moazez.cloud"
    teacher_service_name          = "moazez-production-teacher-web"
  }

  assert {
    condition     = length(google_compute_region_network_endpoint_group.api_candidate) == 0 && length(google_compute_backend_service.api_candidate) == 0
    error_message = "Production Candidate-only resources must default to absent."
  }

  assert {
    condition     = length(google_compute_url_map.edge.path_matcher[0].path_rule) == 0
    error_message = "The Production API URL map must have no candidate route by default."
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.service["api"].cloud_run[0].service == "moazez-production-api" && google_compute_region_network_endpoint_group.service["api"].cloud_run[0].tag == null
    error_message = "The normal Production API NEG must remain service-level and untagged."
  }

  assert {
    condition     = google_compute_backend_service.service["api"].name == "moazez-production-api-backend" && one(google_compute_backend_service.service["api"].backend).group == google_compute_region_network_endpoint_group.service["api"].id
    error_message = "The normal Production API backend must remain unchanged."
  }
  assert {
    condition     = keys(google_compute_region_network_endpoint_group.service) == ["admin", "api", "schools", "student", "teacher"] && keys(google_compute_backend_service.service) == ["admin", "api", "schools", "student", "teacher"]
    error_message = "Production must preserve all existing surfaces and add only Teacher."
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.service["teacher"].name == "moazez-production-teacher-neg" && google_compute_region_network_endpoint_group.service["teacher"].region == "me-central2" && google_compute_region_network_endpoint_group.service["teacher"].cloud_run[0].service == "moazez-production-teacher-web" && google_compute_region_network_endpoint_group.service["teacher"].cloud_run[0].tag == null
    error_message = "Teacher must use the exact regional service-level NEG."
  }

  assert {
    condition     = google_compute_backend_service.service["teacher"].name == "moazez-production-teacher-backend" && google_compute_backend_service.service["teacher"].protocol == "HTTP" && google_compute_backend_service.service["teacher"].load_balancing_scheme == "EXTERNAL_MANAGED" && google_compute_backend_service.service["teacher"].security_policy == google_compute_backend_service.service["api"].security_policy && length(google_compute_backend_service.service["teacher"].custom_request_headers) == 0 && one(google_compute_backend_service.service["teacher"].backend).group == google_compute_region_network_endpoint_group.service["teacher"].id
    error_message = "Teacher must reuse shared Armor and external managed architecture without API trusted headers."
  }

  assert {
    condition     = length(google_compute_url_map.edge.host_rule) == 5 && length(google_compute_url_map.edge.path_matcher) == 5 && one([for rule in google_compute_url_map.edge.host_rule : rule.path_matcher if rule.hosts == toset(["teacher.moazez.cloud"])]) == "teacher" && one([for matcher in google_compute_url_map.edge.path_matcher : matcher.default_service if matcher.name == "teacher"]) == google_compute_backend_service.service["teacher"].id
    error_message = "The existing URL map must route all Teacher paths to its backend and preserve the four original hosts."
  }

  assert {
    condition     = length(google_certificate_manager_certificate.teacher) == 1 && google_certificate_manager_certificate.teacher[0].name == "moazez-production-teacher-cert" && tolist(google_certificate_manager_certificate.teacher[0].managed[0].domains) == tolist(["teacher.moazez.cloud"]) && sort(tolist(google_certificate_manager_certificate.edge.managed[0].domains)) == sort(["api.moazez.cloud", "admin.moazez.cloud", "schools.moazez.cloud"]) && tolist(google_certificate_manager_certificate.student[0].managed[0].domains) == tolist(["student.moazez.cloud"])
    error_message = "Teacher must use a dedicated certificate without expanding shared or Student domains."
  }

  assert {
    condition     = length(google_certificate_manager_certificate_map_entry.teacher) == 1 && google_certificate_manager_certificate_map_entry.teacher[0].name == "moazez-production-teacher-cert-entry" && google_certificate_manager_certificate_map_entry.teacher[0].map == google_certificate_manager_certificate_map.edge.name && google_certificate_manager_certificate_map_entry.teacher[0].hostname == "teacher.moazez.cloud" && tolist(google_certificate_manager_certificate_map_entry.teacher[0].certificates) == tolist([google_certificate_manager_certificate.teacher[0].id]) && output.teacher_certificate_name == "moazez-production-teacher-cert"
    error_message = "Teacher must add its own entry to the existing certificate map."
  }

}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: production_candidate_route_explicit_enable_targets_exact_candidate
run "module_contract__production_candidate_route_explicit_enable_targets_exact_candidate" {
  command = plan


  variables {
    project_id                    = "moazez-production"
    environment                   = "production"
    api_hostname                  = "api.moazez.cloud"
    platform_admin_hostname       = "admin.moazez.cloud"
    school_dashboard_hostname     = "schools.moazez.cloud"
    api_service_name              = "moazez-production-api"
    platform_admin_service_name   = "moazez-production-platform-admin"
    school_dashboard_service_name = "moazez-production-school-dashboard"
    student_hostname              = "student.moazez.cloud"
    student_service_name          = "moazez-production-student-web"
    teacher_hostname              = "teacher.moazez.cloud"
    teacher_service_name          = "moazez-production-teacher-web"
    candidate_edge_enabled        = true
    candidate_smoke_route_enabled = true
    candidate_api_tag             = "candidate-cf720dacbc04"
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].cloud_run[0].service == "moazez-production-api" && google_compute_region_network_endpoint_group.api_candidate[0].cloud_run[0].tag == "candidate-cf720dacbc04"
    error_message = "The Production Candidate NEG must target the exact API service and candidate tag."
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].name == "moazez-production-api-candidate-cf720dacbc04-neg"
    error_message = "The Production Candidate NEG must retain its exact deterministic physical identity."
  }

  assert {
    condition     = google_compute_backend_service.api_candidate[0].name == "moazez-production-api-candidate-backend" && one(google_compute_backend_service.api_candidate[0].backend).group == google_compute_region_network_endpoint_group.api_candidate[0].id
    error_message = "The Production Candidate Backend must directly reference the tagged Candidate NEG."
  }

  assert {
    condition     = google_compute_backend_service.api_candidate[0].protocol == "HTTP" && google_compute_backend_service.api_candidate[0].load_balancing_scheme == "EXTERNAL_MANAGED"
    error_message = "The Production Candidate Backend must retain the existing external managed HTTP architecture."
  }

  assert {
    condition     = google_compute_backend_service.api_candidate[0].security_policy == google_compute_backend_service.service["api"].security_policy && google_compute_backend_service.api_candidate[0].custom_request_headers == google_compute_backend_service.service["api"].custom_request_headers
    error_message = "The Production Candidate Backend must reuse the normal API Cloud Armor and trusted-client-IP posture."
  }

  assert {
    condition     = google_compute_url_map.edge.name == "moazez-production-edge-url-map" && google_compute_url_map.edge.path_matcher[0].path_rule[0].paths == toset(["/.well-known/moazez/candidate-readiness"])
    error_message = "The Production URL map must expose only the exact candidate readiness path."
  }

  assert {
    condition     = google_compute_url_map.edge.path_matcher[0].path_rule[0].route_action[0].url_rewrite[0].path_prefix_rewrite == "/api/v1/auth/me"
    error_message = "The Production candidate smoke path must rewrite to the existing protected application route."
  }
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: production_thirteen_digit_recovery_suffix_reaches_exact_name_boundary
run "module_contract__production_thirteen_digit_recovery_suffix_reaches_exact_name_boundary" {
  command = plan


  variables {
    project_id                    = "moazez-production"
    environment                   = "production"
    api_hostname                  = "api.moazez.cloud"
    platform_admin_hostname       = "admin.moazez.cloud"
    school_dashboard_hostname     = "schools.moazez.cloud"
    api_service_name              = "moazez-production-api"
    platform_admin_service_name   = "moazez-production-platform-admin"
    school_dashboard_service_name = "moazez-production-school-dashboard"
    student_hostname              = "student.moazez.cloud"
    student_service_name          = "moazez-production-student-web"
    teacher_hostname              = "teacher.moazez.cloud"
    teacher_service_name          = "moazez-production-teacher-web"
    candidate_edge_enabled        = true
    candidate_api_tag             = "candidate-cf720dacbc04-r9999999999999"
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].name == "moazez-production-api-candidate-cf720dacbc04-r9999999999999-neg"
    error_message = "The 13-digit Production recovery suffix must produce the exact deterministic Candidate NEG name."
  }

  assert {
    condition     = length(google_compute_region_network_endpoint_group.api_candidate[0].name) == 63 && can(regex("^[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$", google_compute_region_network_endpoint_group.api_candidate[0].name))
    error_message = "The 13-digit Production recovery Candidate NEG name must be exactly 63 characters and RFC1035-shaped."
  }
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: production_fourteen_digit_recovery_suffix_fails_physical_name_guard
run "module_contract__production_fourteen_digit_recovery_suffix_fails_physical_name_guard" {
  command = plan


  variables {
    project_id                    = "moazez-production"
    environment                   = "production"
    api_hostname                  = "api.moazez.cloud"
    platform_admin_hostname       = "admin.moazez.cloud"
    school_dashboard_hostname     = "schools.moazez.cloud"
    api_service_name              = "moazez-production-api"
    platform_admin_service_name   = "moazez-production-platform-admin"
    school_dashboard_service_name = "moazez-production-school-dashboard"
    student_hostname              = "student.moazez.cloud"
    student_service_name          = "moazez-production-student-web"
    teacher_hostname              = "teacher.moazez.cloud"
    teacher_service_name          = "moazez-production-teacher-web"
    candidate_edge_enabled        = true
    candidate_api_tag             = "candidate-cf720dacbc04-r10000000000000"
  }

  expect_failures = [google_compute_region_network_endpoint_group.api_candidate]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: production_candidate_route_rejects_missing_tag
run "module_contract__production_candidate_route_rejects_missing_tag" {
  command = plan


  variables {
    project_id                    = "moazez-production"
    environment                   = "production"
    api_hostname                  = "api.moazez.cloud"
    platform_admin_hostname       = "admin.moazez.cloud"
    school_dashboard_hostname     = "schools.moazez.cloud"
    api_service_name              = "moazez-production-api"
    platform_admin_service_name   = "moazez-production-platform-admin"
    school_dashboard_service_name = "moazez-production-school-dashboard"
    student_hostname              = "student.moazez.cloud"
    student_service_name          = "moazez-production-student-web"
    teacher_hostname              = "teacher.moazez.cloud"
    teacher_service_name          = "moazez-production-teacher-web"
    candidate_edge_enabled        = true
  }

  expect_failures = [google_compute_region_network_endpoint_group.api_candidate]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: production_disabled_candidate_route_rejects_stale_tag
run "module_contract__production_disabled_candidate_route_rejects_stale_tag" {
  command = plan


  variables {
    project_id                    = "moazez-production"
    environment                   = "production"
    api_hostname                  = "api.moazez.cloud"
    platform_admin_hostname       = "admin.moazez.cloud"
    school_dashboard_hostname     = "schools.moazez.cloud"
    api_service_name              = "moazez-production-api"
    platform_admin_service_name   = "moazez-production-platform-admin"
    school_dashboard_service_name = "moazez-production-school-dashboard"
    student_hostname              = "student.moazez.cloud"
    student_service_name          = "moazez-production-student-web"
    teacher_hostname              = "teacher.moazez.cloud"
    teacher_service_name          = "moazez-production-teacher-web"
    candidate_api_tag             = "candidate-cf720dacbc04"
  }

  expect_failures = [google_compute_url_map.edge]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: production_candidate_route_rejects_malformed_tag
run "module_contract__production_candidate_route_rejects_malformed_tag" {
  command = plan


  variables {
    project_id                    = "moazez-production"
    environment                   = "production"
    api_hostname                  = "api.moazez.cloud"
    platform_admin_hostname       = "admin.moazez.cloud"
    school_dashboard_hostname     = "schools.moazez.cloud"
    api_service_name              = "moazez-production-api"
    platform_admin_service_name   = "moazez-production-platform-admin"
    school_dashboard_service_name = "moazez-production-school-dashboard"
    student_hostname              = "student.moazez.cloud"
    student_service_name          = "moazez-production-student-web"
    teacher_hostname              = "teacher.moazez.cloud"
    teacher_service_name          = "moazez-production-teacher-web"
    candidate_edge_enabled        = true
    candidate_api_tag             = "candidate-CF720DACBC04"
  }

  expect_failures = [var.candidate_api_tag]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: candidate_route_rejects_zero_recovery_attempt
run "module_contract__candidate_route_rejects_zero_recovery_attempt" {
  command = plan


  variables {
    candidate_api_tag = "candidate-be1b01ce47ad-r0"
  }

  expect_failures = [var.candidate_api_tag]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: candidate_route_rejects_leading_zero_recovery_attempt
run "module_contract__candidate_route_rejects_leading_zero_recovery_attempt" {
  command = plan


  variables {
    candidate_api_tag = "candidate-be1b01ce47ad-r01"
  }

  expect_failures = [var.candidate_api_tag]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: candidate_route_rejects_bad_recovery_suffix
run "module_contract__candidate_route_rejects_bad_recovery_suffix" {
  command = plan


  variables {
    candidate_api_tag = "candidate-be1b01ce47ad-r1x"
  }

  expect_failures = [var.candidate_api_tag]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: candidate_route_rejects_overlong_recovery_attempt
run "module_contract__candidate_route_rejects_overlong_recovery_attempt" {
  command = plan


  variables {
    candidate_api_tag = "candidate-be1b01ce47ad-r1000000000000000"
  }

  expect_failures = [var.candidate_api_tag]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: candidate_route_rejects_missing_tag
run "module_contract__candidate_route_rejects_missing_tag" {
  command = plan


  variables {
    candidate_edge_enabled = true
  }

  expect_failures = [google_compute_region_network_endpoint_group.api_candidate]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: disabled_candidate_route_rejects_stale_tag
run "module_contract__disabled_candidate_route_rejects_stale_tag" {
  command = plan


  variables {
    candidate_api_tag = "candidate-be1b01ce47ad"
  }

  expect_failures = [google_compute_url_map.edge]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: teacher_rejects_wrong_production_hostname
run "module_contract__teacher_rejects_wrong_production_hostname" {
  command = plan
  variables {
    project_id                    = "moazez-production"
    environment                   = "production"
    api_hostname                  = "api.moazez.cloud"
    platform_admin_hostname       = "admin.moazez.cloud"
    school_dashboard_hostname     = "schools.moazez.cloud"
    api_service_name              = "moazez-production-api"
    platform_admin_service_name   = "moazez-production-platform-admin"
    school_dashboard_service_name = "moazez-production-school-dashboard"
    student_hostname              = "student.moazez.cloud"
    student_service_name          = "moazez-production-student-web"
    teacher_hostname              = "teacher.example.test"
    teacher_service_name          = "moazez-production-teacher-web"
  }
  expect_failures = [google_compute_url_map.edge]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: teacher_rejects_wrong_production_service
run "module_contract__teacher_rejects_wrong_production_service" {
  command = plan
  variables {
    project_id                    = "moazez-production"
    environment                   = "production"
    api_hostname                  = "api.moazez.cloud"
    platform_admin_hostname       = "admin.moazez.cloud"
    school_dashboard_hostname     = "schools.moazez.cloud"
    api_service_name              = "moazez-production-api"
    platform_admin_service_name   = "moazez-production-platform-admin"
    school_dashboard_service_name = "moazez-production-school-dashboard"
    student_hostname              = "student.moazez.cloud"
    student_service_name          = "moazez-production-student-web"
    teacher_hostname              = "teacher.moazez.cloud"
    teacher_service_name          = "moazez-production-student-web"
  }
  expect_failures = [google_compute_url_map.edge]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: teacher_rejects_wrong_project
run "module_contract__teacher_rejects_wrong_project" {
  command = plan
  variables {
    project_id                    = "moazez-other-production"
    environment                   = "production"
    api_hostname                  = "api.moazez.cloud"
    platform_admin_hostname       = "admin.moazez.cloud"
    school_dashboard_hostname     = "schools.moazez.cloud"
    api_service_name              = "moazez-production-api"
    platform_admin_service_name   = "moazez-production-platform-admin"
    school_dashboard_service_name = "moazez-production-school-dashboard"
    student_hostname              = "student.moazez.cloud"
    student_service_name          = "moazez-production-student-web"
    teacher_hostname              = "teacher.moazez.cloud"
    teacher_service_name          = "moazez-production-teacher-web"
  }
  expect_failures = [google_compute_url_map.edge]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: teacher_rejects_wrong_region
run "module_contract__teacher_rejects_wrong_region" {
  command = plan
  variables {
    project_id                    = "moazez-production"
    environment                   = "production"
    api_hostname                  = "api.moazez.cloud"
    platform_admin_hostname       = "admin.moazez.cloud"
    school_dashboard_hostname     = "schools.moazez.cloud"
    api_service_name              = "moazez-production-api"
    platform_admin_service_name   = "moazez-production-platform-admin"
    school_dashboard_service_name = "moazez-production-school-dashboard"
    student_hostname              = "student.moazez.cloud"
    student_service_name          = "moazez-production-student-web"
    teacher_hostname              = "teacher.moazez.cloud"
    teacher_service_name          = "moazez-production-teacher-web"
    region                        = "me-central1"
  }
  expect_failures = [google_compute_url_map.edge]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: teacher_rejects_missing_production_inputs
run "module_contract__teacher_rejects_missing_production_inputs" {
  command = plan
  variables {
    project_id                    = "moazez-production"
    environment                   = "production"
    api_hostname                  = "api.moazez.cloud"
    platform_admin_hostname       = "admin.moazez.cloud"
    school_dashboard_hostname     = "schools.moazez.cloud"
    api_service_name              = "moazez-production-api"
    platform_admin_service_name   = "moazez-production-platform-admin"
    school_dashboard_service_name = "moazez-production-school-dashboard"
    student_hostname              = "student.moazez.cloud"
    student_service_name          = "moazez-production-student-web"
    teacher_hostname              = null
    teacher_service_name          = null
  }
  expect_failures = [google_compute_url_map.edge]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: teacher_rejects_staging_hostname
run "module_contract__teacher_rejects_staging_hostname" {
  command = plan
  variables {
    teacher_hostname = "staging-admin.moazez.cloud"
  }
  expect_failures = [google_compute_url_map.edge]
}

# Immutable historical obligation: infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl :: teacher_rejects_staging_service
run "module_contract__teacher_rejects_staging_service" {
  command = plan
  variables {
    teacher_service_name = "moazez-staging-api"
  }
  expect_failures = [google_compute_url_map.edge]
}

run "retired_or_unknown_selector_0" {
  command = plan
  variables {
    environment = "staging"
  }
  expect_failures = [var.environment]
}

run "retired_or_unknown_selector_1" {
  command = plan
  variables {
    environment = "nonprod"
  }
  expect_failures = [var.environment]
}

run "retired_or_unknown_selector_2" {
  command = plan
  variables {
    environment = "unknown"
  }
  expect_failures = [var.environment]
}

run "retired_or_unknown_selector_3" {
  command = plan
  variables {
    environment = "preview"
  }
  expect_failures = [var.environment]
}

run "retired_or_unknown_selector_4" {
  command = plan
  variables {
    environment = ""
  }
  expect_failures = [var.environment]
}

run "retired_or_unknown_selector_5" {
  command = plan
  variables {
    environment = " "
  }
  expect_failures = [var.environment]
}

run "retired_or_unknown_selector_6" {
  command = plan
  variables {
    environment = "PRODUCTION"
  }
  expect_failures = [var.environment]
}

run "retired_or_unknown_selector_7" {
  command = plan
  variables {
    environment = "Production"
  }
  expect_failures = [var.environment]
}

# Null binding is rejected by Terraform before custom validation checks.
# The fixture generator exercises it in an isolated mock test process and
# requires the exact required-variable diagnostic, rather than expect_failures.
