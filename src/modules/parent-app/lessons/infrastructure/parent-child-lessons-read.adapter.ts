import { Injectable } from '@nestjs/common';
import {
  CurriculumStatus,
  LessonPlanStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';

const PARENT_CHILD_LESSON_ITEM_ARGS =
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
      status: true,
      sortOrder: true,
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
                  status: CurriculumStatus.ACTIVE,
                },
              },
              unit: { is: { deletedAt: null } },
              OR: [
                { fileId: null },
                { file: { is: { deletedAt: null } } },
              ],
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
          academicYearId: true,
          termId: true,
          classroomId: true,
          subjectId: true,
          status: true,
          deletedAt: true,
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
          academicYearId: true,
          termId: true,
          classroomId: true,
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

export type ParentChildLessonItemRecord = Prisma.LessonPlanItemGetPayload<
  typeof PARENT_CHILD_LESSON_ITEM_ARGS
>;

@Injectable()
export class ParentChildLessonsReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listItemsForChildOnDate(params: {
    child: ParentAppAccessibleChild;
    date: Date;
  }): Promise<ParentChildLessonItemRecord[]> {
    const scope = buildParentChildLessonScope(params.child);
    if (!scope) return [];

    return this.scopedPrisma.lessonPlanItem.findMany({
      where: {
        ...visibleParentChildLessonWhere(scope),
        plannedDate: params.date,
      },
      orderBy: [{ plannedDate: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      ...PARENT_CHILD_LESSON_ITEM_ARGS,
    });
  }

  async listItemsForChildDateRange(params: {
    child: ParentAppAccessibleChild;
    from: Date;
    to: Date;
  }): Promise<ParentChildLessonItemRecord[]> {
    const scope = buildParentChildLessonScope(params.child);
    if (!scope) return [];

    return this.scopedPrisma.lessonPlanItem.findMany({
      where: {
        ...visibleParentChildLessonWhere(scope),
        plannedDate: {
          gte: params.from,
          lte: params.to,
        },
      },
      orderBy: [{ plannedDate: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      ...PARENT_CHILD_LESSON_ITEM_ARGS,
    });
  }

  async findVisibleItemById(params: {
    child: ParentAppAccessibleChild;
    itemId: string;
  }): Promise<ParentChildLessonItemRecord | null> {
    const scope = buildParentChildLessonScope(params.child);
    if (!scope) return null;

    return this.scopedPrisma.lessonPlanItem.findFirst({
      where: {
        id: params.itemId,
        ...visibleParentChildLessonWhere(scope),
      },
      ...PARENT_CHILD_LESSON_ITEM_ARGS,
    });
  }
}

type ParentChildLessonScope = {
  classroomId: string;
  academicYearId: string;
  termId: string;
};

function buildParentChildLessonScope(
  child: ParentAppAccessibleChild,
): ParentChildLessonScope | null {
  if (!child.termId) return null;

  return {
    classroomId: child.classroomId,
    academicYearId: child.academicYearId,
    termId: child.termId,
  };
}

function visibleParentChildLessonWhere(
  scope: ParentChildLessonScope,
): Prisma.LessonPlanItemWhereInput {
  return {
    deletedAt: null,
    lessonPlan: {
      is: {
        academicYearId: scope.academicYearId,
        termId: scope.termId,
        classroomId: scope.classroomId,
        status: LessonPlanStatus.ACTIVE,
        deletedAt: null,
        term: {
          is: {
            academicYearId: scope.academicYearId,
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
            academicYearId: scope.academicYearId,
            termId: scope.termId,
            status: CurriculumStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
    },
    curriculum: {
      is: {
        academicYearId: scope.academicYearId,
        termId: scope.termId,
        status: CurriculumStatus.ACTIVE,
        deletedAt: null,
      },
    },
    unit: {
      is: {
        deletedAt: null,
      },
    },
    lesson: {
      is: {
        deletedAt: null,
      },
    },
  };
}
