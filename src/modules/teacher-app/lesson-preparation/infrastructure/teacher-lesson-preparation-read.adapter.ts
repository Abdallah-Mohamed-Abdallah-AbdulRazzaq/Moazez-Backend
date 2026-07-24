import { Injectable } from '@nestjs/common';
import {
  CurriculumStatus,
  LessonContentPublicationStatus,
  LessonPlanItemStatus,
  LessonPlanStatus,
  MembershipStatus,
  Prisma,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { LessonContentPlaybackCoordinator } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.coordinator';
import type { LessonContentPlaybackResponseDto } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback-response.dto';
import type { LessonContentPlaybackCandidate } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.types';
import type { TeacherAppContext } from '../../shared/teacher-app-context';

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
              publicationStatus: {
                in: [
                  LessonContentPublicationStatus.DRAFT,
                  LessonContentPublicationStatus.PUBLISHED,
                ],
              },
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly playbackCoordinator: LessonContentPlaybackCoordinator,
  ) {}

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

  getLessonContentPlayback(params: {
    context: TeacherAppContext;
    lessonPlanItemId: string;
    contentItemId: string;
  }): Promise<LessonContentPlaybackResponseDto | null> {
    return this.playbackCoordinator.execute({
      schoolId: params.context.schoolId,
      organizationId: params.context.organizationId,
      lessonPlanItemId: params.lessonPlanItemId,
      contentItemId: params.contentItemId,
      visibilityWhere: teacherPlaybackWhere(params.context),
      policy: {
        curriculum: 'NOT_ARCHIVED',
        content: 'DRAFT_OR_PUBLISHED',
      },
      lockAuthorization: (transaction, candidate) =>
        lockTeacherPlaybackAuthorization(
          transaction,
          params.context,
          candidate,
        ),
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

function teacherPlaybackWhere(
  context: TeacherAppContext,
): Prisma.LessonPlanItemWhereInput {
  return {
    schoolId: context.schoolId,
    deletedAt: null,
    lessonPlan: {
      is: {
        schoolId: context.schoolId,
        teacherUserId: context.teacherUserId,
        status: { not: LessonPlanStatus.ARCHIVED },
        deletedAt: null,
        term: {
          is: { schoolId: context.schoolId, deletedAt: null },
        },
        subject: {
          is: {
            schoolId: context.schoolId,
            deletedAt: null,
            isActive: true,
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
                      is: { schoolId: context.schoolId, deletedAt: null },
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
            status: { not: CurriculumStatus.ARCHIVED },
            deletedAt: null,
          },
        },
        teacherSubjectAllocation: {
          is: {
            schoolId: context.schoolId,
            teacherUserId: context.teacherUserId,
            teacherUser: {
              is: {
                id: context.teacherUserId,
                userType: UserType.TEACHER,
                status: UserStatus.ACTIVE,
                deletedAt: null,
              },
            },
            subject: {
              is: {
                schoolId: context.schoolId,
                deletedAt: null,
                isActive: true,
              },
            },
            classroom: {
              is: { schoolId: context.schoolId, deletedAt: null },
            },
            term: {
              is: { schoolId: context.schoolId, deletedAt: null },
            },
          },
        },
      },
    },
    curriculum: {
      is: {
        schoolId: context.schoolId,
        status: { not: CurriculumStatus.ARCHIVED },
        deletedAt: null,
      },
    },
    unit: { is: { schoolId: context.schoolId, deletedAt: null } },
    lesson: { is: { schoolId: context.schoolId, deletedAt: null } },
  };
}

async function lockTeacherPlaybackAuthorization(
  transaction: Prisma.TransactionClient,
  context: TeacherAppContext,
  candidate: LessonContentPlaybackCandidate,
): Promise<boolean> {
  const users = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "users"
    WHERE "id" = ${context.teacherUserId}::uuid
      AND "user_type" = ${UserType.TEACHER}::user_type
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
        AND "user_id" = ${context.teacherUserId}::uuid
        AND "organization_id" = ${context.organizationId}::uuid
        AND "school_id" = ${context.schoolId}::uuid
        AND "role_id" = ${context.roleId}::uuid
        AND "user_type" = ${UserType.TEACHER}::user_type
        AND "status" = ${MembershipStatus.ACTIVE}::membership_status
        AND "ended_at" IS NULL
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (memberships.length !== 1) return false;

  const allocations = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "teacher_subject_allocations"
      WHERE "id" = ${candidate.teacherSubjectAllocationId}::uuid
        AND "teacher_user_id" = ${context.teacherUserId}::uuid
        AND "school_id" = ${context.schoolId}::uuid
        AND "subject_id" = ${candidate.subjectId}::uuid
        AND "classroom_id" = ${candidate.classroomId}::uuid
        AND "term_id" = ${candidate.termId}::uuid
      FOR SHARE
    `,
  );
  if (allocations.length !== 1) return false;

  const terms = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "terms"
    WHERE "id" = ${candidate.termId}::uuid
      AND "school_id" = ${context.schoolId}::uuid
      AND "academic_year_id" = ${candidate.academicYearId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (terms.length !== 1) return false;

  const stages = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "stages"
    WHERE "id" = ${candidate.stageId}::uuid
      AND "school_id" = ${context.schoolId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (stages.length !== 1) return false;

  const grades = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "grades"
    WHERE "id" = ${candidate.gradeId}::uuid
      AND "school_id" = ${context.schoolId}::uuid
      AND "stage_id" = ${candidate.stageId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (grades.length !== 1) return false;

  const sections = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id" FROM "sections"
      WHERE "id" = ${candidate.sectionId}::uuid
        AND "school_id" = ${context.schoolId}::uuid
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
        AND "school_id" = ${context.schoolId}::uuid
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
        AND "school_id" = ${context.schoolId}::uuid
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
      AND "school_id" = ${context.schoolId}::uuid
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
        AND "school_id" = ${context.schoolId}::uuid
        AND "academic_year_id" = ${candidate.academicYearId}::uuid
        AND "term_id" = ${candidate.termId}::uuid
        AND "teacher_subject_allocation_id" =
          ${candidate.teacherSubjectAllocationId}::uuid
        AND "teacher_user_id" = ${context.teacherUserId}::uuid
        AND "classroom_id" = ${candidate.classroomId}::uuid
        AND "subject_id" = ${candidate.subjectId}::uuid
        AND "curriculum_id" = ${candidate.curriculumId}::uuid
        AND "status" <> ${LessonPlanStatus.ARCHIVED}::lesson_plan_status
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );

  return plans.length === 1;
}
