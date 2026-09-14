mock_provider "google" {
  override_during = plan

  mock_resource "google_compute_security_policy" {
    defaults = {
      self_link = "https://example.invalid/securityPolicies/moazez-staging-edge-armor"
    }
  }

  mock_resource "google_compute_region_network_endpoint_group" {
    defaults = {
      id = "https://example.invalid/networkEndpointGroups/mock-neg"
    }
  }
}

variables {
  project_id                    = "moazez-nonprod-91001421934"
  region                        = "me-central2"
  environment                   = "staging"
  api_hostname                  = "staging-api.moazez.cloud"
  platform_admin_hostname       = "staging-admin.moazez.cloud"
  school_dashboard_hostname     = "staging-schools.moazez.cloud"
  api_service_name              = "moazez-staging-api"
  platform_admin_service_name   = "moazez-staging-platform-admin"
  school_dashboard_service_name = "moazez-staging-school-dashboard"
}

run "candidate_route_defaults_disabled_and_normal_api_neg_is_unchanged" {
  command = plan

  module {
    source = "../../modules/edge-environment"
  }

  assert {
    condition     = length(google_compute_region_network_endpoint_group.api_candidate) == 0 && length(google_compute_backend_service.api_candidate) == 0
    error_message = "Candidate-only resources must default to absent."
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.service["api"].cloud_run[0].service == "moazez-staging-api" && google_compute_region_network_endpoint_group.service["api"].cloud_run[0].tag == null
    error_message = "The normal API service-level NEG must remain untagged and unchanged."
  }

  assert {
    condition     = length(google_compute_url_map.edge.path_matcher[0].path_rule) == 0
    error_message = "The API URL map must have no candidate route by default."
  }
}

run "staging_candidate_route_targets_tagged_revision_and_reuses_security_posture" {
  command = plan

  module {
    source = "../../modules/edge-environment"
  }

  variables {
    candidate_edge_enabled = true
    candidate_api_tag      = "candidate-be1b01ce47ad"
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].cloud_run[0].service == "moazez-staging-api" && google_compute_region_network_endpoint_group.api_candidate[0].cloud_run[0].tag == var.candidate_api_tag
    error_message = "The candidate NEG must target the same API service plus the exact candidate tag."
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].name == "moazez-staging-api-candidate-be1b01ce47ad-neg"
    error_message = "The base Candidate NEG physical name must be derived from the exact candidate tag."
  }

  assert {
    condition     = google_compute_backend_service.api_candidate[0].name == "moazez-staging-api-candidate-backend" && one(google_compute_backend_service.api_candidate[0].backend).group == google_compute_region_network_endpoint_group.api_candidate[0].id
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
    condition     = google_compute_url_map.edge.name == "moazez-staging-edge-url-map"
    error_message = "The shared URL Map physical identity must remain stable during Candidate NEG rotation."
  }

  assert {
    condition     = google_compute_url_map.edge.path_matcher[0].path_rule[0].route_action[0].url_rewrite[0].path_prefix_rewrite == "/api/v1/auth/me"
    error_message = "The public smoke path must rewrite only to the existing authenticated GET /api/v1/auth/me endpoint."
  }
}

run "recovery_attempt_one_targets_exact_candidate_tag" {
  command = plan

  module {
    source = "../../modules/edge-environment"
  }

  variables {
    candidate_edge_enabled = true
    candidate_api_tag      = "candidate-be1b01ce47ad-r1"
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].name == "moazez-staging-api-candidate-be1b01ce47ad-r1-neg" && google_compute_region_network_endpoint_group.api_candidate[0].cloud_run[0].tag == "candidate-be1b01ce47ad-r1" && google_compute_region_network_endpoint_group.service["api"].cloud_run[0].tag == null
    error_message = "Recovery attempt one must rotate to its exact tag-derived Candidate NEG identity."
  }

  assert {
    condition     = google_compute_backend_service.api_candidate[0].security_policy == google_compute_backend_service.service["api"].security_policy && google_compute_url_map.edge.path_matcher[0].path_rule[0].paths == toset(["/.well-known/moazez/candidate-readiness"])
    error_message = "Recovery routing must preserve the candidate backend security policy and exact smoke route."
  }
}

run "recovery_attempt_two_targets_exact_candidate_tag" {
  command = plan

  module {
    source = "../../modules/edge-environment"
  }

  variables {
    candidate_edge_enabled = true
    candidate_api_tag      = "candidate-be1b01ce47ad-r2"
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].cloud_run[0].service == "moazez-staging-api" && google_compute_region_network_endpoint_group.api_candidate[0].cloud_run[0].tag == "candidate-be1b01ce47ad-r2"
    error_message = "Recovery attempt two must reach the exact tagged candidate revision."
  }
}

run "maximum_recovery_attempt_produces_valid_rfc1035_candidate_neg_name" {
  command = plan

  module {
    source = "../../modules/edge-environment"
  }

  variables {
    candidate_edge_enabled = true
    candidate_api_tag      = "candidate-be1b01ce47ad-r999999999999999"
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.api_candidate[0].name == "moazez-staging-api-candidate-be1b01ce47ad-r999999999999999-neg"
    error_message = "The maximum supported recovery tag must produce the exact deterministic Candidate NEG name."
  }

  assert {
    condition     = length(google_compute_region_network_endpoint_group.api_candidate[0].name) == 62 && can(regex("^[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$", google_compute_region_network_endpoint_group.api_candidate[0].name))
    error_message = "The maximum Candidate NEG name must be 62 characters and RFC1035-shaped."
  }
}

run "candidate_route_rejects_zero_recovery_attempt" {
  command = plan

  module {
    source = "../../modules/edge-environment"
  }

  variables {
    candidate_api_tag = "candidate-be1b01ce47ad-r0"
  }

  expect_failures = [var.candidate_api_tag]
}

run "candidate_route_rejects_leading_zero_recovery_attempt" {
  command = plan

  module {
    source = "../../modules/edge-environment"
  }

  variables {
    candidate_api_tag = "candidate-be1b01ce47ad-r01"
  }

  expect_failures = [var.candidate_api_tag]
}

run "candidate_route_rejects_bad_recovery_suffix" {
  command = plan

  module {
    source = "../../modules/edge-environment"
  }

  variables {
    candidate_api_tag = "candidate-be1b01ce47ad-r1x"
  }

  expect_failures = [var.candidate_api_tag]
}

run "candidate_route_rejects_overlong_recovery_attempt" {
  command = plan

  module {
    source = "../../modules/edge-environment"
  }

  variables {
    candidate_api_tag = "candidate-be1b01ce47ad-r1000000000000000"
  }

  expect_failures = [var.candidate_api_tag]
}

run "candidate_route_rejects_missing_tag" {
  command = plan

  module {
    source = "../../modules/edge-environment"
  }

  variables {
    candidate_edge_enabled = true
  }

  expect_failures = [google_compute_url_map.edge]
}

run "disabled_candidate_route_rejects_stale_tag" {
  command = plan

  module {
    source = "../../modules/edge-environment"
  }

  variables {
    candidate_api_tag = "candidate-be1b01ce47ad"
  }

  expect_failures = [google_compute_url_map.edge]
}
