locals {
  existing_runtime_service_account_members = {
    for logical_key, account_id in var.existing_runtime_service_account_ids :
    logical_key => format(
      "serviceAccount:%s@%s.iam.gserviceaccount.com",
      account_id,
      var.project_id,
    )
  }

  managed_runtime_service_account_members = {
    for logical_key, service_account in google_service_account.runtime :
    logical_key => service_account.member
  }

  runtime_service_account_members = merge(
    local.existing_runtime_service_account_members,
    local.managed_runtime_service_account_members,
  )
}

resource "google_service_account" "runtime" {
  for_each = var.managed_runtime_service_accounts

  project         = var.project_id
  account_id      = each.value.account_id
  display_name    = each.value.display_name
  deletion_policy = "PREVENT"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret_iam_member" "secret_accessor" {
  for_each = var.secret_access_grants

  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = local.runtime_service_account_members[each.value.runtime_identity_key]
}
