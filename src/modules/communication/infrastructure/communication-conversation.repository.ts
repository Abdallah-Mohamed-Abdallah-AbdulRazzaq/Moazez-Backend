import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  ConversationCountsSummary,
  ParticipantCountsSummary,
  summarizeConversationCounts,
  summarizeParticipantCounts,
} from '../domain/communication-conversation-domain';

const COMMUNICATION_CONVERSATION_ARGS =
  Prisma.validator<Prisma.CommunicationConversationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      type: true,
      status: true,
      titleEn: true,
      titleAr: true,
      descriptionEn: true,
      descriptionAr: true,
      avatarFileId: true,
      academicYearId: true,
      termId: true,
      stageId: true,
      gradeId: true,
      sectionId: true,
      classroomId: true,
      subjectId: true,
      createdById: true,
      archivedById: true,
      archivedAt: true,
      closedById: true,
      closedAt: true,
      lastMessageAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      _count: {
        select: {
          participants: true,
        },
      },
    },
  });

const CONTEXT_ID_ARGS = { select: { id: true } } satisfies {
  select: { id: true };
};

const TERM_CONTEXT_ARGS =
  Prisma.validator<Prisma.TermDefaultArgs>()({
    select: {
      id: true,
      academicYearId: true,
    },
  });

export type CommunicationConversationRecord =
  Prisma.CommunicationConversationGetPayload<
    typeof COMMUNICATION_CONVERSATION_ARGS
  >;

export type CommunicationTermContextRecord = Prisma.TermGetPayload<
  typeof TERM_CONTEXT_ARGS
>;

export interface CommunicationConversationListFilters {
  type?: CommunicationConversationType;
  status?: CommunicationConversationStatus;
  search?: string;
  limit?: number;
  page?: number;
}

export interface CommunicationConversationListResult {
  items: CommunicationConversationRecord[];
  total: number;
  summary: ConversationCountsSummary;
  limit: number;
  page: number;
}

