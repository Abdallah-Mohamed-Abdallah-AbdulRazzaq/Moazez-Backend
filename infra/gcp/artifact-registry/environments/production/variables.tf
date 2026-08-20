variable "project_id" {
  description = "Existing production project; this root never creates it."
  type        = string
  default     = "moazez-production"

  validation {
    condition     = var.project_id == "moazez-production"
    error_message = "The production Artifact Registry root is locked to moazez-production."
  }
}

variable "environment" {
  description = "Locked deployment environment modeled by the production root."
  type        = string
  default     = "production"

  validation {
    condition     = var.environment == "production"
    error_message = "The production Artifact Registry root models only the production environment."
  }
}

variable "location" {
  description = "Locked production location for the Artifact Registry repository."
  type        = string
  default     = "me-central2"

  validation {
    condition     = var.location == "me-central2"
    error_message = "The production Artifact Registry root is locked to me-central2."
  }
}

variable "repository_id" {
  description = "Locked production Artifact Registry repository ID."
  type        = string
  default     = "moazez-production-containers"

  validation {
    condition     = var.repository_id == "moazez-production-containers"
    error_message = "The production Artifact Registry root is locked to moazez-production-containers."
  }
}
