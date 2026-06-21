import { Injectable } from '@nestjs/common';
import {
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { TeacherAppContext } from '../../shared/teacher-app-context';
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

export interface TeacherMessageContactFilters {
  q?: string;
  role?: CommunicationAppContactRole;
  limit?: number;
  page?: number;
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
    const limit = resolveLimit(
      params.filters?.limit,
      DEFAULT_CONVERSATION_LIMIT,
    );
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

  async listContactsForTeacher(params: {
    context: TeacherAppContext;
    classroomIds: string[];
    filters?: TeacherMessageContactFilters;
  }): Promise<CommunicationAppContactListResult> {
    const limit = resolveLimit(params.filters?.limit, DEFAULT_CONTACT_LIMIT);
    const page = resolvePage(params.filters?.page);
    const classroomIds = uniqueValues(params.classroomIds);

    if (classroomIds.length === 0) {
      return emptyContactResult({ page, limit });
    }
    if (
      params.filters?.role &&
      !['student', 'parent'].includes(params.filters.role)
    ) {
      return emptyContactResult({ page, limit });
    }

    const [studentContacts, guardianContacts] = await Promise.all([
      params.filters?.role === 'parent'
        ? Promise.resolve([])
        : this.listStudentContacts({
            actorUserId: params.context.teacherUserId,
            classroomIds,
            q: params.filters?.q,
          }),
      params.filters?.role === 'student'
        ? Promise.resolve([])
        : this.listGuardianContacts({
            actorUserId: params.context.teacherUserId,
            classroomIds,
            q: params.filters?.q,
          }),
    ]);

    return paginateContacts(
      [...studentContacts, ...guardianContacts].sort(sortContacts),
      { page, limit },
    );
  }

  async findContactForTeacher(params: {
    context: TeacherAppContext;
    classroomIds: string[];
    contactId: string;
  }): Promise<CommunicationAppContactRecord | null> {
    const parsed = parseContactId(params.contactId);
    if (!parsed) return null;

    const classroomIds = uniqueValues(params.classroomIds);
    if (classroomIds.length === 0) return null;

    if (parsed.prefix === 'student') {
      const contacts = await this.listStudentContacts({
        actorUserId: params.context.teacherUserId,
        classroomIds,
        targetStudentId: parsed.id,
      });
      return contacts[0] ?? null;
    }

    if (parsed.prefix === 'guardian') {
      const contacts = await this.listGuardianContacts({
        actorUserId: params.context.teacherUserId,
        classroomIds,
        targetGuardianId: parsed.id,
      });
      return contacts[0] ?? null;
    }

    return null;
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

    return new Map(rows.map((row) => [row.conversationId, row._count._all]));
  }

  private async listStudentContacts(params: {
    actorUserId: string;
    classroomIds: string[];
    q?: string;
    targetStudentId?: string;
  }): Promise<CommunicationAppContactRecord[]> {
    const studentUserWhere = userDisplayNameWhere(params.q);
    const rows = await this.scopedPrisma.enrollment.findMany({
      where: {
        classroomId: { in: params.classroomIds },
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: {
          is: {
            ...(params.targetStudentId ? { id: params.targetStudentId } : {}),
            status: StudentStatus.ACTIVE,
            deletedAt: null,
            userId: { not: null },
            user: {
              is: {
                userType: UserType.STUDENT,
                status: UserStatus.ACTIVE,
                deletedAt: null,
                ...studentUserWhere,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userId: true,
            user: {
              select: MESSAGE_USER_SELECT,
            },
          },
        },
        classroom: {
          select: {
            nameEn: true,
            nameAr: true,
          },
        },
      },
    });

    const byStudentId = new Map<
      string,
      {
        student: (typeof rows)[number]['student'];
        classrooms: Set<string>;
      }
    >();

    for (const row of rows) {
      if (!row.student.userId || row.student.userId === params.actorUserId) {
        continue;
      }
      const existing = byStudentId.get(row.student.id) ?? {
        student: row.student,
        classrooms: new Set<string>(),
      };
      const classroomName = preferredName(row.classroom);
      if (classroomName) existing.classrooms.add(classroomName);
      byStudentId.set(row.student.id, existing);
    }

    const targetUserIds = [...byStudentId.values()]
      .map((item) => item.student.userId)
      .filter((userId): userId is string => !!userId);
    const conversationIds = await this.findDirectConversationIdsByTargetUserIds(
      {
        actorUserId: params.actorUserId,
        targetUserIds,
      },
    );

    return [...byStudentId.entries()].flatMap<CommunicationAppContactRecord>(
      ([studentId, item]) => {
        if (!item.student.userId) return [];
        return [
          {
            contactId: `student:${studentId}`,
            targetUserId: item.student.userId,
            displayName: item.student.user
              ? fullName(item.student.user)
              : fullName(item.student),
            role: 'student',
            avatarUrl: null,
            subtitle: buildStudentSubtitle(item.classrooms),
            conversationId: conversationIds.get(item.student.userId) ?? null,
            canMessage: true,
          },
        ];
      },
    );
  }

  private async listGuardianContacts(params: {
    actorUserId: string;
    classroomIds: string[];
    q?: string;
    targetGuardianId?: string;
  }): Promise<CommunicationAppContactRecord[]> {
    const guardianUserWhere = userDisplayNameWhere(params.q);
    const rows = await this.scopedPrisma.studentGuardian.findMany({
      where: {
        ...(params.targetGuardianId
          ? { guardianId: params.targetGuardianId }
          : {}),
        student: {
          is: {
            status: StudentStatus.ACTIVE,
            deletedAt: null,
            enrollments: {
              some: {
                classroomId: { in: params.classroomIds },
                status: StudentEnrollmentStatus.ACTIVE,
                deletedAt: null,
              },
            },
          },
        },
        guardian: {
          is: {
            deletedAt: null,
            userId: { not: null },
            user: {
              is: {
                userType: UserType.PARENT,
                status: UserStatus.ACTIVE,
                deletedAt: null,
                ...guardianUserWhere,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        guardian: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            relation: true,
            userId: true,
            user: {
              select: MESSAGE_USER_SELECT,
            },
          },
        },
        student: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const byGuardianId = new Map<
      string,
      {
        guardian: (typeof rows)[number]['guardian'];
        studentNames: Set<string>;
      }
    >();

    for (const row of rows) {
      if (!row.guardian.userId || row.guardian.userId === params.actorUserId) {
        continue;
      }
      const existing = byGuardianId.get(row.guardian.id) ?? {
        guardian: row.guardian,
        studentNames: new Set<string>(),
      };
      existing.studentNames.add(fullName(row.student));
      byGuardianId.set(row.guardian.id, existing);
    }

    const targetUserIds = [...byGuardianId.values()]
      .map((item) => item.guardian.userId)
      .filter((userId): userId is string => !!userId);
    const conversationIds = await this.findDirectConversationIdsByTargetUserIds(
      {
        actorUserId: params.actorUserId,
        targetUserIds,
      },
    );

    return [...byGuardianId.entries()].flatMap<CommunicationAppContactRecord>(
      ([guardianId, item]) => {
        if (!item.guardian.userId) return [];
        return [
          {
            contactId: `guardian:${guardianId}`,
            targetUserId: item.guardian.userId,
            displayName: item.guardian.user
              ? fullName(item.guardian.user)
              : fullName(item.guardian),
            role: 'parent',
            avatarUrl: null,
            subtitle: buildGuardianSubtitle(
              item.guardian.relation,
              item.studentNames,
            ),
            conversationId: conversationIds.get(item.guardian.userId) ?? null,
            canMessage: true,
          },
        ];
      },
    );
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

function fullName(value: { firstName: string; lastName: string }): string {
  return [value.firstName, value.lastName].filter(Boolean).join(' ').trim();
}

function buildStudentSubtitle(classrooms: Set<string>): string | null {
  const classroom = [...classrooms][0];
  return classroom ? `Student - ${classroom}` : 'Student';
}

function buildGuardianSubtitle(
  relation: string | null,
  studentNames: Set<string>,
): string | null {
  const studentName = [...studentNames][0];
  if (relation && studentName) return `${relation} of ${studentName}`;
  if (studentName) return `Guardian of ${studentName}`;
  return relation ?? 'Parent/Guardian';
}

function sortContacts(
  left: CommunicationAppContactRecord,
  right: CommunicationAppContactRecord,
): number {
  return (
    left.displayName.localeCompare(right.displayName) ||
    left.role.localeCompare(right.role) ||
    left.contactId.localeCompare(right.contactId)
  );
}
