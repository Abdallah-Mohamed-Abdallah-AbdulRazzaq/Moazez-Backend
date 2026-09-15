mock_provider "google" {}

variables {
  environment                                    = "staging"
  api_service_min_instances                      = 1
  api_service_max_instances                      = 4
  api_max_instance_request_concurrency           = 40
  api_database_connection_limit                  = 5
  core_worker_manual_instance_count              = 1
  media_worker_manual_instance_count             = 1
  fcm_delivery_mode                              = "dry_run"
  api_image_reference                            = "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  core_worker_image_reference                    = "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  media_worker_image_reference                   = "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  maintenance_scheduler_image_reference          = "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  queue_redis_host                               = "queue.staging.internal"
  queue_redis_port                               = 6378
  queue_redis_ca_pem                             = "test-queue-ca"
  realtime_redis_host                            = "realtime.staging.internal"
  realtime_redis_port                            = 6378
  realtime_redis_ca_pem                          = "test-realtime-ca"
  api_url                                        = "https://staging-api.moazez.cloud"
  settings_email_secret_encryption_active_key_id = "staging-email-20260815"
  app_device_token_encryption_active_key_id      = "staging-device-20260815"
}

run "normal_default_keeps_provider_revision_and_isolates_runtime_images" {
  command = plan

  module {
    source = "../../../modules/runtime-environment"
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].image == var.api_image_reference && google_cloud_run_v2_service.api.template[0].revision == null
    error_message = "Normal API mode must use only its image input and provider-generated revision naming."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.scaling[0].min_instance_count == 1 && google_cloud_run_v2_service.api.scaling[0].max_instance_count == 4 && google_cloud_run_v2_service.api.template[0].max_instance_request_concurrency == 40
    error_message = "Staging service capacity and concurrency must come from the explicit environment authority."
  }

  assert {
    condition     = length(google_cloud_run_v2_service.api.template[0].scaling) == 0 && google_cloud_run_v2_service.api.template[0].session_affinity == null
    error_message = "Null revision max and session affinity must remain absent and unmanaged; timeout absence is source-verified because the provider reports it unknown during plan."
  }

  assert {
    condition     = google_cloud_run_v2_worker_pool.core.scaling[0].manual_instance_count == 1 && google_cloud_run_v2_worker_pool.media.scaling[0].manual_instance_count == 1 && google_cloud_run_v2_worker_pool.maintenance_scheduler.scaling[0].manual_instance_count == 1
    error_message = "Core and Media counts must use governed inputs while Maintenance remains literal one."
  }

  assert {
    condition     = google_cloud_run_v2_worker_pool.core.template[0].containers[0].image == var.core_worker_image_reference
    error_message = "The Core Worker must use only core_worker_image_reference."
  }

  assert {
    condition     = google_cloud_run_v2_worker_pool.media.template[0].containers[0].image == var.media_worker_image_reference
    error_message = "The Media Worker must use only media_worker_image_reference."
  }

  assert {
    condition     = google_cloud_run_v2_worker_pool.maintenance_scheduler.template[0].containers[0].image == var.maintenance_scheduler_image_reference
    error_message = "The Maintenance Scheduler must use only maintenance_scheduler_image_reference."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].startup_probe[0].initial_delay_seconds == 10 && google_cloud_run_v2_service.api.template[0].containers[0].startup_probe[0].period_seconds == 5 && google_cloud_run_v2_service.api.template[0].containers[0].startup_probe[0].timeout_seconds == 2 && google_cloud_run_v2_service.api.template[0].containers[0].startup_probe[0].failure_threshold == 12
    error_message = "The API startup probe must retain the exact 10/5/2/12 initialization budget."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].startup_probe[0].http_get[0].path == "/internal/probes/api/startup" && google_cloud_run_v2_service.api.template[0].containers[0].startup_probe[0].http_get[0].port == 9090
    error_message = "The API startup probe must retain its management path and port."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].liveness_probe[0].http_get[0].path == "/internal/probes/api/liveness" && google_cloud_run_v2_service.api.template[0].containers[0].liveness_probe[0].http_get[0].port == 9090 && google_cloud_run_v2_service.api.template[0].containers[0].readiness_probe[0].http_get[0].path == "/internal/probes/api/readiness" && google_cloud_run_v2_service.api.template[0].containers[0].readiness_probe[0].http_get[0].port == 9090
    error_message = "The API liveness and readiness probes must retain their management paths and ports."
  }

  assert {
    condition     = google_cloud_run_v2_worker_pool.core.template[0].containers[0].startup_probe[0].http_get[0].path == "/internal/probes/core-worker/startup" && google_cloud_run_v2_worker_pool.core.template[0].containers[0].startup_probe[0].http_get[0].port == 9090 && google_cloud_run_v2_worker_pool.core.template[0].containers[0].liveness_probe[0].http_get[0].path == "/internal/probes/core-worker/liveness" && google_cloud_run_v2_worker_pool.core.template[0].containers[0].liveness_probe[0].http_get[0].port == 9090
    error_message = "The Core Worker probes must remain unchanged."
  }

  assert {
    condition     = google_cloud_run_v2_worker_pool.media.template[0].containers[0].startup_probe[0].http_get[0].path == "/internal/probes/media-worker/startup" && google_cloud_run_v2_worker_pool.media.template[0].containers[0].startup_probe[0].http_get[0].port == 9090 && google_cloud_run_v2_worker_pool.media.template[0].containers[0].liveness_probe[0].http_get[0].path == "/internal/probes/media-worker/liveness" && google_cloud_run_v2_worker_pool.media.template[0].containers[0].liveness_probe[0].http_get[0].port == 9090
    error_message = "The Media Worker probes must remain unchanged."
  }

  assert {
    condition     = google_cloud_run_v2_worker_pool.maintenance_scheduler.template[0].containers[0].startup_probe[0].http_get[0].path == "/internal/probes/maintenance-scheduler/startup" && google_cloud_run_v2_worker_pool.maintenance_scheduler.template[0].containers[0].startup_probe[0].http_get[0].port == 9090 && google_cloud_run_v2_worker_pool.maintenance_scheduler.template[0].containers[0].liveness_probe[0].http_get[0].path == "/internal/probes/maintenance-scheduler/liveness" && google_cloud_run_v2_worker_pool.maintenance_scheduler.template[0].containers[0].liveness_probe[0].http_get[0].port == 9090
    error_message = "The Maintenance Scheduler probes must remain unchanged."
  }
}

