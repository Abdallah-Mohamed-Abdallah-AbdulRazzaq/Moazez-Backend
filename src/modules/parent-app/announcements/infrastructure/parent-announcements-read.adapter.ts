import { Injectable } from '@nestjs/common';
import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppContext } from '../../shared/parent-app.types';
import type { ParentAnnouncementsQueryDto } from '../dto/parent-announcements.dto';

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
      studentId: true,
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

export type ParentAnnouncementRecord =
  Prisma.CommunicationAnnouncementGetPayload<{
    select: typeof ANNOUNCEMENT_SELECT;
  }>;

export type ParentAnnouncementAttachmentRecord =
  Prisma.CommunicationAnnouncementAttachmentGetPayload<{
    select: typeof ANNOUNCEMENT_ATTACHMENT_SELECT;
  }>;

type EnrollmentHierarchyRecord = Prisma.EnrollmentGetPayload<
  typeof ENROLLMENT_HIERARCHY_ARGS
>;

export interface ParentAnnouncementReadModel {
  announcement: ParentAnnouncementRecord;
  readAt: Date | null;
}

export interface ParentAnnouncementsListReadModel {
  items: ParentAnnouncementReadModel[];
  total: number;
  page: number;
  limit: number;
}

export interface ParentAnnouncementReadResult {
  announcementId: string;
  readAt: string;
}

@Injectable()
export class ParentAnnouncementsReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listAnnouncements(params: {
    context: ParentAppContext;
    query?: ParentAnnouncementsQueryDto;
  }): Promise<ParentAnnouncementsListReadModel> {
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
      userId: params.context.parentUserId,
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
    context: ParentAppContext;
    announcementId: string;
  }): Promise<ParentAnnouncementReadModel | null> {
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

    const read =
      await this.scopedPrisma.communicationAnnouncementRead.findFirst({
        where: {
          announcementId: announcement.id,
          userId: params.context.parentUserId,
        },
        select: {
          readAt: true,
        },
      });

    return {
      announcement,
      readAt: read?.readAt ?? null,
    };
  }

  async markAnnouncementRead(params: {
    context: ParentAppContext;
    announcementId: string;
  }): Promise<ParentAnnouncementReadResult | null> {
    const visible = await this.findAnnouncement(params);
    if (!visible) return null;

    const readAt = new Date();
    const existing =
      await this.scopedPrisma.communicationAnnouncementRead.findFirst({
        where: {
          announcementId: params.announcementId,
          userId: params.context.parentUserId,
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
          userId: params.context.parentUserId,
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
    context: ParentAppContext;
    announcementId: string;
  }): Promise<ParentAnnouncementAttachmentRecord[] | null> {
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
    context: ParentAppContext;
    query?: Pick<ParentAnnouncementsQueryDto, 'category' | 'search'>;
  }): Promise<Prisma.CommunicationAnnouncementWhereInput> {
    const hierarchies = await this.loadEnrollmentHierarchies(params.context);
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
          hierarchies,
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

  private async loadEnrollmentHierarchies(
    context: ParentAppContext,
  ): Promise<EnrollmentHierarchyRecord[]> {
    if (context.children.length === 0) return [];

    return this.scopedPrisma.enrollment.findMany({
      where: {
        id: { in: context.children.map((child) => child.enrollmentId) },
        studentId: { in: context.children.map((child) => child.studentId) },
        academicYearId: {
          in: context.children.map((child) => child.academicYearId),
        },
      },
      ...ENROLLMENT_HIERARCHY_ARGS,
    });
  }

  private async loadReadMap(params: {
    announcementIds: string[];
    userId: string;
  }): Promise<Map<string, Date>> {
    if (params.announcementIds.length === 0) return new Map();

    const rows = await this.scopedPrisma.communicationAnnouncementRead.findMany(
      {
        where: {
          announcementId: { in: params.announcementIds },
          userId: params.userId,
        },
        select: {
          announcementId: true,
          readAt: true,
        },
      },
    );

    return new Map(rows.map((row) => [row.announcementId, row.readAt]));
  }
}

function buildAudienceWhere(params: {
  context: ParentAppContext;
  hierarchies: EnrollmentHierarchyRecord[];
}): Prisma.CommunicationAnnouncementWhereInput {
  const classroomIds = unique(
    params.hierarchies.map((hierarchy) => hierarchy.classroom.id),
  );
  const sectionIds = unique(
    params.hierarchies.map((hierarchy) => hierarchy.classroom.section.id),
  );
  const gradeIds = unique(
    params.hierarchies.map((hierarchy) => hierarchy.classroom.section.grade.id),
  );
  const stageIds = unique(
    params.hierarchies.map(
      (hierarchy) => hierarchy.classroom.section.grade.stageId,
    ),
  );
  const studentIds = unique(
    params.context.children.map((child) => child.studentId),
  );
  const guardianIds = unique(params.context.guardianIds);
  const customTargets: Prisma.CommunicationAnnouncementAudienceWhereInput[] = [
    { userId: params.context.parentUserId },
    ...(guardianIds.length > 0 ? [{ guardianId: { in: guardianIds } }] : []),
    ...(studentIds.length > 0 ? [{ studentId: { in: studentIds } }] : []),
    ...(classroomIds.length > 0 ? [{ classroomId: { in: classroomIds } }] : []),
    ...(sectionIds.length > 0 ? [{ sectionId: { in: sectionIds } }] : []),
    ...(gradeIds.length > 0 ? [{ gradeId: { in: gradeIds } }] : []),
    ...(stageIds.length > 0 ? [{ stageId: { in: stageIds } }] : []),
  ];

  return {
    OR: [
      { audienceType: CommunicationAnnouncementAudienceType.SCHOOL },
      ...(stageIds.length > 0
        ? [
            {
              audienceType: CommunicationAnnouncementAudienceType.STAGE,
              audiences: {
                some: {
                  audienceType: CommunicationAnnouncementAudienceType.STAGE,
                  stageId: { in: stageIds },
                },
              },
            },
          ]
        : []),
      ...(gradeIds.length > 0
        ? [
            {
              audienceType: CommunicationAnnouncementAudienceType.GRADE,
              audiences: {
                some: {
                  audienceType: CommunicationAnnouncementAudienceType.GRADE,
                  gradeId: { in: gradeIds },
                },
              },
            },
          ]
        : []),
      ...(sectionIds.length > 0
        ? [
            {
              audienceType: CommunicationAnnouncementAudienceType.SECTION,
              audiences: {
                some: {
                  audienceType: CommunicationAnnouncementAudienceType.SECTION,
                  sectionId: { in: sectionIds },
                },
              },
            },
          ]
        : []),
      ...(classroomIds.length > 0
        ? [
            {
              audienceType: CommunicationAnnouncementAudienceType.CLASSROOM,
              audiences: {
                some: {
                  audienceType: CommunicationAnnouncementAudienceType.CLASSROOM,
                  classroomId: { in: classroomIds },
                },
              },
            },
          ]
        : []),
      {
        audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
        audiences: {
          some: {
            OR: customTargets,
          },
        },
      },
    ],
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function resolveLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
