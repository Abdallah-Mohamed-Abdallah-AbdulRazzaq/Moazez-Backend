import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationReportStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const COMMUNICATION_REPORT_MESSAGE_ACCESS_ARGS =
  Prisma.validator<Prisma.CommunicationMessageDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      senderUserId: true,
      kind: true,
      status: true,
      hiddenAt: true,
      deletedAt: true,
      sentAt: true,
      conversation: {
        select: {
          id: true,
          schoolId: true,
          status: true,
        },
      },
    },
  });

const COMMUNICATION_REPORT_PARTICIPANT_ARGS =
  Prisma.validator<Prisma.CommunicationConversationParticipantDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      userId: true,
      role: true,
      status: true,
      mutedUntil: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const COMMUNICATION_REPORT_ARGS =
  Prisma.validator<Prisma.CommunicationMessageReportDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      messageId: true,
      reporterUserId: true,
      status: true,
      reasonCode: true,
      reasonText: true,
      reviewedById: true,
      reviewedAt: true,
      resolutionNote: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      message: {
        select: {
          id: true,
          conversationId: true,
          senderUserId: true,
          kind: true,
          status: true,
          hiddenAt: true,
          deletedAt: true,
          sentAt: true,
        },
      },
    },
  });

export type CommunicationReportMessageAccessRecord =
  Prisma.CommunicationMessageGetPayload<
    typeof COMMUNICATION_REPORT_MESSAGE_ACCESS_ARGS
  >;

export type CommunicationReportParticipantRecord =
  Prisma.CommunicationConversationParticipantGetPayload<
    typeof COMMUNICATION_REPORT_PARTICIPANT_ARGS
  >;

export type CommunicationMessageReportRecord =
  Prisma.CommunicationMessageReportGetPayload<typeof COMMUNICATION_REPORT_ARGS>;

export interface CommunicationReportListFilters {
  status?: CommunicationReportStatus;
  reasonCode?: string;
  conversationId?: string;
  messageId?: string;
  reporterUserId?: string;
  limit?: number;
  page?: number;
}

export interface CommunicationReportListResult {
  items: CommunicationMessageReportRecord[];
  total: number;
  limit: number;
  page: number;
}

export interface CommunicationReportAuditInput {
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

@Injectable()
export class CommunicationReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findMessageForReportAccess(
    messageId: string,
  ): Promise<CommunicationReportMessageAccessRecord | null> {
    return this.scopedPrisma.communicationMessage.findFirst({
      where: { id: messageId },
      ...COMMUNICATION_REPORT_MESSAGE_ACCESS_ARGS,
    });
  }

  findActiveParticipantForActor(input: {
    conversationId: string;
    actorId: string;
  }): Promise<CommunicationReportParticipantRecord | null> {
    return this.scopedPrisma.communicationConversationParticipant.findFirst({
      where: {
        conversationId: input.conversationId,
        userId: input.actorId,
      },
      ...COMMUNICATION_REPORT_PARTICIPANT_ARGS,
    });
  }

  findReporterMessageReport(input: {
    messageId: string;
    reporterUserId: string;
  }): Promise<CommunicationMessageReportRecord | null> {
    return this.scopedPrisma.communicationMessageReport.findFirst({
      where: {
        messageId: input.messageId,
        reporterUserId: input.reporterUserId,
      },
      ...COMMUNICATION_REPORT_ARGS,
    });
  }

  async createCurrentSchoolMessageReport(input: {
    schoolId: string;
    conversationId: string;
    messageId: string;
    reporterUserId: string;
    reasonCode: string;
    reasonText?: string | null;
    metadata?: Record<string, unknown> | null;
    buildAuditEntry: (
      report: CommunicationMessageReportRecord,
    ) => CommunicationReportAuditInput;
  }): Promise<CommunicationMessageReportRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const created = await tx.communicationMessageReport.create({
        data: {
          schoolId: input.schoolId,
          conversationId: input.conversationId,
          messageId: input.messageId,
          reporterUserId: input.reporterUserId,
          reasonCode: input.reasonCode,
          reasonText: normalizeOptionalText(input.reasonText),
          metadata: toNullableJson(input.metadata),
        },
        select: { id: true },
      });

      const report = await this.findReportInTransaction(tx, created.id);
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(report),
      );

      return report;
    });
  }

  async listCurrentSchoolMessageReports(
    filters: CommunicationReportListFilters,
  ): Promise<CommunicationReportListResult> {
    const limit = filters.limit ?? 50;
    const page = filters.page ?? 1;
    const where = this.buildReportWhere(filters);

    const [items, total] = await Promise.all([
      this.scopedPrisma.communicationMessageReport.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...COMMUNICATION_REPORT_ARGS,
      }),
      this.scopedPrisma.communicationMessageReport.count({ where }),
    ]);

    return { items, total, limit, page };
  }

  findCurrentSchoolMessageReportById(
    reportId: string,
  ): Promise<CommunicationMessageReportRecord | null> {
    return this.scopedPrisma.communicationMessageReport.findFirst({
      where: { id: reportId },
      ...COMMUNICATION_REPORT_ARGS,
    });
  }

  async updateCurrentSchoolMessageReport(input: {
    reportId: string;
    status: CommunicationReportStatus;
    reviewedById?: string | null;
    resolutionNote?: string | null;
    metadata?: Record<string, unknown> | null;
    buildAuditEntry: (
      report: CommunicationMessageReportRecord,
    ) => CommunicationReportAuditInput;
  }): Promise<CommunicationMessageReportRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationMessageReport.updateMany({
        where: { id: input.reportId },
        data: {
          status: input.status,
          ...(input.status === CommunicationReportStatus.OPEN
            ? {}
            : {
                reviewedById: input.reviewedById ?? null,
                reviewedAt: new Date(),
              }),
          ...(input.resolutionNote !== undefined
            ? { resolutionNote: normalizeOptionalText(input.resolutionNote) }
            : {}),
          ...(input.metadata !== undefined
            ? { metadata: toNullableJson(input.metadata) }
            : {}),
        },
      });

      const report = await this.findReportInTransaction(tx, input.reportId);
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(report),
      );

      return report;
    });
  }

  private buildReportWhere(
    filters: CommunicationReportListFilters,
  ): Prisma.CommunicationMessageReportWhereInput {
    return {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.reasonCode ? { reasonCode: filters.reasonCode } : {}),
      ...(filters.conversationId
        ? { conversationId: filters.conversationId }
        : {}),
      ...(filters.messageId ? { messageId: filters.messageId } : {}),
      ...(filters.reporterUserId
        ? { reporterUserId: filters.reporterUserId }
        : {}),
    };
  }

  private async findReportInTransaction(
    tx: Prisma.TransactionClient,
    reportId: string,
  ): Promise<CommunicationMessageReportRecord> {
    const report = await tx.communicationMessageReport.findFirst({
      where: { id: reportId },
      ...COMMUNICATION_REPORT_ARGS,
    });

    if (!report) {
      throw new Error('Communication report mutation result was not found');
    }

    return report;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: CommunicationReportAuditInput,
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
        after: entry.after ? (entry.after as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
