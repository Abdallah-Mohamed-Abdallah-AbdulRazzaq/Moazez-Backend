terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  backend "gcs" {
    bucket = "moazez-production-91001421934-tfstate"
    prefix = "frontend-runtime/production"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 7.40.0, < 8.0.0"
    }
  }
}
