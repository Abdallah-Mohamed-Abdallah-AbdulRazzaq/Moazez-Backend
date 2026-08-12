output "project_id" {
  value = module.network_environment.project_id
}

output "environment" {
  value = module.network_environment.environment
}

output "region" {
  value = module.network_environment.region
}

output "vpc_name" {
  value = module.network_environment.vpc_name
}

output "vpc_id" {
  value = module.network_environment.vpc_id
}

output "vpc_self_link" {
  value = module.network_environment.vpc_self_link
}

output "runtime_subnet_name" {
  value = module.network_environment.runtime_subnet_name
}

output "runtime_subnet_id" {
  value = module.network_environment.runtime_subnet_id
}

output "runtime_subnet_self_link" {
  value = module.network_environment.runtime_subnet_self_link
}

output "runtime_subnet_cidr" {
  value = module.network_environment.runtime_subnet_cidr
}

output "psa_range_name" {
  value = module.network_environment.psa_range_name
}

output "psa_address" {
  value = module.network_environment.psa_address
}

output "psa_prefix_length" {
  value = module.network_environment.psa_prefix_length
}

output "psa_cidr" {
  value = module.network_environment.psa_cidr
}

output "service_networking_service" {
  value = module.network_environment.service_networking_service
}

output "service_networking_network" {
  value = module.network_environment.service_networking_network
}

output "service_networking_reserved_ranges" {
  value = module.network_environment.service_networking_reserved_ranges
}

output "service_networking_peering" {
  value = module.network_environment.service_networking_peering
}
