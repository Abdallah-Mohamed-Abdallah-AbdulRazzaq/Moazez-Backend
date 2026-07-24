import { Injectable } from '@nestjs/common';
import {
  CurriculumStatus,
  LessonContentPublicationStatus,
  LessonPlanStatus,
  MembershipStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { LessonContentPlaybackCoordinator } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.coordinator';
import type { LessonContentPlaybackResponseDto } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback-response.dto';
import type { LessonContentPlaybackCandidate } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.types';
import type {
  ParentAppAccessibleChild,
  ParentAppContext,
} from '../../shared/parent-app.types';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly playbackCoordinator: LessonContentPlaybackCoordinator,
  ) {}

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

  getLessonContentPlayback(params: {
    context: ParentAppContext;
    child: ParentAppAccessibleChild;
    lessonPlanItemId: string;
    contentItemId: string;
  }): Promise<LessonContentPlaybackResponseDto | null> {
    const scope = buildParentChildLessonScope(params.child);
    if (!scope) return Promise.resolve(null);

    return this.playbackCoordinator.execute({
      schoolId: params.context.schoolId,
      organizationId: params.context.organizationId,
      lessonPlanItemId: params.lessonPlanItemId,
      contentItemId: params.contentItemId,
      visibilityWhere: visibleParentPlaybackWhere({
        schoolId: params.context.schoolId,
        scope,
      }),
      policy: { curriculum: 'ACTIVE', content: 'PUBLISHED' },
      lockAuthorization: (transaction, candidate) =>
        lockParentPlaybackAuthorization(
          transaction,
          params.context,
          params.child,
          candidate,
        ),
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

function visibleParentPlaybackWhere(params: {
  schoolId: string;
  scope: ParentChildLessonScope;
}): Prisma.LessonPlanItemWhereInput {
  const { schoolId, scope } = params;
  return {
    schoolId,
    AND: [visibleParentChildLessonWhere(scope)],
    lessonPlan: {
      is: {
        schoolId,
        academicYearId: scope.academicYearId,
        termId: scope.termId,
        classroomId: scope.classroomId,
        status: LessonPlanStatus.ACTIVE,
        deletedAt: null,
        term: {
          is: {
            schoolId,
            academicYearId: scope.academicYearId,
            deletedAt: null,
          },
        },
        subject: {
          is: { schoolId, deletedAt: null, isActive: true },
        },
        classroom: {
          is: {
            schoolId,
            deletedAt: null,
            section: {
              is: {
                schoolId,
                deletedAt: null,
                grade: {
                  is: {
                    schoolId,
                    deletedAt: null,
                    stage: {
                      is: { schoolId, deletedAt: null },
                    },
                  },
                },
              },
            },
          },
        },
        curriculum: {
          is: {
            schoolId,
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
        schoolId,
        academicYearId: scope.academicYearId,
        termId: scope.termId,
        status: CurriculumStatus.ACTIVE,
        deletedAt: null,
      },
    },
    unit: { is: { schoolId, deletedAt: null } },
    lesson: { is: { schoolId, deletedAt: null } },
  };
}

async function lockParentPlaybackAuthorization(
  transaction: Prisma.TransactionClient,
  context: ParentAppContext,
  child: ParentAppAccessibleChild,
  candidate: LessonContentPlaybackCandidate,
): Promise<boolean> {
  const users = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "users"
    WHERE "id" = ${context.parentUserId}::uuid
      AND "user_type" = ${UserType.PARENT}::user_type
      AND "status" = ${UserStatus.ACTIVE}::user_status
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (users.length !== 1) return false;

  const memberships = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "memberships"
      WHERE "id" = ${context.membershipId}::uuid
        AND "user_id" = ${context.parentUserId}::uuid
        AND "organization_id" = ${context.organizationId}::uuid
        AND "school_id" = ${context.schoolId}::uuid
        AND "role_id" = ${context.roleId}::uuid
        AND "user_type" = ${UserType.PARENT}::user_type
        AND "status" = ${MembershipStatus.ACTIVE}::membership_status
        AND "ended_at" IS NULL
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (memberships.length !== 1) return false;

  const guardians = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "guardians"
      WHERE "user_id" = ${context.parentUserId}::uuid
        AND "organization_id" = ${context.organizationId}::uuid
        AND "school_id" = ${context.schoolId}::uuid
        AND "deleted_at" IS NULL
      ORDER BY "id" ASC
      FOR SHARE
    `,
  );
  if (guardians.length === 0) return false;

  const guardianIds = guardians.map(
    (guardian) => Prisma.sql`${guardian.id}::uuid`,
  );
  const links = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "student_guardian_links"
      WHERE "school_id" = ${context.schoolId}::uuid
        AND "student_id" = ${child.studentId}::uuid
        AND "guardian_id" IN (${Prisma.join(guardianIds)})
      ORDER BY "id" ASC
      FOR SHARE
    `,
  );
  if (links.length === 0) return false;

  const students = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "students"
      WHERE "id" = ${child.studentId}::uuid
        AND "school_id" = ${context.schoolId}::uuid
        AND "organization_id" = ${context.organizationId}::uuid
        AND "status" = ${StudentStatus.ACTIVE}::student_status
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (students.length !== 1) return false;

  const enrollments = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "student_enrollments"
      WHERE "id" = ${child.enrollmentId}::uuid
        AND "student_id" = ${child.studentId}::uuid
        AND "school_id" = ${context.schoolId}::uuid
        AND "classroom_id" = ${child.classroomId}::uuid
        AND "academic_year_id" = ${child.academicYearId}::uuid
        AND "term_id" = ${child.termId}::uuid
        AND "status" = ${StudentEnrollmentStatus.ACTIVE}::student_enrollment_status
        AND "ended_at" IS NULL
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (enrollments.length !== 1) return false;

  return lockParentLessonGraph(transaction, context.schoolId, child, candidate);
}

async function lockParentLessonGraph(
  transaction: Prisma.TransactionClient,
  schoolId: string,
  child: ParentAppAccessibleChild,
  candidate: LessonContentPlaybackCandidate,
): Promise<boolean> {
  const terms = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "terms"
    WHERE "id" = ${child.termId}::uuid
      AND "school_id" = ${schoolId}::uuid
      AND "academic_year_id" = ${child.academicYearId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (terms.length !== 1) return false;

  const stages = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "stages"
    WHERE "id" = ${candidate.stageId}::uuid
      AND "school_id" = ${schoolId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (stages.length !== 1) return false;

  const grades = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "grades"
    WHERE "id" = ${candidate.gradeId}::uuid
      AND "school_id" = ${schoolId}::uuid
      AND "stage_id" = ${candidate.stageId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (grades.length !== 1) return false;

  const sections = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id" FROM "sections"
      WHERE "id" = ${candidate.sectionId}::uuid
        AND "school_id" = ${schoolId}::uuid
        AND "grade_id" = ${candidate.gradeId}::uuid
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (sections.length !== 1) return false;

  const classrooms = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id" FROM "classrooms"
      WHERE "id" = ${candidate.classroomId}::uuid
        AND "id" = ${child.classroomId}::uuid
        AND "school_id" = ${schoolId}::uuid
        AND "section_id" = ${candidate.sectionId}::uuid
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (classrooms.length !== 1) return false;

  const subjects = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id" FROM "subjects"
      WHERE "id" = ${candidate.subjectId}::uuid
        AND "school_id" = ${schoolId}::uuid
        AND "is_active" = true
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (subjects.length !== 1) return false;

  const items = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "lesson_plan_items"
    WHERE "id" = ${candidate.lessonPlanItemId}::uuid
      AND "lesson_plan_id" = ${candidate.lessonPlanId}::uuid
      AND "school_id" = ${schoolId}::uuid
      AND "curriculum_id" = ${candidate.curriculumId}::uuid
      AND "unit_id" = ${candidate.unitId}::uuid
      AND "lesson_id" = ${candidate.lessonId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (items.length !== 1) return false;

  const plans = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id" FROM "lesson_plans"
      WHERE "id" = ${candidate.lessonPlanId}::uuid
        AND "school_id" = ${schoolId}::uuid
        AND "academic_year_id" = ${child.academicYearId}::uuid
        AND "term_id" = ${child.termId}::uuid
        AND "classroom_id" = ${child.classroomId}::uuid
        AND "subject_id" = ${candidate.subjectId}::uuid
        AND "curriculum_id" = ${candidate.curriculumId}::uuid
        AND "status" = ${LessonPlanStatus.ACTIVE}::lesson_plan_status
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );

  return plans.length === 1;
}
