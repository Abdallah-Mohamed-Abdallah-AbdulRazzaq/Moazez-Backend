variable "project_id" {
  description = "Existing production project; this root never creates it."
  type        = string
  default     = "moazez-production"

  validation {
    condition     = var.project_id == "moazez-production"
    error_message = "The production SQL root is locked to moazez-production."
  }
}

variable "region" {
  description = "Locked production region for the Cloud SQL instance."
  type        = string
  default     = "me-central2"

  validation {
    condition     = var.region == "me-central2"
    error_message = "The production SQL root is locked to me-central2."
  }
}

variable "environment" {
  description = "Locked deployment environment modeled by the production root."
  type        = string
  default     = "production"

  validation {
    condition     = var.environment == "production"
    error_message = "The production SQL root models only the production environment."
  }
}
