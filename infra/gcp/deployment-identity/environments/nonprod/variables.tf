variable "project_id" {
  description = "Existing staging project; this root never creates it."
  type        = string
  default     = "moazez-nonprod-91001421934"

  validation {
    condition     = var.project_id == "moazez-nonprod-91001421934"
    error_message = "The nonprod Deployment Identity root is locked to moazez-nonprod-91001421934."
  }
}

variable "project_number" {
  description = "Existing staging project number used in canonical Workload Identity principal identifiers."
  type        = string
  default     = "375161231141"

  validation {
    condition     = var.project_number == "375161231141"
    error_message = "The nonprod Deployment Identity root is locked to project number 375161231141."
  }
}

variable "environment" {
  description = "Locked deployment environment modeled by the nonprod root."
  type        = string
  default     = "staging"

  validation {
    condition     = var.environment == "staging"
    error_message = "The nonprod Deployment Identity root models only the staging environment."
  }
}
