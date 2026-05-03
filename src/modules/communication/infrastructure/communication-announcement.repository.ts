import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
  MembershipStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const COMMUNICATION_ANNOUNCEMENT_AUDIENCE_ARGS =
  Prisma.validator<Prisma.CommunicationAnnouncementAudienceDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      announcementId: true,
      audienceType: true,
      stageId: true,
      gradeId: true,
      sectionId: true,
      classroomId: true,
      studentId: true,
      guardianId: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const COMMUNICATION_ANNOUNCEMENT_ATTACHMENT_ARGS =
  Prisma.validator<Prisma.CommunicationAnnouncementAttachmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      announcementId: true,
      fileId: true,
      createdById: true,
      caption: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
      file: {
        select: {
          id: true,
          schoolId: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          visibility: true,
          deletedAt: true,
        },
      },
    },
  });

const COMMUNICATION_ANNOUNCEMENT_LIST_ARGS =
  Prisma.validator<Prisma.CommunicationAnnouncementDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      title: true,
      status: true,
      priority: true,
      audienceType: true,
      scheduledAt: true,
      publishedAt: true,
      archivedAt: true,
      expiresAt: true,
      createdById: true,
      updatedById: true,
      publishedById: true,
      archivedById: true,
      createdAt: true,
      updatedAt: true,
      audiences: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...COMMUNICATION_ANNOUNCEMENT_AUDIENCE_ARGS,
      },
      _count: {
        select: {
          attachments: true,
          reads: true,
        },
      },
    },
  });

const COMMUNICATION_ANNOUNCEMENT_DETAIL_ARGS =
  Prisma.validator<Prisma.CommunicationAnnouncementDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      title: true,
      body: true,
      status: true,
      priority: true,
      audienceType: true,
      scheduledAt: true,
      publishedAt: true,
      archivedAt: true,
      expiresAt: true,
      createdById: true,
      updatedById: true,
      publishedById: true,
      archivedById: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      audiences: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...COMMUNICATION_ANNOUNCEMENT_AUDIENCE_ARGS,
      },
      attachments: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        ...COMMUNICATION_ANNOUNCEMENT_ATTACHMENT_ARGS,
      },
      _count: {
        select: {
          attachments: true,
          reads: true,
        },
      },
    },
  });

const COMMUNICATION_ANNOUNCEMENT_READ_ARGS =
  Prisma.validator<Prisma.CommunicationAnnouncementReadDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      announcementId: true,
      userId: true,
      readAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const COMMUNICATION_ANNOUNCEMENT_FILE_ARGS =
  Prisma.validator<Prisma.FileDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      visibility: true,
      deletedAt: true,
    },
  });

export type CommunicationAnnouncementAudienceRecord =
  Prisma.CommunicationAnnouncementAudienceGetPayload<
    typeof COMMUNICATION_ANNOUNCEMENT_AUDIENCE_ARGS
  >;

export type CommunicationAnnouncementAttachmentRecord =
  Prisma.CommunicationAnnouncementAttachmentGetPayload<
    typeof COMMUNICATION_ANNOUNCEMENT_ATTACHMENT_ARGS
  >;

export type CommunicationAnnouncementListRecord =
  Prisma.CommunicationAnnouncementGetPayload<
    typeof COMMUNICATION_ANNOUNCEMENT_LIST_ARGS
  >;

export type CommunicationAnnouncementDetailRecord =
  Prisma.CommunicationAnnouncementGetPayload<
    typeof COMMUNICATION_ANNOUNCEMENT_DETAIL_ARGS
  >;

export type CommunicationAnnouncementReadRecord =
  Prisma.CommunicationAnnouncementReadGetPayload<
    typeof COMMUNICATION_ANNOUNCEMENT_READ_ARGS
  >;

export type CommunicationAnnouncementFileReference = Prisma.FileGetPayload<
  typeof COMMUNICATION_ANNOUNCEMENT_FILE_ARGS
>;

