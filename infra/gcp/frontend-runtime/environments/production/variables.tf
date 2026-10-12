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

variable "student_web_image" {
  description = "Immutable Production Student Web image digest."
  type        = string

  validation {
    condition = can(regex(
      "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-student-web@sha256:[a-f0-9]{64}$",
      var.student_web_image,
    ))
    error_message = "student_web_image must be the approved Production package pinned by a lowercase sha256 digest."
  }
}

variable "teacher_web_image" {
  description = "Approved immutable Production Teacher Web image digest."
  type        = string

  validation {
    condition = can(regex(
      "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-teacher-web/moazez-teacher-web@sha256:[a-f0-9]{64}$",
      var.teacher_web_image,
    ))
    error_message = "teacher_web_image must use the dedicated Production Teacher repository and package pinned by a lowercase sha256 digest."
  }

  validation {
    condition     = var.teacher_web_image == "me-central2-docker.pkg.dev/moazez-production/moazez-production-teacher-web/moazez-teacher-web@sha256:afe190b1ea78fc2697b7bd7d3ec56b2f1ad42f5854c448842e91ac01d6a9fe9f"
    error_message = "teacher_web_image must match the approved T6.9 immutable digest."
  }
}
