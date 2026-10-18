variable "project_id" {
  description = "Existing Google Cloud project that owns the repository."
  type        = string

  validation {
    condition = contains([
      "moazez-nonprod-91001421934",
      "moazez-production",
    ], var.project_id)
    error_message = "project_id must be a governed Staging or Production project."
  }

  validation {
    condition     = var.project_id != "moazez-nonprod-91001421934"
    error_message = "The retired Staging project is permanently prohibited."
  }
}

variable "environment" {
  description = "Deployment environment represented by this module instance."
  type        = string
  nullable    = false

  validation {
    condition     = var.environment == "production"
    error_message = "environment must be production; staging is retired."
  }
}

variable "location" {
  description = "Google Cloud location for the Artifact Registry repository."
  type        = string

  validation {
    condition     = var.location == "me-central2"
    error_message = "location must be me-central2."
  }
}

variable "repository_id" {
  description = "Artifact Registry repository ID."
  type        = string

  validation {
    condition = contains([
      "moazez-staging-containers",
      "moazez-production-containers",
    ], var.repository_id)
    error_message = "repository_id must be a governed Staging or Production repository ID."
  }
}