export interface CommunicationAnnouncementListFilters {
  status?: CommunicationAnnouncementStatus;
  priority?: CommunicationAnnouncementPriority;
  audienceType?: CommunicationAnnouncementAudienceType;
  search?: string;
  publishedFrom?: Date;
  publishedTo?: Date;
  createdById?: string;
  limit?: number;
  page?: number;
}

export interface CommunicationAnnouncementListResult {
  items: CommunicationAnnouncementListRecord[];
  total: number;
  limit: number;
  page: number;
}

export interface CommunicationAnnouncementCreateData {
  title: string;
  body: string;
  status: CommunicationAnnouncementStatus;
  priority: CommunicationAnnouncementPriority;
  audienceType: CommunicationAnnouncementAudienceType;
  scheduledAt?: Date | null;
  expiresAt?: Date | null;
  createdById?: string | null;
  updatedById?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CommunicationAnnouncementUpdateData {
  title?: string;
  body?: string;
  priority?: CommunicationAnnouncementPriority;
  audienceType?: CommunicationAnnouncementAudienceType;
  scheduledAt?: Date | null;
  expiresAt?: Date | null;
  updatedById?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CommunicationAnnouncementAudienceData {
  audienceType: CommunicationAnnouncementAudienceType;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  studentId?: string | null;
  guardianId?: string | null;
  userId?: string | null;
}

export interface CommunicationAnnouncementAuditInput {
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

export interface CommunicationAnnouncementReadSummaryResult {
  announcementId: string;
  readCount: number;
  totalTargetCount: number | null;
  totalTargetCountReason: string | null;
}

export interface CommunicationAnnouncementAttachmentListResult {
  announcementId: string;
  items: CommunicationAnnouncementAttachmentRecord[];
}

export interface CommunicationAnnouncementAudienceValidationResult {
  missing: Record<string, string[]>;
}

@Injectable()
export class CommunicationAnnouncementRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listCurrentSchoolAnnouncements(input: {
    filters: CommunicationAnnouncementListFilters;
  }): Promise<CommunicationAnnouncementListResult> {
    const limit = input.filters.limit ?? 50;
    const page = input.filters.page ?? 1;
    const where = this.buildAnnouncementWhere(input.filters);

    const [items, total] = await Promise.all([
      this.scopedPrisma.communicationAnnouncement.findMany({
        where,
        orderBy: [
          { publishedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        take: limit,
        skip: (page - 1) * limit,
        ...COMMUNICATION_ANNOUNCEMENT_LIST_ARGS,
      }),
      this.scopedPrisma.communicationAnnouncement.count({ where }),
    ]);

    return { items, total, limit, page };
  }

  findCurrentSchoolAnnouncementById(
    announcementId: string,
  ): Promise<CommunicationAnnouncementDetailRecord | null> {
    return this.scopedPrisma.communicationAnnouncement.findFirst({
      where: { id: announcementId },
      ...COMMUNICATION_ANNOUNCEMENT_DETAIL_ARGS,
    });
  }

  async createCurrentSchoolAnnouncement(input: {
    schoolId: string;
    data: CommunicationAnnouncementCreateData;
    audienceRows: CommunicationAnnouncementAudienceData[];
    buildAuditEntry: (
      announcement: CommunicationAnnouncementDetailRecord,
    ) => CommunicationAnnouncementAuditInput;
  }): Promise<CommunicationAnnouncementDetailRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const created = await tx.communicationAnnouncement.create({
        data: {
          schoolId: input.schoolId,
          ...this.toAnnouncementCreateInput(input.data),
        },
        select: { id: true },
      });

      await this.createAudienceRowsInTransaction(tx, {
        schoolId: input.schoolId,
        announcementId: created.id,
        audienceRows: input.audienceRows,
      });

      const announcement = await this.findAnnouncementInTransaction(
        tx,
        created.id,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(announcement),
      );

      return announcement;
    });
  }

  async updateCurrentSchoolAnnouncement(input: {
    announcementId: string;
    data: CommunicationAnnouncementUpdateData;
    replaceAudience?: {
      schoolId: string;
      audienceRows: CommunicationAnnouncementAudienceData[];
    };
    buildAuditEntry: (
      announcement: CommunicationAnnouncementDetailRecord,
    ) => CommunicationAnnouncementAuditInput;
  }): Promise<CommunicationAnnouncementDetailRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationAnnouncement.updateMany({
        where: { id: input.announcementId },
        data: this.toAnnouncementUpdateInput(input.data),
      });

      if (input.replaceAudience) {
        await this.replaceAudienceRowsInTransaction(tx, {
          schoolId: input.replaceAudience.schoolId,
          announcementId: input.announcementId,
          audienceRows: input.replaceAudience.audienceRows,
        });
      }

      const announcement = await this.findAnnouncementInTransaction(
        tx,
        input.announcementId,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(announcement),
      );

      return announcement;
    });
  }

  async replaceCurrentSchoolAnnouncementAudience(input: {
    schoolId: string;
    announcementId: string;
    audienceRows: CommunicationAnnouncementAudienceData[];
  }): Promise<CommunicationAnnouncementAudienceRecord[]> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await this.replaceAudienceRowsInTransaction(tx, input);
      return tx.communicationAnnouncementAudience.findMany({
        where: { announcementId: input.announcementId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...COMMUNICATION_ANNOUNCEMENT_AUDIENCE_ARGS,
      });
    });
  }

  async publishCurrentSchoolAnnouncement(input: {
    announcementId: string;
    actorId: string;
    publishedAt: Date;
    buildAuditEntry: (
      announcement: CommunicationAnnouncementDetailRecord,
    ) => CommunicationAnnouncementAuditInput;
  }): Promise<CommunicationAnnouncementDetailRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationAnnouncement.updateMany({
        where: { id: input.announcementId },
        data: {
          status: CommunicationAnnouncementStatus.PUBLISHED,
          publishedAt: input.publishedAt,
          publishedById: input.actorId,
          updatedById: input.actorId,
        },
      });

      const announcement = await this.findAnnouncementInTransaction(
        tx,
        input.announcementId,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(announcement),
      );

      return announcement;
    });
  }

  async archiveCurrentSchoolAnnouncement(input: {
    announcementId: string;
    actorId: string;
    archivedAt: Date;
    buildAuditEntry: (
      announcement: CommunicationAnnouncementDetailRecord,
    ) => CommunicationAnnouncementAuditInput;
  }): Promise<CommunicationAnnouncementDetailRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationAnnouncement.updateMany({
        where: { id: input.announcementId },
        data: {
          status: CommunicationAnnouncementStatus.ARCHIVED,
          archivedAt: input.archivedAt,
          archivedById: input.actorId,
          updatedById: input.actorId,
        },
      });

      const announcement = await this.findAnnouncementInTransaction(
        tx,
        input.announcementId,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(announcement),
      );

      return announcement;
    });
  }

  async cancelCurrentSchoolAnnouncement(input: {
    announcementId: string;
    actorId: string;
    buildAuditEntry: (
      announcement: CommunicationAnnouncementDetailRecord,
    ) => CommunicationAnnouncementAuditInput;
  }): Promise<CommunicationAnnouncementDetailRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationAnnouncement.updateMany({
        where: { id: input.announcementId },
        data: {
          status: CommunicationAnnouncementStatus.CANCELLED,
          updatedById: input.actorId,
        },
      });

      const announcement = await this.findAnnouncementInTransaction(
        tx,
        input.announcementId,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(announcement),
      );

      return announcement;
    });
  }

  async markCurrentSchoolAnnouncementRead(input: {
    schoolId: string;
    announcementId: string;
    userId: string;
    readAt: Date;
  }): Promise<CommunicationAnnouncementReadRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const existing = await tx.communicationAnnouncementRead.findFirst({
        where: {
          announcementId: input.announcementId,
          userId: input.userId,
        },
        select: { id: true },
      });

      const readId = existing
        ? await this.updateReadInTransaction(tx, existing.id, input.readAt)
        : await this.createReadInTransaction(tx, input);

      return this.findReadInTransaction(tx, readId);
    });
  }

  async getCurrentSchoolAnnouncementReadSummary(input: {
    announcementId: string;
  }): Promise<CommunicationAnnouncementReadSummaryResult> {
    const readCount =
      await this.scopedPrisma.communicationAnnouncementRead.count({
        where: { announcementId: input.announcementId },
      });

    return {
      announcementId: input.announcementId,
      readCount,
      totalTargetCount: null,
      totalTargetCountReason:
        'audience_target_count_deferred_until_app_audience_resolution',
    };
  }

  async listCurrentSchoolAnnouncementAttachments(input: {
    announcementId: string;
  }): Promise<CommunicationAnnouncementAttachmentListResult> {
    const items =
      await this.scopedPrisma.communicationAnnouncementAttachment.findMany({
        where: { announcementId: input.announcementId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        ...COMMUNICATION_ANNOUNCEMENT_ATTACHMENT_ARGS,
      });

    return { announcementId: input.announcementId, items };
  }

  async linkCurrentSchoolAnnouncementAttachment(input: {
    schoolId: string;
    announcementId: string;
    fileId: string;
    createdById: string;
    caption?: string | null;
    sortOrder?: number;
    buildAuditEntry: (
      attachment: CommunicationAnnouncementAttachmentRecord,
      before: CommunicationAnnouncementAttachmentRecord | null,
    ) => CommunicationAnnouncementAuditInput;
  }): Promise<CommunicationAnnouncementAttachmentRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const existing = await tx.communicationAnnouncementAttachment.findFirst({
        where: {
          announcementId: input.announcementId,
          fileId: input.fileId,
        },
        ...COMMUNICATION_ANNOUNCEMENT_ATTACHMENT_ARGS,
      });

      if (existing) return existing;

      const created = await tx.communicationAnnouncementAttachment.create({
        data: {
          schoolId: input.schoolId,
          announcementId: input.announcementId,
          fileId: input.fileId,
          createdById: input.createdById,
          caption: normalizeNullableText(input.caption),
          sortOrder: input.sortOrder ?? 0,
        },
        select: { id: true },
      });

      const attachment = await this.findAttachmentInTransaction(tx, created.id);
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(attachment, null),
      );

      return attachment;
    });
  }

  async deleteCurrentSchoolAnnouncementAttachment(input: {
    announcementId: string;
    attachmentId: string;
    buildAuditEntry: (
      attachment: CommunicationAnnouncementAttachmentRecord,
    ) => CommunicationAnnouncementAuditInput;
  }): Promise<{ ok: true }> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const attachment = await tx.communicationAnnouncementAttachment.findFirst(
        {
          where: {
            id: input.attachmentId,
            announcementId: input.announcementId,
          },
          ...COMMUNICATION_ANNOUNCEMENT_ATTACHMENT_ARGS,
        },
      );

      if (!attachment) {
        throw new Error(
          'Communication announcement attachment mutation target was not found',
        );
      }

      await tx.communicationAnnouncementAttachment.deleteMany({
        where: {
          id: attachment.id,
          announcementId: input.announcementId,
        },
      });
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(attachment),
      );

      return { ok: true };
    });
  }

  findCurrentSchoolFileForAnnouncementAttachment(
    fileId: string,
  ): Promise<CommunicationAnnouncementFileReference | null> {
    return this.scopedPrisma.file.findFirst({
      where: { id: fileId },
      ...COMMUNICATION_ANNOUNCEMENT_FILE_ARGS,
    });
  }

  async validateAudienceTargetsInCurrentSchool(input: {
    audienceRows: CommunicationAnnouncementAudienceData[];
  }): Promise<CommunicationAnnouncementAudienceValidationResult> {
    const ids = collectAudienceTargetIds(input.audienceRows);
    const missing: Record<string, string[]> = {};

    await Promise.all([
      this.collectMissingScopedIds({
        field: 'stageId',
        ids: ids.stageId,
        count: (values) =>
          this.scopedPrisma.stage.count({ where: { id: { in: values } } }),
        missing,
      }),
      this.collectMissingScopedIds({
        field: 'gradeId',
        ids: ids.gradeId,
        count: (values) =>
          this.scopedPrisma.grade.count({ where: { id: { in: values } } }),
        missing,
      }),
      this.collectMissingScopedIds({
        field: 'sectionId',
        ids: ids.sectionId,
        count: (values) =>
          this.scopedPrisma.section.count({ where: { id: { in: values } } }),
        missing,
      }),
      this.collectMissingScopedIds({
        field: 'classroomId',
        ids: ids.classroomId,
        count: (values) =>
          this.scopedPrisma.classroom.count({
            where: { id: { in: values } },
          }),
        missing,
      }),
      this.collectMissingScopedIds({
        field: 'studentId',
        ids: ids.studentId,
        count: (values) =>
          this.scopedPrisma.student.count({ where: { id: { in: values } } }),
        missing,
      }),
      this.collectMissingScopedIds({
        field: 'guardianId',
        ids: ids.guardianId,
        count: (values) =>
          this.scopedPrisma.guardian.count({ where: { id: { in: values } } }),
        missing,
      }),
      this.collectMissingScopedIds({
        field: 'userId',
        ids: ids.userId,
        count: (values) =>
          this.scopedPrisma.membership.count({
            where: {
              userId: { in: values },
              status: MembershipStatus.ACTIVE,
            },
          }),
        missing,
      }),
    ]);

    return { missing };
  }

  private buildAnnouncementWhere(
    filters: CommunicationAnnouncementListFilters,
  ): Prisma.CommunicationAnnouncementWhereInput {
    const search = normalizeNullableText(filters.search);

    return {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.audienceType ? { audienceType: filters.audienceType } : {}),
      ...(filters.createdById ? { createdById: filters.createdById } : {}),
      ...(filters.publishedFrom || filters.publishedTo
        ? {
            publishedAt: {
              ...(filters.publishedFrom ? { gte: filters.publishedFrom } : {}),
              ...(filters.publishedTo ? { lte: filters.publishedTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { body: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async createAudienceRowsInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      announcementId: string;
      audienceRows: CommunicationAnnouncementAudienceData[];
    },
  ): Promise<void> {
    if (input.audienceRows.length === 0) return;

    await tx.communicationAnnouncementAudience.createMany({
      data: input.audienceRows.map((row) => ({
        schoolId: input.schoolId,
        announcementId: input.announcementId,
        audienceType: row.audienceType,
        stageId: row.stageId ?? null,
        gradeId: row.gradeId ?? null,
        sectionId: row.sectionId ?? null,
        classroomId: row.classroomId ?? null,
        studentId: row.studentId ?? null,
        guardianId: row.guardianId ?? null,
        userId: row.userId ?? null,
      })),
    });
  }

  private async replaceAudienceRowsInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      announcementId: string;
      audienceRows: CommunicationAnnouncementAudienceData[];
    },
  ): Promise<void> {
    await tx.communicationAnnouncementAudience.deleteMany({
      where: { announcementId: input.announcementId },
    });
    await this.createAudienceRowsInTransaction(tx, input);
  }

  private async createReadInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      announcementId: string;
      userId: string;
      readAt: Date;
    },
  ): Promise<string> {
    const created = await tx.communicationAnnouncementRead.create({
      data: {
        schoolId: input.schoolId,
        announcementId: input.announcementId,
        userId: input.userId,
        readAt: input.readAt,
      },
      select: { id: true },
    });

    return created.id;
  }

  private async updateReadInTransaction(
    tx: Prisma.TransactionClient,
    readId: string,
    readAt: Date,
  ): Promise<string> {
    await tx.communicationAnnouncementRead.updateMany({
      where: { id: readId },
      data: { readAt },
    });

    return readId;
  }

  private async findReadInTransaction(
    tx: Prisma.TransactionClient,
    readId: string,
  ): Promise<CommunicationAnnouncementReadRecord> {
    const read = await tx.communicationAnnouncementRead.findFirst({
      where: { id: readId },
      ...COMMUNICATION_ANNOUNCEMENT_READ_ARGS,
    });

    if (!read) {
      throw new Error(
        'Communication announcement read mutation result was not found',
      );
    }

    return read;
  }

  private async findAnnouncementInTransaction(
    tx: Prisma.TransactionClient,
    announcementId: string,
  ): Promise<CommunicationAnnouncementDetailRecord> {
    const announcement = await tx.communicationAnnouncement.findFirst({
      where: { id: announcementId },
      ...COMMUNICATION_ANNOUNCEMENT_DETAIL_ARGS,
    });

    if (!announcement) {
      throw new Error(
        'Communication announcement mutation result was not found',
      );
    }

    return announcement;
  }

  private async findAttachmentInTransaction(
    tx: Prisma.TransactionClient,
    attachmentId: string,
  ): Promise<CommunicationAnnouncementAttachmentRecord> {
    const attachment = await tx.communicationAnnouncementAttachment.findFirst({
      where: { id: attachmentId },
      ...COMMUNICATION_ANNOUNCEMENT_ATTACHMENT_ARGS,
    });

    if (!attachment) {
      throw new Error(
        'Communication announcement attachment mutation result was not found',
      );
    }

    return attachment;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: CommunicationAnnouncementAuditInput,
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

  private toAnnouncementCreateInput(
    data: CommunicationAnnouncementCreateData,
  ): Omit<Prisma.CommunicationAnnouncementUncheckedCreateInput, 'schoolId'> {
    return {
      title: data.title,
      body: data.body,
      status: data.status,
      priority: data.priority,
      audienceType: data.audienceType,
      scheduledAt: data.scheduledAt ?? null,
      expiresAt: data.expiresAt ?? null,
      createdById: data.createdById ?? null,
      updatedById: data.updatedById ?? null,
      metadata: toNullableJson(data.metadata),
    };
  }

  private toAnnouncementUpdateInput(
    data: CommunicationAnnouncementUpdateData,
  ): Prisma.CommunicationAnnouncementUncheckedUpdateManyInput {
    const output: Prisma.CommunicationAnnouncementUncheckedUpdateManyInput = {};

    if (Object.prototype.hasOwnProperty.call(data, 'title')) {
      output.title = data.title;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'body')) {
      output.body = data.body;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'priority')) {
      output.priority = data.priority;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'audienceType')) {
      output.audienceType = data.audienceType;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'scheduledAt')) {
      output.scheduledAt = data.scheduledAt ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'expiresAt')) {
      output.expiresAt = data.expiresAt ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'updatedById')) {
      output.updatedById = data.updatedById ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'metadata')) {
      output.metadata = toNullableJson(data.metadata);
    }

    return output;
  }

  private async collectMissingScopedIds(params: {
    field: string;
    ids: string[];
    count: (ids: string[]) => Promise<number>;
    missing: Record<string, string[]>;
  }): Promise<void> {
    if (params.ids.length === 0) return;
    const uniqueIds = [...new Set(params.ids)];
    const count = await params.count(uniqueIds);
    if (count !== uniqueIds.length) {
      params.missing[params.field] = uniqueIds;
    }
  }
}

function collectAudienceTargetIds(
  rows: CommunicationAnnouncementAudienceData[],
): Record<string, string[]> {
  const ids: Record<string, string[]> = {
    stageId: [],
    gradeId: [],
    sectionId: [],
    classroomId: [],
    studentId: [],
    guardianId: [],
    userId: [],
  };

  for (const row of rows) {
    if (row.stageId) ids.stageId.push(row.stageId);
    if (row.gradeId) ids.gradeId.push(row.gradeId);
    if (row.sectionId) ids.sectionId.push(row.sectionId);
    if (row.classroomId) ids.classroomId.push(row.classroomId);
    if (row.studentId) ids.studentId.push(row.studentId);
    if (row.guardianId) ids.guardianId.push(row.guardianId);
    if (row.userId) ids.userId.push(row.userId);
  }

  return ids;
}

function normalizeNullableText(
  value: string | null | undefined,
): string | null {
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
