variable "project_id" {
  description = "Existing Google Cloud project that owns the Staging instance."
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
  description = "Google Cloud region for the Staging Cloud SQL instance."
  type        = string

  validation {
    condition     = var.region == "me-central2"
    error_message = "region must be me-central2."
  }
}

variable "instance_name" {
  description = "Locked Staging Cloud SQL instance name."
  type        = string

  validation {
    condition     = var.instance_name == "moazez-staging-postgres-me-central2"
    error_message = "instance_name must be moazez-staging-postgres-me-central2."
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
  description = "Locked Cloud SQL edition."
  type        = string

  validation {
    condition     = var.edition == "ENTERPRISE"
    error_message = "edition must be ENTERPRISE."
  }
}

variable "tier" {
  description = "Locked N4 custom machine tier for 2 vCPU and 8 GiB memory."
  type        = string

  validation {
    condition     = var.tier == "db-custom-N4-2-8192"
    error_message = "tier must be db-custom-N4-2-8192."
  }
}

variable "availability_type" {
  description = "Locked zonal availability model; no explicit zone is configured."
  type        = string

  validation {
    condition     = var.availability_type == "ZONAL"
    error_message = "availability_type must be ZONAL."
  }
}

variable "disk_type" {
  description = "Locked initial storage type."
  type        = string

  validation {
    condition     = var.disk_type == "HYPERDISK_BALANCED"
    error_message = "disk_type must be HYPERDISK_BALANCED."
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
  description = "Locked PostgreSQL transaction-log retention in days."
  type        = number

  validation {
    condition     = var.transaction_log_retention_days == 7
    error_message = "transaction_log_retention_days must be 7."
  }
}

variable "retained_backups" {
  description = "Locked number of automated backups to retain."
  type        = number

  validation {
    condition     = var.retained_backups == 8
    error_message = "retained_backups must be 8."
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
  description = "Existing Stage 4 VPC self-link used for private IP."
  type        = string

  validation {
    condition     = var.private_network == "projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc"
    error_message = "private_network must reference the approved Staging VPC."
  }
}

variable "allocated_ip_range" {
  description = "Existing Stage 4 Private Services Access allocated range name."
  type        = string

  validation {
    condition     = var.allocated_ip_range == "moazez-staging-psa"
    error_message = "allocated_ip_range must be moazez-staging-psa."
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