export interface CommunicationConversationAuditInput {
  actorId?: string | null;
  userType?: UserType | null;
  organizationId?: string | null;
  schoolId?: string | null;
  module: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface CommunicationConversationCreateData {
  type: CommunicationConversationType;
  status: CommunicationConversationStatus;
  titleEn?: string | null;
  descriptionEn?: string | null;
  avatarFileId?: string | null;
  academicYearId?: string | null;
  termId?: string | null;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  subjectId?: string | null;
  createdById?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CommunicationConversationUpdateData {
  titleEn?: string | null;
  descriptionEn?: string | null;
  avatarFileId?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class CommunicationConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listCurrentSchoolConversations(
    filters: CommunicationConversationListFilters,
  ): Promise<CommunicationConversationListResult> {
    const limit = filters.limit ?? 50;
    const page = filters.page ?? 1;
    const where = this.buildConversationWhere(filters);
    const [items, total, statusCounts, typeCounts] = await Promise.all([
      this.scopedPrisma.communicationConversation.findMany({
        where,
        orderBy: [
          { lastMessageAt: 'desc' },
          { updatedAt: 'desc' },
          { id: 'asc' },
        ],
        take: limit,
        skip: (page - 1) * limit,
        ...COMMUNICATION_CONVERSATION_ARGS,
      }),
      this.scopedPrisma.communicationConversation.count({ where }),
      this.scopedPrisma.communicationConversation.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.scopedPrisma.communicationConversation.groupBy({
        by: ['type'],
        where,
        _count: { _all: true },
      }),
    ]);

    return {
      items,
      total,
      summary: summarizeConversationCounts({
        total,
        statuses: countBuckets(statusCounts, 'status'),
        types: countBuckets(typeCounts, 'type'),
      }),
      limit,
      page,
    };
  }

  findCurrentSchoolConversationById(
    conversationId: string,
  ): Promise<CommunicationConversationRecord | null> {
    return this.scopedPrisma.communicationConversation.findFirst({
      where: { id: conversationId },
      ...COMMUNICATION_CONVERSATION_ARGS,
    });
  }

  async createCurrentSchoolConversation(input: {
    schoolId: string;
    actorId: string;
    data: CommunicationConversationCreateData;
    buildAuditEntry: (
      conversation: CommunicationConversationRecord,
    ) => CommunicationConversationAuditInput;
  }): Promise<CommunicationConversationRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const created = await tx.communicationConversation.create({
        data: {
          ...this.toConversationCreateInput(input.data),
          schoolId: input.schoolId,
        },
        select: { id: true },
      });

      await this.createCreatorParticipantIfNeededInTransaction(tx, {
        schoolId: input.schoolId,
        conversationId: created.id,
        actorId: input.actorId,
      });

      const conversation = await this.findConversationInTransaction(
        tx,
        created.id,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(conversation),
      );

      return conversation;
    });
  }

  async updateCurrentSchoolConversation(input: {
    conversationId: string;
    data: CommunicationConversationUpdateData;
    buildAuditEntry: (
      conversation: CommunicationConversationRecord,
    ) => CommunicationConversationAuditInput;
  }): Promise<CommunicationConversationRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      if (Object.keys(input.data).length > 0) {
        await tx.communicationConversation.updateMany({
          where: { id: input.conversationId, deletedAt: null },
          data: this.toConversationUpdateInput(input.data),
        });
      }

      const conversation = await this.findConversationInTransaction(
        tx,
        input.conversationId,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(conversation),
      );

      return conversation;
    });
  }

  archiveCurrentSchoolConversation(input: {
    conversationId: string;
    actorId: string;
    buildAuditEntry: (
      conversation: CommunicationConversationRecord,
    ) => CommunicationConversationAuditInput;
  }): Promise<CommunicationConversationRecord> {
    return this.transitionConversation(input, {
      status: CommunicationConversationStatus.ARCHIVED,
      archivedAt: new Date(),
      archivedById: input.actorId,
    });
  }

  closeCurrentSchoolConversation(input: {
    conversationId: string;
    actorId: string;
    buildAuditEntry: (
      conversation: CommunicationConversationRecord,
    ) => CommunicationConversationAuditInput;
  }): Promise<CommunicationConversationRecord> {
    return this.transitionConversation(input, {
      status: CommunicationConversationStatus.CLOSED,
      closedAt: new Date(),
      closedById: input.actorId,
    });
  }

  reopenCurrentSchoolConversation(input: {
    conversationId: string;
    buildAuditEntry: (
      conversation: CommunicationConversationRecord,
    ) => CommunicationConversationAuditInput;
  }): Promise<CommunicationConversationRecord> {
    return this.transitionConversation(input, {
      status: CommunicationConversationStatus.ACTIVE,
      archivedAt: null,
      archivedById: null,
      closedAt: null,
      closedById: null,
    });
  }

  async countConversationParticipants(
    conversationId: string,
  ): Promise<ParticipantCountsSummary> {
    const [total, statuses] = await Promise.all([
      this.scopedPrisma.communicationConversationParticipant.count({
        where: { conversationId },
      }),
      this.scopedPrisma.communicationConversationParticipant.groupBy({
        by: ['status'],
        where: { conversationId },
        _count: { _all: true },
      }),
    ]);

    return summarizeParticipantCounts({
      total,
      statuses: countBuckets(statuses, 'status'),
    });
  }

  async createCreatorParticipantIfNeeded(input: {
    schoolId: string;
    conversationId: string;
    actorId: string;
  }): Promise<void> {
    await this.scopedPrisma.communicationConversationParticipant.upsert({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.actorId,
        },
      },
      create: {
        schoolId: input.schoolId,
        conversationId: input.conversationId,
        userId: input.actorId,
        role: CommunicationParticipantRole.OWNER,
        status: CommunicationParticipantStatus.ACTIVE,
      },
      update: {
        role: CommunicationParticipantRole.OWNER,
        status: CommunicationParticipantStatus.ACTIVE,
      },
    });
  }

  findAcademicYear(id: string): Promise<{ id: string } | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id },
      ...CONTEXT_ID_ARGS,
    });
  }

  findTerm(id: string): Promise<CommunicationTermContextRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id },
      ...TERM_CONTEXT_ARGS,
    });
  }

  findStage(id: string): Promise<{ id: string } | null> {
    return this.scopedPrisma.stage.findFirst({
      where: { id },
      ...CONTEXT_ID_ARGS,
    });
  }

  findGrade(id: string): Promise<{ id: string } | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id },
      ...CONTEXT_ID_ARGS,
    });
  }

  findSection(id: string): Promise<{ id: string } | null> {
    return this.scopedPrisma.section.findFirst({
      where: { id },
      ...CONTEXT_ID_ARGS,
    });
  }

  findClassroom(id: string): Promise<{ id: string } | null> {
    return this.scopedPrisma.classroom.findFirst({
      where: { id },
      ...CONTEXT_ID_ARGS,
    });
  }

  findSubject(id: string): Promise<{ id: string } | null> {
    return this.scopedPrisma.subject.findFirst({
      where: { id },
      ...CONTEXT_ID_ARGS,
    });
  }

  private async transitionConversation(
    input: {
      conversationId: string;
      buildAuditEntry: (
        conversation: CommunicationConversationRecord,
      ) => CommunicationConversationAuditInput;
    },
    data: Prisma.CommunicationConversationUncheckedUpdateManyInput,
  ): Promise<CommunicationConversationRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationConversation.updateMany({
        where: { id: input.conversationId, deletedAt: null },
        data,
      });

      const conversation = await this.findConversationInTransaction(
        tx,
        input.conversationId,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(conversation),
      );

      return conversation;
    });
  }

  private buildConversationWhere(
    filters: CommunicationConversationListFilters,
  ): Prisma.CommunicationConversationWhereInput {
    const and: Prisma.CommunicationConversationWhereInput[] = [];
    const search = filters.search?.trim();

    if (search) {
      and.push({
        OR: [
          { titleEn: { contains: search, mode: 'insensitive' } },
          { titleAr: { contains: search, mode: 'insensitive' } },
          { descriptionEn: { contains: search, mode: 'insensitive' } },
          { descriptionAr: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return {
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private async createCreatorParticipantIfNeededInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      conversationId: string;
      actorId: string;
    },
  ): Promise<void> {
    await tx.communicationConversationParticipant.upsert({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.actorId,
        },
      },
      create: {
        schoolId: input.schoolId,
        conversationId: input.conversationId,
        userId: input.actorId,
        role: CommunicationParticipantRole.OWNER,
        status: CommunicationParticipantStatus.ACTIVE,
      },
      update: {
        role: CommunicationParticipantRole.OWNER,
        status: CommunicationParticipantStatus.ACTIVE,
      },
    });
  }

  private async findConversationInTransaction(
    tx: Prisma.TransactionClient,
    conversationId: string,
  ): Promise<CommunicationConversationRecord> {
    const conversation = await tx.communicationConversation.findFirst({
      where: { id: conversationId, deletedAt: null },
      ...COMMUNICATION_CONVERSATION_ARGS,
    });

    if (!conversation) {
      throw new Error('Communication conversation mutation result was not found');
    }

    return conversation;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: CommunicationConversationAuditInput,
  ): Promise<unknown> {
    return tx.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        userType: entry.userType ?? null,
        organizationId: entry.organizationId ?? null,
        schoolId: entry.schoolId ?? null,
        module: entry.module,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        outcome: entry.outcome,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        before: entry.before
          ? (entry.before as Prisma.InputJsonValue)
          : undefined,
        after: entry.after
          ? (entry.after as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  private toConversationCreateInput(
    data: CommunicationConversationCreateData,
  ): Omit<Prisma.CommunicationConversationUncheckedCreateInput, 'schoolId'> {
    return {
      type: data.type,
      status: data.status,
      titleEn: data.titleEn ?? null,
      descriptionEn: data.descriptionEn ?? null,
      avatarFileId: data.avatarFileId ?? null,
      academicYearId: data.academicYearId ?? null,
      termId: data.termId ?? null,
      stageId: data.stageId ?? null,
      gradeId: data.gradeId ?? null,
      sectionId: data.sectionId ?? null,
      classroomId: data.classroomId ?? null,
      subjectId: data.subjectId ?? null,
      createdById: data.createdById ?? null,
      metadata: toNullableJson(data.metadata),
    };
  }

  private toConversationUpdateInput(
    data: CommunicationConversationUpdateData,
  ): Prisma.CommunicationConversationUncheckedUpdateManyInput {
    const output: Prisma.CommunicationConversationUncheckedUpdateManyInput = {};

    if (Object.prototype.hasOwnProperty.call(data, 'titleEn')) {
      output.titleEn = data.titleEn ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'descriptionEn')) {
      output.descriptionEn = data.descriptionEn ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'avatarFileId')) {
      output.avatarFileId = data.avatarFileId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'metadata')) {
      output.metadata = toNullableJson(data.metadata);
    }

    return output;
  }
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
) {
  return rows.map((row) => ({
    value: String(row[field]),
    count: row._count._all,
  }));
}
