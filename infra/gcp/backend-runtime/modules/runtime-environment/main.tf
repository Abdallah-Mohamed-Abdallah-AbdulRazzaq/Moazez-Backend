locals {
  approved_environment = {
    staging = {
      project_id = "moazez-nonprod-91001421934"
      region     = "me-central2"
      network    = "moazez-staging-vpc"
      subnetwork = "moazez-staging-runtime-me-central2"

      api_service_name                = "moazez-staging-api"
      core_worker_pool_name           = "moazez-staging-core-worker"
      media_worker_pool_name          = "moazez-staging-media-worker"
      maintenance_scheduler_pool_name = "moazez-staging-maintenance-scheduler"
      api_service_account             = "moazez-api-runtime@moazez-nonprod-91001421934.iam.gserviceaccount.com"
      core_worker_service_account     = "moazez-core-worker@moazez-nonprod-91001421934.iam.gserviceaccount.com"
      media_worker_service_account    = "moazez-media-worker@moazez-nonprod-91001421934.iam.gserviceaccount.com"
      maintenance_service_account     = "moazez-maintenance-scheduler@moazez-nonprod-91001421934.iam.gserviceaccount.com"

      node_environment            = "staging"
      trusted_proxy_mode          = "gcp_external_alb"
      cors_origins                = "https://staging-schools.moazez.cloud,https://staging-admin.moazez.cloud"
      image_pattern               = "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$"
      storage_private_bucket      = "moazez-nonprod-91001421934-private"
      storage_published_bucket    = "moazez-nonprod-91001421934-published"
      gcs_signing_service_account = "moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com"

      api_secret_environment = {
        DATABASE_URL = {
          secret  = "moazez-staging-api-database-url"
          version = "1"
        }
        JWT_ACCESS_SECRET = {
          secret  = "moazez-staging-jwt-access-secret"
          version = "1"
        }
        JWT_REFRESH_SECRET = {
          secret  = "moazez-staging-jwt-refresh-secret"
          version = "1"
        }
        SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY = {
          secret  = "moazez-staging-smtp-secret-encryption-key"
          version = "1"
        }
        APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY = {
          secret  = "moazez-staging-app-device-token-encryption-key"
          version = "1"
        }
      }

      core_worker_secret_environment = {
        DATABASE_URL = {
          secret  = "moazez-staging-core-worker-database-url"
          version = "1"
        }
        SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY = {
          secret  = "moazez-staging-smtp-secret-encryption-key"
          version = "1"
        }
        APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY = {
          secret  = "moazez-staging-app-device-token-encryption-key"
          version = "1"
        }
      }

      media_worker_secret_environment = {
        DATABASE_URL = {
          secret  = "moazez-staging-media-worker-database-url"
          version = "1"
        }
      }
    }

    production = {
      project_id = "moazez-production"
      region     = "me-central2"
      network    = "moazez-production-vpc"
      subnetwork = "moazez-production-runtime-me-central2"

      api_service_name                = "moazez-production-api"
      core_worker_pool_name           = "moazez-production-core-worker"
      media_worker_pool_name          = "moazez-production-media-worker"
      maintenance_scheduler_pool_name = "moazez-production-maintenance-scheduler"
      api_service_account             = "moazez-api-runtime@moazez-production.iam.gserviceaccount.com"
      core_worker_service_account     = "moazez-core-worker@moazez-production.iam.gserviceaccount.com"
      media_worker_service_account    = "moazez-media-worker@moazez-production.iam.gserviceaccount.com"
      maintenance_service_account     = "moazez-maintenance-scheduler@moazez-production.iam.gserviceaccount.com"

      node_environment            = "production"
      trusted_proxy_mode          = "none"
      cors_origins                = "https://schools.moazez.cloud,https://admin.moazez.cloud"
      image_pattern               = "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-backend@sha256:[a-f0-9]{64}$"
      storage_private_bucket      = "moazez-production-91001421934-private"
      storage_published_bucket    = "moazez-production-91001421934-published"
      gcs_signing_service_account = "moazez-gcs-signer@moazez-production.iam.gserviceaccount.com"

      api_secret_environment = {
        DATABASE_URL = {
          secret  = "moazez-production-api-database-url"
          version = "1"
        }
        JWT_ACCESS_SECRET = {
          secret  = "moazez-production-jwt-access-secret"
          version = "1"
        }
        JWT_REFRESH_SECRET = {
          secret  = "moazez-production-jwt-refresh-secret"
          version = "1"
        }
        SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY = {
          secret  = "moazez-production-smtp-secret-encryption-key"
          version = "1"
        }
        APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY = {
          secret  = "moazez-production-app-device-token-encryption-key"
          version = "1"
        }
      }

      core_worker_secret_environment = {
        DATABASE_URL = {
          secret  = "moazez-production-core-worker-database-url"
          version = "1"
        }
        SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY = {
          secret  = "moazez-production-smtp-secret-encryption-key"
          version = "1"
        }
        APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY = {
          secret  = "moazez-production-app-device-token-encryption-key"
          version = "1"
        }
      }

      media_worker_secret_environment = {
        DATABASE_URL = {
          secret  = "moazez-production-media-worker-database-url"
          version = "1"
        }
      }
    }
  }

  selected                  = local.approved_environment[var.environment]
  image_matches_environment = can(regex(local.selected.image_pattern, var.image_reference))
  queue_redis_url           = format("rediss://%s:%d", var.queue_redis_host, var.queue_redis_port)
  realtime_redis_url        = format("rediss://%s:%d", var.realtime_redis_host, var.realtime_redis_port)

  common_environment = {
    NODE_ENV                = local.selected.node_environment
    APP_SHUTDOWN_TIMEOUT_MS = "15000"
    LOG_LEVEL               = "info"
  }

  api_environment = merge(local.common_environment, {
    APP_PORT                                       = "3000"
    APP_PROBE_PORT                                 = "9090"
    APP_URL                                        = var.api_url
    APP_TRUSTED_PROXY_MODE                         = local.selected.trusted_proxy_mode
    APP_CORS_ORIGINS                               = local.selected.cors_origins
    STORAGE_CORS_ORIGINS                           = local.selected.cors_origins
    SWAGGER_ENABLED                                = "false"
    SEED_DEMO_DATA                                 = "false"
    DATABASE_RUNTIME_ROLE                          = "api"
    DATABASE_CONNECTION_LIMIT                      = "5"
    DATABASE_POOL_TIMEOUT_SECONDS                  = "5"
    DATABASE_CONNECT_TIMEOUT_SECONDS               = "5"
    JWT_ACCESS_TTL                                 = "15m"
    JWT_REFRESH_TTL                                = "7d"
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID = var.settings_email_secret_encryption_active_key_id
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID      = var.app_device_token_encryption_active_key_id
    QUEUE_REDIS_URL                                = local.queue_redis_url
    REALTIME_REDIS_URL                             = local.realtime_redis_url
    STORAGE_PROVIDER                               = "gcs"
    GCP_PROJECT_ID                                 = local.selected.project_id
    STORAGE_BUCKET                                 = local.selected.storage_private_bucket
    STORAGE_PUBLIC_BUCKET                          = local.selected.storage_published_bucket
    GCS_SIGNING_SERVICE_ACCOUNT                    = local.selected.gcs_signing_service_account
  })

  core_worker_environment = merge(local.common_environment, {
    APP_PROBE_PORT                                 = "9090"
    APP_URL                                        = var.api_url
    DATABASE_RUNTIME_ROLE                          = "core-worker"
    DATABASE_CONNECTION_LIMIT                      = "6"
    DATABASE_POOL_TIMEOUT_SECONDS                  = "10"
    DATABASE_CONNECT_TIMEOUT_SECONDS               = "5"
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID = var.settings_email_secret_encryption_active_key_id
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID      = var.app_device_token_encryption_active_key_id
    FCM_ENABLED                                    = "false"
    FCM_DRY_RUN                                    = "true"
    QUEUE_REDIS_URL                                = local.queue_redis_url
    REALTIME_REDIS_URL                             = local.realtime_redis_url
    STORAGE_PROVIDER                               = "gcs"
    GCP_PROJECT_ID                                 = local.selected.project_id
    STORAGE_BUCKET                                 = local.selected.storage_private_bucket
    STORAGE_PUBLIC_BUCKET                          = local.selected.storage_published_bucket
  })

  media_worker_environment = merge(local.common_environment, {
    APP_PROBE_PORT                   = "9090"
    DATABASE_RUNTIME_ROLE            = "media-worker"
    DATABASE_CONNECTION_LIMIT        = "3"
    DATABASE_POOL_TIMEOUT_SECONDS    = "10"
    DATABASE_CONNECT_TIMEOUT_SECONDS = "5"
    QUEUE_REDIS_URL                  = local.queue_redis_url
    STORAGE_PROVIDER                 = "gcs"
    GCP_PROJECT_ID                   = local.selected.project_id
    STORAGE_BUCKET                   = local.selected.storage_private_bucket
    STORAGE_PUBLIC_BUCKET            = local.selected.storage_published_bucket
  })

  maintenance_scheduler_environment = merge(local.common_environment, {
    APP_PROBE_PORT  = "9090"
    QUEUE_REDIS_URL = local.queue_redis_url
  })
}

