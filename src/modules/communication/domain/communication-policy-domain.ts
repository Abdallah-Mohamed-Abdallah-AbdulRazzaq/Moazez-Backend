import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export type CommunicationStudentDirectModeValue =
  | 'DISABLED'
  | 'SAME_CLASSROOM'
  | 'SAME_GRADE'
  | 'SAME_SCHOOL'
  | 'ANY_SCHOOL_USER'
  | 'APPROVAL_REQUIRED';

export type CommunicationModerationModeValue = 'standard' | 'strict' | 'relaxed';

export interface PlainCommunicationPolicy {
  id: string | null;
  schoolId?: string | null;
  isEnabled: boolean;
  allowDirectStaffToStaff: boolean;
  allowAdminToAnyone: boolean;
  allowTeacherToParent: boolean;
  allowTeacherToStudent: boolean;
  allowStudentToTeacher: boolean;
  allowStudentToStudent: boolean;
  studentDirectMode: CommunicationStudentDirectModeValue;
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
  moderationMode: CommunicationModerationModeValue;
  createdById: string | null;
  updatedById: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CommunicationPolicyPatch {
  isEnabled?: boolean;
  allowDirectStaffToStaff?: boolean;
  allowAdminToAnyone?: boolean;
  allowTeacherToParent?: boolean;
  allowTeacherToStudent?: boolean;
  allowStudentToTeacher?: boolean;
  allowStudentToStudent?: boolean;
  studentDirectMode?: string;
  allowTeacherCreatedGroups?: boolean;
  allowStudentCreatedGroups?: boolean;
  requireApprovalForStudentGroups?: boolean;
  allowParentToParent?: boolean;
  allowAttachments?: boolean;
  allowVoiceMessages?: boolean;
  allowVideoMessages?: boolean;
  allowMessageEdit?: boolean;
  allowMessageDelete?: boolean;
  allowReactions?: boolean;
  allowReadReceipts?: boolean;
  allowDeliveryReceipts?: boolean;
  allowOnlinePresence?: boolean;
  maxGroupMembers?: number;
  maxMessageLength?: number;
  maxAttachmentSizeMb?: number;
  retentionDays?: number | null;
  moderationMode?: string;
  metadata?: Record<string, unknown> | null;
}

export type CommunicationPolicyPatchData = Partial<
  Pick<
    PlainCommunicationPolicy,
    | 'isEnabled'
    | 'allowDirectStaffToStaff'
    | 'allowAdminToAnyone'
    | 'allowTeacherToParent'
    | 'allowTeacherToStudent'
    | 'allowStudentToTeacher'
    | 'allowStudentToStudent'
    | 'studentDirectMode'
    | 'allowTeacherCreatedGroups'
    | 'allowStudentCreatedGroups'
    | 'requireApprovalForStudentGroups'
    | 'allowParentToParent'
    | 'allowAttachments'
    | 'allowVoiceMessages'
    | 'allowVideoMessages'
    | 'allowMessageEdit'
    | 'allowMessageDelete'
    | 'allowReactions'
    | 'allowReadReceipts'
    | 'allowDeliveryReceipts'
    | 'allowOnlinePresence'
    | 'maxGroupMembers'
    | 'maxMessageLength'
    | 'maxAttachmentSizeMb'
    | 'retentionDays'
    | 'moderationMode'
    | 'metadata'
  >
>;

export interface CommunicationOverviewCounts {
  conversations: {
    total: number;
    active: number;
    archived: number;
    closed: number;
    direct: number;
    group: number;
    classroom: number;
    grade: number;
    section: number;
    stage: number;
    schoolWide: number;
    support: number;
    system: number;
  };
  participants: {
    total: number;
    active: number;
    invited: number;
    left: number;
    removed: number;
    muted: number;
    blocked: number;
  };
  messages: {
    total: number;
    sent: number;
    hidden: number;
    deleted: number;
    text: number;
    image: number;
    file: number;
    audio: number;
    video: number;
    system: number;
  };
  receipts: {
    reads: number;
    deliveries: number;
    pendingDeliveries: number;
    deliveredDeliveries: number;
    failedDeliveries: number;
  };
  safety: {
    openReports: number;
    inReviewReports: number;
    resolvedReports: number;
    dismissedReports: number;
    activeBlocks: number;
    activeRestrictions: number;
    moderationActions: number;
  };
}

export interface CommunicationCountBucket {
  value: string;
  count: number;
}

export interface CommunicationOverviewCountInput {
  conversationsTotal: number;
  conversationStatuses: CommunicationCountBucket[];
  conversationTypes: CommunicationCountBucket[];
  participantsTotal: number;
  participantStatuses: CommunicationCountBucket[];
  messagesTotal: number;
  messageStatuses: CommunicationCountBucket[];
  messageKinds: CommunicationCountBucket[];
  reads: number;
  deliveriesTotal: number;
  deliveryStatuses: CommunicationCountBucket[];
  reportStatuses: CommunicationCountBucket[];
  activeBlocks: number;
  activeRestrictions: number;
  moderationActions: number;
}

const STUDENT_DIRECT_MODE_MAP: Record<
  string,
  CommunicationStudentDirectModeValue
> = {
  disabled: 'DISABLED',
  same_classroom: 'SAME_CLASSROOM',
  same_grade: 'SAME_GRADE',
  same_school: 'SAME_SCHOOL',
  any_school_user: 'ANY_SCHOOL_USER',
  approval_required: 'APPROVAL_REQUIRED',
};

const MODERATION_MODES = new Set<CommunicationModerationModeValue>([
  'standard',
  'strict',
  'relaxed',
]);

const POLICY_MUTABLE_FIELDS: Array<keyof CommunicationPolicyPatch> = [
  'isEnabled',
  'allowDirectStaffToStaff',
  'allowAdminToAnyone',
  'allowTeacherToParent',
  'allowTeacherToStudent',
  'allowStudentToTeacher',
  'allowStudentToStudent',
  'studentDirectMode',
  'allowTeacherCreatedGroups',
  'allowStudentCreatedGroups',
  'requireApprovalForStudentGroups',
  'allowParentToParent',
  'allowAttachments',
  'allowVoiceMessages',
  'allowVideoMessages',
  'allowMessageEdit',
  'allowMessageDelete',
  'allowReactions',
  'allowReadReceipts',
  'allowDeliveryReceipts',
  'allowOnlinePresence',
  'maxGroupMembers',
  'maxMessageLength',
  'maxAttachmentSizeMb',
  'retentionDays',
  'moderationMode',
  'metadata',
];

export class CommunicationPolicyInvalidException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'communication.policy.invalid',
      message,
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export function buildDefaultCommunicationPolicy(): PlainCommunicationPolicy {
  return {
    id: null,
    schoolId: null,
    isEnabled: true,
    allowDirectStaffToStaff: true,
    allowAdminToAnyone: true,
    allowTeacherToParent: true,
    allowTeacherToStudent: true,
    allowStudentToTeacher: true,
    allowStudentToStudent: false,
    studentDirectMode: 'DISABLED',
    allowTeacherCreatedGroups: true,
    allowStudentCreatedGroups: false,
    requireApprovalForStudentGroups: true,
    allowParentToParent: false,
    allowAttachments: true,
    allowVoiceMessages: false,
    allowVideoMessages: false,
    allowMessageEdit: false,
    allowMessageDelete: true,
    allowReactions: true,
    allowReadReceipts: true,
    allowDeliveryReceipts: true,
    allowOnlinePresence: true,
    maxGroupMembers: 256,
    maxMessageLength: 4000,
    maxAttachmentSizeMb: 25,
    retentionDays: null,
    moderationMode: 'standard',
    createdById: null,
    updatedById: null,
    metadata: null,
    createdAt: null,
    updatedAt: null,
  };
}

export function mergeCommunicationPolicyPatch(
  basePolicy: PlainCommunicationPolicy,
  patch: CommunicationPolicyPatch,
): {
  nextPolicy: PlainCommunicationPolicy;
  data: CommunicationPolicyPatchData;
  changedFields: string[];
} {
  const data: CommunicationPolicyPatchData = {};

  for (const field of POLICY_MUTABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const value = patch[field];
    if (value === undefined) continue;

    if (field === 'studentDirectMode') {
      data.studentDirectMode = normalizeCommunicationStudentDirectMode(
        String(value),
      );
      continue;
    }

    if (field === 'moderationMode') {
      data.moderationMode = normalizeCommunicationModerationMode(String(value));
      continue;
    }

    (data as Record<string, unknown>)[field] = value;
  }

  const nextPolicy = { ...basePolicy, ...data };
  assertCommunicationPolicyLimits(nextPolicy);
  assertCommunicationPolicyConsistency(nextPolicy);

  return {
    nextPolicy,
    data,
    changedFields: Object.entries(data)
      .filter(([field, value]) => {
        const previous = (basePolicy as unknown as Record<string, unknown>)[
          field
        ];
        return !arePolicyValuesEqual(previous, value);
      })
      .map(([field]) => field),
  };
}

export function normalizeCommunicationStudentDirectMode(
  value: string,
): CommunicationStudentDirectModeValue {
  const normalized = value.trim().toLowerCase();
  const mapped = STUDENT_DIRECT_MODE_MAP[normalized];
  if (!mapped) {
    throw new CommunicationPolicyInvalidException(
      'Unsupported student direct mode',
      { field: 'studentDirectMode', value },
    );
  }

  return mapped;
}

export function normalizeCommunicationModerationMode(
  value: string,
): CommunicationModerationModeValue {
  const normalized = value.trim().toLowerCase();
  if (!MODERATION_MODES.has(normalized as CommunicationModerationModeValue)) {
    throw new CommunicationPolicyInvalidException(
      'Unsupported moderation mode',
      { field: 'moderationMode', value },
    );
  }

  return normalized as CommunicationModerationModeValue;
}

export function assertCommunicationPolicyLimits(
  policy: Pick<
    PlainCommunicationPolicy,
    | 'maxGroupMembers'
    | 'maxMessageLength'
    | 'maxAttachmentSizeMb'
    | 'retentionDays'
    | 'moderationMode'
  >,
): void {
  assertIntegerRange('maxGroupMembers', policy.maxGroupMembers, 2, 5000);
  assertIntegerRange('maxMessageLength', policy.maxMessageLength, 1, 20000);
  assertIntegerRange('maxAttachmentSizeMb', policy.maxAttachmentSizeMb, 1, 100);

  if (policy.retentionDays !== null && policy.retentionDays !== undefined) {
    assertIntegerRange('retentionDays', policy.retentionDays, 1, Number.MAX_SAFE_INTEGER);
  }

  normalizeCommunicationModerationMode(policy.moderationMode);
}

export function assertCommunicationPolicyConsistency(
  _policy: PlainCommunicationPolicy,
): void {
  // The V1 policy fields are independent toggles; disabled policies remain
  // readable and editable, and group approval may stay enabled defensively.
}

export function summarizeCommunicationOverviewCounts(
  input: CommunicationOverviewCountInput,
): CommunicationOverviewCounts {
  return {
    conversations: {
      total: input.conversationsTotal,
      active: countFor(input.conversationStatuses, 'ACTIVE'),
      archived: countFor(input.conversationStatuses, 'ARCHIVED'),
      closed: countFor(input.conversationStatuses, 'CLOSED'),
      direct: countFor(input.conversationTypes, 'DIRECT'),
      group: countFor(input.conversationTypes, 'GROUP'),
      classroom: countFor(input.conversationTypes, 'CLASSROOM'),
      grade: countFor(input.conversationTypes, 'GRADE'),
      section: countFor(input.conversationTypes, 'SECTION'),
      stage: countFor(input.conversationTypes, 'STAGE'),
      schoolWide: countFor(input.conversationTypes, 'SCHOOL_WIDE'),
      support: countFor(input.conversationTypes, 'SUPPORT'),
      system: countFor(input.conversationTypes, 'SYSTEM'),
    },
    participants: {
      total: input.participantsTotal,
      active: countFor(input.participantStatuses, 'ACTIVE'),
      invited: countFor(input.participantStatuses, 'INVITED'),
      left: countFor(input.participantStatuses, 'LEFT'),
      removed: countFor(input.participantStatuses, 'REMOVED'),
      muted: countFor(input.participantStatuses, 'MUTED'),
      blocked: countFor(input.participantStatuses, 'BLOCKED'),
    },
    messages: {
      total: input.messagesTotal,
      sent: countFor(input.messageStatuses, 'SENT'),
      hidden: countFor(input.messageStatuses, 'HIDDEN'),
      deleted: countFor(input.messageStatuses, 'DELETED'),
      text: countFor(input.messageKinds, 'TEXT'),
      image: countFor(input.messageKinds, 'IMAGE'),
      file: countFor(input.messageKinds, 'FILE'),
      audio: countFor(input.messageKinds, 'AUDIO'),
      video: countFor(input.messageKinds, 'VIDEO'),
      system: countFor(input.messageKinds, 'SYSTEM'),
    },
    receipts: {
      reads: input.reads,
      deliveries: input.deliveriesTotal,
      pendingDeliveries: countFor(input.deliveryStatuses, 'PENDING'),
      deliveredDeliveries: countFor(input.deliveryStatuses, 'DELIVERED'),
      failedDeliveries: countFor(input.deliveryStatuses, 'FAILED'),
    },
    safety: {
      openReports: countFor(input.reportStatuses, 'OPEN'),
      inReviewReports: countFor(input.reportStatuses, 'IN_REVIEW'),
      resolvedReports: countFor(input.reportStatuses, 'RESOLVED'),
      dismissedReports: countFor(input.reportStatuses, 'DISMISSED'),
      activeBlocks: input.activeBlocks,
      activeRestrictions: input.activeRestrictions,
      moderationActions: input.moderationActions,
    },
  };
}

export function summarizePlatformCommunicationOverview(
  input: CommunicationOverviewCountInput,
): CommunicationOverviewCounts {
  return summarizeCommunicationOverviewCounts(input);
}

function assertIntegerRange(
  field: string,
  value: number,
  min: number,
  max: number,
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CommunicationPolicyInvalidException(
      'Communication policy limit is outside the allowed range',
      { field, min, max, value },
    );
  }
}

function countFor(buckets: CommunicationCountBucket[], value: string): number {
  return (
    buckets.find((bucket) => bucket.value.toUpperCase() === value)?.count ?? 0
  );
}

function arePolicyValuesEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}
