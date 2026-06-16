import { Injectable } from '@nestjs/common';
import {
  CurriculumStatus,
  LessonPlanItemStatus,
  LessonPlanStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const TEACHER_LESSON_PREPARATION_ITEM_ARGS =
  Prisma.validator<Prisma.LessonPlanItemDefaultArgs>()({
    select: {
      id: true,
      lessonPlanId: true,
      curriculumId: true,
      unitId: true,
      lessonId: true,
      timetableEntryId: true,
      plannedDate: true,
      dayOfWeek: true,
      periodId: true,
      periodLabel: true,
      title: true,
      notes: true,
      status: true,
      sortOrder: true,
      startedAt: true,
      completedAt: true,
      skippedAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
      curriculum: {
        select: {
          id: true,
          title: true,
          status: true,
          deletedAt: true,
        },
      },
      unit: {
        select: {
          id: true,
          title: true,
          sortOrder: true,
          deletedAt: true,
        },
      },
      lesson: {
        select: {
          id: true,
          title: true,
          objectives: true,
          sortOrder: true,
          deletedAt: true,
          contentItems: {
            where: {
              deletedAt: null,
              curriculum: {
                is: {
                  deletedAt: null,
                  status: { not: CurriculumStatus.ARCHIVED },
                },
              },
              unit: { is: { deletedAt: null } },
            },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              type: true,
              title: true,
              bodyText: true,
              url: true,
              sortOrder: true,
              isRequired: true,
              estimatedMinutes: true,
              metadata: true,
              file: {
                select: {
                  id: true,
                  originalName: true,
                  mimeType: true,
                  sizeBytes: true,
                  deletedAt: true,
                },
              },
            },
          },
        },
      },
      lessonPlan: {
        select: {
          id: true,
          schoolId: true,
          academicYearId: true,
          termId: true,
          teacherSubjectAllocationId: true,
          teacherUserId: true,
          classroomId: true,
          subjectId: true,
          curriculumId: true,
          status: true,
          deletedAt: true,
          term: {
            select: {
              id: true,
              schoolId: true,
              academicYearId: true,
              startDate: true,
              endDate: true,
              isActive: true,
              deletedAt: true,
            },
          },
          teacherSubjectAllocation: {
            select: {
              id: true,
              schoolId: true,
              teacherUserId: true,
              subjectId: true,
              classroomId: true,
              termId: true,
            },
          },
          subject: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              code: true,
              color: true,
              isActive: true,
              deletedAt: true,
            },
          },
          classroom: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              deletedAt: true,
            },
          },
        },
      },
      timetableEntry: {
        select: {
          id: true,
          termId: true,
          teacherSubjectAllocationId: true,
          dayOfWeek: true,
          period: {
            select: {
              id: true,
              label: true,
              periodIndex: true,
              startTime: true,
              endTime: true,
              isInstructional: true,
            },
          },
        },
      },
    },
  });

export type TeacherLessonPreparationItemRecord =
  Prisma.LessonPlanItemGetPayload<typeof TEACHER_LESSON_PREPARATION_ITEM_ARGS>;

