variable "project_id" {
  description = "Existing Google Cloud project for a governed Redis environment."
  type        = string

  validation {
    condition = contains([
      "moazez-nonprod-91001421934",
      "moazez-production",
    ], var.project_id)
    error_message = "project_id must be a governed Staging or Production project."
  }
}

variable "environment" {
  description = "Deployment environment represented by this module instance."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "region" {
  description = "Governed Google Cloud region for both Memorystore instances."
  type        = string

  validation {
    condition     = var.region == "me-central2"
    error_message = "region must be me-central2."
  }
}

variable "queue_instance_name" {
  description = "Locked Queue Redis instance name."
  type        = string

  validation {
    condition = contains([
      "moazez-staging-queue-me-central2",
      "moazez-production-queue-me-central2",
    ], var.queue_instance_name)
    error_message = "queue_instance_name must be a governed Staging or Production Queue instance name."
  }
}

variable "realtime_instance_name" {
  description = "Locked Realtime Redis instance name."
  type        = string

  validation {
    condition = contains([
      "moazez-staging-realtime-me-central2",
      "moazez-production-realtime-me-central2",
    ], var.realtime_instance_name)
    error_message = "realtime_instance_name must be a governed Staging or Production Realtime instance name."
  }
}

variable "tier" {
  description = "Locked Memorystore service tier."
  type        = string

  validation {
    condition     = contains(["BASIC", "STANDARD_HA"], var.tier)
    error_message = "tier must be BASIC or STANDARD_HA."
  }
}

variable "queue_memory_size_gb" {
  description = "Governed Queue Redis memory size in GiB."
  type        = number

  validation {
    condition     = contains([1, 2], var.queue_memory_size_gb)
    error_message = "queue_memory_size_gb must be 1 or 2."
  }
}

variable "realtime_memory_size_gb" {
  description = "Locked Realtime Redis memory size in GiB."
  type        = number

  validation {
    condition     = var.realtime_memory_size_gb == 1
    error_message = "realtime_memory_size_gb must be 1."
  }
}

variable "redis_version" {
  description = "Locked Memorystore Redis version."
  type        = string

  validation {
    condition     = var.redis_version == "REDIS_7_2"
    error_message = "redis_version must be REDIS_7_2."
  }
}

variable "authorized_network" {
  description = "Existing governed VPC used through Private Service Access."
  type        = string

  validation {
    condition = contains([
      "projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc",
      "projects/moazez-production/global/networks/moazez-production-vpc",
    ], var.authorized_network)
    error_message = "authorized_network must reference a governed Staging or Production VPC."
  }
}

variable "connect_mode" {
  description = "Locked Memorystore network connection mode."
  type        = string

  validation {
    condition     = var.connect_mode == "PRIVATE_SERVICE_ACCESS"
    error_message = "connect_mode must be PRIVATE_SERVICE_ACCESS."
  }
}

variable "transit_encryption_mode" {
  description = "Locked server-authenticated TLS mode."
  type        = string

  validation {
    condition     = var.transit_encryption_mode == "SERVER_AUTHENTICATION"
    error_message = "transit_encryption_mode must be SERVER_AUTHENTICATION."
  }
}

variable "auth_enabled" {
  description = "Whether Memorystore AUTH is enabled in the governed environment."
  type        = bool

  validation {
    condition     = var.auth_enabled == false
    error_message = "auth_enabled must be false."
  }
}

variable "deletion_protection" {
  description = "Terraform provider deletion protection for both instances."
  type        = bool

  validation {
    condition     = var.deletion_protection == true
    error_message = "deletion_protection must be true."
  }
}

variable "queue_labels" {
  description = "Exact operational ownership labels for Queue Redis."
  type        = map(string)

  validation {
    condition = (
      length(var.queue_labels) == 2 &&
      contains(["staging", "production"], lookup(var.queue_labels, "environment", "")) &&
      lookup(var.queue_labels, "redis_role", "") == "queue"
    )
    error_message = "queue_labels must contain exactly a governed environment and redis_role=queue."
  }
}

variable "realtime_labels" {
  description = "Exact operational ownership labels for Realtime Redis."
  type        = map(string)

  validation {
    condition = (
      length(var.realtime_labels) == 2 &&
      contains(["staging", "production"], lookup(var.realtime_labels, "environment", "")) &&
      lookup(var.realtime_labels, "redis_role", "") == "realtime"
    )
    error_message = "realtime_labels must contain exactly a governed environment and redis_role=realtime."
  }
}
