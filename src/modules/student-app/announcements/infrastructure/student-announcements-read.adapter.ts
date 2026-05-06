import { Injectable } from '@nestjs/common';
import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import type { StudentAnnouncementsQueryDto } from '../dto/student-announcements.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const SAFE_FILE_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
} satisfies Prisma.FileSelect;

const ANNOUNCEMENT_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  userType: true,
} satisfies Prisma.UserSelect;

const ANNOUNCEMENT_SELECT = {
  id: true,
  title: true,
  body: true,
  status: true,
  priority: true,
  audienceType: true,
  category: true,
  isPinned: true,
  pinnedUntil: true,
  actionLabel: true,
  publishedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  imageFile: {
    select: SAFE_FILE_SELECT,
  },
  createdBy: {
    select: ANNOUNCEMENT_USER_SELECT,
  },
  publishedBy: {
    select: ANNOUNCEMENT_USER_SELECT,
  },
  _count: {
    select: {
      attachments: true,
    },
  },
} satisfies Prisma.CommunicationAnnouncementSelect;

const ANNOUNCEMENT_ATTACHMENT_SELECT = {
  id: true,
  fileId: true,
  sortOrder: true,
  createdAt: true,
  file: {
    select: SAFE_FILE_SELECT,
  },
} satisfies Prisma.CommunicationAnnouncementAttachmentSelect;

const ENROLLMENT_HIERARCHY_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      classroom: {
        select: {
          id: true,
          section: {
            select: {
              id: true,
              grade: {
                select: {
                  id: true,
                  stageId: true,
                },
              },
            },
          },
        },
      },
    },
  });

export type StudentAnnouncementRecord =
  Prisma.CommunicationAnnouncementGetPayload<{
    select: typeof ANNOUNCEMENT_SELECT;
  }>;

export type StudentAnnouncementAttachmentRecord =
  Prisma.CommunicationAnnouncementAttachmentGetPayload<{
    select: typeof ANNOUNCEMENT_ATTACHMENT_SELECT;
  }>;

type EnrollmentHierarchyRecord = Prisma.EnrollmentGetPayload<
  typeof ENROLLMENT_HIERARCHY_ARGS
>;

export interface StudentAnnouncementReadModel {
  announcement: StudentAnnouncementRecord;
  readAt: Date | null;
}

export interface StudentAnnouncementsListReadModel {
  items: StudentAnnouncementReadModel[];
  total: number;
  page: number;
  limit: number;
}

export interface StudentAnnouncementReadResult {
  announcementId: string;
  readAt: string;
}

