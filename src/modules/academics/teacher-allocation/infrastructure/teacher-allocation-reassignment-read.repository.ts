import { Injectable } from '@nestjs/common';
import { Prisma, ReinforcementSource } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE } from '../../../communication/domain/teacher-app-announcement-metadata';

const REASSIGNMENT_ALLOCATION_SELECT =
  Prisma.validator<Prisma.TeacherSubjectAllocationSelect>()({
    id: true,
    schoolId: true,
    teacherUserId: true,
    subjectId: true,
    classroomId: true,
    termId: true,
    createdAt: true,
    updatedAt: true,
    teacherUser: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    },
    term: {
      select: {
        id: true,
        schoolId: true,
        nameAr: true,
        nameEn: true,
        startDate: true,
        endDate: true,
        isActive: true,
        deletedAt: true,
        academicYearId: true,
        academicYear: {
          select: {
            isActive: true,
            deletedAt: true,
          },
        },
      },
    },
  });

const REASSIGNMENT_TARGET_SELECT = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  firstName: true,
  lastName: true,
  userType: true,
  status: true,
  deletedAt: true,
  updatedAt: true,
  memberships: {
    select: {
      id: true,
      userId: true,
      organizationId: true,
      schoolId: true,
      roleId: true,
      userType: true,
      status: true,
      startedAt: true,
      endedAt: true,
      deletedAt: true,
      updatedAt: true,
      role: {
        select: {
          id: true,
          key: true,
          schoolId: true,
          deletedAt: true,
        },
      },
    },
  },
  teacherProfiles: {
    select: {
      id: true,
      schoolId: true,
      userId: true,
      teacherCode: true,
      firstNameAr: true,
      lastNameAr: true,
      firstNameEn: true,
      lastNameEn: true,
      gender: true,
      employmentStatus: true,
      deletedAt: true,
      updatedAt: true,
    },
  },
});

const REASSIGNMENT_TIMETABLE_SELECT =
  Prisma.validator<Prisma.TimetableEntrySelect>()({
    id: true,
    schoolId: true,
    termId: true,
    timetableConfigId: true,
    teacherSubjectAllocationId: true,
    classroomId: true,
    teacherUserId: true,
    roomId: true,
    dayOfWeek: true,
    periodId: true,
    status: true,
    updatedAt: true,
    period: {
      select: {
        startTime: true,
        endTime: true,
        updatedAt: true,
      },
    },
    timetableConfig: {
      select: {
        status: true,
        updatedAt: true,
        publications: {
          select: {
            id: true,
            status: true,
            revision: true,
            publishedAt: true,
            updatedAt: true,
          },
        },
      },
    },
  });

const REASSIGNMENT_LESSON_PLAN_SELECT =
  Prisma.validator<Prisma.LessonPlanSelect>()({
    id: true,
    status: true,
    teacherUserId: true,
    createdByUserId: true,
    updatedByUserId: true,
    updatedAt: true,
  });

const REASSIGNMENT_HOMEWORK_SELECT =
  Prisma.validator<Prisma.HomeworkAssignmentSelect>()({
    id: true,
    status: true,
    teacherUserId: true,
    createdByUserId: true,
    publishedByUserId: true,
    updatedAt: true,
  });

