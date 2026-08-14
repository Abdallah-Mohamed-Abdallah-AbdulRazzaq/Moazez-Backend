locals {
  staging_redis = {
    queue_instance_name     = "moazez-staging-queue-me-central2"
    realtime_instance_name  = "moazez-staging-realtime-me-central2"
    tier                    = "BASIC"
    memory_size_gb          = 1
    redis_version           = "REDIS_7_2"
    authorized_network      = "projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc"
    connect_mode            = "PRIVATE_SERVICE_ACCESS"
    transit_encryption_mode = "SERVER_AUTHENTICATION"
    auth_enabled            = false
    deletion_protection     = true

    queue_labels = {
      environment = "staging"
      redis_role  = "queue"
    }

    realtime_labels = {
      environment = "staging"
      redis_role  = "realtime"
    }
  }
}

module "redis_environment" {
  source = "../../modules/redis-environment"

  project_id              = var.project_id
  environment             = var.environment
  region                  = var.region
  queue_instance_name     = local.staging_redis.queue_instance_name
  realtime_instance_name  = local.staging_redis.realtime_instance_name
  tier                    = local.staging_redis.tier
  memory_size_gb          = local.staging_redis.memory_size_gb
  redis_version           = local.staging_redis.redis_version
  authorized_network      = local.staging_redis.authorized_network
  connect_mode            = local.staging_redis.connect_mode
  transit_encryption_mode = local.staging_redis.transit_encryption_mode
  auth_enabled            = local.staging_redis.auth_enabled
  deletion_protection     = local.staging_redis.deletion_protection
  queue_labels            = local.staging_redis.queue_labels
  realtime_labels         = local.staging_redis.realtime_labels
}
