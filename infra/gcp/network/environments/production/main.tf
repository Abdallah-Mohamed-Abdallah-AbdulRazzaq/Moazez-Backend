locals {
  production_network = {
    vpc_name                   = "moazez-production-vpc"
    runtime_subnet_name        = "moazez-production-runtime-me-central2"
    runtime_subnet_cidr        = "10.60.0.0/24"
    psa_range_name             = "moazez-production-psa"
    psa_address                = "10.61.0.0"
    psa_prefix_length          = 16
    service_networking_service = "servicenetworking.googleapis.com"
    deletion_policy            = "PREVENT"
  }
}

module "network_environment" {
  source = "../../modules/network-environment"

  project_id                 = var.project_id
  environment                = var.environment
  region                     = var.region
  vpc_name                   = local.production_network.vpc_name
  runtime_subnet_name        = local.production_network.runtime_subnet_name
  runtime_subnet_cidr        = local.production_network.runtime_subnet_cidr
  psa_range_name             = local.production_network.psa_range_name
  psa_address                = local.production_network.psa_address
  psa_prefix_length          = local.production_network.psa_prefix_length
  service_networking_service = local.production_network.service_networking_service
  deletion_policy            = local.production_network.deletion_policy
}