@Injectable()
export class StudentAnnouncementsReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listAnnouncements(params: {
    context: StudentAppContext;
    query?: StudentAnnouncementsQueryDto;
  }): Promise<StudentAnnouncementsListReadModel> {
    const page = resolvePage(params.query?.page);
    const limit = resolveLimit(params.query?.limit);
    const where = await this.buildVisibleAnnouncementWhere(params);

    const [announcements, total] = await Promise.all([
      this.scopedPrisma.communicationAnnouncement.findMany({
        where,
        orderBy: [
          { isPinned: 'desc' },
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        take: limit,
        skip: (page - 1) * limit,
        select: ANNOUNCEMENT_SELECT,
      }),
      this.scopedPrisma.communicationAnnouncement.count({ where }),
    ]);

    const readMap = await this.loadReadMap({
      announcementIds: announcements.map((announcement) => announcement.id),
      userId: params.context.studentUserId,
    });

    return {
      items: announcements.map((announcement) => ({
        announcement,
        readAt: readMap.get(announcement.id) ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  async findAnnouncement(params: {
    context: StudentAppContext;
    announcementId: string;
  }): Promise<StudentAnnouncementReadModel | null> {
    const where = await this.buildVisibleAnnouncementWhere({
      context: params.context,
    });
    const announcement =
      await this.scopedPrisma.communicationAnnouncement.findFirst({
        where: {
          ...where,
          id: params.announcementId,
        },
        select: ANNOUNCEMENT_SELECT,
      });

    if (!announcement) return null;

    const read = await this.scopedPrisma.communicationAnnouncementRead.findFirst(
      {
        where: {
          announcementId: announcement.id,
          userId: params.context.studentUserId,
        },
        select: {
          readAt: true,
        },
      },
    );

    return {
      announcement,
      readAt: read?.readAt ?? null,
    };
  }

  async markAnnouncementRead(params: {
    context: StudentAppContext;
    announcementId: string;
  }): Promise<StudentAnnouncementReadResult | null> {
    const visible = await this.findAnnouncement(params);
    if (!visible) return null;

    const readAt = new Date();
    const existing =
      await this.scopedPrisma.communicationAnnouncementRead.findFirst({
        where: {
          announcementId: params.announcementId,
          userId: params.context.studentUserId,
        },
        select: { id: true },
      });

    if (existing) {
      await this.scopedPrisma.communicationAnnouncementRead.update({
        where: { id: existing.id },
        data: { readAt },
      });
    } else {
      await this.scopedPrisma.communicationAnnouncementRead.create({
        data: {
          schoolId: params.context.schoolId,
          announcementId: params.announcementId,
          userId: params.context.studentUserId,
          readAt,
        },
      });
    }

    return {
      announcementId: params.announcementId,
      readAt: readAt.toISOString(),
    };
  }

  async listAttachments(params: {
    context: StudentAppContext;
    announcementId: string;
  }): Promise<StudentAnnouncementAttachmentRecord[] | null> {
    const visible = await this.findAnnouncement(params);
    if (!visible) return null;

    return this.scopedPrisma.communicationAnnouncementAttachment.findMany({
      where: {
        announcementId: params.announcementId,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: ANNOUNCEMENT_ATTACHMENT_SELECT,
    });
  }

  private async buildVisibleAnnouncementWhere(params: {
    context: StudentAppContext;
    query?: Pick<StudentAnnouncementsQueryDto, 'category' | 'search'>;
  }): Promise<Prisma.CommunicationAnnouncementWhereInput> {
    const hierarchy = await this.loadEnrollmentHierarchy(params.context);
    const now = new Date();
    const search = params.query?.search?.trim();
    const category = params.query?.category?.trim();
    const stringFilter = search
      ? { contains: search, mode: Prisma.QueryMode.insensitive }
      : null;

    return {
      status: CommunicationAnnouncementStatus.PUBLISHED,
      ...(category
        ? { category: { equals: category, mode: Prisma.QueryMode.insensitive } }
        : {}),
      AND: [
        {
          OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
        },
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        buildAudienceWhere({
          context: params.context,
          hierarchy,
        }),
        ...(stringFilter
          ? [
              {
                OR: [{ title: stringFilter }, { body: stringFilter }],
              },
            ]
          : []),
      ],
    };
  }

  private async loadEnrollmentHierarchy(
    context: StudentAppContext,
  ): Promise<EnrollmentHierarchyRecord> {
    return this.scopedPrisma.enrollment.findFirstOrThrow({
      where: {
        id: context.enrollmentId,
        studentId: context.studentId,
        academicYearId: context.academicYearId,
        classroomId: context.classroomId,
      },
      ...ENROLLMENT_HIERARCHY_ARGS,
    });
  }

  private async loadReadMap(params: {
    announcementIds: string[];
    userId: string;
  }): Promise<Map<string, Date>> {
    if (params.announcementIds.length === 0) return new Map();

    const rows = await this.scopedPrisma.communicationAnnouncementRead.findMany({
      where: {
        announcementId: { in: params.announcementIds },
        userId: params.userId,
      },
      select: {
        announcementId: true,
        readAt: true,
      },
    });

    return new Map(rows.map((row) => [row.announcementId, row.readAt]));
  }
}

function buildAudienceWhere(params: {
  context: StudentAppContext;
  hierarchy: EnrollmentHierarchyRecord;
}): Prisma.CommunicationAnnouncementWhereInput {
  const classroomId = params.hierarchy.classroom.id;
  const sectionId = params.hierarchy.classroom.section.id;
  const gradeId = params.hierarchy.classroom.section.grade.id;
  const stageId = params.hierarchy.classroom.section.grade.stageId;
  const customTargets: Prisma.CommunicationAnnouncementAudienceWhereInput[] = [
    { userId: params.context.studentUserId },
    { studentId: params.context.studentId },
    { classroomId },
    { sectionId },
    { gradeId },
    { stageId },
  ];

  return {
    OR: [
      { audienceType: CommunicationAnnouncementAudienceType.SCHOOL },
      {
        audienceType: CommunicationAnnouncementAudienceType.STAGE,
        audiences: {
          some: {
            audienceType: CommunicationAnnouncementAudienceType.STAGE,
            stageId,
          },
        },
      },
      {
        audienceType: CommunicationAnnouncementAudienceType.GRADE,
        audiences: {
          some: {
            audienceType: CommunicationAnnouncementAudienceType.GRADE,
            gradeId,
          },
        },
      },
      {
        audienceType: CommunicationAnnouncementAudienceType.SECTION,
        audiences: {
          some: {
            audienceType: CommunicationAnnouncementAudienceType.SECTION,
            sectionId,
          },
        },
      },
      {
        audienceType: CommunicationAnnouncementAudienceType.CLASSROOM,
        audiences: {
          some: {
            audienceType: CommunicationAnnouncementAudienceType.CLASSROOM,
            classroomId,
          },
        },
      },
      {
        audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
        audiences: {
          some: {
            audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
            OR: customTargets,
          },
        },
      },
    ],
  };
}

function resolveLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
