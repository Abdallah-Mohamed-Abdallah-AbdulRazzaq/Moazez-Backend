variable "image_reference" {
  description = "Immutable digest reference for the governed production migration image."
  type        = string

  validation {
    condition = can(regex(
      "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-backend@sha256:[a-f0-9]{64}$",
      var.image_reference,
    ))
    error_message = "image_reference must be the approved production backend package pinned by a lowercase sha256 digest."
  }
}

variable "migration_database_secret_version" {
  description = "Explicit Secret Manager version used by the production governed Migration Job."
  type        = string

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.migration_database_secret_version))
    error_message = "migration_database_secret_version must be a canonical positive numeric version string."
  }
}
