locals {
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
  api_url                         = "https://staging-api.moazez.cloud"
  staging_cors_origins            = "https://staging-schools.moazez.cloud,https://staging-admin.moazez.cloud"
  queue_redis_url                 = format("rediss://%s:%d", var.queue_redis_host, var.queue_redis_port)
  realtime_redis_url              = format("rediss://%s:%d", var.realtime_redis_host, var.realtime_redis_port)

  common_environment = {
    NODE_ENV                = "staging"
    APP_SHUTDOWN_TIMEOUT_MS = "15000"
    LOG_LEVEL               = "info"
  }

  api_environment = merge(local.common_environment, {
    APP_PORT                                       = "3000"
    APP_PROBE_PORT                                 = "9090"
    APP_URL                                        = local.api_url
    APP_TRUSTED_PROXY_MODE                         = "gcp_external_alb"
    APP_CORS_ORIGINS                               = local.staging_cors_origins
    STORAGE_CORS_ORIGINS                           = local.staging_cors_origins
    SWAGGER_ENABLED                                = "false"
    SEED_DEMO_DATA                                 = "false"
    DATABASE_RUNTIME_ROLE                          = "api"
    DATABASE_CONNECTION_LIMIT                      = "5"
    DATABASE_POOL_TIMEOUT_SECONDS                  = "5"
    DATABASE_CONNECT_TIMEOUT_SECONDS               = "5"
    JWT_ACCESS_TTL                                 = "15m"
    JWT_REFRESH_TTL                                = "7d"
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID = "staging-email-20260815"
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID      = "staging-device-20260815"
    QUEUE_REDIS_URL                                = local.queue_redis_url
    REALTIME_REDIS_URL                             = local.realtime_redis_url
    STORAGE_PROVIDER                               = "gcs"
    GCP_PROJECT_ID                                 = local.project_id
    STORAGE_BUCKET                                 = "moazez-nonprod-91001421934-private"
    STORAGE_PUBLIC_BUCKET                          = "moazez-nonprod-91001421934-published"
    GCS_SIGNING_SERVICE_ACCOUNT                    = "moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com"
  })

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

  core_worker_environment = merge(local.common_environment, {
    APP_PROBE_PORT                                 = "9090"
    APP_URL                                        = local.api_url
    DATABASE_RUNTIME_ROLE                          = "core-worker"
    DATABASE_CONNECTION_LIMIT                      = "6"
    DATABASE_POOL_TIMEOUT_SECONDS                  = "10"
    DATABASE_CONNECT_TIMEOUT_SECONDS               = "5"
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID = "staging-email-20260815"
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID      = "staging-device-20260815"
    FCM_ENABLED                                    = "false"
    FCM_DRY_RUN                                    = "true"
    QUEUE_REDIS_URL                                = local.queue_redis_url
    REALTIME_REDIS_URL                             = local.realtime_redis_url
    STORAGE_PROVIDER                               = "gcs"
    GCP_PROJECT_ID                                 = local.project_id
    STORAGE_BUCKET                                 = "moazez-nonprod-91001421934-private"
    STORAGE_PUBLIC_BUCKET                          = "moazez-nonprod-91001421934-published"
  })

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

  media_worker_environment = merge(local.common_environment, {
    APP_PROBE_PORT                   = "9090"
    DATABASE_RUNTIME_ROLE            = "media-worker"
    DATABASE_CONNECTION_LIMIT        = "3"
    DATABASE_POOL_TIMEOUT_SECONDS    = "10"
    DATABASE_CONNECT_TIMEOUT_SECONDS = "5"
    QUEUE_REDIS_URL                  = local.queue_redis_url
    STORAGE_PROVIDER                 = "gcs"
    GCP_PROJECT_ID                   = local.project_id
    STORAGE_BUCKET                   = "moazez-nonprod-91001421934-private"
    STORAGE_PUBLIC_BUCKET            = "moazez-nonprod-91001421934-published"
  })

  media_worker_secret_environment = {
    DATABASE_URL = {
      secret  = "moazez-staging-media-worker-database-url"
      version = "1"
    }
  }

  maintenance_scheduler_environment = merge(local.common_environment, {
    APP_PROBE_PORT  = "9090"
    QUEUE_REDIS_URL = local.queue_redis_url
  })
}

resource "google_cloud_run_v2_service" "api" {
  project              = local.project_id
  location             = local.region
  name                 = local.api_service_name
  ingress              = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  invoker_iam_disabled = true
  default_uri_disabled = true
  deletion_protection  = true

  scaling {
    min_instance_count = 1
    max_instance_count = 4
  }

  template {
    service_account                  = local.api_service_account
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
        for_each = local.api_secret_environment

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
        network    = local.network
        subnetwork = local.subnetwork
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_cloud_run_v2_worker_pool" "core" {
  project             = local.project_id
  location            = local.region
  name                = local.core_worker_pool_name
  deletion_protection = true

  scaling {
    scaling_mode          = "MANUAL"
    manual_instance_count = 1
  }

  template {
    service_account = local.core_worker_service_account

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
        for_each = local.core_worker_secret_environment

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
        network    = local.network
        subnetwork = local.subnetwork
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_cloud_run_v2_worker_pool" "media" {
  project             = local.project_id
  location            = local.region
  name                = local.media_worker_pool_name
  deletion_protection = true

  scaling {
    scaling_mode          = "MANUAL"
    manual_instance_count = 1
  }

  template {
    service_account = local.media_worker_service_account

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
        for_each = local.media_worker_secret_environment

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
        network    = local.network
        subnetwork = local.subnetwork
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_cloud_run_v2_worker_pool" "maintenance_scheduler" {
  project             = local.project_id
  location            = local.region
  name                = local.maintenance_scheduler_pool_name
  deletion_protection = true

  scaling {
    scaling_mode          = "MANUAL"
    manual_instance_count = 1
  }

  template {
    service_account = local.maintenance_service_account

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
        network    = local.network
        subnetwork = local.subnetwork
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}
