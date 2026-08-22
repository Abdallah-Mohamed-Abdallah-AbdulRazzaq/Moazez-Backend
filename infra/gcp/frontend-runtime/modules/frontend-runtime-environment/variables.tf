variable "project_id" {
  description = "Production Google Cloud project that owns the frontend runtime."
  type        = string

  validation {
    condition     = var.project_id == "moazez-production"
    error_message = "project_id must be moazez-production."
  }
}

variable "region" {
  description = "Production region for frontend Cloud Run services."
  type        = string

  validation {
    condition     = var.region == "me-central2"
    error_message = "region must be me-central2."
  }
}

variable "environment" {
  description = "Closed frontend runtime environment selector."
  type        = string

  validation {
    condition     = var.environment == "production"
    error_message = "environment must be production."
  }
}

variable "iac_deployer" {
  description = "Existing Production IaC deployer allowed to attach frontend runtime identities."
  type        = string

  validation {
    condition     = var.iac_deployer == "moazez-iac-deployer@moazez-production.iam.gserviceaccount.com"
    error_message = "iac_deployer must be the governed Production IaC deployer."
  }
}

variable "platform_admin_runtime_service_account_id" {
  description = "Platform Admin runtime service-account ID."
  type        = string

  validation {
    condition     = var.platform_admin_runtime_service_account_id == "moazez-platform-admin-runtime"
    error_message = "platform_admin_runtime_service_account_id must be moazez-platform-admin-runtime."
  }
}

variable "school_dashboard_runtime_service_account_id" {
  description = "School Dashboard runtime service-account ID."
  type        = string

  validation {
    condition     = var.school_dashboard_runtime_service_account_id == "moazez-school-ui-runtime"
    error_message = "school_dashboard_runtime_service_account_id must be moazez-school-ui-runtime."
  }
}

variable "platform_admin_service_name" {
  description = "Production Platform Admin Cloud Run service name."
  type        = string

  validation {
    condition     = var.platform_admin_service_name == "moazez-production-platform-admin"
    error_message = "platform_admin_service_name must be moazez-production-platform-admin."
  }
}

variable "school_dashboard_service_name" {
  description = "Production School Dashboard Cloud Run service name."
  type        = string

  validation {
    condition     = var.school_dashboard_service_name == "moazez-production-school-dashboard"
    error_message = "school_dashboard_service_name must be moazez-production-school-dashboard."
  }
}

variable "platform_admin_image" {
  description = "Immutable Production Platform Admin image digest."
  type        = string

  validation {
    condition = can(regex(
      "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-platform-admin@sha256:[a-f0-9]{64}$",
      var.platform_admin_image,
    ))
    error_message = "platform_admin_image must be the approved Production package pinned by a lowercase sha256 digest."
  }
}

variable "school_dashboard_image" {
  description = "Immutable Production School Dashboard image digest."
  type        = string

  validation {
    condition = can(regex(
      "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-school-dashboard@sha256:[a-f0-9]{64}$",
      var.school_dashboard_image,
    ))
    error_message = "school_dashboard_image must be the approved Production package pinned by a lowercase sha256 digest."
  }
}
