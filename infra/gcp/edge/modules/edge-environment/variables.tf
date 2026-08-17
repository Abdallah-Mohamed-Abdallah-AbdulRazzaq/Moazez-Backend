variable "project_id" {
  description = "Google Cloud project ID."
  type        = string
}

variable "region" {
  description = "Region containing the Cloud Run services and serverless NEGs."
  type        = string
}

variable "environment" {
  description = "Environment name used in resource names."
  type        = string
}

variable "api_hostname" {
  description = "Canonical staging API hostname."
  type        = string
}

variable "platform_admin_hostname" {
  description = "Canonical staging Platform Admin hostname."
  type        = string
}

variable "school_dashboard_hostname" {
  description = "Canonical staging School Dashboard hostname."
  type        = string
}

variable "api_service_name" {
  description = "Existing Cloud Run API service name."
  type        = string
}

variable "platform_admin_service_name" {
  description = "Existing Cloud Run Platform Admin service name."
  type        = string
}

variable "school_dashboard_service_name" {
  description = "Existing Cloud Run School Dashboard service name."
  type        = string
}