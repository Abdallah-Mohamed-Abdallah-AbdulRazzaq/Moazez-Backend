locals {
  project_id                = "moazez-nonprod-91001421934"
  region                    = "me-central2"
  network                   = "moazez-staging-vpc"
  subnetwork                = "moazez-staging-runtime-me-central2"
  migration_job_name        = "moazez-staging-migration"
  migration_service_account = "moazez-migration-job@moazez-nonprod-91001421934.iam.gserviceaccount.com"
}

resource "google_cloud_run_v2_job" "migration" {
  project             = local.project_id
  location            = local.region
  name                = local.migration_job_name
  deletion_protection = true

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = local.migration_service_account
      max_retries     = 0
      timeout         = "1200s"

      containers {
        image   = var.image_reference
        command = ["node", "scripts/migrations/run-governed-migration-job.cjs"]

        env {
          name  = "MIGRATION_JOB_ENVIRONMENT"
          value = "staging"
        }

        env {
          name = "DATABASE_URL"

          value_source {
            secret_key_ref {
              secret  = "moazez-staging-migration-database-url"
              version = "1"
            }
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
  }

  lifecycle {
    prevent_destroy = true
  }
}