run "capacity_v1_candidate_binds_complete_revision_capacity" {
  command = plan

  module {
    source = "../../../modules/runtime-environment"
  }

  variables {
    api_traffic_mode               = "candidate_no_traffic"
    api_stable_revision            = "moazez-staging-api-stable01"
    api_candidate_tag              = "candidate-568cf1aab084"
    api_candidate_identity_version = "capacity-v1"
    api_revision_max_instances     = 4
    api_request_timeout_seconds    = 300
    api_session_affinity           = false
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].revision == "moazez-staging-api-candidate-568cf1aab084" && google_cloud_run_v2_service.api.traffic[1].percent == 0
    error_message = "capacity-v1 must derive the exact candidate identity and keep it at zero traffic."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].scaling[0].max_instance_count == 4 && google_cloud_run_v2_service.api.template[0].max_instance_request_concurrency == 40 && google_cloud_run_v2_service.api.template[0].timeout == "300s" && google_cloud_run_v2_service.api.template[0].session_affinity == false
    error_message = "capacity-v1 must materialize the complete explicit candidate revision capacity."
  }
}

run "candidate_no_traffic_pins_stable_and_tags_zero_percent_candidate" {
  command = plan

  module {
    source = "../../../modules/runtime-environment"
  }

  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-staging-api-stable01"
    api_candidate_tag   = "candidate-be1b01ce47ad"
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].image == var.api_image_reference && google_cloud_run_v2_service.api.template[0].revision == "moazez-staging-api-candidate-be1b01ce47ad"
    error_message = "Candidate mode must pin the exact image-derived candidate revision."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.traffic[0].revision == var.api_stable_revision && google_cloud_run_v2_service.api.traffic[0].percent == 100
    error_message = "The verified stable revision must retain all normal user traffic."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.traffic[1].revision == "moazez-staging-api-candidate-be1b01ce47ad" && google_cloud_run_v2_service.api.traffic[1].percent == 0 && google_cloud_run_v2_service.api.traffic[1].tag == var.api_candidate_tag
    error_message = "The tagged candidate revision must receive zero normal user traffic."
  }
}

