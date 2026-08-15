variable "project_id" {
  description = "Existing Google Cloud project that owns the repository."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid Google Cloud project ID."
  }
}

variable "environment" {
  description = "Deployment environment represented by this module instance."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "location" {
  description = "Google Cloud location for the Artifact Registry repository."
  type        = string

  validation {
    condition     = can(regex("^[a-z]+(-[a-z0-9]+)+$", var.location))
    error_message = "location must be a valid Google Cloud location."
  }
}

variable "repository_id" {
  description = "Artifact Registry repository ID."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,61}[a-z0-9]$", var.repository_id))
    error_message = "repository_id must be a valid Artifact Registry repository ID."
  }
}
