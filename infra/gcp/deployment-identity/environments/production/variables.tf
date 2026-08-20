variable "project_id" {
  description = "Existing production project; this root never creates it."
  type        = string
  default     = "moazez-production"

  validation {
    condition     = var.project_id == "moazez-production"
    error_message = "The production Deployment Identity root is locked to moazez-production."
  }
}

variable "project_number" {
  description = "Existing production project number used in canonical Workload Identity principal identifiers."
  type        = string
  default     = "91001421934"

  validation {
    condition     = var.project_number == "91001421934"
    error_message = "The production Deployment Identity root is locked to project number 91001421934."
  }
}

variable "environment" {
  description = "Locked deployment environment modeled by the production root."
  type        = string
  default     = "production"

  validation {
    condition     = var.environment == "production"
    error_message = "The production Deployment Identity root models only the production environment."
  }
}
