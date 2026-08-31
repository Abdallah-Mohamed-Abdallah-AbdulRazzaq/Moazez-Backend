module "runtime_environment" {
  source = "../../../modules/runtime-environment"

  environment                                    = "production"
  fcm_delivery_mode                              = var.fcm_delivery_mode
  api_image_reference                            = var.api_image_reference
  core_worker_image_reference                    = var.core_worker_image_reference
  media_worker_image_reference                   = var.media_worker_image_reference
  maintenance_scheduler_image_reference          = var.maintenance_scheduler_image_reference
  api_traffic_mode                               = var.api_traffic_mode
  api_stable_revision                            = var.api_stable_revision
  api_candidate_tag                              = var.api_candidate_tag
  queue_redis_host                               = var.queue_redis_host
  queue_redis_port                               = var.queue_redis_port
  queue_redis_ca_pem                             = var.queue_redis_ca_pem
  realtime_redis_host                            = var.realtime_redis_host
  realtime_redis_port                            = var.realtime_redis_port
  realtime_redis_ca_pem                          = var.realtime_redis_ca_pem
  api_url                                        = var.api_url
  settings_email_secret_encryption_active_key_id = var.settings_email_secret_encryption_active_key_id
  app_device_token_encryption_active_key_id      = var.app_device_token_encryption_active_key_id
}
