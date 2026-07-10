-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_type" AS ENUM ('PLATFORM_USER', 'ORGANIZATION_USER', 'SCHOOL_USER', 'TEACHER', 'PARENT', 'STUDENT', 'APPLICANT', 'PICKUP_DELEGATE', 'DISMISSAL_STAFF', 'SERVICE_ACCOUNT');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "organization_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "school_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "school_entitlement_status" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "school_feature_control_source" AS ENUM ('PLATFORM', 'ENTITLEMENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "dismissal_gate_operational_status" AS ENUM ('OPEN', 'BUSY', 'CLOSED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "dismissal_request_status" AS ENUM ('REQUESTED', 'QUEUED', 'CALLED', 'MOVING', 'AT_GATE', 'READY', 'HANDED_OVER', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "dismissal_request_event_type" AS ENUM ('REQUEST_CREATED', 'REQUEST_STATUS_CHANGED', 'REQUEST_ESCALATED');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "school_login_settings_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "school_email_provider_type" AS ENUM ('SMTP', 'SENDGRID', 'MAILGUN', 'SES', 'CUSTOM');

-- CreateEnum
CREATE TYPE "school_email_connection_status" AS ENUM ('DRAFT', 'VERIFIED', 'ACTIVE', 'DISABLED', 'FAILED');

-- CreateEnum
CREATE TYPE "school_email_template_key" AS ENUM ('ACCOUNT_CREDENTIALS', 'PASSWORD_RESET', 'GENERAL_MESSAGE');

-- CreateEnum
CREATE TYPE "school_email_delivery_kind" AS ENUM ('CREDENTIAL_DELIVERY', 'GENERAL_CAMPAIGN');

