variable "candidate_edge_enabled" {
  description = "Whether to provision the governed Production Candidate NEG and backend resources."
  type        = bool
  default     = false
}

variable "candidate_smoke_route_enabled" {
  description = "Whether the governed Production Candidate smoke route is enabled. Null preserves the historical candidate_edge_enabled behavior."
  type        = bool
  default     = null
  nullable    = true
}

variable "candidate_api_tag" {
  description = "Canonical Cloud Run candidate tag required only when candidate_edge_enabled is true."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.candidate_api_tag == null ||
      can(regex("^candidate-[a-f0-9]{12}(-r[1-9][0-9]{0,14})?$", var.candidate_api_tag))
    )

    error_message = "candidate_api_tag must be null, candidate- followed by exactly 12 lowercase hexadecimal characters, or that base followed by a canonical -rN recovery suffix of at most 15 digits."
  }
}
