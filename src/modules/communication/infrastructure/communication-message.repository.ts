import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationConversationStatus,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const COMMUNICATION_MESSAGE_ARGS =
  Prisma.validator<Prisma.CommunicationMessageDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      senderUserId: true,
      kind: true,
      status: true,
      body: true,
      clientMessageId: true,
      replyToMessageId: true,
      editedAt: true,
      hiddenById: true,
      hiddenAt: true,
      hiddenReason: true,
      deletedById: true,
      deletedAt: true,
      sentAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          reads: true,
        },
      },
    },
  });

const COMMUNICATION_CONVERSATION_ACCESS_ARGS =
  Prisma.validator<Prisma.CommunicationConversationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      status: true,
      metadata: true,
    },
  });

const COMMUNICATION_PARTICIPANT_ACCESS_ARGS =
  Prisma.validator<Prisma.CommunicationConversationParticipantDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      userId: true,
      role: true,
      status: true,
      mutedUntil: true,
      lastReadMessageId: true,
      lastReadAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const COMMUNICATION_MESSAGE_READ_ARGS =
  Prisma.validator<Prisma.CommunicationMessageReadDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      messageId: true,
      userId: true,
      readAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export type CommunicationMessageRecord = Prisma.CommunicationMessageGetPayload<
  typeof COMMUNICATION_MESSAGE_ARGS
>;

export type CommunicationMessageConversationAccessRecord =
  Prisma.CommunicationConversationGetPayload<
    typeof COMMUNICATION_CONVERSATION_ACCESS_ARGS
  >;

export type CommunicationMessageParticipantAccessRecord =
  Prisma.CommunicationConversationParticipantGetPayload<
    typeof COMMUNICATION_PARTICIPANT_ACCESS_ARGS
  >;

export type CommunicationMessageReadRecord =
  Prisma.CommunicationMessageReadGetPayload<
    typeof COMMUNICATION_MESSAGE_READ_ARGS
  >;

export interface CommunicationMessageListFilters {
  kind?: CommunicationMessageKind;
  status?: CommunicationMessageStatus;
  before?: Date;
  after?: Date;
  limit?: number;
  page?: number;
}

export interface CommunicationMessageListResult {
  conversationId: string;
  items: CommunicationMessageRecord[];
  total: number;
  limit: number;
  page: number;
}

export interface CommunicationMessageCreateData {
  kind: CommunicationMessageKind;
  status: CommunicationMessageStatus;
  body: string | null;
  clientMessageId?: string | null;
  replyToMessageId?: string | null;
  senderUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CommunicationMessageUpdateData {
  body?: string | null;
}

export interface CommunicationMessageAuditInput {
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

export interface CommunicationConversationReadResult {
  conversationId: string;
  readAt: Date;
  markedCount: number;
}

export interface CommunicationReadSummaryResult {
  conversationId: string;
  items: Array<{
    messageId: string;
    readCount: number;
  }>;
  total: number;
  limit: number;
  page: number;
}

@Injectable()
export class CommunicationMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listCurrentSchoolMessages(input: {
    conversationId: string;
    filters: CommunicationMessageListFilters;
  }): Promise<CommunicationMessageListResult> {
    const limit = input.filters.limit ?? 50;
    const page = input.filters.page ?? 1;
    const where = this.buildMessageWhere(input.conversationId, input.filters);

    const [items, total] = await Promise.all([
      this.scopedPrisma.communicationMessage.findMany({
        where,
        orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...COMMUNICATION_MESSAGE_ARGS,
      }),
      this.scopedPrisma.communicationMessage.count({ where }),
    ]);

    return {
      conversationId: input.conversationId,
      items,
      total,
      limit,
      page,
    };
  }

  findCurrentSchoolMessageById(
    messageId: string,
  ): Promise<CommunicationMessageRecord | null> {
    return this.scopedPrisma.communicationMessage.findFirst({
      where: { id: messageId },
      ...COMMUNICATION_MESSAGE_ARGS,
    });
  }

  findCurrentSchoolReplyTarget(input: {
    conversationId: string;
    messageId: string;
  }): Promise<CommunicationMessageRecord | null> {
    return this.scopedPrisma.communicationMessage.findFirst({
      where: {
        id: input.messageId,
        conversationId: input.conversationId,
      },
      ...COMMUNICATION_MESSAGE_ARGS,
    });
  }

