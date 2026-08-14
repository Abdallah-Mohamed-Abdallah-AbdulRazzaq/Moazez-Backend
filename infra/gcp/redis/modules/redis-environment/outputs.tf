output "project_id" {
  value = var.project_id
}

output "environment" {
  value = var.environment
}

output "queue_instance_name" {
  value = google_redis_instance.queue.name
}

output "queue_id" {
  value = google_redis_instance.queue.id
}

output "queue_region" {
  value = google_redis_instance.queue.region
}

output "queue_tier" {
  value = google_redis_instance.queue.tier
}

output "queue_memory_size_gb" {
  value = google_redis_instance.queue.memory_size_gb
}

output "queue_redis_version" {
  value = google_redis_instance.queue.redis_version
}

output "queue_authorized_network" {
  value = google_redis_instance.queue.authorized_network
}

output "queue_connect_mode" {
  value = google_redis_instance.queue.connect_mode
}

output "queue_transit_encryption_mode" {
  value = google_redis_instance.queue.transit_encryption_mode
}

output "queue_auth_enabled" {
  value = google_redis_instance.queue.auth_enabled
}

output "queue_deletion_protection" {
  value = google_redis_instance.queue.deletion_protection
}

output "realtime_instance_name" {
  value = google_redis_instance.realtime.name
}

output "realtime_id" {
  value = google_redis_instance.realtime.id
}

output "realtime_region" {
  value = google_redis_instance.realtime.region
}

output "realtime_tier" {
  value = google_redis_instance.realtime.tier
}

output "realtime_memory_size_gb" {
  value = google_redis_instance.realtime.memory_size_gb
}

output "realtime_redis_version" {
  value = google_redis_instance.realtime.redis_version
}

output "realtime_authorized_network" {
  value = google_redis_instance.realtime.authorized_network
}

output "realtime_connect_mode" {
  value = google_redis_instance.realtime.connect_mode
}

output "realtime_transit_encryption_mode" {
  value = google_redis_instance.realtime.transit_encryption_mode
}

output "realtime_auth_enabled" {
  value = google_redis_instance.realtime.auth_enabled
}

output "realtime_deletion_protection" {
  value = google_redis_instance.realtime.deletion_protection
}
