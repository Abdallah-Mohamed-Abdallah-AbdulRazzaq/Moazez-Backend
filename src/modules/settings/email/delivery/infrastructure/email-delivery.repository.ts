import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SchoolEmailDeliveryBatch,
  SchoolEmailDeliveryBatchStatus,
  SchoolEmailDeliveryKind,
  SchoolEmailDeliveryRecipient,
  SchoolEmailDeliveryRecipientStatus,
  SchoolEmailDeliveryRecipientType,
  SchoolEmailTemplateKey,
  OrganizationStatus,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { SCHOOL_EMAIL_RETRYABLE_REASON_PREFIX } from '../domain/email-delivery.constants';

const RECIPIENT_WITH_BATCH_ARGS =
  Prisma.validator<Prisma.SchoolEmailDeliveryRecipientDefaultArgs>()({
    include: {
      batch: true,
    },
  });

export type EmailDeliveryRecipientWithBatch =
  Prisma.SchoolEmailDeliveryRecipientGetPayload<
    typeof RECIPIENT_WITH_BATCH_ARGS
  >;

export interface CreateDeliveryRecipientData {
  recipientType: SchoolEmailDeliveryRecipientType;
  userId: string | null;
  toEmail: string;
  displayName: string | null;
  status: SchoolEmailDeliveryRecipientStatus;
  skippedReason?: string | null;
  metadata?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
}

export interface SchoolEmailRecoveryCandidate {
  id: string;
  batchId: string;
  schoolId: string;
  organizationId: string;
  actorUserId: string | null;
  actorUserType: UserType | null;
  ineligibilityReason:
    | 'recovery_terminal:source_ineligible'
    | 'recovery_terminal:tenant_ineligible'
    | null;
  status: SchoolEmailDeliveryRecipientStatus;
  createdAt: Date;
}

