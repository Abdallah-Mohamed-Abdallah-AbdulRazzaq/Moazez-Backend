mock_provider "google" {}

variables {
  environment                           = "staging"
  fcm_delivery_mode                     = "dry_run"
  api_image_reference                   = "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  core_worker_image_reference           = "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  media_worker_image_reference          = "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  maintenance_scheduler_image_reference = "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  queue_redis_host                      = "queue.staging.internal"
  queue_redis_port                      = 6378
  queue_redis_ca_pem                    = "test-queue-ca"
  realtime_redis_host                   = "realtime.staging.internal"
  realtime_redis_port                   = 6378
  realtime_redis_ca_pem                 = "test-realtime-ca"
  api_url                               = "https://staging-api.moazez.cloud"
}

run "normal_default_keeps_existing_traffic_behavior_and_isolates_images" {
  command = plan

  assert {
    condition     = module.runtime_environment.api_image_reference == var.api_image_reference
    error_message = "The API must consume only api_image_reference."
  }

  assert {
    condition     = module.runtime_environment.core_worker_image_reference == var.core_worker_image_reference
    error_message = "The Core Worker must consume only core_worker_image_reference."
  }

  assert {
    condition     = module.runtime_environment.media_worker_image_reference == var.media_worker_image_reference
    error_message = "The Media Worker must consume only media_worker_image_reference."
  }

  assert {
    condition     = module.runtime_environment.maintenance_scheduler_image_reference == var.maintenance_scheduler_image_reference
    error_message = "The Maintenance Scheduler must consume only maintenance_scheduler_image_reference."
  }

  assert {
    condition     = module.runtime_environment.api_candidate_revision == null
    error_message = "Normal mode must preserve provider-generated revision naming."
  }
}

run "candidate_no_traffic_pins_stable_and_tags_zero_percent_candidate" {
  command = plan

  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-staging-api-stable01"
    api_candidate_tag   = "candidate-be1b01ce47ad"
  }

  assert {
    condition     = module.runtime_environment.api_candidate_revision == "moazez-staging-api-candidate-be1b01ce47ad"
    error_message = "Candidate revision identity must be deterministic."
  }

  assert {
    condition     = module.runtime_environment.api_traffic_mode == "candidate_no_traffic" && module.runtime_environment.api_candidate_tag == var.api_candidate_tag
    error_message = "The root must preserve the no-traffic mode and candidate tag."
  }
}

run "candidate_promoted_flips_only_revision_traffic_semantics" {
  command = plan

  variables {
    api_traffic_mode    = "candidate_promoted"
    api_stable_revision = "moazez-staging-api-stable01"
    api_candidate_tag   = "candidate-be1b01ce47ad"
  }

  assert {
    condition     = module.runtime_environment.api_image_reference == var.api_image_reference && module.runtime_environment.api_candidate_revision == "moazez-staging-api-candidate-be1b01ce47ad"
    error_message = "Promotion must retain the exact API image and candidate revision."
  }

  assert {
    condition     = module.runtime_environment.api_traffic_mode == "candidate_promoted" && module.runtime_environment.api_candidate_tag == var.api_candidate_tag
    error_message = "The root must preserve the promoted mode and candidate tag."
  }

  assert {
    condition     = module.runtime_environment.core_worker_image_reference == var.core_worker_image_reference && module.runtime_environment.media_worker_image_reference == var.media_worker_image_reference && module.runtime_environment.maintenance_scheduler_image_reference == var.maintenance_scheduler_image_reference
    error_message = "API traffic promotion must not alter any worker image input."
  }
}

run "recovery_attempt_one_pins_exact_revision_at_zero_traffic" {
  command = plan

  variables {
    api_traffic_mode    = "candidate_no_traffic"
    api_stable_revision = "moazez-staging-api-stable01"
    api_candidate_tag   = "candidate-be1b01ce47ad-r1"
  }

  assert {
    condition     = module.runtime_environment.api_candidate_revision == "moazez-staging-api-candidate-be1b01ce47ad-r1" && module.runtime_environment.api_candidate_tag == var.api_candidate_tag
    error_message = "Recovery attempt one must preserve the exact image-derived tag and revision."
  }

  assert {
    condition     = module.runtime_environment.api_traffic_mode == "candidate_no_traffic" && module.runtime_environment.api_image_reference == var.api_image_reference
    error_message = "Recovery attempt one must retain the approved API image and zero-traffic mode."
  }
}

run "recovery_attempt_two_promotes_the_same_exact_revision" {
  command = plan

  variables {
    api_traffic_mode    = "candidate_promoted"
    api_stable_revision = "moazez-staging-api-stable01"
    api_candidate_tag   = "candidate-be1b01ce47ad-r2"
  }

  assert {
    condition     = module.runtime_environment.api_candidate_revision == "moazez-staging-api-candidate-be1b01ce47ad-r2" && module.runtime_environment.api_candidate_tag == var.api_candidate_tag
    error_message = "Recovery attempt two promotion must retain the exact recovered tag and revision."
  }

  assert {
    condition     = module.runtime_environment.api_traffic_mode == "candidate_promoted" && module.runtime_environment.api_image_reference == var.api_image_reference
    error_message = "Recovery promotion must retain the approved API image."
  }
}

run "recovery_tag_rejects_zero_attempt" {
  command = plan

  variables {
    api_candidate_tag = "candidate-be1b01ce47ad-r0"
  }

  expect_failures = [var.api_candidate_tag]
}

run "recovery_tag_rejects_leading_zero_attempt" {
  command = plan

  variables {
    api_candidate_tag = "candidate-be1b01ce47ad-r01"
  }

  expect_failures = [var.api_candidate_tag]
}

run "recovery_tag_rejects_non_numeric_suffix" {
  command = plan

  variables {
    api_candidate_tag = "candidate-be1b01ce47ad-r1x"
  }

  expect_failures = [var.api_candidate_tag]
}

run "recovery_tag_rejects_overlong_attempt" {
  command = plan

  variables {
    api_candidate_tag = "candidate-be1b01ce47ad-r1000000000000000"
  }

  expect_failures = [var.api_candidate_tag]
}

run "invalid_traffic_mode_is_rejected" {
  command = plan

  variables {
    api_traffic_mode = "unsafe"
  }

  expect_failures = [var.api_traffic_mode]
}

run "staging_api_rejects_production_image" {
  command = plan

  variables {
    api_image_reference = "me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }

  expect_failures = [var.api_image_reference]
}

run "staging_core_worker_rejects_production_image" {
  command = plan

  variables {
    core_worker_image_reference = "me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [var.core_worker_image_reference]
}

run "staging_media_worker_rejects_production_image" {
  command = plan

  variables {
    media_worker_image_reference = "me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  }

  expect_failures = [var.media_worker_image_reference]
}

run "staging_maintenance_scheduler_rejects_production_image" {
  command = plan

  variables {
    maintenance_scheduler_image_reference = "me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  }

  expect_failures = [var.maintenance_scheduler_image_reference]
}
