variable "candidate_edge_enabled" {
  description = "Whether to provision the staging-only exact candidate smoke path."
  type        = bool
  default     = false
}

variable "candidate_api_tag" {
  description = "Deterministic API candidate tag required only when candidate_edge_enabled is true."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.candidate_api_tag == null ||
      can(regex("^candidate-[a-f0-9]{12}$", var.candidate_api_tag))
    )
    error_message = "candidate_api_tag must be null or candidate- followed by exactly 12 lowercase hexadecimal characters."
  }
}
