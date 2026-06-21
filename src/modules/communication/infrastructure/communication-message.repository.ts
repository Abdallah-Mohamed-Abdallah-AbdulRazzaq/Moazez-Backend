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
      reads: {
        select: {
          userId: true,
        },
      },
      attachments: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          fileId: true,
          caption: true,
          sortOrder: true,
          createdAt: true,
          file: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              visibility: true,
              createdAt: true,
            },
          },
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

const COMMUNICATION_MESSAGE_FILE_REFERENCE_ARGS =
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

const ACTIVE_MESSAGE_READER_PARTICIPANT_STATUSES = [
  CommunicationParticipantStatus.ACTIVE,
  CommunicationParticipantStatus.MUTED,
] as const;

const COMMUNICATION_MESSAGE_READER_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  userType: true,
  status: true,
} satisfies Prisma.UserSelect;

const COMMUNICATION_MESSAGE_INFO_ARGS =
  Prisma.validator<Prisma.CommunicationMessageDefaultArgs>()({
    select: {
      id: true,
      conversationId: true,
      senderUserId: true,
      kind: true,
      status: true,
      body: true,
      clientMessageId: true,
      replyToMessageId: true,
      editedAt: true,
      hiddenAt: true,
      deletedAt: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
      senderUser: {
        select: COMMUNICATION_MESSAGE_READER_USER_SELECT,
      },
    },
  });

const COMMUNICATION_MESSAGE_READER_PARTICIPANT_ARGS =
  Prisma.validator<Prisma.CommunicationConversationParticipantDefaultArgs>()({
    select: {
      id: true,
      userId: true,
      status: true,
      user: {
        select: COMMUNICATION_MESSAGE_READER_USER_SELECT,
      },
    },
  });

