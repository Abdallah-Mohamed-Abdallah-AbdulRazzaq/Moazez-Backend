output "migration_job_service_account_email" {
  value = google_service_account.runtime["migration_job"].email
}

output "maintenance_scheduler_service_account_email" {
  value = google_service_account.runtime["maintenance_scheduler"].email
}

output "runtime_service_account_emails" {
  value = merge(
    {
      for logical_key, account_id in var.existing_runtime_service_account_ids :
      logical_key => format("%s@%s.iam.gserviceaccount.com", account_id, var.project_id)
    },
    {
      for logical_key, service_account in google_service_account.runtime :
      logical_key => service_account.email
    },
  )
}
