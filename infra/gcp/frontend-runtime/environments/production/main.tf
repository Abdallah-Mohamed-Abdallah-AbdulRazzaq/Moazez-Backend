module "frontend_runtime_environment" {
  source = "../../modules/frontend-runtime-environment"

  project_id   = "moazez-production"
  region       = "me-central2"
  environment  = "production"
  iac_deployer = "moazez-iac-deployer@moazez-production.iam.gserviceaccount.com"

  platform_admin_runtime_service_account_id   = "moazez-platform-admin-runtime"
  school_dashboard_runtime_service_account_id = "moazez-school-ui-runtime"
  student_web_runtime_service_account_id      = "moazez-student-web-runtime"
  teacher_web_runtime_service_account_id      = "moazez-teacher-web-runtime"
  platform_admin_service_name                 = "moazez-production-platform-admin"
  school_dashboard_service_name               = "moazez-production-school-dashboard"
  student_web_service_name                    = "moazez-production-student-web"
  teacher_web_service_name                    = "moazez-production-teacher-web"

  platform_admin_image   = var.platform_admin_image
  school_dashboard_image = var.school_dashboard_image
  student_web_image      = var.student_web_image
  teacher_web_image      = var.teacher_web_image
}
