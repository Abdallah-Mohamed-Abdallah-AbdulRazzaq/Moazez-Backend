import { Injectable } from '@nestjs/common';
import {
  CommunicationAnnouncementStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { TeacherAppContext } from '../../shared/teacher-app-context';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import {
  parseTeacherAnnouncementMetadata,
  TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE,
  type TeacherAnnouncementAudience,
} from '../domain/teacher-announcement-app-domain';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const TEACHER_ANNOUNCEMENT_SELECT = {
  id: true,
  title: true,
  body: true,
  status: true,
  priority: true,
  publishedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  metadata: true,
  _count: {
    select: {
      attachments: true,
      reads: true,
    },
  },
} satisfies Prisma.CommunicationAnnouncementSelect;

export type TeacherAnnouncementRecord =
  Prisma.CommunicationAnnouncementGetPayload<{
    select: typeof TEACHER_ANNOUNCEMENT_SELECT;
  }>;

export interface TeacherAnnouncementListFilters {
  status?: string;
  search?: string;
  limit?: number;
  page?: number;
}

export interface TeacherAnnouncementListResult {
  items: TeacherAnnouncementRecord[];
  total: number;
  limit: number;
  page: number;
}

export interface TeacherAnnouncementAudienceRow {
  audienceType: 'custom';
  guardianId?: string;
  userId?: string;
}

@Injectable()
export class TeacherAnnouncementsReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listTeacherAnnouncements(params: {
    context: TeacherAppContext;
    allocations: TeacherAppAllocationRecord[];
    filters?: TeacherAnnouncementListFilters;
  }): Promise<TeacherAnnouncementListResult> {
    const limit = resolveLimit(params.filters?.limit);
    const page = resolvePage(params.filters?.page);
    const rows = await this.scopedPrisma.communicationAnnouncement.findMany({
      where: buildTeacherAnnouncementWhere(params.context, params.filters),
      orderBy: [
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
      select: TEACHER_ANNOUNCEMENT_SELECT,
    });
    const items = rows.filter((row) =>
      isAnnouncementTargetOwnedByTeacher(row, params.allocations),
    );

    return {
      items: items.slice((page - 1) * limit, page * limit),
      total: items.length,
      limit,
      page,
    };
  }

  async findTeacherAnnouncement(params: {
    context: TeacherAppContext;
    allocations: TeacherAppAllocationRecord[];
    announcementId: string;
  }): Promise<TeacherAnnouncementRecord | null> {
    const announcement =
      await this.scopedPrisma.communicationAnnouncement.findFirst({
        where: {
          id: params.announcementId,
          ...buildTeacherAnnouncementWhere(params.context),
        },
        select: TEACHER_ANNOUNCEMENT_SELECT,
      });

    if (!announcement) return null;
    return isAnnouncementTargetOwnedByTeacher(announcement, params.allocations)
      ? announcement
      : null;
  }

  async resolveAudienceRowsForClassroom(params: {
    classroomId: string;
    audience: TeacherAnnouncementAudience;
  }): Promise<TeacherAnnouncementAudienceRow[]> {
    const enrollments = await this.scopedPrisma.enrollment.findMany({
      where: {
        classroomId: params.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: {
          is: {
            status: StudentStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        student: {
          select: {
            id: true,
            userId: true,
            user: {
              select: {
                id: true,
                userType: true,
                status: true,
                deletedAt: true,
              },
            },
            guardians: {
              select: {
                guardian: {
                  select: {
                    id: true,
                    userId: true,
                    deletedAt: true,
                    user: {
                      select: {
                        id: true,
                        userType: true,
                        status: true,
                        deletedAt: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const rows: TeacherAnnouncementAudienceRow[] = [];
    const seen = new Set<string>();
    const includeStudents =
      params.audience === 'students' ||
      params.audience === 'students_and_parents';
    const includeParents =
      params.audience === 'parents' ||
      params.audience === 'students_and_parents';

    for (const enrollment of enrollments) {
      const student = enrollment.student;

      if (
        includeStudents &&
        student.userId &&
        isActiveUserOfType(student.user, UserType.STUDENT)
      ) {
        addAudienceRow(rows, seen, {
          audienceType: 'custom',
          userId: student.userId,
        });
      }

      if (!includeParents) continue;
      for (const guardianLink of student.guardians) {
        const guardian = guardianLink.guardian;
        if (
          guardian.userId &&
          guardian.deletedAt === null &&
          isActiveUserOfType(guardian.user, UserType.PARENT)
        ) {
          addAudienceRow(rows, seen, {
            audienceType: 'custom',
            guardianId: guardian.id,
          });
        }
      }
    }

    if (rows.length === 0) {
      throw new ValidationDomainException(
        'Teacher announcement audience has no active recipients',
        {
          classroomId: params.classroomId,
          audience: params.audience,
        },
      );
    }

    return rows;
  }
}

function buildTeacherAnnouncementWhere(
  context: TeacherAppContext,
  filters?: TeacherAnnouncementListFilters,
): Prisma.CommunicationAnnouncementWhereInput {
  return {
    createdById: context.teacherUserId,
    ...(filters?.status
      ? { status: mapStatusFilter(filters.status) }
      : {}),
    ...(filters?.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { body: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {}),
    metadata: {
      path: ['teacherApp', 'source'],
      equals: TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE,
    },
  };
}

function isAnnouncementTargetOwnedByTeacher(
  announcement: TeacherAnnouncementRecord,
  allocations: TeacherAppAllocationRecord[],
): boolean {
  const metadata = parseTeacherAnnouncementMetadata(announcement.metadata);
  if (!metadata) return false;

  return allocations.some(
    (allocation) =>
      allocation.id === metadata.teacherApp.classId &&
      allocation.classroomId === metadata.teacherApp.classroomId,
  );
}

function mapStatusFilter(status: string): CommunicationAnnouncementStatus {
  switch (status) {
    case 'draft':
      return CommunicationAnnouncementStatus.DRAFT;
    case 'scheduled':
      return CommunicationAnnouncementStatus.SCHEDULED;
    case 'published':
      return CommunicationAnnouncementStatus.PUBLISHED;
    case 'archived':
      return CommunicationAnnouncementStatus.ARCHIVED;
    case 'cancelled':
      return CommunicationAnnouncementStatus.CANCELLED;
    default:
      throw new ValidationDomainException(
        'Teacher announcement status filter is invalid',
        { status },
      );
  }
}

function addAudienceRow(
  rows: TeacherAnnouncementAudienceRow[],
  seen: Set<string>,
  row: TeacherAnnouncementAudienceRow,
): void {
  const key = row.userId ? `user:${row.userId}` : `guardian:${row.guardianId}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push(row);
}

function isActiveUserOfType(
  user:
    | {
        id: string;
        userType: UserType;
        status: UserStatus;
        deletedAt: Date | null;
      }
    | null,
  userType: UserType,
): boolean {
  return (
    user?.userType === userType &&
    user.status === UserStatus.ACTIVE &&
    user.deletedAt === null
  );
}

function resolveLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, limit), MAX_LIMIT);
}

function resolvePage(page: number | undefined): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(1, page);
}
