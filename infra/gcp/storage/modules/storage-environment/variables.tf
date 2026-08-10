variable "environment" {
  description = "Locked Moazez cloud environment represented by this module instance."
  type        = string

  validation {
    condition     = contains(["nonprod", "production"], var.environment)
    error_message = "environment must be nonprod or production."
  }
}

variable "project_id" {
  description = "Existing Google Cloud project ID. Project creation is outside this module."
  type        = string

  validation {
    condition = contains([
      "moazez-nonprod-91001421934",
      "moazez-production",
    ], var.project_id)
    error_message = "project_id must be one of the two Owner-approved projects."
  }
}
