variable "project_id" {
  description = "Existing Google Cloud project ID. Project creation is outside this module."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid Google Cloud project ID."
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
  description = "Google Cloud region for regional network resources."
  type        = string

  validation {
    condition     = var.region == "me-central2"
    error_message = "The approved network module region is me-central2."
  }
}

variable "vpc_name" {
  description = "Name of the custom-mode VPC network."
  type        = string

  validation {
    condition     = can(regex("^[a-z]([-a-z0-9]*[a-z0-9])?$", var.vpc_name))
    error_message = "vpc_name must be a valid RFC1035 resource name."
  }
}

variable "runtime_subnet_name" {
  description = "Name of the regional runtime subnet."
  type        = string

  validation {
    condition     = can(regex("^[a-z]([-a-z0-9]*[a-z0-9])?$", var.runtime_subnet_name))
    error_message = "runtime_subnet_name must be a valid RFC1035 resource name."
  }
}

variable "runtime_subnet_cidr" {
  description = "Primary IPv4 CIDR for the runtime subnet."
  type        = string

  validation {
    condition     = can(cidrhost(var.runtime_subnet_cidr, 0))
    error_message = "runtime_subnet_cidr must be a valid CIDR."
  }
}

variable "psa_range_name" {
  description = "Name of the allocated Private Services Access range."
  type        = string

  validation {
    condition     = can(regex("^[a-z]([-a-z0-9]*[a-z0-9])?$", var.psa_range_name))
    error_message = "psa_range_name must be a valid RFC1035 resource name."
  }
}

variable "psa_address" {
  description = "Explicit first IPv4 address of the PSA allocation."
  type        = string

  validation {
    condition     = can(cidrhost("${var.psa_address}/32", 0))
    error_message = "psa_address must be a valid IPv4 address."
  }
}

variable "psa_prefix_length" {
  description = "IPv4 prefix length of the PSA allocation."
  type        = number

  validation {
    condition     = var.psa_prefix_length >= 8 && var.psa_prefix_length <= 29
    error_message = "psa_prefix_length must be between 8 and 29."
  }
}

variable "service_networking_service" {
  description = "Google service producer used for Private Services Access."
  type        = string

  validation {
    condition     = var.service_networking_service == "servicenetworking.googleapis.com"
    error_message = "service_networking_service must be servicenetworking.googleapis.com."
  }
}

variable "deletion_policy" {
  description = "Terraform deletion behavior for the network foundation resources."
  type        = string

  validation {
    condition = contains([
      "DELETE",
      "ABANDON",
      "PREVENT",
    ], var.deletion_policy)
    error_message = "deletion_policy must be DELETE, ABANDON, or PREVENT."
  }
}
