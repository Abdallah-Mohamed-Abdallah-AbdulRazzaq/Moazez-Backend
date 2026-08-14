variable "project_id" {
  description = "Existing staging project; this root never creates it."
  type        = string
  default     = "moazez-nonprod-91001421934"

  validation {
    condition     = var.project_id == "moazez-nonprod-91001421934"
    error_message = "The nonprod Secret Manager root is locked to moazez-nonprod-91001421934."
  }
}

variable "environment" {
  description = "Locked deployment environment modeled by the nonprod root."
  type        = string
  default     = "staging"

  validation {
    condition     = var.environment == "staging"
    error_message = "The nonprod Secret Manager root models only the staging environment."
  }
}

variable "replication_location" {
  description = "Locked staging location for each user-managed secret replica."
  type        = string
  default     = "me-central2"

  validation {
    condition     = var.replication_location == "me-central2"
    error_message = "The nonprod Secret Manager root is locked to me-central2."
  }
}
