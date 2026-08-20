variable "project_id" {
  description = "Existing production project; this root never creates it."
  type        = string
  default     = "moazez-production"

  validation {
    condition     = var.project_id == "moazez-production"
    error_message = "The production Secret Manager root is locked to moazez-production."
  }
}

variable "environment" {
  description = "Locked deployment environment modeled by the production root."
  type        = string
  default     = "production"

  validation {
    condition     = var.environment == "production"
    error_message = "The production Secret Manager root models only the production environment."
  }
}

variable "replication_location" {
  description = "Locked production location for each user-managed secret replica."
  type        = string
  default     = "me-central2"

  validation {
    condition     = var.replication_location == "me-central2"
    error_message = "The production Secret Manager root is locked to me-central2."
  }
}
