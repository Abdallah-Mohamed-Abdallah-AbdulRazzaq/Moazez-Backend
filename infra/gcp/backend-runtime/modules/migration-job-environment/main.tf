resource "google_cloud_run_v2_job" "migration" {
  project             = var.project_id
  location            = var.region
  name                = var.migration_job_name
  deletion_protection = true

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = var.migration_service_account
      max_retries     = 0
      timeout         = "1200s"

      containers {
        image   = var.image_reference
        command = ["node", "scripts/migrations/run-governed-migration-job.cjs"]

        env {
          name  = "MIGRATION_JOB_ENVIRONMENT"
          value = var.migration_job_environment
        }

        env {
          name = "DATABASE_URL"

          value_source {
            secret_key_ref {
              secret  = var.migration_database_secret_id
              version = var.migration_database_secret_version
            }
          }
        }
      }

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"

        network_interfaces {
          network    = var.network
          subnetwork = var.subnetwork
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true

    precondition {
      condition = (
        (
          var.project_id == "moazez-nonprod-91001421934" &&
          var.region == "me-central2" &&
          var.network == "moazez-staging-vpc" &&
          var.subnetwork == "moazez-staging-runtime-me-central2" &&
          var.migration_job_name == "moazez-staging-migration" &&
          var.migration_service_account == "moazez-migration-job@moazez-nonprod-91001421934.iam.gserviceaccount.com" &&
          var.migration_job_environment == "staging" &&
          var.migration_database_secret_id == "moazez-staging-migration-database-url" &&
          var.migration_database_secret_version == "2" &&
          can(regex(
            "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$",
            var.image_reference,
          ))
        ) ||
        (
          var.project_id == "moazez-production" &&
          var.region == "me-central2" &&
          var.network == "moazez-production-vpc" &&
          var.subnetwork == "moazez-production-runtime-me-central2" &&
          var.migration_job_name == "moazez-production-migration" &&
          var.migration_service_account == "moazez-migration-job@moazez-production.iam.gserviceaccount.com" &&
          var.migration_job_environment == "production" &&
          var.migration_database_secret_id == "moazez-production-migration-database-url" &&
          can(regex("^[1-9][0-9]*$", var.migration_database_secret_version)) &&
          can(regex(
            "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-backend@sha256:[a-f0-9]{64}$",
            var.image_reference,
          ))
        )
      )
      error_message = "The Migration Job inputs must match the complete governed staging or production environment tuple."
    }
  }
}
