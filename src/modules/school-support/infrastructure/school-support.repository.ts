import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import { platformBypassScope } from '../../../infrastructure/database/platform-bypass.helper';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PlatformSupportScope, SchoolSupportScope } from '../school-support-context';
import {
  SCHOOL_SUPPORT_MESSAGE_METADATA_VERSION,
  SCHOOL_SUPPORT_METADATA,
  SCHOOL_SUPPORT_SURFACE,
  SCHOOL_SUPPORT_TITLE,
} from '../domain/school-support.constants';
import {
  PlatformSupportConversationClosedException,
  PlatformSupportConversationInvalidStateException,
  SchoolSupportConversationClosedException,
} from '../domain/school-support.errors';

const SUPPORT_MESSAGE_SENDER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  userType: true,
} satisfies Prisma.UserSelect;

const SUPPORT_MESSAGE_ARGS =
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
      hiddenAt: true,
      deletedAt: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
      senderUser: {
        select: SUPPORT_MESSAGE_SENDER_SELECT,
      },
    },
  });

const SUPPORT_LAST_MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderUserId: true,
  kind: true,
  status: true,
  body: true,
  hiddenAt: true,
  deletedAt: true,
  sentAt: true,
  senderUser: {
    select: SUPPORT_MESSAGE_SENDER_SELECT,
  },
} satisfies Prisma.CommunicationMessageSelect;

const SUPPORT_CONVERSATION_ARGS =
  Prisma.validator<Prisma.CommunicationConversationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      type: true,
      status: true,
      titleEn: true,
      titleAr: true,
      createdById: true,
      closedById: true,
      closedAt: true,
      lastMessageAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      school: {
        select: {
          id: true,
          name: true,
          status: true,
          organizationId: true,
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      participants: {
        where: { status: CommunicationParticipantStatus.ACTIVE },
        select: {
          id: true,
          userId: true,
          role: true,
          status: true,
          lastReadMessageId: true,
          lastReadAt: true,
          user: {
            select: SUPPORT_MESSAGE_SENDER_SELECT,
          },
        },
      },
      messages: {
        where: {
          status: {
            in: [
              CommunicationMessageStatus.SENT,
              CommunicationMessageStatus.HIDDEN,
              CommunicationMessageStatus.DELETED,
            ],
          },
        },
        orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
        take: 1,
        select: SUPPORT_LAST_MESSAGE_SELECT,
      },
    },
  });

export type SupportConversationRecord = Prisma.CommunicationConversationGetPayload<
  typeof SUPPORT_CONVERSATION_ARGS
>;

export type SupportMessageRecord = Prisma.CommunicationMessageGetPayload<
  typeof SUPPORT_MESSAGE_ARGS
>;

export interface SupportUnreadState {
  count: number;
  lastReadAt: Date | null;
}

export interface SupportMessageListFilters {
  before?: Date;
  after?: Date;
  page: number;
  limit: number;
}

export interface SupportMessageListResult {
  conversation: SupportConversationRecord;
  items: SupportMessageRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface SupportReadResult {
  conversationId: string;
  readAt: Date;
  markedCount: number;
}

export interface PlatformSupportConversationFilters {
  schoolId?: string;
  organizationId?: string;
  status?: CommunicationConversationStatus;
  search?: string;
  hasUnread?: boolean;
  page: number;
  limit: number;
}

export interface PlatformSupportConversationListResult {
  items: Array<{
    conversation: SupportConversationRecord;
    unread: SupportUnreadState;
  }>;
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class SchoolSupportRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async getOrCreateSchoolConversation(
    scope: SchoolSupportScope,
  ): Promise<{
    conversation: SupportConversationRecord;
    unread: SupportUnreadState;
  }> {
    return this.scopedPrisma.$transaction((tx) =>
      this.getOrCreateSchoolConversationInTx(tx, scope),
    );
  }

