locals {
  current_contract = {
    project_id                                  = var.project_id
    region                                      = var.region
    environment                                 = var.environment
    iac_deployer                                = var.iac_deployer
    platform_admin_runtime_service_account_id   = var.platform_admin_runtime_service_account_id
    school_dashboard_runtime_service_account_id = var.school_dashboard_runtime_service_account_id
    platform_admin_service_name                 = var.platform_admin_service_name
    school_dashboard_service_name               = var.school_dashboard_service_name
  }

  production_contract = {
    project_id                                  = "moazez-production"
    region                                      = "me-central2"
    environment                                 = "production"
    iac_deployer                                = "moazez-iac-deployer@moazez-production.iam.gserviceaccount.com"
    platform_admin_runtime_service_account_id   = "moazez-platform-admin-runtime"
    school_dashboard_runtime_service_account_id = "moazez-school-ui-runtime"
    platform_admin_service_name                 = "moazez-production-platform-admin"
    school_dashboard_service_name               = "moazez-production-school-dashboard"
  }

  governed_contract   = local.current_contract == local.production_contract
  iac_deployer_member = "serviceAccount:${var.iac_deployer}"

  platform_admin_image_matches = can(regex(
    "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-platform-admin@sha256:[a-f0-9]{64}$",
    var.platform_admin_image,
  ))
  school_dashboard_image_matches = can(regex(
    "^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-school-dashboard@sha256:[a-f0-9]{64}$",
    var.school_dashboard_image,
  ))
}

resource "google_service_account" "platform_admin_runtime" {
  project         = var.project_id
  account_id      = var.platform_admin_runtime_service_account_id
  display_name    = "Moazez Platform Admin Runtime"
  deletion_policy = "PREVENT"

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.governed_contract
      error_message = "The frontend runtime environment must match the complete governed Production tuple."
    }
  }
}

resource "google_service_account" "school_dashboard_runtime" {
  project         = var.project_id
  account_id      = var.school_dashboard_runtime_service_account_id
  display_name    = "Moazez School Dashboard Runtime"
  deletion_policy = "PREVENT"

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.governed_contract
      error_message = "The frontend runtime environment must match the complete governed Production tuple."
    }
  }
}

resource "google_service_account_iam_member" "platform_admin_iac_deployer_act_as" {
  service_account_id = google_service_account.platform_admin_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = local.iac_deployer_member

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The frontend runtime environment must match the complete governed Production tuple."
    }
  }
}

resource "google_service_account_iam_member" "school_dashboard_iac_deployer_act_as" {
  service_account_id = google_service_account.school_dashboard_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = local.iac_deployer_member

  lifecycle {
    precondition {
      condition     = local.governed_contract
      error_message = "The frontend runtime environment must match the complete governed Production tuple."
    }
  }
}

resource "google_cloud_run_v2_service" "platform_admin" {
  project              = var.project_id
  location             = var.region
  name                 = var.platform_admin_service_name
  ingress              = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  default_uri_disabled = true
  invoker_iam_disabled = true
  deletion_protection  = true

  scaling {
    max_instance_count = 100
  }

  template {
    service_account = google_service_account.platform_admin_runtime.email

    containers {
      image = var.platform_admin_image

      ports {
        container_port = 8080
      }
    }
  }

  depends_on = [google_service_account_iam_member.platform_admin_iac_deployer_act_as]

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.governed_contract
      error_message = "The frontend runtime environment must match the complete governed Production tuple."
    }

    precondition {
      condition     = local.platform_admin_image_matches
      error_message = "platform_admin_image must use the immutable governed Production package."
    }
  }
}

resource "google_cloud_run_v2_service" "school_dashboard" {
  project              = var.project_id
  location             = var.region
  name                 = var.school_dashboard_service_name
  ingress              = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  default_uri_disabled = true
  invoker_iam_disabled = true
  deletion_protection  = true

  scaling {
    max_instance_count = 100
  }

  template {
    service_account = google_service_account.school_dashboard_runtime.email

    containers {
      image = var.school_dashboard_image

      ports {
        container_port = 8080
      }
    }
  }

  depends_on = [google_service_account_iam_member.school_dashboard_iac_deployer_act_as]

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.governed_contract
      error_message = "The frontend runtime environment must match the complete governed Production tuple."
    }

    precondition {
      condition     = local.school_dashboard_image_matches
      error_message = "school_dashboard_image must use the immutable governed Production package."
    }
  }
}
