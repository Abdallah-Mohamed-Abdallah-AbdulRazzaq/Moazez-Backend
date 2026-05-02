import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma, UserType } from '@prisma/client';
import { withSoftDeleted } from '../../../common/context/request-context';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const COMMUNICATION_ATTACHMENT_ARGS =
  Prisma.validator<Prisma.CommunicationMessageAttachmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      messageId: true,
      fileId: true,
      uploadedById: true,
      caption: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
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

const COMMUNICATION_ATTACHMENT_MESSAGE_ACCESS_ARGS =
  Prisma.validator<Prisma.CommunicationMessageDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      senderUserId: true,
      status: true,
      hiddenAt: true,
      deletedAt: true,
      conversation: {
        select: {
          id: true,
          schoolId: true,
          status: true,
        },
      },
    },
  });

const COMMUNICATION_ATTACHMENT_PARTICIPANT_ACCESS_ARGS =
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

const COMMUNICATION_ATTACHMENT_FILE_REFERENCE_ARGS =
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

export type CommunicationMessageAttachmentRecord =
  Prisma.CommunicationMessageAttachmentGetPayload<
    typeof COMMUNICATION_ATTACHMENT_ARGS
  >;

export type CommunicationMessageAttachmentAccessRecord =
  Prisma.CommunicationMessageGetPayload<
    typeof COMMUNICATION_ATTACHMENT_MESSAGE_ACCESS_ARGS
  >;

export type CommunicationMessageAttachmentParticipantAccessRecord =
  Prisma.CommunicationConversationParticipantGetPayload<
    typeof COMMUNICATION_ATTACHMENT_PARTICIPANT_ACCESS_ARGS
  >;

export type CommunicationMessageAttachmentFileReference =
  Prisma.FileGetPayload<typeof COMMUNICATION_ATTACHMENT_FILE_REFERENCE_ARGS>;

export interface CommunicationMessageAttachmentListResult {
  messageId: string;
  items: CommunicationMessageAttachmentRecord[];
}