resource "google_cloud_run_v2_service" "api" {
  project              = local.selected.project_id
  location             = local.selected.region
  name                 = local.selected.api_service_name
  ingress              = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  invoker_iam_disabled = true
  default_uri_disabled = true
  deletion_protection  = true

  scaling {
    min_instance_count = 1
    max_instance_count = 4
  }

  template {
    service_account                  = local.selected.api_service_account
    max_instance_request_concurrency = 40

    containers {
      image = var.image_reference

      ports {
        container_port = 3000
      }

      dynamic "env" {
        for_each = local.api_environment

        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name  = "QUEUE_REDIS_TLS_CA_PEM"
        value = var.queue_redis_ca_pem
      }

      env {
        name  = "REALTIME_REDIS_TLS_CA_PEM"
        value = var.realtime_redis_ca_pem
      }

      dynamic "env" {
        for_each = local.selected.api_secret_environment

        content {
          name = env.key

          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/internal/probes/api/startup"
          port = 9090
        }
      }

      liveness_probe {
        http_get {
          path = "/internal/probes/api/liveness"
          port = 9090
        }
      }

      readiness_probe {
        http_get {
          path = "/internal/probes/api/readiness"
          port = 9090
        }
      }
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"

      network_interfaces {
        network    = local.selected.network
        subnetwork = local.selected.subnetwork
      }
    }
  }

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.image_matches_environment
      error_message = "image_reference must use the immutable backend package governed for the selected environment."
    }
  }
}

