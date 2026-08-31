variable "project_id" {
  description = "Google Cloud project ID."
  type        = string
}

variable "region" {
  description = "Region containing the Cloud Run services and serverless NEGs."
  type        = string
}

variable "environment" {
  description = "Environment name used in resource names."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either staging or production."
  }
}

variable "api_hostname" {
  description = "Canonical staging API hostname."
  type        = string
}

variable "platform_admin_hostname" {
  description = "Canonical staging Platform Admin hostname."
  type        = string
}

variable "school_dashboard_hostname" {
  description = "Canonical staging School Dashboard hostname."
  type        = string
}

variable "api_service_name" {
  description = "Existing Cloud Run API service name."
  type        = string
}

variable "platform_admin_service_name" {
  description = "Existing Cloud Run Platform Admin service name."
  type        = string
}

variable "school_dashboard_service_name" {
  description = "Existing Cloud Run School Dashboard service name."
  type        = string
}

variable "candidate_edge_enabled" {
  description = "Whether the staging-only exact candidate smoke route and tagged NEG are enabled."
  type        = bool
  default     = false
}

variable "candidate_api_tag" {
  description = "Deterministic Cloud Run candidate tag used by the optional staging candidate NEG."
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
