variable "environment" {
  description = "Closed runtime environment selector."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either staging or production."
  }
}

variable "api_service_min_instances" {
  description = "Governed aggregate Cloud Run service minimum for the API."
  type        = number

  validation {
    condition     = floor(var.api_service_min_instances) == var.api_service_min_instances && var.api_service_min_instances >= 1
    error_message = "api_service_min_instances must be a positive integer."
  }
}

variable "api_service_max_instances" {
  description = "Governed aggregate Cloud Run service maximum for the API."
  type        = number

  validation {
    condition     = floor(var.api_service_max_instances) == var.api_service_max_instances && var.api_service_max_instances >= 1
    error_message = "api_service_max_instances must be a positive integer."
  }
}

variable "api_revision_max_instances" {
  description = "Optional governed maximum for a newly created API revision. Null preserves provider-defaulted absence."
  type        = number
  default     = null
  nullable    = true

  validation {
    condition = (
      var.api_revision_max_instances == null ||
      (floor(var.api_revision_max_instances) == var.api_revision_max_instances && var.api_revision_max_instances >= 1)
    )
    error_message = "api_revision_max_instances must be null or a positive integer."
  }
}

variable "api_max_instance_request_concurrency" {
  description = "Governed maximum concurrent requests owned by each API revision instance."
  type        = number

  validation {
    condition = (
      floor(var.api_max_instance_request_concurrency) == var.api_max_instance_request_concurrency &&
      var.api_max_instance_request_concurrency >= 1 &&
      var.api_max_instance_request_concurrency <= 1000
    )
    error_message = "api_max_instance_request_concurrency must be an integer from 1 through 1000."
  }
}

variable "api_request_timeout_seconds" {
  description = "Optional governed API revision request timeout. Null preserves provider-defaulted absence."
  type        = number
  default     = null
  nullable    = true

  validation {
    condition = (
      var.api_request_timeout_seconds == null ||
      (
        floor(var.api_request_timeout_seconds) == var.api_request_timeout_seconds &&
        var.api_request_timeout_seconds >= 1 &&
        var.api_request_timeout_seconds <= 3600
      )
    )
    error_message = "api_request_timeout_seconds must be null or an integer from 1 through 3600."
  }
}

variable "api_session_affinity" {
  description = "Optional governed API revision session-affinity setting. Null preserves provider-defaulted absence."
  type        = bool
  default     = null
  nullable    = true
}

variable "api_database_connection_limit" {
  description = "Governed per-instance API Prisma connection limit."
  type        = number

  validation {
    condition     = floor(var.api_database_connection_limit) == var.api_database_connection_limit && var.api_database_connection_limit >= 1
    error_message = "api_database_connection_limit must be a positive integer."
  }
}

variable "core_worker_manual_instance_count" {
  description = "Governed manual Core Worker Pool instance count."
  type        = number

  validation {
    condition     = floor(var.core_worker_manual_instance_count) == var.core_worker_manual_instance_count && var.core_worker_manual_instance_count >= 1
    error_message = "core_worker_manual_instance_count must be a positive integer."
  }
}

variable "media_worker_manual_instance_count" {
  description = "Governed manual Media Worker Pool instance count."
  type        = number

  validation {
    condition     = floor(var.media_worker_manual_instance_count) == var.media_worker_manual_instance_count && var.media_worker_manual_instance_count >= 1
    error_message = "media_worker_manual_instance_count must be a positive integer."
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
  description = "Deterministic candidate tag required by candidate traffic modes; its authority is selected by api_candidate_identity_version."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.api_candidate_tag == null ||
      can(regex("^candidate-[a-f0-9]{12}(-r[1-9][0-9]{0,14})?$", var.api_candidate_tag))
    )
    error_message = "api_candidate_tag must be null, candidate- followed by exactly 12 lowercase hexadecimal characters, or that base followed by a canonical -rN recovery suffix of at most 15 digits."
  }
}

variable "api_candidate_identity_version" {
  description = "Candidate identity authority. image-v1 preserves historical V1-V5 candidates; capacity-v1 binds the artifact digest plus complete revision capacity."
  type        = string
  default     = "image-v1"

  validation {
    condition     = contains(["image-v1", "capacity-v1"], var.api_candidate_identity_version)
    error_message = "api_candidate_identity_version must be image-v1 or capacity-v1."
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
