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
