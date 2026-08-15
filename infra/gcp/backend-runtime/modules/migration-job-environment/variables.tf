variable "image_reference" {
  description = "Immutable digest reference for the governed staging migration image."
  type        = string

  validation {
    condition = can(regex(
      "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$",
      var.image_reference,
    ))
    error_message = "image_reference must be the approved staging backend package pinned by a lowercase sha256 digest."
  }
}
