module "runtime_environment" {
  source = "../../../modules/runtime-environment"

  environment                                    = "production"
  fcm_delivery_mode                              = var.fcm_delivery_mode
  image_reference                                = var.image_reference
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
