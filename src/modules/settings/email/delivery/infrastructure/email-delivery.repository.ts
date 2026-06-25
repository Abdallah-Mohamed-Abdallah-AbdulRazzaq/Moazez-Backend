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
} from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

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
          status: {
            in: [
              SchoolEmailDeliveryRecipientStatus.PENDING,
              SchoolEmailDeliveryRecipientStatus.QUEUED,
              SchoolEmailDeliveryRecipientStatus.SENDING,
              SchoolEmailDeliveryRecipientStatus.FAILED,
            ],
          },
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

  private countRecipients(
    batchId: string,
    status: SchoolEmailDeliveryRecipientStatus,
  ): Promise<number> {
    return this.scopedPrisma.schoolEmailDeliveryRecipient.count({
      where: { batchId, status },
    });
  }
}