@Injectable()
export class EmailDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async createBatchWithRecipients(args: {
    schoolId: string;
    kind: SchoolEmailDeliveryKind;
    templateKey: SchoolEmailTemplateKey | null;
    subjectSnapshot?: string | null;
    createdByUserId?: string | null;
    recipientScope?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    previewData?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    campaignContent?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    recipients: CreateDeliveryRecipientData[];
  }): Promise<{
    batch: SchoolEmailDeliveryBatch;
    queuedRecipientIds: string[];
  }> {
    const queuedCount = args.recipients.filter(
      (recipient) =>
        recipient.status === SchoolEmailDeliveryRecipientStatus.QUEUED,
    ).length;
    const skippedCount = args.recipients.filter(
      (recipient) =>
        recipient.status === SchoolEmailDeliveryRecipientStatus.SKIPPED,
    ).length;

    return this.scopedPrisma.$transaction(async (transaction) => {
      const batch = await transaction.schoolEmailDeliveryBatch.create({
        data: {
          schoolId: args.schoolId,
          kind: args.kind,
          status: SchoolEmailDeliveryBatchStatus.QUEUED,
          templateKey: args.templateKey,
          subjectSnapshot: args.subjectSnapshot ?? null,
          createdByUserId: args.createdByUserId ?? null,
          recipientScope: args.recipientScope ?? Prisma.JsonNull,
          previewData: args.previewData ?? Prisma.JsonNull,
          campaignContent: args.campaignContent ?? Prisma.JsonNull,
          totalRecipients: args.recipients.length,
          queuedCount,
          skippedCount,
        },
      });

      const createdRecipients = await Promise.all(
        args.recipients.map((recipient) =>
          transaction.schoolEmailDeliveryRecipient.create({
            data: {
              schoolId: args.schoolId,
              batchId: batch.id,
              recipientType: recipient.recipientType,
              userId: recipient.userId,
              toEmail: recipient.toEmail,
              displayName: recipient.displayName,
              status: recipient.status,
              skippedReason: recipient.skippedReason ?? null,
              metadata: recipient.metadata ?? Prisma.JsonNull,
            },
          }),
        ),
      );

      return {
        batch,
        queuedRecipientIds: createdRecipients
          .filter(
            (recipient) =>
              recipient.status === SchoolEmailDeliveryRecipientStatus.QUEUED,
          )
          .map((recipient) => recipient.id),
      };
    });
  }

  findBatchById(batchId: string): Promise<SchoolEmailDeliveryBatch | null> {
    return this.scopedPrisma.schoolEmailDeliveryBatch.findFirst({
      where: { id: batchId },
    });
  }

  findBatchByIdAndKind(
    batchId: string,
    kind: SchoolEmailDeliveryKind,
  ): Promise<SchoolEmailDeliveryBatch | null> {
    return this.scopedPrisma.schoolEmailDeliveryBatch.findFirst({
      where: { id: batchId, kind },
    });
  }

  async listBatches(params: {
    kind?: SchoolEmailDeliveryKind;
    status?: SchoolEmailDeliveryBatchStatus;
    page: number;
    limit: number;
  }): Promise<{ items: SchoolEmailDeliveryBatch[]; total: number }> {
    const where: Prisma.SchoolEmailDeliveryBatchWhereInput = {
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.status ? { status: params.status } : {}),
    };
    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      this.scopedPrisma.schoolEmailDeliveryBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.scopedPrisma.schoolEmailDeliveryBatch.count({ where }),
    ]);

    return { items, total };
  }

  async listRecipients(params: {
    batchId: string;
    page: number;
    limit: number;
  }): Promise<{ items: SchoolEmailDeliveryRecipient[]; total: number }> {
    const where: Prisma.SchoolEmailDeliveryRecipientWhereInput = {
      batchId: params.batchId,
    };
    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      this.scopedPrisma.schoolEmailDeliveryRecipient.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take: params.limit,
      }),
      this.scopedPrisma.schoolEmailDeliveryRecipient.count({ where }),
    ]);

    return { items, total };
  }

  findRecipientForProcessing(
    recipientId: string,
  ): Promise<EmailDeliveryRecipientWithBatch | null> {
    return this.scopedPrisma.schoolEmailDeliveryRecipient.findFirst({
      where: { id: recipientId },
      ...RECIPIENT_WITH_BATCH_ARGS,
    });
  }

  async markBatchProcessing(batchId: string, now: Date): Promise<void> {
    await this.scopedPrisma.schoolEmailDeliveryBatch.updateMany({
      where: {
        id: batchId,
        status: {
          in: [
            SchoolEmailDeliveryBatchStatus.QUEUED,
            SchoolEmailDeliveryBatchStatus.PROCESSING,
            SchoolEmailDeliveryBatchStatus.FAILED,
            SchoolEmailDeliveryBatchStatus.PARTIAL_FAILED,
          ],
        },
      },
      data: {
        status: SchoolEmailDeliveryBatchStatus.PROCESSING,
        startedAt: now,
      },
    });
  }

  async markRecipientSending(recipientId: string, now: Date): Promise<boolean> {
    const result =
      await this.scopedPrisma.schoolEmailDeliveryRecipient.updateMany({
        where: {
          id: recipientId,
          OR: [
            {
              status: {
                in: [
                  SchoolEmailDeliveryRecipientStatus.PENDING,
                  SchoolEmailDeliveryRecipientStatus.QUEUED,
                ],
              },
            },
            {
              status: SchoolEmailDeliveryRecipientStatus.FAILED,
              failureReason: {
                startsWith: SCHOOL_EMAIL_RETRYABLE_REASON_PREFIX,
              },
            },
          ],
        },
        data: {
          status: SchoolEmailDeliveryRecipientStatus.SENDING,
          attempts: { increment: 1 },
          lastAttemptAt: now,
          failureReason: null,
        },
      });

    return result.count === 1;
  }

  async listRecoveryCandidates(input: {
    windowStartedAt: Date;
    expired: boolean;
    afterId?: string;
    take: number;
  }): Promise<SchoolEmailRecoveryCandidate[]> {
    const rows = await this.prisma.schoolEmailDeliveryRecipient.findMany({
      where: {
        createdAt: input.expired
          ? { lte: input.windowStartedAt }
          : { gt: input.windowStartedAt },
        OR: [
          {
            status: {
              in: [
                SchoolEmailDeliveryRecipientStatus.QUEUED,
                SchoolEmailDeliveryRecipientStatus.PENDING,
              ],
            },
          },
          {
            status: SchoolEmailDeliveryRecipientStatus.FAILED,
            failureReason: { startsWith: SCHOOL_EMAIL_RETRYABLE_REASON_PREFIX },
          },
        ],
        batch: { status: { not: SchoolEmailDeliveryBatchStatus.CANCELLED } },
      },
      select: {
        id: true,
        batchId: true,
        schoolId: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            userType: true,
            status: true,
            deletedAt: true,
          },
        },
        batch: { select: { createdByUserId: true } },
        school: {
          select: {
            organizationId: true,
            status: true,
            deletedAt: true,
            organization: { select: { status: true, deletedAt: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
      ...(input.afterId ? { cursor: { id: input.afterId }, skip: 1 } : {}),
      take: input.take,
    });
    const creatorIds = rows.flatMap((row) =>
      row.batch.createdByUserId ? [row.batch.createdByUserId] : [],
    );
    const creators = await this.prisma.user.findMany({
      where: {
        id: { in: creatorIds },
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true, userType: true },
    });
    const creatorsById = new Map(creators.map((user) => [user.id, user]));

    return rows.map((row) => {
      const actor =
        (row.batch.createdByUserId
          ? creatorsById.get(row.batch.createdByUserId)
          : null) ?? null;
      const tenantIneligible =
        row.school.status !== SchoolStatus.ACTIVE ||
        row.school.deletedAt !== null ||
        row.school.organization.status !== OrganizationStatus.ACTIVE ||
        row.school.organization.deletedAt !== null;
      const recipientSourceIneligible =
        row.user !== null &&
        (row.user.status !== UserStatus.ACTIVE || row.user.deletedAt !== null);
      return {
        id: row.id,
        batchId: row.batchId,
        schoolId: row.schoolId,
        organizationId: row.school.organizationId,
        actorUserId: actor?.id ?? null,
        actorUserType: actor?.userType ?? null,
        ineligibilityReason: tenantIneligible
          ? 'recovery_terminal:tenant_ineligible'
          : recipientSourceIneligible
            ? 'recovery_terminal:source_ineligible'
            : null,
        status: row.status,
        createdAt: row.createdAt,
      };
    });
  }

  async listStaleSendingRecoveryCandidates(input: {
    staleBefore: Date;
    take: number;
  }): Promise<SchoolEmailRecoveryCandidate[]> {
    const rows = await this.prisma.schoolEmailDeliveryRecipient.findMany({
      where: {
        status: SchoolEmailDeliveryRecipientStatus.SENDING,
        lastAttemptAt: { lte: input.staleBefore },
        batch: { status: { not: SchoolEmailDeliveryBatchStatus.CANCELLED } },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: input.take,
    });
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const all = await this.listRecoveryContextByIds(ids);
    return ids.flatMap((id) => {
      const candidate = all.get(id);
      return candidate ? [candidate] : [];
    });
  }

  async updateRecipientMetadata(
    recipientId: string,
    metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull,
  ): Promise<void> {
    await this.scopedPrisma.schoolEmailDeliveryRecipient.updateMany({
      where: { id: recipientId },
      data: { metadata },
    });
  }

  async markRecipientSent(args: {
    recipientId: string;
    sentAt: Date;
    metadata?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  }): Promise<void> {
    await this.scopedPrisma.schoolEmailDeliveryRecipient.updateMany({
      where: { id: args.recipientId },
      data: {
        status: SchoolEmailDeliveryRecipientStatus.SENT,
        sentAt: args.sentAt,
        failureReason: null,
        metadata: args.metadata ?? undefined,
      },
    });
  }

  async markRecipientFailed(args: {
    recipientId: string;
    failureReason: string;
  }): Promise<void> {
    await this.scopedPrisma.schoolEmailDeliveryRecipient.updateMany({
      where: { id: args.recipientId },
      data: {
        status: SchoolEmailDeliveryRecipientStatus.FAILED,
        failureReason: args.failureReason,
      },
    });
  }

  async markRecipientCancelled(
    recipientId: string,
    reason: string,
  ): Promise<void> {
    await this.scopedPrisma.schoolEmailDeliveryRecipient.updateMany({
      where: {
        id: recipientId,
        status: {
          in: [
            SchoolEmailDeliveryRecipientStatus.PENDING,
            SchoolEmailDeliveryRecipientStatus.QUEUED,
            SchoolEmailDeliveryRecipientStatus.SENDING,
          ],
        },
      },
      data: {
        status: SchoolEmailDeliveryRecipientStatus.CANCELLED,
        skippedReason: reason,
      },
    });
  }

  async cancelBatch(
    batchId: string,
    now: Date,
  ): Promise<SchoolEmailDeliveryBatch> {
    await this.scopedPrisma.schoolEmailDeliveryBatch.updateMany({
      where: { id: batchId },
      data: {
        status: SchoolEmailDeliveryBatchStatus.CANCELLED,
        cancelledAt: now,
        completedAt: now,
      },
    });

    await this.scopedPrisma.schoolEmailDeliveryRecipient.updateMany({
      where: {
        batchId,
        status: {
          in: [
            SchoolEmailDeliveryRecipientStatus.PENDING,
            SchoolEmailDeliveryRecipientStatus.QUEUED,
          ],
        },
      },
      data: {
        status: SchoolEmailDeliveryRecipientStatus.CANCELLED,
        skippedReason: 'batch_cancelled',
      },
    });

    return this.scopedPrisma.schoolEmailDeliveryBatch.findFirstOrThrow({
      where: { id: batchId },
    });
  }

  async refreshBatchStatus(batchId: string): Promise<SchoolEmailDeliveryBatch> {
    const batch =
      await this.scopedPrisma.schoolEmailDeliveryBatch.findFirstOrThrow({
        where: { id: batchId },
      });

    if (batch.status === SchoolEmailDeliveryBatchStatus.CANCELLED) {
      return batch;
    }

    const [
      queuedCount,
      pendingCount,
      sendingCount,
      sentCount,
      failedCount,
      skippedCount,
      cancelledCount,
    ] = await Promise.all([
      this.countRecipients(batchId, SchoolEmailDeliveryRecipientStatus.QUEUED),
      this.countRecipients(batchId, SchoolEmailDeliveryRecipientStatus.PENDING),
      this.countRecipients(batchId, SchoolEmailDeliveryRecipientStatus.SENDING),
      this.countRecipients(batchId, SchoolEmailDeliveryRecipientStatus.SENT),
      this.countRecipients(batchId, SchoolEmailDeliveryRecipientStatus.FAILED),
      this.countRecipients(batchId, SchoolEmailDeliveryRecipientStatus.SKIPPED),
      this.countRecipients(
        batchId,
        SchoolEmailDeliveryRecipientStatus.CANCELLED,
      ),
    ]);

    const openCount = queuedCount + pendingCount + sendingCount;
    const now = new Date();
    let nextStatus = batch.status;
    let completedAt = batch.completedAt;

    if (openCount > 0) {
      nextStatus = SchoolEmailDeliveryBatchStatus.PROCESSING;
    } else if (sentCount === batch.totalRecipients) {
      nextStatus = SchoolEmailDeliveryBatchStatus.SUCCEEDED;
      completedAt = completedAt ?? now;
    } else if (sentCount > 0) {
      nextStatus = SchoolEmailDeliveryBatchStatus.PARTIAL_FAILED;
      completedAt = completedAt ?? now;
    } else if (failedCount + skippedCount + cancelledCount > 0) {
      nextStatus = SchoolEmailDeliveryBatchStatus.FAILED;
      completedAt = completedAt ?? now;
    }

    await this.scopedPrisma.schoolEmailDeliveryBatch.updateMany({
      where: { id: batchId },
      data: {
        status: nextStatus,
        queuedCount,
        sentCount,
        failedCount,
        skippedCount: skippedCount + cancelledCount,
        completedAt,
      },
    });

    return this.scopedPrisma.schoolEmailDeliveryBatch.findFirstOrThrow({
      where: { id: batchId },
    });
  }

  private async listRecoveryContextByIds(
    ids: string[],
  ): Promise<Map<string, SchoolEmailRecoveryCandidate>> {
    const rows = await this.prisma.schoolEmailDeliveryRecipient.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        batchId: true,
        schoolId: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            userType: true,
            status: true,
            deletedAt: true,
          },
        },
        batch: { select: { createdByUserId: true } },
        school: {
          select: {
            organizationId: true,
            status: true,
            deletedAt: true,
            organization: { select: { status: true, deletedAt: true } },
          },
        },
      },
    });
    const creatorIds = rows.flatMap((row) =>
      row.batch.createdByUserId ? [row.batch.createdByUserId] : [],
    );
    const creators = await this.prisma.user.findMany({
      where: {
        id: { in: creatorIds },
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true, userType: true },
    });
    const creatorsById = new Map(creators.map((user) => [user.id, user]));

    return new Map(
      rows.map((row) => {
        const actor =
          (row.batch.createdByUserId
            ? creatorsById.get(row.batch.createdByUserId)
            : null) ?? null;
        const tenantIneligible =
          row.school.status !== SchoolStatus.ACTIVE ||
          row.school.deletedAt !== null ||
          row.school.organization.status !== OrganizationStatus.ACTIVE ||
          row.school.organization.deletedAt !== null;
        const recipientSourceIneligible =
          row.user !== null &&
          (row.user.status !== UserStatus.ACTIVE || row.user.deletedAt !== null);
        return [
          row.id,
          {
            id: row.id,
            batchId: row.batchId,
            schoolId: row.schoolId,
            organizationId: row.school.organizationId,
            actorUserId: actor?.id ?? null,
            actorUserType: actor?.userType ?? null,
            ineligibilityReason: tenantIneligible
              ? 'recovery_terminal:tenant_ineligible'
              : recipientSourceIneligible
                ? 'recovery_terminal:source_ineligible'
                : null,
            status: row.status,
            createdAt: row.createdAt,
          },
        ];
      }),
    );
  }

  private countRecipients(
    batchId: string,
    status: SchoolEmailDeliveryRecipientStatus,
  ): Promise<number> {
    return this.scopedPrisma.schoolEmailDeliveryRecipient.count({
      where: { batchId, status },
    });
  }
}
