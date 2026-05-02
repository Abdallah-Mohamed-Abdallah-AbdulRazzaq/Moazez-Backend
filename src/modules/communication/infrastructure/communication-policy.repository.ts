import { Injectable } from '@nestjs/common';
import {
  CommunicationDeliveryStatus,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantStatus,
  CommunicationReportStatus,
  CommunicationStudentDirectMode,
  CommunicationConversationStatus,
  CommunicationConversationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  CommunicationCountBucket,
  CommunicationPolicyPatchData,
  CommunicationStudentDirectModeValue,
  PlainCommunicationPolicy,
  summarizeCommunicationOverviewCounts,
} from '../domain/communication-policy-domain';

const COMMUNICATION_POLICY_ARGS =
  Prisma.validator<Prisma.CommunicationPolicyDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      isEnabled: true,
      allowDirectStaffToStaff: true,
      allowAdminToAnyone: true,
      allowTeacherToParent: true,
      allowTeacherToStudent: true,
      allowStudentToTeacher: true,
      allowStudentToStudent: true,
      studentDirectMode: true,
      allowTeacherCreatedGroups: true,
      allowStudentCreatedGroups: true,
      requireApprovalForStudentGroups: true,
      allowParentToParent: true,
      allowAttachments: true,
      allowVoiceMessages: true,
      allowVideoMessages: true,
      allowMessageEdit: true,
      allowMessageDelete: true,
      allowReactions: true,
      allowReadReceipts: true,
      allowDeliveryReceipts: true,
      allowOnlinePresence: true,
      maxGroupMembers: true,
      maxMessageLength: true,
      maxAttachmentSizeMb: true,
      retentionDays: true,
      moderationMode: true,
      createdById: true,
      updatedById: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export type CommunicationPolicyRecord = Prisma.CommunicationPolicyGetPayload<
  typeof COMMUNICATION_POLICY_ARGS
>;

