variable "api_image_reference" {
  description = "Immutable digest reference used only by the staging API service."
  type        = string

  validation {
    condition = can(regex(
      "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$",
      var.api_image_reference,
    ))
    error_message = "api_image_reference must be the approved staging backend package pinned by a lowercase sha256 digest."
  }
}

variable "core_worker_image_reference" {
  description = "Immutable digest reference used only by the staging Core Worker pool."
  type        = string

  validation {
    condition = can(regex(
      "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$",
      var.core_worker_image_reference,
    ))
    error_message = "core_worker_image_reference must be the approved staging backend package pinned by a lowercase sha256 digest."
  }
}

variable "media_worker_image_reference" {
  description = "Immutable digest reference used only by the staging Media Worker pool."
  type        = string

  validation {
    condition = can(regex(
      "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$",
      var.media_worker_image_reference,
    ))
    error_message = "media_worker_image_reference must be the approved staging backend package pinned by a lowercase sha256 digest."
  }
}

variable "maintenance_scheduler_image_reference" {
  description = "Immutable digest reference used only by the staging Maintenance Scheduler pool."
  type        = string

  validation {
    condition = can(regex(
      "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$",
      var.maintenance_scheduler_image_reference,
    ))
    error_message = "maintenance_scheduler_image_reference must be the approved staging backend package pinned by a lowercase sha256 digest."
  }
}

variable "api_traffic_mode" {
  description = "Governed staging API traffic state."
  type        = string
  default     = "normal"

  validation {
    condition     = contains(["normal", "candidate_no_traffic", "candidate_promoted"], var.api_traffic_mode)
    error_message = "api_traffic_mode must be normal, candidate_no_traffic, or candidate_promoted."
  }
}

variable "api_stable_revision" {
  description = "Verified live stable staging API revision required by candidate traffic modes; null in normal mode."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.api_stable_revision == null ||
      can(regex("^moazez-staging-api-[a-z0-9][a-z0-9-]{0,42}[a-z0-9]$", var.api_stable_revision))
    )
    error_message = "api_stable_revision must be null or a full revision name for moazez-staging-api."
  }
}

variable "api_candidate_tag" {
  description = "Image-derived deterministic staging API candidate tag required by candidate traffic modes."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.api_candidate_tag == null ||
      can(regex("^candidate-[a-f0-9]{12}$", var.api_candidate_tag))
    )
    error_message = "api_candidate_tag must be null or candidate- followed by exactly 12 lowercase hexadecimal characters."
  }
}

variable "queue_redis_host" {
  description = "Ephemeral DevOps-supplied Queue Redis hostname or IPv4 address, without a scheme, port, or path."
  type        = string

  validation {
    condition = (
      length(var.queue_redis_host) <= 253 &&
      can(regex("^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$", var.queue_redis_host))
    )
    error_message = "queue_redis_host must be a non-empty hostname or IPv4 address without a scheme, port, whitespace, or path."
  }
}

variable "queue_redis_port" {
  description = "TLS port for the Queue Redis endpoint."
  type        = number

  validation {
    condition = (
      floor(var.queue_redis_port) == var.queue_redis_port &&
      var.queue_redis_port > 0 &&
      var.queue_redis_port <= 65535
    )
    error_message = "queue_redis_port must be an integer from 1 through 65535."
  }
}

variable "queue_redis_ca_pem" {
  description = "Ephemeral DevOps-supplied Queue Redis server CA PEM bundle. Never commit this value."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.queue_redis_ca_pem)) > 0
    error_message = "queue_redis_ca_pem must be a non-empty PEM bundle."
  }
}

variable "realtime_redis_host" {
  description = "Ephemeral DevOps-supplied Realtime Redis hostname or IPv4 address, without a scheme, port, or path."
  type        = string

  validation {
    condition = (
      length(var.realtime_redis_host) <= 253 &&
      can(regex("^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$", var.realtime_redis_host))
    )
    error_message = "realtime_redis_host must be a non-empty hostname or IPv4 address without a scheme, port, whitespace, or path."
  }
}

variable "realtime_redis_port" {
  description = "TLS port for the Realtime Redis endpoint."
  type        = number

  validation {
    condition = (
      floor(var.realtime_redis_port) == var.realtime_redis_port &&
      var.realtime_redis_port > 0 &&
      var.realtime_redis_port <= 65535
    )
    error_message = "realtime_redis_port must be an integer from 1 through 65535."
  }
}

variable "realtime_redis_ca_pem" {
  description = "Ephemeral DevOps-supplied Realtime Redis server CA PEM bundle. Never commit this value."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.realtime_redis_ca_pem)) > 0
    error_message = "realtime_redis_ca_pem must be a non-empty PEM bundle."
  }
}