@Injectable()
export class TeacherLessonPreparationReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listItemsForTeacherOnDate(params: {
    teacherUserId: string;
    schoolId: string;
    allocationIds: string[];
    date: Date;
  }): Promise<TeacherLessonPreparationItemRecord[]> {
    if (params.allocationIds.length === 0) return [];

    return this.scopedPrisma.lessonPlanItem.findMany({
      where: {
        ...visibleTeacherItemWhere(params),
        plannedDate: params.date,
      },
      orderBy: [{ plannedDate: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      ...TEACHER_LESSON_PREPARATION_ITEM_ARGS,
    });
  }

  async listItemsForTeacherDateRange(params: {
    teacherUserId: string;
    schoolId: string;
    allocationIds: string[];
    from: Date;
    to: Date;
  }): Promise<TeacherLessonPreparationItemRecord[]> {
    if (params.allocationIds.length === 0) return [];

    return this.scopedPrisma.lessonPlanItem.findMany({
      where: {
        ...visibleTeacherItemWhere(params),
        plannedDate: {
          gte: params.from,
          lte: params.to,
        },
      },
      orderBy: [{ plannedDate: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      ...TEACHER_LESSON_PREPARATION_ITEM_ARGS,
    });
  }

  findOwnedItemById(params: {
    teacherUserId: string;
    schoolId: string;
    allocationIds: string[];
    itemId: string;
    includeArchivedPlan?: boolean;
  }): Promise<TeacherLessonPreparationItemRecord | null> {
    if (params.allocationIds.length === 0) return Promise.resolve(null);

    return this.scopedPrisma.lessonPlanItem.findFirst({
      where: {
        id: params.itemId,
        ...teacherOwnedItemWhere({
          ...params,
          includeArchivedPlan: params.includeArchivedPlan ?? false,
        }),
      },
      ...TEACHER_LESSON_PREPARATION_ITEM_ARGS,
    });
  }

  updateItemStatus(params: {
    itemId: string;
    status: LessonPlanItemStatus;
    notes?: string | null;
    updatedByUserId: string;
  }): Promise<TeacherLessonPreparationItemRecord> {
    const now = new Date();
    const data: Prisma.LessonPlanItemUncheckedUpdateInput = {
      status: params.status,
      updatedByUserId: params.updatedByUserId,
    };

    if (params.notes !== undefined) {
      data.notes = normalizeNullableText(params.notes);
    }
    if (params.status === LessonPlanItemStatus.PLANNED) {
      data.startedAt = null;
      data.completedAt = null;
      data.skippedAt = null;
      data.cancelledAt = null;
    }
    if (params.status === LessonPlanItemStatus.IN_PROGRESS) {
      data.startedAt = now;
      data.completedAt = null;
      data.skippedAt = null;
      data.cancelledAt = null;
    }
    if (params.status === LessonPlanItemStatus.DONE) {
      data.startedAt = now;
      data.completedAt = now;
      data.skippedAt = null;
      data.cancelledAt = null;
    }
    if (params.status === LessonPlanItemStatus.SKIPPED) {
      data.skippedAt = now;
      data.cancelledAt = null;
    }

    return this.scopedPrisma.lessonPlanItem.update({
      where: { id: params.itemId },
      data,
      ...TEACHER_LESSON_PREPARATION_ITEM_ARGS,
    });
  }
}

function visibleTeacherItemWhere(params: {
  teacherUserId: string;
  schoolId: string;
  allocationIds: string[];
}): Prisma.LessonPlanItemWhereInput {
  return teacherOwnedItemWhere({
    ...params,
    includeArchivedPlan: false,
  });
}

function teacherOwnedItemWhere(params: {
  teacherUserId: string;
  schoolId: string;
  allocationIds: string[];
  includeArchivedPlan: boolean;
}): Prisma.LessonPlanItemWhereInput {
  return {
    schoolId: params.schoolId,
    deletedAt: null,
    lessonPlan: {
      is: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        teacherSubjectAllocationId: { in: params.allocationIds },
        deletedAt: null,
        ...(params.includeArchivedPlan
          ? {}
          : { status: { not: LessonPlanStatus.ARCHIVED } }),
        term: { is: { deletedAt: null } },
        subject: {
          is: {
            deletedAt: null,
            isActive: true,
          },
        },
        classroom: {
          is: {
            deletedAt: null,
            section: {
              is: {
                deletedAt: null,
                grade: {
                  is: {
                    deletedAt: null,
                    stage: {
                      is: {
                        deletedAt: null,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        curriculum: {
          is: {
            deletedAt: null,
            ...(params.includeArchivedPlan
              ? {}
              : { status: { not: CurriculumStatus.ARCHIVED } }),
          },
        },
        teacherSubjectAllocation: {
          is: {
            id: { in: params.allocationIds },
            schoolId: params.schoolId,
            teacherUserId: params.teacherUserId,
            teacherUser: {
              is: {
                userType: UserType.TEACHER,
                deletedAt: null,
              },
            },
            subject: {
              is: {
                deletedAt: null,
                isActive: true,
              },
            },
            classroom: {
              is: {
                deletedAt: null,
              },
            },
            term: {
              is: {
                deletedAt: null,
              },
            },
          },
        },
      },
    },
    curriculum: {
      is: {
        deletedAt: null,
        ...(params.includeArchivedPlan
          ? {}
          : { status: { not: CurriculumStatus.ARCHIVED } }),
      },
    },
    unit: { is: { deletedAt: null } },
    lesson: { is: { deletedAt: null } },
  };
}

function normalizeNullableText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