const REASSIGNMENT_REINFORCEMENT_SELECT =
  Prisma.validator<Prisma.ReinforcementTaskSelect>()({
    id: true,
    academicYearId: true,
    termId: true,
    subjectId: true,
    assignedById: true,
    createdById: true,
    status: true,
    updatedAt: true,
    assignments: {
      select: {
        id: true,
        status: true,
        updatedAt: true,
        enrollment: {
          select: {
            academicYearId: true,
            termId: true,
            classroomId: true,
            status: true,
            deletedAt: true,
            updatedAt: true,
            student: {
              select: {
                status: true,
                deletedAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    },
  });

const REASSIGNMENT_ANNOUNCEMENT_SELECT =
  Prisma.validator<Prisma.CommunicationAnnouncementSelect>()({
    id: true,
    status: true,
    createdById: true,
    metadata: true,
    updatedAt: true,
  });

export type ReassignmentAllocationRecord =
  Prisma.TeacherSubjectAllocationGetPayload<{
    select: typeof REASSIGNMENT_ALLOCATION_SELECT;
  }>;
export type ReassignmentTargetRecord = Prisma.UserGetPayload<{
  select: typeof REASSIGNMENT_TARGET_SELECT;
}>;
export type ReassignmentTimetableRecord = Prisma.TimetableEntryGetPayload<{
  select: typeof REASSIGNMENT_TIMETABLE_SELECT;
}>;
export type ReassignmentLessonPlanRecord = Prisma.LessonPlanGetPayload<{
  select: typeof REASSIGNMENT_LESSON_PLAN_SELECT;
}>;
export type ReassignmentHomeworkRecord = Prisma.HomeworkAssignmentGetPayload<{
  select: typeof REASSIGNMENT_HOMEWORK_SELECT;
}>;
export type ReassignmentReinforcementRecord =
  Prisma.ReinforcementTaskGetPayload<{
    select: typeof REASSIGNMENT_REINFORCEMENT_SELECT;
  }>;
export type ReassignmentAnnouncementRecord =
  Prisma.CommunicationAnnouncementGetPayload<{
    select: typeof REASSIGNMENT_ANNOUNCEMENT_SELECT;
  }>;

export interface TeacherAllocationReassignmentSnapshot {
  allocation: ReassignmentAllocationRecord;
  target: ReassignmentTargetRecord | null;
  duplicateTargetAllocationId: string | null;
  timetableEntries: ReassignmentTimetableRecord[];
  lessonPlans: ReassignmentLessonPlanRecord[];
  homeworkAssignments: ReassignmentHomeworkRecord[];
  reinforcementTasks: ReassignmentReinforcementRecord[];
  announcements: ReassignmentAnnouncementRecord[];
}

@Injectable()
export class TeacherAllocationReassignmentReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  loadSnapshot(input: {
    schoolId: string;
    allocationId: string;
    newTeacherUserId: string;
  }): Promise<TeacherAllocationReassignmentSnapshot | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const allocation = await tx.teacherSubjectAllocation.findFirst({
          where: {
            id: input.allocationId,
            schoolId: input.schoolId,
          },
          select: REASSIGNMENT_ALLOCATION_SELECT,
        });
        if (!allocation) return null;

        const target = await tx.user.findFirst({
          where: {
            id: input.newTeacherUserId,
            memberships: {
              some: {
                schoolId: input.schoolId,
              },
            },
          },
          select: {
            ...REASSIGNMENT_TARGET_SELECT,
            memberships: {
              where: { schoolId: input.schoolId },
              ...REASSIGNMENT_TARGET_SELECT.memberships,
            },
            teacherProfiles: {
              where: { schoolId: input.schoolId },
              ...REASSIGNMENT_TARGET_SELECT.teacherProfiles,
            },
          },
        });

        const [
          duplicateTargetAllocation,
          timetableEntries,
          lessonPlans,
          homeworkAssignments,
          reinforcementTasks,
          announcements,
        ] = await Promise.all([
          tx.teacherSubjectAllocation.findFirst({
            where: {
              schoolId: input.schoolId,
              id: { not: allocation.id },
              teacherUserId: input.newTeacherUserId,
              subjectId: allocation.subjectId,
              classroomId: allocation.classroomId,
              termId: allocation.termId,
            },
            select: { id: true },
          }),
          tx.timetableEntry.findMany({
            where: {
              schoolId: input.schoolId,
              termId: allocation.termId,
              OR: [
                { teacherSubjectAllocationId: allocation.id },
                { teacherUserId: input.newTeacherUserId },
              ],
            },
            select: REASSIGNMENT_TIMETABLE_SELECT,
          }),
          tx.lessonPlan.findMany({
            where: {
              schoolId: input.schoolId,
              teacherSubjectAllocationId: allocation.id,
              deletedAt: null,
            },
            select: REASSIGNMENT_LESSON_PLAN_SELECT,
          }),
          tx.homeworkAssignment.findMany({
            where: {
              schoolId: input.schoolId,
              teacherSubjectAllocationId: allocation.id,
              deletedAt: null,
            },
            select: REASSIGNMENT_HOMEWORK_SELECT,
          }),
          tx.reinforcementTask.findMany({
            where: {
              schoolId: input.schoolId,
              deletedAt: null,
              source: ReinforcementSource.TEACHER,
              academicYearId: allocation.term.academicYearId,
              termId: allocation.termId,
              OR: [
                { assignedById: allocation.teacherUserId },
                { createdById: allocation.teacherUserId },
              ],
              AND: [
                {
                  OR: [
                    { subjectId: allocation.subjectId },
                    { subjectId: null },
                  ],
                },
                {
                  assignments: {
                    some: {
                      enrollment: {
                        is: {
                          academicYearId: allocation.term.academicYearId,
                          termId: allocation.termId,
                          classroomId: allocation.classroomId,
                          status: 'ACTIVE',
                          deletedAt: null,
                          student: {
                            is: {
                              status: 'ACTIVE',
                              deletedAt: null,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
            select: REASSIGNMENT_REINFORCEMENT_SELECT,
          }),
          tx.communicationAnnouncement.findMany({
            where: {
              schoolId: input.schoolId,
              createdById: allocation.teacherUserId,
              metadata: {
                path: ['teacherApp', 'source'],
                equals: TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE,
              },
            },
            select: REASSIGNMENT_ANNOUNCEMENT_SELECT,
          }),
        ]);

        return {
          allocation,
          target,
          duplicateTargetAllocationId: duplicateTargetAllocation?.id ?? null,
          timetableEntries,
          lessonPlans,
          homeworkAssignments,
          reinforcementTasks,
          announcements,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5_000,
        timeout: 30_000,
      },
    );
  }
}
