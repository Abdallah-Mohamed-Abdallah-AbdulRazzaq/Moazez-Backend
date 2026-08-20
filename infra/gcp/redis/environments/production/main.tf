locals {
  production_redis = {
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

    queue_labels = {
      environment = "production"
      redis_role  = "queue"
    }

    realtime_labels = {
      environment = "production"
      redis_role  = "realtime"
    }
  }
}

module "redis_environment" {
  source = "../../modules/redis-environment"

  project_id              = var.project_id
  environment             = var.environment
  region                  = var.region
  queue_instance_name     = local.production_redis.queue_instance_name
  realtime_instance_name  = local.production_redis.realtime_instance_name
  tier                    = local.production_redis.tier
  queue_memory_size_gb    = local.production_redis.queue_memory_size_gb
  realtime_memory_size_gb = local.production_redis.realtime_memory_size_gb
  redis_version           = local.production_redis.redis_version
  authorized_network      = local.production_redis.authorized_network
  connect_mode            = local.production_redis.connect_mode
  transit_encryption_mode = local.production_redis.transit_encryption_mode
  auth_enabled            = local.production_redis.auth_enabled
  deletion_protection     = local.production_redis.deletion_protection
  queue_labels            = local.production_redis.queue_labels
  realtime_labels         = local.production_redis.realtime_labels
}
