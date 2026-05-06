import { Injectable } from '@nestjs/common';
import {
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const DEFAULT_CONVERSATION_LIMIT = 20;
const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_LIMIT = 100;

const ACTIVE_PARTICIPANT_STATUSES = [
  CommunicationParticipantStatus.ACTIVE,
  CommunicationParticipantStatus.MUTED,
] as const;

const SAFE_MESSAGE_FILE_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  visibility: true,
  createdAt: true,
} satisfies Prisma.FileSelect;

const MESSAGE_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  userType: true,
  status: true,
} satisfies Prisma.UserSelect;

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderUserId: true,
  kind: true,
  status: true,
  body: true,
  replyToMessageId: true,
  editedAt: true,
  hiddenAt: true,
  deletedAt: true,
  sentAt: true,
  createdAt: true,
  updatedAt: true,
  senderUser: {
    select: MESSAGE_USER_SELECT,
  },
  reactions: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      reactionKey: true,
      emoji: true,
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
        select: SAFE_MESSAGE_FILE_SELECT,
      },
    },
  },
  _count: {
    select: {
      reads: true,
    },
  },
} satisfies Prisma.CommunicationMessageSelect;

const PARTICIPANT_SELECT = {
  id: true,
  conversationId: true,
  userId: true,
  role: true,
  status: true,
  lastReadMessageId: true,
  lastReadAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: MESSAGE_USER_SELECT,
  },
} satisfies Prisma.CommunicationConversationParticipantSelect;

