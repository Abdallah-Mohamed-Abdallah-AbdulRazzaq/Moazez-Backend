# The repository must be created and verified by the Artifact Registry stack first.
# All four approved frontend WIF identities can assume this existing shared builder.
resource "google_artifact_registry_repository_iam_member" "teacher_web_artifact_writer" {
  project    = "moazez-production"
  location   = "me-central2"
  repository = "moazez-production-teacher-web"
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${module.frontend_artifact_identity_environment.builder_service_account_email}"
}
