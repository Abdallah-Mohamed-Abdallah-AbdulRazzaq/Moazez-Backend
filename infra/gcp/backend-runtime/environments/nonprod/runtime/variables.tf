variable "image_reference" {
  description = "Immutable digest reference shared by the staging API and all three worker pools."
  type        = string

  validation {
    condition = can(regex(
      "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$",
      var.image_reference,
    ))
    error_message = "image_reference must be the approved staging backend package pinned by a lowercase sha256 digest."
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
