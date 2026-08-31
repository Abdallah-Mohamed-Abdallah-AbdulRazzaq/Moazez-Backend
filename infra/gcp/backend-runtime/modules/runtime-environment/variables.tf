variable "environment" {
  description = "Closed runtime environment selector."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either staging or production."
  }
}

variable "fcm_delivery_mode" {
  description = "Closed Core Worker FCM delivery selector."
  type        = string

  validation {
    condition     = contains(["disabled", "dry_run", "send_enabled"], var.fcm_delivery_mode)
    error_message = "fcm_delivery_mode must be disabled, dry_run, or send_enabled."
  }
}

variable "api_image_reference" {
  description = "Immutable digest reference used only by the selected environment's API service."
  type        = string

  validation {
    condition = (
      can(regex(
        "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$",
        var.api_image_reference,
      )) ||
      can(regex(
        "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-backend@sha256:[a-f0-9]{64}$",
        var.api_image_reference,
      ))
    )
    error_message = "api_image_reference must be an approved staging or production backend package pinned by a lowercase sha256 digest."
  }
}

variable "core_worker_image_reference" {
  description = "Immutable digest reference used only by the selected environment's Core Worker pool."
  type        = string

  validation {
    condition = (
      can(regex(
        "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$",
        var.core_worker_image_reference,
      )) ||
      can(regex(
        "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-backend@sha256:[a-f0-9]{64}$",
        var.core_worker_image_reference,
      ))
    )
    error_message = "core_worker_image_reference must be an approved staging or production backend package pinned by a lowercase sha256 digest."
  }
}

variable "media_worker_image_reference" {
  description = "Immutable digest reference used only by the selected environment's Media Worker pool."
  type        = string

  validation {
    condition = (
      can(regex(
        "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$",
        var.media_worker_image_reference,
      )) ||
      can(regex(
        "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-backend@sha256:[a-f0-9]{64}$",
        var.media_worker_image_reference,
      ))
    )
    error_message = "media_worker_image_reference must be an approved staging or production backend package pinned by a lowercase sha256 digest."
  }
}

variable "maintenance_scheduler_image_reference" {
  description = "Immutable digest reference used only by the selected environment's Maintenance Scheduler pool."
  type        = string

  validation {
    condition = (
      can(regex(
        "^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$",
        var.maintenance_scheduler_image_reference,
      )) ||
      can(regex(
        "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-backend@sha256:[a-f0-9]{64}$",
        var.maintenance_scheduler_image_reference,
      ))
    )
    error_message = "maintenance_scheduler_image_reference must be an approved staging or production backend package pinned by a lowercase sha256 digest."
  }
}

variable "api_traffic_mode" {
  description = "Governed API traffic state. Candidate modes pin an explicit stable revision and deterministic candidate tag."
  type        = string
  default     = "normal"

  validation {
    condition     = contains(["normal", "candidate_no_traffic", "candidate_promoted"], var.api_traffic_mode)
    error_message = "api_traffic_mode must be normal, candidate_no_traffic, or candidate_promoted."
  }
}

variable "api_stable_revision" {
  description = "Verified live stable Cloud Run revision required by candidate traffic modes; null in normal mode."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.api_stable_revision == null ||
      can(regex("^[a-z][a-z0-9-]{0,61}[a-z0-9]$", var.api_stable_revision))
    )
    error_message = "api_stable_revision must be null or a valid full lowercase Cloud Run revision name."
  }
}

variable "api_candidate_tag" {
  description = "Deterministic candidate tag required by candidate traffic modes; it must equal candidate-<first 12 hex of sha256(api_image_reference)>."
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

variable "api_url" {
  description = "Canonical HTTPS origin used as APP_URL by the API and Core Worker."
  type        = string

  validation {
    condition = can(regex(
      "^https://[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*([:](6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?/?$",
      var.api_url,
    ))
    error_message = "api_url must be a canonical HTTPS origin with no credentials, query, fragment, or application path."
  }
}

variable "settings_email_secret_encryption_active_key_id" {
  description = "Non-secret active SMTP encryption key identifier."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$", var.settings_email_secret_encryption_active_key_id))
    error_message = "settings_email_secret_encryption_active_key_id must be a valid governed key identifier."
  }
}

variable "app_device_token_encryption_active_key_id" {
  description = "Non-secret active app-device-token encryption key identifier."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$", var.app_device_token_encryption_active_key_id))
    error_message = "app_device_token_encryption_active_key_id must be a valid governed key identifier."
  }
}
