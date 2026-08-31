mock_provider "google" {}

variables {
  environment                                    = "staging"
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
    api_candidate_tag   = "candidate-111111111111"
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