  findConversationForMessageAccess(
    conversationId: string,
  ): Promise<CommunicationMessageConversationAccessRecord | null> {
    return this.scopedPrisma.communicationConversation.findFirst({
      where: { id: conversationId },
      ...COMMUNICATION_CONVERSATION_ACCESS_ARGS,
    });
  }

  findConversationForMessage(
    message: Pick<CommunicationMessageRecord, 'conversationId'>,
  ): Promise<CommunicationMessageConversationAccessRecord | null> {
    return this.findConversationForMessageAccess(message.conversationId);
  }

  findActiveParticipantForActor(input: {
    conversationId: string;
    actorId: string;
  }): Promise<CommunicationMessageParticipantAccessRecord | null> {
    return this.scopedPrisma.communicationConversationParticipant.findFirst({
      where: {
        conversationId: input.conversationId,
        userId: input.actorId,
      },
      ...COMMUNICATION_PARTICIPANT_ACCESS_ARGS,
    });
  }

  async createCurrentSchoolMessage(input: {
    schoolId: string;
    conversationId: string;
    data: CommunicationMessageCreateData;
    buildAuditEntry: (
      message: CommunicationMessageRecord,
    ) => CommunicationMessageAuditInput;
  }): Promise<CommunicationMessageRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const created = await tx.communicationMessage.create({
        data: {
          schoolId: input.schoolId,
          conversationId: input.conversationId,
          ...this.toMessageCreateInput(input.data),
        },
        select: { id: true },
      });

      const message = await this.findMessageInTransaction(tx, created.id);
      await tx.communicationConversation.updateMany({
        where: { id: message.conversationId, deletedAt: null },
        data: { lastMessageAt: message.sentAt },
      });
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(message),
      );

