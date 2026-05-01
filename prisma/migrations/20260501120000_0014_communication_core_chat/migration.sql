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
CREATE UNIQUE INDEX "communication_invites_one_pending_per_user" ON "communication_conversation_invites"("school_id", "conversation_id", "invited_user_id") WHERE "status" = 'PENDING';

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
CREATE UNIQUE INDEX "communication_join_requests_one_pending_per_user" ON "communication_conversation_join_requests"("school_id", "conversation_id", "requested_by_id") WHERE "status" = 'PENDING';

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
CREATE UNIQUE INDEX "communication_user_blocks_one_active_pair" ON "communication_user_blocks"("school_id", "blocker_user_id", "blocked_user_id") WHERE "unblocked_at" IS NULL;

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
CREATE UNIQUE INDEX "communication_user_restrictions_one_active_type" ON "communication_user_restrictions"("school_id", "target_user_id", "restriction_type") WHERE "lifted_at" IS NULL;

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