const CONVERSATION_SELECT = {
  id: true,
  type: true,
  status: true,
  titleEn: true,
  titleAr: true,
  descriptionEn: true,
  descriptionAr: true,
  lastMessageAt: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  participants: {
    where: { status: { in: [...ACTIVE_PARTICIPANT_STATUSES] } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: PARTICIPANT_SELECT,
  },
  messages: {
    orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
    take: 1,
    select: MESSAGE_SELECT,
  },
} satisfies Prisma.CommunicationConversationSelect;

export type TeacherMessageConversationRecord =
  Prisma.CommunicationConversationGetPayload<{
    select: typeof CONVERSATION_SELECT;
  }>;

export type TeacherMessageRecord = Prisma.CommunicationMessageGetPayload<{
  select: typeof MESSAGE_SELECT;
}>;

export interface TeacherMessageConversationFilters {
  type?: CommunicationConversationType;
  status?: CommunicationConversationStatus;
  search?: string;
  limit?: number;
  page?: number;
}

export interface TeacherMessageFilters {
  kind?: CommunicationMessageKind;
  before?: Date;
  after?: Date;
  limit?: number;
  page?: number;
}

export interface TeacherMessageConversationListResult {
  items: TeacherMessageConversationRecord[];
  total: number;
  page: number;
  limit: number;
  unreadCounts: Map<string, number>;
}

export interface TeacherMessageListResult {
  conversationId: string;
  items: TeacherMessageRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface TeacherMessageUnreadSummary {
  unreadConversationsCount: number;
  unreadMessagesCount: number;
}

@Injectable()
export class TeacherMessagesReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listConversations(params: {
    teacherUserId: string;
    filters?: TeacherMessageConversationFilters;
  }): Promise<TeacherMessageConversationListResult> {
    const limit = resolveLimit(params.filters?.limit, DEFAULT_CONVERSATION_LIMIT);
    const page = resolvePage(params.filters?.page);
    const where = this.buildTeacherParticipantConversationWhere(params);

    const [items, total] = await Promise.all([
      this.scopedPrisma.communicationConversation.findMany({
        where,
        orderBy: [
          { lastMessageAt: 'desc' },
          { updatedAt: 'desc' },
          { id: 'asc' },
        ],
        take: limit,
        skip: (page - 1) * limit,
        select: CONVERSATION_SELECT,
      }),
      this.scopedPrisma.communicationConversation.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      unreadCounts: await this.countUnreadMessagesByConversation({
        conversationIds: items.map((conversation) => conversation.id),
        teacherUserId: params.teacherUserId,
      }),
    };
  }

  async findConversationForTeacher(params: {
    conversationId: string;
    teacherUserId: string;
  }): Promise<TeacherMessageConversationRecord | null> {
    return this.scopedPrisma.communicationConversation.findFirst({
      where: this.buildTeacherParticipantConversationWhere({
        teacherUserId: params.teacherUserId,
        filters: undefined,
        conversationId: params.conversationId,
      }),
      select: CONVERSATION_SELECT,
    });
  }

  async listMessages(params: {
    conversationId: string;
    filters?: TeacherMessageFilters;
  }): Promise<TeacherMessageListResult> {
    const limit = resolveLimit(params.filters?.limit, DEFAULT_MESSAGE_LIMIT);
    const page = resolvePage(params.filters?.page);
    const where = this.buildMessageWhere(params);

    const [items, total] = await Promise.all([
      this.scopedPrisma.communicationMessage.findMany({
        where,
        orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        select: MESSAGE_SELECT,
      }),
      this.scopedPrisma.communicationMessage.count({ where }),
    ]);

    return {
      conversationId: params.conversationId,
      items,
      total,
      page,
      limit,
    };
  }

  findMessageForTeacher(params: {
    conversationId: string;
    messageId: string;
  }): Promise<TeacherMessageRecord | null> {
    return this.scopedPrisma.communicationMessage.findFirst({
      where: {
        id: params.messageId,
        conversationId: params.conversationId,
      },
      select: MESSAGE_SELECT,
    });
  }

  async getUnreadSummary(params: {
    teacherUserId: string;
  }): Promise<TeacherMessageUnreadSummary> {
    const rows = await this.scopedPrisma.communicationMessage.groupBy({
      by: ['conversationId'],
      where: {
        status: CommunicationMessageStatus.SENT,
        senderUserId: { not: params.teacherUserId },
        reads: {
          none: {
            userId: params.teacherUserId,
          },
        },
        conversation: {
          is: {
            deletedAt: null,
            participants: {
              some: {
                userId: params.teacherUserId,
                status: { in: [...ACTIVE_PARTICIPANT_STATUSES] },
              },
            },
          },
        },
      },
      _count: { _all: true },
    });

    return {
      unreadConversationsCount: rows.length,
      unreadMessagesCount: rows.reduce(
        (total, row) => total + row._count._all,
        0,
      ),
    };
  }

  private buildTeacherParticipantConversationWhere(params: {
    teacherUserId: string;
    filters?: TeacherMessageConversationFilters;
    conversationId?: string;
  }): Prisma.CommunicationConversationWhereInput {
    const search = params.filters?.search?.trim();
    const stringFilter = search
      ? { contains: search, mode: Prisma.QueryMode.insensitive }
      : null;

    const and: Prisma.CommunicationConversationWhereInput[] = [
      stringFilter
        ? {
            OR: [
              { titleEn: stringFilter },
              { titleAr: stringFilter },
              { descriptionEn: stringFilter },
              { descriptionAr: stringFilter },
              {
                participants: {
                  some: {
                    user: {
                      OR: [
                        { firstName: stringFilter },
                        { lastName: stringFilter },
                        { email: stringFilter },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {},
    ].filter((condition) => Object.keys(condition).length > 0);

    return {
      ...(params.conversationId ? { id: params.conversationId } : {}),
      ...(params.filters?.type ? { type: params.filters.type } : {}),
      ...(params.filters?.status ? { status: params.filters.status } : {}),
      participants: {
        some: {
          userId: params.teacherUserId,
          status: { in: [...ACTIVE_PARTICIPANT_STATUSES] },
        },
      },
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildMessageWhere(params: {
    conversationId: string;
    filters?: TeacherMessageFilters;
  }): Prisma.CommunicationMessageWhereInput {
    return {
      conversationId: params.conversationId,
      ...(params.filters?.kind ? { kind: params.filters.kind } : {}),
      ...(params.filters?.before || params.filters?.after
        ? {
            sentAt: {
              ...(params.filters.before ? { lt: params.filters.before } : {}),
              ...(params.filters.after ? { gt: params.filters.after } : {}),
            },
          }
        : {}),
    };
  }

  private async countUnreadMessagesByConversation(params: {
    conversationIds: string[];
    teacherUserId: string;
  }): Promise<Map<string, number>> {
    if (params.conversationIds.length === 0) return new Map();

    const rows = await this.scopedPrisma.communicationMessage.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: params.conversationIds },
        status: CommunicationMessageStatus.SENT,
        senderUserId: { not: params.teacherUserId },
        reads: {
          none: {
            userId: params.teacherUserId,
          },
        },
      },
      _count: { _all: true },
    });

    return new Map(
      rows.map((row) => [row.conversationId, row._count._all]),
    );
  }
}

function resolveLimit(limit: number | undefined, fallback: number): number {
  if (!limit || Number.isNaN(limit)) return fallback;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
