import { Injectable } from '@nestjs/common';
import {
  CurriculumStatus,
  FileUploadPurpose,
  FileUploadSessionStatus,
  LessonContentItemType,
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

export type StudentLessonItemRecord = Prisma.LessonPlanItemGetPayload<
  typeof STUDENT_LESSON_ITEM_ARGS
>;

export type StudentLessonPlayableContentRecord = {
  bucket: string;
  objectKey: string;
  mimeType: 'video/mp4' | 'video/webm';
  sizeBytes: bigint;
};

type StudentLessonPlayableContentCandidate = {
  lessonPlanItemId: string;
  lessonPlanId: string;
  subjectId: string;
  classroomId: string;
  sectionId: string;
  gradeId: string;
  stageId: string;
  curriculumId: string;
  unitId: string;
  lessonId: string;
  contentItemId: string;
  fileId: string;
  uploadSessionId: string;
  record: StudentLessonPlayableContentRecord;
};

type LessonPlanItemReader = Pick<Prisma.TransactionClient, 'lessonPlanItem'>;

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

  async findPlayableLessonContent(params: {
    context: StudentAppContext;
    lessonPlanItemId: string;
    contentItemId: string;
  }): Promise<StudentLessonPlayableContentRecord | null> {
    return this.withPlayableLessonContent(params, (playable) =>
      Promise.resolve(playable),
    );
  }

  async withPlayableLessonContent<T>(
    params: {
      context: StudentAppContext;
      lessonPlanItemId: string;
      contentItemId: string;
    },
    operation: (playable: StudentLessonPlayableContentRecord) => Promise<T>,
  ): Promise<T | null> {
    const scope = buildStudentLessonScope(params.context);
    if (!scope) return null;

    const candidate = await this.findPlayableCandidate(
      this.scopedPrisma,
      scope,
      params.context.organizationId,
      params.lessonPlanItemId,
      params.contentItemId,
    );
    if (!candidate) return null;

    return this.prisma.$transaction(
      async (transaction) => {
        const authorized = await lockStudentPlaybackAuthorization(
          transaction,
          params.context,
          scope,
          candidate,
        );
        if (!authorized) return null;

        const locked = await lockPlayableCandidate(
          transaction,
          scope,
          params.context.organizationId,
          candidate,
        );
        if (!locked) return null;

        const revalidated = await this.findPlayableCandidate(
          transaction,
          scope,
          params.context.organizationId,
          params.lessonPlanItemId,
          params.contentItemId,
        );
        if (!revalidated || !samePlayableCandidate(candidate, revalidated)) {
          return null;
        }

        return operation(revalidated.record);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  }

  private async findPlayableCandidate(
    client: LessonPlanItemReader,
    scope: StudentLessonScope,
    organizationId: string,
    lessonPlanItemId: string,
    contentItemId: string,
  ): Promise<StudentLessonPlayableContentCandidate | null> {
    const item = await client.lessonPlanItem.findFirst({
      where: {
        id: lessonPlanItemId,
        ...visibleStudentLessonWhere(scope),
        lesson: {
          is: {
            schoolId: scope.schoolId,
            deletedAt: null,
            contentItems: {
              some: visiblePlayableContentWhere({
                schoolId: scope.schoolId,
                organizationId,
                contentItemId,
              }),
            },
          },
        },
      },
      select: {
        id: true,
        lessonPlanId: true,
        curriculumId: true,
        unitId: true,
        lessonId: true,
        lessonPlan: {
          select: {
            id: true,
            subjectId: true,
            classroomId: true,
            classroom: {
              select: {
                sectionId: true,
                section: {
                  select: {
                    gradeId: true,
                    grade: {
                      select: {
                        stageId: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        lesson: {
          select: {
            contentItems: {
              where: visiblePlayableContentWhere({
                schoolId: scope.schoolId,
                organizationId,
                contentItemId,
              }),
              take: 1,
              select: {
                id: true,
                curriculumId: true,
                unitId: true,
                lessonId: true,
                fileId: true,
                file: {
                  select: {
                    id: true,
                    bucket: true,
                    objectKey: true,
                    mimeType: true,
                    sizeBytes: true,
                    schoolId: true,
                    organizationId: true,
                    uploadSession: {
                      select: {
                        id: true,
                        purpose: true,
                        status: true,
                        fileId: true,
                        schoolId: true,
                        organizationId: true,
                        finalBucket: true,
                        finalObjectKey: true,
                        finalCleanupClaimedAt: true,
                        finalObjectDeletedAt: true,
                        verifiedMimeType: true,
                        actualSizeBytes: true,
                        durationSeconds: true,
                        width: true,
                        height: true,
                        verifiedAt: true,
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

    const contentItem = item?.lesson.contentItems[0];
    const file = contentItem?.file;
    const session = file?.uploadSession;
    if (!item || !contentItem || !file || !session || !contentItem.fileId) {
      return null;
    }

    if (
      contentItem.curriculumId !== item.curriculumId ||
      contentItem.unitId !== item.unitId ||
      contentItem.lessonId !== item.lessonId ||
      contentItem.fileId !== file.id ||
      file.schoolId !== scope.schoolId ||
      file.organizationId !== organizationId ||
      session.schoolId !== scope.schoolId ||
      session.organizationId !== organizationId ||
      session.fileId !== file.id ||
      session.purpose !== FileUploadPurpose.LESSON_CONTENT ||
      session.status !== FileUploadSessionStatus.READY ||
      session.finalCleanupClaimedAt ||
      session.finalObjectDeletedAt ||
      session.finalBucket !== file.bucket ||
      session.finalObjectKey !== file.objectKey ||
      session.verifiedMimeType !== file.mimeType ||
      session.actualSizeBytes !== file.sizeBytes ||
      !session.verifiedAt ||
      !session.durationSeconds ||
      !session.width ||
      !session.height ||
      !isPlayableVideoMime(file.mimeType)
    ) {
      return null;
    }

    return {
      lessonPlanItemId: item.id,
      lessonPlanId: item.lessonPlan.id,
      subjectId: item.lessonPlan.subjectId,
      classroomId: item.lessonPlan.classroomId,
      sectionId: item.lessonPlan.classroom.sectionId,
      gradeId: item.lessonPlan.classroom.section.gradeId,
      stageId: item.lessonPlan.classroom.section.grade.stageId,
      curriculumId: item.curriculumId,
      unitId: item.unitId,
      lessonId: item.lessonId,
      contentItemId: contentItem.id,
      fileId: file.id,
      uploadSessionId: session.id,
      record: {
        bucket: file.bucket,
        objectKey: file.objectKey,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      },
    };
  }
}

async function lockStudentPlaybackAuthorization(
  transaction: Prisma.TransactionClient,
  context: StudentAppContext,
  scope: StudentLessonScope,
  candidate: StudentLessonPlayableContentCandidate,
): Promise<boolean> {
  const users = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "users"
    WHERE "id" = ${context.studentUserId}::uuid
      AND "user_type" = ${UserType.STUDENT}::user_type
      AND "status" = ${UserStatus.ACTIVE}::user_status
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (users.length !== 1) return false;

  const students = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "students"
      WHERE "id" = ${context.studentId}::uuid
        AND "user_id" = ${context.studentUserId}::uuid
        AND "school_id" = ${scope.schoolId}::uuid
        AND "organization_id" = ${context.organizationId}::uuid
        AND "status" = ${StudentStatus.ACTIVE}::student_status
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (students.length !== 1) return false;

  const memberships = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "memberships"
      WHERE "id" = ${context.membershipId}::uuid
        AND "user_id" = ${context.studentUserId}::uuid
        AND "organization_id" = ${context.organizationId}::uuid
        AND "school_id" = ${scope.schoolId}::uuid
        AND "role_id" = ${context.roleId}::uuid
        AND "user_type" = ${UserType.STUDENT}::user_type
        AND "status" = ${MembershipStatus.ACTIVE}::membership_status
        AND "ended_at" IS NULL
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (memberships.length !== 1) return false;

  const enrollments = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "student_enrollments"
      WHERE "id" = ${context.enrollmentId}::uuid
        AND "student_id" = ${context.studentId}::uuid
        AND "school_id" = ${scope.schoolId}::uuid
        AND "classroom_id" = ${scope.classroomId}::uuid
        AND "academic_year_id" = ${scope.academicYearId}::uuid
        AND "term_id" = ${scope.termId}::uuid
        AND "status" = ${StudentEnrollmentStatus.ACTIVE}::student_enrollment_status
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (enrollments.length !== 1) return false;

  const terms = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "terms"
    WHERE "id" = ${scope.termId}::uuid
      AND "school_id" = ${scope.schoolId}::uuid
      AND "academic_year_id" = ${scope.academicYearId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (terms.length !== 1) return false;

  const stages = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "stages"
    WHERE "id" = ${candidate.stageId}::uuid
      AND "school_id" = ${scope.schoolId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (stages.length !== 1) return false;

  const grades = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "grades"
    WHERE "id" = ${candidate.gradeId}::uuid
      AND "school_id" = ${scope.schoolId}::uuid
      AND "stage_id" = ${candidate.stageId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (grades.length !== 1) return false;

  const sections = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "sections"
      WHERE "id" = ${candidate.sectionId}::uuid
        AND "school_id" = ${scope.schoolId}::uuid
        AND "grade_id" = ${candidate.gradeId}::uuid
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (sections.length !== 1) return false;

  const classrooms = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "classrooms"
      WHERE "id" = ${candidate.classroomId}::uuid
        AND "id" = ${scope.classroomId}::uuid
        AND "school_id" = ${scope.schoolId}::uuid
        AND "section_id" = ${candidate.sectionId}::uuid
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (classrooms.length !== 1) return false;

  const subjects = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "subjects"
      WHERE "id" = ${candidate.subjectId}::uuid
        AND "school_id" = ${scope.schoolId}::uuid
        AND "is_active" = true
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (subjects.length !== 1) return false;

  // LessonPlan soft deletion writes items before the plan. Retaining that
  // order here avoids a plan/item lock inversion while still protecting both.
  const items = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "lesson_plan_items"
    WHERE "id" = ${candidate.lessonPlanItemId}::uuid
      AND "lesson_plan_id" = ${candidate.lessonPlanId}::uuid
      AND "school_id" = ${scope.schoolId}::uuid
      AND "curriculum_id" = ${candidate.curriculumId}::uuid
      AND "unit_id" = ${candidate.unitId}::uuid
      AND "lesson_id" = ${candidate.lessonId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (items.length !== 1) return false;

  const lessonPlans = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "lesson_plans"
      WHERE "id" = ${candidate.lessonPlanId}::uuid
        AND "school_id" = ${scope.schoolId}::uuid
        AND "academic_year_id" = ${scope.academicYearId}::uuid
        AND "term_id" = ${scope.termId}::uuid
        AND "classroom_id" = ${scope.classroomId}::uuid
        AND "subject_id" = ${candidate.subjectId}::uuid
        AND "curriculum_id" = ${candidate.curriculumId}::uuid
        AND "status" = ${LessonPlanStatus.ACTIVE}::lesson_plan_status
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );

  return lessonPlans.length === 1;
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

function visiblePlayableContentWhere(params: {
  schoolId: string;
  organizationId: string;
  contentItemId: string;
}): Prisma.LessonContentItemWhereInput {
  return {
    id: params.contentItemId,
    schoolId: params.schoolId,
    deletedAt: null,
    publicationStatus: LessonContentPublicationStatus.PUBLISHED,
    type: LessonContentItemType.FILE,
    file: {
      is: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        deletedAt: null,
        uploadSession: {
          is: {
            schoolId: params.schoolId,
            organizationId: params.organizationId,
            purpose: FileUploadPurpose.LESSON_CONTENT,
            status: FileUploadSessionStatus.READY,
            finalCleanupClaimedAt: null,
            finalObjectDeletedAt: null,
            verifiedAt: { not: null },
            verifiedMimeType: { in: ['video/mp4', 'video/webm'] },
            actualSizeBytes: { not: null },
            durationSeconds: { not: null },
            width: { not: null },
            height: { not: null },
          },
        },
      },
    },
  };
}

async function lockPlayableCandidate(
  transaction: Prisma.TransactionClient,
  scope: StudentLessonScope,
  organizationId: string,
  candidate: StudentLessonPlayableContentCandidate,
): Promise<boolean> {
  const hierarchy = await transaction.$queryRaw<Array<{ lessonId: string }>>(
    Prisma.sql`
      SELECT lesson."id" AS "lessonId"
      FROM "curricula" AS curriculum
      INNER JOIN "curriculum_units" AS unit
        ON unit."id" = ${candidate.unitId}::uuid
        AND unit."school_id" = curriculum."school_id"
        AND unit."curriculum_id" = curriculum."id"
        AND unit."deleted_at" IS NULL
      INNER JOIN "curriculum_lessons" AS lesson
        ON lesson."id" = ${candidate.lessonId}::uuid
        AND lesson."school_id" = curriculum."school_id"
        AND lesson."curriculum_id" = curriculum."id"
        AND lesson."unit_id" = unit."id"
        AND lesson."deleted_at" IS NULL
      WHERE curriculum."id" = ${candidate.curriculumId}::uuid
        AND curriculum."school_id" = ${scope.schoolId}::uuid
        AND curriculum."academic_year_id" = ${scope.academicYearId}::uuid
        AND curriculum."term_id" = ${scope.termId}::uuid
        AND curriculum."status" = 'ACTIVE'
        AND curriculum."deleted_at" IS NULL
      FOR SHARE OF curriculum, unit, lesson
    `,
  );
  if (hierarchy.length !== 1) return false;

  const uploadSessions = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "file_upload_sessions"
      WHERE "id" = ${candidate.uploadSessionId}::uuid
        AND "file_id" = ${candidate.fileId}::uuid
        AND "school_id" = ${scope.schoolId}::uuid
        AND "organization_id" = ${organizationId}::uuid
        AND "purpose" = 'LESSON_CONTENT'
        AND "status" = 'READY'
        AND "final_cleanup_claimed_at" IS NULL
        AND "final_object_deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (uploadSessions.length !== 1) return false;

  const files = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "files"
    WHERE "id" = ${candidate.fileId}::uuid
      AND "school_id" = ${scope.schoolId}::uuid
      AND "organization_id" = ${organizationId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (files.length !== 1) return false;

  const contentItems = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "lesson_content_items"
      WHERE "id" = ${candidate.contentItemId}::uuid
        AND "school_id" = ${scope.schoolId}::uuid
        AND "curriculum_id" = ${candidate.curriculumId}::uuid
        AND "unit_id" = ${candidate.unitId}::uuid
        AND "lesson_id" = ${candidate.lessonId}::uuid
        AND "file_id" = ${candidate.fileId}::uuid
        AND "type" = 'FILE'
        AND "publication_status" = 'PUBLISHED'
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );

  return contentItems.length === 1;
}

function samePlayableCandidate(
  before: StudentLessonPlayableContentCandidate,
  after: StudentLessonPlayableContentCandidate,
): boolean {
  return (
    before.lessonPlanItemId === after.lessonPlanItemId &&
    before.lessonPlanId === after.lessonPlanId &&
    before.subjectId === after.subjectId &&
    before.classroomId === after.classroomId &&
    before.sectionId === after.sectionId &&
    before.gradeId === after.gradeId &&
    before.stageId === after.stageId &&
    before.curriculumId === after.curriculumId &&
    before.unitId === after.unitId &&
    before.lessonId === after.lessonId &&
    before.contentItemId === after.contentItemId &&
    before.fileId === after.fileId &&
    before.uploadSessionId === after.uploadSessionId &&
    before.record.bucket === after.record.bucket &&
    before.record.objectKey === after.record.objectKey &&
    before.record.mimeType === after.record.mimeType &&
    before.record.sizeBytes === after.record.sizeBytes
  );
}

function isPlayableVideoMime(
  value: string,
): value is 'video/mp4' | 'video/webm' {
  return value === 'video/mp4' || value === 'video/webm';
}
