import { Injectable } from '@nestjs/common';
import {
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantStatus,
  Prisma,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppContext } from '../../shared/parent-app.types';
import type {
  CommunicationAppContactListResult,
  CommunicationAppContactRecord,
  CommunicationAppContactRole,
} from '../../../communication/presenters/communication-app-contact.presenter';

const DEFAULT_CONVERSATION_LIMIT = 20;
const DEFAULT_CONTACT_LIMIT = 50;
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
  reads: {
    select: {
      userId: true,
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

export type ParentMessageConversationRecord =
  Prisma.CommunicationConversationGetPayload<{
    select: typeof CONVERSATION_SELECT;
  }>;

export type ParentMessageRecord = Prisma.CommunicationMessageGetPayload<{
  select: typeof MESSAGE_SELECT;
}>;

export interface ParentMessageConversationFilters {
  type?: CommunicationConversationType;
  status?: CommunicationConversationStatus;
  search?: string;
  limit?: number;
  page?: number;
}

export interface ParentMessageFilters {
  kind?: CommunicationMessageKind;
  before?: Date;
  after?: Date;
  limit?: number;
  page?: number;
}

export interface ParentMessageConversationListResult {
  items: ParentMessageConversationRecord[];
  total: number;
  page: number;
  limit: number;
  unreadCounts: Map<string, number>;
}

export interface ParentMessageListResult {
  conversationId: string;
  items: ParentMessageRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface ParentMessageUnreadSummary {
  unreadConversationsCount: number;
  unreadMessagesCount: number;
}

export interface ParentMessageContactFilters {
  q?: string;
  role?: CommunicationAppContactRole;
  limit?: number;
  page?: number;
}

@Injectable()
export class ParentMessagesReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listConversations(params: {
    parentUserId: string;
    filters?: ParentMessageConversationFilters;
  }): Promise<ParentMessageConversationListResult> {
    const limit = resolveLimit(
      params.filters?.limit,
      DEFAULT_CONVERSATION_LIMIT,
    );
    const page = resolvePage(params.filters?.page);
    const where = this.buildParentParticipantConversationWhere(params);

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
        parentUserId: params.parentUserId,
      }),
    };
  }

  findConversationForParent(params: {
    conversationId: string;
    parentUserId: string;
  }): Promise<ParentMessageConversationRecord | null> {
    return this.scopedPrisma.communicationConversation.findFirst({
      where: this.buildParentParticipantConversationWhere({
        parentUserId: params.parentUserId,
        conversationId: params.conversationId,
      }),
      select: CONVERSATION_SELECT,
    });
  }

  async listContactsForParent(params: {
    context: ParentAppContext;
    filters?: ParentMessageContactFilters;
  }): Promise<CommunicationAppContactListResult> {
    const limit = resolveLimit(params.filters?.limit, DEFAULT_CONTACT_LIMIT);
    const page = resolvePage(params.filters?.page);

    if (params.filters?.role && params.filters.role !== 'teacher') {
      return emptyContactResult({ page, limit });
    }

    const classroomIds = uniqueValues(
      params.context.children.map((child) => child.classroomId),
    );
    if (classroomIds.length === 0) {
      return emptyContactResult({ page, limit });
    }

    const contacts = await this.listTeacherContacts({
      actorUserId: params.context.parentUserId,
      classroomIds,
      q: params.filters?.q,
    });

    return paginateContacts(contacts, { page, limit });
  }

  async findContactForParent(params: {
    context: ParentAppContext;
    contactId: string;
  }): Promise<CommunicationAppContactRecord | null> {
    const parsed = parseContactId(params.contactId);
    if (!parsed || parsed.prefix !== 'teacher') return null;

    const classroomIds = uniqueValues(
      params.context.children.map((child) => child.classroomId),
    );
    if (classroomIds.length === 0) return null;

    const contacts = await this.listTeacherContacts({
      actorUserId: params.context.parentUserId,
      classroomIds,
      targetTeacherUserId: parsed.id,
    });

    return contacts[0] ?? null;
  }

  async listMessages(params: {
    conversationId: string;
    filters?: ParentMessageFilters;
  }): Promise<ParentMessageListResult> {
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

  async searchMessages(params: {
    conversationId: string;
    parentUserId: string;
    q: string;
    limit?: number;
    page?: number;
  }): Promise<ParentMessageListResult> {
    const limit = resolveLimit(params.limit, DEFAULT_MESSAGE_LIMIT);
    const page = resolvePage(params.page);
    const where = this.buildMessageSearchWhere(params);

    const [items, total] = await Promise.all([
      this.scopedPrisma.communicationMessage.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

  findMessageForParent(params: {
    conversationId: string;
    messageId: string;
  }): Promise<ParentMessageRecord | null> {
    return this.scopedPrisma.communicationMessage.findFirst({
      where: {
        id: params.messageId,
        conversationId: params.conversationId,
      },
      select: MESSAGE_SELECT,
    });
  }

  async getUnreadSummary(params: {
    parentUserId: string;
  }): Promise<ParentMessageUnreadSummary> {
    const rows = await this.scopedPrisma.communicationMessage.groupBy({
      by: ['conversationId'],
      where: {
        status: CommunicationMessageStatus.SENT,
        senderUserId: { not: params.parentUserId },
        reads: {
          none: {
            userId: params.parentUserId,
          },
        },
        conversation: {
          is: {
            deletedAt: null,
            participants: {
              some: {
                userId: params.parentUserId,
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

  countUnreadMessagesForConversation(params: {
    conversationId: string;
    parentUserId: string;
  }): Promise<number> {
    return this.scopedPrisma.communicationMessage.count({
      where: {
        conversationId: params.conversationId,
        status: CommunicationMessageStatus.SENT,
        senderUserId: { not: params.parentUserId },
        reads: {
          none: {
            userId: params.parentUserId,
          },
        },
      },
    });
  }

  private buildParentParticipantConversationWhere(params: {
    parentUserId: string;
    filters?: ParentMessageConversationFilters;
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
      deletedAt: null,
      participants: {
        some: {
          userId: params.parentUserId,
          status: { in: [...ACTIVE_PARTICIPANT_STATUSES] },
        },
      },
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildMessageWhere(params: {
    conversationId: string;
    filters?: ParentMessageFilters;
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

  private buildMessageSearchWhere(params: {
    conversationId: string;
    parentUserId: string;
    q: string;
  }): Prisma.CommunicationMessageWhereInput {
    return {
      conversationId: params.conversationId,
      status: CommunicationMessageStatus.SENT,
      kind: { not: CommunicationMessageKind.SYSTEM },
      hiddenAt: null,
      deletedAt: null,
      body: {
        contains: params.q,
        mode: Prisma.QueryMode.insensitive,
      },
      conversation: {
        is: {
          deletedAt: null,
          participants: {
            some: {
              userId: params.parentUserId,
              status: { in: [...ACTIVE_PARTICIPANT_STATUSES] },
            },
          },
        },
      },
    };
  }

  private async countUnreadMessagesByConversation(params: {
    conversationIds: string[];
    parentUserId: string;
  }): Promise<Map<string, number>> {
    if (params.conversationIds.length === 0) return new Map();

    const rows = await this.scopedPrisma.communicationMessage.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: params.conversationIds },
        status: CommunicationMessageStatus.SENT,
        senderUserId: { not: params.parentUserId },
        reads: {
          none: {
            userId: params.parentUserId,
          },
        },
      },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.conversationId, row._count._all]));
  }

  private async listTeacherContacts(params: {
    actorUserId: string;
    classroomIds: string[];
    q?: string;
    targetTeacherUserId?: string;
  }): Promise<CommunicationAppContactRecord[]> {
    const teacherUserWhere = userDisplayNameWhere(params.q);
    const rows = await this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: {
        classroomId: { in: params.classroomIds },
        teacherUserId: {
          not: params.actorUserId,
          ...(params.targetTeacherUserId
            ? { equals: params.targetTeacherUserId }
            : {}),
        },
        teacherUser: {
          is: {
            userType: UserType.TEACHER,
            status: UserStatus.ACTIVE,
            deletedAt: null,
            ...teacherUserWhere,
          },
        },
        subject: { is: { deletedAt: null } },
        classroom: { is: { deletedAt: null } },
        term: { is: { deletedAt: null } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        teacherUserId: true,
        subject: {
          select: {
            nameEn: true,
            nameAr: true,
          },
        },
        classroom: {
          select: {
            nameEn: true,
            nameAr: true,
          },
        },
        teacherUser: {
          select: MESSAGE_USER_SELECT,
        },
      },
    });

    const byUserId = new Map<
      string,
      {
        user: (typeof rows)[number]['teacherUser'];
        subjects: Set<string>;
        classrooms: Set<string>;
      }
    >();

    for (const row of rows) {
      const existing = byUserId.get(row.teacherUserId) ?? {
        user: row.teacherUser,
        subjects: new Set<string>(),
        classrooms: new Set<string>(),
      };
      const subjectName = preferredName(row.subject);
      const classroomName = preferredName(row.classroom);
      if (subjectName) existing.subjects.add(subjectName);
      if (classroomName) existing.classrooms.add(classroomName);
      byUserId.set(row.teacherUserId, existing);
    }

    const targetUserIds = [...byUserId.keys()];
    const conversationIds = await this.findDirectConversationIdsByTargetUserIds(
      {
        actorUserId: params.actorUserId,
        targetUserIds,
      },
    );

    return targetUserIds
      .flatMap<CommunicationAppContactRecord>((targetUserId) => {
        const item = byUserId.get(targetUserId);
        if (!item) return [];
        return [
          {
            contactId: `teacher:${targetUserId}`,
            targetUserId,
            displayName: fullName(item.user),
            role: 'teacher',
            avatarUrl: null,
            subtitle: buildTeacherSubtitle(item.subjects, item.classrooms),
            conversationId: conversationIds.get(targetUserId) ?? null,
            canMessage: true,
          },
        ];
      })
      .sort(sortContacts);
  }

  private async findDirectConversationIdsByTargetUserIds(params: {
    actorUserId: string;
    targetUserIds: string[];
  }): Promise<Map<string, string>> {
    if (params.targetUserIds.length === 0) return new Map();

    const rows = await this.scopedPrisma.communicationConversation.findMany({
      where: {
        type: CommunicationConversationType.DIRECT,
        deletedAt: null,
        participants: {
          some: {
            userId: params.actorUserId,
            status: { in: [...ACTIVE_PARTICIPANT_STATUSES] },
          },
        },
        AND: [
          {
            participants: {
              some: {
                userId: { in: params.targetUserIds },
                status: { in: [...ACTIVE_PARTICIPANT_STATUSES] },
              },
            },
          },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        participants: {
          where: {
            status: { in: [...ACTIVE_PARTICIPANT_STATUSES] },
            userId: { in: [params.actorUserId, ...params.targetUserIds] },
          },
          select: { userId: true },
        },
      },
    });

    const result = new Map<string, string>();
    const targetUserIdSet = new Set(params.targetUserIds);
    for (const row of rows) {
      const activeUserIds = new Set(
        row.participants.map((participant) => participant.userId),
      );
      if (!activeUserIds.has(params.actorUserId) || activeUserIds.size !== 2) {
        continue;
      }
      const targetUserId = [...activeUserIds].find(
        (userId) =>
          userId !== params.actorUserId && targetUserIdSet.has(userId),
      );
      if (targetUserId && !result.has(targetUserId)) {
        result.set(targetUserId, row.id);
      }
    }

    return result;
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

function emptyContactResult(params: {
  page: number;
  limit: number;
}): CommunicationAppContactListResult {
  return {
    items: [],
    total: 0,
    page: params.page,
    limit: params.limit,
  };
}

function paginateContacts(
  contacts: CommunicationAppContactRecord[],
  params: { page: number; limit: number },
): CommunicationAppContactListResult {
  const start = (params.page - 1) * params.limit;
  return {
    items: contacts.slice(start, start + params.limit),
    total: contacts.length,
    page: params.page,
    limit: params.limit,
  };
}

function parseContactId(
  contactId: string,
): { prefix: string; id: string } | null {
  const parts = contactId.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { prefix: parts[0], id: parts[1] };
}

function userDisplayNameWhere(q?: string): Prisma.UserWhereInput {
  const trimmed = q?.trim();
  if (!trimmed) return {};
  const filter = { contains: trimmed, mode: Prisma.QueryMode.insensitive };
  return {
    OR: [{ firstName: filter }, { lastName: filter }],
  };
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function preferredName(
  value: {
    nameEn?: string | null;
    nameAr?: string | null;
  } | null,
): string | null {
  return value?.nameEn ?? value?.nameAr ?? null;
}

function fullName(user: { firstName: string; lastName: string }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
}

function buildTeacherSubtitle(
  subjects: Set<string>,
  classrooms: Set<string>,
): string | null {
  const subject = [...subjects][0];
  const classroom = [...classrooms][0];
  if (subject && classroom) return `${subject} - ${classroom}`;
  return subject ?? classroom ?? 'Teacher';
}

function sortContacts(
  left: CommunicationAppContactRecord,
  right: CommunicationAppContactRecord,
): number {
  return (
    left.displayName.localeCompare(right.displayName) ||
    left.contactId.localeCompare(right.contactId)
  );
}
