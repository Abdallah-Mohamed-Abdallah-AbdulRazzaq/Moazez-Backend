import { PlainCommunicationPolicy } from '../domain/communication-policy-domain';

export interface CommunicationPolicyResponse {
  isConfigured: boolean;
  id: string | null;
  isEnabled: boolean;
  allowDirectStaffToStaff: boolean;
  allowAdminToAnyone: boolean;
  allowTeacherToParent: boolean;
  allowTeacherToStudent: boolean;
  allowStudentToTeacher: boolean;
  allowStudentToStudent: boolean;
  studentDirectMode: string;
  allowTeacherCreatedGroups: boolean;
  allowStudentCreatedGroups: boolean;
  requireApprovalForStudentGroups: boolean;
  allowParentToParent: boolean;
  allowAttachments: boolean;
  allowVoiceMessages: boolean;
  allowVideoMessages: boolean;
  allowMessageEdit: boolean;
  allowMessageDelete: boolean;
  allowReactions: boolean;
  allowReadReceipts: boolean;
  allowDeliveryReceipts: boolean;
  allowOnlinePresence: boolean;
  maxGroupMembers: number;
  maxMessageLength: number;
  maxAttachmentSizeMb: number;
  retentionDays: number | null;
  moderationMode: string;
  createdById: string | null;
  updatedById: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export function presentCommunicationPolicy(
  policy: PlainCommunicationPolicy,
  options: { isConfigured: boolean },
): CommunicationPolicyResponse {
  return {
    isConfigured: options.isConfigured,
    id: policy.id,
    isEnabled: policy.isEnabled,
    allowDirectStaffToStaff: policy.allowDirectStaffToStaff,
    allowAdminToAnyone: policy.allowAdminToAnyone,
    allowTeacherToParent: policy.allowTeacherToParent,
    allowTeacherToStudent: policy.allowTeacherToStudent,
    allowStudentToTeacher: policy.allowStudentToTeacher,
    allowStudentToStudent: policy.allowStudentToStudent,
    studentDirectMode: presentEnum(policy.studentDirectMode),
    allowTeacherCreatedGroups: policy.allowTeacherCreatedGroups,
    allowStudentCreatedGroups: policy.allowStudentCreatedGroups,
    requireApprovalForStudentGroups: policy.requireApprovalForStudentGroups,
    allowParentToParent: policy.allowParentToParent,
    allowAttachments: policy.allowAttachments,
    allowVoiceMessages: policy.allowVoiceMessages,
    allowVideoMessages: policy.allowVideoMessages,
    allowMessageEdit: policy.allowMessageEdit,
    allowMessageDelete: policy.allowMessageDelete,
    allowReactions: policy.allowReactions,
    allowReadReceipts: policy.allowReadReceipts,
    allowDeliveryReceipts: policy.allowDeliveryReceipts,
    allowOnlinePresence: policy.allowOnlinePresence,
    maxGroupMembers: policy.maxGroupMembers,
    maxMessageLength: policy.maxMessageLength,
    maxAttachmentSizeMb: policy.maxAttachmentSizeMb,
    retentionDays: policy.retentionDays,
    moderationMode: policy.moderationMode,
    createdById: policy.createdById,
    updatedById: policy.updatedById,
    metadata: policy.metadata,
    createdAt: presentDate(policy.createdAt),
    updatedAt: presentDate(policy.updatedAt),
  };
}

export function summarizeCommunicationPolicyForAudit(
  policy: PlainCommunicationPolicy,
): Record<string, unknown> {
  return {
    id: policy.id,
    isEnabled: policy.isEnabled,
    allowStudentToStudent: policy.allowStudentToStudent,
    studentDirectMode: presentEnum(policy.studentDirectMode),
    allowTeacherCreatedGroups: policy.allowTeacherCreatedGroups,
    allowStudentCreatedGroups: policy.allowStudentCreatedGroups,
    requireApprovalForStudentGroups: policy.requireApprovalForStudentGroups,
    allowAttachments: policy.allowAttachments,
    allowReactions: policy.allowReactions,
    maxGroupMembers: policy.maxGroupMembers,
    maxMessageLength: policy.maxMessageLength,
    maxAttachmentSizeMb: policy.maxAttachmentSizeMb,
    retentionDays: policy.retentionDays,
    moderationMode: policy.moderationMode,
  };
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