  async listSchoolMessages(input: {
    scope: SchoolSupportScope;
    filters: SupportMessageListFilters;
  }): Promise<SupportMessageListResult> {
    const { conversation } = await this.getOrCreateSchoolConversation(
      input.scope,
    );
    const where = this.buildMessageWhere(conversation.id, input.filters);

    const [items, total] = await Promise.all([
      this.scopedPrisma.communicationMessage.findMany({
        where,
        orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
        take: input.filters.limit,
        skip: (input.filters.page - 1) * input.filters.limit,
        ...SUPPORT_MESSAGE_ARGS,
      }),
      this.scopedPrisma.communicationMessage.count({ where }),
    ]);

    return {
      conversation,
      items,
      total,
      page: input.filters.page,
      limit: input.filters.limit,
    };
  }

  async createSchoolMessage(input: {
    scope: SchoolSupportScope;
    body: string;
    clientMessageId?: string | null;
  }): Promise<SupportMessageRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const conversationState = await this.getOrCreateSchoolConversationInTx(
        tx,
        input.scope,
      );
      const conversation = conversationState.conversation;

      const result = await this.createSupportMessageInTx(tx, {
        schoolId: input.scope.schoolId,
        organizationId: input.scope.organizationId,
        conversationId: conversation.id,
        actorId: input.scope.actorId,
        userType: input.scope.userType,
        body: input.body,
        clientMessageId: input.clientMessageId,
        senderKind: 'school',
        auditModule: 'school_support',
        auditAction: 'school_support.message.create',
      });

