import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma, UserType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const COMMUNICATION_REACTION_ARGS =
  Prisma.validator<Prisma.CommunicationMessageReactionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      messageId: true,
      userId: true,
      reactionKey: true,
      emoji: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const COMMUNICATION_REACTION_MESSAGE_ACCESS_ARGS =
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

const COMMUNICATION_REACTION_PARTICIPANT_ACCESS_ARGS =
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

export type CommunicationMessageReactionRecord =
  Prisma.CommunicationMessageReactionGetPayload<
    typeof COMMUNICATION_REACTION_ARGS
  >;

export type CommunicationMessageReactionAccessRecord =
  Prisma.CommunicationMessageGetPayload<
    typeof COMMUNICATION_REACTION_MESSAGE_ACCESS_ARGS
  >;

export type CommunicationMessageReactionParticipantAccessRecord =
  Prisma.CommunicationConversationParticipantGetPayload<
    typeof COMMUNICATION_REACTION_PARTICIPANT_ACCESS_ARGS
  >;

export interface CommunicationMessageReactionListResult {
  messageId: string;
  items: CommunicationMessageReactionRecord[];
}

export interface CommunicationReactionAuditInput {
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
export class CommunicationReactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listCurrentSchoolMessageReactions(input: {
    messageId: string;
  }): Promise<CommunicationMessageReactionListResult> {
    const items =
      await this.scopedPrisma.communicationMessageReaction.findMany({
        where: { messageId: input.messageId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...COMMUNICATION_REACTION_ARGS,
      });

    return {
      messageId: input.messageId,
      items,
    };
  }

  findMessageForReactionOrAttachmentAccess(
    messageId: string,
  ): Promise<CommunicationMessageReactionAccessRecord | null> {
    return this.scopedPrisma.communicationMessage.findFirst({
      where: { id: messageId },
      ...COMMUNICATION_REACTION_MESSAGE_ACCESS_ARGS,
    });
  }

  findActiveParticipantForActor(input: {
    conversationId: string;
    actorId: string;
  }): Promise<CommunicationMessageReactionParticipantAccessRecord | null> {
    return this.scopedPrisma.communicationConversationParticipant.findFirst({
      where: {
        conversationId: input.conversationId,
        userId: input.actorId,
      },
      ...COMMUNICATION_REACTION_PARTICIPANT_ACCESS_ARGS,
    });
  }

  findCurrentSchoolReactionForActor(input: {
    messageId: string;
    actorId: string;
  }): Promise<CommunicationMessageReactionRecord | null> {
    return this.scopedPrisma.communicationMessageReaction.findFirst({
      where: {
        messageId: input.messageId,
        userId: input.actorId,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...COMMUNICATION_REACTION_ARGS,
    });
  }

  async upsertCurrentSchoolMessageReaction(input: {
    schoolId: string;
    conversationId: string;
    messageId: string;
    actorId: string;
    reactionKey: string;
    emoji?: string | null;
    buildAuditEntry: (
      reaction: CommunicationMessageReactionRecord,
      before: CommunicationMessageReactionRecord | null,
    ) => CommunicationReactionAuditInput;
  }): Promise<CommunicationMessageReactionRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const existing = await tx.communicationMessageReaction.findFirst({
        where: {
          messageId: input.messageId,
          userId: input.actorId,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...COMMUNICATION_REACTION_ARGS,
      });

      const reactionId = existing
        ? await this.updateReactionInTransaction(tx, existing.id, {
            reactionKey: input.reactionKey,
            emoji: input.emoji ?? null,
          })
        : await this.createReactionInTransaction(tx, {
            schoolId: input.schoolId,
            conversationId: input.conversationId,
            messageId: input.messageId,
            userId: input.actorId,
            reactionKey: input.reactionKey,
            emoji: input.emoji ?? null,
          });

      const reaction = await this.findReactionInTransaction(tx, reactionId);
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(reaction, existing),
      );

      return reaction;
    });
  }

  async deleteCurrentSchoolMessageReaction(input: {
    reactionId: string;
    buildAuditEntry: (
      reaction: CommunicationMessageReactionRecord,
    ) => CommunicationReactionAuditInput;
  }): Promise<{ ok: true }> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const reaction = await this.findReactionInTransaction(
        tx,
        input.reactionId,
      );

      await tx.communicationMessageReaction.deleteMany({
        where: { id: input.reactionId },
      });
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(reaction),
      );

      return { ok: true };
    });
  }

  private async createReactionInTransaction(
    tx: Prisma.TransactionClient,
    data: {
      schoolId: string;
      conversationId: string;
      messageId: string;
      userId: string;
      reactionKey: string;
      emoji: string | null;
    },
  ): Promise<string> {
    const created = await tx.communicationMessageReaction.create({
      data,
      select: { id: true },
    });

    return created.id;
  }

  private async updateReactionInTransaction(
    tx: Prisma.TransactionClient,
    reactionId: string,
    data: {
      reactionKey: string;
      emoji: string | null;
    },
  ): Promise<string> {
    await tx.communicationMessageReaction.updateMany({
      where: { id: reactionId },
      data,
    });

    return reactionId;
  }

  private async findReactionInTransaction(
    tx: Prisma.TransactionClient,
    reactionId: string,
  ): Promise<CommunicationMessageReactionRecord> {
    const reaction = await tx.communicationMessageReaction.findFirst({
      where: { id: reactionId },
      ...COMMUNICATION_REACTION_ARGS,
    });

    if (!reaction) {
      throw new Error('Communication reaction mutation result was not found');
    }

    return reaction;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: CommunicationReactionAuditInput,
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