export interface CommunicationAttachmentAuditInput {
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
export class CommunicationMessageAttachmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listCurrentSchoolMessageAttachments(input: {
    messageId: string;
  }): Promise<CommunicationMessageAttachmentListResult> {
    const items =
      await this.scopedPrisma.communicationMessageAttachment.findMany({
        where: { messageId: input.messageId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        ...COMMUNICATION_ATTACHMENT_ARGS,
      });

    return {
      messageId: input.messageId,
      items,
    };
  }

  findMessageForReactionOrAttachmentAccess(
    messageId: string,
  ): Promise<CommunicationMessageAttachmentAccessRecord | null> {
    return this.scopedPrisma.communicationMessage.findFirst({
      where: { id: messageId },
      ...COMMUNICATION_ATTACHMENT_MESSAGE_ACCESS_ARGS,
    });
  }

  findActiveParticipantForActor(input: {
    conversationId: string;
    actorId: string;
  }): Promise<CommunicationMessageAttachmentParticipantAccessRecord | null> {
    return this.scopedPrisma.communicationConversationParticipant.findFirst({
      where: {
        conversationId: input.conversationId,
        userId: input.actorId,
      },
      ...COMMUNICATION_ATTACHMENT_PARTICIPANT_ACCESS_ARGS,
    });
  }

  findCurrentSchoolFileOrAttachmentReference(
    fileId: string,
  ): Promise<CommunicationMessageAttachmentFileReference | null> {
    return this.scopedPrisma.file.findFirst({
      where: { id: fileId },
      ...COMMUNICATION_ATTACHMENT_FILE_REFERENCE_ARGS,
    });
  }

  findCurrentSchoolMessageAttachment(input: {
    messageId: string;
    attachmentId: string;
  }): Promise<CommunicationMessageAttachmentRecord | null> {
    return this.scopedPrisma.communicationMessageAttachment.findFirst({
      where: {
        id: input.attachmentId,
        messageId: input.messageId,
      },
      ...COMMUNICATION_ATTACHMENT_ARGS,
    });
  }

  async linkCurrentSchoolMessageAttachment(input: {
    schoolId: string;
    conversationId: string;
    messageId: string;
    fileId: string;
    uploadedById: string;
    caption?: string | null;
    sortOrder?: number;
    buildAuditEntry: (
      attachment: CommunicationMessageAttachmentRecord,
      before: CommunicationMessageAttachmentRecord | null,
    ) => CommunicationAttachmentAuditInput;
  }): Promise<CommunicationMessageAttachmentRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const existing = await withSoftDeleted(() =>
        tx.communicationMessageAttachment.findFirst({
          where: {
            messageId: input.messageId,
            fileId: input.fileId,
          },
          ...COMMUNICATION_ATTACHMENT_ARGS,
        }),
      );

      if (existing && !existing.deletedAt) {
        return existing;
      }

      const attachmentId = existing
        ? await this.restoreAttachmentInTransaction(tx, existing.id, {
            uploadedById: input.uploadedById,
            caption: normalizeNullableText(input.caption),
            sortOrder: input.sortOrder ?? existing.sortOrder,
          })
        : await this.createAttachmentInTransaction(tx, {
            schoolId: input.schoolId,
            conversationId: input.conversationId,
            messageId: input.messageId,
            fileId: input.fileId,
            uploadedById: input.uploadedById,
            caption: normalizeNullableText(input.caption),
            sortOrder: input.sortOrder ?? 0,
          });

      const attachment = await this.findAttachmentInTransaction(
        tx,
        attachmentId,
        true,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(attachment, existing),
      );

      return attachment;
    });
  }

  async deleteCurrentSchoolMessageAttachment(input: {
    attachmentId: string;
    buildAuditEntry: (
      attachment: CommunicationMessageAttachmentRecord,
    ) => CommunicationAttachmentAuditInput;
  }): Promise<{ ok: true }> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const attachment = await this.findAttachmentInTransaction(
        tx,
        input.attachmentId,
        false,
      );

      await tx.communicationMessageAttachment.updateMany({
        where: { id: input.attachmentId },
        data: { deletedAt: new Date() },
      });
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(attachment),
      );

      return { ok: true };
    });
  }

  private async createAttachmentInTransaction(
    tx: Prisma.TransactionClient,
    data: {
      schoolId: string;
      conversationId: string;
      messageId: string;
      fileId: string;
      uploadedById: string;
      caption: string | null;
      sortOrder: number;
    },
  ): Promise<string> {
    const created = await tx.communicationMessageAttachment.create({
      data,
      select: { id: true },
    });

    return created.id;
  }

  private async restoreAttachmentInTransaction(
    tx: Prisma.TransactionClient,
    attachmentId: string,
    data: {
      uploadedById: string;
      caption: string | null;
      sortOrder: number;
    },
  ): Promise<string> {
    await tx.communicationMessageAttachment.updateMany({
      where: { id: attachmentId },
      data: {
        uploadedById: data.uploadedById,
        caption: data.caption,
        sortOrder: data.sortOrder,
        deletedAt: null,
      },
    });

    return attachmentId;
  }

  private async findAttachmentInTransaction(
    tx: Prisma.TransactionClient,
    attachmentId: string,
    includeSoftDeleted: boolean,
  ): Promise<CommunicationMessageAttachmentRecord> {
    const load = () =>
      tx.communicationMessageAttachment.findFirst({
        where: { id: attachmentId },
        ...COMMUNICATION_ATTACHMENT_ARGS,
      });
    const attachment = includeSoftDeleted
      ? await withSoftDeleted(load)
      : await load();

    if (!attachment) {
      throw new Error(
        'Communication message attachment mutation result was not found',
      );
    }

    return attachment;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: CommunicationAttachmentAuditInput,
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

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
