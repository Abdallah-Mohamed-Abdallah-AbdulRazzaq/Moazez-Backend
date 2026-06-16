import { Injectable } from '@nestjs/common';
import {
  CurriculumStatus,
  LessonPlanStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';

const STUDENT_LESSON_ITEM_ARGS =
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

export type StudentLessonItemRecord = Prisma.LessonPlanItemGetPayload<
  typeof STUDENT_LESSON_ITEM_ARGS
>;

@Injectable()
export class StudentLessonsReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listItemsForStudentOnDate(params: {
    context: StudentAppContext;
    date: Date;
  }): Promise<StudentLessonItemRecord[]> {
    const scope = buildStudentLessonScope(params.context);
    if (!scope) return [];

    return this.scopedPrisma.lessonPlanItem.findMany({
      where: {
        ...visibleStudentLessonWhere(scope),
        plannedDate: params.date,
      },
      orderBy: [{ plannedDate: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      ...STUDENT_LESSON_ITEM_ARGS,
    });
  }

  async listItemsForStudentDateRange(params: {
    context: StudentAppContext;
    from: Date;
    to: Date;
  }): Promise<StudentLessonItemRecord[]> {
    const scope = buildStudentLessonScope(params.context);
    if (!scope) return [];

    return this.scopedPrisma.lessonPlanItem.findMany({
      where: {
        ...visibleStudentLessonWhere(scope),
        plannedDate: {
          gte: params.from,
          lte: params.to,
        },
      },
      orderBy: [{ plannedDate: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      ...STUDENT_LESSON_ITEM_ARGS,
    });
  }

  async findVisibleItemById(params: {
    context: StudentAppContext;
    itemId: string;
  }): Promise<StudentLessonItemRecord | null> {
    const scope = buildStudentLessonScope(params.context);
    if (!scope) return null;

    return this.scopedPrisma.lessonPlanItem.findFirst({
      where: {
        id: params.itemId,
        ...visibleStudentLessonWhere(scope),
      },
      ...STUDENT_LESSON_ITEM_ARGS,
    });
  }
}

type StudentLessonScope = {
  schoolId: string;
  classroomId: string;
  academicYearId: string;
  termId: string;
};

function buildStudentLessonScope(
  context: StudentAppContext,
): StudentLessonScope | null {
  if (!context.termId) return null;

  return {
    schoolId: context.schoolId,
    classroomId: context.classroomId,
    academicYearId: context.academicYearId,
    termId: context.termId,
  };
}

function visibleStudentLessonWhere(
  scope: StudentLessonScope,
): Prisma.LessonPlanItemWhereInput {
  return {
    schoolId: scope.schoolId,
    deletedAt: null,
    lessonPlan: {
      is: {
        schoolId: scope.schoolId,
        academicYearId: scope.academicYearId,
        termId: scope.termId,
        classroomId: scope.classroomId,
        status: LessonPlanStatus.ACTIVE,
        deletedAt: null,
        term: {
          is: {
            schoolId: scope.schoolId,
            academicYearId: scope.academicYearId,
            deletedAt: null,
          },
        },
        subject: {
          is: {
            schoolId: scope.schoolId,
            deletedAt: null,
            isActive: true,
          },
        },
        classroom: {
          is: {
            schoolId: scope.schoolId,
            deletedAt: null,
            section: {
              is: {
                schoolId: scope.schoolId,
                deletedAt: null,
                grade: {
                  is: {
                    schoolId: scope.schoolId,
                    deletedAt: null,
                    stage: {
                      is: {
                        schoolId: scope.schoolId,
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
            schoolId: scope.schoolId,
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
        schoolId: scope.schoolId,
        academicYearId: scope.academicYearId,
        termId: scope.termId,
        status: CurriculumStatus.ACTIVE,
        deletedAt: null,
      },
    },
    unit: {
      is: {
        schoolId: scope.schoolId,
        deletedAt: null,
      },
    },
    lesson: {
      is: {
        schoolId: scope.schoolId,
        deletedAt: null,
      },
    },
  };
}
