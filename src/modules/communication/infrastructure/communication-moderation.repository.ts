import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationMessageStatus,
  CommunicationModerationActionType,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const COMMUNICATION_MODERATION_MESSAGE_ARGS =
  Prisma.validator<Prisma.CommunicationMessageDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      senderUserId: true,
      kind: true,
      status: true,
      hiddenById: true,
      hiddenAt: true,
      hiddenReason: true,
      deletedById: true,
      deletedAt: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
      conversation: {
        select: {
          id: true,
          schoolId: true,
          status: true,
        },
      },
    },
  });

const COMMUNICATION_MODERATION_ACTION_ARGS =
  Prisma.validator<Prisma.CommunicationModerationActionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      messageId: true,
      targetUserId: true,
      actorUserId: true,
      actionType: true,
      reason: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export type CommunicationModerationMessageRecord =
  Prisma.CommunicationMessageGetPayload<
    typeof COMMUNICATION_MODERATION_MESSAGE_ARGS
  >;

export type CommunicationModerationActionRecord =
  Prisma.CommunicationModerationActionGetPayload<
    typeof COMMUNICATION_MODERATION_ACTION_ARGS
  >;

export interface CommunicationModerationActionListResult {
  messageId: string;
  items: CommunicationModerationActionRecord[];
}

export interface CommunicationModerationMutationResult {
  action: CommunicationModerationActionRecord;
  message: CommunicationModerationMessageRecord;
}

export interface CommunicationModerationAuditInput {
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

export interface CommunicationMessageModerationUpdate {
  status?: CommunicationMessageStatus;
  hiddenById?: string | null;
  hiddenAt?: Date | null;
  hiddenReason?: string | null;
  deletedById?: string | null;
  deletedAt?: Date | null;
}

@Injectable()
export class CommunicationModerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findMessageForModeration(
    messageId: string,
  ): Promise<CommunicationModerationMessageRecord | null> {
    return this.scopedPrisma.communicationMessage.findFirst({
      where: { id: messageId },
      ...COMMUNICATION_MODERATION_MESSAGE_ARGS,
    });
  }

  async listCurrentSchoolModerationActionsForMessage(input: {
    messageId: string;
  }): Promise<CommunicationModerationActionListResult> {
    const items =
      await this.scopedPrisma.communicationModerationAction.findMany({
        where: { messageId: input.messageId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...COMMUNICATION_MODERATION_ACTION_ARGS,
      });

    return {
      messageId: input.messageId,
      items,
    };
  }

  async createCurrentSchoolMessageModerationAction(input: {
    schoolId: string;
    conversationId: string;
    messageId: string;
    targetUserId?: string | null;
    actorUserId: string;
    actionType: CommunicationModerationActionType;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
    messageUpdate?: CommunicationMessageModerationUpdate;
    buildAuditEntry: (
      result: CommunicationModerationMutationResult,
    ) => CommunicationModerationAuditInput;
  }): Promise<CommunicationModerationMutationResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
      if (input.messageUpdate) {
        await tx.communicationMessage.updateMany({
          where: { id: input.messageId },
          data: input.messageUpdate,
        });
      }

      const created = await tx.communicationModerationAction.create({
        data: {
          schoolId: input.schoolId,
          conversationId: input.conversationId,
          messageId: input.messageId,
          targetUserId: input.targetUserId ?? null,
          actorUserId: input.actorUserId,
          actionType: input.actionType,
          reason: normalizeOptionalText(input.reason),
          metadata: toNullableJson(input.metadata),
        },
        select: { id: true },
      });

      const result = {
        action: await this.findActionInTransaction(tx, created.id),
        message: await this.findMessageInTransaction(tx, input.messageId),
      };
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(result),
      );

      return result;
    });
  }

  private async findActionInTransaction(
    tx: Prisma.TransactionClient,
    actionId: string,
  ): Promise<CommunicationModerationActionRecord> {
    const action = await tx.communicationModerationAction.findFirst({
      where: { id: actionId },
      ...COMMUNICATION_MODERATION_ACTION_ARGS,
    });

    if (!action) {
      throw new Error('Communication moderation action result was not found');
    }

    return action;
  }

  private async findMessageInTransaction(
    tx: Prisma.TransactionClient,
    messageId: string,
  ): Promise<CommunicationModerationMessageRecord> {
    const message = await tx.communicationMessage.findFirst({
      where: { id: messageId },
      ...COMMUNICATION_MODERATION_MESSAGE_ARGS,
    });

    if (!message) {
      throw new Error('Communication moderation message result was not found');
    }

    return message;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: CommunicationModerationAuditInput,
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
