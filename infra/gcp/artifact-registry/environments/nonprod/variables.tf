variable "project_id" {
  description = "Existing staging project; this root never creates it."
  type        = string
  default     = "moazez-nonprod-91001421934"

  validation {
    condition     = var.project_id == "moazez-nonprod-91001421934"
    error_message = "The nonprod Artifact Registry root is locked to moazez-nonprod-91001421934."
  }
}

variable "environment" {
  description = "Locked deployment environment modeled by the nonprod root."
  type        = string
  default     = "staging"

  validation {
    condition     = var.environment == "staging"
    error_message = "The nonprod Artifact Registry root models only the staging environment."
  }
}

variable "location" {
  description = "Locked staging location for the Artifact Registry repository."
  type        = string
  default     = "me-central2"

  validation {
    condition     = var.location == "me-central2"
    error_message = "The nonprod Artifact Registry root is locked to me-central2."
  }
}

variable "repository_id" {
  description = "Locked staging Artifact Registry repository ID."
  type        = string
  default     = "moazez-staging-containers"

  validation {
    condition     = var.repository_id == "moazez-staging-containers"
    error_message = "The nonprod Artifact Registry root is locked to moazez-staging-containers."
  }
}