run "candidate_promoted_flips_only_revision_traffic_semantics" {
  command = plan

  module {
    source = "../../../modules/runtime-environment"
  }

  variables {
    api_traffic_mode    = "candidate_promoted"
    api_stable_revision = "moazez-staging-api-stable01"
    api_candidate_tag   = "candidate-be1b01ce47ad"
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].image == var.api_image_reference && google_cloud_run_v2_service.api.template[0].revision == "moazez-staging-api-candidate-be1b01ce47ad"
    error_message = "Promotion must retain the exact API image and candidate revision."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.traffic[0].revision == var.api_stable_revision && google_cloud_run_v2_service.api.traffic[0].percent == 0
    error_message = "Promotion must remove normal traffic from the prior stable revision."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.traffic[1].revision == "moazez-staging-api-candidate-be1b01ce47ad" && google_cloud_run_v2_service.api.traffic[1].percent == 100 && google_cloud_run_v2_service.api.traffic[1].tag == var.api_candidate_tag
    error_message = "Promotion must assign all normal traffic to the unchanged candidate revision."
  }

  assert {
    condition     = google_cloud_run_v2_worker_pool.core.template[0].containers[0].image == var.core_worker_image_reference && google_cloud_run_v2_worker_pool.media.template[0].containers[0].image == var.media_worker_image_reference && google_cloud_run_v2_worker_pool.maintenance_scheduler.template[0].containers[0].image == var.maintenance_scheduler_image_reference
    error_message = "Traffic promotion must not alter any worker image input."
  }
}

run "recovery_attempt_one_pins_exact_revision_at_zero_traffic" {
  command = plan

  module {
    source = "../../../modules/runtime-environment"
  }

  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-staging-api-stable01"
    api_candidate_tag   = "candidate-be1b01ce47ad-r1"
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].image == var.api_image_reference && google_cloud_run_v2_service.api.template[0].revision == "moazez-staging-api-candidate-be1b01ce47ad-r1"
    error_message = "Recovery attempt one must retain the approved image and exact revision."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.traffic[0].revision == var.api_stable_revision && google_cloud_run_v2_service.api.traffic[0].percent == 100 && google_cloud_run_v2_service.api.traffic[1].revision == "moazez-staging-api-candidate-be1b01ce47ad-r1" && google_cloud_run_v2_service.api.traffic[1].percent == 0 && google_cloud_run_v2_service.api.traffic[1].tag == var.api_candidate_tag
    error_message = "Recovery attempt one must retain stable 100 and candidate zero traffic."
  }
}

run "recovery_attempt_two_promotion_reuses_exact_revision" {
  command = plan

  module {
    source = "../../../modules/runtime-environment"
  }

  variables {
    api_traffic_mode    = "candidate_promoted"
    api_stable_revision = "moazez-staging-api-stable01"
    api_candidate_tag   = "candidate-be1b01ce47ad-r2"
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].image == var.api_image_reference && google_cloud_run_v2_service.api.template[0].revision == "moazez-staging-api-candidate-be1b01ce47ad-r2"
    error_message = "Recovery promotion must retain the approved image and exact recovered revision."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.traffic[0].revision == var.api_stable_revision && google_cloud_run_v2_service.api.traffic[0].percent == 0 && google_cloud_run_v2_service.api.traffic[1].revision == "moazez-staging-api-candidate-be1b01ce47ad-r2" && google_cloud_run_v2_service.api.traffic[1].percent == 100 && google_cloud_run_v2_service.api.traffic[1].tag == var.api_candidate_tag
    error_message = "Recovery promotion must flip traffic using the same recovered tag and revision."
  }
}

run "candidate_no_traffic_rejects_missing_stable_revision" {
  command = plan

  module {
    source = "../../../modules/runtime-environment"
  }

  variables {
    api_traffic_mode  = "candidate_no_traffic"
    api_candidate_tag = "candidate-be1b01ce47ad"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "candidate_no_traffic_rejects_missing_candidate_tag" {
  command = plan

  module {
    source = "../../../modules/runtime-environment"
  }

  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-staging-api-stable01"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "candidate_no_traffic_rejects_non_deterministic_candidate_tag" {
  command = plan

  module {
    source = "../../../modules/runtime-environment"
  }

  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-staging-api-stable01"
    api_candidate_tag   = "candidate-111111111111-r1"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "candidate_no_traffic_rejects_ambiguous_revision_identity" {
  command = plan

  module {
    source = "../../../modules/runtime-environment"
  }

  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-staging-api-candidate-be1b01ce47ad"
    api_candidate_tag   = "candidate-be1b01ce47ad"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}