export interface CommunicationRecentConversationRecord {
  id: string;
  type: CommunicationConversationType;
  status: CommunicationConversationStatus;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunicationRecentMessageRecord {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  kind: CommunicationMessageKind;
  status: CommunicationMessageStatus;
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunicationAdminOverviewDataset {
  counts: ReturnType<typeof summarizeCommunicationOverviewCounts>;
  recentActivity: {
    conversations: CommunicationRecentConversationRecord[];
    messages: CommunicationRecentMessageRecord[];
  };
}

type CommunicationPolicyPersistenceData = Partial<
  Omit<
    Prisma.CommunicationPolicyUncheckedCreateInput,
    'id' | 'schoolId' | 'createdById' | 'updatedById' | 'createdAt' | 'updatedAt'
  >
>;

@Injectable()
export class CommunicationPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async findCurrentSchoolPolicy(): Promise<PlainCommunicationPolicy | null> {
    const policy = await this.scopedPrisma.communicationPolicy.findFirst({
      where: {},
      ...COMMUNICATION_POLICY_ARGS,
    });

    return policy ? mapPolicyRecordToPlainPolicy(policy) : null;
  }

  async upsertCurrentSchoolPolicy(input: {
    schoolId: string;
    actorId: string;
    data: CommunicationPolicyPatchData;
  }): Promise<PlainCommunicationPolicy> {
    const data = toPolicyPersistenceData(input.data);

    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.communicationPolicy.upsert({
        where: { schoolId: input.schoolId },
        create: {
          schoolId: input.schoolId,
          createdById: input.actorId,
          updatedById: input.actorId,
          ...data,
        },
        update: {
          updatedById: input.actorId,
          ...(data as Prisma.CommunicationPolicyUncheckedUpdateInput),
        },
        select: { id: true },
      });

      const persisted = await tx.communicationPolicy.findFirst({
        where: { id: policy.id, schoolId: input.schoolId },
        ...COMMUNICATION_POLICY_ARGS,
      });

      if (!persisted) {
        throw new Error('Communication policy mutation result was not found');
      }

      return mapPolicyRecordToPlainPolicy(persisted);
    });
  }

  async loadSchoolAdminOverview(): Promise<CommunicationAdminOverviewDataset> {
    const now = new Date();
    const [
      conversationsTotal,
      conversationStatuses,
      conversationTypes,
      participantsTotal,
      participantStatuses,
      messagesTotal,
      messageStatuses,
      messageKinds,
      reads,
      deliveriesTotal,
      deliveryStatuses,
      reportStatuses,
      activeBlocks,
      activeRestrictions,
      moderationActions,
      recentConversations,
      recentMessages,
    ] = await Promise.all([
      this.scopedPrisma.communicationConversation.count({ where: {} }),
      this.scopedPrisma.communicationConversation.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.scopedPrisma.communicationConversation.groupBy({
        by: ['type'],
        _count: { _all: true },
      }),
      this.scopedPrisma.communicationConversationParticipant.count({
        where: {},
      }),
      this.scopedPrisma.communicationConversationParticipant.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.scopedPrisma.communicationMessage.count({ where: {} }),
      this.scopedPrisma.communicationMessage.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.scopedPrisma.communicationMessage.groupBy({
        by: ['kind'],
        _count: { _all: true },
      }),
      this.scopedPrisma.communicationMessageRead.count({ where: {} }),
      this.scopedPrisma.communicationMessageDelivery.count({ where: {} }),
      this.scopedPrisma.communicationMessageDelivery.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.scopedPrisma.communicationMessageReport.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.scopedPrisma.communicationUserBlock.count({
        where: { unblockedAt: null },
      }),
      this.scopedPrisma.communicationUserRestriction.count({
        where: {
          liftedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      this.scopedPrisma.communicationModerationAction.count({ where: {} }),
      this.scopedPrisma.communicationConversation.findMany({
        where: {},
        orderBy: [
          { lastMessageAt: 'desc' },
          { updatedAt: 'desc' },
          { id: 'asc' },
        ],
        take: 5,
        select: {
          id: true,
          type: true,
          status: true,
          lastMessageAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.scopedPrisma.communicationMessage.findMany({
        where: {},
        orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
        take: 5,
        select: {
          id: true,
          conversationId: true,
          senderUserId: true,
          kind: true,
          status: true,
          sentAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      counts: summarizeCommunicationOverviewCounts({
        conversationsTotal,
        conversationStatuses: countBuckets(
          conversationStatuses,
          'status',
        ),
        conversationTypes: countBuckets(conversationTypes, 'type'),
        participantsTotal,
        participantStatuses: countBuckets(
          participantStatuses,
          'status',
        ),
        messagesTotal,
        messageStatuses: countBuckets(messageStatuses, 'status'),
        messageKinds: countBuckets(messageKinds, 'kind'),
        reads,
        deliveriesTotal,
        deliveryStatuses: countBuckets(deliveryStatuses, 'status'),
        reportStatuses: countBuckets(reportStatuses, 'status'),
        activeBlocks,
        activeRestrictions,
        moderationActions,
      }),
      recentActivity: {
        conversations: recentConversations,
        messages: recentMessages,
      },
    };
  }
}

function mapPolicyRecordToPlainPolicy(
  record: CommunicationPolicyRecord,
): PlainCommunicationPolicy {
  return {
    id: record.id,
    schoolId: record.schoolId,
    isEnabled: record.isEnabled,
    allowDirectStaffToStaff: record.allowDirectStaffToStaff,
    allowAdminToAnyone: record.allowAdminToAnyone,
    allowTeacherToParent: record.allowTeacherToParent,
    allowTeacherToStudent: record.allowTeacherToStudent,
    allowStudentToTeacher: record.allowStudentToTeacher,
    allowStudentToStudent: record.allowStudentToStudent,
    studentDirectMode:
      record.studentDirectMode as CommunicationStudentDirectModeValue,
    allowTeacherCreatedGroups: record.allowTeacherCreatedGroups,
    allowStudentCreatedGroups: record.allowStudentCreatedGroups,
    requireApprovalForStudentGroups: record.requireApprovalForStudentGroups,
    allowParentToParent: record.allowParentToParent,
    allowAttachments: record.allowAttachments,
    allowVoiceMessages: record.allowVoiceMessages,
    allowVideoMessages: record.allowVideoMessages,
    allowMessageEdit: record.allowMessageEdit,
    allowMessageDelete: record.allowMessageDelete,
    allowReactions: record.allowReactions,
    allowReadReceipts: record.allowReadReceipts,
    allowDeliveryReceipts: record.allowDeliveryReceipts,
    allowOnlinePresence: record.allowOnlinePresence,
    maxGroupMembers: record.maxGroupMembers,
    maxMessageLength: record.maxMessageLength,
    maxAttachmentSizeMb: record.maxAttachmentSizeMb,
    retentionDays: record.retentionDays,
    moderationMode: normalizeStoredModerationMode(record.moderationMode),
    createdById: record.createdById,
    updatedById: record.updatedById,
    metadata: toPlainMetadata(record.metadata),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toPolicyPersistenceData(
  data: CommunicationPolicyPatchData,
): CommunicationPolicyPersistenceData {
  const output: CommunicationPolicyPersistenceData = {};

  for (const [field, value] of Object.entries(data)) {
    if (field === 'studentDirectMode') {
      output.studentDirectMode = value as CommunicationStudentDirectMode;
      continue;
    }

    if (field === 'metadata') {
      output.metadata = toNullableJson(value);
      continue;
    }

    (output as Record<string, unknown>)[field] = value;
  }

  return output;
}

function normalizeStoredModerationMode(
  value: string | null,
): 'standard' | 'strict' | 'relaxed' {
  const normalized = (value ?? 'standard').toLowerCase();
  if (normalized === 'strict' || normalized === 'relaxed') return normalized;
  return 'standard';
}

function toPlainMetadata(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function countBuckets<T extends Record<string, unknown>>(
  rows: Array<T & { _count: { _all: number } }>,
  field: keyof T,
): CommunicationCountBucket[] {
  return rows.map((row) => ({
    value: String(row[field]),
    count: row._count._all,
  }));
}