-- CreateEnum
CREATE TYPE "school_email_delivery_batch_status" AS ENUM ('DRAFT', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'PARTIAL_FAILED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "school_email_delivery_recipient_status" AS ENUM ('PENDING', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "school_email_delivery_recipient_type" AS ENUM ('USER', 'CUSTOM_EMAIL');

-- CreateEnum
CREATE TYPE "audit_outcome" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "file_visibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "notification_template_status" AS ENUM ('ACTIVE', 'DRAFT');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('EMAIL', 'SMS', 'IN_APP');

-- CreateEnum
CREATE TYPE "integration_connection_status" AS ENUM ('CONNECTED', 'DISCONNECTED', 'NEEDS_ATTENTION');

-- CreateEnum
CREATE TYPE "integration_field_type" AS ENUM ('TEXT', 'PASSWORD', 'URL', 'EMAIL', 'SELECT');

-- CreateEnum
CREATE TYPE "backup_job_status" AS ENUM ('COMPLETED', 'RUNNING', 'FAILED');

-- CreateEnum
CREATE TYPE "backup_job_type" AS ENUM ('BACKUP', 'EXPORT', 'IMPORT', 'MIGRATION');

-- CreateEnum
CREATE TYPE "import_job_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "lead_channel" AS ENUM ('IN_APP', 'REFERRAL', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "admission_application_status" AS ENUM ('SUBMITTED', 'DOCUMENTS_PENDING', 'UNDER_REVIEW', 'ACCEPTED', 'WAITLISTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "admission_application_source" AS ENUM ('IN_APP', 'REFERRAL', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "admission_document_status" AS ENUM ('COMPLETE', 'MISSING', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "placement_test_status" AS ENUM ('SCHEDULED', 'COMPLETED', 'FAILED', 'CANCELLED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "interview_status" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "admission_decision_type" AS ENUM ('ACCEPT', 'WAITLIST', 'REJECT');

-- CreateEnum
CREATE TYPE "applicant_admission_request_status" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "applicant_admission_request_document_status" AS ENUM ('UPLOADED', 'NEEDS_REPLACEMENT', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "student_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "student_enrollment_status" AS ENUM ('ACTIVE', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "student_document_status" AS ENUM ('COMPLETE', 'MISSING');

-- CreateEnum
CREATE TYPE "student_profile_correction_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "student_note_category" AS ENUM ('BEHAVIOR', 'ACADEMIC', 'ATTENDANCE', 'GENERAL');

-- CreateEnum
CREATE TYPE "attendance_scope_type" AS ENUM ('SCHOOL', 'STAGE', 'GRADE', 'SECTION', 'CLASSROOM');

-- CreateEnum
CREATE TYPE "attendance_mode" AS ENUM ('DAILY', 'PERIOD');

-- CreateEnum
CREATE TYPE "daily_computation_strategy" AS ENUM ('MANUAL', 'DERIVED_FROM_PERIODS');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'EARLY_LEAVE', 'UNMARKED');

-- CreateEnum
CREATE TYPE "attendance_session_status" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "attendance_excuse_type" AS ENUM ('ABSENCE', 'LATE', 'EARLY_LEAVE');

-- CreateEnum
CREATE TYPE "attendance_excuse_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "grade_scope_type" AS ENUM ('SCHOOL', 'STAGE', 'GRADE', 'SECTION', 'CLASSROOM');

-- CreateEnum
CREATE TYPE "grade_assessment_type" AS ENUM ('QUIZ', 'MONTH_EXAM', 'MIDTERM', 'TERM_EXAM', 'ASSIGNMENT', 'FINAL', 'PRACTICAL');

-- CreateEnum
CREATE TYPE "grade_assessment_delivery_mode" AS ENUM ('SCORE_ONLY', 'QUESTION_BASED');

-- CreateEnum
CREATE TYPE "grade_assessment_approval_status" AS ENUM ('DRAFT', 'PUBLISHED', 'APPROVED');

-- CreateEnum
CREATE TYPE "grade_question_type" AS ENUM ('MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY', 'FILL_IN_BLANK', 'MATCHING', 'MEDIA');

-- CreateEnum
CREATE TYPE "grade_submission_status" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "grade_answer_correction_status" AS ENUM ('PENDING', 'CORRECTED');

-- CreateEnum
CREATE TYPE "grade_item_status" AS ENUM ('ENTERED', 'MISSING', 'ABSENT');

-- CreateEnum
CREATE TYPE "grade_rule_scale" AS ENUM ('PERCENTAGE');

-- CreateEnum
CREATE TYPE "grade_rounding_mode" AS ENUM ('NONE', 'DECIMAL_0', 'DECIMAL_1', 'DECIMAL_2');

-- CreateEnum
CREATE TYPE "homework_assignment_mode" AS ENUM ('HOMEWORK', 'WORKSHEET', 'WRITING_TASK', 'QUIZ', 'READING', 'PROJECT');

-- CreateEnum
CREATE TYPE "homework_assignment_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "homework_target_mode" AS ENUM ('CLASSROOM', 'SELECTED_STUDENTS');

-- CreateEnum
CREATE TYPE "homework_target_status" AS ENUM ('ASSIGNED', 'VIEWED', 'SUBMITTED', 'LATE', 'MISSING', 'REVIEWED', 'EXCUSED');

-- CreateEnum
CREATE TYPE "homework_submission_status" AS ENUM ('DRAFT', 'SUBMITTED', 'LATE', 'REVIEWED');

-- CreateEnum
CREATE TYPE "homework_question_type" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "reinforcement_source" AS ENUM ('TEACHER', 'PARENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "reinforcement_task_status" AS ENUM ('NOT_COMPLETED', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "reinforcement_target_scope" AS ENUM ('SCHOOL', 'STAGE', 'GRADE', 'SECTION', 'CLASSROOM', 'STUDENT');

-- CreateEnum
CREATE TYPE "reinforcement_proof_type" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'NONE');

-- CreateEnum
CREATE TYPE "reinforcement_reward_type" AS ENUM ('MORAL', 'FINANCIAL', 'XP', 'BADGE');

-- CreateEnum
CREATE TYPE "reinforcement_submission_status" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "reinforcement_review_outcome" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "reward_catalog_item_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "reward_catalog_item_type" AS ENUM ('PHYSICAL', 'DIGITAL', 'PRIVILEGE', 'CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "reward_redemption_status" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "reward_redemption_request_source" AS ENUM ('DASHBOARD', 'TEACHER', 'STUDENT_APP', 'PARENT_APP', 'SYSTEM');

-- CreateEnum
CREATE TYPE "xp_source_type" AS ENUM ('REINFORCEMENT_TASK', 'HERO_MISSION', 'MANUAL_BONUS', 'BEHAVIOR', 'GRADE', 'ATTENDANCE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "hero_mission_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "hero_mission_objective_type" AS ENUM ('MANUAL', 'LESSON', 'QUIZ', 'ASSESSMENT', 'TASK', 'CUSTOM');

-- CreateEnum
CREATE TYPE "hero_mission_progress_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "hero_journey_event_type" AS ENUM ('MISSION_STARTED', 'OBJECTIVE_COMPLETED', 'MISSION_COMPLETED', 'BADGE_AWARDED', 'XP_GRANTED');

-- CreateEnum
CREATE TYPE "behavior_record_type" AS ENUM ('POSITIVE', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "behavior_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "behavior_record_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "behavior_point_ledger_entry_type" AS ENUM ('AWARD', 'PENALTY', 'REVERSAL');

-- CreateEnum
CREATE TYPE "communication_conversation_type" AS ENUM ('DIRECT', 'GROUP', 'CLASSROOM', 'GRADE', 'SECTION', 'STAGE', 'SCHOOL_WIDE', 'SUPPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "communication_conversation_status" AS ENUM ('ACTIVE', 'ARCHIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "communication_participant_role" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'MEMBER', 'READ_ONLY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "communication_participant_status" AS ENUM ('ACTIVE', 'INVITED', 'LEFT', 'REMOVED', 'MUTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "communication_invite_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "communication_join_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "communication_message_kind" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'SYSTEM');

-- CreateEnum
CREATE TYPE "communication_message_status" AS ENUM ('SENT', 'HIDDEN', 'DELETED');

-- CreateEnum
CREATE TYPE "communication_delivery_status" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "communication_report_status" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "communication_moderation_action_type" AS ENUM ('MESSAGE_HIDDEN', 'MESSAGE_UNHIDDEN', 'MESSAGE_DELETED', 'USER_MUTED', 'USER_UNMUTED', 'USER_RESTRICTED', 'USER_UNRESTRICTED', 'USER_BLOCKED', 'USER_UNBLOCKED', 'CONVERSATION_LOCKED', 'CONVERSATION_UNLOCKED', 'PARTICIPANT_REMOVED', 'REPORT_RESOLVED');

-- CreateEnum
CREATE TYPE "communication_student_direct_mode" AS ENUM ('DISABLED', 'SAME_CLASSROOM', 'SAME_GRADE', 'SAME_SCHOOL', 'ANY_SCHOOL_USER', 'APPROVAL_REQUIRED');

-- CreateEnum
CREATE TYPE "communication_restriction_type" AS ENUM ('MUTE', 'SEND_DISABLED', 'GROUP_CREATE_DISABLED', 'DIRECT_MESSAGE_DISABLED');

-- CreateEnum
CREATE TYPE "communication_announcement_status" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "communication_announcement_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "communication_announcement_audience_type" AS ENUM ('SCHOOL', 'STAGE', 'GRADE', 'SECTION', 'CLASSROOM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "communication_notification_status" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "communication_notification_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "communication_notification_source_module" AS ENUM ('COMMUNICATION', 'ANNOUNCEMENTS', 'ATTENDANCE', 'GRADES', 'BEHAVIOR', 'REINFORCEMENT', 'ADMISSIONS', 'STUDENTS', 'DISMISSAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "communication_notification_type" AS ENUM ('ANNOUNCEMENT_PUBLISHED', 'MESSAGE_RECEIVED', 'MESSAGE_MENTION', 'ATTENDANCE_ABSENCE', 'ATTENDANCE_LATE', 'ATTENDANCE_EARLY_LEAVE', 'GRADE_POSTED', 'BEHAVIOR_RECORD_CREATED', 'REINFORCEMENT_REWARD_GRANTED', 'DISMISSAL_REQUEST_CREATED', 'DISMISSAL_REQUEST_CANCELLED', 'DISMISSAL_REQUEST_CALLED', 'DISMISSAL_REQUEST_READY', 'DISMISSAL_REQUEST_HANDED_OVER', 'DISMISSAL_REQUEST_EXPIRED', 'SYSTEM_ALERT');

-- CreateEnum
CREATE TYPE "communication_notification_preference_category" AS ENUM ('MESSAGE_RECEIVED', 'ANNOUNCEMENT', 'ATTENDANCE');

-- CreateEnum
CREATE TYPE "communication_notification_delivery_channel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "communication_notification_delivery_status" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "app_device_token_platform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "app_device_token_surface" AS ENUM ('PARENT', 'STUDENT', 'TEACHER', 'DISMISSAL_STAFF');

-- CreateEnum
CREATE TYPE "academic_calendar_event_type" AS ENUM ('HOLIDAY', 'EXAM', 'ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "academic_calendar_event_scope_type" AS ENUM ('SCHOOL', 'STAGE', 'GRADE', 'SECTION');

-- CreateEnum
CREATE TYPE "curriculum_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "lesson_content_item_type" AS ENUM ('TEXT', 'FILE', 'VIDEO_LINK', 'EXTERNAL_LINK');

-- CreateEnum
CREATE TYPE "lesson_plan_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "lesson_plan_item_status" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "timetable_scope_type" AS ENUM ('TERM', 'GRADE', 'SECTION', 'CLASSROOM');

-- CreateEnum
CREATE TYPE "timetable_config_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "timetable_period_type" AS ENUM ('CLASS', 'BREAK', 'ASSEMBLY', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "timetable_entry_status" AS ENUM ('DRAFT', 'ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "timetable_publication_status" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "timetable_conflict_type" AS ENUM ('TEACHER', 'ROOM', 'CLASSROOM_SLOT', 'PERIOD_OVERLAP');

-- CreateEnum
CREATE TYPE "timetable_conflict_severity" AS ENUM ('BLOCKING', 'WARNING');

-- CreateEnum
CREATE TYPE "timetable_conflict_status" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "organization_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "school_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_entitlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "school_entitlement_status" NOT NULL DEFAULT 'TRIAL',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "student_seat_limit" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_feature_controls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "feature_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "source" "school_feature_control_source" NOT NULL DEFAULT 'PLATFORM',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_feature_controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "username" TEXT,
    "contact_email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "user_type" "user_type" NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" TIMESTAMP(3),
    "password_provisioned_at" TIMESTAMP(3),
    "credential_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applicant_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "phone_number" VARCHAR(50),
    "city" VARCHAR(120),
    "relationship" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applicant_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "school_id" UUID,
    "role_id" UUID NOT NULL,
    "user_type" "user_type" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_school_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "school_name" TEXT,
    "short_name" TEXT,
    "timezone" TEXT,
    "address_line" TEXT,
    "formatted_address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "footer_signature" TEXT,
    "logo_url" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "map_place_label" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_school_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_security_controls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "enforce_two_factor" BOOLEAN NOT NULL DEFAULT false,
    "ip_allowlist_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ip_allowlist" TEXT,
    "session_timeout_minutes" INTEGER NOT NULL DEFAULT 30,
    "suspicious_login_alerts" BOOLEAN NOT NULL DEFAULT true,
    "password_min_length" INTEGER NOT NULL DEFAULT 10,
    "password_rotation_days" INTEGER NOT NULL DEFAULT 90,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_security_controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_school_login_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "login_domain" TEXT NOT NULL,
    "username_min_length" INTEGER NOT NULL DEFAULT 3,
    "username_max_length" INTEGER NOT NULL DEFAULT 40,
    "allowed_characters" TEXT,
    "reserved_usernames" JSONB,
    "status" "school_login_settings_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_school_login_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_school_email_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "provider_type" "school_email_provider_type" NOT NULL DEFAULT 'SMTP',
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "reply_to_email" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "encrypted_password" TEXT,
    "encrypted_api_key" TEXT,
    "status" "school_email_connection_status" NOT NULL DEFAULT 'DRAFT',
    "last_tested_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_school_email_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_school_email_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "key" "school_email_template_key" NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "title" TEXT,
    "subtitle" TEXT,
    "body_html" TEXT NOT NULL,
    "body_text" TEXT,
    "footer_html" TEXT,
    "logo_file_id" UUID,
    "support_email" TEXT,
    "support_phone" TEXT,
    "social_links" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_school_email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_school_email_delivery_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "kind" "school_email_delivery_kind" NOT NULL,
    "status" "school_email_delivery_batch_status" NOT NULL DEFAULT 'DRAFT',
    "template_key" "school_email_template_key",
    "subject_snapshot" TEXT,
    "created_by_user_id" UUID,
    "recipient_scope" JSONB,
    "preview_data" JSONB,
    "campaign_content" JSONB,
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "queued_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_school_email_delivery_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_school_email_delivery_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "recipient_type" "school_email_delivery_recipient_type" NOT NULL,
    "user_id" UUID,
    "to_email" TEXT NOT NULL,
    "display_name" TEXT,
    "status" "school_email_delivery_recipient_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "skipped_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_school_email_delivery_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_notification_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "notification_template_status" NOT NULL DEFAULT 'DRAFT',
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" TEXT,
    "title_ar" TEXT,
    "message" TEXT,
    "message_ar" TEXT,
    "email_subject" TEXT,
    "email_subject_ar" TEXT,
    "sms_message" TEXT,
    "sms_message_ar" TEXT,
    "priority" TEXT,
    "stage" TEXT,
    "last_test_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_notification_template_channel_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "notification_template_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_notification_template_channel_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_integration_providers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_integration_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_integration_provider_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integration_provider_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "integration_field_type" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "placeholder" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_integration_provider_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_integration_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "integration_provider_id" UUID NOT NULL,
    "status" "integration_connection_status" NOT NULL DEFAULT 'DISCONNECTED',
    "configuration" JSONB,
    "configuration_updated_at" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "last_test_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "health_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_backup_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "type" "backup_job_type" NOT NULL,
    "status" "backup_job_status" NOT NULL DEFAULT 'RUNNING',
    "file_name" TEXT NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_backup_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dismissal_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Cairo',
    "school_latitude" DECIMAL(9,6),
    "school_longitude" DECIMAL(9,6),
    "allowed_radius_meters" INTEGER NOT NULL DEFAULT 150,
    "request_window_start_local" VARCHAR(5),
    "request_window_end_local" VARCHAR(5),
    "delay_threshold_minutes" INTEGER NOT NULL DEFAULT 15,
    "urgent_threshold_minutes" INTEGER NOT NULL DEFAULT 30,
    "expiry_threshold_minutes" INTEGER NOT NULL DEFAULT 180,
    "require_pickup_code" BOOLEAN NOT NULL DEFAULT true,
    "allow_delegate_pickup" BOOLEAN NOT NULL DEFAULT true,
    "allow_parent_cancel_before_called" BOOLEAN NOT NULL DEFAULT true,
    "default_gate_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dismissal_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dismissal_gates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "campus" VARCHAR(160),
    "status" "dismissal_gate_operational_status" NOT NULL DEFAULT 'CLOSED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "waiting_zones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dismissal_gates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dismissal_staff_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "gate_id" UUID,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dismissal_staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dismissal_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "gate_id" UUID NOT NULL,
    "status" "dismissal_request_status" NOT NULL DEFAULT 'REQUESTED',
    "client_request_id" VARCHAR(120),
    "parent_latitude" DECIMAL(9,6) NOT NULL,
    "parent_longitude" DECIMAL(9,6) NOT NULL,
    "distance_meters" INTEGER,
    "geofence_passed" BOOLEAN NOT NULL DEFAULT false,
    "pickup_code_hash" VARCHAR(255),
    "pickup_code_salt" VARCHAR(64),
    "pickup_code_issued_at" TIMESTAMP(3),
    "pickup_code_verified_at" TIMESTAMP(3),
    "handed_over_at" TIMESTAMP(3),
    "handed_over_by_id" UUID,
    "handover_receiver_name" VARCHAR(120),
    "handover_receiver_relation" VARCHAR(80),
    "handover_note" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dismissal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dismissal_request_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "type" "dismissal_request_event_type" NOT NULL,
    "actor_user_id" UUID,
    "status_from" "dismissal_request_status",
    "status_to" "dismissal_request_status",
    "note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dismissal_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_name" TEXT NOT NULL,
    "primary_contact_name" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "channel" "lead_channel" NOT NULL,
    "status" "lead_status" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "owner_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lead_id" UUID,
    "student_name" TEXT NOT NULL,
    "requested_academic_year_id" UUID,
    "requested_grade_id" UUID,
    "status" "admission_application_status" NOT NULL DEFAULT 'SUBMITTED',
    "source" "admission_application_source" NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applicant_admission_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "applicant_user_id" UUID NOT NULL,
    "applicant_profile_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "requested_academic_year_id" UUID,
    "requested_grade_id" UUID,
    "child_first_name" VARCHAR(100) NOT NULL,
    "child_last_name" VARCHAR(100),
    "child_full_name" VARCHAR(220) NOT NULL,
    "child_date_of_birth" DATE,
    "child_gender" VARCHAR(40),
    "child_nationality" VARCHAR(80),
    "previous_school" VARCHAR(180),
    "notes" TEXT,
    "status" "applicant_admission_request_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "application_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "applicant_admission_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_required_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "grade_id" UUID,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "accepted_file_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_files" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_required_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_workflow_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "requires_placement_test" BOOLEAN NOT NULL DEFAULT true,
    "requires_interview" BOOLEAN NOT NULL DEFAULT true,
    "allow_direct_acceptance" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_workflow_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_application_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "status" "admission_document_status" NOT NULL DEFAULT 'MISSING',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applicant_admission_request_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "applicant_user_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "required_document_id" UUID,
    "application_document_id" UUID,
    "file_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "document_type" VARCHAR(120) NOT NULL,
    "status" "applicant_admission_request_document_status" NOT NULL DEFAULT 'UPLOADED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "applicant_admission_request_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_tests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "subject_id" UUID,
    "type" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "score" DECIMAL(5,2),
    "result" TEXT,
    "status" "placement_test_status" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_interviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "interviewer_user_id" UUID,
    "status" "interview_status" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "decision" "admission_decision_type" NOT NULL,
    "reason" TEXT,
    "decided_by_user_id" UUID NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classrooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "room_id" UUID,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "code" TEXT,
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "weekly_hours" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "subject_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subject_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_subject_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "capacity" INTEGER,
    "floor" TEXT,
    "building" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_calendar_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "type" "academic_calendar_event_type" NOT NULL,
    "scope_type" "academic_calendar_event_scope_type" NOT NULL,
    "scope_key" UUID,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "all_day" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "deleted_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "academic_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curricula" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "curriculum_status" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "estimated_lessons" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_lessons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "objectives" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "estimated_minutes" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_content_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "type" "lesson_content_item_type" NOT NULL,
    "title" TEXT NOT NULL,
    "body_text" TEXT,
    "url" TEXT,
    "file_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "estimated_minutes" INTEGER,
    "metadata" JSONB,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "teacher_subject_allocation_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "lesson_plan_status" NOT NULL DEFAULT 'DRAFT',
    "week_start_date" DATE NOT NULL,
    "week_end_date" DATE NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "activated_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plan_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "lesson_plan_id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "timetable_entry_id" UUID,
    "planned_date" DATE,
    "day_of_week" INTEGER,
    "period_id" UUID,
    "period_label" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "lesson_plan_item_status" NOT NULL DEFAULT 'PLANNED',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "rescheduled_from_item_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "week_start_day" INTEGER NOT NULL DEFAULT 0,
    "active_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "scope_type" "timetable_scope_type" NOT NULL DEFAULT 'TERM',
    "scope_key" TEXT NOT NULL,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "status" "timetable_config_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "timetable_config_id" UUID NOT NULL,
    "period_index" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "type" "timetable_period_type" NOT NULL DEFAULT 'CLASS',
    "is_instructional" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "timetable_config_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "grade_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "teacher_subject_allocation_id" UUID NOT NULL,
    "room_id" UUID,
    "notes" TEXT,
    "status" "timetable_entry_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "timetable_config_id" UUID NOT NULL,
    "status" "timetable_publication_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "published_by_user_id" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_conflicts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "timetable_config_id" UUID NOT NULL,
    "entry_id" UUID,
    "related_entry_id" UUID,
    "conflict_type" "timetable_conflict_type" NOT NULL,
    "severity" "timetable_conflict_severity" NOT NULL DEFAULT 'BLOCKING',
    "status" "timetable_conflict_status" NOT NULL DEFAULT 'OPEN',
    "day_of_week" INTEGER,
    "period_id" UUID,
    "teacher_user_id" UUID,
    "room_id" UUID,
    "message" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "application_id" UUID,
    "user_id" UUID,
    "avatar_file_id" UUID,
    "first_name" TEXT NOT NULL,
    "father_name_en" TEXT,
    "grandfather_name_en" TEXT,
    "last_name" TEXT NOT NULL,
    "first_name_ar" TEXT,
    "father_name_ar" TEXT,
    "grandfather_name_ar" TEXT,
    "family_name_ar" TEXT,
    "birth_date" DATE,
    "gender" TEXT,
    "nationality" TEXT,
    "address_line" TEXT,
    "city" TEXT,
    "district" TEXT,
    "student_phone" TEXT,
    "student_email" TEXT,
    "status" "student_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_secondary" TEXT,
    "email" TEXT,
    "national_id" TEXT,
    "job_title" TEXT,
    "workplace" TEXT,
    "relation" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "can_pickup" BOOLEAN,
    "can_receive_notifications" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardian_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_guardian_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID,
    "classroom_id" UUID NOT NULL,
    "status" "student_enrollment_status" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "exit_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "status" "student_document_status" NOT NULL DEFAULT 'MISSING',
    "notes" TEXT,
    "source_application_id" UUID,
    "source_application_document_id" UUID,
    "source_applicant_request_document_id" UUID,
    "imported_at" TIMESTAMP(3),
    "imported_by" UUID,
    "source_document_type" TEXT,
    "source_review_status" TEXT,
    "source_notes" TEXT,
    "source_file_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profile_correction_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "requested_by_user_id" UUID,
    "requested_by_type" TEXT NOT NULL,
    "status" "student_profile_correction_request_status" NOT NULL DEFAULT 'PENDING',
    "requested_changes" JSONB NOT NULL,
    "current_snapshot" JSONB,
    "reason" TEXT,
    "reviewer_note" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "rejected_at" TIMESTAMP(3),
    "rejected_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "student_profile_correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_medical_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "blood_type" TEXT,
    "allergies" TEXT,
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "medications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emergency_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_medical_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "category" "student_note_category",
    "author_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "scope_type" "attendance_scope_type" NOT NULL,
    "scope_key" TEXT NOT NULL,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description_ar" TEXT,
    "description_en" TEXT,
    "notes" TEXT,
    "mode" "attendance_mode" NOT NULL,
    "daily_computation_strategy" "daily_computation_strategy" NOT NULL DEFAULT 'MANUAL',
    "selected_period_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "late_threshold_minutes" INTEGER,
    "early_leave_threshold_minutes" INTEGER,
    "auto_absent_after_minutes" INTEGER,
    "absent_if_missed_periods_count" INTEGER,
    "require_excuse_attachment" BOOLEAN NOT NULL DEFAULT false,
    "require_excuse_reason" BOOLEAN NOT NULL DEFAULT false,
    "allow_parent_excuse_requests" BOOLEAN NOT NULL DEFAULT true,
    "notify_guardians_on_absence" BOOLEAN NOT NULL DEFAULT true,
    "notify_teachers" BOOLEAN NOT NULL DEFAULT false,
    "notify_students" BOOLEAN NOT NULL DEFAULT false,
    "notify_on_late" BOOLEAN NOT NULL DEFAULT false,
    "notify_on_early_leave" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" DATE,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "scope_type" "attendance_scope_type" NOT NULL,
    "scope_key" TEXT NOT NULL,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "mode" "attendance_mode" NOT NULL,
    "period_id" TEXT,
    "period_key" TEXT NOT NULL,
    "period_label_ar" TEXT,
    "period_label_en" TEXT,
    "policy_id" UUID,
    "status" "attendance_session_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "submitted_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "status" "attendance_status" NOT NULL DEFAULT 'UNMARKED',
    "late_minutes" INTEGER,
    "early_leave_minutes" INTEGER,
    "excuse_reason" TEXT,
    "note" TEXT,
    "marked_by_id" UUID,
    "marked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_excuse_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "attendance_excuse_type" NOT NULL,
    "status" "attendance_excuse_status" NOT NULL DEFAULT 'PENDING',
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "selected_period_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "late_minutes" INTEGER,
    "early_leave_minutes" INTEGER,
    "reason_ar" TEXT,
    "reason_en" TEXT,
    "decision_note" TEXT,
    "created_by_id" UUID,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "attendance_excuse_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_excuse_request_sessions" (
    "school_id" UUID NOT NULL,
    "attendance_excuse_request_id" UUID NOT NULL,
    "attendance_session_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_excuse_request_sessions_pkey" PRIMARY KEY ("attendance_excuse_request_id","attendance_session_id")
);

-- CreateTable
CREATE TABLE "grade_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "scope_type" "grade_scope_type" NOT NULL,
    "scope_key" UUID NOT NULL,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "title_en" TEXT,
    "title_ar" TEXT,
    "type" "grade_assessment_type" NOT NULL,
    "delivery_mode" "grade_assessment_delivery_mode" NOT NULL DEFAULT 'SCORE_ONLY',
    "date" DATE NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "max_score" DECIMAL(7,2) NOT NULL,
    "expected_time_minutes" INTEGER,
    "approval_status" "grade_assessment_approval_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "locked_at" TIMESTAMP(3),
    "locked_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grade_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "score" DECIMAL(7,2),
    "status" "grade_item_status" NOT NULL DEFAULT 'MISSING',
    "comment" TEXT,
    "entered_by_id" UUID,
    "entered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_assessment_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "type" "grade_question_type" NOT NULL,
    "prompt" TEXT NOT NULL,
    "prompt_ar" TEXT,
    "explanation" TEXT,
    "explanation_ar" TEXT,
    "points" DECIMAL(8,2) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "answer_key" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grade_assessment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_assessment_question_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "label_ar" TEXT,
    "value" TEXT,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grade_assessment_question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "grade_submission_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "corrected_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "total_score" DECIMAL(8,2),
    "max_score" DECIMAL(8,2),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_submission_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "answer_text" TEXT,
    "answer_json" JSONB,
    "correction_status" "grade_answer_correction_status" NOT NULL DEFAULT 'PENDING',
    "awarded_points" DECIMAL(8,2),
    "max_points" DECIMAL(8,2),
    "reviewer_comment" TEXT,
    "reviewer_comment_ar" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_submission_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_submission_answer_options" (
    "school_id" UUID NOT NULL,
    "answer_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_submission_answer_options_pkey" PRIMARY KEY ("answer_id","option_id")
);

-- CreateTable
CREATE TABLE "grade_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "scope_type" "grade_scope_type" NOT NULL,
    "scope_key" UUID NOT NULL,
    "grade_id" UUID,
    "grading_scale" "grade_rule_scale" NOT NULL DEFAULT 'PERCENTAGE',
    "pass_mark" DECIMAL(5,2) NOT NULL,
    "rounding" "grade_rounding_mode" NOT NULL DEFAULT 'DECIMAL_2',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "teacher_subject_allocation_id" UUID NOT NULL,
    "timetable_entry_id" UUID,
    "schedule_date" DATE,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mode" "homework_assignment_mode" NOT NULL DEFAULT 'HOMEWORK',
    "status" "homework_assignment_status" NOT NULL DEFAULT 'DRAFT',
    "target_mode" "homework_target_mode" NOT NULL DEFAULT 'CLASSROOM',
    "publish_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "estimated_minutes" INTEGER,
    "total_marks" DECIMAL(7,2),
    "is_graded" BOOLEAN NOT NULL DEFAULT false,
    "grade_assessment_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "published_by_user_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "homework_target_status" NOT NULL DEFAULT 'ASSIGNED',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "excused_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "homework_target_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "homework_submission_status" NOT NULL DEFAULT 'DRAFT',
    "body_text" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" UUID,
    "review_note" TEXT,
    "awarded_marks" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "type" "homework_question_type" NOT NULL,
    "prompt" TEXT NOT NULL,
    "instructions" TEXT,
    "points" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "expected_answer" TEXT,
    "metadata" JSONB,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_submission_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_submission_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "homework_target_id" UUID NOT NULL,
    "homework_question_id" UUID NOT NULL,
    "text_answer" TEXT,
    "selected_option_ids" JSONB,
    "is_draft" BOOLEAN NOT NULL DEFAULT true,
    "teacher_comment" TEXT,
    "awarded_points" DECIMAL(7,2),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submission_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_submission_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_submission_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "homework_target_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submission_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_question_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_question_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_assignment_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_assignment_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "subject_id" UUID,
    "title_en" TEXT,
    "title_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "source" "reinforcement_source" NOT NULL,
    "status" "reinforcement_task_status" NOT NULL DEFAULT 'NOT_COMPLETED',
    "reward_type" "reinforcement_reward_type",
    "reward_value" DECIMAL(10,2),
    "reward_label_en" TEXT,
    "reward_label_ar" TEXT,
    "due_date" TIMESTAMP(3),
    "assigned_by_id" UUID,
    "assigned_by_name" TEXT,
    "created_by_id" UUID,
    "cancelled_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reinforcement_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_task_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "scope_type" "reinforcement_target_scope" NOT NULL,
    "scope_key" TEXT NOT NULL,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "student_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reinforcement_task_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "reinforcement_task_status" NOT NULL DEFAULT 'NOT_COMPLETED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reinforcement_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_task_stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "title_en" TEXT,
    "title_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "proof_type" "reinforcement_proof_type" NOT NULL DEFAULT 'NONE',
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reinforcement_task_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "reinforcement_submission_status" NOT NULL DEFAULT 'PENDING',
    "proof_file_id" UUID,
    "proof_text" TEXT,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMP(3),
    "current_review_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reinforcement_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "reviewed_by_id" UUID NOT NULL,
    "outcome" "reinforcement_review_outcome" NOT NULL,
    "note" TEXT,
    "note_ar" TEXT,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reinforcement_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_task_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "term_id" UUID,
    "name_en" TEXT,
    "name_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "source" "reinforcement_source" NOT NULL DEFAULT 'TEACHER',
    "reward_type" "reinforcement_reward_type",
    "reward_value" DECIMAL(10,2),
    "reward_label_en" TEXT,
    "reward_label_ar" TEXT,
    "metadata" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reinforcement_task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_task_template_stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "title_en" TEXT,
    "title_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "proof_type" "reinforcement_proof_type" NOT NULL DEFAULT 'NONE',
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reinforcement_task_template_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "scope_type" "reinforcement_target_scope" NOT NULL DEFAULT 'SCHOOL',
    "scope_key" TEXT NOT NULL,
    "daily_cap" INTEGER,
    "weekly_cap" INTEGER,
    "cooldown_minutes" INTEGER,
    "allowed_reasons" JSONB,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "xp_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "assignment_id" UUID,
    "policy_id" UUID,
    "source_type" "xp_source_type" NOT NULL,
    "source_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "reason_ar" TEXT,
    "actor_user_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xp_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_catalog_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "term_id" UUID,
    "title_en" TEXT,
    "title_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "type" "reward_catalog_item_type" NOT NULL DEFAULT 'OTHER',
    "status" "reward_catalog_item_status" NOT NULL DEFAULT 'DRAFT',
    "min_total_xp" INTEGER,
    "stock_quantity" INTEGER,
    "stock_remaining" INTEGER,
    "is_unlimited" BOOLEAN NOT NULL DEFAULT true,
    "image_file_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "archived_at" TIMESTAMP(3),
    "archived_by_id" UUID,
    "created_by_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reward_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_redemptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "catalog_item_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "academic_year_id" UUID,
    "term_id" UUID,
    "status" "reward_redemption_status" NOT NULL DEFAULT 'REQUESTED',
    "request_source" "reward_redemption_request_source" NOT NULL DEFAULT 'DASHBOARD',
    "requested_by_id" UUID,
    "reviewed_by_id" UUID,
    "fulfilled_by_id" UUID,
    "cancelled_by_id" UUID,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "request_note_en" TEXT,
    "request_note_ar" TEXT,
    "review_note_en" TEXT,
    "review_note_ar" TEXT,
    "fulfillment_note_en" TEXT,
    "fulfillment_note_ar" TEXT,
    "cancellation_reason_en" TEXT,
    "cancellation_reason_ar" TEXT,
    "eligibility_snapshot" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_badges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name_en" TEXT,
    "name_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "asset_path" TEXT,
    "file_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hero_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_missions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "subject_id" UUID,
    "linked_assessment_id" UUID,
    "linked_lesson_ref" TEXT,
    "title_en" TEXT,
    "title_ar" TEXT,
    "brief_en" TEXT,
    "brief_ar" TEXT,
    "required_level" INTEGER NOT NULL DEFAULT 1,
    "reward_xp" INTEGER NOT NULL DEFAULT 0,
    "badge_reward_id" UUID,
    "status" "hero_mission_status" NOT NULL DEFAULT 'DRAFT',
    "position_x" INTEGER,
    "position_y" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "archived_at" TIMESTAMP(3),
    "archived_by_id" UUID,
    "created_by_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hero_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_mission_objectives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "mission_id" UUID NOT NULL,
    "type" "hero_mission_objective_type" NOT NULL DEFAULT 'MANUAL',
    "title_en" TEXT,
    "title_ar" TEXT,
    "subtitle_en" TEXT,
    "subtitle_ar" TEXT,
    "linked_assessment_id" UUID,
    "linked_lesson_ref" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hero_mission_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_mission_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "mission_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "status" "hero_mission_progress_status" NOT NULL DEFAULT 'NOT_STARTED',
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "xp_ledger_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_mission_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_mission_objective_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "mission_progress_id" UUID NOT NULL,
    "objective_id" UUID NOT NULL,
    "completed_at" TIMESTAMP(3),
    "completed_by_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_mission_objective_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_student_badges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,
    "mission_id" UUID,
    "mission_progress_id" UUID,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_student_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_journey_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "mission_id" UUID,
    "mission_progress_id" UUID,
    "objective_id" UUID,
    "student_id" UUID,
    "enrollment_id" UUID,
    "xp_ledger_id" UUID,
    "badge_id" UUID,
    "type" "hero_journey_event_type" NOT NULL,
    "source_id" TEXT,
    "actor_user_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_journey_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT,
    "name_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "type" "behavior_record_type" NOT NULL,
    "default_severity" "behavior_severity" NOT NULL DEFAULT 'LOW',
    "default_points" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "behavior_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "category_id" UUID,
    "type" "behavior_record_type" NOT NULL,
    "severity" "behavior_severity" NOT NULL DEFAULT 'LOW',
    "status" "behavior_record_status" NOT NULL DEFAULT 'DRAFT',
    "title_en" TEXT,
    "title_ar" TEXT,
    "note_en" TEXT,
    "note_ar" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" UUID,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "review_note_en" TEXT,
    "review_note_ar" TEXT,
    "cancellation_reason_en" TEXT,
    "cancellation_reason_ar" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "behavior_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_point_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "record_id" UUID NOT NULL,
    "category_id" UUID,
    "entry_type" "behavior_point_ledger_entry_type" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason_en" TEXT,
    "reason_ar" TEXT,
    "actor_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "behavior_point_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "allow_direct_staff_to_staff" BOOLEAN NOT NULL DEFAULT true,
    "allow_admin_to_anyone" BOOLEAN NOT NULL DEFAULT true,
    "allow_teacher_to_parent" BOOLEAN NOT NULL DEFAULT true,
    "allow_teacher_to_student" BOOLEAN NOT NULL DEFAULT true,
    "allow_student_to_teacher" BOOLEAN NOT NULL DEFAULT true,
    "allow_student_to_student" BOOLEAN NOT NULL DEFAULT false,
    "student_direct_mode" "communication_student_direct_mode" NOT NULL DEFAULT 'DISABLED',
    "allow_teacher_created_groups" BOOLEAN NOT NULL DEFAULT true,
    "allow_student_created_groups" BOOLEAN NOT NULL DEFAULT false,
    "require_approval_for_student_groups" BOOLEAN NOT NULL DEFAULT true,
    "allow_parent_to_parent" BOOLEAN NOT NULL DEFAULT false,
    "allow_attachments" BOOLEAN NOT NULL DEFAULT true,
    "allow_voice_messages" BOOLEAN NOT NULL DEFAULT false,
    "allow_video_messages" BOOLEAN NOT NULL DEFAULT false,
    "allow_message_edit" BOOLEAN NOT NULL DEFAULT false,
    "allow_message_delete" BOOLEAN NOT NULL DEFAULT true,
    "allow_reactions" BOOLEAN NOT NULL DEFAULT true,
    "allow_read_receipts" BOOLEAN NOT NULL DEFAULT true,
    "allow_delivery_receipts" BOOLEAN NOT NULL DEFAULT true,
    "allow_online_presence" BOOLEAN NOT NULL DEFAULT true,
    "max_group_members" INTEGER NOT NULL DEFAULT 256,
    "max_message_length" INTEGER NOT NULL DEFAULT 4000,
    "max_attachment_size_mb" INTEGER NOT NULL DEFAULT 25,
    "retention_days" INTEGER,
    "moderation_mode" TEXT DEFAULT 'standard',
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "type" "communication_conversation_type" NOT NULL,
    "status" "communication_conversation_status" NOT NULL DEFAULT 'ACTIVE',
    "title_en" TEXT,
    "title_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "avatar_file_id" UUID,
    "academic_year_id" UUID,
    "term_id" UUID,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "subject_id" UUID,
    "created_by_id" UUID,
    "archived_by_id" UUID,
    "archived_at" TIMESTAMP(3),
    "closed_by_id" UUID,
    "closed_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "communication_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_conversation_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "communication_participant_role" NOT NULL DEFAULT 'MEMBER',
    "status" "communication_participant_status" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invited_by_id" UUID,
    "left_at" TIMESTAMP(3),
    "removed_by_id" UUID,
    "removed_at" TIMESTAMP(3),
    "muted_until" TIMESTAMP(3),
    "last_read_message_id" UUID,
    "last_read_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_conversation_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "invited_user_id" UUID NOT NULL,
    "invited_by_id" UUID,
    "status" "communication_invite_status" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "expires_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_conversation_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_conversation_join_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "reviewed_by_id" UUID,
    "status" "communication_join_request_status" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_conversation_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID,
    "kind" "communication_message_kind" NOT NULL DEFAULT 'TEXT',
    "status" "communication_message_status" NOT NULL DEFAULT 'SENT',
    "body" TEXT,
    "client_message_id" TEXT,
    "reply_to_message_id" UUID,
    "forwarded_from_message_id" UUID,
    "edited_at" TIMESTAMP(3),
    "hidden_by_id" UUID,
    "hidden_at" TIMESTAMP(3),
    "hidden_reason" TEXT,
    "deleted_by_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_message_reads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_message_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_message_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "status" "communication_delivery_status" NOT NULL DEFAULT 'PENDING',
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_message_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_message_reactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reaction_key" TEXT NOT NULL,
    "emoji" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_message_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "uploaded_by_id" UUID,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "communication_message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_message_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "status" "communication_report_status" NOT NULL DEFAULT 'OPEN',
    "reason_code" TEXT,
    "reason_text" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_message_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_moderation_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "conversation_id" UUID,
    "message_id" UUID,
    "target_user_id" UUID,
    "actor_user_id" UUID,
    "action_type" "communication_moderation_action_type" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_user_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "blocker_user_id" UUID NOT NULL,
    "blocked_user_id" UUID NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "unblocked_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "communication_user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_user_restrictions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "restricted_by_id" UUID,
    "restriction_type" "communication_restriction_type" NOT NULL,
    "reason" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "lifted_by_id" UUID,
    "lifted_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_user_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "communication_announcement_status" NOT NULL DEFAULT 'DRAFT',
    "priority" "communication_announcement_priority" NOT NULL DEFAULT 'NORMAL',
    "audience_type" "communication_announcement_audience_type" NOT NULL DEFAULT 'SCHOOL',
    "category" TEXT,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "pinned_until" TIMESTAMP(3),
    "action_label" TEXT,
    "action_url" TEXT,
    "image_file_id" UUID,
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "published_by_id" UUID,
    "archived_by_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_announcement_audiences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "audience_type" "communication_announcement_audience_type" NOT NULL,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "student_id" UUID,
    "guardian_id" UUID,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_announcement_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_announcement_reads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_announcement_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_announcement_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_by_id" UUID,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_announcement_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "template_id" UUID,
    "source_module" "communication_notification_source_module" NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID,
    "idempotency_key" VARCHAR(200),
    "type" "communication_notification_type" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "communication_notification_priority" NOT NULL DEFAULT 'NORMAL',
    "status" "communication_notification_status" NOT NULL DEFAULT 'UNREAD',
    "read_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" "communication_notification_delivery_channel" NOT NULL,
    "status" "communication_notification_delivery_status" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempted_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_notification_push_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "device_token_id" UUID NOT NULL,
    "status" "communication_notification_delivery_status" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempted_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_notification_push_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "communication_notification_preference_category" NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_device_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_ciphertext" TEXT NOT NULL,
    "platform" "app_device_token_platform" NOT NULL,
    "app_surface" "app_device_token_surface" NOT NULL,
    "device_id" TEXT,
    "app_version" TEXT,
    "locale" TEXT,
    "timezone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "last_failure_code" TEXT,
    "last_failure_at" TIMESTAMP(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "user_type" "user_type",
    "organization_id" UUID,
    "school_id" UUID,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "outcome" "audit_outcome" NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "school_id" UUID,
    "uploader_id" UUID,
    "bucket" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" TEXT,
    "visibility" "file_visibility" NOT NULL DEFAULT 'PRIVATE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "uploaded_file_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "import_job_status" NOT NULL DEFAULT 'PENDING',
    "report_json" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE INDEX "organizations_deleted_at_idx" ON "organizations"("deleted_at");

-- CreateIndex
CREATE INDEX "schools_organization_id_idx" ON "schools"("organization_id");

-- CreateIndex
CREATE INDEX "schools_status_idx" ON "schools"("status");

-- CreateIndex
CREATE INDEX "schools_deleted_at_idx" ON "schools"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "schools_organization_id_slug_key" ON "schools"("organization_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "school_entitlements_school_id_key" ON "school_entitlements"("school_id");

-- CreateIndex
CREATE INDEX "school_entitlements_organization_id_idx" ON "school_entitlements"("organization_id");

-- CreateIndex
CREATE INDEX "school_entitlements_status_idx" ON "school_entitlements"("status");

-- CreateIndex
CREATE INDEX "school_entitlements_ends_at_idx" ON "school_entitlements"("ends_at");

-- CreateIndex
CREATE INDEX "school_feature_controls_organization_id_idx" ON "school_feature_controls"("organization_id");

-- CreateIndex
CREATE INDEX "school_feature_controls_feature_key_idx" ON "school_feature_controls"("feature_key");

-- CreateIndex
CREATE INDEX "school_feature_controls_enabled_idx" ON "school_feature_controls"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "school_feature_controls_school_id_feature_key_key" ON "school_feature_controls"("school_id", "feature_key");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_user_type_idx" ON "users"("user_type");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_contact_email_idx" ON "users"("contact_email");

-- CreateIndex
CREATE INDEX "users_must_change_password_idx" ON "users"("must_change_password");

-- CreateIndex
CREATE INDEX "users_password_provisioned_at_idx" ON "users"("password_provisioned_at");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "applicant_profiles_user_id_key" ON "applicant_profiles"("user_id");

-- CreateIndex
CREATE INDEX "applicant_profiles_relationship_idx" ON "applicant_profiles"("relationship");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE INDEX "memberships_organization_id_idx" ON "memberships"("organization_id");

-- CreateIndex
CREATE INDEX "memberships_school_id_idx" ON "memberships"("school_id");

-- CreateIndex
CREATE INDEX "memberships_role_id_idx" ON "memberships"("role_id");

-- CreateIndex
CREATE INDEX "memberships_status_idx" ON "memberships"("status");

-- CreateIndex
CREATE INDEX "memberships_user_type_idx" ON "memberships"("user_type");

-- CreateIndex
CREATE INDEX "memberships_deleted_at_idx" ON "memberships"("deleted_at");

-- CreateIndex
CREATE INDEX "roles_school_id_idx" ON "roles"("school_id");

-- CreateIndex
CREATE INDEX "roles_is_system_idx" ON "roles"("is_system");

-- CreateIndex
CREATE INDEX "roles_deleted_at_idx" ON "roles"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_school_id_key_key" ON "roles"("school_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_revoked_at_idx" ON "sessions"("revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "settings_school_profile_school_id_key" ON "settings_school_profile"("school_id");

-- CreateIndex
CREATE INDEX "settings_school_profile_updated_by_id_idx" ON "settings_school_profile"("updated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_security_controls_school_id_key" ON "settings_security_controls"("school_id");

-- CreateIndex
CREATE INDEX "settings_security_controls_updated_by_id_idx" ON "settings_security_controls"("updated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_school_login_settings_school_id_key" ON "settings_school_login_settings"("school_id");

-- CreateIndex
CREATE INDEX "settings_school_login_settings_school_id_status_idx" ON "settings_school_login_settings"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "settings_school_email_connections_school_id_key" ON "settings_school_email_connections"("school_id");

-- CreateIndex
CREATE INDEX "settings_school_email_connections_school_id_status_idx" ON "settings_school_email_connections"("school_id", "status");

-- CreateIndex
CREATE INDEX "settings_school_email_templates_school_id_is_active_idx" ON "settings_school_email_templates"("school_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "settings_school_email_templates_school_id_key_key" ON "settings_school_email_templates"("school_id", "key");

-- CreateIndex
CREATE INDEX "settings_school_email_delivery_batches_school_id_status_kin_idx" ON "settings_school_email_delivery_batches"("school_id", "status", "kind");

-- CreateIndex
CREATE INDEX "settings_school_email_delivery_batches_school_id_created_at_idx" ON "settings_school_email_delivery_batches"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "settings_school_email_delivery_recipients_school_id_batch_i_idx" ON "settings_school_email_delivery_recipients"("school_id", "batch_id", "status");

-- CreateIndex
CREATE INDEX "settings_school_email_delivery_recipients_school_id_status_idx" ON "settings_school_email_delivery_recipients"("school_id", "status");

-- CreateIndex
CREATE INDEX "settings_school_email_delivery_recipients_batch_id_idx" ON "settings_school_email_delivery_recipients"("batch_id");

-- CreateIndex
CREATE INDEX "settings_school_email_delivery_recipients_user_id_idx" ON "settings_school_email_delivery_recipients"("user_id");

-- CreateIndex
CREATE INDEX "settings_notification_templates_school_id_status_idx" ON "settings_notification_templates"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "settings_notification_templates_school_id_key_key" ON "settings_notification_templates"("school_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "settings_notification_templates_id_school_id_key" ON "settings_notification_templates"("id", "school_id");

-- CreateIndex
CREATE INDEX "settings_notification_template_channel_states_school_id_idx" ON "settings_notification_template_channel_states"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_notification_template_channel_states_notification__key" ON "settings_notification_template_channel_states"("notification_template_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "settings_integration_providers_key_key" ON "settings_integration_providers"("key");

-- CreateIndex
CREATE INDEX "settings_integration_providers_category_idx" ON "settings_integration_providers"("category");

-- CreateIndex
CREATE INDEX "settings_integration_provider_fields_integration_provider_i_idx" ON "settings_integration_provider_fields"("integration_provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_integration_provider_fields_integration_provider_i_key" ON "settings_integration_provider_fields"("integration_provider_id", "key");

-- CreateIndex
CREATE INDEX "settings_integration_connections_school_id_status_idx" ON "settings_integration_connections"("school_id", "status");

-- CreateIndex
CREATE INDEX "settings_integration_connections_integration_provider_id_idx" ON "settings_integration_connections"("integration_provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_integration_connections_school_id_integration_prov_key" ON "settings_integration_connections"("school_id", "integration_provider_id");

-- CreateIndex
CREATE INDEX "settings_backup_jobs_school_id_created_at_idx" ON "settings_backup_jobs"("school_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "settings_backup_jobs_school_id_status_idx" ON "settings_backup_jobs"("school_id", "status");

-- CreateIndex
CREATE INDEX "settings_backup_jobs_school_id_type_idx" ON "settings_backup_jobs"("school_id", "type");

-- CreateIndex
CREATE INDEX "settings_backup_jobs_created_by_id_idx" ON "settings_backup_jobs"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "dismissal_settings_school_id_key" ON "dismissal_settings"("school_id");

-- CreateIndex
CREATE INDEX "dismissal_settings_default_gate_id_idx" ON "dismissal_settings"("default_gate_id");

-- CreateIndex
CREATE INDEX "dismissal_settings_updated_by_id_idx" ON "dismissal_settings"("updated_by_id");

-- CreateIndex
CREATE INDEX "dismissal_gates_school_id_idx" ON "dismissal_gates"("school_id");

-- CreateIndex
CREATE INDEX "dismissal_gates_school_id_status_idx" ON "dismissal_gates"("school_id", "status");

-- CreateIndex
CREATE INDEX "dismissal_gates_school_id_is_active_deleted_at_idx" ON "dismissal_gates"("school_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "dismissal_gates_school_id_is_active_deleted_at_sort_order_idx" ON "dismissal_gates"("school_id", "is_active", "deleted_at", "sort_order");

-- CreateIndex
CREATE INDEX "dismissal_gates_school_id_sort_order_idx" ON "dismissal_gates"("school_id", "sort_order");

-- CreateIndex
CREATE INDEX "dismissal_gates_deleted_at_idx" ON "dismissal_gates"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "dismissal_gates_id_school_id_key" ON "dismissal_gates"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "dismissal_gates_school_id_code_key" ON "dismissal_gates"("school_id", "code");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_school_id_idx" ON "dismissal_staff_assignments"("school_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_staff_user_id_idx" ON "dismissal_staff_assignments"("staff_user_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_gate_id_idx" ON "dismissal_staff_assignments"("gate_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_stage_id_idx" ON "dismissal_staff_assignments"("stage_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_grade_id_idx" ON "dismissal_staff_assignments"("grade_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_section_id_idx" ON "dismissal_staff_assignments"("section_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_classroom_id_idx" ON "dismissal_staff_assignments"("classroom_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_school_id_staff_user_id_is_acti_idx" ON "dismissal_staff_assignments"("school_id", "staff_user_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_school_id_gate_id_is_active_del_idx" ON "dismissal_staff_assignments"("school_id", "gate_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_school_id_classroom_id_is_activ_idx" ON "dismissal_staff_assignments"("school_id", "classroom_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_school_id_is_active_deleted_at_idx" ON "dismissal_staff_assignments"("school_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_deleted_at_idx" ON "dismissal_staff_assignments"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "dismissal_staff_assignments_id_school_id_key" ON "dismissal_staff_assignments"("id", "school_id");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_idx" ON "dismissal_requests"("school_id");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_status_idx" ON "dismissal_requests"("school_id", "status");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_status_requested_at_idx" ON "dismissal_requests"("school_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_student_id_status_idx" ON "dismissal_requests"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_gate_id_status_idx" ON "dismissal_requests"("school_id", "gate_id", "status");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_requested_at_idx" ON "dismissal_requests"("school_id", "requested_at");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_requested_by_id_deleted_at_upd_idx" ON "dismissal_requests"("school_id", "requested_by_id", "deleted_at", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_created_at_idx" ON "dismissal_requests"("school_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "dismissal_requests_requested_by_id_idx" ON "dismissal_requests"("requested_by_id");

-- CreateIndex
CREATE INDEX "dismissal_requests_handed_over_by_id_idx" ON "dismissal_requests"("handed_over_by_id");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_handed_over_at_idx" ON "dismissal_requests"("school_id", "handed_over_at");

-- CreateIndex
CREATE INDEX "dismissal_requests_guardian_id_idx" ON "dismissal_requests"("guardian_id");

-- CreateIndex
CREATE INDEX "dismissal_requests_enrollment_id_idx" ON "dismissal_requests"("enrollment_id");

-- CreateIndex
CREATE INDEX "dismissal_requests_deleted_at_idx" ON "dismissal_requests"("deleted_at");

-- CreateIndex
CREATE INDEX "dismissal_requests_deleted_at_status_requested_at_idx" ON "dismissal_requests"("deleted_at", "status", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "dismissal_requests_id_school_id_key" ON "dismissal_requests"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "dismissal_requests_school_id_requested_by_id_client_request_key" ON "dismissal_requests"("school_id", "requested_by_id", "client_request_id");

-- CreateIndex
CREATE INDEX "dismissal_request_events_school_id_idx" ON "dismissal_request_events"("school_id");

-- CreateIndex
CREATE INDEX "dismissal_request_events_school_id_request_id_created_at_idx" ON "dismissal_request_events"("school_id", "request_id", "created_at");

-- CreateIndex
CREATE INDEX "dismissal_request_events_school_id_type_created_at_idx" ON "dismissal_request_events"("school_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "dismissal_request_events_actor_user_id_idx" ON "dismissal_request_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "admission_leads_school_id_idx" ON "admission_leads"("school_id");

-- CreateIndex
CREATE INDEX "admission_leads_organization_id_idx" ON "admission_leads"("organization_id");

-- CreateIndex
CREATE INDEX "admission_leads_owner_user_id_idx" ON "admission_leads"("owner_user_id");

-- CreateIndex
CREATE INDEX "admission_leads_school_id_status_created_at_idx" ON "admission_leads"("school_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admission_leads_school_id_channel_created_at_idx" ON "admission_leads"("school_id", "channel", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admission_leads_deleted_at_idx" ON "admission_leads"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "admission_leads_id_school_id_key" ON "admission_leads"("id", "school_id");

-- CreateIndex
CREATE INDEX "admission_applications_school_id_idx" ON "admission_applications"("school_id");

-- CreateIndex
CREATE INDEX "admission_applications_organization_id_idx" ON "admission_applications"("organization_id");

-- CreateIndex
CREATE INDEX "admission_applications_lead_id_idx" ON "admission_applications"("lead_id");

-- CreateIndex
CREATE INDEX "admission_applications_requested_academic_year_id_idx" ON "admission_applications"("requested_academic_year_id");

-- CreateIndex
CREATE INDEX "admission_applications_requested_grade_id_idx" ON "admission_applications"("requested_grade_id");

-- CreateIndex
CREATE INDEX "admission_applications_school_id_status_created_at_idx" ON "admission_applications"("school_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admission_applications_school_id_submitted_at_idx" ON "admission_applications"("school_id", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "admission_applications_deleted_at_idx" ON "admission_applications"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_id_school_id_key" ON "admission_applications"("id", "school_id");

-- CreateIndex
CREATE INDEX "applicant_admission_requests_applicant_user_id_idx" ON "applicant_admission_requests"("applicant_user_id");

-- CreateIndex
CREATE INDEX "applicant_admission_requests_applicant_profile_id_idx" ON "applicant_admission_requests"("applicant_profile_id");

-- CreateIndex
CREATE INDEX "applicant_admission_requests_school_id_idx" ON "applicant_admission_requests"("school_id");

-- CreateIndex
CREATE INDEX "applicant_admission_requests_organization_id_idx" ON "applicant_admission_requests"("organization_id");

-- CreateIndex
CREATE INDEX "applicant_admission_requests_requested_academic_year_id_idx" ON "applicant_admission_requests"("requested_academic_year_id");

-- CreateIndex
CREATE INDEX "applicant_admission_requests_requested_grade_id_idx" ON "applicant_admission_requests"("requested_grade_id");

-- CreateIndex
CREATE INDEX "applicant_admission_requests_application_id_idx" ON "applicant_admission_requests"("application_id");

-- CreateIndex
CREATE INDEX "applicant_admission_requests_applicant_user_id_deleted_at_c_idx" ON "applicant_admission_requests"("applicant_user_id", "deleted_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "applicant_admission_requests_school_id_deleted_at_created_a_idx" ON "applicant_admission_requests"("school_id", "deleted_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "applicant_admission_requests_status_deleted_at_idx" ON "applicant_admission_requests"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "applicant_admission_requests_school_id_status_deleted_at_idx" ON "applicant_admission_requests"("school_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "applicant_admission_requests_deleted_at_idx" ON "applicant_admission_requests"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "applicant_admission_requests_id_school_id_key" ON "applicant_admission_requests"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "applicant_admission_requests_application_id_school_id_key" ON "applicant_admission_requests"("application_id", "school_id");

-- CreateIndex
CREATE INDEX "admission_required_documents_school_id_idx" ON "admission_required_documents"("school_id");

-- CreateIndex
CREATE INDEX "admission_required_documents_organization_id_idx" ON "admission_required_documents"("organization_id");

-- CreateIndex
CREATE INDEX "admission_required_documents_grade_id_idx" ON "admission_required_documents"("grade_id");

-- CreateIndex
CREATE INDEX "admission_required_documents_school_id_is_active_deleted_at_idx" ON "admission_required_documents"("school_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "admission_required_documents_school_id_grade_id_is_active_d_idx" ON "admission_required_documents"("school_id", "grade_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "admission_required_documents_deleted_at_idx" ON "admission_required_documents"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "admission_required_documents_id_school_id_key" ON "admission_required_documents"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_workflow_policies_school_id_key" ON "admission_workflow_policies"("school_id");

-- CreateIndex
CREATE INDEX "admission_workflow_policies_organization_id_idx" ON "admission_workflow_policies"("organization_id");

-- CreateIndex
CREATE INDEX "admission_application_documents_school_id_idx" ON "admission_application_documents"("school_id");

-- CreateIndex
CREATE INDEX "admission_application_documents_application_id_idx" ON "admission_application_documents"("application_id");

-- CreateIndex
CREATE INDEX "admission_application_documents_file_id_idx" ON "admission_application_documents"("file_id");

-- CreateIndex
CREATE INDEX "admission_application_documents_school_id_status_idx" ON "admission_application_documents"("school_id", "status");

-- CreateIndex
CREATE INDEX "admission_application_documents_school_id_application_id_do_idx" ON "admission_application_documents"("school_id", "application_id", "document_type");

-- CreateIndex
CREATE INDEX "applicant_admission_request_documents_request_id_deleted_at_idx" ON "applicant_admission_request_documents"("request_id", "deleted_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "applicant_admission_request_documents_applicant_user_id_del_idx" ON "applicant_admission_request_documents"("applicant_user_id", "deleted_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "applicant_admission_request_documents_school_id_request_id__idx" ON "applicant_admission_request_documents"("school_id", "request_id", "deleted_at");

-- CreateIndex
CREATE INDEX "applicant_admission_request_documents_request_id_required_d_idx" ON "applicant_admission_request_documents"("request_id", "required_document_id", "deleted_at");

-- CreateIndex
CREATE INDEX "applicant_admission_request_documents_file_id_idx" ON "applicant_admission_request_documents"("file_id");

-- CreateIndex
CREATE INDEX "applicant_admission_request_documents_status_deleted_at_idx" ON "applicant_admission_request_documents"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "applicant_admission_request_documents_school_id_application_idx" ON "applicant_admission_request_documents"("school_id", "application_document_id");

-- CreateIndex
CREATE INDEX "applicant_admission_request_documents_organization_id_idx" ON "applicant_admission_request_documents"("organization_id");

-- CreateIndex
CREATE INDEX "admission_tests_school_id_idx" ON "admission_tests"("school_id");

-- CreateIndex
CREATE INDEX "admission_tests_application_id_idx" ON "admission_tests"("application_id");

-- CreateIndex
CREATE INDEX "admission_tests_subject_id_idx" ON "admission_tests"("subject_id");

-- CreateIndex
CREATE INDEX "admission_tests_school_id_status_scheduled_at_idx" ON "admission_tests"("school_id", "status", "scheduled_at" DESC);

-- CreateIndex
CREATE INDEX "admission_interviews_school_id_idx" ON "admission_interviews"("school_id");

-- CreateIndex
CREATE INDEX "admission_interviews_application_id_idx" ON "admission_interviews"("application_id");

-- CreateIndex
CREATE INDEX "admission_interviews_interviewer_user_id_idx" ON "admission_interviews"("interviewer_user_id");

-- CreateIndex
CREATE INDEX "admission_interviews_school_id_status_scheduled_at_idx" ON "admission_interviews"("school_id", "status", "scheduled_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "admission_decisions_application_id_key" ON "admission_decisions"("application_id");

-- CreateIndex
CREATE INDEX "admission_decisions_school_id_idx" ON "admission_decisions"("school_id");

-- CreateIndex
CREATE INDEX "admission_decisions_decided_by_user_id_idx" ON "admission_decisions"("decided_by_user_id");

-- CreateIndex
CREATE INDEX "admission_decisions_school_id_decision_decided_at_idx" ON "admission_decisions"("school_id", "decision", "decided_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "admission_decisions_application_id_school_id_key" ON "admission_decisions"("application_id", "school_id");

-- CreateIndex
CREATE INDEX "academic_years_school_id_idx" ON "academic_years"("school_id");

-- CreateIndex
CREATE INDEX "academic_years_school_id_is_active_idx" ON "academic_years"("school_id", "is_active");

-- CreateIndex
CREATE INDEX "academic_years_deleted_at_idx" ON "academic_years"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_id_school_id_key" ON "academic_years"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_school_id_name_ar_key" ON "academic_years"("school_id", "name_ar");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_school_id_name_en_key" ON "academic_years"("school_id", "name_en");

-- CreateIndex
CREATE INDEX "terms_school_id_idx" ON "terms"("school_id");

-- CreateIndex
CREATE INDEX "terms_academic_year_id_idx" ON "terms"("academic_year_id");

-- CreateIndex
CREATE INDEX "terms_school_id_is_active_idx" ON "terms"("school_id", "is_active");

-- CreateIndex
CREATE INDEX "terms_deleted_at_idx" ON "terms"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "terms_id_school_id_key" ON "terms"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "terms_academic_year_id_name_ar_key" ON "terms"("academic_year_id", "name_ar");

-- CreateIndex
CREATE UNIQUE INDEX "terms_academic_year_id_name_en_key" ON "terms"("academic_year_id", "name_en");

-- CreateIndex
CREATE INDEX "stages_school_id_idx" ON "stages"("school_id");

-- CreateIndex
CREATE INDEX "stages_deleted_at_idx" ON "stages"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "stages_id_school_id_key" ON "stages"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "stages_school_id_name_ar_key" ON "stages"("school_id", "name_ar");

-- CreateIndex
CREATE UNIQUE INDEX "stages_school_id_name_en_key" ON "stages"("school_id", "name_en");

-- CreateIndex
CREATE INDEX "grades_school_id_idx" ON "grades"("school_id");

-- CreateIndex
CREATE INDEX "grades_stage_id_idx" ON "grades"("stage_id");

-- CreateIndex
CREATE INDEX "grades_deleted_at_idx" ON "grades"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "grades_id_school_id_key" ON "grades"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "grades_stage_id_name_ar_key" ON "grades"("stage_id", "name_ar");

-- CreateIndex
CREATE UNIQUE INDEX "grades_stage_id_name_en_key" ON "grades"("stage_id", "name_en");

-- CreateIndex
CREATE INDEX "sections_school_id_idx" ON "sections"("school_id");

-- CreateIndex
CREATE INDEX "sections_grade_id_idx" ON "sections"("grade_id");

-- CreateIndex
CREATE INDEX "sections_deleted_at_idx" ON "sections"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sections_id_school_id_key" ON "sections"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_grade_id_name_ar_key" ON "sections"("grade_id", "name_ar");

-- CreateIndex
CREATE UNIQUE INDEX "sections_grade_id_name_en_key" ON "sections"("grade_id", "name_en");

-- CreateIndex
CREATE INDEX "classrooms_school_id_idx" ON "classrooms"("school_id");

-- CreateIndex
CREATE INDEX "classrooms_section_id_idx" ON "classrooms"("section_id");

-- CreateIndex
CREATE INDEX "classrooms_room_id_idx" ON "classrooms"("room_id");

-- CreateIndex
CREATE INDEX "classrooms_deleted_at_idx" ON "classrooms"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_id_school_id_key" ON "classrooms"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_section_id_name_ar_key" ON "classrooms"("section_id", "name_ar");

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_section_id_name_en_key" ON "classrooms"("section_id", "name_en");

-- CreateIndex
CREATE INDEX "subjects_school_id_idx" ON "subjects"("school_id");

-- CreateIndex
CREATE INDEX "subjects_school_id_is_active_idx" ON "subjects"("school_id", "is_active");

-- CreateIndex
CREATE INDEX "subjects_deleted_at_idx" ON "subjects"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_id_school_id_key" ON "subjects"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_school_id_code_key" ON "subjects"("school_id", "code");

-- CreateIndex
CREATE INDEX "subject_allocations_school_id_idx" ON "subject_allocations"("school_id");

-- CreateIndex
CREATE INDEX "subject_allocations_academic_year_id_idx" ON "subject_allocations"("academic_year_id");

-- CreateIndex
CREATE INDEX "subject_allocations_term_id_idx" ON "subject_allocations"("term_id");

-- CreateIndex
CREATE INDEX "subject_allocations_grade_id_idx" ON "subject_allocations"("grade_id");

-- CreateIndex
CREATE INDEX "subject_allocations_subject_id_idx" ON "subject_allocations"("subject_id");

-- CreateIndex
CREATE INDEX "subject_allocations_school_id_academic_year_id_idx" ON "subject_allocations"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "subject_allocations_school_id_term_id_idx" ON "subject_allocations"("school_id", "term_id");

-- CreateIndex
CREATE INDEX "subject_allocations_school_id_term_id_grade_id_idx" ON "subject_allocations"("school_id", "term_id", "grade_id");

-- CreateIndex
CREATE INDEX "subject_allocations_school_id_term_id_subject_id_idx" ON "subject_allocations"("school_id", "term_id", "subject_id");

-- CreateIndex
CREATE INDEX "subject_allocations_deleted_at_idx" ON "subject_allocations"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "subject_allocations_id_school_id_key" ON "subject_allocations"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_allocations_school_id_term_id_grade_id_subject_id_key" ON "subject_allocations"("school_id", "term_id", "grade_id", "subject_id");

-- CreateIndex
CREATE INDEX "teacher_subject_allocations_school_id_idx" ON "teacher_subject_allocations"("school_id");

-- CreateIndex
CREATE INDEX "teacher_subject_allocations_teacher_user_id_idx" ON "teacher_subject_allocations"("teacher_user_id");

-- CreateIndex
CREATE INDEX "teacher_subject_allocations_subject_id_idx" ON "teacher_subject_allocations"("subject_id");

-- CreateIndex
CREATE INDEX "teacher_subject_allocations_classroom_id_idx" ON "teacher_subject_allocations"("classroom_id");

-- CreateIndex
CREATE INDEX "teacher_subject_allocations_term_id_idx" ON "teacher_subject_allocations"("term_id");

-- CreateIndex
CREATE INDEX "teacher_subject_allocations_school_id_term_id_idx" ON "teacher_subject_allocations"("school_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_subject_allocations_id_school_id_key" ON "teacher_subject_allocations"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_subject_allocations_teacher_user_id_subject_id_clas_key" ON "teacher_subject_allocations"("teacher_user_id", "subject_id", "classroom_id", "term_id");

-- CreateIndex
CREATE INDEX "rooms_school_id_idx" ON "rooms"("school_id");

-- CreateIndex
CREATE INDEX "rooms_school_id_is_active_idx" ON "rooms"("school_id", "is_active");

-- CreateIndex
CREATE INDEX "rooms_deleted_at_idx" ON "rooms"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_id_school_id_key" ON "rooms"("id", "school_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_school_id_idx" ON "academic_calendar_events"("school_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_academic_year_id_idx" ON "academic_calendar_events"("academic_year_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_term_id_idx" ON "academic_calendar_events"("term_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_stage_id_idx" ON "academic_calendar_events"("stage_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_grade_id_idx" ON "academic_calendar_events"("grade_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_section_id_idx" ON "academic_calendar_events"("section_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_created_by_user_id_idx" ON "academic_calendar_events"("created_by_user_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_updated_by_user_id_idx" ON "academic_calendar_events"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_deleted_by_user_id_idx" ON "academic_calendar_events"("deleted_by_user_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_school_id_academic_year_id_idx" ON "academic_calendar_events"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_school_id_term_id_idx" ON "academic_calendar_events"("school_id", "term_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_school_id_term_id_start_date_idx" ON "academic_calendar_events"("school_id", "term_id", "start_date");

-- CreateIndex
CREATE INDEX "academic_calendar_events_school_id_term_id_type_idx" ON "academic_calendar_events"("school_id", "term_id", "type");

-- CreateIndex
CREATE INDEX "academic_calendar_events_term_scope_idx" ON "academic_calendar_events"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "academic_calendar_events_deleted_at_idx" ON "academic_calendar_events"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "academic_calendar_events_id_school_id_key" ON "academic_calendar_events"("id", "school_id");

-- CreateIndex
CREATE INDEX "curricula_school_id_idx" ON "curricula"("school_id");

-- CreateIndex
CREATE INDEX "curricula_school_id_academic_year_id_idx" ON "curricula"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "curricula_school_id_term_id_idx" ON "curricula"("school_id", "term_id");

-- CreateIndex
CREATE INDEX "curricula_school_id_grade_id_idx" ON "curricula"("school_id", "grade_id");

-- CreateIndex
CREATE INDEX "curricula_school_id_subject_id_idx" ON "curricula"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "curricula_school_id_status_idx" ON "curricula"("school_id", "status");

-- CreateIndex
CREATE INDEX "curricula_school_id_academic_year_id_term_id_grade_id_subje_idx" ON "curricula"("school_id", "academic_year_id", "term_id", "grade_id", "subject_id");

-- CreateIndex
CREATE INDEX "curricula_created_by_user_id_idx" ON "curricula"("created_by_user_id");

-- CreateIndex
CREATE INDEX "curricula_updated_by_user_id_idx" ON "curricula"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "curricula_deleted_at_idx" ON "curricula"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "curricula_id_school_id_key" ON "curricula"("id", "school_id");

-- CreateIndex
CREATE INDEX "curriculum_units_school_id_idx" ON "curriculum_units"("school_id");

-- CreateIndex
CREATE INDEX "curriculum_units_school_id_curriculum_id_idx" ON "curriculum_units"("school_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "curriculum_units_school_id_curriculum_id_sort_order_idx" ON "curriculum_units"("school_id", "curriculum_id", "sort_order");

-- CreateIndex
CREATE INDEX "curriculum_units_deleted_at_idx" ON "curriculum_units"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_units_id_school_id_key" ON "curriculum_units"("id", "school_id");

-- CreateIndex
CREATE INDEX "curriculum_lessons_school_id_idx" ON "curriculum_lessons"("school_id");

-- CreateIndex
CREATE INDEX "curriculum_lessons_school_id_curriculum_id_idx" ON "curriculum_lessons"("school_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "curriculum_lessons_school_id_unit_id_idx" ON "curriculum_lessons"("school_id", "unit_id");

-- CreateIndex
CREATE INDEX "curriculum_lessons_school_id_unit_id_sort_order_idx" ON "curriculum_lessons"("school_id", "unit_id", "sort_order");

-- CreateIndex
CREATE INDEX "curriculum_lessons_deleted_at_idx" ON "curriculum_lessons"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_lessons_id_school_id_key" ON "curriculum_lessons"("id", "school_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_id_idx" ON "lesson_content_items"("school_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_id_curriculum_id_idx" ON "lesson_content_items"("school_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_id_unit_id_idx" ON "lesson_content_items"("school_id", "unit_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_id_lesson_id_idx" ON "lesson_content_items"("school_id", "lesson_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_id_lesson_id_sort_order_idx" ON "lesson_content_items"("school_id", "lesson_id", "sort_order");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_id_type_idx" ON "lesson_content_items"("school_id", "type");

-- CreateIndex
CREATE INDEX "lesson_content_items_file_id_idx" ON "lesson_content_items"("file_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_created_by_user_id_idx" ON "lesson_content_items"("created_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_updated_by_user_id_idx" ON "lesson_content_items"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_deleted_at_idx" ON "lesson_content_items"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_content_items_id_school_id_key" ON "lesson_content_items"("id", "school_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_idx" ON "lesson_plans"("school_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_academic_year_id_idx" ON "lesson_plans"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_term_id_idx" ON "lesson_plans"("school_id", "term_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_teacher_subject_allocation_id_idx" ON "lesson_plans"("school_id", "teacher_subject_allocation_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_teacher_user_id_idx" ON "lesson_plans"("school_id", "teacher_user_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_classroom_id_idx" ON "lesson_plans"("school_id", "classroom_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_subject_id_idx" ON "lesson_plans"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_curriculum_id_idx" ON "lesson_plans"("school_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_status_idx" ON "lesson_plans"("school_id", "status");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_week_start_date_idx" ON "lesson_plans"("school_id", "week_start_date");

-- CreateIndex
CREATE INDEX "lesson_plans_created_by_user_id_idx" ON "lesson_plans"("created_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_plans_updated_by_user_id_idx" ON "lesson_plans"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_plans_deleted_at_idx" ON "lesson_plans"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_plans_id_school_id_key" ON "lesson_plans"("id", "school_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_idx" ON "lesson_plan_items"("school_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_lesson_plan_id_idx" ON "lesson_plan_items"("school_id", "lesson_plan_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_curriculum_id_idx" ON "lesson_plan_items"("school_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_unit_id_idx" ON "lesson_plan_items"("school_id", "unit_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_lesson_id_idx" ON "lesson_plan_items"("school_id", "lesson_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_timetable_entry_id_idx" ON "lesson_plan_items"("school_id", "timetable_entry_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_planned_date_idx" ON "lesson_plan_items"("school_id", "planned_date");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_status_idx" ON "lesson_plan_items"("school_id", "status");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_lesson_plan_id_sort_order_idx" ON "lesson_plan_items"("school_id", "lesson_plan_id", "sort_order");

-- CreateIndex
CREATE INDEX "lesson_plan_items_created_by_user_id_idx" ON "lesson_plan_items"("created_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_updated_by_user_id_idx" ON "lesson_plan_items"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_rescheduled_from_item_id_idx" ON "lesson_plan_items"("rescheduled_from_item_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_deleted_at_idx" ON "lesson_plan_items"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_plan_items_id_school_id_key" ON "lesson_plan_items"("id", "school_id");

-- CreateIndex
CREATE INDEX "timetable_configs_school_id_idx" ON "timetable_configs"("school_id");

-- CreateIndex
CREATE INDEX "timetable_configs_academic_year_id_idx" ON "timetable_configs"("academic_year_id");

-- CreateIndex
CREATE INDEX "timetable_configs_term_id_idx" ON "timetable_configs"("term_id");

-- CreateIndex
CREATE INDEX "timetable_configs_grade_id_idx" ON "timetable_configs"("grade_id");

-- CreateIndex
CREATE INDEX "timetable_configs_section_id_idx" ON "timetable_configs"("section_id");

-- CreateIndex
CREATE INDEX "timetable_configs_classroom_id_idx" ON "timetable_configs"("classroom_id");

-- CreateIndex
CREATE INDEX "timetable_configs_school_id_academic_year_id_term_id_status_idx" ON "timetable_configs"("school_id", "academic_year_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "timetable_configs_school_id_term_id_scope_type_scope_key_idx" ON "timetable_configs"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_configs_id_school_id_key" ON "timetable_configs"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_configs_school_term_scope_key" ON "timetable_configs"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "timetable_periods_school_id_idx" ON "timetable_periods"("school_id");

-- CreateIndex
CREATE INDEX "timetable_periods_timetable_config_id_idx" ON "timetable_periods"("timetable_config_id");

-- CreateIndex
CREATE INDEX "timetable_periods_school_id_timetable_config_id_idx" ON "timetable_periods"("school_id", "timetable_config_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_periods_id_school_id_key" ON "timetable_periods"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_periods_config_index_key" ON "timetable_periods"("school_id", "timetable_config_id", "period_index");

-- CreateIndex
CREATE INDEX "timetable_entries_school_id_idx" ON "timetable_entries"("school_id");

-- CreateIndex
CREATE INDEX "timetable_entries_academic_year_id_idx" ON "timetable_entries"("academic_year_id");

-- CreateIndex
CREATE INDEX "timetable_entries_term_id_idx" ON "timetable_entries"("term_id");

-- CreateIndex
CREATE INDEX "timetable_entries_timetable_config_id_idx" ON "timetable_entries"("timetable_config_id");

-- CreateIndex
CREATE INDEX "timetable_entries_period_id_idx" ON "timetable_entries"("period_id");

-- CreateIndex
CREATE INDEX "timetable_entries_grade_id_idx" ON "timetable_entries"("grade_id");

-- CreateIndex
CREATE INDEX "timetable_entries_section_id_idx" ON "timetable_entries"("section_id");

-- CreateIndex
CREATE INDEX "timetable_entries_classroom_id_idx" ON "timetable_entries"("classroom_id");

-- CreateIndex
CREATE INDEX "timetable_entries_subject_id_idx" ON "timetable_entries"("subject_id");

-- CreateIndex
CREATE INDEX "timetable_entries_teacher_user_id_idx" ON "timetable_entries"("teacher_user_id");

-- CreateIndex
CREATE INDEX "timetable_entries_teacher_subject_allocation_id_idx" ON "timetable_entries"("teacher_subject_allocation_id");

-- CreateIndex
CREATE INDEX "timetable_entries_room_id_idx" ON "timetable_entries"("room_id");

-- CreateIndex
CREATE INDEX "timetable_entries_school_id_term_id_classroom_id_day_of_wee_idx" ON "timetable_entries"("school_id", "term_id", "classroom_id", "day_of_week", "period_id");

-- CreateIndex
CREATE INDEX "timetable_entries_school_id_term_id_teacher_user_id_day_of__idx" ON "timetable_entries"("school_id", "term_id", "teacher_user_id", "day_of_week", "period_id");

-- CreateIndex
CREATE INDEX "timetable_entries_school_id_term_id_room_id_day_of_week_per_idx" ON "timetable_entries"("school_id", "term_id", "room_id", "day_of_week", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_id_school_id_key" ON "timetable_entries"("id", "school_id");

-- CreateIndex
CREATE INDEX "timetable_publications_school_id_idx" ON "timetable_publications"("school_id");

-- CreateIndex
CREATE INDEX "timetable_publications_academic_year_id_idx" ON "timetable_publications"("academic_year_id");

-- CreateIndex
CREATE INDEX "timetable_publications_term_id_idx" ON "timetable_publications"("term_id");

-- CreateIndex
CREATE INDEX "timetable_publications_timetable_config_id_idx" ON "timetable_publications"("timetable_config_id");

-- CreateIndex
CREATE INDEX "timetable_publications_published_by_user_id_idx" ON "timetable_publications"("published_by_user_id");

-- CreateIndex
CREATE INDEX "timetable_publications_school_id_term_id_status_idx" ON "timetable_publications"("school_id", "term_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_publications_id_school_id_key" ON "timetable_publications"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_publications_config_revision_key" ON "timetable_publications"("school_id", "timetable_config_id", "revision");

-- CreateIndex
CREATE INDEX "timetable_conflicts_school_id_idx" ON "timetable_conflicts"("school_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_academic_year_id_idx" ON "timetable_conflicts"("academic_year_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_term_id_idx" ON "timetable_conflicts"("term_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_timetable_config_id_idx" ON "timetable_conflicts"("timetable_config_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_entry_id_idx" ON "timetable_conflicts"("entry_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_related_entry_id_idx" ON "timetable_conflicts"("related_entry_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_period_id_idx" ON "timetable_conflicts"("period_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_teacher_user_id_idx" ON "timetable_conflicts"("teacher_user_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_room_id_idx" ON "timetable_conflicts"("room_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_school_id_term_id_status_idx" ON "timetable_conflicts"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "timetable_conflicts_school_id_timetable_config_id_conflict__idx" ON "timetable_conflicts"("school_id", "timetable_config_id", "conflict_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_conflicts_id_school_id_key" ON "timetable_conflicts"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_conflicts_school_fingerprint_key" ON "timetable_conflicts"("school_id", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE INDEX "students_school_id_idx" ON "students"("school_id");

-- CreateIndex
CREATE INDEX "students_organization_id_idx" ON "students"("organization_id");

-- CreateIndex
CREATE INDEX "students_application_id_idx" ON "students"("application_id");

-- CreateIndex
CREATE INDEX "students_avatar_file_id_idx" ON "students"("avatar_file_id");

-- CreateIndex
CREATE INDEX "students_school_id_status_created_at_idx" ON "students"("school_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "students_deleted_at_idx" ON "students"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "students_id_school_id_key" ON "students"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_application_id_school_id_key" ON "students"("application_id", "school_id");

-- CreateIndex
CREATE INDEX "guardians_school_id_idx" ON "guardians"("school_id");

-- CreateIndex
CREATE INDEX "guardians_organization_id_idx" ON "guardians"("organization_id");

-- CreateIndex
CREATE INDEX "guardians_user_id_idx" ON "guardians"("user_id");

-- CreateIndex
CREATE INDEX "guardians_school_id_relation_idx" ON "guardians"("school_id", "relation");

-- CreateIndex
CREATE INDEX "guardians_deleted_at_idx" ON "guardians"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_id_school_id_key" ON "guardians"("id", "school_id");

-- CreateIndex
CREATE INDEX "student_guardian_links_school_id_idx" ON "student_guardian_links"("school_id");

-- CreateIndex
CREATE INDEX "student_guardian_links_student_id_idx" ON "student_guardian_links"("student_id");

-- CreateIndex
CREATE INDEX "student_guardian_links_guardian_id_idx" ON "student_guardian_links"("guardian_id");

-- CreateIndex
CREATE INDEX "student_guardian_links_school_id_student_id_is_primary_idx" ON "student_guardian_links"("school_id", "student_id", "is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardian_links_school_id_student_id_guardian_id_key" ON "student_guardian_links"("school_id", "student_id", "guardian_id");

-- CreateIndex
CREATE INDEX "student_enrollments_school_id_idx" ON "student_enrollments"("school_id");

-- CreateIndex
CREATE INDEX "student_enrollments_student_id_idx" ON "student_enrollments"("student_id");

-- CreateIndex
CREATE INDEX "student_enrollments_academic_year_id_idx" ON "student_enrollments"("academic_year_id");

-- CreateIndex
CREATE INDEX "student_enrollments_term_id_idx" ON "student_enrollments"("term_id");

-- CreateIndex
CREATE INDEX "student_enrollments_classroom_id_idx" ON "student_enrollments"("classroom_id");

-- CreateIndex
CREATE INDEX "student_enrollments_school_id_student_id_status_idx" ON "student_enrollments"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "student_enrollments_school_id_academic_year_id_term_id_stat_idx" ON "student_enrollments"("school_id", "academic_year_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "student_enrollments_deleted_at_idx" ON "student_enrollments"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrollments_id_school_id_key" ON "student_enrollments"("id", "school_id");

-- CreateIndex
CREATE INDEX "student_documents_school_id_idx" ON "student_documents"("school_id");

-- CreateIndex
CREATE INDEX "student_documents_student_id_idx" ON "student_documents"("student_id");

-- CreateIndex
CREATE INDEX "student_documents_file_id_idx" ON "student_documents"("file_id");

-- CreateIndex
CREATE INDEX "student_documents_school_id_status_idx" ON "student_documents"("school_id", "status");

-- CreateIndex
CREATE INDEX "student_documents_school_id_student_id_document_type_idx" ON "student_documents"("school_id", "student_id", "document_type");

-- CreateIndex
CREATE INDEX "student_documents_source_application_id_idx" ON "student_documents"("source_application_id");

-- CreateIndex
CREATE INDEX "student_documents_source_application_document_id_idx" ON "student_documents"("source_application_document_id");

-- CreateIndex
CREATE INDEX "student_documents_source_applicant_request_document_id_idx" ON "student_documents"("source_applicant_request_document_id");

-- CreateIndex
CREATE INDEX "student_documents_source_file_id_idx" ON "student_documents"("source_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_documents_source_import_key" ON "student_documents"("school_id", "student_id", "source_application_document_id");

-- CreateIndex
CREATE INDEX "student_profile_correction_requests_school_id_student_id_st_idx" ON "student_profile_correction_requests"("school_id", "student_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "student_profile_correction_requests_school_id_status_create_idx" ON "student_profile_correction_requests"("school_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "student_profile_correction_requests_requested_by_user_id_idx" ON "student_profile_correction_requests"("requested_by_user_id");

-- CreateIndex
CREATE INDEX "student_profile_correction_requests_student_id_idx" ON "student_profile_correction_requests"("student_id");

-- CreateIndex
CREATE INDEX "student_profile_correction_requests_deleted_at_idx" ON "student_profile_correction_requests"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "student_profile_correction_requests_id_school_id_key" ON "student_profile_correction_requests"("id", "school_id");

-- CreateIndex
CREATE INDEX "student_medical_profiles_school_id_idx" ON "student_medical_profiles"("school_id");

-- CreateIndex
CREATE INDEX "student_medical_profiles_student_id_idx" ON "student_medical_profiles"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_medical_profiles_student_id_school_id_key" ON "student_medical_profiles"("student_id", "school_id");

-- CreateIndex
CREATE INDEX "student_notes_school_id_idx" ON "student_notes"("school_id");

-- CreateIndex
CREATE INDEX "student_notes_student_id_idx" ON "student_notes"("student_id");

-- CreateIndex
CREATE INDEX "student_notes_author_user_id_idx" ON "student_notes"("author_user_id");

-- CreateIndex
CREATE INDEX "student_notes_school_id_student_id_created_at_idx" ON "student_notes"("school_id", "student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "attendance_policies_school_id_idx" ON "attendance_policies"("school_id");

-- CreateIndex
CREATE INDEX "attendance_policies_academic_year_id_idx" ON "attendance_policies"("academic_year_id");

-- CreateIndex
CREATE INDEX "attendance_policies_term_id_idx" ON "attendance_policies"("term_id");

-- CreateIndex
CREATE INDEX "attendance_policies_stage_id_idx" ON "attendance_policies"("stage_id");

-- CreateIndex
CREATE INDEX "attendance_policies_grade_id_idx" ON "attendance_policies"("grade_id");

-- CreateIndex
CREATE INDEX "attendance_policies_section_id_idx" ON "attendance_policies"("section_id");

-- CreateIndex
CREATE INDEX "attendance_policies_classroom_id_idx" ON "attendance_policies"("classroom_id");

-- CreateIndex
CREATE INDEX "attendance_policies_school_id_academic_year_id_term_id_idx" ON "attendance_policies"("school_id", "academic_year_id", "term_id");

-- CreateIndex
CREATE INDEX "attendance_policies_school_id_term_id_scope_type_scope_key_idx" ON "attendance_policies"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "attendance_policies_school_id_is_active_deleted_at_idx" ON "attendance_policies"("school_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "attendance_policies_deleted_at_idx" ON "attendance_policies"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policies_id_school_id_key" ON "attendance_policies"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policies_scope_name_ar_key" ON "attendance_policies"("school_id", "academic_year_id", "term_id", "scope_type", "scope_key", "name_ar");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policies_scope_name_en_key" ON "attendance_policies"("school_id", "academic_year_id", "term_id", "scope_type", "scope_key", "name_en");

-- CreateIndex
CREATE INDEX "attendance_sessions_school_id_idx" ON "attendance_sessions"("school_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_academic_year_id_idx" ON "attendance_sessions"("academic_year_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_term_id_idx" ON "attendance_sessions"("term_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_date_idx" ON "attendance_sessions"("date");

-- CreateIndex
CREATE INDEX "attendance_sessions_status_idx" ON "attendance_sessions"("status");

-- CreateIndex
CREATE INDEX "attendance_sessions_stage_id_idx" ON "attendance_sessions"("stage_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_grade_id_idx" ON "attendance_sessions"("grade_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_section_id_idx" ON "attendance_sessions"("section_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_classroom_id_idx" ON "attendance_sessions"("classroom_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_policy_id_idx" ON "attendance_sessions"("policy_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_submitted_by_id_idx" ON "attendance_sessions"("submitted_by_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_school_id_term_id_date_idx" ON "attendance_sessions"("school_id", "term_id", "date");

-- CreateIndex
CREATE INDEX "attendance_sessions_school_id_term_id_status_idx" ON "attendance_sessions"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "attendance_sessions_school_id_term_id_scope_type_scope_key_idx" ON "attendance_sessions"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "attendance_sessions_deleted_at_idx" ON "attendance_sessions"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_id_school_id_key" ON "attendance_sessions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_school_id_academic_year_id_term_id_date_key" ON "attendance_sessions"("school_id", "academic_year_id", "term_id", "date", "scope_type", "scope_key", "mode", "period_key");

-- CreateIndex
CREATE INDEX "attendance_entries_school_id_idx" ON "attendance_entries"("school_id");

-- CreateIndex
CREATE INDEX "attendance_entries_session_id_idx" ON "attendance_entries"("session_id");

-- CreateIndex
CREATE INDEX "attendance_entries_student_id_idx" ON "attendance_entries"("student_id");

-- CreateIndex
CREATE INDEX "attendance_entries_enrollment_id_idx" ON "attendance_entries"("enrollment_id");

-- CreateIndex
CREATE INDEX "attendance_entries_status_idx" ON "attendance_entries"("status");

-- CreateIndex
CREATE INDEX "attendance_entries_marked_by_id_idx" ON "attendance_entries"("marked_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_entries_id_school_id_key" ON "attendance_entries"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_entries_school_id_session_id_student_id_key" ON "attendance_entries"("school_id", "session_id", "student_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_school_id_idx" ON "attendance_excuse_requests"("school_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_academic_year_id_idx" ON "attendance_excuse_requests"("academic_year_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_term_id_idx" ON "attendance_excuse_requests"("term_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_student_id_idx" ON "attendance_excuse_requests"("student_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_status_idx" ON "attendance_excuse_requests"("status");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_date_from_date_to_idx" ON "attendance_excuse_requests"("date_from", "date_to");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_created_by_id_idx" ON "attendance_excuse_requests"("created_by_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_decided_by_id_idx" ON "attendance_excuse_requests"("decided_by_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_deleted_at_idx" ON "attendance_excuse_requests"("deleted_at");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_school_id_term_id_status_idx" ON "attendance_excuse_requests"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_school_id_student_id_date_from_d_idx" ON "attendance_excuse_requests"("school_id", "student_id", "date_from", "date_to");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_excuse_requests_id_school_id_key" ON "attendance_excuse_requests"("id", "school_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_request_sessions_school_id_idx" ON "attendance_excuse_request_sessions"("school_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_request_sessions_attendance_session_id_idx" ON "attendance_excuse_request_sessions"("attendance_session_id");

-- CreateIndex
CREATE INDEX "grade_assessments_school_id_idx" ON "grade_assessments"("school_id");

-- CreateIndex
CREATE INDEX "grade_assessments_academic_year_id_idx" ON "grade_assessments"("academic_year_id");

-- CreateIndex
CREATE INDEX "grade_assessments_term_id_idx" ON "grade_assessments"("term_id");

-- CreateIndex
CREATE INDEX "grade_assessments_subject_id_idx" ON "grade_assessments"("subject_id");

-- CreateIndex
CREATE INDEX "grade_assessments_stage_id_idx" ON "grade_assessments"("stage_id");

-- CreateIndex
CREATE INDEX "grade_assessments_grade_id_idx" ON "grade_assessments"("grade_id");

-- CreateIndex
CREATE INDEX "grade_assessments_section_id_idx" ON "grade_assessments"("section_id");

-- CreateIndex
CREATE INDEX "grade_assessments_classroom_id_idx" ON "grade_assessments"("classroom_id");

-- CreateIndex
CREATE INDEX "grade_assessments_published_by_id_idx" ON "grade_assessments"("published_by_id");

-- CreateIndex
CREATE INDEX "grade_assessments_approved_by_id_idx" ON "grade_assessments"("approved_by_id");

-- CreateIndex
CREATE INDEX "grade_assessments_locked_by_id_idx" ON "grade_assessments"("locked_by_id");

-- CreateIndex
CREATE INDEX "grade_assessments_created_by_id_idx" ON "grade_assessments"("created_by_id");

-- CreateIndex
CREATE INDEX "grade_assessments_scope_type_scope_key_idx" ON "grade_assessments"("scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "grade_assessments_school_id_academic_year_id_term_id_idx" ON "grade_assessments"("school_id", "academic_year_id", "term_id");

-- CreateIndex
CREATE INDEX "grade_assessments_school_id_term_id_subject_id_idx" ON "grade_assessments"("school_id", "term_id", "subject_id");

-- CreateIndex
CREATE INDEX "grade_assessments_school_id_term_id_scope_type_scope_key_idx" ON "grade_assessments"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "grade_assessments_school_id_term_id_approval_status_idx" ON "grade_assessments"("school_id", "term_id", "approval_status");

-- CreateIndex
CREATE INDEX "grade_assessments_school_id_deleted_at_idx" ON "grade_assessments"("school_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "grade_assessments_id_school_id_unique" ON "grade_assessments"("id", "school_id");

-- CreateIndex
CREATE INDEX "grade_items_school_id_idx" ON "grade_items"("school_id");

-- CreateIndex
CREATE INDEX "grade_items_term_id_idx" ON "grade_items"("term_id");

-- CreateIndex
CREATE INDEX "grade_items_assessment_id_idx" ON "grade_items"("assessment_id");

-- CreateIndex
CREATE INDEX "grade_items_student_id_idx" ON "grade_items"("student_id");

-- CreateIndex
CREATE INDEX "grade_items_enrollment_id_idx" ON "grade_items"("enrollment_id");

-- CreateIndex
CREATE INDEX "grade_items_entered_by_id_idx" ON "grade_items"("entered_by_id");

-- CreateIndex
CREATE INDEX "grade_items_school_id_term_id_student_id_idx" ON "grade_items"("school_id", "term_id", "student_id");

-- CreateIndex
CREATE INDEX "grade_items_school_id_assessment_id_status_idx" ON "grade_items"("school_id", "assessment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "grade_items_school_id_assessment_id_student_id_key" ON "grade_items"("school_id", "assessment_id", "student_id");

-- CreateIndex
CREATE INDEX "grade_assessment_questions_school_id_idx" ON "grade_assessment_questions"("school_id");

-- CreateIndex
CREATE INDEX "grade_assessment_questions_assessment_id_idx" ON "grade_assessment_questions"("assessment_id");

-- CreateIndex
CREATE INDEX "grade_assessment_questions_school_id_assessment_id_deleted__idx" ON "grade_assessment_questions"("school_id", "assessment_id", "deleted_at");

-- CreateIndex
CREATE INDEX "grade_assessment_questions_school_id_type_idx" ON "grade_assessment_questions"("school_id", "type");

-- CreateIndex
CREATE INDEX "grade_assessment_questions_deleted_at_idx" ON "grade_assessment_questions"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "grade_assessment_questions_id_school_id_key" ON "grade_assessment_questions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_assessment_questions_school_id_assessment_id_sort_ord_key" ON "grade_assessment_questions"("school_id", "assessment_id", "sort_order");

-- CreateIndex
CREATE INDEX "grade_assessment_question_options_school_id_idx" ON "grade_assessment_question_options"("school_id");

-- CreateIndex
CREATE INDEX "grade_assessment_question_options_assessment_id_idx" ON "grade_assessment_question_options"("assessment_id");

-- CreateIndex
CREATE INDEX "grade_assessment_question_options_question_id_idx" ON "grade_assessment_question_options"("question_id");

-- CreateIndex
CREATE INDEX "grade_assessment_question_options_school_id_question_id_del_idx" ON "grade_assessment_question_options"("school_id", "question_id", "deleted_at");

-- CreateIndex
CREATE INDEX "grade_assessment_question_options_deleted_at_idx" ON "grade_assessment_question_options"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "grade_assessment_question_options_id_school_id_key" ON "grade_assessment_question_options"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_assessment_question_options_school_id_question_id_sor_key" ON "grade_assessment_question_options"("school_id", "question_id", "sort_order");

-- CreateIndex
CREATE INDEX "grade_submissions_school_id_idx" ON "grade_submissions"("school_id");

-- CreateIndex
CREATE INDEX "grade_submissions_assessment_id_idx" ON "grade_submissions"("assessment_id");

-- CreateIndex
CREATE INDEX "grade_submissions_term_id_idx" ON "grade_submissions"("term_id");

-- CreateIndex
CREATE INDEX "grade_submissions_student_id_idx" ON "grade_submissions"("student_id");

-- CreateIndex
CREATE INDEX "grade_submissions_enrollment_id_idx" ON "grade_submissions"("enrollment_id");

-- CreateIndex
CREATE INDEX "grade_submissions_reviewed_by_id_idx" ON "grade_submissions"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "grade_submissions_school_id_assessment_id_status_idx" ON "grade_submissions"("school_id", "assessment_id", "status");

-- CreateIndex
CREATE INDEX "grade_submissions_school_id_term_id_student_id_idx" ON "grade_submissions"("school_id", "term_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_submissions_id_school_id_key" ON "grade_submissions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_submissions_school_id_assessment_id_student_id_key" ON "grade_submissions"("school_id", "assessment_id", "student_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_school_id_idx" ON "grade_submission_answers"("school_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_submission_id_idx" ON "grade_submission_answers"("submission_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_assessment_id_idx" ON "grade_submission_answers"("assessment_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_question_id_idx" ON "grade_submission_answers"("question_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_student_id_idx" ON "grade_submission_answers"("student_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_reviewed_by_id_idx" ON "grade_submission_answers"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_school_id_assessment_id_student_id_idx" ON "grade_submission_answers"("school_id", "assessment_id", "student_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_school_id_correction_status_idx" ON "grade_submission_answers"("school_id", "correction_status");

-- CreateIndex
CREATE UNIQUE INDEX "grade_submission_answers_id_school_id_key" ON "grade_submission_answers"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_submission_answers_school_id_submission_id_question_i_key" ON "grade_submission_answers"("school_id", "submission_id", "question_id");

-- CreateIndex
CREATE INDEX "grade_submission_answer_options_school_id_idx" ON "grade_submission_answer_options"("school_id");

-- CreateIndex
CREATE INDEX "grade_submission_answer_options_answer_id_idx" ON "grade_submission_answer_options"("answer_id");

-- CreateIndex
CREATE INDEX "grade_submission_answer_options_option_id_idx" ON "grade_submission_answer_options"("option_id");

-- CreateIndex
CREATE INDEX "grade_rules_school_id_idx" ON "grade_rules"("school_id");

-- CreateIndex
CREATE INDEX "grade_rules_academic_year_id_idx" ON "grade_rules"("academic_year_id");

-- CreateIndex
CREATE INDEX "grade_rules_term_id_idx" ON "grade_rules"("term_id");

-- CreateIndex
CREATE INDEX "grade_rules_scope_type_scope_key_idx" ON "grade_rules"("scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "grade_rules_school_id_academic_year_id_term_id_idx" ON "grade_rules"("school_id", "academic_year_id", "term_id");

-- CreateIndex
CREATE INDEX "grade_rules_school_id_term_id_scope_type_scope_key_idx" ON "grade_rules"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "grade_rules_grade_id_idx" ON "grade_rules"("grade_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_rules_school_id_academic_year_id_term_id_scope_type_s_key" ON "grade_rules"("school_id", "academic_year_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_idx" ON "homework_assignments"("school_id");

-- CreateIndex
CREATE INDEX "homework_assignments_academic_year_id_idx" ON "homework_assignments"("academic_year_id");

-- CreateIndex
CREATE INDEX "homework_assignments_term_id_idx" ON "homework_assignments"("term_id");

-- CreateIndex
CREATE INDEX "homework_assignments_classroom_id_idx" ON "homework_assignments"("classroom_id");

-- CreateIndex
CREATE INDEX "homework_assignments_subject_id_idx" ON "homework_assignments"("subject_id");

-- CreateIndex
CREATE INDEX "homework_assignments_teacher_user_id_idx" ON "homework_assignments"("teacher_user_id");

-- CreateIndex
CREATE INDEX "homework_assignments_teacher_subject_allocation_id_idx" ON "homework_assignments"("teacher_subject_allocation_id");

-- CreateIndex
CREATE INDEX "homework_assignments_timetable_entry_id_idx" ON "homework_assignments"("timetable_entry_id");

-- CreateIndex
CREATE INDEX "homework_assignments_grade_assessment_id_idx" ON "homework_assignments"("grade_assessment_id");

-- CreateIndex
CREATE INDEX "homework_assignments_created_by_user_id_idx" ON "homework_assignments"("created_by_user_id");

-- CreateIndex
CREATE INDEX "homework_assignments_published_by_user_id_idx" ON "homework_assignments"("published_by_user_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_academic_year_id_term_id_idx" ON "homework_assignments"("school_id", "academic_year_id", "term_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_classroom_id_term_id_idx" ON "homework_assignments"("school_id", "classroom_id", "term_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_teacher_user_id_term_id_idx" ON "homework_assignments"("school_id", "teacher_user_id", "term_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_teacher_subject_allocation_i_idx" ON "homework_assignments"("school_id", "teacher_subject_allocation_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_status_idx" ON "homework_assignments"("school_id", "status");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_due_at_idx" ON "homework_assignments"("school_id", "due_at");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_timetable_entry_id_idx" ON "homework_assignments"("school_id", "timetable_entry_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_grade_assessment_id_idx" ON "homework_assignments"("school_id", "grade_assessment_id");

-- CreateIndex
CREATE INDEX "homework_assignments_deleted_at_idx" ON "homework_assignments"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "homework_assignments_id_school_id_key" ON "homework_assignments"("id", "school_id");

-- CreateIndex
CREATE INDEX "homework_targets_school_id_idx" ON "homework_targets"("school_id");

-- CreateIndex
CREATE INDEX "homework_targets_homework_assignment_id_idx" ON "homework_targets"("homework_assignment_id");

-- CreateIndex
CREATE INDEX "homework_targets_student_id_idx" ON "homework_targets"("student_id");

-- CreateIndex
CREATE INDEX "homework_targets_enrollment_id_idx" ON "homework_targets"("enrollment_id");

-- CreateIndex
CREATE INDEX "homework_targets_school_id_homework_assignment_id_idx" ON "homework_targets"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "homework_targets_school_id_student_id_idx" ON "homework_targets"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "homework_targets_school_id_enrollment_id_idx" ON "homework_targets"("school_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "homework_targets_school_id_status_idx" ON "homework_targets"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "homework_targets_id_school_id_key" ON "homework_targets"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_targets_school_id_homework_assignment_id_student_i_key" ON "homework_targets"("school_id", "homework_assignment_id", "student_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_idx" ON "homework_submissions"("school_id");

-- CreateIndex
CREATE INDEX "homework_submissions_homework_assignment_id_idx" ON "homework_submissions"("homework_assignment_id");

-- CreateIndex
CREATE INDEX "homework_submissions_homework_target_id_idx" ON "homework_submissions"("homework_target_id");

-- CreateIndex
CREATE INDEX "homework_submissions_student_id_idx" ON "homework_submissions"("student_id");

-- CreateIndex
CREATE INDEX "homework_submissions_enrollment_id_idx" ON "homework_submissions"("enrollment_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_homework_assignment_id_idx" ON "homework_submissions"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_homework_target_id_idx" ON "homework_submissions"("school_id", "homework_target_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_student_id_idx" ON "homework_submissions"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_enrollment_id_idx" ON "homework_submissions"("school_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_status_idx" ON "homework_submissions"("school_id", "status");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_homework_assignment_id_statu_idx" ON "homework_submissions"("school_id", "homework_assignment_id", "status");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_student_id_status_idx" ON "homework_submissions"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_submitted_at_idx" ON "homework_submissions"("school_id", "submitted_at");

-- CreateIndex
CREATE INDEX "homework_submissions_reviewed_by_user_id_idx" ON "homework_submissions"("reviewed_by_user_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_reviewed_at_idx" ON "homework_submissions"("school_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_id_school_id_key" ON "homework_submissions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_school_id_homework_target_id_key" ON "homework_submissions"("school_id", "homework_target_id");

-- CreateIndex
CREATE INDEX "homework_questions_school_id_idx" ON "homework_questions"("school_id");

-- CreateIndex
CREATE INDEX "hw_question_school_assignment_idx" ON "homework_questions"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "hw_question_school_assignment_sort_idx" ON "homework_questions"("school_id", "homework_assignment_id", "sort_order");

-- CreateIndex
CREATE INDEX "homework_questions_school_id_type_idx" ON "homework_questions"("school_id", "type");

-- CreateIndex
CREATE INDEX "homework_questions_created_by_user_id_idx" ON "homework_questions"("created_by_user_id");

-- CreateIndex
CREATE INDEX "homework_questions_updated_by_user_id_idx" ON "homework_questions"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "homework_questions_deleted_at_idx" ON "homework_questions"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "homework_questions_id_school_id_key" ON "homework_questions"("id", "school_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_school_id_idx" ON "homework_submission_answers"("school_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_school_id_homework_submission_i_idx" ON "homework_submission_answers"("school_id", "homework_submission_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_school_id_homework_assignment_i_idx" ON "homework_submission_answers"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_school_id_homework_target_id_idx" ON "homework_submission_answers"("school_id", "homework_target_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_school_id_homework_question_id_idx" ON "homework_submission_answers"("school_id", "homework_question_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_reviewed_by_user_id_idx" ON "homework_submission_answers"("reviewed_by_user_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_deleted_at_idx" ON "homework_submission_answers"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submission_answers_id_school_id_key" ON "homework_submission_answers"("id", "school_id");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_school_id_idx" ON "homework_submission_attachments"("school_id");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_school_id_homework_submissi_idx" ON "homework_submission_attachments"("school_id", "homework_submission_id");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_school_id_homework_assignme_idx" ON "homework_submission_attachments"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_school_id_homework_target_i_idx" ON "homework_submission_attachments"("school_id", "homework_target_id");

-- CreateIndex
CREATE INDEX "hw_submission_attach_school_submission_sort_idx" ON "homework_submission_attachments"("school_id", "homework_submission_id", "sort_order");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_file_id_idx" ON "homework_submission_attachments"("file_id");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_created_by_user_id_idx" ON "homework_submission_attachments"("created_by_user_id");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_deleted_at_idx" ON "homework_submission_attachments"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submission_attachments_id_school_id_key" ON "homework_submission_attachments"("id", "school_id");

-- CreateIndex
CREATE INDEX "homework_question_options_school_id_idx" ON "homework_question_options"("school_id");

-- CreateIndex
CREATE INDEX "hw_option_school_question_idx" ON "homework_question_options"("school_id", "homework_question_id");

-- CreateIndex
CREATE INDEX "hw_option_school_question_sort_idx" ON "homework_question_options"("school_id", "homework_question_id", "sort_order");

-- CreateIndex
CREATE INDEX "homework_question_options_deleted_at_idx" ON "homework_question_options"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "homework_question_options_id_school_id_key" ON "homework_question_options"("id", "school_id");

-- CreateIndex
CREATE INDEX "homework_assignment_attachments_school_id_idx" ON "homework_assignment_attachments"("school_id");

-- CreateIndex
CREATE INDEX "hw_attach_school_assignment_idx" ON "homework_assignment_attachments"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "hw_attach_school_assignment_sort_idx" ON "homework_assignment_attachments"("school_id", "homework_assignment_id", "sort_order");

-- CreateIndex
CREATE INDEX "homework_assignment_attachments_file_id_idx" ON "homework_assignment_attachments"("file_id");

-- CreateIndex
CREATE INDEX "homework_assignment_attachments_created_by_user_id_idx" ON "homework_assignment_attachments"("created_by_user_id");

-- CreateIndex
CREATE INDEX "homework_assignment_attachments_deleted_at_idx" ON "homework_assignment_attachments"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "homework_assignment_attachments_id_school_id_key" ON "homework_assignment_attachments"("id", "school_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_school_id_idx" ON "reinforcement_tasks"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_academic_year_id_idx" ON "reinforcement_tasks"("academic_year_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_term_id_idx" ON "reinforcement_tasks"("term_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_subject_id_idx" ON "reinforcement_tasks"("subject_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_assigned_by_id_idx" ON "reinforcement_tasks"("assigned_by_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_created_by_id_idx" ON "reinforcement_tasks"("created_by_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_cancelled_by_id_idx" ON "reinforcement_tasks"("cancelled_by_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_school_id_term_id_status_idx" ON "reinforcement_tasks"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_school_id_due_date_idx" ON "reinforcement_tasks"("school_id", "due_date");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_school_id_source_idx" ON "reinforcement_tasks"("school_id", "source");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_deleted_at_idx" ON "reinforcement_tasks"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_tasks_id_school_id_key" ON "reinforcement_tasks"("id", "school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_school_id_idx" ON "reinforcement_task_targets"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_task_id_idx" ON "reinforcement_task_targets"("task_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_stage_id_idx" ON "reinforcement_task_targets"("stage_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_grade_id_idx" ON "reinforcement_task_targets"("grade_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_section_id_idx" ON "reinforcement_task_targets"("section_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_classroom_id_idx" ON "reinforcement_task_targets"("classroom_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_student_id_idx" ON "reinforcement_task_targets"("student_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_school_id_scope_type_scope_key_idx" ON "reinforcement_task_targets"("school_id", "scope_type", "scope_key");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_targets_id_school_id_key" ON "reinforcement_task_targets"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_targets_school_id_task_id_scope_type_sco_key" ON "reinforcement_task_targets"("school_id", "task_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_school_id_idx" ON "reinforcement_assignments"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_task_id_idx" ON "reinforcement_assignments"("task_id");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_academic_year_id_idx" ON "reinforcement_assignments"("academic_year_id");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_term_id_idx" ON "reinforcement_assignments"("term_id");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_student_id_idx" ON "reinforcement_assignments"("student_id");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_enrollment_id_idx" ON "reinforcement_assignments"("enrollment_id");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_school_id_term_id_status_idx" ON "reinforcement_assignments"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_school_id_student_id_status_idx" ON "reinforcement_assignments"("school_id", "student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_assignments_id_school_id_key" ON "reinforcement_assignments"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_assignments_school_id_task_id_student_id_key" ON "reinforcement_assignments"("school_id", "task_id", "student_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_stages_school_id_idx" ON "reinforcement_task_stages"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_stages_task_id_idx" ON "reinforcement_task_stages"("task_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_stages_school_id_task_id_deleted_at_idx" ON "reinforcement_task_stages"("school_id", "task_id", "deleted_at");

-- CreateIndex
CREATE INDEX "reinforcement_task_stages_deleted_at_idx" ON "reinforcement_task_stages"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_stages_id_school_id_key" ON "reinforcement_task_stages"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_stages_school_id_task_id_sort_order_key" ON "reinforcement_task_stages"("school_id", "task_id", "sort_order");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_school_id_idx" ON "reinforcement_submissions"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_assignment_id_idx" ON "reinforcement_submissions"("assignment_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_task_id_idx" ON "reinforcement_submissions"("task_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_stage_id_idx" ON "reinforcement_submissions"("stage_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_student_id_idx" ON "reinforcement_submissions"("student_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_enrollment_id_idx" ON "reinforcement_submissions"("enrollment_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_proof_file_id_idx" ON "reinforcement_submissions"("proof_file_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_submitted_by_id_idx" ON "reinforcement_submissions"("submitted_by_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_current_review_id_idx" ON "reinforcement_submissions"("current_review_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_school_id_status_idx" ON "reinforcement_submissions"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_submissions_id_school_id_key" ON "reinforcement_submissions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_submissions_school_id_assignment_id_stage_id_key" ON "reinforcement_submissions"("school_id", "assignment_id", "stage_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_school_id_idx" ON "reinforcement_reviews"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_submission_id_idx" ON "reinforcement_reviews"("submission_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_assignment_id_idx" ON "reinforcement_reviews"("assignment_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_task_id_idx" ON "reinforcement_reviews"("task_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_stage_id_idx" ON "reinforcement_reviews"("stage_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_student_id_idx" ON "reinforcement_reviews"("student_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_reviewed_by_id_idx" ON "reinforcement_reviews"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_school_id_reviewed_by_id_reviewed_at_idx" ON "reinforcement_reviews"("school_id", "reviewed_by_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_school_id_outcome_reviewed_at_idx" ON "reinforcement_reviews"("school_id", "outcome", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_reviews_id_school_id_key" ON "reinforcement_reviews"("id", "school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_templates_school_id_idx" ON "reinforcement_task_templates"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_templates_academic_year_id_idx" ON "reinforcement_task_templates"("academic_year_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_templates_term_id_idx" ON "reinforcement_task_templates"("term_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_templates_created_by_id_idx" ON "reinforcement_task_templates"("created_by_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_templates_deleted_at_idx" ON "reinforcement_task_templates"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_templates_id_school_id_key" ON "reinforcement_task_templates"("id", "school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_template_stages_school_id_idx" ON "reinforcement_task_template_stages"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_template_stages_template_id_idx" ON "reinforcement_task_template_stages"("template_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_template_stages_deleted_at_idx" ON "reinforcement_task_template_stages"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_template_stages_id_school_id_key" ON "reinforcement_task_template_stages"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_template_stages_school_id_template_id_so_key" ON "reinforcement_task_template_stages"("school_id", "template_id", "sort_order");

-- CreateIndex
CREATE INDEX "xp_policies_school_id_idx" ON "xp_policies"("school_id");

-- CreateIndex
CREATE INDEX "xp_policies_academic_year_id_idx" ON "xp_policies"("academic_year_id");

-- CreateIndex
CREATE INDEX "xp_policies_term_id_idx" ON "xp_policies"("term_id");

-- CreateIndex
CREATE INDEX "xp_policies_school_id_term_id_is_active_idx" ON "xp_policies"("school_id", "term_id", "is_active");

-- CreateIndex
CREATE INDEX "xp_policies_school_id_scope_type_scope_key_idx" ON "xp_policies"("school_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "xp_policies_deleted_at_idx" ON "xp_policies"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "xp_policies_id_school_id_key" ON "xp_policies"("id", "school_id");

-- CreateIndex
CREATE INDEX "xp_ledger_school_id_idx" ON "xp_ledger"("school_id");

-- CreateIndex
CREATE INDEX "xp_ledger_academic_year_id_idx" ON "xp_ledger"("academic_year_id");

-- CreateIndex
CREATE INDEX "xp_ledger_term_id_idx" ON "xp_ledger"("term_id");

-- CreateIndex
CREATE INDEX "xp_ledger_student_id_idx" ON "xp_ledger"("student_id");

-- CreateIndex
CREATE INDEX "xp_ledger_enrollment_id_idx" ON "xp_ledger"("enrollment_id");

-- CreateIndex
CREATE INDEX "xp_ledger_assignment_id_idx" ON "xp_ledger"("assignment_id");

-- CreateIndex
CREATE INDEX "xp_ledger_policy_id_idx" ON "xp_ledger"("policy_id");

-- CreateIndex
CREATE INDEX "xp_ledger_actor_user_id_idx" ON "xp_ledger"("actor_user_id");

-- CreateIndex
CREATE INDEX "xp_ledger_school_id_student_id_occurred_at_idx" ON "xp_ledger"("school_id", "student_id", "occurred_at");

-- CreateIndex
CREATE INDEX "xp_ledger_school_id_source_type_source_id_idx" ON "xp_ledger"("school_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "xp_ledger_id_school_id_key" ON "xp_ledger"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "xp_ledger_school_id_source_type_source_id_student_id_key" ON "xp_ledger"("school_id", "source_type", "source_id", "student_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_school_id_idx" ON "reward_catalog_items"("school_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_academic_year_id_idx" ON "reward_catalog_items"("academic_year_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_term_id_idx" ON "reward_catalog_items"("term_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_image_file_id_idx" ON "reward_catalog_items"("image_file_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_published_by_id_idx" ON "reward_catalog_items"("published_by_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_archived_by_id_idx" ON "reward_catalog_items"("archived_by_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_created_by_id_idx" ON "reward_catalog_items"("created_by_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_school_id_status_idx" ON "reward_catalog_items"("school_id", "status");

-- CreateIndex
CREATE INDEX "reward_catalog_items_school_id_type_idx" ON "reward_catalog_items"("school_id", "type");

-- CreateIndex
CREATE INDEX "reward_catalog_items_school_id_academic_year_id_term_id_sta_idx" ON "reward_catalog_items"("school_id", "academic_year_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "reward_catalog_items_school_id_sort_order_idx" ON "reward_catalog_items"("school_id", "sort_order");

-- CreateIndex
CREATE INDEX "reward_catalog_items_deleted_at_idx" ON "reward_catalog_items"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reward_catalog_items_id_school_id_key" ON "reward_catalog_items"("id", "school_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_school_id_idx" ON "reward_redemptions"("school_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_catalog_item_id_idx" ON "reward_redemptions"("catalog_item_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_student_id_idx" ON "reward_redemptions"("student_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_enrollment_id_idx" ON "reward_redemptions"("enrollment_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_academic_year_id_idx" ON "reward_redemptions"("academic_year_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_term_id_idx" ON "reward_redemptions"("term_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_requested_by_id_idx" ON "reward_redemptions"("requested_by_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_reviewed_by_id_idx" ON "reward_redemptions"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_fulfilled_by_id_idx" ON "reward_redemptions"("fulfilled_by_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_cancelled_by_id_idx" ON "reward_redemptions"("cancelled_by_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_school_id_status_idx" ON "reward_redemptions"("school_id", "status");

-- CreateIndex
CREATE INDEX "reward_redemptions_school_id_catalog_item_id_status_idx" ON "reward_redemptions"("school_id", "catalog_item_id", "status");

-- CreateIndex
CREATE INDEX "reward_redemptions_school_id_student_id_status_idx" ON "reward_redemptions"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "reward_redemptions_school_id_academic_year_id_term_id_statu_idx" ON "reward_redemptions"("school_id", "academic_year_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "reward_redemptions_school_id_requested_at_idx" ON "reward_redemptions"("school_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "reward_redemptions_id_school_id_key" ON "reward_redemptions"("id", "school_id");

-- CreateIndex
CREATE INDEX "hero_badges_school_id_idx" ON "hero_badges"("school_id");

-- CreateIndex
CREATE INDEX "hero_badges_file_id_idx" ON "hero_badges"("file_id");

-- CreateIndex
CREATE INDEX "hero_badges_school_id_is_active_idx" ON "hero_badges"("school_id", "is_active");

-- CreateIndex
CREATE INDEX "hero_badges_school_id_sort_order_idx" ON "hero_badges"("school_id", "sort_order");

-- CreateIndex
CREATE INDEX "hero_badges_deleted_at_idx" ON "hero_badges"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "hero_badges_id_school_id_key" ON "hero_badges"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_badges_school_id_slug_key" ON "hero_badges"("school_id", "slug");

-- CreateIndex
CREATE INDEX "hero_missions_school_id_idx" ON "hero_missions"("school_id");

-- CreateIndex
CREATE INDEX "hero_missions_academic_year_id_idx" ON "hero_missions"("academic_year_id");

-- CreateIndex
CREATE INDEX "hero_missions_term_id_idx" ON "hero_missions"("term_id");

-- CreateIndex
CREATE INDEX "hero_missions_stage_id_idx" ON "hero_missions"("stage_id");

-- CreateIndex
CREATE INDEX "hero_missions_subject_id_idx" ON "hero_missions"("subject_id");

-- CreateIndex
CREATE INDEX "hero_missions_linked_assessment_id_idx" ON "hero_missions"("linked_assessment_id");

-- CreateIndex
CREATE INDEX "hero_missions_badge_reward_id_idx" ON "hero_missions"("badge_reward_id");

-- CreateIndex
CREATE INDEX "hero_missions_published_by_id_idx" ON "hero_missions"("published_by_id");

-- CreateIndex
CREATE INDEX "hero_missions_archived_by_id_idx" ON "hero_missions"("archived_by_id");

-- CreateIndex
CREATE INDEX "hero_missions_created_by_id_idx" ON "hero_missions"("created_by_id");

-- CreateIndex
CREATE INDEX "hero_missions_school_id_academic_year_id_term_id_stage_id_s_idx" ON "hero_missions"("school_id", "academic_year_id", "term_id", "stage_id", "status");

-- CreateIndex
CREATE INDEX "hero_missions_school_id_stage_id_sort_order_idx" ON "hero_missions"("school_id", "stage_id", "sort_order");

-- CreateIndex
CREATE INDEX "hero_missions_school_id_status_idx" ON "hero_missions"("school_id", "status");

-- CreateIndex
CREATE INDEX "hero_missions_deleted_at_idx" ON "hero_missions"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "hero_missions_id_school_id_key" ON "hero_missions"("id", "school_id");

-- CreateIndex
CREATE INDEX "hero_mission_objectives_school_id_idx" ON "hero_mission_objectives"("school_id");

-- CreateIndex
CREATE INDEX "hero_mission_objectives_mission_id_idx" ON "hero_mission_objectives"("mission_id");

-- CreateIndex
CREATE INDEX "hero_mission_objectives_linked_assessment_id_idx" ON "hero_mission_objectives"("linked_assessment_id");

-- CreateIndex
CREATE INDEX "hero_mission_objectives_school_id_mission_id_deleted_at_idx" ON "hero_mission_objectives"("school_id", "mission_id", "deleted_at");

-- CreateIndex
CREATE INDEX "hero_mission_objectives_deleted_at_idx" ON "hero_mission_objectives"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "hero_mission_objectives_id_school_id_key" ON "hero_mission_objectives"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_mission_objectives_school_id_mission_id_sort_order_key" ON "hero_mission_objectives"("school_id", "mission_id", "sort_order");

-- CreateIndex
CREATE INDEX "hero_mission_progress_school_id_idx" ON "hero_mission_progress"("school_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_mission_id_idx" ON "hero_mission_progress"("mission_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_student_id_idx" ON "hero_mission_progress"("student_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_enrollment_id_idx" ON "hero_mission_progress"("enrollment_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_academic_year_id_idx" ON "hero_mission_progress"("academic_year_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_term_id_idx" ON "hero_mission_progress"("term_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_xp_ledger_id_idx" ON "hero_mission_progress"("xp_ledger_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_school_id_student_id_status_idx" ON "hero_mission_progress"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "hero_mission_progress_school_id_academic_year_id_term_id_st_idx" ON "hero_mission_progress"("school_id", "academic_year_id", "term_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hero_mission_progress_id_school_id_key" ON "hero_mission_progress"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_mission_progress_school_id_mission_id_student_id_key" ON "hero_mission_progress"("school_id", "mission_id", "student_id");

-- CreateIndex
CREATE INDEX "hero_mission_objective_progress_school_id_idx" ON "hero_mission_objective_progress"("school_id");

-- CreateIndex
CREATE INDEX "hero_mission_objective_progress_mission_progress_id_idx" ON "hero_mission_objective_progress"("mission_progress_id");

-- CreateIndex
CREATE INDEX "hero_mission_objective_progress_objective_id_idx" ON "hero_mission_objective_progress"("objective_id");

-- CreateIndex
CREATE INDEX "hero_mission_objective_progress_completed_by_id_idx" ON "hero_mission_objective_progress"("completed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_mission_objective_progress_id_school_id_key" ON "hero_mission_objective_progress"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_mission_objective_progress_school_id_mission_progress__key" ON "hero_mission_objective_progress"("school_id", "mission_progress_id", "objective_id");

-- CreateIndex
CREATE INDEX "hero_student_badges_school_id_idx" ON "hero_student_badges"("school_id");

-- CreateIndex
CREATE INDEX "hero_student_badges_student_id_idx" ON "hero_student_badges"("student_id");

-- CreateIndex
CREATE INDEX "hero_student_badges_badge_id_idx" ON "hero_student_badges"("badge_id");

-- CreateIndex
CREATE INDEX "hero_student_badges_mission_id_idx" ON "hero_student_badges"("mission_id");

-- CreateIndex
CREATE INDEX "hero_student_badges_mission_progress_id_idx" ON "hero_student_badges"("mission_progress_id");

-- CreateIndex
CREATE INDEX "hero_student_badges_school_id_student_id_earned_at_idx" ON "hero_student_badges"("school_id", "student_id", "earned_at");

-- CreateIndex
CREATE UNIQUE INDEX "hero_student_badges_id_school_id_key" ON "hero_student_badges"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_student_badges_school_id_student_id_badge_id_key" ON "hero_student_badges"("school_id", "student_id", "badge_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_school_id_idx" ON "hero_journey_events"("school_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_mission_id_idx" ON "hero_journey_events"("mission_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_mission_progress_id_idx" ON "hero_journey_events"("mission_progress_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_objective_id_idx" ON "hero_journey_events"("objective_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_student_id_idx" ON "hero_journey_events"("student_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_enrollment_id_idx" ON "hero_journey_events"("enrollment_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_xp_ledger_id_idx" ON "hero_journey_events"("xp_ledger_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_badge_id_idx" ON "hero_journey_events"("badge_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_actor_user_id_idx" ON "hero_journey_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_school_id_type_occurred_at_idx" ON "hero_journey_events"("school_id", "type", "occurred_at");

-- CreateIndex
CREATE INDEX "hero_journey_events_school_id_student_id_occurred_at_idx" ON "hero_journey_events"("school_id", "student_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "hero_journey_events_id_school_id_key" ON "hero_journey_events"("id", "school_id");

-- CreateIndex
CREATE INDEX "behavior_categories_school_id_idx" ON "behavior_categories"("school_id");

-- CreateIndex
CREATE INDEX "behavior_categories_school_id_type_idx" ON "behavior_categories"("school_id", "type");

-- CreateIndex
CREATE INDEX "behavior_categories_school_id_is_active_idx" ON "behavior_categories"("school_id", "is_active");

-- CreateIndex
CREATE INDEX "behavior_categories_school_id_sort_order_idx" ON "behavior_categories"("school_id", "sort_order");

-- CreateIndex
CREATE INDEX "behavior_categories_created_by_id_idx" ON "behavior_categories"("created_by_id");

-- CreateIndex
CREATE INDEX "behavior_categories_deleted_at_idx" ON "behavior_categories"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_categories_school_id_code_key" ON "behavior_categories"("school_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_categories_id_school_id_key" ON "behavior_categories"("id", "school_id");

-- CreateIndex
CREATE INDEX "behavior_records_school_id_idx" ON "behavior_records"("school_id");

-- CreateIndex
CREATE INDEX "behavior_records_academic_year_id_idx" ON "behavior_records"("academic_year_id");

-- CreateIndex
CREATE INDEX "behavior_records_term_id_idx" ON "behavior_records"("term_id");

-- CreateIndex
CREATE INDEX "behavior_records_student_id_idx" ON "behavior_records"("student_id");

-- CreateIndex
CREATE INDEX "behavior_records_enrollment_id_idx" ON "behavior_records"("enrollment_id");

-- CreateIndex
CREATE INDEX "behavior_records_category_id_idx" ON "behavior_records"("category_id");

-- CreateIndex
CREATE INDEX "behavior_records_created_by_id_idx" ON "behavior_records"("created_by_id");

-- CreateIndex
CREATE INDEX "behavior_records_submitted_by_id_idx" ON "behavior_records"("submitted_by_id");

-- CreateIndex
CREATE INDEX "behavior_records_reviewed_by_id_idx" ON "behavior_records"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "behavior_records_cancelled_by_id_idx" ON "behavior_records"("cancelled_by_id");

-- CreateIndex
CREATE INDEX "behavior_records_school_id_academic_year_id_term_id_idx" ON "behavior_records"("school_id", "academic_year_id", "term_id");

-- CreateIndex
CREATE INDEX "behavior_records_school_id_student_id_status_idx" ON "behavior_records"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "behavior_records_school_id_type_status_idx" ON "behavior_records"("school_id", "type", "status");

-- CreateIndex
CREATE INDEX "behavior_records_school_id_occurred_at_idx" ON "behavior_records"("school_id", "occurred_at");

-- CreateIndex
CREATE INDEX "behavior_records_school_id_status_occurred_at_idx" ON "behavior_records"("school_id", "status", "occurred_at");

-- CreateIndex
CREATE INDEX "behavior_records_deleted_at_idx" ON "behavior_records"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_records_id_school_id_key" ON "behavior_records"("id", "school_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_school_id_idx" ON "behavior_point_ledger"("school_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_academic_year_id_idx" ON "behavior_point_ledger"("academic_year_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_term_id_idx" ON "behavior_point_ledger"("term_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_student_id_idx" ON "behavior_point_ledger"("student_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_enrollment_id_idx" ON "behavior_point_ledger"("enrollment_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_record_id_idx" ON "behavior_point_ledger"("record_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_category_id_idx" ON "behavior_point_ledger"("category_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_actor_id_idx" ON "behavior_point_ledger"("actor_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_school_id_student_id_occurred_at_idx" ON "behavior_point_ledger"("school_id", "student_id", "occurred_at");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_school_id_academic_year_id_term_id_st_idx" ON "behavior_point_ledger"("school_id", "academic_year_id", "term_id", "student_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_school_id_entry_type_idx" ON "behavior_point_ledger"("school_id", "entry_type");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_point_ledger_id_school_id_key" ON "behavior_point_ledger"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_policies_school_id_idx" ON "communication_policies"("school_id");

-- CreateIndex
CREATE INDEX "communication_policies_created_by_id_idx" ON "communication_policies"("created_by_id");

-- CreateIndex
CREATE INDEX "communication_policies_updated_by_id_idx" ON "communication_policies"("updated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_policies_school_id_key" ON "communication_policies"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_policies_id_school_id_key" ON "communication_policies"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_conversations_school_id_idx" ON "communication_conversations"("school_id");

-- CreateIndex
CREATE INDEX "communication_conversations_school_id_type_idx" ON "communication_conversations"("school_id", "type");

-- CreateIndex
CREATE INDEX "communication_conversations_school_id_status_idx" ON "communication_conversations"("school_id", "status");

-- CreateIndex
CREATE INDEX "communication_conversations_school_id_type_status_idx" ON "communication_conversations"("school_id", "type", "status");

-- CreateIndex
CREATE INDEX "communication_conversations_academic_year_id_idx" ON "communication_conversations"("academic_year_id");

-- CreateIndex
CREATE INDEX "communication_conversations_term_id_idx" ON "communication_conversations"("term_id");

-- CreateIndex
CREATE INDEX "communication_conversations_stage_id_idx" ON "communication_conversations"("stage_id");

-- CreateIndex
CREATE INDEX "communication_conversations_grade_id_idx" ON "communication_conversations"("grade_id");

-- CreateIndex
CREATE INDEX "communication_conversations_section_id_idx" ON "communication_conversations"("section_id");

-- CreateIndex
CREATE INDEX "communication_conversations_classroom_id_idx" ON "communication_conversations"("classroom_id");

-- CreateIndex
CREATE INDEX "communication_conversations_subject_id_idx" ON "communication_conversations"("subject_id");

-- CreateIndex
CREATE INDEX "communication_conversations_avatar_file_id_idx" ON "communication_conversations"("avatar_file_id");

-- CreateIndex
CREATE INDEX "communication_conversations_created_by_id_idx" ON "communication_conversations"("created_by_id");

-- CreateIndex
CREATE INDEX "communication_conversations_archived_by_id_idx" ON "communication_conversations"("archived_by_id");

-- CreateIndex
CREATE INDEX "communication_conversations_closed_by_id_idx" ON "communication_conversations"("closed_by_id");

-- CreateIndex
CREATE INDEX "communication_conversations_last_message_at_idx" ON "communication_conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "communication_conversations_deleted_at_idx" ON "communication_conversations"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "communication_conversations_id_school_id_key" ON "communication_conversations"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_conversation_participants_school_id_idx" ON "communication_conversation_participants"("school_id");

-- CreateIndex
CREATE INDEX "communication_conversation_participants_conversation_id_idx" ON "communication_conversation_participants"("conversation_id");

-- CreateIndex
CREATE INDEX "communication_conversation_participants_user_id_idx" ON "communication_conversation_participants"("user_id");

-- CreateIndex
CREATE INDEX "communication_conversation_participants_school_id_user_id_idx" ON "communication_conversation_participants"("school_id", "user_id");

-- CreateIndex
CREATE INDEX "communication_conversation_participants_school_id_conversat_idx" ON "communication_conversation_participants"("school_id", "conversation_id", "status");

-- CreateIndex
CREATE INDEX "communication_conversation_participants_role_idx" ON "communication_conversation_participants"("role");

-- CreateIndex
CREATE INDEX "communication_conversation_participants_invited_by_id_idx" ON "communication_conversation_participants"("invited_by_id");

-- CreateIndex
CREATE INDEX "communication_conversation_participants_removed_by_id_idx" ON "communication_conversation_participants"("removed_by_id");

-- CreateIndex
CREATE INDEX "communication_conversation_participants_last_read_message_i_idx" ON "communication_conversation_participants"("last_read_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_conversation_participants_conversation_id_use_key" ON "communication_conversation_participants"("conversation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_conversation_participants_id_school_id_key" ON "communication_conversation_participants"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_conversation_invites_school_id_idx" ON "communication_conversation_invites"("school_id");

-- CreateIndex
CREATE INDEX "communication_conversation_invites_conversation_id_idx" ON "communication_conversation_invites"("conversation_id");

-- CreateIndex
CREATE INDEX "communication_conversation_invites_invited_user_id_idx" ON "communication_conversation_invites"("invited_user_id");

-- CreateIndex
CREATE INDEX "communication_conversation_invites_invited_by_id_idx" ON "communication_conversation_invites"("invited_by_id");

-- CreateIndex
CREATE INDEX "communication_conversation_invites_school_id_invited_user_i_idx" ON "communication_conversation_invites"("school_id", "invited_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "communication_conversation_invites_id_school_id_key" ON "communication_conversation_invites"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_conversation_join_requests_school_id_idx" ON "communication_conversation_join_requests"("school_id");

-- CreateIndex
CREATE INDEX "communication_conversation_join_requests_conversation_id_idx" ON "communication_conversation_join_requests"("conversation_id");

-- CreateIndex
CREATE INDEX "communication_conversation_join_requests_requested_by_id_idx" ON "communication_conversation_join_requests"("requested_by_id");

-- CreateIndex
CREATE INDEX "communication_conversation_join_requests_reviewed_by_id_idx" ON "communication_conversation_join_requests"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "communication_conversation_join_requests_school_id_requeste_idx" ON "communication_conversation_join_requests"("school_id", "requested_by_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "communication_conversation_join_requests_id_school_id_key" ON "communication_conversation_join_requests"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_messages_school_id_idx" ON "communication_messages"("school_id");

-- CreateIndex
CREATE INDEX "communication_messages_conversation_id_idx" ON "communication_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "communication_messages_sender_user_id_idx" ON "communication_messages"("sender_user_id");

-- CreateIndex
CREATE INDEX "communication_messages_school_id_conversation_id_sent_at_idx" ON "communication_messages"("school_id", "conversation_id", "sent_at");

-- CreateIndex
CREATE INDEX "communication_messages_school_id_conversation_id_status_idx" ON "communication_messages"("school_id", "conversation_id", "status");

-- CreateIndex
CREATE INDEX "communication_messages_kind_idx" ON "communication_messages"("kind");

-- CreateIndex
CREATE INDEX "communication_messages_reply_to_message_id_idx" ON "communication_messages"("reply_to_message_id");

-- CreateIndex
CREATE INDEX "communication_messages_forwarded_from_message_id_idx" ON "communication_messages"("forwarded_from_message_id");

-- CreateIndex
CREATE INDEX "communication_messages_hidden_by_id_idx" ON "communication_messages"("hidden_by_id");

-- CreateIndex
CREATE INDEX "communication_messages_deleted_by_id_idx" ON "communication_messages"("deleted_by_id");

-- CreateIndex
CREATE INDEX "communication_messages_sent_at_idx" ON "communication_messages"("sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "communication_messages_id_school_id_key" ON "communication_messages"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_messages_conversation_id_sender_user_id_clien_key" ON "communication_messages"("conversation_id", "sender_user_id", "client_message_id");

-- CreateIndex
CREATE INDEX "communication_message_reads_school_id_idx" ON "communication_message_reads"("school_id");

-- CreateIndex
CREATE INDEX "communication_message_reads_conversation_id_idx" ON "communication_message_reads"("conversation_id");

-- CreateIndex
CREATE INDEX "communication_message_reads_message_id_idx" ON "communication_message_reads"("message_id");

-- CreateIndex
CREATE INDEX "communication_message_reads_user_id_idx" ON "communication_message_reads"("user_id");

-- CreateIndex
CREATE INDEX "communication_message_reads_school_id_user_id_read_at_idx" ON "communication_message_reads"("school_id", "user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "communication_message_reads_message_id_user_id_key" ON "communication_message_reads"("message_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_message_reads_id_school_id_key" ON "communication_message_reads"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_message_deliveries_school_id_idx" ON "communication_message_deliveries"("school_id");

-- CreateIndex
CREATE INDEX "communication_message_deliveries_conversation_id_idx" ON "communication_message_deliveries"("conversation_id");

-- CreateIndex
CREATE INDEX "communication_message_deliveries_message_id_idx" ON "communication_message_deliveries"("message_id");

-- CreateIndex
CREATE INDEX "communication_message_deliveries_recipient_user_id_idx" ON "communication_message_deliveries"("recipient_user_id");

-- CreateIndex
CREATE INDEX "communication_message_deliveries_school_id_recipient_user_i_idx" ON "communication_message_deliveries"("school_id", "recipient_user_id", "status");

-- CreateIndex
CREATE INDEX "communication_message_deliveries_status_idx" ON "communication_message_deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "communication_message_deliveries_message_id_recipient_user__key" ON "communication_message_deliveries"("message_id", "recipient_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_message_deliveries_id_school_id_key" ON "communication_message_deliveries"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_message_reactions_school_id_idx" ON "communication_message_reactions"("school_id");

-- CreateIndex
CREATE INDEX "communication_message_reactions_conversation_id_idx" ON "communication_message_reactions"("conversation_id");

-- CreateIndex
CREATE INDEX "communication_message_reactions_message_id_idx" ON "communication_message_reactions"("message_id");

-- CreateIndex
CREATE INDEX "communication_message_reactions_user_id_idx" ON "communication_message_reactions"("user_id");

-- CreateIndex
CREATE INDEX "communication_message_reactions_reaction_key_idx" ON "communication_message_reactions"("reaction_key");

-- CreateIndex
CREATE UNIQUE INDEX "communication_message_reactions_message_id_user_id_reaction_key" ON "communication_message_reactions"("message_id", "user_id", "reaction_key");

-- CreateIndex
CREATE UNIQUE INDEX "communication_message_reactions_id_school_id_key" ON "communication_message_reactions"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_message_attachments_school_id_idx" ON "communication_message_attachments"("school_id");

-- CreateIndex
CREATE INDEX "communication_message_attachments_conversation_id_idx" ON "communication_message_attachments"("conversation_id");

-- CreateIndex
CREATE INDEX "communication_message_attachments_message_id_idx" ON "communication_message_attachments"("message_id");

-- CreateIndex
CREATE INDEX "communication_message_attachments_file_id_idx" ON "communication_message_attachments"("file_id");

-- CreateIndex
CREATE INDEX "communication_message_attachments_uploaded_by_id_idx" ON "communication_message_attachments"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "communication_message_attachments_deleted_at_idx" ON "communication_message_attachments"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "communication_message_attachments_id_school_id_key" ON "communication_message_attachments"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_message_attachments_message_id_file_id_key" ON "communication_message_attachments"("message_id", "file_id");

-- CreateIndex
CREATE INDEX "communication_message_reports_school_id_idx" ON "communication_message_reports"("school_id");

-- CreateIndex
CREATE INDEX "communication_message_reports_conversation_id_idx" ON "communication_message_reports"("conversation_id");

-- CreateIndex
CREATE INDEX "communication_message_reports_message_id_idx" ON "communication_message_reports"("message_id");

-- CreateIndex
CREATE INDEX "communication_message_reports_reporter_user_id_idx" ON "communication_message_reports"("reporter_user_id");

-- CreateIndex
CREATE INDEX "communication_message_reports_reviewed_by_id_idx" ON "communication_message_reports"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "communication_message_reports_school_id_status_idx" ON "communication_message_reports"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "communication_message_reports_message_id_reporter_user_id_key" ON "communication_message_reports"("message_id", "reporter_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_message_reports_id_school_id_key" ON "communication_message_reports"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_moderation_actions_school_id_idx" ON "communication_moderation_actions"("school_id");

-- CreateIndex
CREATE INDEX "communication_moderation_actions_conversation_id_idx" ON "communication_moderation_actions"("conversation_id");

-- CreateIndex
CREATE INDEX "communication_moderation_actions_message_id_idx" ON "communication_moderation_actions"("message_id");

-- CreateIndex
CREATE INDEX "communication_moderation_actions_target_user_id_idx" ON "communication_moderation_actions"("target_user_id");

-- CreateIndex
CREATE INDEX "communication_moderation_actions_actor_user_id_idx" ON "communication_moderation_actions"("actor_user_id");

-- CreateIndex
CREATE INDEX "communication_moderation_actions_action_type_idx" ON "communication_moderation_actions"("action_type");

-- CreateIndex
CREATE INDEX "communication_moderation_actions_created_at_idx" ON "communication_moderation_actions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "communication_moderation_actions_id_school_id_key" ON "communication_moderation_actions"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_user_blocks_school_id_idx" ON "communication_user_blocks"("school_id");

-- CreateIndex
CREATE INDEX "communication_user_blocks_blocker_user_id_idx" ON "communication_user_blocks"("blocker_user_id");

-- CreateIndex
CREATE INDEX "communication_user_blocks_blocked_user_id_idx" ON "communication_user_blocks"("blocked_user_id");

-- CreateIndex
CREATE INDEX "communication_user_blocks_school_id_blocker_user_id_blocked_idx" ON "communication_user_blocks"("school_id", "blocker_user_id", "blocked_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_user_blocks_id_school_id_key" ON "communication_user_blocks"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_user_restrictions_school_id_idx" ON "communication_user_restrictions"("school_id");

-- CreateIndex
CREATE INDEX "communication_user_restrictions_target_user_id_idx" ON "communication_user_restrictions"("target_user_id");

-- CreateIndex
CREATE INDEX "communication_user_restrictions_restricted_by_id_idx" ON "communication_user_restrictions"("restricted_by_id");

-- CreateIndex
CREATE INDEX "communication_user_restrictions_lifted_by_id_idx" ON "communication_user_restrictions"("lifted_by_id");

-- CreateIndex
CREATE INDEX "communication_user_restrictions_restriction_type_idx" ON "communication_user_restrictions"("restriction_type");

-- CreateIndex
CREATE INDEX "communication_user_restrictions_school_id_target_user_id_re_idx" ON "communication_user_restrictions"("school_id", "target_user_id", "restriction_type");

-- CreateIndex
CREATE UNIQUE INDEX "communication_user_restrictions_id_school_id_key" ON "communication_user_restrictions"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_announcements_school_id_idx" ON "communication_announcements"("school_id");

-- CreateIndex
CREATE INDEX "communication_announcements_school_id_status_idx" ON "communication_announcements"("school_id", "status");

-- CreateIndex
CREATE INDEX "communication_announcements_school_id_created_at_idx" ON "communication_announcements"("school_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "communication_announcements_school_id_published_at_idx" ON "communication_announcements"("school_id", "published_at" DESC);

-- CreateIndex
CREATE INDEX "communication_announcements_school_id_audience_type_idx" ON "communication_announcements"("school_id", "audience_type");

-- CreateIndex
CREATE INDEX "communication_announcements_image_file_id_idx" ON "communication_announcements"("image_file_id");

-- CreateIndex
CREATE INDEX "communication_announcements_created_by_id_idx" ON "communication_announcements"("created_by_id");

-- CreateIndex
CREATE INDEX "communication_announcements_updated_by_id_idx" ON "communication_announcements"("updated_by_id");

-- CreateIndex
CREATE INDEX "communication_announcements_published_by_id_idx" ON "communication_announcements"("published_by_id");

-- CreateIndex
CREATE INDEX "communication_announcements_archived_by_id_idx" ON "communication_announcements"("archived_by_id");

-- CreateIndex
CREATE INDEX "communication_announcements_scheduled_at_idx" ON "communication_announcements"("scheduled_at");

-- CreateIndex
CREATE INDEX "communication_announcements_expires_at_idx" ON "communication_announcements"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "communication_announcements_id_school_id_key" ON "communication_announcements"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_school_id_idx" ON "communication_announcement_audiences"("school_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_announcement_id_idx" ON "communication_announcement_audiences"("announcement_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_audience_type_idx" ON "communication_announcement_audiences"("audience_type");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_school_id_audience_typ_idx" ON "communication_announcement_audiences"("school_id", "audience_type");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_stage_id_idx" ON "communication_announcement_audiences"("stage_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_grade_id_idx" ON "communication_announcement_audiences"("grade_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_section_id_idx" ON "communication_announcement_audiences"("section_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_classroom_id_idx" ON "communication_announcement_audiences"("classroom_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_student_id_idx" ON "communication_announcement_audiences"("student_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_guardian_id_idx" ON "communication_announcement_audiences"("guardian_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_user_id_idx" ON "communication_announcement_audiences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_announcement_audiences_id_school_id_key" ON "communication_announcement_audiences"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_announcement_reads_school_id_idx" ON "communication_announcement_reads"("school_id");

-- CreateIndex
CREATE INDEX "communication_announcement_reads_announcement_id_idx" ON "communication_announcement_reads"("announcement_id");

-- CreateIndex
CREATE INDEX "communication_announcement_reads_user_id_idx" ON "communication_announcement_reads"("user_id");

-- CreateIndex
CREATE INDEX "communication_announcement_reads_school_id_user_id_read_at_idx" ON "communication_announcement_reads"("school_id", "user_id", "read_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "communication_announcement_reads_announcement_id_user_id_key" ON "communication_announcement_reads"("announcement_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_announcement_reads_id_school_id_key" ON "communication_announcement_reads"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_announcement_attachments_school_id_idx" ON "communication_announcement_attachments"("school_id");

-- CreateIndex
CREATE INDEX "communication_announcement_attachments_announcement_id_idx" ON "communication_announcement_attachments"("announcement_id");

-- CreateIndex
CREATE INDEX "communication_announcement_attachments_file_id_idx" ON "communication_announcement_attachments"("file_id");

-- CreateIndex
CREATE INDEX "communication_announcement_attachments_created_by_id_idx" ON "communication_announcement_attachments"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_announcement_attachments_id_school_id_key" ON "communication_announcement_attachments"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_announcement_attachments_announcement_id_file_key" ON "communication_announcement_attachments"("announcement_id", "file_id");

-- CreateIndex
CREATE INDEX "communication_notifications_school_id_idx" ON "communication_notifications"("school_id");

-- CreateIndex
CREATE INDEX "communication_notifications_recipient_user_id_idx" ON "communication_notifications"("recipient_user_id");

-- CreateIndex
CREATE INDEX "communication_notifications_actor_user_id_idx" ON "communication_notifications"("actor_user_id");

-- CreateIndex
CREATE INDEX "communication_notifications_template_id_idx" ON "communication_notifications"("template_id");

-- CreateIndex
CREATE INDEX "communication_notifications_school_id_recipient_user_id_idx" ON "communication_notifications"("school_id", "recipient_user_id");

-- CreateIndex
CREATE INDEX "communication_notifications_school_id_recipient_user_id_sta_idx" ON "communication_notifications"("school_id", "recipient_user_id", "status");

-- CreateIndex
CREATE INDEX "communication_notifications_school_id_recipient_user_id_sou_idx" ON "communication_notifications"("school_id", "recipient_user_id", "source_module", "created_at" DESC);

-- CreateIndex
CREATE INDEX "communication_notifications_school_id_created_at_idx" ON "communication_notifications"("school_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "communication_notifications_school_id_source_module_source__idx" ON "communication_notifications"("school_id", "source_module", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "communication_notifications_status_idx" ON "communication_notifications"("status");

-- CreateIndex
CREATE INDEX "communication_notifications_type_idx" ON "communication_notifications"("type");

-- CreateIndex
CREATE INDEX "communication_notifications_expires_at_idx" ON "communication_notifications"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "communication_notifications_id_school_id_key" ON "communication_notifications"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "comm_notif_school_idempotency_key" ON "communication_notifications"("school_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "communication_notification_deliveries_school_id_idx" ON "communication_notification_deliveries"("school_id");

-- CreateIndex
CREATE INDEX "communication_notification_deliveries_notification_id_idx" ON "communication_notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "communication_notification_deliveries_school_id_channel_sta_idx" ON "communication_notification_deliveries"("school_id", "channel", "status");

-- CreateIndex
CREATE INDEX "communication_notification_deliveries_channel_idx" ON "communication_notification_deliveries"("channel");

-- CreateIndex
CREATE INDEX "communication_notification_deliveries_status_idx" ON "communication_notification_deliveries"("status");

-- CreateIndex
CREATE INDEX "communication_notification_deliveries_provider_message_id_idx" ON "communication_notification_deliveries"("provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_notification_deliveries_id_school_id_key" ON "communication_notification_deliveries"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_notification_push_attempts_school_id_idx" ON "communication_notification_push_attempts"("school_id");

-- CreateIndex
CREATE INDEX "communication_notification_push_attempts_delivery_id_idx" ON "communication_notification_push_attempts"("delivery_id");

-- CreateIndex
CREATE INDEX "communication_notification_push_attempts_device_token_id_idx" ON "communication_notification_push_attempts"("device_token_id");

-- CreateIndex
CREATE INDEX "communication_notification_push_attempts_school_id_delivery_idx" ON "communication_notification_push_attempts"("school_id", "delivery_id");

-- CreateIndex
CREATE INDEX "communication_notification_push_attempts_school_id_status_idx" ON "communication_notification_push_attempts"("school_id", "status");

-- CreateIndex
CREATE INDEX "communication_notification_push_attempts_school_id_device_t_idx" ON "communication_notification_push_attempts"("school_id", "device_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_notification_push_attempts_delivery_id_device_key" ON "communication_notification_push_attempts"("delivery_id", "device_token_id");

-- CreateIndex
CREATE INDEX "communication_notification_preferences_school_id_idx" ON "communication_notification_preferences"("school_id");

-- CreateIndex
CREATE INDEX "communication_notification_preferences_user_id_idx" ON "communication_notification_preferences"("user_id");

-- CreateIndex
CREATE INDEX "communication_notification_preferences_school_user_idx" ON "communication_notification_preferences"("school_id", "user_id");

-- CreateIndex
CREATE INDEX "communication_notification_preferences_category_idx" ON "communication_notification_preferences"("category");

-- CreateIndex
CREATE UNIQUE INDEX "communication_notification_preferences_id_school_id_key" ON "communication_notification_preferences"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "comm_notif_pref_school_user_category_key" ON "communication_notification_preferences"("school_id", "user_id", "category");

-- CreateIndex
CREATE INDEX "app_device_tokens_school_id_idx" ON "app_device_tokens"("school_id");

-- CreateIndex
CREATE INDEX "app_device_tokens_user_id_idx" ON "app_device_tokens"("user_id");

-- CreateIndex
CREATE INDEX "app_device_tokens_school_id_user_id_idx" ON "app_device_tokens"("school_id", "user_id");

-- CreateIndex
CREATE INDEX "app_device_tokens_school_id_user_id_app_surface_idx" ON "app_device_tokens"("school_id", "user_id", "app_surface");

-- CreateIndex
CREATE INDEX "app_device_tokens_school_id_app_surface_is_active_idx" ON "app_device_tokens"("school_id", "app_surface", "is_active");

-- CreateIndex
CREATE INDEX "app_device_tokens_token_hash_idx" ON "app_device_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "app_device_tokens_revoked_at_idx" ON "app_device_tokens"("revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_device_tokens_id_school_id_key" ON "app_device_tokens"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_device_tokens_school_id_user_id_token_hash_app_surface_key" ON "app_device_tokens"("school_id", "user_id", "token_hash", "app_surface");

-- CreateIndex
CREATE INDEX "audit_logs_school_id_created_at_idx" ON "audit_logs"("school_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_module_action_idx" ON "audit_logs"("module", "action");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "files_organization_id_idx" ON "files"("organization_id");

-- CreateIndex
CREATE INDEX "files_school_id_idx" ON "files"("school_id");

-- CreateIndex
CREATE INDEX "files_uploader_id_idx" ON "files"("uploader_id");

-- CreateIndex
CREATE INDEX "files_visibility_idx" ON "files"("visibility");

-- CreateIndex
CREATE INDEX "files_deleted_at_idx" ON "files"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "files_bucket_object_key_key" ON "files"("bucket", "object_key");

-- CreateIndex
CREATE INDEX "attachments_file_id_idx" ON "attachments"("file_id");

-- CreateIndex
CREATE INDEX "attachments_school_id_idx" ON "attachments"("school_id");

-- CreateIndex
CREATE INDEX "attachments_school_id_resource_type_resource_id_idx" ON "attachments"("school_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "attachments_created_by_id_idx" ON "attachments"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_file_id_resource_type_resource_id_key" ON "attachments"("file_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "import_jobs_school_id_idx" ON "import_jobs"("school_id");

-- CreateIndex
CREATE INDEX "import_jobs_school_id_status_created_at_idx" ON "import_jobs"("school_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "import_jobs_school_id_type_idx" ON "import_jobs"("school_id", "type");

-- CreateIndex
CREATE INDEX "import_jobs_uploaded_file_id_idx" ON "import_jobs"("uploaded_file_id");

-- CreateIndex
CREATE INDEX "import_jobs_created_by_id_idx" ON "import_jobs"("created_by_id");

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_entitlements" ADD CONSTRAINT "school_entitlements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_entitlements" ADD CONSTRAINT "school_entitlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_feature_controls" ADD CONSTRAINT "school_feature_controls_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_feature_controls" ADD CONSTRAINT "school_feature_controls_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_profiles" ADD CONSTRAINT "applicant_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_profile" ADD CONSTRAINT "settings_school_profile_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_profile" ADD CONSTRAINT "settings_school_profile_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_security_controls" ADD CONSTRAINT "settings_security_controls_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_security_controls" ADD CONSTRAINT "settings_security_controls_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_login_settings" ADD CONSTRAINT "settings_school_login_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_email_connections" ADD CONSTRAINT "settings_school_email_connections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_email_templates" ADD CONSTRAINT "settings_school_email_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_email_delivery_batches" ADD CONSTRAINT "settings_school_email_delivery_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_email_delivery_recipients" ADD CONSTRAINT "settings_school_email_delivery_recipients_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_email_delivery_recipients" ADD CONSTRAINT "settings_school_email_delivery_recipients_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "settings_school_email_delivery_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_email_delivery_recipients" ADD CONSTRAINT "settings_school_email_delivery_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_notification_templates" ADD CONSTRAINT "settings_notification_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_notification_template_channel_states" ADD CONSTRAINT "settings_notification_template_channel_states_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_notification_template_channel_states" ADD CONSTRAINT "settings_notification_template_channel_states_notification_fkey" FOREIGN KEY ("notification_template_id", "school_id") REFERENCES "settings_notification_templates"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_integration_provider_fields" ADD CONSTRAINT "settings_integration_provider_fields_integration_provider__fkey" FOREIGN KEY ("integration_provider_id") REFERENCES "settings_integration_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_integration_connections" ADD CONSTRAINT "settings_integration_connections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_integration_connections" ADD CONSTRAINT "settings_integration_connections_integration_provider_id_fkey" FOREIGN KEY ("integration_provider_id") REFERENCES "settings_integration_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_backup_jobs" ADD CONSTRAINT "settings_backup_jobs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_backup_jobs" ADD CONSTRAINT "settings_backup_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_settings" ADD CONSTRAINT "dismissal_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_settings" ADD CONSTRAINT "dismissal_settings_default_gate_id_school_id_fkey" FOREIGN KEY ("default_gate_id", "school_id") REFERENCES "dismissal_gates"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_settings" ADD CONSTRAINT "dismissal_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_gates" ADD CONSTRAINT "dismissal_gates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_gate_id_school_id_fkey" FOREIGN KEY ("gate_id", "school_id") REFERENCES "dismissal_gates"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_guardian_id_school_id_fkey" FOREIGN KEY ("guardian_id", "school_id") REFERENCES "guardians"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_handed_over_by_id_fkey" FOREIGN KEY ("handed_over_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_gate_id_school_id_fkey" FOREIGN KEY ("gate_id", "school_id") REFERENCES "dismissal_gates"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_request_events" ADD CONSTRAINT "dismissal_request_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_request_events" ADD CONSTRAINT "dismissal_request_events_request_id_school_id_fkey" FOREIGN KEY ("request_id", "school_id") REFERENCES "dismissal_requests"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_request_events" ADD CONSTRAINT "dismissal_request_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_leads" ADD CONSTRAINT "admission_leads_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_leads" ADD CONSTRAINT "admission_leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_leads" ADD CONSTRAINT "admission_leads_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_lead_id_school_id_fkey" FOREIGN KEY ("lead_id", "school_id") REFERENCES "admission_leads"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_requested_academic_year_id_school_i_fkey" FOREIGN KEY ("requested_academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_requested_grade_id_school_id_fkey" FOREIGN KEY ("requested_grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_requests" ADD CONSTRAINT "applicant_admission_requests_applicant_user_id_fkey" FOREIGN KEY ("applicant_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_requests" ADD CONSTRAINT "applicant_admission_requests_applicant_profile_id_fkey" FOREIGN KEY ("applicant_profile_id") REFERENCES "applicant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_requests" ADD CONSTRAINT "applicant_admission_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_requests" ADD CONSTRAINT "applicant_admission_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_requests" ADD CONSTRAINT "applicant_admission_requests_requested_academic_year_id_sc_fkey" FOREIGN KEY ("requested_academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_requests" ADD CONSTRAINT "applicant_admission_requests_requested_grade_id_school_id_fkey" FOREIGN KEY ("requested_grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_requests" ADD CONSTRAINT "applicant_admission_requests_application_id_school_id_fkey" FOREIGN KEY ("application_id", "school_id") REFERENCES "admission_applications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_required_documents" ADD CONSTRAINT "admission_required_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_required_documents" ADD CONSTRAINT "admission_required_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_required_documents" ADD CONSTRAINT "admission_required_documents_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_workflow_policies" ADD CONSTRAINT "admission_workflow_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_workflow_policies" ADD CONSTRAINT "admission_workflow_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_application_documents" ADD CONSTRAINT "admission_application_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_application_documents" ADD CONSTRAINT "admission_application_documents_application_id_school_id_fkey" FOREIGN KEY ("application_id", "school_id") REFERENCES "admission_applications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_application_documents" ADD CONSTRAINT "admission_application_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_request_documents" ADD CONSTRAINT "applicant_admission_request_documents_request_id_school_id_fkey" FOREIGN KEY ("request_id", "school_id") REFERENCES "applicant_admission_requests"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_request_documents" ADD CONSTRAINT "applicant_admission_request_documents_applicant_user_id_fkey" FOREIGN KEY ("applicant_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_request_documents" ADD CONSTRAINT "applicant_admission_request_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_request_documents" ADD CONSTRAINT "applicant_admission_request_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_request_documents" ADD CONSTRAINT "applicant_admission_request_documents_required_document_id_fkey" FOREIGN KEY ("required_document_id", "school_id") REFERENCES "admission_required_documents"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_request_documents" ADD CONSTRAINT "applicant_admission_request_documents_application_document_fkey" FOREIGN KEY ("application_document_id") REFERENCES "admission_application_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_admission_request_documents" ADD CONSTRAINT "applicant_admission_request_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_tests" ADD CONSTRAINT "admission_tests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_tests" ADD CONSTRAINT "admission_tests_application_id_school_id_fkey" FOREIGN KEY ("application_id", "school_id") REFERENCES "admission_applications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_tests" ADD CONSTRAINT "admission_tests_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_interviews" ADD CONSTRAINT "admission_interviews_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_interviews" ADD CONSTRAINT "admission_interviews_application_id_school_id_fkey" FOREIGN KEY ("application_id", "school_id") REFERENCES "admission_applications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_interviews" ADD CONSTRAINT "admission_interviews_interviewer_user_id_fkey" FOREIGN KEY ("interviewer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_application_id_school_id_fkey" FOREIGN KEY ("application_id", "school_id") REFERENCES "admission_applications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stages" ADD CONSTRAINT "stages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_room_id_school_id_fkey" FOREIGN KEY ("room_id", "school_id") REFERENCES "rooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_allocations" ADD CONSTRAINT "subject_allocations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_allocations" ADD CONSTRAINT "subject_allocations_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_allocations" ADD CONSTRAINT "subject_allocations_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_allocations" ADD CONSTRAINT "subject_allocations_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_allocations" ADD CONSTRAINT "subject_allocations_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_allocations" ADD CONSTRAINT "teacher_subject_allocations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_allocations" ADD CONSTRAINT "teacher_subject_allocations_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_allocations" ADD CONSTRAINT "teacher_subject_allocations_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_allocations" ADD CONSTRAINT "teacher_subject_allocations_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_allocations" ADD CONSTRAINT "teacher_subject_allocations_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_units" ADD CONSTRAINT "curriculum_units_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_units" ADD CONSTRAINT "curriculum_units_curriculum_id_school_id_fkey" FOREIGN KEY ("curriculum_id", "school_id") REFERENCES "curricula"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_lessons" ADD CONSTRAINT "curriculum_lessons_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_lessons" ADD CONSTRAINT "curriculum_lessons_curriculum_id_school_id_fkey" FOREIGN KEY ("curriculum_id", "school_id") REFERENCES "curricula"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_lessons" ADD CONSTRAINT "curriculum_lessons_unit_id_school_id_fkey" FOREIGN KEY ("unit_id", "school_id") REFERENCES "curriculum_units"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_curriculum_id_school_id_fkey" FOREIGN KEY ("curriculum_id", "school_id") REFERENCES "curricula"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_unit_id_school_id_fkey" FOREIGN KEY ("unit_id", "school_id") REFERENCES "curriculum_units"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_lesson_id_school_id_fkey" FOREIGN KEY ("lesson_id", "school_id") REFERENCES "curriculum_lessons"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_teacher_subject_allocation_id_school_id_fkey" FOREIGN KEY ("teacher_subject_allocation_id", "school_id") REFERENCES "teacher_subject_allocations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_curriculum_id_school_id_fkey" FOREIGN KEY ("curriculum_id", "school_id") REFERENCES "curricula"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_lesson_plan_id_school_id_fkey" FOREIGN KEY ("lesson_plan_id", "school_id") REFERENCES "lesson_plans"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_curriculum_id_school_id_fkey" FOREIGN KEY ("curriculum_id", "school_id") REFERENCES "curricula"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_unit_id_school_id_fkey" FOREIGN KEY ("unit_id", "school_id") REFERENCES "curriculum_units"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_lesson_id_school_id_fkey" FOREIGN KEY ("lesson_id", "school_id") REFERENCES "curriculum_lessons"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_timetable_entry_id_school_id_fkey" FOREIGN KEY ("timetable_entry_id", "school_id") REFERENCES "timetable_entries"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_rescheduled_from_item_id_school_id_fkey" FOREIGN KEY ("rescheduled_from_item_id", "school_id") REFERENCES "lesson_plan_items"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_configs" ADD CONSTRAINT "timetable_configs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_configs" ADD CONSTRAINT "timetable_configs_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_configs" ADD CONSTRAINT "timetable_configs_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_configs" ADD CONSTRAINT "timetable_configs_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_configs" ADD CONSTRAINT "timetable_configs_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_configs" ADD CONSTRAINT "timetable_configs_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_timetable_config_id_school_id_fkey" FOREIGN KEY ("timetable_config_id", "school_id") REFERENCES "timetable_configs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_timetable_config_id_school_id_fkey" FOREIGN KEY ("timetable_config_id", "school_id") REFERENCES "timetable_configs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_period_id_school_id_fkey" FOREIGN KEY ("period_id", "school_id") REFERENCES "timetable_periods"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_teacher_subject_allocation_id_school_id_fkey" FOREIGN KEY ("teacher_subject_allocation_id", "school_id") REFERENCES "teacher_subject_allocations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_room_id_school_id_fkey" FOREIGN KEY ("room_id", "school_id") REFERENCES "rooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publications_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publications_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publications_timetable_config_id_school_id_fkey" FOREIGN KEY ("timetable_config_id", "school_id") REFERENCES "timetable_configs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publications_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_timetable_config_id_school_id_fkey" FOREIGN KEY ("timetable_config_id", "school_id") REFERENCES "timetable_configs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_entry_id_school_id_fkey" FOREIGN KEY ("entry_id", "school_id") REFERENCES "timetable_entries"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_related_entry_id_school_id_fkey" FOREIGN KEY ("related_entry_id", "school_id") REFERENCES "timetable_entries"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_period_id_school_id_fkey" FOREIGN KEY ("period_id", "school_id") REFERENCES "timetable_periods"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_room_id_school_id_fkey" FOREIGN KEY ("room_id", "school_id") REFERENCES "rooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_application_id_school_id_fkey" FOREIGN KEY ("application_id", "school_id") REFERENCES "admission_applications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardian_links" ADD CONSTRAINT "student_guardian_links_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardian_links" ADD CONSTRAINT "student_guardian_links_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardian_links" ADD CONSTRAINT "student_guardian_links_guardian_id_school_id_fkey" FOREIGN KEY ("guardian_id", "school_id") REFERENCES "guardians"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile_correction_requests" ADD CONSTRAINT "student_profile_correction_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile_correction_requests" ADD CONSTRAINT "student_profile_correction_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile_correction_requests" ADD CONSTRAINT "student_profile_correction_requests_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_medical_profiles" ADD CONSTRAINT "student_medical_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_medical_profiles" ADD CONSTRAINT "student_medical_profiles_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_policy_id_school_id_fkey" FOREIGN KEY ("policy_id", "school_id") REFERENCES "attendance_policies"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_session_id_school_id_fkey" FOREIGN KEY ("session_id", "school_id") REFERENCES "attendance_sessions"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_marked_by_id_fkey" FOREIGN KEY ("marked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_request_sessions" ADD CONSTRAINT "attendance_excuse_request_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_request_sessions" ADD CONSTRAINT "attendance_excuse_request_sessions_attendance_excuse_reque_fkey" FOREIGN KEY ("attendance_excuse_request_id", "school_id") REFERENCES "attendance_excuse_requests"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_request_sessions" ADD CONSTRAINT "attendance_excuse_request_sessions_attendance_session_id_s_fkey" FOREIGN KEY ("attendance_session_id", "school_id") REFERENCES "attendance_sessions"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_locked_by_id_fkey" FOREIGN KEY ("locked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_assessment_id_school_id_fkey" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_entered_by_id_fkey" FOREIGN KEY ("entered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessment_questions" ADD CONSTRAINT "grade_assessment_questions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessment_questions" ADD CONSTRAINT "grade_assessment_questions_assessment_id_school_id_fkey" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_options" ADD CONSTRAINT "grade_assessment_question_options_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_options" ADD CONSTRAINT "grade_assessment_question_options_assessment_id_school_id_fkey" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_options" ADD CONSTRAINT "grade_assessment_question_options_question_id_school_id_fkey" FOREIGN KEY ("question_id", "school_id") REFERENCES "grade_assessment_questions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_assessment_id_school_id_fkey" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answers" ADD CONSTRAINT "grade_submission_answers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answers" ADD CONSTRAINT "grade_submission_answers_submission_id_school_id_fkey" FOREIGN KEY ("submission_id", "school_id") REFERENCES "grade_submissions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answers" ADD CONSTRAINT "grade_submission_answers_assessment_id_school_id_fkey" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answers" ADD CONSTRAINT "grade_submission_answers_question_id_school_id_fkey" FOREIGN KEY ("question_id", "school_id") REFERENCES "grade_assessment_questions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answers" ADD CONSTRAINT "grade_submission_answers_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answers" ADD CONSTRAINT "grade_submission_answers_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answer_options" ADD CONSTRAINT "grade_submission_answer_options_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answer_options" ADD CONSTRAINT "grade_submission_answer_options_answer_id_school_id_fkey" FOREIGN KEY ("answer_id", "school_id") REFERENCES "grade_submission_answers"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answer_options" ADD CONSTRAINT "grade_submission_answer_options_option_id_school_id_fkey" FOREIGN KEY ("option_id", "school_id") REFERENCES "grade_assessment_question_options"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_rules" ADD CONSTRAINT "grade_rules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_rules" ADD CONSTRAINT "grade_rules_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_rules" ADD CONSTRAINT "grade_rules_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_rules" ADD CONSTRAINT "grade_rules_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_teacher_subject_allocation_id_school__fkey" FOREIGN KEY ("teacher_subject_allocation_id", "school_id") REFERENCES "teacher_subject_allocations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_timetable_entry_id_school_id_fkey" FOREIGN KEY ("timetable_entry_id", "school_id") REFERENCES "timetable_entries"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_grade_assessment_id_school_id_fkey" FOREIGN KEY ("grade_assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_homework_assignment_id_school_id_fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_assignment_id_school_id_fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_target_id_school_id_fkey" FOREIGN KEY ("homework_target_id", "school_id") REFERENCES "homework_targets"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_questions" ADD CONSTRAINT "homework_questions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_questions" ADD CONSTRAINT "homework_questions_homework_assignment_id_school_id_fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_questions" ADD CONSTRAINT "homework_questions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_questions" ADD CONSTRAINT "homework_questions_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_answers" ADD CONSTRAINT "homework_submission_answers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_answers" ADD CONSTRAINT "homework_submission_answers_homework_submission_id_school__fkey" FOREIGN KEY ("homework_submission_id", "school_id") REFERENCES "homework_submissions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_answers" ADD CONSTRAINT "homework_submission_answers_homework_assignment_id_school__fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_answers" ADD CONSTRAINT "homework_submission_answers_homework_target_id_school_id_fkey" FOREIGN KEY ("homework_target_id", "school_id") REFERENCES "homework_targets"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_answers" ADD CONSTRAINT "homework_submission_answers_homework_question_id_school_id_fkey" FOREIGN KEY ("homework_question_id", "school_id") REFERENCES "homework_questions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_answers" ADD CONSTRAINT "homework_submission_answers_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_submission_attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_submission_attachments_homework_submission_id_sch_fkey" FOREIGN KEY ("homework_submission_id", "school_id") REFERENCES "homework_submissions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_submission_attachments_homework_assignment_id_sch_fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_submission_attachments_homework_target_id_school__fkey" FOREIGN KEY ("homework_target_id", "school_id") REFERENCES "homework_targets"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_submission_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_submission_attachments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_question_options" ADD CONSTRAINT "homework_question_options_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_question_options" ADD CONSTRAINT "homework_question_options_homework_question_id_school_id_fkey" FOREIGN KEY ("homework_question_id", "school_id") REFERENCES "homework_questions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignment_attachments" ADD CONSTRAINT "homework_assignment_attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignment_attachments" ADD CONSTRAINT "homework_assignment_attachments_homework_assignment_id_sch_fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignment_attachments" ADD CONSTRAINT "homework_assignment_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignment_attachments" ADD CONSTRAINT "homework_assignment_attachments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_task_id_school_id_fkey" FOREIGN KEY ("task_id", "school_id") REFERENCES "reinforcement_tasks"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_assignments" ADD CONSTRAINT "reinforcement_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_assignments" ADD CONSTRAINT "reinforcement_assignments_task_id_school_id_fkey" FOREIGN KEY ("task_id", "school_id") REFERENCES "reinforcement_tasks"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_assignments" ADD CONSTRAINT "reinforcement_assignments_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_assignments" ADD CONSTRAINT "reinforcement_assignments_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_assignments" ADD CONSTRAINT "reinforcement_assignments_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_assignments" ADD CONSTRAINT "reinforcement_assignments_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_stages" ADD CONSTRAINT "reinforcement_task_stages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_stages" ADD CONSTRAINT "reinforcement_task_stages_task_id_school_id_fkey" FOREIGN KEY ("task_id", "school_id") REFERENCES "reinforcement_tasks"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_assignment_id_school_id_fkey" FOREIGN KEY ("assignment_id", "school_id") REFERENCES "reinforcement_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_task_id_school_id_fkey" FOREIGN KEY ("task_id", "school_id") REFERENCES "reinforcement_tasks"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "reinforcement_task_stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_proof_file_id_fkey" FOREIGN KEY ("proof_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_current_review_id_school_id_fkey" FOREIGN KEY ("current_review_id", "school_id") REFERENCES "reinforcement_reviews"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_submission_id_school_id_fkey" FOREIGN KEY ("submission_id", "school_id") REFERENCES "reinforcement_submissions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_assignment_id_school_id_fkey" FOREIGN KEY ("assignment_id", "school_id") REFERENCES "reinforcement_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_task_id_school_id_fkey" FOREIGN KEY ("task_id", "school_id") REFERENCES "reinforcement_tasks"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "reinforcement_task_stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_templates" ADD CONSTRAINT "reinforcement_task_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_templates" ADD CONSTRAINT "reinforcement_task_templates_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_templates" ADD CONSTRAINT "reinforcement_task_templates_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_templates" ADD CONSTRAINT "reinforcement_task_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_template_stages" ADD CONSTRAINT "reinforcement_task_template_stages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_template_stages" ADD CONSTRAINT "reinforcement_task_template_stages_template_id_school_id_fkey" FOREIGN KEY ("template_id", "school_id") REFERENCES "reinforcement_task_templates"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_policies" ADD CONSTRAINT "xp_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_policies" ADD CONSTRAINT "xp_policies_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_policies" ADD CONSTRAINT "xp_policies_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_assignment_id_school_id_fkey" FOREIGN KEY ("assignment_id", "school_id") REFERENCES "reinforcement_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_policy_id_school_id_fkey" FOREIGN KEY ("policy_id", "school_id") REFERENCES "xp_policies"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_catalog_item_id_school_id_fkey" FOREIGN KEY ("catalog_item_id", "school_id") REFERENCES "reward_catalog_items"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_fulfilled_by_id_fkey" FOREIGN KEY ("fulfilled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_badges" ADD CONSTRAINT "hero_badges_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_badges" ADD CONSTRAINT "hero_badges_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_linked_assessment_id_school_id_fkey" FOREIGN KEY ("linked_assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_badge_reward_id_school_id_fkey" FOREIGN KEY ("badge_reward_id", "school_id") REFERENCES "hero_badges"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objectives" ADD CONSTRAINT "hero_mission_objectives_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objectives" ADD CONSTRAINT "hero_mission_objectives_mission_id_school_id_fkey" FOREIGN KEY ("mission_id", "school_id") REFERENCES "hero_missions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objectives" ADD CONSTRAINT "hero_mission_objectives_linked_assessment_id_school_id_fkey" FOREIGN KEY ("linked_assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_mission_id_school_id_fkey" FOREIGN KEY ("mission_id", "school_id") REFERENCES "hero_missions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_xp_ledger_id_school_id_fkey" FOREIGN KEY ("xp_ledger_id", "school_id") REFERENCES "xp_ledger"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objective_progress" ADD CONSTRAINT "hero_mission_objective_progress_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objective_progress" ADD CONSTRAINT "hero_mission_objective_progress_mission_progress_id_school_fkey" FOREIGN KEY ("mission_progress_id", "school_id") REFERENCES "hero_mission_progress"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objective_progress" ADD CONSTRAINT "hero_mission_objective_progress_objective_id_school_id_fkey" FOREIGN KEY ("objective_id", "school_id") REFERENCES "hero_mission_objectives"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objective_progress" ADD CONSTRAINT "hero_mission_objective_progress_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_student_badges" ADD CONSTRAINT "hero_student_badges_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_student_badges" ADD CONSTRAINT "hero_student_badges_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_student_badges" ADD CONSTRAINT "hero_student_badges_badge_id_school_id_fkey" FOREIGN KEY ("badge_id", "school_id") REFERENCES "hero_badges"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_student_badges" ADD CONSTRAINT "hero_student_badges_mission_id_school_id_fkey" FOREIGN KEY ("mission_id", "school_id") REFERENCES "hero_missions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_student_badges" ADD CONSTRAINT "hero_student_badges_mission_progress_id_school_id_fkey" FOREIGN KEY ("mission_progress_id", "school_id") REFERENCES "hero_mission_progress"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_mission_id_school_id_fkey" FOREIGN KEY ("mission_id", "school_id") REFERENCES "hero_missions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_mission_progress_id_school_id_fkey" FOREIGN KEY ("mission_progress_id", "school_id") REFERENCES "hero_mission_progress"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_objective_id_school_id_fkey" FOREIGN KEY ("objective_id", "school_id") REFERENCES "hero_mission_objectives"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_xp_ledger_id_school_id_fkey" FOREIGN KEY ("xp_ledger_id", "school_id") REFERENCES "xp_ledger"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_badge_id_school_id_fkey" FOREIGN KEY ("badge_id", "school_id") REFERENCES "hero_badges"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_categories" ADD CONSTRAINT "behavior_categories_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_categories" ADD CONSTRAINT "behavior_categories_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_category_id_school_id_fkey" FOREIGN KEY ("category_id", "school_id") REFERENCES "behavior_categories"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_record_id_school_id_fkey" FOREIGN KEY ("record_id", "school_id") REFERENCES "behavior_records"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_category_id_school_id_fkey" FOREIGN KEY ("category_id", "school_id") REFERENCES "behavior_categories"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_policies" ADD CONSTRAINT "communication_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_policies" ADD CONSTRAINT "communication_policies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_policies" ADD CONSTRAINT "communication_policies_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_participants" ADD CONSTRAINT "communication_conversation_participants_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_participants" ADD CONSTRAINT "communication_conversation_participants_conversation_id_sc_fkey" FOREIGN KEY ("conversation_id", "school_id") REFERENCES "communication_conversations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_participants" ADD CONSTRAINT "communication_conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_participants" ADD CONSTRAINT "communication_conversation_participants_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_participants" ADD CONSTRAINT "communication_conversation_participants_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_participants" ADD CONSTRAINT "communication_conversation_participants_last_read_message__fkey" FOREIGN KEY ("last_read_message_id", "school_id") REFERENCES "communication_messages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_invites" ADD CONSTRAINT "communication_conversation_invites_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_invites" ADD CONSTRAINT "communication_conversation_invites_conversation_id_school__fkey" FOREIGN KEY ("conversation_id", "school_id") REFERENCES "communication_conversations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_invites" ADD CONSTRAINT "communication_conversation_invites_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_invites" ADD CONSTRAINT "communication_conversation_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_join_requests" ADD CONSTRAINT "communication_conversation_join_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_join_requests" ADD CONSTRAINT "communication_conversation_join_requests_conversation_id_s_fkey" FOREIGN KEY ("conversation_id", "school_id") REFERENCES "communication_conversations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_join_requests" ADD CONSTRAINT "communication_conversation_join_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversation_join_requests" ADD CONSTRAINT "communication_conversation_join_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_conversation_id_school_id_fkey" FOREIGN KEY ("conversation_id", "school_id") REFERENCES "communication_conversations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_reply_to_message_id_school_id_fkey" FOREIGN KEY ("reply_to_message_id", "school_id") REFERENCES "communication_messages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_forwarded_from_message_id_school_id_fkey" FOREIGN KEY ("forwarded_from_message_id", "school_id") REFERENCES "communication_messages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_hidden_by_id_fkey" FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reads" ADD CONSTRAINT "communication_message_reads_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reads" ADD CONSTRAINT "communication_message_reads_conversation_id_school_id_fkey" FOREIGN KEY ("conversation_id", "school_id") REFERENCES "communication_conversations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reads" ADD CONSTRAINT "communication_message_reads_message_id_school_id_fkey" FOREIGN KEY ("message_id", "school_id") REFERENCES "communication_messages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reads" ADD CONSTRAINT "communication_message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_deliveries" ADD CONSTRAINT "communication_message_deliveries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_deliveries" ADD CONSTRAINT "communication_message_deliveries_conversation_id_school_id_fkey" FOREIGN KEY ("conversation_id", "school_id") REFERENCES "communication_conversations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_deliveries" ADD CONSTRAINT "communication_message_deliveries_message_id_school_id_fkey" FOREIGN KEY ("message_id", "school_id") REFERENCES "communication_messages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_deliveries" ADD CONSTRAINT "communication_message_deliveries_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reactions" ADD CONSTRAINT "communication_message_reactions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reactions" ADD CONSTRAINT "communication_message_reactions_conversation_id_school_id_fkey" FOREIGN KEY ("conversation_id", "school_id") REFERENCES "communication_conversations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reactions" ADD CONSTRAINT "communication_message_reactions_message_id_school_id_fkey" FOREIGN KEY ("message_id", "school_id") REFERENCES "communication_messages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reactions" ADD CONSTRAINT "communication_message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_attachments" ADD CONSTRAINT "communication_message_attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_attachments" ADD CONSTRAINT "communication_message_attachments_conversation_id_school_i_fkey" FOREIGN KEY ("conversation_id", "school_id") REFERENCES "communication_conversations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_attachments" ADD CONSTRAINT "communication_message_attachments_message_id_school_id_fkey" FOREIGN KEY ("message_id", "school_id") REFERENCES "communication_messages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_attachments" ADD CONSTRAINT "communication_message_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_attachments" ADD CONSTRAINT "communication_message_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reports" ADD CONSTRAINT "communication_message_reports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reports" ADD CONSTRAINT "communication_message_reports_conversation_id_school_id_fkey" FOREIGN KEY ("conversation_id", "school_id") REFERENCES "communication_conversations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reports" ADD CONSTRAINT "communication_message_reports_message_id_school_id_fkey" FOREIGN KEY ("message_id", "school_id") REFERENCES "communication_messages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reports" ADD CONSTRAINT "communication_message_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_reports" ADD CONSTRAINT "communication_message_reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_moderation_actions" ADD CONSTRAINT "communication_moderation_actions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_moderation_actions" ADD CONSTRAINT "communication_moderation_actions_conversation_id_school_id_fkey" FOREIGN KEY ("conversation_id", "school_id") REFERENCES "communication_conversations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_moderation_actions" ADD CONSTRAINT "communication_moderation_actions_message_id_school_id_fkey" FOREIGN KEY ("message_id", "school_id") REFERENCES "communication_messages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_moderation_actions" ADD CONSTRAINT "communication_moderation_actions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_moderation_actions" ADD CONSTRAINT "communication_moderation_actions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_user_blocks" ADD CONSTRAINT "communication_user_blocks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_user_blocks" ADD CONSTRAINT "communication_user_blocks_blocker_user_id_fkey" FOREIGN KEY ("blocker_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_user_blocks" ADD CONSTRAINT "communication_user_blocks_blocked_user_id_fkey" FOREIGN KEY ("blocked_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_user_restrictions" ADD CONSTRAINT "communication_user_restrictions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_user_restrictions" ADD CONSTRAINT "communication_user_restrictions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_user_restrictions" ADD CONSTRAINT "communication_user_restrictions_restricted_by_id_fkey" FOREIGN KEY ("restricted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_user_restrictions" ADD CONSTRAINT "communication_user_restrictions_lifted_by_id_fkey" FOREIGN KEY ("lifted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcements" ADD CONSTRAINT "communication_announcements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcements" ADD CONSTRAINT "communication_announcements_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcements" ADD CONSTRAINT "communication_announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcements" ADD CONSTRAINT "communication_announcements_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcements" ADD CONSTRAINT "communication_announcements_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcements" ADD CONSTRAINT "communication_announcements_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_announcement_id_schoo_fkey" FOREIGN KEY ("announcement_id", "school_id") REFERENCES "communication_announcements"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_classroom_id_school_i_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_guardian_id_school_id_fkey" FOREIGN KEY ("guardian_id", "school_id") REFERENCES "guardians"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_reads" ADD CONSTRAINT "communication_announcement_reads_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_reads" ADD CONSTRAINT "communication_announcement_reads_announcement_id_school_id_fkey" FOREIGN KEY ("announcement_id", "school_id") REFERENCES "communication_announcements"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_reads" ADD CONSTRAINT "communication_announcement_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_attachments" ADD CONSTRAINT "communication_announcement_attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_attachments" ADD CONSTRAINT "communication_announcement_attachments_announcement_id_sch_fkey" FOREIGN KEY ("announcement_id", "school_id") REFERENCES "communication_announcements"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_attachments" ADD CONSTRAINT "communication_announcement_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_attachments" ADD CONSTRAINT "communication_announcement_attachments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notifications" ADD CONSTRAINT "communication_notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notifications" ADD CONSTRAINT "communication_notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notifications" ADD CONSTRAINT "communication_notifications_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notifications" ADD CONSTRAINT "communication_notifications_template_id_school_id_fkey" FOREIGN KEY ("template_id", "school_id") REFERENCES "settings_notification_templates"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notification_deliveries" ADD CONSTRAINT "communication_notification_deliveries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notification_deliveries" ADD CONSTRAINT "communication_notification_deliveries_notification_id_scho_fkey" FOREIGN KEY ("notification_id", "school_id") REFERENCES "communication_notifications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notification_push_attempts" ADD CONSTRAINT "communication_notification_push_attempts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notification_push_attempts" ADD CONSTRAINT "communication_notification_push_attempts_delivery_id_schoo_fkey" FOREIGN KEY ("delivery_id", "school_id") REFERENCES "communication_notification_deliveries"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notification_push_attempts" ADD CONSTRAINT "communication_notification_push_attempts_device_token_id_s_fkey" FOREIGN KEY ("device_token_id", "school_id") REFERENCES "app_device_tokens"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notification_preferences" ADD CONSTRAINT "communication_notification_preferences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notification_preferences" ADD CONSTRAINT "communication_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_device_tokens" ADD CONSTRAINT "app_device_tokens_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_device_tokens" ADD CONSTRAINT "app_device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_uploaded_file_id_fkey" FOREIGN KEY ("uploaded_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- PostgreSQL-specific invariants preserved from the legacy chain
-- See docs/database/migration-custom-sql-inventory.md
-- ============================================================

-- Partial unique indexes
CREATE UNIQUE INDEX "unique_active_teacher_membership"
    ON "memberships" ("user_id")
    WHERE "status" = 'ACTIVE' AND "user_type" = 'TEACHER';

CREATE UNIQUE INDEX "academic_years_one_active_per_school"
    ON "academic_years" ("school_id")
    WHERE "is_active" = true AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "reinforcement_task_templates_school_name_en_active_key"
    ON "reinforcement_task_templates"("school_id", "name_en")
    WHERE "name_en" IS NOT NULL AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "xp_policies_active_scope_key"
    ON "xp_policies"("school_id", "academic_year_id", "term_id", "scope_type", "scope_key")
    WHERE "deleted_at" IS NULL AND "is_active" = true;

CREATE UNIQUE INDEX "reward_redemptions_one_open_per_student_item"
    ON "reward_redemptions"("school_id", "catalog_item_id", "student_id")
    WHERE "status" IN ('REQUESTED', 'APPROVED');

CREATE UNIQUE INDEX "behavior_point_ledger_one_effective_entry_per_record"
    ON "behavior_point_ledger"("school_id", "record_id")
    WHERE "entry_type" IN ('AWARD', 'PENALTY');

CREATE UNIQUE INDEX "communication_invites_one_pending_per_user"
    ON "communication_conversation_invites"("school_id", "conversation_id", "invited_user_id")
    WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "communication_join_requests_one_pending_per_user"
    ON "communication_conversation_join_requests"("school_id", "conversation_id", "requested_by_id")
    WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "communication_user_blocks_one_active_pair"
    ON "communication_user_blocks"("school_id", "blocker_user_id", "blocked_user_id")
    WHERE "unblocked_at" IS NULL;

CREATE UNIQUE INDEX "communication_user_restrictions_one_active_type"
    ON "communication_user_restrictions"("school_id", "target_user_id", "restriction_type")
    WHERE "lifted_at" IS NULL;

CREATE UNIQUE INDEX "curricula_one_non_deleted_scope_key"
    ON "curricula"("school_id", "academic_year_id", "term_id", "grade_id", "subject_id")
    WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "lesson_plans_school_allocation_week_active_key"
    ON "lesson_plans"("school_id", "teacher_subject_allocation_id", "week_start_date")
    WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "hw_submission_answers_current_unique"
    ON "homework_submission_answers"("homework_submission_id", "homework_question_id")
    WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "dismissal_requests_one_active_per_student"
    ON "dismissal_requests" ("school_id", "student_id")
    WHERE "deleted_at" IS NULL
      AND "status" IN ('REQUESTED', 'QUEUED', 'CALLED', 'MOVING', 'AT_GATE', 'READY');

-- CHECK constraints
ALTER TABLE "memberships"
    ADD CONSTRAINT "memberships_ended_at_required_when_inactive_check"
    CHECK ("status" = 'ACTIVE' OR "ended_at" IS NOT NULL);

ALTER TABLE "school_entitlements"
    ADD CONSTRAINT "school_entitlements_student_seat_limit_positive"
    CHECK ("student_seat_limit" IS NULL OR "student_seat_limit" > 0);

ALTER TABLE "school_feature_controls"
    ADD CONSTRAINT "school_feature_controls_feature_key_snake_case"
    CHECK ("feature_key" ~ '^[a-z][a-z0-9_]*$');

ALTER TABLE "applicant_profiles"
    ADD CONSTRAINT "applicant_profiles_relationship_allowed"
    CHECK ("relationship" IN ('father', 'mother', 'guardian', 'relative'));

ALTER TABLE "admission_required_documents"
    ADD CONSTRAINT "admission_required_documents_title_not_blank"
    CHECK (length(btrim("title")) > 0);

ALTER TABLE "admission_required_documents"
    ADD CONSTRAINT "admission_required_documents_max_files_positive"
    CHECK ("max_files" > 0);

ALTER TABLE "applicant_admission_requests"
    ADD CONSTRAINT "applicant_admission_requests_child_first_name_not_blank"
    CHECK (length(btrim("child_first_name")) > 0);

ALTER TABLE "applicant_admission_requests"
    ADD CONSTRAINT "applicant_admission_requests_child_full_name_not_blank"
    CHECK (length(btrim("child_full_name")) > 0);

ALTER TABLE "applicant_admission_requests"
    ADD CONSTRAINT "applicant_admission_requests_draft_not_submitted"
    CHECK ("status" <> 'DRAFT' OR "submitted_at" IS NULL);

ALTER TABLE "applicant_admission_request_documents"
    ADD CONSTRAINT "applicant_admission_request_documents_title_not_blank"
    CHECK (length(btrim("title")) > 0);

ALTER TABLE "applicant_admission_request_documents"
    ADD CONSTRAINT "applicant_admission_request_documents_type_not_blank"
    CHECK (length(btrim("document_type")) > 0);

ALTER TABLE "academic_calendar_events"
    ADD CONSTRAINT "academic_calendar_events_date_range_check"
    CHECK ("start_date" <= "end_date");

ALTER TABLE "academic_calendar_events"
    ADD CONSTRAINT "academic_calendar_events_scope_consistency_check"
    CHECK (
        (
            "scope_type" = 'SCHOOL'
            AND "scope_key" IS NULL
            AND "stage_id" IS NULL
            AND "grade_id" IS NULL
            AND "section_id" IS NULL
        )
        OR (
            "scope_type" = 'STAGE'
            AND "scope_key" IS NOT NULL
            AND "stage_id" IS NOT NULL
            AND "scope_key" = "stage_id"
            AND "grade_id" IS NULL
            AND "section_id" IS NULL
        )
        OR (
            "scope_type" = 'GRADE'
            AND "scope_key" IS NOT NULL
            AND "grade_id" IS NOT NULL
            AND "scope_key" = "grade_id"
            AND "stage_id" IS NULL
            AND "section_id" IS NULL
        )
        OR (
            "scope_type" = 'SECTION'
            AND "scope_key" IS NOT NULL
            AND "section_id" IS NOT NULL
            AND "scope_key" = "section_id"
            AND "stage_id" IS NULL
            AND "grade_id" IS NULL
        )
    );
