import { Injectable } from '@nestjs/common';
import {
  CurriculumStatus,
  LessonContentPublicationStatus,
  LessonPlanItemStatus,
  LessonPlanStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';

const STUDENT_SUBJECT_LESSON_ITEM_ARGS =
  Prisma.validator<Prisma.LessonPlanItemDefaultArgs>()({
    select: {
      id: true,
      plannedDate: true,
      status: true,
      title: true,
      sortOrder: true,
      unit: {
        select: {
          id: true,
          title: true,
          sortOrder: true,
        },
      },
      lesson: {
        select: {
          id: true,
          title: true,
          sortOrder: true,
          contentItems: {
            where: {
              deletedAt: null,
              publicationStatus: LessonContentPublicationStatus.PUBLISHED,
              curriculum: {
                is: {
                  deletedAt: null,
                  status: CurriculumStatus.ACTIVE,
                },
              },
              unit: { is: { deletedAt: null } },
              OR: [{ fileId: null }, { file: { is: { deletedAt: null } } }],
            },
            select: {
              type: true,
              isRequired: true,
            },
          },
        },
      },
      timetableEntry: {
        select: {
          academicYearId: true,
          termId: true,
          classroomId: true,
          period: {
            select: {
              id: true,
              label: true,
              periodIndex: true,
            },
          },
        },
      },
    },
  });

export type StudentSubjectLessonItemRecord = Prisma.LessonPlanItemGetPayload<
  typeof STUDENT_SUBJECT_LESSON_ITEM_ARGS
>;

export interface StudentSubjectLessonEligibilityRecord {
  termStartDate: Date;
  termEndDate: Date;
}

export interface StudentSubjectLessonCursorPosition {
  plannedDate: Date;
  periodIndex: number | null;
  sortOrder: number;
  itemId: string;
}

export interface ListStudentSubjectLessonItemsParams {
  context: StudentAppContext;
  subjectId: string;
  from: Date;
  to: Date;
  status: LessonPlanItemStatus | null;
  cursor: StudentSubjectLessonCursorPosition | null;
  take: number;
}

@Injectable()
export class StudentSubjectLessonsReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async resolveEligibleSubject(params: {
    context: StudentAppContext;
    subjectId: string;
  }): Promise<StudentSubjectLessonEligibilityRecord | null> {
    const { context, subjectId } = params;
    if (!context.termId) return null;

    const term = await this.scopedPrisma.term.findFirst({
      where: {
        id: context.termId,
        schoolId: context.schoolId,
        academicYearId: context.academicYearId,
        deletedAt: null,
      },
      select: {
        startDate: true,
        endDate: true,
      },
    });
    if (!term) return null;

    const subject = await this.scopedPrisma.subject.findFirst({
      where: {
        id: subjectId,
        schoolId: context.schoolId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!subject) return null;

    const [allocationCount, visiblePlanCount] = await Promise.all([
      this.scopedPrisma.teacherSubjectAllocation.count({
        where: {
          schoolId: context.schoolId,
          subjectId,
          classroomId: context.classroomId,
          termId: context.termId,
        },
      }),
      this.scopedPrisma.lessonPlan.count({
        where: visibleStudentLessonPlanWhere({
          context,
          subjectId,
        }),
      }),
    ]);

    if (allocationCount === 0 && visiblePlanCount === 0) return null;

    return {
      termStartDate: term.startDate,
      termEndDate: term.endDate,
    };
  }

  listVisibleItems(
    params: ListStudentSubjectLessonItemsParams,
  ): Promise<StudentSubjectLessonItemRecord[]> {
    const cursorWhere = params.cursor
      ? buildCursorWhere(params.cursor)
      : undefined;

    return this.scopedPrisma.lessonPlanItem.findMany({
      where: {
        AND: [
          visibleStudentLessonItemWhere({
            context: params.context,
            subjectId: params.subjectId,
          }),
          {
            plannedDate: {
              not: null,
              gte: params.from,
              lte: params.to,
            },
          },
          ...(params.status ? [{ status: params.status }] : []),
          ...(cursorWhere ? [cursorWhere] : []),
        ],
      },
      orderBy: [
        { plannedDate: { sort: 'asc', nulls: 'last' } },
        { timetableEntry: { period: { periodIndex: 'asc' } } },
        { sortOrder: 'asc' },
        { id: 'asc' },
      ],
      take: params.take,
      ...STUDENT_SUBJECT_LESSON_ITEM_ARGS,
    });
  }
}

function visibleStudentLessonPlanWhere(params: {
  context: StudentAppContext;
  subjectId: string;
}): Prisma.LessonPlanWhereInput {
  const { context, subjectId } = params;

  return {
    schoolId: context.schoolId,
    academicYearId: context.academicYearId,
    termId: context.termId ?? undefined,
    classroomId: context.classroomId,
    subjectId,
    status: LessonPlanStatus.ACTIVE,
    deletedAt: null,
    term: {
      is: {
        schoolId: context.schoolId,
        academicYearId: context.academicYearId,
        deletedAt: null,
      },
    },
    subject: {
      is: {
        schoolId: context.schoolId,
        isActive: true,
        deletedAt: null,
      },
    },
    classroom: {
      is: {
        schoolId: context.schoolId,
        deletedAt: null,
        section: {
          is: {
            schoolId: context.schoolId,
            deletedAt: null,
            grade: {
              is: {
                schoolId: context.schoolId,
                deletedAt: null,
                stage: {
                  is: {
                    schoolId: context.schoolId,
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
        schoolId: context.schoolId,
        academicYearId: context.academicYearId,
        termId: context.termId ?? undefined,
        status: CurriculumStatus.ACTIVE,
        deletedAt: null,
      },
    },
  };
}

function visibleStudentLessonItemWhere(params: {
  context: StudentAppContext;
  subjectId: string;
}): Prisma.LessonPlanItemWhereInput {
  const { context } = params;

  return {
    schoolId: context.schoolId,
    deletedAt: null,
    lessonPlan: {
      is: visibleStudentLessonPlanWhere(params),
    },
    curriculum: {
      is: {
        schoolId: context.schoolId,
        academicYearId: context.academicYearId,
        termId: context.termId ?? undefined,
        status: CurriculumStatus.ACTIVE,
        deletedAt: null,
      },
    },
    unit: {
      is: {
        schoolId: context.schoolId,
        deletedAt: null,
      },
    },
    lesson: {
      is: {
        schoolId: context.schoolId,
        deletedAt: null,
      },
    },
  };
}

function buildCursorWhere(
  cursor: StudentSubjectLessonCursorPosition,
): Prisma.LessonPlanItemWhereInput {
  const laterDate: Prisma.LessonPlanItemWhereInput = {
    plannedDate: { gt: cursor.plannedDate },
  };
  const sameDate = { plannedDate: cursor.plannedDate };

  if (cursor.periodIndex === null) {
    return {
      OR: [
        laterDate,
        {
          ...sameDate,
          timetableEntryId: null,
          OR: [
            { sortOrder: { gt: cursor.sortOrder } },
            {
              sortOrder: cursor.sortOrder,
              id: { gt: cursor.itemId },
            },
          ],
        },
      ],
    };
  }

  const samePeriod: Prisma.LessonPlanItemWhereInput = {
    timetableEntry: {
      is: {
        period: { is: { periodIndex: cursor.periodIndex } },
      },
    },
  };

  return {
    OR: [
      laterDate,
      {
        ...sameDate,
        timetableEntry: {
          is: {
            period: { is: { periodIndex: { gt: cursor.periodIndex } } },
          },
        },
      },
      {
        ...sameDate,
        timetableEntryId: null,
      },
      {
        ...sameDate,
        ...samePeriod,
        sortOrder: { gt: cursor.sortOrder },
      },
      {
        ...sameDate,
        ...samePeriod,
        sortOrder: cursor.sortOrder,
        id: { gt: cursor.itemId },
      },
    ],
  };
}