resource "google_cloud_run_v2_worker_pool" "core" {
  project             = local.selected.project_id
  location            = local.selected.region
  name                = local.selected.core_worker_pool_name
  deletion_protection = true

  scaling {
    scaling_mode          = "MANUAL"
    manual_instance_count = 1
  }

  template {
    service_account = local.selected.core_worker_service_account

    containers {
      image   = var.image_reference
      command = ["node", "dist/core-worker"]

      dynamic "env" {
        for_each = local.core_worker_environment

        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name  = "QUEUE_REDIS_TLS_CA_PEM"
        value = var.queue_redis_ca_pem
      }

      env {
        name  = "REALTIME_REDIS_TLS_CA_PEM"
        value = var.realtime_redis_ca_pem
      }

      dynamic "env" {
        for_each = local.selected.core_worker_secret_environment

        content {
          name = env.key

          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/internal/probes/core-worker/startup"
          port = 9090
        }
      }

      liveness_probe {
        http_get {
          path = "/internal/probes/core-worker/liveness"
          port = 9090
        }
      }
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"

      network_interfaces {
        network    = local.selected.network
        subnetwork = local.selected.subnetwork
      }
    }
  }

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.image_matches_environment
      error_message = "image_reference must use the immutable backend package governed for the selected environment."
    }
  }
}

resource "google_cloud_run_v2_worker_pool" "media" {
  project             = local.selected.project_id
  location            = local.selected.region
  name                = local.selected.media_worker_pool_name
  deletion_protection = true

  scaling {
    scaling_mode          = "MANUAL"
    manual_instance_count = 1
  }

  template {
    service_account = local.selected.media_worker_service_account

    containers {
      image   = var.image_reference
      command = ["node", "dist/media-worker"]

      dynamic "env" {
        for_each = local.media_worker_environment

        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name  = "QUEUE_REDIS_TLS_CA_PEM"
        value = var.queue_redis_ca_pem
      }

      dynamic "env" {
        for_each = local.selected.media_worker_secret_environment

        content {
          name = env.key

          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/internal/probes/media-worker/startup"
          port = 9090
        }
      }

      liveness_probe {
        http_get {
          path = "/internal/probes/media-worker/liveness"
          port = 9090
        }
      }
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"

      network_interfaces {
        network    = local.selected.network
        subnetwork = local.selected.subnetwork
      }
    }
  }

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.image_matches_environment
      error_message = "image_reference must use the immutable backend package governed for the selected environment."
    }
  }
}

resource "google_cloud_run_v2_worker_pool" "maintenance_scheduler" {
  project             = local.selected.project_id
  location            = local.selected.region
  name                = local.selected.maintenance_scheduler_pool_name
  deletion_protection = true

  scaling {
    scaling_mode          = "MANUAL"
    manual_instance_count = 1
  }

  template {
    service_account = local.selected.maintenance_service_account

    containers {
      image   = var.image_reference
      command = ["node", "dist/maintenance-scheduler"]

      dynamic "env" {
        for_each = local.maintenance_scheduler_environment

        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name  = "QUEUE_REDIS_TLS_CA_PEM"
        value = var.queue_redis_ca_pem
      }

      startup_probe {
        http_get {
          path = "/internal/probes/maintenance-scheduler/startup"
          port = 9090
        }
      }

      liveness_probe {
        http_get {
          path = "/internal/probes/maintenance-scheduler/liveness"
          port = 9090
        }
      }
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"

      network_interfaces {
        network    = local.selected.network
        subnetwork = local.selected.subnetwork
      }
    }
  }

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.image_matches_environment
      error_message = "image_reference must use the immutable backend package governed for the selected environment."
    }
  }
}
