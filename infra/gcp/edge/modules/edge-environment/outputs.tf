output "global_ipv4_address" {
  description = "Reserved global IPv4 address for the staging edge."
  value       = google_compute_global_address.edge.address
}

output "serverless_neg_names" {
  description = "Serverless NEG names keyed by application surface."
  value = {
    for key, resource in google_compute_region_network_endpoint_group.service :
    key => resource.name
  }
}

output "backend_service_names" {
  description = "Backend service names keyed by application surface."
  value = {
    for key, resource in google_compute_backend_service.service :
    key => resource.name
  }
}

output "cloud_armor_policy_name" {
  description = "Cloud Armor security policy name."
  value       = google_compute_security_policy.edge.name
}

output "url_map_name" {
  description = "Global URL map name."
  value       = google_compute_url_map.edge.name
}

output "certificate_name" {
  description = "Certificate Manager certificate name."
  value       = google_certificate_manager_certificate.edge.name
}

output "certificate_map_name" {
  description = "Certificate Manager map name."
  value       = google_certificate_manager_certificate_map.edge.name
}

output "https_proxy_name" {
  description = "Target HTTPS proxy name."
  value       = google_compute_target_https_proxy.edge.name
}

output "https_forwarding_rule_name" {
  description = "Global HTTPS forwarding rule name."
  value       = google_compute_global_forwarding_rule.https.name
}

output "candidate_serverless_neg_name" {
  description = "Optional staging candidate-tagged API NEG name."
  value       = var.candidate_edge_enabled ? google_compute_region_network_endpoint_group.api_candidate[0].name : null
}

output "candidate_backend_service_name" {
  description = "Optional staging candidate API backend service name."
  value       = var.candidate_edge_enabled ? google_compute_backend_service.api_candidate[0].name : null
}

output "candidate_smoke_public_path" {
  description = "Exact existing-hostname path routed only to the candidate backend when enabled."
  value       = var.candidate_edge_enabled ? local.candidate_smoke_public_path : null
}

output "candidate_smoke_backend_path" {
  description = "Existing protected application path used by candidate smoke verification."
  value       = var.candidate_edge_enabled ? local.candidate_smoke_backend_path : null
}
