mock_provider "google" {}

variables {
  environment                                    = "production"
  api_service_min_instances                      = 1
  api_service_max_instances                      = 10
  api_max_instance_request_concurrency           = 40
  api_database_connection_limit                  = 5
  core_worker_manual_instance_count              = 1
  media_worker_manual_instance_count             = 1
  fcm_delivery_mode                              = "dry_run"
  api_image_reference                            = "me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  core_worker_image_reference                    = "me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  media_worker_image_reference                   = "me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  maintenance_scheduler_image_reference          = "me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  queue_redis_host                               = "queue.production.internal"
  queue_redis_port                               = 6378
  queue_redis_ca_pem                             = "test-queue-ca"
  realtime_redis_host                            = "realtime.production.internal"
  realtime_redis_port                            = 6378
  realtime_redis_ca_pem                          = "test-realtime-ca"
  api_url                                        = "https://api.moazez.cloud"
  settings_email_secret_encryption_active_key_id = "production-email-test"
  app_device_token_encryption_active_key_id      = "production-device-test"
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: normal_default_keeps_existing_traffic_behavior_and_isolates_images
run "root_contract__normal_default_keeps_existing_traffic_behavior_and_isolates_images" {
  command = plan

  assert {
    condition     = output.api_image_reference == var.api_image_reference
    error_message = "The API must consume only api_image_reference."
  }

  assert {
    condition     = output.core_worker_image_reference == var.core_worker_image_reference
    error_message = "The Core Worker must consume only core_worker_image_reference."
  }

  assert {
    condition     = output.media_worker_image_reference == var.media_worker_image_reference
    error_message = "The Media Worker must consume only media_worker_image_reference."
  }

  assert {
    condition     = output.maintenance_scheduler_image_reference == var.maintenance_scheduler_image_reference
    error_message = "The Maintenance Scheduler must consume only maintenance_scheduler_image_reference."
  }

  assert {
    condition     = output.api_candidate_revision == null
    error_message = "Normal mode must preserve provider-generated revision naming."
  }
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: candidate_no_traffic_pins_stable_and_tags_zero_percent_candidate
run "root_contract__candidate_no_traffic_pins_stable_and_tags_zero_percent_candidate" {
  command = plan

  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-production-api-stable01"
    api_candidate_tag   = "candidate-7da6c71becca"
  }

  assert {
    condition     = output.api_candidate_revision == "moazez-production-api-candidate-7da6c71becca"
    error_message = "Candidate revision identity must be deterministic."
  }

  assert {
    condition     = output.api_traffic_mode == "candidate_no_traffic" && output.api_candidate_tag == var.api_candidate_tag
    error_message = "The root must preserve the no-traffic mode and candidate tag."
  }
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: candidate_promoted_flips_only_revision_traffic_semantics
run "root_contract__candidate_promoted_flips_only_revision_traffic_semantics" {
  command = plan

  variables {
    api_traffic_mode    = "candidate_promoted"
    api_stable_revision = "moazez-production-api-stable01"
    api_candidate_tag   = "candidate-7da6c71becca"
  }

  assert {
    condition     = output.api_image_reference == var.api_image_reference && output.api_candidate_revision == "moazez-production-api-candidate-7da6c71becca"
    error_message = "Promotion must retain the exact API image and candidate revision."
  }

  assert {
    condition     = output.api_traffic_mode == "candidate_promoted" && output.api_candidate_tag == var.api_candidate_tag
    error_message = "The root must preserve the promoted mode and candidate tag."
  }

  assert {
    condition     = output.core_worker_image_reference == var.core_worker_image_reference && output.media_worker_image_reference == var.media_worker_image_reference && output.maintenance_scheduler_image_reference == var.maintenance_scheduler_image_reference
    error_message = "API traffic promotion must not alter any worker image input."
  }
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: recovery_attempt_one_pins_exact_revision_at_zero_traffic
run "root_contract__recovery_attempt_one_pins_exact_revision_at_zero_traffic" {
  command = plan

  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-production-api-stable01"
    api_candidate_tag   = "candidate-7da6c71becca-r1"
  }

  assert {
    condition     = output.api_candidate_revision == "moazez-production-api-candidate-7da6c71becca-r1" && output.api_candidate_tag == var.api_candidate_tag
    error_message = "Recovery attempt one must preserve the exact image-derived tag and revision."
  }

  assert {
    condition     = output.api_traffic_mode == "candidate_no_traffic" && output.api_image_reference == var.api_image_reference
    error_message = "Recovery attempt one must retain the approved API image and zero-traffic mode."
  }
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: recovery_attempt_two_promotes_the_same_exact_revision
run "root_contract__recovery_attempt_two_promotes_the_same_exact_revision" {
  command = plan

  variables {
    api_traffic_mode    = "candidate_promoted"
    api_stable_revision = "moazez-production-api-stable01"
    api_candidate_tag   = "candidate-7da6c71becca-r2"
  }

  assert {
    condition     = output.api_candidate_revision == "moazez-production-api-candidate-7da6c71becca-r2" && output.api_candidate_tag == var.api_candidate_tag
    error_message = "Recovery attempt two promotion must retain the exact recovered tag and revision."
  }

  assert {
    condition     = output.api_traffic_mode == "candidate_promoted" && output.api_image_reference == var.api_image_reference
    error_message = "Recovery promotion must retain the approved API image."
  }
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: recovery_tag_rejects_zero_attempt
run "root_contract__recovery_tag_rejects_zero_attempt" {
  command = plan

  variables {
    api_candidate_tag = "candidate-7da6c71becca-r0"
  }

  expect_failures = [var.api_candidate_tag]
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: recovery_tag_rejects_leading_zero_attempt
run "root_contract__recovery_tag_rejects_leading_zero_attempt" {
  command = plan

  variables {
    api_candidate_tag = "candidate-7da6c71becca-r01"
  }

  expect_failures = [var.api_candidate_tag]
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: recovery_tag_rejects_non_numeric_suffix
run "root_contract__recovery_tag_rejects_non_numeric_suffix" {
  command = plan

  variables {
    api_candidate_tag = "candidate-7da6c71becca-r1x"
  }

  expect_failures = [var.api_candidate_tag]
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: recovery_tag_rejects_overlong_attempt
run "root_contract__recovery_tag_rejects_overlong_attempt" {
  command = plan

  variables {
    api_candidate_tag = "candidate-7da6c71becca-r1000000000000000"
  }

  expect_failures = [var.api_candidate_tag]
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: invalid_traffic_mode_is_rejected
run "root_contract__invalid_traffic_mode_is_rejected" {
  command = plan

  variables {
    api_traffic_mode = "unsafe"
  }

  expect_failures = [var.api_traffic_mode]
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: staging_api_rejects_production_image
run "root_contract__staging_api_rejects_production_image" {
  command = plan

  variables {
    api_image_reference = "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: staging_core_worker_rejects_production_image
run "root_contract__staging_core_worker_rejects_production_image" {
  command = plan

  variables {
    core_worker_image_reference = "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [google_cloud_run_v2_worker_pool.core]
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: staging_media_worker_rejects_production_image
run "root_contract__staging_media_worker_rejects_production_image" {
  command = plan

  variables {
    media_worker_image_reference = "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  }

  expect_failures = [google_cloud_run_v2_worker_pool.media]
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl :: staging_maintenance_scheduler_rejects_production_image
run "root_contract__staging_maintenance_scheduler_rejects_production_image" {
  command = plan

  variables {
    maintenance_scheduler_image_reference = "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  }

  expect_failures = [google_cloud_run_v2_worker_pool.maintenance_scheduler]
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/runtime-module-preconditions.tftest.hcl :: normal_default_keeps_provider_revision_and_isolates_runtime_images
run "module_contract__normal_default_keeps_provider_revision_and_isolates_runtime_images" {
  command = plan


  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].image == var.api_image_reference && google_cloud_run_v2_service.api.template[0].revision == null
    error_message = "Normal API mode must use only its image input and provider-generated revision naming."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.scaling[0].min_instance_count == 1 && google_cloud_run_v2_service.api.scaling[0].max_instance_count == 10 && google_cloud_run_v2_service.api.template[0].max_instance_request_concurrency == 40
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

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/runtime-module-preconditions.tftest.hcl :: capacity_v1_candidate_binds_complete_revision_capacity
run "module_contract__capacity_v1_candidate_binds_complete_revision_capacity" {
  command = plan


  variables {
    api_traffic_mode               = "candidate_no_traffic"
    api_stable_revision            = "moazez-production-api-stable01"
    api_candidate_tag              = "candidate-568cf1aab084"
    api_candidate_identity_version = "capacity-v1"
    api_revision_max_instances     = 4
    api_request_timeout_seconds    = 300
    api_session_affinity           = false
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].revision == "moazez-production-api-candidate-568cf1aab084" && google_cloud_run_v2_service.api.traffic[1].percent == 0
    error_message = "capacity-v1 must derive the exact candidate identity and keep it at zero traffic."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].scaling[0].max_instance_count == 4 && google_cloud_run_v2_service.api.template[0].max_instance_request_concurrency == 40 && google_cloud_run_v2_service.api.template[0].timeout == "300s" && google_cloud_run_v2_service.api.template[0].session_affinity == false
    error_message = "capacity-v1 must materialize the complete explicit candidate revision capacity."
  }
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/runtime-module-preconditions.tftest.hcl :: candidate_no_traffic_pins_stable_and_tags_zero_percent_candidate
run "module_contract__candidate_no_traffic_pins_stable_and_tags_zero_percent_candidate" {
  command = plan


  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-production-api-stable01"
    api_candidate_tag   = "candidate-7da6c71becca"
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].image == var.api_image_reference && google_cloud_run_v2_service.api.template[0].revision == "moazez-production-api-candidate-7da6c71becca"
    error_message = "Candidate mode must pin the exact image-derived candidate revision."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.traffic[0].revision == var.api_stable_revision && google_cloud_run_v2_service.api.traffic[0].percent == 100
    error_message = "The verified stable revision must retain all normal user traffic."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.traffic[1].revision == "moazez-production-api-candidate-7da6c71becca" && google_cloud_run_v2_service.api.traffic[1].percent == 0 && google_cloud_run_v2_service.api.traffic[1].tag == var.api_candidate_tag
    error_message = "The tagged candidate revision must receive zero normal user traffic."
  }
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/runtime-module-preconditions.tftest.hcl :: candidate_promoted_flips_only_revision_traffic_semantics
run "module_contract__candidate_promoted_flips_only_revision_traffic_semantics" {
  command = plan


  variables {
    api_traffic_mode    = "candidate_promoted"
    api_stable_revision = "moazez-production-api-stable01"
    api_candidate_tag   = "candidate-7da6c71becca"
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].image == var.api_image_reference && google_cloud_run_v2_service.api.template[0].revision == "moazez-production-api-candidate-7da6c71becca"
    error_message = "Promotion must retain the exact API image and candidate revision."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.traffic[0].revision == var.api_stable_revision && google_cloud_run_v2_service.api.traffic[0].percent == 0
    error_message = "Promotion must remove normal traffic from the prior stable revision."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.traffic[1].revision == "moazez-production-api-candidate-7da6c71becca" && google_cloud_run_v2_service.api.traffic[1].percent == 100 && google_cloud_run_v2_service.api.traffic[1].tag == var.api_candidate_tag
    error_message = "Promotion must assign all normal traffic to the unchanged candidate revision."
  }

  assert {
    condition     = google_cloud_run_v2_worker_pool.core.template[0].containers[0].image == var.core_worker_image_reference && google_cloud_run_v2_worker_pool.media.template[0].containers[0].image == var.media_worker_image_reference && google_cloud_run_v2_worker_pool.maintenance_scheduler.template[0].containers[0].image == var.maintenance_scheduler_image_reference
    error_message = "Traffic promotion must not alter any worker image input."
  }
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/runtime-module-preconditions.tftest.hcl :: recovery_attempt_one_pins_exact_revision_at_zero_traffic
run "module_contract__recovery_attempt_one_pins_exact_revision_at_zero_traffic" {
  command = plan


  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-production-api-stable01"
    api_candidate_tag   = "candidate-7da6c71becca-r1"
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].image == var.api_image_reference && google_cloud_run_v2_service.api.template[0].revision == "moazez-production-api-candidate-7da6c71becca-r1"
    error_message = "Recovery attempt one must retain the approved image and exact revision."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.traffic[0].revision == var.api_stable_revision && google_cloud_run_v2_service.api.traffic[0].percent == 100 && google_cloud_run_v2_service.api.traffic[1].revision == "moazez-production-api-candidate-7da6c71becca-r1" && google_cloud_run_v2_service.api.traffic[1].percent == 0 && google_cloud_run_v2_service.api.traffic[1].tag == var.api_candidate_tag
    error_message = "Recovery attempt one must retain stable 100 and candidate zero traffic."
  }
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/runtime-module-preconditions.tftest.hcl :: recovery_attempt_two_promotion_reuses_exact_revision
run "module_contract__recovery_attempt_two_promotion_reuses_exact_revision" {
  command = plan


  variables {
    api_traffic_mode    = "candidate_promoted"
    api_stable_revision = "moazez-production-api-stable01"
    api_candidate_tag   = "candidate-7da6c71becca-r2"
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].image == var.api_image_reference && google_cloud_run_v2_service.api.template[0].revision == "moazez-production-api-candidate-7da6c71becca-r2"
    error_message = "Recovery promotion must retain the approved image and exact recovered revision."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.traffic[0].revision == var.api_stable_revision && google_cloud_run_v2_service.api.traffic[0].percent == 0 && google_cloud_run_v2_service.api.traffic[1].revision == "moazez-production-api-candidate-7da6c71becca-r2" && google_cloud_run_v2_service.api.traffic[1].percent == 100 && google_cloud_run_v2_service.api.traffic[1].tag == var.api_candidate_tag
    error_message = "Recovery promotion must flip traffic using the same recovered tag and revision."
  }
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/runtime-module-preconditions.tftest.hcl :: candidate_no_traffic_rejects_missing_stable_revision
run "module_contract__candidate_no_traffic_rejects_missing_stable_revision" {
  command = plan


  variables {
    api_traffic_mode  = "candidate_no_traffic"
    api_candidate_tag = "candidate-7da6c71becca"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/runtime-module-preconditions.tftest.hcl :: candidate_no_traffic_rejects_missing_candidate_tag
run "module_contract__candidate_no_traffic_rejects_missing_candidate_tag" {
  command = plan


  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-production-api-stable01"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/runtime-module-preconditions.tftest.hcl :: candidate_no_traffic_rejects_non_deterministic_candidate_tag
run "module_contract__candidate_no_traffic_rejects_non_deterministic_candidate_tag" {
  command = plan


  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-production-api-stable01"
    api_candidate_tag   = "candidate-111111111111-r1"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

# Immutable historical obligation: infra/gcp/backend-runtime/environments/nonprod/runtime/tests/runtime-module-preconditions.tftest.hcl :: candidate_no_traffic_rejects_ambiguous_revision_identity
run "module_contract__candidate_no_traffic_rejects_ambiguous_revision_identity" {
  command = plan


  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-production-api-candidate-7da6c71becca"
    api_candidate_tag   = "candidate-7da6c71becca"
  }

  expect_failures = [google_cloud_run_v2_service.api]
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