      return message;
    });
  }

  async updateCurrentSchoolMessage(input: {
    messageId: string;
    data: CommunicationMessageUpdateData;
    buildAuditEntry: (
      message: CommunicationMessageRecord,
    ) => CommunicationMessageAuditInput;
  }): Promise<CommunicationMessageRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationMessage.updateMany({
        where: { id: input.messageId },
        data: {
          ...this.toMessageUpdateInput(input.data),
          editedAt: new Date(),
        },
      });

      const message = await this.findMessageInTransaction(tx, input.messageId);
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(message),
      );

      return message;
    });
  }

  async deleteOrHideCurrentSchoolMessage(input: {
    messageId: string;
    actorId: string;
    buildAuditEntry: (
      message: CommunicationMessageRecord,
    ) => CommunicationMessageAuditInput;
  }): Promise<CommunicationMessageRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationMessage.updateMany({
        where: { id: input.messageId },
        data: {
          status: CommunicationMessageStatus.DELETED,
          deletedAt: new Date(),
          deletedById: input.actorId,
        },
      });

      const message = await this.findMessageInTransaction(tx, input.messageId);
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(message),
      );

      return message;
    });
  }

  async markCurrentSchoolMessageRead(input: {
    schoolId: string;
    conversationId: string;
    messageId: string;
    userId: string;
    participantId: string;
    readAt: Date;
  }): Promise<CommunicationMessageReadRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const existing = await tx.communicationMessageRead.findFirst({
        where: {
          messageId: input.messageId,
          userId: input.userId,
        },
        select: { id: true },
      });

      const readId = existing
        ? await this.updateReadInTransaction(tx, existing.id, input.readAt)
        : await this.createReadInTransaction(tx, input);

      await this.updateParticipantReadPointerInTransaction(tx, {
        participantId: input.participantId,
        messageId: input.messageId,
        readAt: input.readAt,
      });

      return this.findReadInTransaction(tx, readId);
    });
  }

  async markCurrentSchoolConversationRead(input: {
    schoolId: string;
    conversationId: string;
    userId: string;
    participantId: string;
    readAt: Date;
  }): Promise<CommunicationConversationReadResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const unreadMessages = await tx.communicationMessage.findMany({
        where: {
          conversationId: input.conversationId,
          status: CommunicationMessageStatus.SENT,
          reads: {
            none: {
              userId: input.userId,
            },
          },
        },
        orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });

      if (unreadMessages.length > 0) {
        await tx.communicationMessageRead.createMany({
          data: unreadMessages.map((message) => ({
            schoolId: input.schoolId,
            conversationId: input.conversationId,
            messageId: message.id,
            userId: input.userId,
            readAt: input.readAt,
          })),
          skipDuplicates: true,
        });
      }

      const latestMessage = await tx.communicationMessage.findFirst({
        where: {
          conversationId: input.conversationId,
          status: CommunicationMessageStatus.SENT,
        },
        orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
        select: { id: true },
      });

      if (latestMessage) {
        await this.updateParticipantReadPointerInTransaction(tx, {
          participantId: input.participantId,
          messageId: latestMessage.id,
          readAt: input.readAt,
        });
      }

      return {
        conversationId: input.conversationId,
        readAt: input.readAt,
        markedCount: unreadMessages.length,
      };
    });
  }

  async loadCurrentSchoolConversationReadSummary(input: {
    conversationId: string;
    limit?: number;
    page?: number;
  }): Promise<CommunicationReadSummaryResult> {
    const limit = input.limit ?? 50;
    const page = input.page ?? 1;
    const where: Prisma.CommunicationMessageWhereInput = {
      conversationId: input.conversationId,
      status: CommunicationMessageStatus.SENT,
    };

    const [messages, total] = await Promise.all([
      this.scopedPrisma.communicationMessage.findMany({
        where,
        orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        select: {
          id: true,
          _count: {
            select: {
              reads: true,
            },
          },
        },
      }),
      this.scopedPrisma.communicationMessage.count({ where }),
    ]);

    return {
      conversationId: input.conversationId,
      total,
      limit,
      page,
      items: messages.map((message) => ({
        messageId: message.id,
        readCount: message._count.reads,
      })),
    };
  }

  private buildMessageWhere(
    conversationId: string,
    filters: CommunicationMessageListFilters,
  ): Prisma.CommunicationMessageWhereInput {
    return {
      conversationId,
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.before || filters.after
        ? {
            sentAt: {
              ...(filters.before ? { lt: filters.before } : {}),
              ...(filters.after ? { gt: filters.after } : {}),
            },
          }
        : {}),
    };
  }

  private async createReadInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      conversationId: string;
      messageId: string;
      userId: string;
      readAt: Date;
    },
  ): Promise<string> {
    const created = await tx.communicationMessageRead.create({
      data: {
        schoolId: input.schoolId,
        conversationId: input.conversationId,
        messageId: input.messageId,
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
    await tx.communicationMessageRead.updateMany({
      where: { id: readId },
      data: { readAt },
    });

    return readId;
  }

  private async updateParticipantReadPointerInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      participantId: string;
      messageId: string;
      readAt: Date;
    },
  ): Promise<void> {
    await tx.communicationConversationParticipant.updateMany({
      where: { id: input.participantId },
      data: {
        lastReadMessageId: input.messageId,
        lastReadAt: input.readAt,
      },
    });
  }

  private async findMessageInTransaction(
    tx: Prisma.TransactionClient,
    messageId: string,
  ): Promise<CommunicationMessageRecord> {
    const message = await tx.communicationMessage.findFirst({
      where: { id: messageId },
      ...COMMUNICATION_MESSAGE_ARGS,
    });

    if (!message) {
      throw new Error('Communication message mutation result was not found');
    }

    return message;
  }

  private async findReadInTransaction(
    tx: Prisma.TransactionClient,
    readId: string,
  ): Promise<CommunicationMessageReadRecord> {
    const read = await tx.communicationMessageRead.findFirst({
      where: { id: readId },
      ...COMMUNICATION_MESSAGE_READ_ARGS,
    });

    if (!read) {
      throw new Error('Communication message read result was not found');
    }

    return read;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: CommunicationMessageAuditInput,
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

  private toMessageCreateInput(
    data: CommunicationMessageCreateData,
  ): Omit<
    Prisma.CommunicationMessageUncheckedCreateInput,
    'schoolId' | 'conversationId'
  > {
    return {
      senderUserId: data.senderUserId ?? null,
      kind: data.kind,
      status: data.status,
      body: data.body,
      clientMessageId: data.clientMessageId ?? null,
      replyToMessageId: data.replyToMessageId ?? null,
      metadata: toNullableJson(data.metadata),
    };
  }

  private toMessageUpdateInput(
    data: CommunicationMessageUpdateData,
  ): Prisma.CommunicationMessageUncheckedUpdateManyInput {
    const output: Prisma.CommunicationMessageUncheckedUpdateManyInput = {};

    if (Object.prototype.hasOwnProperty.call(data, 'body')) {
      output.body = data.body ?? null;
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
