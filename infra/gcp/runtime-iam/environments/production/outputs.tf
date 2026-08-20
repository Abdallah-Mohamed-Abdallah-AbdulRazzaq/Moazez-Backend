output "migration_job_service_account_email" {
  value = module.runtime_iam_environment.migration_job_service_account_email
}

output "maintenance_scheduler_service_account_email" {
  value = module.runtime_iam_environment.maintenance_scheduler_service_account_email
}

output "runtime_service_account_emails" {
  value = module.runtime_iam_environment.runtime_service_account_emails
}