const COMMUNICATION_MESSAGE_READER_READ_ARGS =
  Prisma.validator<Prisma.CommunicationMessageReadDefaultArgs>()({
    select: {
      id: true,
      userId: true,
      readAt: true,
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

export type CommunicationMessageFileReference =
  Prisma.FileGetPayload<typeof COMMUNICATION_MESSAGE_FILE_REFERENCE_ARGS>;

export type CommunicationMessageInfoRecord =
  Prisma.CommunicationMessageGetPayload<
    typeof COMMUNICATION_MESSAGE_INFO_ARGS
  >;

export type CommunicationMessageReaderParticipantRecord =
  Prisma.CommunicationConversationParticipantGetPayload<
    typeof COMMUNICATION_MESSAGE_READER_PARTICIPANT_ARGS
  >;

export interface CommunicationMessageReaderCardRecord {
  id: string;
  userId: string;
  readAt: Date;
  user: CommunicationMessageReaderParticipantRecord['user'];
}

export interface CommunicationMessageReadResult {
  id: string | null;
  schoolId: string;
  conversationId: string;
  messageId: string;
  userId: string;
  readAt: Date;
  metadata: Prisma.JsonValue | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  readCount: number;
  wasCreated: boolean;
  isSenderRead: boolean;
}

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
  attachments?: CommunicationMessageCreateAttachmentData[];
}

export interface CommunicationMessageCreateAttachmentData {
  fileId: string;
  uploadedById: string;
  caption?: string | null;
  sortOrder?: number;
}

export interface CommunicationMessageCreateResult {
  message: CommunicationMessageRecord;
  wasCreated: boolean;
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
  messages: Array<{
    messageId: string;
    readCount: number;
  }>;
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

export interface CommunicationMessageReadersResult {
  message: CommunicationMessageInfoRecord;
  readers: CommunicationMessageReaderCardRecord[];
  readCount: number;
  participantsCount: number;
  fullyRead: boolean;
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

  findCurrentSchoolFilesForMessageAttachments(
    fileIds: string[],
  ): Promise<CommunicationMessageFileReference[]> {
    if (fileIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.file.findMany({
      where: {
        id: { in: fileIds },
      },
      ...COMMUNICATION_MESSAGE_FILE_REFERENCE_ARGS,
    });
  }

  async createCurrentSchoolMessage(input: {
    schoolId: string;
    conversationId: string;
    data: CommunicationMessageCreateData;
    buildAuditEntry: (
      message: CommunicationMessageRecord,
    ) => CommunicationMessageAuditInput;
  }): Promise<CommunicationMessageCreateResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const existingMessageId = input.data.clientMessageId
        ? await this.findExistingMessageIdForClientMessageInTransaction(tx, {
            conversationId: input.conversationId,
            senderUserId: input.data.senderUserId ?? null,
            clientMessageId: input.data.clientMessageId,
          })
        : null;

      if (existingMessageId) {
        return {
          message: await this.findMessageInTransaction(tx, existingMessageId),
          wasCreated: false,
        };
      }

      const created = await tx.communicationMessage.create({
        data: {
          schoolId: input.schoolId,
          conversationId: input.conversationId,
          ...this.toMessageCreateInput(input.data),
        },
        select: { id: true },
      });

      const attachments = input.data.attachments ?? [];
      if (attachments.length > 0) {
        await tx.communicationMessageAttachment.createMany({
          data: attachments.map((attachment) => ({
            schoolId: input.schoolId,
            conversationId: input.conversationId,
            messageId: created.id,
            fileId: attachment.fileId,
            uploadedById: attachment.uploadedById,
            caption: normalizeNullableText(attachment.caption),
            sortOrder: attachment.sortOrder ?? 0,
          })),
          skipDuplicates: true,
        });
      }

      const message = await this.findMessageInTransaction(tx, created.id);
      await tx.communicationConversation.updateMany({
        where: { id: message.conversationId, deletedAt: null },
        data: { lastMessageAt: message.sentAt },
      });
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(message),
      );

      return { message, wasCreated: true };
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
  }): Promise<CommunicationMessageReadResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const message = await tx.communicationMessage.findFirst({
        where: {
          id: input.messageId,
          conversationId: input.conversationId,
        },
        select: {
          id: true,
          senderUserId: true,
        },
      });

      if (!message) {
        throw new Error('Communication message read target was not found');
      }

      const isSenderRead =
        message.senderUserId !== null && message.senderUserId === input.userId;
      if (isSenderRead) {
        const readCount =
          await this.countMessageReadsExcludingSenderInTransaction(
            tx,
            input.messageId,
            message.senderUserId,
          );

        return {
          id: null,
          schoolId: input.schoolId,
          conversationId: input.conversationId,
          messageId: input.messageId,
          userId: input.userId,
          readAt: input.readAt,
          metadata: null,
          createdAt: null,
          updatedAt: null,
          readCount,
          wasCreated: false,
          isSenderRead: true,
        };
      }

      const existing = await tx.communicationMessageRead.findFirst({
        where: {
          messageId: input.messageId,
          userId: input.userId,
        },
        select: { id: true },
      });

      const wasCreated = !existing;
      const readId = existing
        ? await this.updateReadInTransaction(tx, existing.id, input.readAt)
        : await this.createReadInTransaction(tx, input);

      await this.updateParticipantReadPointerInTransaction(tx, {
        participantId: input.participantId,
        messageId: input.messageId,
        readAt: input.readAt,
      });

      const [read, readCount] = await Promise.all([
        this.findReadInTransaction(tx, readId),
        this.countMessageReadsExcludingSenderInTransaction(
          tx,
          input.messageId,
          message.senderUserId,
        ),
      ]);

      return {
        ...read,
        readCount,
        wasCreated,
        isSenderRead: false,
      };
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
          OR: [
            { senderUserId: null },
            { senderUserId: { not: input.userId } },
          ],
          reads: {
            none: {
              userId: input.userId,
            },
          },
        },
        orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
        select: { id: true, senderUserId: true },
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

      const messages =
        await this.countMessagesReadsExcludingSendersInTransaction(
          tx,
          unreadMessages,
        );

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
        markedCount: messages.length,
        messages,
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
          senderUserId: true,
          reads: {
            select: {
              userId: true,
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
        readCount: countReadUsersExcludingSender(message),
      })),
    };
  }

  async loadCurrentSchoolMessageReaders(input: {
    messageId: string;
    limit?: number;
    page?: number;
  }): Promise<CommunicationMessageReadersResult | null> {
    const limit = resolveLimit(input.limit, 50);
    const page = resolvePage(input.page);
    const message = await this.scopedPrisma.communicationMessage.findFirst({
      where: { id: input.messageId },
      ...COMMUNICATION_MESSAGE_INFO_ARGS,
    });

    if (!message) return null;

    const participants =
      await this.scopedPrisma.communicationConversationParticipant.findMany({
        where: {
          conversationId: message.conversationId,
          status: { in: [...ACTIVE_MESSAGE_READER_PARTICIPANT_STATUSES] },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...COMMUNICATION_MESSAGE_READER_PARTICIPANT_ARGS,
      });

    const participantByUserId = new Map(
      participants.map((participant) => [participant.userId, participant]),
    );
    const readerUserIds = participants
      .map((participant) => participant.userId)
      .filter(
        (userId) => !message.senderUserId || userId !== message.senderUserId,
      );
    const readWhere: Prisma.CommunicationMessageReadWhereInput = {
      messageId: message.id,
      userId: { in: readerUserIds },
    };

    const [reads, total] = await Promise.all([
      this.scopedPrisma.communicationMessageRead.findMany({
        where: readWhere,
        orderBy: [{ readAt: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...COMMUNICATION_MESSAGE_READER_READ_ARGS,
      }),
      this.scopedPrisma.communicationMessageRead.count({ where: readWhere }),
    ]);

    const readers = reads
      .map((read) => {
        const participant = participantByUserId.get(read.userId);
        if (!participant) return null;

        return {
          id: read.id,
          userId: read.userId,
          readAt: read.readAt,
          user: participant.user,
        };
      })
      .filter(
        (reader): reader is CommunicationMessageReaderCardRecord =>
          reader !== null,
      );

    return {
      message,
      readers,
      readCount: total,
      participantsCount: participants.length,
      fullyRead: participants.length > 0 ? total + 1 >= participants.length : false,
      total,
      limit,
      page,
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

  private async findExistingMessageIdForClientMessageInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      conversationId: string;
      senderUserId: string | null;
      clientMessageId: string;
    },
  ): Promise<string | null> {
    if (!input.senderUserId) return null;

    const existing = await tx.communicationMessage.findFirst({
      where: {
        conversationId: input.conversationId,
        senderUserId: input.senderUserId,
        clientMessageId: input.clientMessageId,
      },
      select: { id: true },
    });

    return existing?.id ?? null;
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

  private countMessageReadsExcludingSenderInTransaction(
    tx: Prisma.TransactionClient,
    messageId: string,
    senderUserId: string | null,
  ): Promise<number> {
    return tx.communicationMessageRead.count({
      where: {
        messageId,
        ...(senderUserId ? { userId: { not: senderUserId } } : {}),
      },
    });
  }

  private async countMessagesReadsExcludingSendersInTransaction(
    tx: Prisma.TransactionClient,
    messages: Array<{ id: string; senderUserId: string | null }>,
  ): Promise<Array<{ messageId: string; readCount: number }>> {
    if (messages.length === 0) return [];

    const senderByMessageId = new Map(
      messages.map((message) => [message.id, message.senderUserId]),
    );
    const countsByMessageId = new Map(
      messages.map((message) => [message.id, 0]),
    );
    const reads = await tx.communicationMessageRead.findMany({
      where: {
        messageId: { in: messages.map((message) => message.id) },
      },
      select: {
        messageId: true,
        userId: true,
      },
    });

    for (const read of reads) {
      const senderUserId = senderByMessageId.get(read.messageId);
      if (senderUserId && read.userId === senderUserId) continue;
      countsByMessageId.set(
        read.messageId,
        (countsByMessageId.get(read.messageId) ?? 0) + 1,
      );
    }

    return messages.map((message) => ({
      messageId: message.id,
      readCount: countsByMessageId.get(message.id) ?? 0,
    }));
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

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function countReadUsersExcludingSender(message: {
  senderUserId: string | null;
  reads: Array<{ userId: string }>;
}): number {
  return message.reads.filter(
    (read) => !message.senderUserId || read.userId !== message.senderUserId,
  ).length;
}

function resolveLimit(limit: number | undefined, fallback: number): number {
  if (!limit || Number.isNaN(limit)) return fallback;
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
