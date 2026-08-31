output "global_ipv4_address" {
  value = module.edge_environment.global_ipv4_address
}

output "serverless_neg_names" {
  value = module.edge_environment.serverless_neg_names
}

output "backend_service_names" {
  value = module.edge_environment.backend_service_names
}

output "cloud_armor_policy_name" {
  value = module.edge_environment.cloud_armor_policy_name
}

output "url_map_name" {
  value = module.edge_environment.url_map_name
}

output "certificate_name" {
  value = module.edge_environment.certificate_name
}

output "certificate_map_name" {
  value = module.edge_environment.certificate_map_name
}

output "https_proxy_name" {
  value = module.edge_environment.https_proxy_name
}

output "https_forwarding_rule_name" {
  value = module.edge_environment.https_forwarding_rule_name
}

output "candidate_serverless_neg_name" {
  value = module.edge_environment.candidate_serverless_neg_name
}

output "candidate_backend_service_name" {
  value = module.edge_environment.candidate_backend_service_name
}

output "candidate_smoke_public_path" {
  value = module.edge_environment.candidate_smoke_public_path
}

output "candidate_smoke_backend_path" {
  value = module.edge_environment.candidate_smoke_backend_path
}
