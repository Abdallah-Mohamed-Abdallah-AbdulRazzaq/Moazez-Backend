locals {
  staging_network = {
    vpc_name                   = "moazez-staging-vpc"
    runtime_subnet_name        = "moazez-staging-runtime-me-central2"
    runtime_subnet_cidr        = "10.70.0.0/24"
    psa_range_name             = "moazez-staging-psa"
    psa_address                = "10.71.0.0"
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
  vpc_name                   = local.staging_network.vpc_name
  runtime_subnet_name        = local.staging_network.runtime_subnet_name
  runtime_subnet_cidr        = local.staging_network.runtime_subnet_cidr
  psa_range_name             = local.staging_network.psa_range_name
  psa_address                = local.staging_network.psa_address
  psa_prefix_length          = local.staging_network.psa_prefix_length
  service_networking_service = local.staging_network.service_networking_service
  deletion_policy            = local.staging_network.deletion_policy
}
