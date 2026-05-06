import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReinforcementTaskStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';

const STUDENT_HOME_IDENTITY_ARGS =
  Prisma.validator<Prisma.StudentDefaultArgs>()({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      userId: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userType: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

const STUDENT_HOME_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      academicYearId: true,
      termId: true,
      classroom: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          section: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              grade: {
                select: {
                  id: true,
                  nameAr: true,
                  nameEn: true,
                  stage: {
                    select: {
                      id: true,
                      nameAr: true,
                      nameEn: true,
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

export type StudentHomeIdentityRecord = Prisma.StudentGetPayload<
  typeof STUDENT_HOME_IDENTITY_ARGS
>;

export type StudentHomeEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof STUDENT_HOME_ENROLLMENT_ARGS
>;

export interface StudentHomeSchoolDisplayRecord {
  name: string | null;
  logoUrl: null;
}

const PENDING_ASSIGNMENT_STATUSES = [
  ReinforcementTaskStatus.NOT_COMPLETED,
  ReinforcementTaskStatus.IN_PROGRESS,
  ReinforcementTaskStatus.UNDER_REVIEW,
];

@Injectable()
export class StudentHomeReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findStudentIdentity(
    context: StudentAppContext,
  ): Promise<StudentHomeIdentityRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: {
        id: context.studentId,
        userId: context.studentUserId,
        status: StudentStatus.ACTIVE,
        user: {
          is: {
            id: context.studentUserId,
            userType: UserType.STUDENT,
            status: UserStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
      ...STUDENT_HOME_IDENTITY_ARGS,
    });
  }

  findCurrentEnrollment(
    context: StudentAppContext,
  ): Promise<StudentHomeEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        id: context.enrollmentId,
        studentId: context.studentId,
        academicYearId: context.academicYearId,
      },
      ...STUDENT_HOME_ENROLLMENT_ARGS,
    });
  }

  async findSchoolDisplay(
    context: StudentAppContext,
  ): Promise<StudentHomeSchoolDisplayRecord> {
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

  async countSubjectsForCurrentClassroom(
    context: StudentAppContext,
  ): Promise<number> {
    if (!context.termId) return 0;

    const subjects = await this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: {
        classroomId: context.classroomId,
        termId: context.termId,
        subject: {
          is: {
            isActive: true,
            deletedAt: null,
          },
        },
      },
      distinct: ['subjectId'],
      select: { subjectId: true },
    });

    return subjects.length;
  }

  countPendingTasksForCurrentStudent(
    context: StudentAppContext,
  ): Promise<number> {
    return this.scopedPrisma.reinforcementAssignment.count({
      where: {
        studentId: context.studentId,
        enrollmentId: context.enrollmentId,
        academicYearId: context.academicYearId,
        ...(context.termId ? { termId: context.termId } : {}),
        status: { in: PENDING_ASSIGNMENT_STATUSES },
        task: {
          is: {
            deletedAt: null,
            status: { not: ReinforcementTaskStatus.CANCELLED },
          },
        },
      },
    });
  }

  async sumTotalXpForCurrentStudent(
    context: StudentAppContext,
  ): Promise<number> {
    const result = await this.scopedPrisma.xpLedger.aggregate({
      where: {
        studentId: context.studentId,
      },
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount ?? 0;
  }
}
