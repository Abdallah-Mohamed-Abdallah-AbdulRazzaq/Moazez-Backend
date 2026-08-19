variable "project_id" {
  description = "Existing Google Cloud project for a governed SQL environment."
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
  description = "Governed deployment environment represented by this module instance."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "region" {
  description = "Governed Google Cloud region for the Cloud SQL instance."
  type        = string

  validation {
    condition     = var.region == "me-central2"
    error_message = "region must be me-central2."
  }
}

variable "instance_name" {
  description = "Governed Cloud SQL instance name."
  type        = string

  validation {
    condition = contains([
      "moazez-staging-postgres-me-central2",
      "moazez-production-postgres-me-central2",
    ], var.instance_name)
    error_message = "instance_name must be a governed Staging or Production instance name."
  }
}

variable "database_version" {
  description = "Locked PostgreSQL engine version."
  type        = string

  validation {
    condition     = var.database_version == "POSTGRES_16"
    error_message = "database_version must be POSTGRES_16."
  }
}

variable "edition" {
  description = "Governed Cloud SQL edition."
  type        = string

  validation {
    condition     = contains(["ENTERPRISE", "ENTERPRISE_PLUS"], var.edition)
    error_message = "edition must be ENTERPRISE or ENTERPRISE_PLUS."
  }
}

variable "tier" {
  description = "Governed Cloud SQL machine tier."
  type        = string

  validation {
    condition = contains([
      "db-custom-N4-2-8192",
      "db-perf-optimized-N-2",
    ], var.tier)
    error_message = "tier must be a governed Staging or Production tier."
  }
}

variable "availability_type" {
  description = "Governed availability model; Staging uses provider-managed placement and Production uses the approved explicit HA zone pair."
  type        = string

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.availability_type)
    error_message = "availability_type must be ZONAL or REGIONAL."
  }
}

variable "primary_zone" {
  description = "Optional governed primary zone; Staging leaves it unset and Production uses me-central2-a."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.primary_zone == null || var.primary_zone == "me-central2-a"
    error_message = "primary_zone must be null or me-central2-a."
  }
}

variable "secondary_zone" {
  description = "Optional governed secondary zone; Staging leaves it unset and Production uses me-central2-c."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.secondary_zone == null || var.secondary_zone == "me-central2-c"
    error_message = "secondary_zone must be null or me-central2-c."
  }
}

variable "disk_type" {
  description = "Governed initial storage type."
  type        = string

  validation {
    condition     = contains(["HYPERDISK_BALANCED", "PD_SSD"], var.disk_type)
    error_message = "disk_type must be HYPERDISK_BALANCED or PD_SSD."
  }
}

variable "disk_size_gb" {
  description = "Locked initial disk size in GiB."
  type        = number

  validation {
    condition     = var.disk_size_gb == 20
    error_message = "disk_size_gb must be 20."
  }
}

variable "disk_autoresize" {
  description = "Whether Cloud SQL may grow storage automatically."
  type        = bool

  validation {
    condition     = var.disk_autoresize == true
    error_message = "disk_autoresize must be true."
  }
}

variable "disk_autoresize_limit_gb" {
  description = "Locked storage autoresize ceiling in GiB."
  type        = number

  validation {
    condition     = var.disk_autoresize_limit_gb == 100
    error_message = "disk_autoresize_limit_gb must be 100."
  }
}

variable "backups_enabled" {
  description = "Whether automated backups are enabled."
  type        = bool

  validation {
    condition     = var.backups_enabled == true
    error_message = "backups_enabled must be true."
  }
}

variable "point_in_time_recovery_enabled" {
  description = "Whether point-in-time recovery is enabled."
  type        = bool

  validation {
    condition     = var.point_in_time_recovery_enabled == true
    error_message = "point_in_time_recovery_enabled must be true."
  }
}

variable "transaction_log_retention_days" {
  description = "Governed PostgreSQL transaction-log retention in days."
  type        = number

  validation {
    condition     = contains([7, 14], var.transaction_log_retention_days)
    error_message = "transaction_log_retention_days must be 7 or 14."
  }
}

variable "retained_backups" {
  description = "Governed number of automated backup objects to retain."
  type        = number

  validation {
    condition     = contains([8, 30], var.retained_backups)
    error_message = "retained_backups must be 8 or 30."
  }
}

variable "backup_retention_unit" {
  description = "Locked unit used by automated backup retention."
  type        = string

  validation {
    condition     = var.backup_retention_unit == "COUNT"
    error_message = "backup_retention_unit must be COUNT."
  }
}

variable "backup_location" {
  description = "Optional governed backup location; Staging leaves it unset and Production uses me-central2."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.backup_location == null || var.backup_location == "me-central2"
    error_message = "backup_location must be null or me-central2."
  }
}

variable "max_connections" {
  description = "Locked PostgreSQL max_connections database flag value."
  type        = number

  validation {
    condition     = var.max_connections == 100
    error_message = "max_connections must be 100."
  }
}

variable "ipv4_enabled" {
  description = "Whether public IPv4 is enabled for the instance."
  type        = bool

  validation {
    condition     = var.ipv4_enabled == false
    error_message = "ipv4_enabled must be false."
  }
}

variable "private_network" {
  description = "Existing governed VPC self-link used for private IP."
  type        = string

  validation {
    condition = contains([
      "projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc",
      "projects/moazez-production/global/networks/moazez-production-vpc",
    ], var.private_network)
    error_message = "private_network must reference a governed Staging or Production VPC."
  }
}

variable "allocated_ip_range" {
  description = "Existing governed Private Services Access allocated range name."
  type        = string

  validation {
    condition = contains([
      "moazez-staging-psa",
      "moazez-production-psa",
    ], var.allocated_ip_range)
    error_message = "allocated_ip_range must be a governed Staging or Production PSA range."
  }
}

variable "ssl_mode" {
  description = "Locked Cloud SQL SSL mode."
  type        = string

  validation {
    condition     = var.ssl_mode == "ENCRYPTED_ONLY"
    error_message = "ssl_mode must be ENCRYPTED_ONLY."
  }
}

variable "enable_private_path_for_google_cloud_services" {
  description = "Whether Google Cloud services may use a private path to the instance."
  type        = bool

  validation {
    condition     = var.enable_private_path_for_google_cloud_services == false
    error_message = "enable_private_path_for_google_cloud_services must be false."
  }
}

variable "terraform_deletion_protection" {
  description = "Terraform-level deletion protection for the instance resource."
  type        = bool

  validation {
    condition     = var.terraform_deletion_protection == true
    error_message = "terraform_deletion_protection must be true."
  }
}

variable "gcp_deletion_protection_enabled" {
  description = "GCP Cloud SQL API deletion protection setting."
  type        = bool

  validation {
    condition     = var.gcp_deletion_protection_enabled == true
    error_message = "gcp_deletion_protection_enabled must be true."
  }
}