      return result.message;
    });
  }

  async markSchoolConversationRead(input: {
    scope: SchoolSupportScope;
    readAt: Date;
  }): Promise<SupportReadResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const { conversation } = await this.getOrCreateSchoolConversationInTx(
        tx,
        input.scope,
      );

      return this.markConversationReadInTx(tx, {
        schoolId: input.scope.schoolId,
        conversationId: conversation.id,
        actorId: input.scope.actorId,
        readAt: input.readAt,
        participantRole: CommunicationParticipantRole.OWNER,
        actor: input.scope,
        auditAction: 'school_support.conversation.read',
      });
    });
  }

  async listPlatformConversations(input: {
    scope: PlatformSupportScope;
    filters: PlatformSupportConversationFilters;
  }): Promise<PlatformSupportConversationListResult> {
    return platformBypassScope(async () => {
      const where = this.buildPlatformConversationWhere(
        input.scope.actorId,
        input.filters,
      );
      const [conversations, total] = await Promise.all([
        this.prisma.communicationConversation.findMany({
          where,
          orderBy: [
            { lastMessageAt: 'desc' },
            { updatedAt: 'desc' },
            { id: 'asc' },
          ],
          take: input.filters.limit,
          skip: (input.filters.page - 1) * input.filters.limit,
          ...SUPPORT_CONVERSATION_ARGS,
        }),
        this.prisma.communicationConversation.count({ where }),
      ]);

      const unreadStates = await Promise.all(
        conversations.map((conversation) =>
          this.getUnreadState({
            conversationId: conversation.id,
            userId: input.scope.actorId,
          }),
        ),
      );

      return {
        items: conversations.map((conversation, index) => ({
          conversation,
          unread: unreadStates[index],
        })),
        total,
        page: input.filters.page,
        limit: input.filters.limit,
      };
    });
  }

  async getPlatformConversation(input: {
    scope: PlatformSupportScope;
    conversationId: string;
    ensureParticipant?: boolean;
  }): Promise<{
    conversation: SupportConversationRecord;
    unread: SupportUnreadState;
  } | null> {
    return platformBypassScope(() =>
      this.prisma.$transaction(async (tx) => {
        const conversation = await this.findSupportConversationByIdInTx(
          tx,
          input.conversationId,
        ).catch(() => null);
        if (!conversation) return null;

        if (input.ensureParticipant) {
          await this.ensureParticipantInTx(tx, {
            schoolId: conversation.schoolId,
            conversationId: conversation.id,
            userId: input.scope.actorId,
            role: CommunicationParticipantRole.ADMIN,
            actor: input.scope,
            organizationId: conversation.school.organizationId,
            auditAction: 'platform_support.participant.ensure',
          });
        }

        const refreshed = await this.findSupportConversationByIdInTx(
          tx,
          input.conversationId,
        );
        const unread = await this.getUnreadStateInTx(tx, {
          conversationId: refreshed.id,
          userId: input.scope.actorId,
        });

        return { conversation: refreshed, unread };
      }),
    );
  }

  async listPlatformMessages(input: {
    scope: PlatformSupportScope;
    conversationId: string;
    filters: SupportMessageListFilters;
  }): Promise<SupportMessageListResult | null> {
    return platformBypassScope(() =>
      this.prisma.$transaction(async (tx) => {
        const conversation = await this.findSupportConversationByIdInTx(
          tx,
          input.conversationId,
        ).catch(() => null);
        if (!conversation) return null;

        await this.ensureParticipantInTx(tx, {
          schoolId: conversation.schoolId,
          conversationId: conversation.id,
          userId: input.scope.actorId,
          role: CommunicationParticipantRole.ADMIN,
          actor: input.scope,
          organizationId: conversation.school.organizationId,
          auditAction: 'platform_support.participant.ensure',
        });

        const where = this.buildMessageWhere(conversation.id, input.filters);
        const [items, total] = await Promise.all([
          tx.communicationMessage.findMany({
            where,
            orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
            take: input.filters.limit,
            skip: (input.filters.page - 1) * input.filters.limit,
            ...SUPPORT_MESSAGE_ARGS,
          }),
          tx.communicationMessage.count({ where }),
        ]);

        return {
          conversation,
          items,
          total,
          page: input.filters.page,
          limit: input.filters.limit,
        };
      }),
    );
  }

  async createPlatformReply(input: {
    scope: PlatformSupportScope;
    conversationId: string;
    body: string;
    clientMessageId?: string | null;
  }): Promise<SupportMessageRecord | null> {
    return platformBypassScope(() =>
      this.prisma.$transaction(async (tx) => {
        const conversation = await this.findSupportConversationByIdInTx(
          tx,
          input.conversationId,
        ).catch(() => null);
        if (!conversation) return null;

        await this.ensureParticipantInTx(tx, {
          schoolId: conversation.schoolId,
          conversationId: conversation.id,
          userId: input.scope.actorId,
          role: CommunicationParticipantRole.ADMIN,
          actor: input.scope,
          organizationId: conversation.school.organizationId,
          auditAction: 'platform_support.participant.ensure',
        });

        const result = await this.createSupportMessageInTx(tx, {
          schoolId: conversation.schoolId,
          organizationId: conversation.school.organizationId,
          conversationId: conversation.id,
          actorId: input.scope.actorId,
          userType: input.scope.userType,
          body: input.body,
          clientMessageId: input.clientMessageId,
          senderKind: 'support',
          auditModule: 'platform_support',
          auditAction: 'platform_support.message.reply',
        });

        return result.message;
      }),
    );
  }

  async markPlatformConversationRead(input: {
    scope: PlatformSupportScope;
    conversationId: string;
    readAt: Date;
  }): Promise<SupportReadResult | null> {
    return platformBypassScope(() =>
      this.prisma.$transaction(async (tx) => {
        const conversation = await this.findSupportConversationByIdInTx(
          tx,
          input.conversationId,
        ).catch(() => null);
        if (!conversation) return null;

        await this.ensureParticipantInTx(tx, {
          schoolId: conversation.schoolId,
          conversationId: conversation.id,
          userId: input.scope.actorId,
          role: CommunicationParticipantRole.ADMIN,
          actor: input.scope,
          organizationId: conversation.school.organizationId,
          auditAction: 'platform_support.participant.ensure',
        });

        return this.markConversationReadInTx(tx, {
          schoolId: conversation.schoolId,
          conversationId: conversation.id,
          actorId: input.scope.actorId,
          readAt: input.readAt,
          participantRole: CommunicationParticipantRole.ADMIN,
          actor: input.scope,
          organizationId: conversation.school.organizationId,
          auditAction: 'platform_support.conversation.read',
        });
      }),
    );
  }

  async closePlatformConversation(input: {
    scope: PlatformSupportScope;
    conversationId: string;
    reason?: string | null;
  }): Promise<SupportConversationRecord | null> {
    return this.transitionPlatformConversation(input, {
      expectedStatus: CommunicationConversationStatus.ACTIVE,
      nextStatus: CommunicationConversationStatus.CLOSED,
      action: 'platform_support.conversation.close',
      reason: input.reason,
    });
  }

  async reopenPlatformConversation(input: {
    scope: PlatformSupportScope;
    conversationId: string;
    reason?: string | null;
  }): Promise<SupportConversationRecord | null> {
    return this.transitionPlatformConversation(input, {
      expectedStatus: CommunicationConversationStatus.CLOSED,
      nextStatus: CommunicationConversationStatus.ACTIVE,
      action: 'platform_support.conversation.reopen',
      reason: input.reason,
    });
  }

  async getUnreadState(input: {
    conversationId: string;
    userId: string;
  }): Promise<SupportUnreadState> {
    return platformBypassScope(() =>
      this.prisma.$transaction((tx) => this.getUnreadStateInTx(tx, input)),
    );
  }

  private async transitionPlatformConversation(
    input: {
      scope: PlatformSupportScope;
      conversationId: string;
      reason?: string | null;
    },
    transition: {
      expectedStatus: CommunicationConversationStatus;
      nextStatus: CommunicationConversationStatus;
      action: string;
      reason?: string | null;
    },
  ): Promise<SupportConversationRecord | null> {
    return platformBypassScope(() =>
      this.prisma.$transaction(async (tx) => {
        const conversation = await this.findSupportConversationByIdInTx(
          tx,
          input.conversationId,
        ).catch(() => null);
        if (!conversation) return null;

        await this.ensureParticipantInTx(tx, {
          schoolId: conversation.schoolId,
          conversationId: conversation.id,
          userId: input.scope.actorId,
          role: CommunicationParticipantRole.ADMIN,
          actor: input.scope,
          organizationId: conversation.school.organizationId,
          auditAction: 'platform_support.participant.ensure',
        });

        if (conversation.status !== transition.expectedStatus) {
          throw new PlatformSupportConversationInvalidStateException(
            `Support conversation must be ${transition.expectedStatus.toLowerCase()} for this action`,
          );
        }

        const now = new Date();
        await tx.communicationConversation.update({
          where: { id: conversation.id },
          data: {
            status: transition.nextStatus,
            ...(transition.nextStatus === CommunicationConversationStatus.CLOSED
              ? {
                  closedById: input.scope.actorId,
                  closedAt: now,
                }
              : {
                  closedById: null,
                  closedAt: null,
                }),
          },
        });

        const updated = await this.findSupportConversationByIdInTx(
          tx,
          conversation.id,
        );
        await this.createAuditLogInTx(tx, {
          actorId: input.scope.actorId,
          userType: input.scope.userType,
          organizationId: conversation.school.organizationId,
          schoolId: conversation.schoolId,
          module: 'platform_support',
          action: transition.action,
          resourceType: 'communication_conversation',
          resourceId: conversation.id,
          outcome: AuditOutcome.SUCCESS,
          before: {
            conversationId: conversation.id,
            status: conversation.status.toLowerCase(),
          },
          after: {
            conversationId: updated.id,
            status: updated.status.toLowerCase(),
            reason: transition.reason ?? null,
          },
        });

        return updated;
      }),
    );
  }

  private async createSupportMessageInTx(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      organizationId: string;
      conversationId: string;
      actorId: string;
      userType: UserType;
      body: string;
      clientMessageId?: string | null;
      senderKind: 'school' | 'support';
      auditModule: 'school_support' | 'platform_support';
      auditAction: string;
    },
  ): Promise<{ message: SupportMessageRecord; wasCreated: boolean }> {
    const conversation = await this.findSupportConversationByIdInTx(
      tx,
      input.conversationId,
    );

    if (conversation.status !== CommunicationConversationStatus.ACTIVE) {
      if (input.senderKind === 'support') {
        throw new PlatformSupportConversationClosedException();
      }
      throw new SchoolSupportConversationClosedException();
    }

    if (input.clientMessageId) {
      const existing = await tx.communicationMessage.findFirst({
        where: {
          conversationId: input.conversationId,
          senderUserId: input.actorId,
          clientMessageId: input.clientMessageId,
        },
        ...SUPPORT_MESSAGE_ARGS,
      });

      if (existing) {
        return { message: existing, wasCreated: false };
      }
    }

    const sentAt = new Date();
    const created = await tx.communicationMessage.create({
      data: {
        schoolId: input.schoolId,
        conversationId: input.conversationId,
        senderUserId: input.actorId,
        kind: CommunicationMessageKind.TEXT,
        status: CommunicationMessageStatus.SENT,
        body: input.body,
        clientMessageId: input.clientMessageId ?? null,
        sentAt,
        metadata: {
          supportMessage: true,
          surface: SCHOOL_SUPPORT_SURFACE,
          senderKind: input.senderKind,
          version: SCHOOL_SUPPORT_MESSAGE_METADATA_VERSION,
        } satisfies Prisma.InputJsonObject,
      },
      select: { id: true },
    });

    await tx.communicationConversation.updateMany({
      where: { id: input.conversationId },
      data: { lastMessageAt: sentAt },
    });

    const message = await tx.communicationMessage.findFirstOrThrow({
      where: { id: created.id },
      ...SUPPORT_MESSAGE_ARGS,
    });

    await this.createAuditLogInTx(tx, {
      actorId: input.actorId,
      userType: input.userType,
      organizationId: input.organizationId,
      schoolId: input.schoolId,
      module: input.auditModule,
      action: input.auditAction,
      resourceType: 'communication_message',
      resourceId: message.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        messageId: message.id,
        conversationId: message.conversationId,
        senderKind: input.senderKind,
        bodyLength: input.body.length,
        clientMessageId: input.clientMessageId ?? null,
      },
    });

    return { message, wasCreated: true };
  }

  private async markConversationReadInTx(
    tx: Prisma.TransactionClient,
    input: {
    schoolId: string;
    conversationId: string;
    actorId: string;
    readAt: Date;
    participantRole: CommunicationParticipantRole;
    actor: { actorId: string; userType: UserType };
    organizationId?: string;
    auditAction: string;
  }): Promise<SupportReadResult> {
    await this.ensureParticipantInTx(tx, {
      schoolId: input.schoolId,
      conversationId: input.conversationId,
      userId: input.actorId,
      role: input.participantRole,
      actor: input.actor,
      organizationId: input.organizationId,
      auditAction: input.auditAction.replace('.read', '.participant.ensure'),
    });

    const readableMessages = await tx.communicationMessage.findMany({
      where: {
        conversationId: input.conversationId,
        status: CommunicationMessageStatus.SENT,
        deletedAt: null,
        sentAt: { lte: input.readAt },
        OR: [{ senderUserId: null }, { senderUserId: { not: input.actorId } }],
      },
      orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    const latestMessage = await tx.communicationMessage.findFirst({
      where: {
        conversationId: input.conversationId,
        status: CommunicationMessageStatus.SENT,
        deletedAt: null,
        sentAt: { lte: input.readAt },
      },
      orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
      select: { id: true },
    });

    let markedCount = 0;
    if (readableMessages.length > 0) {
      const created = await tx.communicationMessageRead.createMany({
        data: readableMessages.map((message) => ({
          schoolId: input.schoolId,
          conversationId: input.conversationId,
          messageId: message.id,
          userId: input.actorId,
          readAt: input.readAt,
          metadata: {
            supportRead: true,
            surface: SCHOOL_SUPPORT_SURFACE,
            version: SCHOOL_SUPPORT_MESSAGE_METADATA_VERSION,
          } satisfies Prisma.InputJsonObject,
        })),
        skipDuplicates: true,
      });
      markedCount = created.count;
    }

    await tx.communicationConversationParticipant.updateMany({
      where: {
        conversationId: input.conversationId,
        userId: input.actorId,
      },
      data: {
        lastReadAt: input.readAt,
        lastReadMessageId: latestMessage?.id ?? null,
      },
    });

    await this.createAuditLogInTx(tx, {
      actorId: input.actor.actorId,
      userType: input.actor.userType,
      organizationId: input.organizationId ?? null,
      schoolId: input.schoolId,
      module: input.auditAction.startsWith('platform_support')
        ? 'platform_support'
        : 'school_support',
      action: input.auditAction,
      resourceType: 'communication_conversation',
      resourceId: input.conversationId,
      outcome: AuditOutcome.SUCCESS,
      after: {
        conversationId: input.conversationId,
        readAt: input.readAt.toISOString(),
        markedCount,
      },
    });

    return {
      conversationId: input.conversationId,
      readAt: input.readAt,
      markedCount,
    };
  }

  private async ensureParticipantInTx(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      conversationId: string;
      userId: string;
      role: CommunicationParticipantRole;
      actor: { actorId: string; userType: UserType };
      organizationId?: string;
      auditAction: string;
    },
  ): Promise<void> {
    const existing = await tx.communicationConversationParticipant.findFirst({
      where: {
        conversationId: input.conversationId,
        userId: input.userId,
      },
      select: { id: true, status: true, role: true },
    });

    if (existing) {
      if (
        existing.status !== CommunicationParticipantStatus.ACTIVE ||
        existing.role !== input.role
      ) {
        await tx.communicationConversationParticipant.updateMany({
          where: { id: existing.id },
          data: {
            status: CommunicationParticipantStatus.ACTIVE,
            role: input.role,
            leftAt: null,
            removedAt: null,
            removedById: null,
          },
        });
      }
      return;
    }

    const participant = await tx.communicationConversationParticipant.create({
      data: {
        schoolId: input.schoolId,
        conversationId: input.conversationId,
        userId: input.userId,
        role: input.role,
        status: CommunicationParticipantStatus.ACTIVE,
        metadata: {
          supportParticipant: true,
          surface: SCHOOL_SUPPORT_SURFACE,
          version: SCHOOL_SUPPORT_MESSAGE_METADATA_VERSION,
        } satisfies Prisma.InputJsonObject,
      },
      select: { id: true },
    });

    await this.createAuditLogInTx(tx, {
      actorId: input.actor.actorId,
      userType: input.actor.userType,
      organizationId: input.organizationId ?? null,
      schoolId: input.schoolId,
      module: input.auditAction.startsWith('platform_support')
        ? 'platform_support'
        : 'school_support',
      action: input.auditAction,
      resourceType: 'communication_conversation_participant',
      resourceId: participant.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        conversationId: input.conversationId,
        userId: input.userId,
        role: input.role.toLowerCase(),
        supportParticipant: true,
      },
    });
  }

  private async findSupportConversationIdForSchoolInTx(
    tx: Prisma.TransactionClient,
    schoolId: string,
  ): Promise<string | null> {
    const conversation = await tx.communicationConversation.findFirst({
      where: {
        schoolId,
        ...this.supportConversationWhere(),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    return conversation?.id ?? null;
  }

  private async getOrCreateSchoolConversationInTx(
    tx: Prisma.TransactionClient,
    scope: SchoolSupportScope,
  ): Promise<{
    conversation: SupportConversationRecord;
    unread: SupportUnreadState;
  }> {
    let conversationId = await this.findSupportConversationIdForSchoolInTx(
      tx,
      scope.schoolId,
    );

    if (!conversationId) {
      const created = await tx.communicationConversation.create({
        data: {
          schoolId: scope.schoolId,
          type: CommunicationConversationType.SUPPORT,
          status: CommunicationConversationStatus.ACTIVE,
          titleEn: SCHOOL_SUPPORT_TITLE,
          titleAr: SCHOOL_SUPPORT_TITLE,
          createdById: scope.actorId,
          metadata: SCHOOL_SUPPORT_METADATA satisfies Prisma.InputJsonObject,
        },
        select: { id: true },
      });
      conversationId = created.id;

      await this.createAuditLogInTx(tx, {
        actorId: scope.actorId,
        userType: scope.userType,
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        module: 'school_support',
        action: 'school_support.conversation.create',
        resourceType: 'communication_conversation',
        resourceId: conversationId,
        outcome: AuditOutcome.SUCCESS,
        after: {
          conversationId,
          type: 'support',
          status: 'active',
          supportConversation: true,
        },
      });
    }

    await this.ensureParticipantInTx(tx, {
      schoolId: scope.schoolId,
      conversationId,
      userId: scope.actorId,
      role: CommunicationParticipantRole.OWNER,
      actor: scope,
      auditAction: 'school_support.participant.ensure',
    });

    const conversation = await this.findSupportConversationByIdInTx(
      tx,
      conversationId,
    );
    const unread = await this.getUnreadStateInTx(tx, {
      conversationId,
      userId: scope.actorId,
    });

    return { conversation, unread };
  }

  private async findSupportConversationByIdInTx(
    tx: Prisma.TransactionClient,
    conversationId: string,
  ): Promise<SupportConversationRecord> {
    const conversation = await tx.communicationConversation.findFirst({
      where: {
        id: conversationId,
        ...this.supportConversationWhere(),
      },
      ...SUPPORT_CONVERSATION_ARGS,
    });

    if (!conversation) {
      throw new Error('Support conversation mutation result was not found');
    }

    return conversation;
  }

  private async getUnreadStateInTx(
    tx: Prisma.TransactionClient,
    input: {
      conversationId: string;
      userId: string;
    },
  ): Promise<SupportUnreadState> {
    const [count, participant] = await Promise.all([
      tx.communicationMessage.count({
        where: {
          conversationId: input.conversationId,
          status: CommunicationMessageStatus.SENT,
          deletedAt: null,
          OR: [
            { senderUserId: null },
            { senderUserId: { not: input.userId } },
          ],
          reads: {
            none: { userId: input.userId },
          },
        },
      }),
      tx.communicationConversationParticipant.findFirst({
        where: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
        select: { lastReadAt: true },
      }),
    ]);

    return {
      count,
      lastReadAt: participant?.lastReadAt ?? null,
    };
  }

  private buildMessageWhere(
    conversationId: string,
    filters: SupportMessageListFilters,
  ): Prisma.CommunicationMessageWhereInput {
    return {
      conversationId,
      status: {
        in: [
          CommunicationMessageStatus.SENT,
          CommunicationMessageStatus.HIDDEN,
          CommunicationMessageStatus.DELETED,
        ],
      },
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

  private buildPlatformConversationWhere(
    actorId: string,
    filters: PlatformSupportConversationFilters,
  ): Prisma.CommunicationConversationWhereInput {
    const search = filters.search?.trim();

    return {
      ...this.supportConversationWhere(),
      ...(filters.schoolId ? { schoolId: filters.schoolId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.organizationId
        ? { school: { organizationId: filters.organizationId } }
        : {}),
      ...(filters.hasUnread !== undefined
        ? {
            messages: filters.hasUnread
              ? {
                  some: {
                    status: CommunicationMessageStatus.SENT,
                    deletedAt: null,
                    OR: [
                      { senderUserId: null },
                      { senderUserId: { not: actorId } },
                    ],
                    reads: { none: { userId: actorId } },
                  },
                }
              : {
                  none: {
                    status: CommunicationMessageStatus.SENT,
                    deletedAt: null,
                    OR: [
                      { senderUserId: null },
                      { senderUserId: { not: actorId } },
                    ],
                    reads: { none: { userId: actorId } },
                  },
                },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { school: { name: { contains: search, mode: 'insensitive' } } },
              {
                school: {
                  organization: {
                    name: { contains: search, mode: 'insensitive' },
                  },
                },
              },
              {
                messages: {
                  some: {
                    status: CommunicationMessageStatus.SENT,
                    body: { contains: search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private supportConversationWhere(): Prisma.CommunicationConversationWhereInput {
    return {
      type: CommunicationConversationType.SUPPORT,
      deletedAt: null,
      metadata: {
        path: ['supportConversation'],
        equals: true,
      },
    };
  }

  private createAuditLogInTx(
    tx: Prisma.TransactionClient,
    entry: {
      actorId?: string | null;
      userType?: UserType | null;
      organizationId?: string | null;
      schoolId?: string | null;
      module: string;
      action: string;
      resourceType: string;
      resourceId?: string | null;
      outcome: AuditOutcome;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    },
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
        before: entry.before
          ? (entry.before as Prisma.InputJsonObject)
          : undefined,
        after: entry.after ? (entry.after as Prisma.InputJsonObject) : undefined,
      },
    });
  }
}
