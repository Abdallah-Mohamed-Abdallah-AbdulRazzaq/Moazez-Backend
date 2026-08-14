variable "project_id" {
  description = "Existing Google Cloud project that owns the Staging instances."
  type        = string

  validation {
    condition     = var.project_id == "moazez-nonprod-91001421934"
    error_message = "project_id must be moazez-nonprod-91001421934."
  }
}

variable "environment" {
  description = "Deployment environment represented by this module instance."
  type        = string

  validation {
    condition     = var.environment == "staging"
    error_message = "environment must be staging."
  }
}

variable "region" {
  description = "Google Cloud region for both Staging Memorystore instances."
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
    condition     = var.queue_instance_name == "moazez-staging-queue-me-central2"
    error_message = "queue_instance_name must be moazez-staging-queue-me-central2."
  }
}

variable "realtime_instance_name" {
  description = "Locked Realtime Redis instance name."
  type        = string

  validation {
    condition     = var.realtime_instance_name == "moazez-staging-realtime-me-central2"
    error_message = "realtime_instance_name must be moazez-staging-realtime-me-central2."
  }
}

variable "tier" {
  description = "Locked Memorystore service tier."
  type        = string

  validation {
    condition     = var.tier == "BASIC"
    error_message = "tier must be BASIC."
  }
}

variable "memory_size_gb" {
  description = "Locked memory size in GiB for each instance."
  type        = number

  validation {
    condition     = var.memory_size_gb == 1
    error_message = "memory_size_gb must be 1."
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
  description = "Existing Stage 4 VPC used through Private Service Access."
  type        = string

  validation {
    condition     = var.authorized_network == "projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc"
    error_message = "authorized_network must reference the approved Staging VPC."
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
  description = "Whether Memorystore AUTH is enabled in Stage 7A."
  type        = bool

  validation {
    condition     = var.auth_enabled == false
    error_message = "auth_enabled must be false in Stage 7A."
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
      lookup(var.queue_labels, "environment", "") == "staging" &&
      lookup(var.queue_labels, "redis_role", "") == "queue"
    )
    error_message = "queue_labels must contain exactly environment=staging and redis_role=queue."
  }
}

variable "realtime_labels" {
  description = "Exact operational ownership labels for Realtime Redis."
  type        = map(string)

  validation {
    condition = (
      length(var.realtime_labels) == 2 &&
      lookup(var.realtime_labels, "environment", "") == "staging" &&
      lookup(var.realtime_labels, "redis_role", "") == "realtime"
    )
    error_message = "realtime_labels must contain exactly environment=staging and redis_role=realtime."
  }
}
