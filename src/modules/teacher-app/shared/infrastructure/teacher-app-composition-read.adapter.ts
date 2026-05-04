import { Injectable } from '@nestjs/common';
import {
  GradeAssessmentType,
  GradeSubmissionStatus,
  Prisma,
  ReinforcementSource,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { TeacherAppContext } from '../teacher-app-context';
import type { TeacherAppAllocationRecord } from '../teacher-app.types';

const TEACHER_APP_TEACHER_IDENTITY_ARGS =
  Prisma.validator<Prisma.UserDefaultArgs>()({
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      userType: true,
      status: true,
    },
  });

export type TeacherAppTeacherIdentityRecord = Prisma.UserGetPayload<
  typeof TEACHER_APP_TEACHER_IDENTITY_ARGS
>;

export interface TeacherAppSchoolSummaryRecord {
  name: string | null;
  logoUrl: null;
}

export interface TeacherAppClassMetricRecord {
  studentsCount: number;
  activeAssignmentsCount: number | null;
  pendingReviewCount: number | null;
  followUpCount: number | null;
  pendingAttendanceCount: number | null;
  todayAttendanceStatus: string | null;
  lastAttendanceStatus: string | null;
  averageGrade: number | null;
  completionRate: number | null;
}

@Injectable()
export class TeacherAppCompositionReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findTeacherIdentity(
    teacherUserId: string,
  ): Promise<TeacherAppTeacherIdentityRecord | null> {
    return this.scopedPrisma.user.findFirst({
      where: {
        id: teacherUserId,
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      ...TEACHER_APP_TEACHER_IDENTITY_ARGS,
    });
  }

  async findSchoolSummary(
    context: TeacherAppContext,
  ): Promise<TeacherAppSchoolSummaryRecord> {
    const profile = await this.scopedPrisma.schoolProfile.findFirst({
      select: {
        schoolName: true,
        shortName: true,
      },
    });

    if (profile) {
      return {
        name: profile.schoolName ?? profile.shortName,
        logoUrl: null,
      };
    }

    const school = await this.scopedPrisma.school.findFirst({
      where: {
        id: context.schoolId,
        organizationId: context.organizationId,
        deletedAt: null,
      },
      select: { name: true },
    });

    return {
      name: school?.name ?? null,
      logoUrl: null,
    };
  }

  async countActiveStudentsAcrossClassrooms(
    classroomIds: string[],
  ): Promise<number> {
    const uniqueClassroomIds = unique(classroomIds);
    if (uniqueClassroomIds.length === 0) return 0;

    const students = await this.scopedPrisma.enrollment.findMany({
      where: activeEnrollmentWhere(uniqueClassroomIds),
      distinct: ['studentId'],
      select: { studentId: true },
    });

    return students.length;
  }

  async countPendingTeacherTaskAssignments(params: {
    teacherUserId: string;
    classroomIds: string[];
  }): Promise<number> {
    const uniqueClassroomIds = unique(params.classroomIds);
    if (uniqueClassroomIds.length === 0) return 0;

    return this.scopedPrisma.reinforcementAssignment.count({
      where: {
        status: {
          in: [
            ReinforcementTaskStatus.NOT_COMPLETED,
            ReinforcementTaskStatus.IN_PROGRESS,
            ReinforcementTaskStatus.UNDER_REVIEW,
          ],
        },
        enrollment: {
          is: activeEnrollmentWhere(uniqueClassroomIds),
        },
        task: {
          is: {
            source: ReinforcementSource.TEACHER,
            status: {
              notIn: [
                ReinforcementTaskStatus.COMPLETED,
                ReinforcementTaskStatus.CANCELLED,
              ],
            },
            OR: [
              { assignedById: params.teacherUserId },
              { createdById: params.teacherUserId },
            ],
            deletedAt: null,
          },
        },
      },
    });
  }

  async buildClassMetrics(
    allocations: TeacherAppAllocationRecord[],
  ): Promise<Map<string, TeacherAppClassMetricRecord>> {
    const metrics = new Map<string, TeacherAppClassMetricRecord>();
    for (const allocation of allocations) {
      metrics.set(allocation.id, emptyMetric());
    }

    if (allocations.length === 0) return metrics;

    const classroomIds = unique(allocations.map((item) => item.classroomId));
    const subjectIds = unique(allocations.map((item) => item.subjectId));
    const termIds = unique(allocations.map((item) => item.termId));

    const [studentCounts, assignmentRows] = await Promise.all([
      this.countStudentsByClassroom(classroomIds),
      this.listAssignmentMetricRows({
        classroomIds,
        subjectIds,
        termIds,
      }),
    ]);

    const assignmentsByKey = new Map<
      string,
      { activeAssignmentsCount: number; pendingReviewCount: number }
    >();

    for (const row of assignmentRows) {
      if (!row.classroomId) continue;
      const key = allocationMetricKey({
        classroomId: row.classroomId,
        subjectId: row.subjectId,
        termId: row.termId,
      });
      const current = assignmentsByKey.get(key) ?? {
        activeAssignmentsCount: 0,
        pendingReviewCount: 0,
      };
      current.activeAssignmentsCount += 1;
      current.pendingReviewCount += row._count.submissions;
      assignmentsByKey.set(key, current);
    }

    for (const allocation of allocations) {
      const key = allocationMetricKey(allocation);
      const assignmentMetric = assignmentsByKey.get(key);

      metrics.set(allocation.id, {
        ...emptyMetric(),
        studentsCount: studentCounts.get(allocation.classroomId) ?? 0,
        activeAssignmentsCount:
          assignmentMetric?.activeAssignmentsCount ?? 0,
        pendingReviewCount: assignmentMetric?.pendingReviewCount ?? 0,
      });
    }

    return metrics;
  }

  private async countStudentsByClassroom(
    classroomIds: string[],
  ): Promise<Map<string, number>> {
    if (classroomIds.length === 0) return new Map();

    const rows = await this.scopedPrisma.enrollment.groupBy({
      by: ['classroomId'],
      where: activeEnrollmentWhere(classroomIds),
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.classroomId, row._count._all]));
  }

  private listAssignmentMetricRows(params: {
    classroomIds: string[];
    subjectIds: string[];
    termIds: string[];
  }) {
    if (
      params.classroomIds.length === 0 ||
      params.subjectIds.length === 0 ||
      params.termIds.length === 0
    ) {
      return Promise.resolve([]);
    }

    return this.scopedPrisma.gradeAssessment.findMany({
      where: {
        classroomId: { in: params.classroomIds },
        subjectId: { in: params.subjectIds },
        termId: { in: params.termIds },
        type: GradeAssessmentType.ASSIGNMENT,
      },
      select: {
        id: true,
        classroomId: true,
        subjectId: true,
        termId: true,
        _count: {
          select: {
            submissions: {
              where: { status: GradeSubmissionStatus.SUBMITTED },
            },
          },
        },
      },
    });
  }
}

function activeEnrollmentWhere(
  classroomIds: string[],
): Prisma.EnrollmentWhereInput {
  return {
    classroomId: { in: classroomIds },
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    student: {
      is: {
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
    },
  };
}

function allocationMetricKey(input: {
  classroomId: string;
  subjectId: string;
  termId: string;
}): string {
  return [input.classroomId, input.subjectId, input.termId].join(':');
}

function emptyMetric(): TeacherAppClassMetricRecord {
  return {
    studentsCount: 0,
    activeAssignmentsCount: null,
    pendingReviewCount: null,
    followUpCount: null,
    pendingAttendanceCount: null,
    todayAttendanceStatus: null,
    lastAttendanceStatus: null,
    averageGrade: null,
    completionRate: null,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
