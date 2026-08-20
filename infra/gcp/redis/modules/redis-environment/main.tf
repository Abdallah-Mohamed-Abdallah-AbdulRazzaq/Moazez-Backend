locals {
  current_contract = {
    project_id              = var.project_id
    environment             = var.environment
    region                  = var.region
    queue_instance_name     = var.queue_instance_name
    realtime_instance_name  = var.realtime_instance_name
    tier                    = var.tier
    queue_memory_size_gb    = var.queue_memory_size_gb
    realtime_memory_size_gb = var.realtime_memory_size_gb
    redis_version           = var.redis_version
    authorized_network      = var.authorized_network
    connect_mode            = var.connect_mode
    transit_encryption_mode = var.transit_encryption_mode
    auth_enabled            = var.auth_enabled
    deletion_protection     = var.deletion_protection
    queue_labels            = var.queue_labels
    realtime_labels         = var.realtime_labels
  }

  staging_contract = {
    project_id              = "moazez-nonprod-91001421934"
    environment             = "staging"
    region                  = "me-central2"
    queue_instance_name     = "moazez-staging-queue-me-central2"
    realtime_instance_name  = "moazez-staging-realtime-me-central2"
    tier                    = "BASIC"
    queue_memory_size_gb    = 1
    realtime_memory_size_gb = 1
    redis_version           = "REDIS_7_2"
    authorized_network      = "projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc"
    connect_mode            = "PRIVATE_SERVICE_ACCESS"
    transit_encryption_mode = "SERVER_AUTHENTICATION"
    auth_enabled            = false
    deletion_protection     = true
    queue_labels = tomap({
      environment = "staging"
      redis_role  = "queue"
    })
    realtime_labels = tomap({
      environment = "staging"
      redis_role  = "realtime"
    })
  }

  production_contract = {
    project_id              = "moazez-production"
    environment             = "production"
    region                  = "me-central2"
    queue_instance_name     = "moazez-production-queue-me-central2"
    realtime_instance_name  = "moazez-production-realtime-me-central2"
    tier                    = "STANDARD_HA"
    queue_memory_size_gb    = 2
    realtime_memory_size_gb = 1
    redis_version           = "REDIS_7_2"
    authorized_network      = "projects/moazez-production/global/networks/moazez-production-vpc"
    connect_mode            = "PRIVATE_SERVICE_ACCESS"
    transit_encryption_mode = "SERVER_AUTHENTICATION"
    auth_enabled            = false
    deletion_protection     = true
    queue_labels = tomap({
      environment = "production"
      redis_role  = "queue"
    })
    realtime_labels = tomap({
      environment = "production"
      redis_role  = "realtime"
    })
  }

  governed_contract = (
    local.current_contract == local.staging_contract ||
    local.current_contract == local.production_contract
  )
}

resource "google_redis_instance" "queue" {
  project                 = var.project_id
  region                  = var.region
  name                    = var.queue_instance_name
  tier                    = var.tier
  memory_size_gb          = var.queue_memory_size_gb
  redis_version           = var.redis_version
  authorized_network      = var.authorized_network
  connect_mode            = var.connect_mode
  transit_encryption_mode = var.transit_encryption_mode
  auth_enabled            = var.auth_enabled
  deletion_protection     = var.deletion_protection
  labels                  = var.queue_labels

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.governed_contract
      error_message = "The Redis environment must match the complete governed Staging or Production tuple."
    }
  }
}

resource "google_redis_instance" "realtime" {
  project                 = var.project_id
  region                  = var.region
  name                    = var.realtime_instance_name
  tier                    = var.tier
  memory_size_gb          = var.realtime_memory_size_gb
  redis_version           = var.redis_version
  authorized_network      = var.authorized_network
  connect_mode            = var.connect_mode
  transit_encryption_mode = var.transit_encryption_mode
  auth_enabled            = var.auth_enabled
  deletion_protection     = var.deletion_protection
  labels                  = var.realtime_labels

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.governed_contract
      error_message = "The Redis environment must match the complete governed Staging or Production tuple."
    }
  }
}
